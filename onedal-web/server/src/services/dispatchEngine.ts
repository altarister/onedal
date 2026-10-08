/**
 * ⚖️ **결재 · 경로 다시 재기 · 새 콜 심사 넘기기** — KEEP · 취소 · 강제 정리, 정거장이 바뀌면 카카오로 다시 잰다.
 * 바깥 일을 하는 함수: applyRouteAndSave · applySoloRouteAndSave · forceCancelEvaluatingOrder · promiseOrderOpts · recalcRouteIfStopsChanged · recalculateActiveKakaoRoute · recalculateKakaoRoute · syncDetourFilter · handleDecision · evaluateNewOrder · rebuildDestinationKeywords(세션 · 장부(DB) · 카카오 · 설정 · 지금 시각 · 소켓 · 로그) (장소 이름 · 장부에 적을 정거장 셈 normalizePlaceName · stopPlaceFrom 은 값만 받는다)
 */
import { businessDayKey, normalizeVehicleType, isEvaluating, isTerminal, reservedForOf, type DecisionStatus } from "@onedal/shared";
import { isLaterThan, takeReserved } from "./reservedOrders";
import type { SecuredOrder, PendingOrder, MyOrder, LocationDetailInfo } from "@onedal/shared";
import { calculateSoloRoute } from "./kakaoService";
import { getUserSession } from "../state/userSessionStore";
import { cancelOrderWaits } from "../state/waits";
import { rememberOrder } from "../state/orderMemory";
import { updateActiveFilter, rebuildNetFilter } from "../state/filterManager";
import { goalCityOf } from "../state/filterGoals";
import { getActivePolyline, originOf } from "./geoMotion";
import { composeMergedRoute, planArrivalStops, type PromiseOrderOpts, applyRoute, applySoloRoute, measureSoloDelivery, pickRouteHolder, hasVisitedStop, snapshotRoute, restoreRouteSnapshot, type RouteHolder } from "./routeComposer";
import { firmPromiseMsOf } from "./stepSeeder";
import { DEFAULT_JUDGMENT, routeNeedsRecompute } from "@onedal/shared";
import type { JudgmentConfig } from "@onedal/shared";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { countCancel, countKeep } from "../core/cancelCount";
import { OrderRepository } from "../repositories/OrderRepository";
import { PlaceRepository } from "../repositories/PlaceRepository";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { OrderEvaluator } from "../core/engine/OrderEvaluator";
import { StateMachine } from "../core/engine/StateMachine";
import { getActiveCalls } from "../core/activeCalls";
import { buildOrderSync, setOrderStatus, filterVersionOf } from "../core/helpers";
import { slog } from "../utils/fileLogger";
import { decide } from "../state/decisions";

/* 📍 서버가 다시 떠도 «내가 어디 있었나»를 잃지 않는다 */

/** 🧹 sync 푸시 «로그»는 내용이 바뀔 때만 — 푸시 자체는 늘 나간다 (한 판 1,023줄이 같은 내용이었다) */
export const lastSyncLogSig = new Map<string, string>();

/**
 * 장소명 정규화 (공백 및 주식회사 텍스트 제거)
 * 예: "주식회사 레드 캠프" -> "레드캠프"
 */
export const normalizePlaceName = (name?: string) => {
    if (!name) return "배차값없음";
    return name.replace(/\(주\)|주식회사|\s/g, '').trim();
};

/** 🏷️ 장부에 적을 정거장 한 곳 — 값만 받는 셈 (상세의 첫 줄 · 콜에 적힌 주소 글자 · 좌표) */
export function stopPlaceFrom(detail: LocationDetailInfo | undefined, text: string, x: number | undefined, y: number | undefined):
    { name: string; address: string; region: string; x: number | null; y: number | null; phone: string | null } {
    return {
        name: normalizePlaceName(detail?.customerName || "배차값없음"),
        address: detail?.addressDetail || text,
        region: detail?.region || text.split(' ').slice(0, 2).join(' ') || "배차값없음",
        x: x || null,
        y: y || null,
        phone: detail?.phone1 || null,
    };
}




/**
 * 🗺️ **경로를 홀더에 싣고 «장부에도» 되쓴다 — 둘은 한 벌이다** (밤).
 *
 * 🔴 **여태 메모리에만 실었다.** `applyRoute`·`applySoloRoute` 는 세션의 홀더만 채우고,
 *    장부는 `insertOrder`(콜 확정 때 **한 번**)만 썼다. 경로는 그 뒤에 계산되고 합짐이
 *    붙을 때마다 다시 계산되므로, **나중에 홀더가 된 콜은 값이 영영 장부에 안 들어갔다** —
 *    실측: 사이클마다 **첫 콜만** `routeComputedAt`·`sectionStops` 가 있었다.
 *    그래서 새로고침·재기동하면 예상 시각·상차버퍼가 폴백으로 돌고 지도가 직선으로 물러났다.
 *
 * 🔴 **부르는 자리가 여덟이라 «잊으면 조용히 실패»한다.** 그래서 싣는 일과 적는 일을
 *    한 이름으로 묶는다 — `applyRoute` 를 직접 부르면 장부가 안 따라온다
 *    (`routeSaved.test.ts` 가 그 직접 호출을 막는다).
 * ⚠️ `routeComposer` 는 `db` 를 모르는 채로 지켜 온 자리다 — 저장을 그 안에 넣지 않는다.
 */
export function applyRouteAndSave(holder: Parameters<typeof applyRoute>[0], merged: Parameters<typeof applyRoute>[1]): void {
    applyRoute(holder, merged);
    OrderRepository.saveRouteFields(holder as any);
}

/** 🗺️ 단독 경로도 같은 규칙 — 실은 값은 장부까지 간다 (위 주석) */
export function applySoloRouteAndSave(holder: Parameters<typeof applySoloRoute>[0], r: Parameters<typeof applySoloRoute>[1]): void {
    applySoloRoute(holder, r);
    OrderRepository.saveRouteFields(holder as any);
}

/**
 * 기존 평가 중이던 콜을 외부에서 강제 삭제할 때 호출
 * @param reason 왜 정리하나 — 화면 이탈·새 콜 진입(`FORCE_CANCEL`) · 안전취소 타임아웃(`TIMEOUT`).
 *   🔴 **셈은 여기 한 번이다** — 타임아웃 경로가 이 함수 뒤에 `countCancel` 을 또 불러 보통 콜을 두 번 셌다.
 */
export function forceCancelEvaluatingOrder(userId: string, orderId: string, io: any, reason: 'FORCE_CANCEL' | 'TIMEOUT' = 'FORCE_CANCEL') {
    const session = getUserSession(userId);
    let targetDeviceId: string | undefined;

    /**
     * 🔴 **심사 중인 콜만 정리한다 — KEEP 된 콜은 절대 취소하지 않는다** (규칙 ①).
     *
     * KEEP 뒤에 앱이 리스트로 돌아가면 화면 이탈 감지가 이 함수를 부른다. 이탈 감지가 보는
     * deviceEvaluatingMap 은 받았음(`ackDecision`)까지 남아 있어야 해서 KEEP 뒤에도 살아 있다 —
     * 그러니 상태는 여기서 본다 (안 보면 **확정된 콜을 SAFE_CANCEL 로 덮어쓴다**) (호출자 셋이 전부 거친다).
     * 맵은 지우지 않는다 — 지우면 아직 ACK 못 받은 판결이 배달되지 않는다 (규칙 ②).
     */
    const current = session.pendingOrdersData.get(orderId) ?? session.myOrders.find(o => o.id === orderId);
    if (current && !isEvaluating(current.status)) {
        slog('결재', `🛡️ [강제 정리 차단] ${orderId} 는 심사 중이 아니라 ${current.status} — 건드리지 않는다 (규칙 ①)`);
        return;
    }

    /**
     * 👀 **미리보기 딱지는 지우기 전에 뽑는다**.
     *
     * 아래에서 `pendingOrdersData.delete` 로 캐시를 지운 뒤 `countCancel` 을 부르는데,
     * 그때는 세션에서 콜을 못 찾아 딱지를 볼 수 없다 — 미리보기인데 취소 카운트가 올랐다.
     * **판단에 쓸 값을 지운 다음에 판단하지 않는다.**
     */
    const wasPreview = !!(current as any)?.isPreview;
    const wasSimulated = !!(current as any)?.isSimulated;

    /**
     * ↩️ **취소는 원래 경로로 되돌아가는 것이다** (기사님 확정).
     *
     * 이 콜을 붙이면서 덮인 경로가 있으면 그대로 되살린다 — 카카오를 다시 부르지 않는다.
     * ⚠️ 되살리는 조건(현위치가 그대로인가)은 `restoreRouteSnapshot` 한 곳에만 있다.
     *    움직였으면 되살리지 않고 그냥 둔다 — 다음 경로 연산이 제대로 다시 잰다.
     */
    const snap = session.routeSnapshot;
    if (snap && snap.orderId !== orderId) {
        const holder = session.myOrders.find(o => o.id === snap.orderId);
        if (holder) {
            const ok = restoreRouteSnapshot(holder, snap, originOf(session));
            slog('판정', ok
                ? `↩️ [경로 복원] ${snap.orderId} — 덮이기 전 궤적(${snap.routePolyline?.length ?? 0}점)을 되살렸습니다 (카카오 호출 없음)`
                : `↩️ [경로 복원 안 함] ${snap.orderId} — 현위치가 달라져 다시 재야 합니다`);
        }
    }
    session.routeSnapshot = null;   // 한 번 쓰면 버린다 — 낡은 것이 되살아나지 않게

    if (session.pendingOrdersData.has(orderId)) {
        const cached = session.pendingOrdersData.get(orderId)!;
        targetDeviceId = cached.capturedDeviceId;

        /**
         * 🔴 **강제 정리도 장부에 남긴다**
         *
         * DB 를 안 거치고 지우면 **관제웹에서 "그냥 사라진다."** 취소 경로가 셋(화면 이탈·타임아웃·비상)이라
         * 저장을 결재 경로에만 두면 나머지가 샌다.
         *
         * 안전취소는 배차망 취소 횟수(10회)에 들어간다. 기사님이 몇 번 썼는지
         * 알려면 **한 건도 새면 안 된다**. 캐시 삭제 전에 저장한다.
         */
        /**
         * 👀 **미리보기/가상체험은 장부에 안 쓴다** — 인성·픽커에서 아무 일도 없던 콜이다.
         *    써 두면 관제웹 취소 수(`helpers` 의 SAFE_CANCEL 행 수)가 미리보기만큼 부풀었다. 장부에 들어가는 길이 이 한 줄뿐이라 남는 행도 없다.
         */
        if (!wasPreview && !wasSimulated) try {
            const isShared = getActiveCalls(session).length > 1 ? 1 : 0;
            const isExpress = (cached as any).orderForm === '급송' ? 1 : 0;
            OrderRepository.upsertOrder(cached as any, userId, isShared, isExpress);
            const terminatedAt = OrderRepository.updateOrderStatus(orderId, userId, 'SAFE_CANCEL');
            if (terminatedAt) (cached as any).terminatedAt = terminatedAt;   // 🧹 화면으로 가는 메모리 콜에도 (전수표 #65)
            slog('콜단계', `✅ [상태 동기화] ${orderId} - 강제 정리도 장부에 기록 (상태: SAFE_CANCEL)`);
        } catch (e) {
            console.error("강제 정리 DB 기록 에러:", e);
        }

        session.pendingOrdersData.delete(orderId);
    }
    // [Option B] 결재 큐 및 안전취소 타이머 청소
    if (session.pendingDecisions.has(orderId)) {
        session.pendingDecisions.delete(orderId);
    }
    cancelOrderWaits(session, orderId, '콜 치움');
    Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
        if (v === orderId) session.deviceEvaluatingMap.delete(k);
    });
    if (io) {
        slog('통신', `📤 [Socket 푸시] order-canceled (${orderId}) to ${userId}`);
        io.to(userId).emit("order-canceled", { id: orderId, status: 'SAFE_CANCEL' });
    }

    countCancel(session, targetDeviceId, orderId, reason, wasPreview || wasSimulated, io);

    /**
     * 🔴 콜 잡기 재개(`isActive`)는 **여기서 하지 않는다.**
     *    `filterManager` 의 불변식이 "선점 중인 콜이 0건이면 켠다"로 파생시킨다 —
     *    취소 경로가 셋(화면 이탈·타임아웃·비상)인데 각자 켜면 하나를 빠뜨린다.
     */
    updateActiveFilter(userId, {}, io);
}

/**
 * ⏱️ **경로 순서에 넘길 «굳은 약속» 재료** (기사님 확정: *"전화한 후 한 약속은 지킨다"*).
 *
 * 통화로 닫힌 약속만 넘긴다(`firmPromiseMsOf`). 넘기면 `planMergedStops` 가 남은 정거장 순서를 펴서
 * **약속을 가장 덜 넘기는 순서**를 고르고, 없으면 지금처럼 «지나가는 길목부터»다.
 * 속도·정차는 판정 기준의 값을 그대로 쓴다 — 순서를 고르는 눈금을 따로 만들지 않는다 (규칙 ③).
 */
export function promiseOrderOpts(session: { judgment?: JudgmentConfig }): PromiseOrderOpts {
    const j = session.judgment ?? DEFAULT_JUDGMENT;
    return {
        nowMs: Date.now(),
        promiseAt: (orderId: string, stopType: 'pickup' | 'dropoff') => firmPromiseMsOf(orderId, stopType),
        speedKmh: j.speed?.midKmh,
        dwellMin: (s: 'pickup' | 'dropoff') =>
            s === 'pickup' ? j.unknown.pickupDwellMin : j.unknown.dropoffDwellMin,
    };
}

/**
 * 🗺️ **정거장이 그대로면 카카오를 다시 부르지 않는다** (기사님 확정).
 *
 * 1·2·3·4 로 가는 중에 1 에 도착해도 2·3·4 구간은 받아 둔 값 그대로다. 그래서 도착·상차 완료·
 * 하차 통화·하차 완료·되돌리기에서는 다시 부를 것이 없다 — 지나온 정거장만 빠진다.
 * 다시 부르는 때는 **정거장이 늘거나 · 예정에 없이 빠지거나 · 순서가 바뀔 때**다 (`routeNeedsRecompute`).
 *
 * ⚠️ 받아 둔 분은 부른 그 시각의 길 상태다 — 낡는 것은 재탐색 버튼이 갱신한다.
 */
export async function recalcRouteIfStopsChanged(userId: string, io: any, why: string) {
    const session = getUserSession(userId);
    const calls = getActiveCalls(session);
    const sent = [...calls].reverse().find(c => (c as any).sectionStops?.length)?.sectionStops ?? null;
    /* ⏱️ 남은 정거장도 **약속을 본 순서**로 낸다 — 통화로 미룬 약속이 순서를 바꾸면 여기서 드러난다 */
    const remaining = planArrivalStops(calls as any, originOf(session), promiseOrderOpts(session))
        .map(st => ({ orderId: st.orderId, stopType: st.stopType }));
    if (!routeNeedsRecompute(sent, remaining)) {
        slog('판정', `🗺️ [경로 유지] ${why} — 남은 정거장 ${remaining.length}곳이 그대로라 카카오를 다시 부르지 않습니다`);
        return;
    }
    await recalculateActiveKakaoRoute(userId, io);
}

/** 취소/방출 등 메모리 변동 발생 시, 오더가 남아있다면 카카오 경로를 백그라운드에서 재탐색하여 폴리라인 및 소요시간을 복원합니다. */
export async function recalculateActiveKakaoRoute(userId: string, io: any) {
    const session = getUserSession(userId);

    /**
     * 📍 낡은 현위치는 «지금 위치»가 아니다 — 비우고 «내 주소»로 메운다.
     *    비움 단독은 금지 — 메우는 길이 부트스트랩에만 있어 심사가 origin 없이 돌았다.
     */

    // 완료되지 않은 활성 콜만 추출 (On-the-fly 필터링)
    const activeCalls = getActiveCalls(session);

    if (activeCalls.length === 0) {
        // 마지막 콜을 취소·완료해 첫짐 모드로 돌아왔다. 경유 키워드를 그대로 두면
        // 이미 끝난 경로 주변만 계속 콜 잡기하게 되므로 도시 기준으로 되돌린다.
        rebuildDestinationKeywords(userId, io);
        return;
    }

    const activeMain = activeCalls[0];
    const activeSubs = activeCalls.slice(1);

    /* 🗺️ 키가 없으면 경로 연산만 건너뛴다 — 아래 그물 다시 세우기 · 관제웹 알림은 간다(키를 빈 값으로 넘기는 시험이 실주행과 같은 길을 타게) */
    const apiKey = process.env.KAKAO_REST_API_KEY || "";
    if (!apiKey) slog('판정', `🗺️ [경로 연산 건너뜀] 카카오 키 없음 — 그물 · 관제웹 알림은 그대로`);
    else try {
        const routingOptions = SettingsRepository.getKakaoRoutingOptions(userId);

        if (activeSubs.length === 0) {
            // 단독 오더 라우팅
            // 🔴 이미 상차했으면 상차지를 경유하지 않는다 — 안 그러면 되돌아가는 경로가 나온다.
            //    합짐(composeMergedRoute)도 같은 규칙이다.
            const res = await calculateSoloRoute(
                activeMain.pickupX!, activeMain.pickupY!,
                activeMain.dropoffX!, activeMain.dropoffY!,
                originOf(session),
                routingOptions.defaultPriority,
                routingOptions.carType,
                hasVisitedStop(activeMain, 'pickup'),
            );
            applySoloRouteAndSave(activeMain, res);

            if (res.approachDistance && res.approachDuration) {
                slog('판정', `🗺️ [사후 재계산 - 첫짐] 현위치 접근: ${res.approachDistance}m (${res.approachDuration}초) / 총 이동: ${res.distance}m`);
            }
        } else {
            // 다중 오더 라우팅 (TSP) — 조립 규약은 routeComposer 한 곳에만 있다
            const result = await composeMergedRoute({
                calls: activeCalls,
                origin: originOf(session),
                priority: routingOptions.defaultPriority,
                carType: routingOptions.carType,
                promiseOpts: promiseOrderOpts(session),
            });
            /* 🗺️ 정거장 계획이 없으면(좌표 있는 콜 없음 · 갈 하차지 없음) 경로 적용만 건너뛴다 — 아래 그물 다시 세우기 · 관제웹 알림은 간다 */
            if (!result) slog('경고', `⚠️ [사후 재계산] 합짐 정거장 계획 없음 — 경로 적용만 건너뜀`);
            else {
                applyRouteAndSave(pickRouteHolder(activeCalls, activeMain), result.merged);

                if (result.merged.approachDistance && result.merged.approachDuration) {
                    slog('판정', `🗺️ [사후 재계산 - 합짐] 현위치 접근: ${result.merged.approachDistance}m (${result.merged.approachDuration}초) / 총 이동: ${result.merged.distance}m`);
                }
            }
        }
        slog('판정', `🗺️ [사후 재계산 완료] 취소 반영 후 경로/소요시간 갱신 완료.`);
    } catch (error) {
        slog('경고', `⚠️ [사후 재계산 실패] 경로 연산 중 예외 발생:`, error);
    }

    // [핵심 보강] 갱신된 새 폴리라인을 바탕으로 타겟팅 키워드(경유) 다시 추출!
    syncDetourFilter(userId, io);

    if (io) {
        const payload = Array.from(session.pendingOrdersData.values());
        const sync = buildOrderSync(session);
        const sig = filterVersionOf(sync);
        if (lastSyncLogSig.get(userId) !== sig) {
            lastSyncLogSig.set(userId, sig);
            slog('통신', `📤 [Socket 푸시] sync-active-orders (활성 ${getActiveCalls(session).length}건 · 지문 ${sig})`);
        }
        io.to(userId).emit("sync-active-orders", sync);
    }
}

/** 카카오 경로 재탐색 핸들러 */
export async function recalculateKakaoRoute(userId: string, orderId: string, priority: string, io: any) {
    logRoadmapEvent('판정', "서버", "관제탑으로 부터 경로 재탐색(recalculate-route) 요청 받음");
    const session = getUserSession(userId);
    const securedOrder = session.pendingOrdersData.get(orderId);
    if (!securedOrder) {
        console.warn(`[Recalculate] 메모리에 존재하지 않는 오더입니다. (ID: ${orderId})`);
        return { success: false, msg: "오더 소멸됨" };
    }

    const apiKey = process.env.KAKAO_REST_API_KEY; // 존재 여부 체크용
    if (!apiKey) return { success: false, msg: "API KEY 부재" };

    try {
        let timeExt = "카카오 연산 실패";
        let isDetour = false;
        /** 합짐 병합 궤적을 실제로 기록한 콜 (securedOrder 와 다를 수 있어 별도 emit 필요) */
        let mergedRouteHolder: MyOrder | PendingOrder | null = null;

        // 재탐색 대상 외에 다른 활성 콜이 있으면 합짐(Detour) 연산이다
        const previousOrders = getActiveCalls(session).filter(o => o.id !== orderId);
        if (previousOrders.length > 0) isDetour = true;

        const routingOptions = SettingsRepository.getKakaoRoutingOptions(userId);

        if (!isDetour) {
            const result = await calculateSoloRoute(
                securedOrder.pickupX!, securedOrder.pickupY!,
                securedOrder.dropoffX!, securedOrder.dropoffY!,
                originOf(session),
                priority || routingOptions.defaultPriority,
                routingOptions.carType,
                hasVisitedStop(securedOrder, 'pickup'),
            );

            let paramLabel = "추천";
            if (priority === "TIME") paramLabel = "최단시간";
            if (priority === "DISTANCE") paramLabel = "최단거리";

            // routeComposer 규약으로 기록한다. 손으로 채우면 접근 구간이 버려진다
            applySoloRouteAndSave(securedOrder, result);

            /**
             * 🔴 **두 기억을 함께 갱신한다** (실측 사고).
             *
             * 여기의 securedOrder 는 pendingOrdersData(심사 캐시)의 사본인데, KEEP 된 콜의
             * 진실은 myOrders(활성)다. 사본에만 새 경로를 쓰면 — 지도는 남양주 우회를
             * 그리는데 경유 재계산(syncDetourFilter)은 myOrders 의 **옛(서울 통과) 폴리라인**을
             * 읽어 지역이 안 바뀌고, 앱은 서울 경로 동네로 계속 필터링한다.
             * (setOrderStatus 가 상태를 두 기억에 같이 쓰는 것과 같은 이유 — helpers 규칙)
             */
            const activeTwin = session.myOrders.find(c => c.id === orderId);
            if (activeTwin && (activeTwin as any) !== (securedOrder as any)) {
                applySoloRouteAndSave(activeTwin as any, result);
            }

            // [재탐색 ②] 단독·합짐 모두 결과 수치를 표시한다.
            // 재탐색은 "어느 쪽이 유리한가"를 보려고 누르는 것이므로 결과 수치가 필수다.
            timeExt = `[${paramLabel}] ${securedOrder.kakaoSoloDistanceKm}km, ${securedOrder.kakaoSoloDurationMin}분`
                + (securedOrder.approachDurationMin ? ` (상차지까지 ${securedOrder.approachDurationMin}분)` : '');
        } else {
            const existingActive = getActiveCalls(session);
            const result = await composeMergedRoute({
                calls: existingActive,
                extra: securedOrder,
                origin: originOf(session),
                priority: priority || routingOptions.defaultPriority,
                carType: routingOptions.carType,
                promiseOpts: promiseOrderOpts(session),
            });
            if (!result) return { success: false, msg: "좌표가 있는 활성 콜이 없음" };

            // 병합 궤적은 "마지막 활성 콜"에 싣는다 (routeComposer 규약).
            /* 🔴 제네릭을 명시한다 — 활성 콜은 `MyOrder[]`, 심사 콜은 `PendingOrder` 라 추론에 맡기면 «둘 중 하나»가 안 된다 (`RouteHolder`) */
            const routeHolder = pickRouteHolder<RouteHolder>(existingActive, securedOrder);
            /**
             * ↩️ **덮기 직전 모습을 한 벌 떠 둔다** (기사님 확정).
             *
             * 이 콜이 취소되면 이걸 되돌린다 — 원래 경로는 아무것도 안 바뀌었는데
             * 카카오를 다시 부르던 자리다. 심사 콜이 붙기 전 모습이라야 하므로
             * `applyRoute` **바로 앞**에서 뜬다.
             */
            if ((routeHolder as any).id && routeHolder !== (securedOrder as any)) {
                session.routeSnapshot = snapshotRoute(routeHolder as any, originOf(session));
            }
            applyRouteAndSave(routeHolder, result.merged);
            mergedRouteHolder = routeHolder;

            let signDist = Number(result.distDiffKm) > 0 ? "+" : "";
            let signTime = Number(result.timeDiffMin) > 0 ? "+" : "";

            /**
             * 🎨 **색은 심사 1회 고정이다 — 재탐색은 색을 다시 정하지 않는다**
             * (판정색 확정안 v2 ③·④ · 기사님 확정).
             *
             * 여기서 scoreMerge 를 다시 부르면 **재탐색만 해도 색이 바뀔 수** 있다.
             * "파란색이면 믿고 누른다" — 누른 뒤 색이 바뀌면 그 신뢰가 무너진다.
             * 심사 순간의 스냅샷(order_judgments)을 읽어 그대로 쓴다.
             */
            const stored = OrderRepository.getJudgment(securedOrder.id);
            const recommend = stored?.color === '꿀' ? "🍯 (꿀)"
                            : stored?.color === '보통' ? "🚙 (양호)"
                            : stored?.color === '똥' ? "💩"
                            : stored?.color === '사고' ? "🚨 (사고)" : "";
            if (stored) slog('판정', `   - 🎨 [재탐색] 색은 심사 스냅샷 고정 — ${stored.color} ${stored.score}점`);

            let paramLabel = "추천";
            if (priority === "TIME") paramLabel = "최단시간";
            if (priority === "DISTANCE") paramLabel = "최단거리";

            timeExt = `[${paramLabel}] ${signDist}${result.distDiffKm}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
        }

        logRoadmapEvent('판정', "서버", "재탐색 결과로 폴리라인 및 소요시간 갱신 연산");
        securedOrder.kakaoTimeExt = timeExt;
        const twin = session.myOrders.find(c => c.id === securedOrder.id);
        if (twin && (twin as any) !== (securedOrder as any)) twin.kakaoTimeExt = timeExt;   // 주기 sync 가 옛 문구로 되돌리지 않게

        /* 🛣️ 첫 콜만 쥔 동안(합짐 전)은 경로를 바꾸면 필터 라인도 따라간다 (기사님) */
        if (!isDetour && getActiveCalls(session).length === 1) session.filterLine = getActivePolyline(session);
        if (getActiveCalls(session).some(c => c.id === securedOrder.id)) {
            syncDetourFilter(userId, io);
        }

        logRoadmapEvent('판정', "서버", "관제탑에게 재산출된 노선(order-evaluated) 정보 전달");
        io.to(userId).emit("order-evaluated", securedOrder);
        // 병합 궤적을 다른 콜에 실었다면 그쪽도 즉시 알려야 지도가 1초(sync 주기)를 기다리지 않는다
        if (mergedRouteHolder && mergedRouteHolder.id !== securedOrder.id) {
            io.to(userId).emit("order-evaluated", mergedRouteHolder);
        }
    } catch (e: any) {
        console.error("재계산 에러:", e);
        if (e.message) {
            securedOrder.kakaoTimeExt = `[재계산 실패] ${e.message}`;
            io.to(userId).emit("order-evaluated", securedOrder);
        }
        return { success: false, msg: e.message };
    }
    return { success: true };
}

/**
 * `recalculateDetourFilter` 는 **`state/filterManager` 에 있다**.
 *
 * 경유를 다시 그려야 하는 자리가 셋이다 — 관제탑 필터 저장 · **국면별 설정 저장** · **국면 전환**.
 * 뒤의 둘은 `filterManager` 안이라 여기(dispatchEngine)를 부르면 순환 참조가 된다 — 그래서 경계가 낮은 쪽에 둔다.
 * 경유 계산은 한 벌만 둔다. 두 벌째를 만들지 않는다.
 */
export { recalculateDetourFilter } from "../state/filterManager";

export const syncDetourFilter = (userId: string, io: any) => {
    /**
     * 🕸️ **목록은 그물 한 곳(`rebuildNetFilter`)이 만든다** (전수표 1단계).
     *    여기서 경로 버퍼(turf)로 따로 조립하면 KEEP·경로 재계산 때
     *    앱이 받는 목록이 노선/동선도 마름모도 모르는 목록이 된다.
     */
    rebuildNetFilter(userId, io);
};

/** 관제사 최종 판정 처리 */
export async function handleDecision(userId: string, orderId: string, status: DecisionStatus, io: any) {
    const session = getUserSession(userId);

    /**
     * 결재가 났으면 이 콜에 걸린 **감시 타이머는 할 일이 끝났다.**
     * 남겨 두면 30~35초 뒤에 깨어나 이미 처리된 콜을 다시 건드린다 (좀비 타이머).
     * ⚠️ `pendingDecisions` 는 여기서 지우지 않는다 — 앱이 ACK 할 때까지 판결을 들고 있어야 한다.
     */
    cancelOrderWaits(session, orderId, '결재');

    const cachedPending = session.pendingOrdersData.get(orderId);
    const targetDeviceId = cachedPending?.capturedDeviceId
        ?? session.myOrders.find(c => c.id === orderId)?.capturedDeviceId;
    /* 🐥 체험인지는 잡을 때 콜에 적힌 값 하나 — 결재 순간의 폰 모드로 다시 가르지 않는다(심사 중 모드를 바꾸면 진짜 계약 콜이 장부에서 빠졌다) */
    const isSimulatedMode = (cachedPending as any)?.isSimulated === true;

    const isKeep = status === 'ORDER_CONFIRMED';
    /* 🚪 끝난 콜(안전취소 · 방출)에는 KEEP 을 싣지 않는다 — 앱은 이미 취소했는데 서버만 «잡음»이 되면 유령 콜이 적재·경유를 좁힌다 */
    if (isKeep && cachedPending && isTerminal(cachedPending.status)) {
        slog('결재', `🚪 [KEEP 막음] ${orderId} 는 ${cachedPending.status} 로 끝난 콜이다 — 앱에 KEEP 을 싣지 않는다`);
        return { success: false, action: status };
    }
    const piggybackAction = isKeep ? (isSimulatedMode ? 'SIMULATED_KEEP' : 'KEEP') : 'CANCEL';
    /* 🧾 KEEP 은 심사 캐시에 콜이 있을 때만 폰에 보낸다 — 없으면 폰은 KEEP 을 받는데 서버는 승격을 못 해 둘이 갈라진다(안전쪽 순서) */
    if (isKeep && !session.pendingOrdersData.has(orderId)) {
        slog('경고', `⚠️ [결재] KEEP ${orderId} — 심사 캐시에 없다 · 폰에 보내지 않는다`);
        return { success: false, action: status };
    }

    // 결재 기록 — decide 가 큐에 적고 그 순간 관제앱 공급 소켓으로 보낸다(블루투스로 폰에).
    // 공급 소켓이 안 붙었으면 큐에 남았다가 붙을 때 보낸다(state/decisions)
    if (session.pendingDecisions.has(orderId)) {
        decide(io, session, userId, orderId, piggybackAction);   // ⚖️ 결재 정하기 한 곳 — 공급 소켓에도 그 순간 (state/decisions)
        if (isKeep) logRoadmapEvent('결재', "서버", `앱폰에게 Action=${piggybackAction} 최종 판결을 관제앱 공급 소켓으로`);
        else logRoadmapEvent('결재', "서버", "앱폰에게 Action=Cancel 최종 판결을 관제앱 공급 소켓으로");
        slog('결재', `📦 [결재] 관제탑 판결(${piggybackAction})을 큐에 기록 — 관제앱 공급 소켓 → 블루투스로 폰에 (받았음이 올 때까지 들고 있다 · orderId: ${orderId})`);
    } else {
        // pendingDecisions에 없는 경우 (이미 타임아웃으로 삭제되었거나, MANUAL 건)
        if (isKeep) logRoadmapEvent('결재', "서버", `결재 큐에 없음 — 앱폰에 Action=${piggybackAction} 을 보내지 않음`);
        else logRoadmapEvent('결재', "서버", "결재 큐에 없음 — 앱폰에 Action=Cancel 을 보내지 않음");
        slog('경고', `⚠️ [결재] pendingDecisions 에 ${orderId} 가 없다 — 폰에 보내지 않는다 (직접 건이거나 이미 시한 정리됨)`);
    }

    // deviceEvaluatingMap 은 여기서 지우지 않는다 — 폰이 결재를 실행해 받았음이 오면 ackDecision(state/decisions)이 푼다

    if (isKeep) {
        logRoadmapEvent('결재', "서버", `관제탑으로 부터 Keep 결재 요청 받음${isSimulatedMode ? ' [가상 체험 모드]' : ''}`);
        const cachedOrder = session.pendingOrdersData.get(orderId);

        if (!cachedOrder) return { success: false, action: status };

        /**
         * ✅ **수락을 센다** (가상 체험 콜은 실제 수락 카운트에 산입하지 않음).
         */
        if (!isSimulatedMode && !(cachedOrder as any).isSimulated) {
            countKeep(session, targetDeviceId, orderId, !!(cachedOrder as any).isPreview);
        }

        // [V2 핵심] PendingOrder → MyOrder 승격 (심사 완료 → 내 퀵 확정)
        const confirmedOrder: MyOrder = {
            ...cachedOrder,
            status: 'ORDER_CONFIRMED',
            isSimulated: isSimulatedMode || !!(cachedOrder as any).isSimulated,
        };
        // phase 및 isPreview는 심사(PendingOrder) 전용이므로 확정 시 완전 제거
        delete (confirmedOrder as any).phase;
        delete (confirmedOrder as any).isPreview;

        // ⭐ 핵심 수정: 승격된 객체를 하트비트 메모리맵에 덮어씌워서 롤백 현상 방지
        rememberOrder(session, confirmedOrder as any);
        /**
         * 💾 **장부에 적는다** (status: confirmed · places/orderStops · v5 스키마) — 진행 중 KEEP 과 예약 보관 KEEP 이 함께 쓴다.
         * `isShared` 는 부르는 쪽이 정한다 — 예약 콜은 오늘 실린 짐과 합짐이 아니다.
         */
        /**
         * 🚚 **이 콜의 단독 배송(상차지 → 하차지)을 재어 승격본 · 캐시본 둘 다에 적는다** — 오늘 KEEP 과 예약 보관 KEEP 이 함께 쓴다.
         *    하차 약속(상차 약속 + 배송 × 150%)의 재료다. 오늘 경로·적재와 무관한 **이 콜 자체**의 값이다.
         */
        const measureSoloInto = async (routingOptions: ReturnType<typeof SettingsRepository.getKakaoRoutingOptions>) => {
            const solo = await measureSoloDelivery(confirmedOrder as any, {
                priority: routingOptions.defaultPriority,
                carType: routingOptions.carType,
            });
            if (solo) {
                for (const o of [confirmedOrder, cachedOrder] as any[]) {
                    o.kakaoSoloDistanceKm = solo.km;
                    o.distanceKm = solo.km;   // 📏 거리 칸 = 카카오 배송 거리
                    o.kakaoSoloDurationMin = solo.minutes;
                }
            }
        };

        const saveConfirmedToLedger = (isShared: 0 | 1) => {
            try {
                // [이슈 R] isShared는 "필터가 합짐 모드였는가"가 아니라
                // "이 콜을 잡을 때 이미 실린 짐이 있었는가"로 판정한다.
                //
                // session.activeFilter.isSharedMode 를 쓰지 않는다 — 필터 상태는 서버 재시작 등으로
                // 실제와 어긋날 수 있어(이슈 W) 명백한 합짐 콜이 isShared=0 으로 기록된다.
                //
                // 이 시점에는 confirmedOrder가 이미 myOrders에 push된 뒤이므로,
                // 활성 콜이 2건 이상이면 앞선 짐이 있었다는 뜻 = 합짐이다.
                // isExpress: 파서가 추출한 orderForm이 "급송"이면 true
                const isExpress = (cachedOrder.orderForm === '급송') ? 1 : 0;

                if (!confirmedOrder.isSimulated) {
                    // 1. orders 등록 (v5 전체 컬럼)
                    OrderRepository.upsertOrder(cachedOrder, userId, isShared, isExpress);

                    // 2. places UPSERT 및 orderStops 추가 (상차지)
                    const p = stopPlaceFrom(cachedOrder.pickupDetails?.[0], cachedOrder.pickup, cachedOrder.pickupX, cachedOrder.pickupY);
                    const pPlaceId = PlaceRepository.upsertPlace(userId, p.address, p.name, p.region, p.x, p.y, p.phone);
                    if (pPlaceId) {
                        OrderRepository.insertOrderStop(cachedOrder.id, pPlaceId, 'pickup', p.name, p.phone);
                    }

                    // 3. places UPSERT 및 orderStops 추가 (하차지)
                    const d = stopPlaceFrom(cachedOrder.dropoffDetails?.[0], cachedOrder.dropoff, cachedOrder.dropoffX, cachedOrder.dropoffY);
                    const dPlaceId = PlaceRepository.upsertPlace(userId, d.address, d.name, d.region, d.x, d.y, d.phone);
                    if (dPlaceId) {
                        OrderRepository.insertOrderStop(cachedOrder.id, dPlaceId, 'dropoff', d.name, d.phone);
                    }

                    slog('결재', `💾 [DB 저장 완료] ${cachedOrder.id} - confirmed (v5 장소/경유지 기록 완료)`);
                } else {
                    slog('결재', `🐥 [가상 체험 콜] ${cachedOrder.id} - DB 저장 건너뜀 (메모리 세션에서만 합짐 시뮬레이션 가동)`);
                }
            } catch (dbErr) {
                console.error("DB 저장 에러:", dbErr);
            }
        };

        /**
         * 📅 **내일 이후 콜은 예약 보관으로** — 오늘 하루(진행 중 콜 · 경로 · 적재 · 국면 · 경유)를 안 건드린다.
         *    이 콜 하나의 사실(보관 날이 오늘 뒤)로 가른다. 장부에는 적고(재시작에도 되살린다), 관제웹에는 알린다.
         *    단계 행(상차지 통화)은 KEEP 받은 쪽(`socketHandlers` 결재)이 여느 콜처럼 낳는다 — 약속은 예약 날·시각이다.
         */
        const reservedFor = reservedForOf(confirmedOrder);
        if (isLaterThan(reservedFor, businessDayKey(Date.now()))) {
            confirmedOrder.reservedFor = reservedFor!;
            (cachedOrder as any).reservedFor = reservedFor;
            if (!session.reservedOrders.some(c => c.id === orderId)) session.reservedOrders.push(confirmedOrder);
            /* 🚚 오늘 하루는 안 건드려도 이 콜의 단독 배송은 잰다 — 없으면 하차 약속이 비거나 추정으로 선다 (장부에 적기 전에) */
            try {
                if (process.env.KAKAO_REST_API_KEY) await measureSoloInto(SettingsRepository.getKakaoRoutingOptions(userId));
            } catch (e) {
                console.error('🚚 [예약 콜 단독 배송 재기 실패]', e);
            }
            saveConfirmedToLedger(0);
            slog('결재', `📅 [예약 보관] ${orderId.slice(0, 8)} → ${reservedFor} ${(cachedOrder as any).reservedAt ?? ''} — 오늘 하루에 안 넣는다`);
            io.to(userId).emit("order-confirmed", orderId);
            return { success: true, action: status };
        }


        const isAlreadyIncluded = session.myOrders.some(c => c.id === orderId);

        if (!isAlreadyIncluded) {
                /**
             * 🎯 **목표값 — 이 콜을 잡던 순간의 필터값** (기사님 확정).
             *
             * 🔴 **하차지 좌표로 «어느 목적지 쪽인가»를 가르지 않는다.** 기사님이 그 필터값으로 콜을 보고 잡으신 것이니
             *    답이 이미 적혀 있다. 좌표로 가르면 마름모 자락에 걸친 콜이 엉뚱한 목적지로 찍혀
             *    목적지가 잘못 합쳐진다. 목적지는 «필터값 ∪ 진행 중인 마지막 확정 콜의 목표값»이다 (shared `goalZonesOf`).
             * 🔴 넣기 **전에** 적는다 — 승격본·캐시본 둘 다 (화면·장부가 갈리지 않게)
             */
            confirmedOrder.goalCity = goalCityOf(session, userId) || undefined;
            (cachedOrder as any).goalCity = confirmedOrder.goalCity;
            if (confirmedOrder.goalCity) slog('결재', `🎯 [목표] ${orderId.slice(0, 8)} → ${confirmedOrder.goalCity}`);
            session.myOrders.push(confirmedOrder);
            
            try {
                const hasApiKey = !!process.env.KAKAO_REST_API_KEY;
                if (hasApiKey) {
                    const activeCalls = getActiveCalls(session);
                    if (activeCalls.length > 0) {
                        const activeMain = activeCalls[0];
                        const activeSubs = activeCalls.slice(1);
                        
                        const routingOptions = SettingsRepository.getKakaoRoutingOptions(userId);

                        if (activeSubs.length > 0) {
                            const calcResult = await composeMergedRoute({
                                calls: activeCalls,
                                origin: originOf(session),
                                priority: routingOptions.defaultPriority,
                                carType: routingOptions.carType,
                                promiseOpts: promiseOrderOpts(session),
                            });
                            if (calcResult) {
                                applyRouteAndSave(pickRouteHolder(activeCalls, activeMain), calcResult.merged);
                            }
                        }

                        /**
                         * 🚚 **A단계 — 방금 잡은 콜의 «상차지 → 하차지»를 한 번 잰다** (기사님 확정 0901).
                         *
                         * 하차 마감이 `상차 완료 + 단독 배송주행 × 150%` 인데, 합짐은 병합 경로만
                         * 재느라 그 주행을 **구조적으로 가질 수 없었다** — 그래서 합짐마다
                         * «배송주행 추정(일반값)» 딱지가 붙고 마감이 거리 환산 위에 섰다.
                         *
                         * ⚠️ **판결은 이미 큐에 실렸다**(위쪽 decide). 그러니 이 기다림이
                         *    기사님 폰의 KEEP 을 늦추지 않는다 — 바로 위 병합 연산과 같은 자리다.
                         *
                         * 🔴 승격본(`confirmedOrder`·myOrders)과 캐시본(`cachedOrder`·아래 DB 기록)이
                         *    **다른 객체**라 둘 다 적는다. 한쪽만 적으면 화면과 장부가 갈린다.
                         */
                        await measureSoloInto(routingOptions);
                    }
                }
            } catch (e) {
                console.error('🗺️ [사후 병합 궤적 생성 실패]', e);
            }
        }

        // ✅ 콜 배정이 끝난 뒤 경유 재계산 (경로 기반 키워드 갱신)
        if (cachedOrder && cachedOrder.routePolyline) {
            /* 🛣️ 필터 라인을 이 순간의 경로로 얼린다 — 하차·취소·재탐색으로 안 바뀐다 (기사님 · 전수표 #18) */
            session.filterLine = getActivePolyline(session);
            syncDetourFilter(userId, io);
            slog('필터', `🗺️ [경유 갱신] KEEP 후 destinationKeywords ${session.activeFilter.destinationKeywords.length}개로 재계산 완료`);
        }
        /**
         * ↩️ **KEEP 했으면 되돌릴 일이 없다** — 보관본을 버린다.
         * 남겨 두면 다음 취소 때 **엉뚱한 콜의 낡은 경로**가 되살아난다.
         */
        if (session.routeSnapshot) {
            session.routeSnapshot = null;
        }

        // DB에 영구 저장 (status: confirmed) 및 places/orderStops 기록 (v5 스키마)
        saveConfirmedToLedger(getActiveCalls(session).length > 1 ? 1 : 0);

        logRoadmapEvent('결재', "서버", "관제탑에게 확정되었음(order-confirmed) 정보 전달");
        io.to(userId).emit("order-confirmed", orderId);


        // ━━━ 3단계 State Machine 적용 ━━━
        /**
         * 🚚 **남은 자리는 필터 매니저 한 곳이 «함께 실리는 최대»로 구한다** — 전이는 차종을 싣지 않으므로
         *    `updateActiveFilter` 안의 셈이 방금 잡은 콜과 위에서 방금 잰 병합 경로의 정거장 순서(`sectionStops`)로 돈다.
         *    잡은 콜을 다 더해 세면 KEEP 은 예약인데 3~4콜에서 «만재»로 막힌다.
         */
        const myVehicle = SettingsRepository.getKakaoRoutingOptions(userId).vehicleType || '1t';
        const loadedVehicles = getActiveCalls(session).map(c => c.vehicleType || myVehicle);

        // [자체 리뷰 C] 차종을 인식하지 못하면 보수적으로 "내 차를 가득 채운 것"으로 계산한다.
        // 안전한 방향이지만 그만큼 합짐 콜 잡기 범위가 좁아지므로, 조용히 넘어가면 안 된다.
        // 파싱 실패율이 높다면 파서를 고쳐야 하므로 눈에 띄게 남긴다.
        const unknownVehicles = loadedVehicles.filter(v => !normalizeVehicleType(v));
        if (unknownVehicles.length > 0) {
            console.warn(`⚠️ [적재 용량] 차종 인식 실패 ${unknownVehicles.length}건 [${unknownVehicles.join(', ')}] → 만재로 간주(보수적). 합짐 범위가 실제보다 좁아집니다.`);
        }

        // 경유 한 벌은 위의 syncDetourFilter 가 이미 넣었다 — 전이는 국면과 합짐 표시만 (#81)
        const transition = StateMachine.advanceOnKeep(session);
        if (transition.changed && transition.newFilter) {
            updateActiveFilter(userId, transition.newFilter, io);
            slog('필터', `🚚 [적재 용량] 내 차: ${myVehicle} | 잡은 콜: [${loadedVehicles.join(', ')}] → 추가 가능 차종: [${(session.activeFilter.allowedVehicleTypes ?? []).join(', ')}]`);
            slog('콜단계', `🔄 [State Machine] ${transition.reason}`);
        }
        logRoadmapEvent('필터', "서버", "새로 부여된 합짐 필터(isSharedMode)값 메모리 세션 갱신");
        logRoadmapEvent('필터', "서버", "앱폰 및 관제탑에게 새로운 타겟팅 필터(filter-updated) 정보 전달");
    } else {
        logRoadmapEvent('결재', "서버", `관제탑으로 부터 수동 취소/방출(${status}) 요청 받음`);
        
        /**
         * 📅 **버리는 문** — 예약 보관의 콜이면 보관에서 꺼낸다. 안 꺼내면 버린 콜이
         *    다음 영업일에 진행 중 첫짐으로 올라온다. 꺼낸 콜은 장부 갱신에 쓴다(메모리 두 곳엔 없을 수 있다).
         */
        const takenReserved = takeReserved(session, orderId);

        // 메모리에서 완전히 지우지 않고 상태값만 갱신하여 프론트엔드 취소/방출 탭에 보존
        // (두 메모리를 함께 갱신 — 여기는 원래 둘 다 쓰고 있었지만 규약으로 통일한다)
        setOrderStatus(session, orderId, status);

        const cachedForLedger = session.myOrders.find(c => c.id === orderId)
            ?? session.pendingOrdersData.get(orderId) ?? takenReserved;
        const isSimulatedOrder = (cachedForLedger as any)?.isSimulated;

        if (cachedForLedger && !isSimulatedOrder) {
            try {
                const isShared = getActiveCalls(session).length > 1 ? 1 : 0;
                const isExpress = (cachedForLedger as any).orderForm === '급송' ? 1 : 0;
                OrderRepository.upsertOrder(cachedForLedger as any, userId, isShared, isExpress);
                const terminatedAt = OrderRepository.updateOrderStatus(orderId, userId, status);
                if (terminatedAt) (cachedForLedger as any).terminatedAt = terminatedAt;   // 🧹 화면으로 가는 메모리 콜에도 (전수표 #65)
                slog('콜단계', `✅ [상태 동기화] ${orderId} - DB 업데이트 완료 (상태: ${status})`);
            } catch (e) {
                console.error("DB 업데이트 에러:", e);
            }
        }

        if (!isSimulatedOrder) {
            countCancel(session, targetDeviceId, orderId, 'DECISION_CANCEL', undefined, io);
        } else {
            slog('콜단계', `🐥 [가상 체험 콜 종료] ${orderId} - 패널티 카운트 없이 안전하게 세션 정리 완료`);
        }

        if (io) {
            logRoadmapEvent('콜단계', "서버", "관제탑에게 콜이 삭제되었음(order-canceled) 정보 전달");
            io.to(userId).emit("order-canceled", { id: orderId, status, isManual: true });
        }

        const activeCalls = getActiveCalls(session);
        const transition = StateMachine.rollbackOnCancel(session, activeCalls.length);
        
        if (transition.changed && transition.newFilter) {
            if (io) {
                updateActiveFilter(userId, transition.newFilter, io);
                logRoadmapEvent('콜단계', "서버", transition.reason || "상태 변경");
                logRoadmapEvent('필터', "서버", "앱폰 및 관제탑에게 탐색 재개(filter-updated) 정보 전달");
            }
            slog('콜단계', `🔄 [State Machine] ${transition.reason}`);
        }

        await recalcRouteIfStopsChanged(userId, io, '콜 정리');
    }

    /**
     * ⚠️ 여기서는 아무것도 지우지 않는다. KEEP 은 오히려 승격본을 캐시에 **덮어써 남긴다**(위 `set` — 롤백 방지).
     * 로그는 하는 일만 말한다 — «삭제»라고 쓰면 좀비 잠금 진단이 늦어진다.
     */
    slog('결재', `🛡️ [서버] 결재 처리 완료 (${orderId} · ${status}) — 심사 캐시는 KEEP 승격본으로 유지된다`);
    return { success: true, action: status };
}

/** [필수#1] 최초 오더 평가: 지오코딩 + 카카오 경로 연산 + 꿀/콜/똥 판정 (detail.ts에서 추출) */
export async function evaluateNewOrder(userId: string, securedOrder: SecuredOrder | PendingOrder, io: any, targetApp: string = 'insung') {
    const evaluator = new OrderEvaluator(targetApp);
    await evaluator.evaluate(userId, securedOrder, io);
}

/**
 * **`destinationKeywords` 를 만드는 유일한 함수.**
 *
 * 여러 곳(세션 생성 · 부트스트랩 · syncDetourFilter · 필터 변경)이 각자 만들면
 * "지금 어느 지역을 콜 잡는 중인가"의 답이 호출 순서에 따라 달라진다. 그래서 갈래는 여기 하나뿐이다.
 *
 *   활성 콜 있음 → 주행 경로 주변 경유 (syncDetourFilter)
 *   활성 콜 없음 → 기사님이 설정한 destinationCity + 반경
 *
 * 특히 **마지막 콜을 취소해 활성 0건이 됐을 때**가 중요하다 — 여기서 첫짐 값으로 되돌리지 않으면
 * 경유 키워드가 그대로 남아, 첫짐으로 돌아왔는데도 지나간 경로 주변만 콜을 잡는다.
 */
export function rebuildDestinationKeywords(userId: string, io: any): void {
    /* 🕸️ 부팅·콜 0건도 그물 한 곳(`rebuildNetFilter`)이 목록을 만든다 */
    rebuildNetFilter(userId, io);
}
