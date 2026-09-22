import { restoreWhere, decideTargetAfterDelivery, mapVehicleToKakaoCarType, getRemainingCapacityTypes, deriveDispatchPhase, normalizeVehicleType,
         MILESTONE_TO_STATUS, MILESTONE_LABEL, canReportMilestone, timingError,
         RESTORABLE_STATUSES, IN_PROGRESS_STATUSES, UNFINISHED_RESTORE_DAYS, deriveStatusFromMilestones,
         restoreWindow, getEffectiveDetourRadius, DEFAULT_DETOUR_RADIUS_KM,
         CALL_TARGET_LABEL, isEvaluating } from "@onedal/shared";
import type { SecuredOrder, AutoDispatchFilter, PricingConfig, PendingOrder, MyOrder,
              Milestone, MilestoneSource, CallTarget } from "@onedal/shared";
import { geocodeAddress, calculateSoloRoute, calculateDetourRoute, compareDirections } from "./kakaoService";
import { fetchRealWorldRoute } from "../routes/osrmUtil";
import { getUserSession, clearOrderTimers } from "../state/userSessionStore";
import { rememberOrder } from "../state/orderMemory";
import { updateActiveFilter, rebuildNetFilter, goalCityOf, homeCityOf, homeCallsOf } from "../state/filterManager";
import { recordCallTarget } from "../core/callTargetEvents";
import { getActivePolyline, reverseGeocodeToRegion, haversineKm, originOf, lastKnownPositionOf } from "../services/geoService";
import { composeMergedRoute, applyRoute, applySoloRoute, measureSoloDelivery, pickRouteHolder, toKm, toMin, hasVisitedStop, snapshotRoute, restoreRouteSnapshot, parsePolyline, type RouteHolder } from "./routeComposer";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../config/dispatchConfig";
import db from "../db";
import { countCancel, countKeep } from "../core/cancelCount";
import { OrderRepository } from "../repositories/OrderRepository";
/* 📍 서버가 다시 떠도 «내가 어디 있었나»를 잃지 않는다 */
import { lastTrackPointOf } from "./gpsTrackStore";
import { PlaceRepository } from "../repositories/PlaceRepository";
import { getDeviceMode } from "../routes/devices";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { PricingEngine } from "../core/engine/PricingEngine";
import { OrderEvaluator } from "../core/engine/OrderEvaluator";
import { StateMachine } from "../core/engine/StateMachine";
import { getActiveCalls, buildOrderSync, setOrderStatus } from "../core/helpers";
import { stepRecordsOf, stepsView, bridgeUndoMilestone, milestoneAlreadyRecorded } from "./stepSeeder";

/**
 * 장소명 정규화 (공백 및 주식회사 텍스트 제거)
 * 예: "주식회사 레드 캠프" -> "레드캠프"
 */
export const normalizePlaceName = (name?: string) => {
    if (!name) return "배차값없음";
    return name.replace(/\(주\)|주식회사|\s/g, '').trim();
};




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
function applyRouteAndSave(holder: Parameters<typeof applyRoute>[0], merged: Parameters<typeof applyRoute>[1]): void {
    applyRoute(holder, merged);
    OrderRepository.saveRouteFields(holder as any);
}

/** 🗺️ 단독 경로도 같은 규칙 — 실은 값은 장부까지 간다 (위 주석) */
function applySoloRouteAndSave(holder: Parameters<typeof applySoloRoute>[0], r: Parameters<typeof applySoloRoute>[1]): void {
    applySoloRoute(holder, r);
    OrderRepository.saveRouteFields(holder as any);
}

/** 기존 평가 중이던 콜을 외부에서 강제 삭제할 때 호출 */
/**
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
     * deviceEvaluatingMap 은 피기백 ACK 까지 남아 있어야 해서 KEEP 뒤에도 살아 있다 —
     * 그러니 상태는 여기서 본다 (안 보면 **확정된 콜을 SAFE_CANCEL 로 덮어쓴다**) (호출자 셋이 전부 거친다).
     * 맵은 지우지 않는다 — 지우면 아직 ACK 못 받은 판결이 배달되지 않는다 (규칙 ②).
     */
    const current = session.pendingOrdersData.get(orderId) ?? session.myOrders.find(o => o.id === orderId);
    if (current && !isEvaluating(current.status)) {
        console.log(`🛡️ [강제 정리 차단] ${orderId} 는 심사 중이 아니라 ${current.status} — 건드리지 않는다 (규칙 ①)`);
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
            console.log(ok
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
            console.log(`✅ [상태 동기화] ${orderId} - 강제 정리도 장부에 기록 (상태: SAFE_CANCEL)`);
        } catch (e) {
            console.error("강제 정리 DB 기록 에러:", e);
        }

        session.pendingOrdersData.delete(orderId);
    }
    // [Option B] 결재 큐 및 안전취소 타이머 청소
    if (session.pendingDecisions.has(orderId)) {
        session.pendingDecisions.delete(orderId);
    }
    clearOrderTimers(session, orderId);
    Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
        if (v === orderId) session.deviceEvaluatingMap.delete(k);
    });
    if (io) {
        console.log(`📤 [Socket 푸시] order-canceled (${orderId}) to ${userId}`);
        io.to(userId).emit("order-canceled", { id: orderId, status: 'SAFE_CANCEL' });
    }

    countCancel(session, targetDeviceId, orderId, reason, wasPreview, io);

    /**
     * 🔴 콜 잡기 재개(`isActive`)는 **여기서 하지 않는다.**
     *    `filterManager` 의 불변식이 "선점 중인 콜이 0건이면 켠다"로 파생시킨다 —
     *    취소 경로가 셋(화면 이탈·타임아웃·비상)인데 각자 켜면 하나를 빠뜨린다.
     */
    updateActiveFilter(userId, {}, io);
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

    try {
        const apiKey = process.env.KAKAO_REST_API_KEY || "";
        if (!apiKey) return;

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
                console.log(`🗺️ [사후 재계산 - 첫짐] 현위치 접근: ${res.approachDistance}m (${res.approachDuration}초) / 총 이동: ${res.distance}m`);
            }
        } else {
            // 다중 오더 라우팅 (TSP) — 조립 규약은 routeComposer 한 곳에만 있다
            const result = await composeMergedRoute({
                calls: activeCalls,
                origin: originOf(session),
                priority: routingOptions.defaultPriority,
                carType: routingOptions.carType,
            });
            if (!result) return;

            applyRouteAndSave(pickRouteHolder(activeCalls, activeMain), result.merged);

            if (result.merged.approachDistance && result.merged.approachDuration) {
                console.log(`🗺️ [사후 재계산 - 합짐] 현위치 접근: ${result.merged.approachDistance}m (${result.merged.approachDuration}초) / 총 이동: ${result.merged.distance}m`);
            }
        }
        console.log(`🗺️ [사후 재계산 완료] 취소 반영 후 경로/소요시간 갱신 완료.`);
    } catch (error) {
        console.log(`⚠️ [사후 재계산 실패] 경로 연산 중 예외 발생:`, error);
    }

    // [핵심 보강] 갱신된 새 폴리라인을 바탕으로 타겟팅 키워드(경유) 다시 추출!
    syncDetourFilter(userId, io);

    if (io) {
        const payload = Array.from(session.pendingOrdersData.values());
        console.log(`📤 [Socket 푸시] sync-active-orders (활성 ${getActiveCalls(session).length}건)`);
        io.to(userId).emit("sync-active-orders", buildOrderSync(session));
    }
}

/** 카카오 경로 재탐색 핸들러 */
export async function recalculateKakaoRoute(userId: string, orderId: string, priority: string, io: any) {
    logRoadmapEvent("서버", "관제탑으로 부터 경로 재탐색(recalculate-route) 요청 받음");
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

            // routeComposer 규약으로 기록한다. 손으로 채우면 접근 구간이 또 버려진다
            // (이 파일에만 같은 기록 로직이 여섯 벌 있었다 — OrderEvaluator 포함)
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
            if (stored) console.log(`   - 🎨 [재탐색] 색은 심사 스냅샷 고정 — ${stored.color} ${stored.score}점`);

            let paramLabel = "추천";
            if (priority === "TIME") paramLabel = "최단시간";
            if (priority === "DISTANCE") paramLabel = "최단거리";

            timeExt = `[${paramLabel}] ${signDist}${result.distDiffKm}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
        }

        logRoadmapEvent("서버", "재탐색 결과로 폴리라인 및 소요시간 갱신 연산");
        securedOrder.kakaoTimeExt = timeExt;
        const twin = session.myOrders.find(c => c.id === securedOrder.id);
        if (twin && (twin as any) !== (securedOrder as any)) twin.kakaoTimeExt = timeExt;   // 주기 sync 가 옛 문구로 되돌리지 않게

        /* 🛣️ 첫 콜만 쥔 동안(합짐 전)은 경로를 바꾸면 필터 라인도 따라간다 (기사님) */
        if (!isDetour && getActiveCalls(session).length === 1) session.filterLine = getActivePolyline(session);
        if (getActiveCalls(session).some(c => c.id === securedOrder.id)) {
            syncDetourFilter(userId, io);
        }

        logRoadmapEvent("서버", "관제탑에게 재산출된 노선(order-evaluated) 정보 전달");
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
 * `recalculateDetourFilter` 는 **`state/filterManager` 로 옮겼다**.
 *
 * 국면별 설정(§2-4)이 들어오면서 경유를 다시 그려야 하는 자리가 셋으로 늘었다 —
 * 관제탑 필터 저장 · **국면별 설정 저장** · **국면 전환**. 뒤의 둘은 `filterManager` 안이라
 * 여기(dispatchEngine)를 부르면 순환 참조가 된다. 그래서 함수를 아래(경계가 낮은 쪽)로 옮겼다.
 * 경유 계산은 이 레포에서 이미 **4벌**로 갈라진 적이 있다. 두 벌째를 만들지 않는다.
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
export async function handleDecision(userId: string, orderId: string, status: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE', io: any) {
    const session = getUserSession(userId);

    /**
     * 결재가 났으면 이 콜에 걸린 **감시 타이머는 할 일이 끝났다.**
     * 남겨 두면 30~35초 뒤에 깨어나 이미 처리된 콜을 다시 건드린다 (좀비 타이머).
     * ⚠️ `pendingDecisions` 는 여기서 지우지 않는다 — 앱이 ACK 할 때까지 판결을 들고 있어야 한다.
     */
    clearOrderTimers(session, orderId);

    const cachedPending = session.pendingOrdersData.get(orderId);
    const targetDeviceId = cachedPending?.capturedDeviceId
        ?? session.myOrders.find(c => c.id === orderId)?.capturedDeviceId;
    const isSimulatedMode = (cachedPending as any)?.isSimulated === true
        || (targetDeviceId ? getDeviceMode(targetDeviceId, userId) === 'SIMULATION' : false);

    const isKeep = status === 'ORDER_CONFIRMED';
    const piggybackAction = isKeep ? (isSimulatedMode ? 'SIMULATED_KEEP' : 'KEEP') : 'CANCEL';

    // [Option B] Piggyback 결재 기록: pendingDecisions에 action을 기록하면
    // 다음 1.0초 텔레메트리(/scrap) 응답에 이 결재가 태워져서 앱으로 전달됩니다.
    if (session.pendingDecisions.has(orderId)) {
        const decisionData = session.pendingDecisions.get(orderId)!;
        decisionData.action = piggybackAction;
        if (isKeep) logRoadmapEvent("서버", `앱폰에게 Action=${piggybackAction} 최종 판결 Piggyback 등록`);
        else logRoadmapEvent("서버", "앱폰에게 Action=Cancel 최종 판결 Piggyback 등록");
        console.log(`📦 [Piggyback V2] 관제탑 판결(${piggybackAction})을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: ${orderId})`);
    } else {
        // pendingDecisions에 없는 경우 (이미 타임아웃으로 삭제되었거나, MANUAL 건)
        if (isKeep) logRoadmapEvent("서버", `앱폰에게 Action=${piggybackAction} 최종 판결 응답 전달 (즉시)`);
        else logRoadmapEvent("서버", "앱폰에게 Action=Cancel 최종 판결 응답 전달 (즉시)");
        console.log(`⚠️ [Piggyback V2] pendingDecisions에 ${orderId}가 없습니다. (MANUAL 건이거나 이미 타임아웃 처리됨)`);
    }

    // [Piggyback V2] deviceEvaluatingMap은 여기서 절대 삭제하지 않습니다!
    // KEEP이든 CANCEL이든 앱이 다음 /scrap 폴링으로 decision을 가져가야 하므로
    // scrap.ts → deviceEvaluatingMap.get(deviceId) 조회가 성공해야 합니다.
    // 실제 삭제는 scrap.ts의 ACK 처리 블록에서만 수행합니다.

    // 삭제됨: 중복된 !isKeep 로직은 하단의 else 블록으로 통합되었습니다.

    if (isKeep) {
        logRoadmapEvent("서버", `관제탑으로 부터 Keep 결재 요청 받음${isSimulatedMode ? ' [가상 체험 모드]' : ''}`);
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

        const isAlreadyIncluded = session.myOrders.some(c => c.id === orderId);

        if (!isAlreadyIncluded) {
            logRoadmapEvent("서버", "해당 콜을 '내 퀵(myOrders)' 배열에 추가 및 병합 궤적 생성 연산");
            /**
             * 🎯 **목표값 — 이 콜을 잡던 순간의 필터값** (기사님 확정).
             *
             * 🔴 **하차지 좌표로 «어느 목적지 쪽인가»를 가르지 않는다.** 기사님이 그 필터값으로 콜을 보고 잡으신 것이니
             *    답이 이미 적혀 있다. 좌표로 가르면 마름모 자락에 걸친 콜이 엉뚱한 목적지로 찍혀
             *    목적지가 잘못 합쳐진다. 목적지는 «필터값 ∪ 마지막 KEEP 콜의 목표값»이다 (shared `goalZonesOf`).
             * 🔴 넣기 **전에** 적는다 — 승격본·캐시본 둘 다 (화면·장부가 갈리지 않게)
             */
            confirmedOrder.goalCity = goalCityOf(session, userId) || undefined;
            (cachedOrder as any).goalCity = confirmedOrder.goalCity;
            if (confirmedOrder.goalCity) console.log(`🎯 [목표] ${orderId.slice(0, 8)} → ${confirmedOrder.goalCity}`);
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
                         * ⚠️ **판결은 이미 큐에 실렸다**(위쪽 피기백 등록). 그러니 이 기다림이
                         *    기사님 폰의 KEEP 을 늦추지 않는다 — 바로 위 병합 연산과 같은 자리다.
                         *
                         * 🔴 승격본(`confirmedOrder`·myOrders)과 캐시본(`cachedOrder`·아래 DB 기록)이
                         *    **다른 객체**라 둘 다 적는다. 한쪽만 적으면 화면과 장부가 갈린다.
                         */
                        const solo = await measureSoloDelivery(confirmedOrder as any, {
                            priority: routingOptions.defaultPriority,
                            carType: routingOptions.carType,
                        });
                        if (solo) {
                            for (const o of [confirmedOrder, cachedOrder] as any[]) {
                                o.kakaoSoloDistanceKm = solo.km;
                                o.kakaoSoloDurationMin = solo.minutes;
                            }
                        }
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
            console.log(`🗺️ [경유 갱신] KEEP 후 destinationKeywords ${session.activeFilter.destinationKeywords.length}개로 재계산 완료`);
        }
        /**
         * ↩️ **KEEP 했으면 되돌릴 일이 없다** — 보관본을 버린다.
         * 남겨 두면 다음 취소 때 **엉뚱한 콜의 낡은 경로**가 되살아난다.
         */
        if (session.routeSnapshot) {
            session.routeSnapshot = null;
        }

        // DB에 영구 저장 (status: confirmed) 및 places/orderStops 기록 (v5 스키마)
        try {
            // [이슈 R] isShared는 "필터가 합짐 모드였는가"가 아니라
            // "이 콜을 잡을 때 이미 실린 짐이 있었는가"로 판정한다.
            //
            // session.activeFilter.isSharedMode 를 쓰지 않는다 — 필터 상태는 서버 재시작 등으로
            // 실제와 어긋날 수 있어(이슈 W) 명백한 합짐 콜이 isShared=0 으로 기록된다.
            //
            // 이 시점에는 confirmedOrder가 이미 myOrders에 push된 뒤이므로,
            // 활성 콜이 2건 이상이면 앞선 짐이 있었다는 뜻 = 합짐이다.
            const isShared = getActiveCalls(session).length > 1 ? 1 : 0;
            // isExpress: 파서가 추출한 orderForm이 "급송"이면 true
            const isExpress = (cachedOrder.orderForm === '급송') ? 1 : 0;

            if (!confirmedOrder.isSimulated) {
                // 1. orders 등록 (v5 전체 컬럼)
                OrderRepository.upsertOrder(cachedOrder, userId, isShared, isExpress);

                // 2. places UPSERT 및 orderStops 추가 (상차지)
                const pickupName = normalizePlaceName(cachedOrder.pickupDetails?.[0]?.customerName || "배차값없음");
                const pickupAddress = cachedOrder.pickupDetails?.[0]?.addressDetail || cachedOrder.pickup;
                const pickupRegion = cachedOrder.pickupDetails?.[0]?.region || cachedOrder.pickup.split(' ').slice(0, 2).join(' ') || "배차값없음";
                
                const pPlaceId = PlaceRepository.upsertPlace(
                    pickupAddress, pickupName, pickupRegion,
                    cachedOrder.pickupX || null, cachedOrder.pickupY || null,
                    cachedOrder.pickupDetails?.[0]?.phone1 || null
                );
                if (pPlaceId) {
                    OrderRepository.insertOrderStop(
                        cachedOrder.id, pPlaceId, 'pickup', pickupName, cachedOrder.pickupDetails?.[0]?.phone1 || null
                    );
                }

                // 3. places UPSERT 및 orderStops 추가 (하차지)
                const dropoffName = normalizePlaceName(cachedOrder.dropoffDetails?.[0]?.customerName || "배차값없음");
                const dropoffAddress = cachedOrder.dropoffDetails?.[0]?.addressDetail || cachedOrder.dropoff;
                const dropoffRegion = cachedOrder.dropoffDetails?.[0]?.region || cachedOrder.dropoff.split(' ').slice(0, 2).join(' ') || "배차값없음";
                
                const dPlaceId = PlaceRepository.upsertPlace(
                    dropoffAddress, dropoffName, dropoffRegion,
                    cachedOrder.dropoffX || null, cachedOrder.dropoffY || null,
                    cachedOrder.dropoffDetails?.[0]?.phone1 || null
                );
                if (dPlaceId) {
                    OrderRepository.insertOrderStop(
                        cachedOrder.id, dPlaceId, 'dropoff', dropoffName, cachedOrder.dropoffDetails?.[0]?.phone1 || null
                    );
                }

                console.log(`💾 [DB 저장 완료] ${cachedOrder.id} - confirmed (v5 장소/경유지 기록 완료)`);
            } else {
                console.log(`🐥 [가상 체험 콜] ${cachedOrder.id} - DB 저장 건너뜀 (메모리 세션에서만 합짐 시뮬레이션 가동)`);
            }
        } catch (dbErr) {
            console.error("DB 저장 에러:", dbErr);
        }

        logRoadmapEvent("서버", "관제탑에게 확정되었음(order-confirmed) 정보 전달");
        io.to(userId).emit("order-confirmed", orderId);

        logRoadmapEvent("서버", "합짐을 위한 반경/목적지 추천 키워드로 다이나믹 필터 생성 연산");

        // ━━━ 3단계 State Machine 적용 ━━━
        // 합짐 차종: [내 차 용량 − 확정된 콜 전부의 용량]으로 남은 적재 가능 차종을 추론한다.
        //
        // 첫 짐 차종 하나만 보고 «첫 짐 이하 등급»을 허용하면, 오토바이급 콜을 잡는 순간
        // 허용 차종이 [오토바이] 하나로 줄어 합짐 콜 잡기가 멈춘다 — 짐이 작을수록 공간이 더 남는데도.
        const routingOpts = SettingsRepository.getKakaoRoutingOptions(userId);
        const myVehicle = routingOpts.vehicleType || '1t';
        // 방금 push한 confirmedOrder 포함, 현재 적재 중인 활성 콜 전부
        const loadedVehicles = getActiveCalls(session).map(c => c.vehicleType || myVehicle);
        const sharedVehicleTypes = getRemainingCapacityTypes(myVehicle, loadedVehicles);
        console.log(`🚚 [적재 용량] 내 차: ${myVehicle} | 실은 짐: [${loadedVehicles.join(', ')}] → 추가 가능 차종: [${sharedVehicleTypes.join(', ')}]`);

        // [자체 리뷰 C] 차종을 인식하지 못하면 보수적으로 "내 차를 가득 채운 것"으로 계산한다.
        // 안전한 방향이지만 그만큼 합짐 콜 잡기 범위가 좁아지므로, 조용히 넘어가면 안 된다.
        // 파싱 실패율이 높다면 파서를 고쳐야 하므로 눈에 띄게 남긴다.
        const unknownVehicles = loadedVehicles.filter(v => !normalizeVehicleType(v));
        if (unknownVehicles.length > 0) {
            console.warn(`⚠️ [적재 용량] 차종 인식 실패 ${unknownVehicles.length}건 [${unknownVehicles.join(', ')}] → 만재로 간주(보수적). 합짐 범위가 실제보다 좁아집니다.`);
        }

        // 경유 한 벌은 위의 syncDetourFilter 가 이미 넣었다 — 전이는 국면·차종만 (#81)
        const transition = StateMachine.advanceOnKeep(session, sharedVehicleTypes);
        if (transition.changed && transition.newFilter) {
            updateActiveFilter(userId, transition.newFilter, io);
            console.log(`🔄 [State Machine] ${transition.reason}`);
        }
        logRoadmapEvent("서버", "새로 부여된 합짐 필터(isSharedMode)값 메모리 세션 갱신");
        logRoadmapEvent("서버", "앱폰 및 관제탑에게 새로운 타겟팅 필터(filter-updated) 정보 전달");
    } else {
        logRoadmapEvent("서버", `관제탑으로 부터 수동 취소/방출(${status}) 요청 받음`);
        
        // 메모리에서 완전히 지우지 않고 상태값만 갱신하여 프론트엔드 취소/방출 탭에 보존
        // (두 메모리를 함께 갱신 — 여기는 원래 둘 다 쓰고 있었지만 규약으로 통일한다)
        setOrderStatus(session, orderId, status);

        const cachedForLedger = session.myOrders.find(c => c.id === orderId)
            ?? session.pendingOrdersData.get(orderId);
        const isSimulatedOrder = (cachedForLedger as any)?.isSimulated;

        if (cachedForLedger && !isSimulatedOrder) {
            try {
                const isShared = getActiveCalls(session).length > 1 ? 1 : 0;
                const isExpress = (cachedForLedger as any).orderForm === '급송' ? 1 : 0;
                OrderRepository.upsertOrder(cachedForLedger as any, userId, isShared, isExpress);
                const terminatedAt = OrderRepository.updateOrderStatus(orderId, userId, status);
                if (terminatedAt) (cachedForLedger as any).terminatedAt = terminatedAt;   // 🧹 화면으로 가는 메모리 콜에도 (전수표 #65)
                console.log(`✅ [상태 동기화] ${orderId} - DB 업데이트 완료 (상태: ${status})`);
            } catch (e) {
                console.error("DB 업데이트 에러:", e);
            }
        }

        if (!isSimulatedOrder) {
            countCancel(session, targetDeviceId, orderId, 'DECISION_CANCEL', undefined, io);
        } else {
            console.log(`🐥 [가상 체험 콜 종료] ${orderId} - 패널티 카운트 없이 안전하게 세션 정리 완료`);
        }

        if (io) {
            logRoadmapEvent("서버", "관제탑에게 콜이 삭제되었음(order-canceled) 정보 전달");
            io.to(userId).emit("order-canceled", { id: orderId, status, isManual: true });
        }

        const activeCalls = getActiveCalls(session);
        const transition = StateMachine.rollbackOnCancel(session, activeCalls.length);
        
        if (transition.changed && transition.newFilter) {
            if (io) {
                updateActiveFilter(userId, transition.newFilter, io);
                logRoadmapEvent("서버", transition.reason || "상태 변경");
                logRoadmapEvent("서버", "앱폰 및 관제탑에게 탐색 재개(filter-updated) 정보 전달");
            }
            console.log(`🔄 [State Machine] ${transition.reason}`);
        }

        await recalculateActiveKakaoRoute(userId, io);
    }

    /**
     * ⚠️ 여기서는 아무것도 지우지 않는다. KEEP 은 오히려 승격본을 캐시에 **덮어써 남긴다**(위 `set` — 롤백 방지).
     * 로그는 하는 일만 말한다 — «삭제»라고 쓰면 좀비 잠금 진단이 늦어진다.
     */
    console.log(`🛡️ [서버] 결재 처리 완료 (${orderId} · ${status}) — 심사 캐시는 KEEP 승격본으로 유지된다`);
    return { success: true, action: status };
}

/** [필수#1] 최초 오더 평가: 지오코딩 + 카카오 경로 연산 + 꿀/콜/똥 판정 (detail.ts에서 추출) */
export async function evaluateNewOrder(userId: string, securedOrder: SecuredOrder | PendingOrder, io: any, targetApp: string = 'insung') {
    const evaluator = new OrderEvaluator(targetApp);
    await evaluator.evaluate(userId, securedOrder, io);
}

/**
 * 로그인·소켓 접속 시 실행되는 **단일 부트스트랩 시퀀스**.
 *
 * 이 과정을 여러 곳에 흩으면 복구를 기다리지 않고 filter-init 이 먼저 나가
 *   ① 앱폰이 1~3초간 "첫짐 필터(경유 없음)"를 받아 경로 이탈 콜을 잡을 수 있고
 *   ② 관제탑이 첫짐 → 합짐으로 깜빡이며
 *   ③ destinationKeywords 를 여러 곳이 각자 만들어 진실 공급원이 없어진다.
 *
 * 그래서 아래 순서를 한 함수가 책임진다. **⑥ 이전에는 앱폰에 콜 잡기를 시키지 않는다.**
 *
 *   ① 세션 확보    DB에서 baseFilter 로드 (지리 연산 없음)
 *   ② 데이터 로드   오늘의 활성 콜 복구 → myOrders
 *   ③ 노선 산출    카카오 Solo / Detour+TSP → routePolyline
 *   ④ 상태 파생    dispatchPhase · allowedVehicleTypes · isSharedMode
 *   ⑤ 경유 도출    폴리라인 기준(활성 콜 있음) 또는 destinationCity 기준(없음)
 *   ⑥ 필터 확정    activeFilter 완성 → 관제탑 filter-init 1회 + 앱폰 콜 잡기 재개
 */
export async function bootstrapUserSession(userId: string, io: any): Promise<void> {
    const session = getUserSession(userId);          // ① (지리 연산 없이 baseFilter 만)
    if (session.isRestored || session.isBootstrapping) return;

    session.isBootstrapping = true;                  // 이 순간부터 앱폰은 isActive=false 를 받는다
    const t0 = Date.now();
    logRoadmapEvent("서버", "[Bootstrap] 시작 — 필터 확정 전까지 앱폰 콜 잡기 일시 정지");

    try {
        /**
         * 브라우저 GPS 가 안 잡히면 접근 구간(현위치 → 상차지)을 계산할 수 없어
         * 통화에서 "몇 시까지 갈 수 있다"를 말할 수가 없다.
         * 그럴 때 **사용자 설정의 '내 주소'** 로 메운다.
         *
         * 주소·좌표를 코드에 박지 않는다 — 설정의 주소는 지오코딩까지 되어 있고,
         * 이사하면 설정만 바꾸면 된다.
         *
         * **GPS 가 들어오면 그 값이 언제나 이긴다** (dashboard-gps-update).
         * 추정으로 계산했다는 사실은 `originIsFallbackLEGACY` 으로 숨기지 않는다.
         */

        /**
         * 📍 **«내가 어디 있었나»도 되살린다**.
         *
         * ── 왜 ──
         * 세션의 `lastFix` 는 **메모리에만 산다.** 18:56 에 이천에서 주행이 끝나고
         * 20:11 에 서버가 다시 뜨자 «좌표를 한 번도 받은 적 없는» 상태가 됐고,
         * PC 지도의 「현위치」가 **광주 초월읍(집)** 을 가리켰다 — 차는 이천에 있는데.
         * **점은 `gps_tracks` 에 그대로 있었다** (「칸은 있는데 안 읽는다」 · 이 레포의 단골).
         *
         * 🔴 **경로 기점은 이걸로 안 바뀐다.** `originOf` 는 5분 문턱을 그대로 보므로
         *    낡은 좌표면 여전히 집을 고른다 (여주 4시간 25분 사고 방어).
         *    되살리는 것은 **«내가 어디 있나»의 답**이고, 그건 지도·그물이 읽는다.
         * ⚠️ 영업일 밖 점은 `lastTrackPointOf` 가 안 준다 — 어제 자리가 오늘 살아나지 않는다.
         */
        const lastPt = lastTrackPointOf(userId);
        /* 🔴 «이미 아는 자리가 있나»도 **파생 함수로 묻는다** — 원자료(`lastFix`)를 직접
           읽으면 «기점은 `originOf` 로만 읽는다» 규칙과 구분이 안 된다 (그 검사가 잡았다) */
        if (lastPt && !lastKnownPositionOf(session)) {
            session.lastFix = { x: lastPt.x, y: lastPt.y };
            session.lastFixAt = lastPt.atMs;
            session.lastFixIsMock = lastPt.source === 'mock';
            session.lastFixSource = (lastPt.source as 'gps' | 'mock' | 'manual') ?? 'gps';
            console.log(`📍 [위치 복구] ${new Date(lastPt.atMs).toLocaleTimeString('ko-KR')} 의 마지막 점 — `
                + `${lastPt.x.toFixed(5)}, ${lastPt.y.toFixed(5)} (출처 ${lastPt.source})`);
        }

        await restoreAndRecalculateSession(userId, io);   // ②③④ (DB 로드 → 카카오 노선 → 상태 파생)
        rebuildDestinationKeywords(userId, io);           // ⑤ (활성 콜 유무로 경유/도시 분기)
    } catch (err) {
        console.error("🚨 [Bootstrap] 실패:", err);
    } finally {
        // ⑥ 성공하든 실패하든 반드시 잠금을 푼다. 여기서 막히면 콜 잡기가 영영 멈춘다.
        session.isBootstrapping = false;
    }

    const f = session.activeFilter;
    console.log(`✅ [Bootstrap 완료] ${Date.now() - t0}ms | phase=${f.dispatchPhase} 합짐=${f.isSharedMode} ` +
        `차종=${(f.allowedVehicleTypes || []).length}종 키워드=${(f.destinationKeywords || []).length}개`);
    logRoadmapEvent("서버", `[Bootstrap] 완료 (${Date.now() - t0}ms) — 관제탑에 확정 필터 1회 전송, 앱폰 콜 잡기 재개`);

    if (io) {
        io.to(userId).emit("filter-init", {
            activeFilter: session.activeFilter,
            baseFilter: session.baseFilter,
        });
    }
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

/** 장부의 도착 마일스톤을 콜 객체 칸으로 되살린다 — 재시작해도 다녀온 곳을 기억하게 */
function hydrateVisitedStops(orderId: string): { arrivedPickupAt?: string; arrivedDropoffAt?: string } {
    // 🔄 파생 치환 ② — 복구의 재료도 새 장부 (단계 행의 occurred_at)
    const rows = stepRecordsOf(orderId).milestones as { milestone: string; occurredAt: string }[];
    const at = (m: string) => rows.find(r => r.milestone === m)?.occurredAt;
    return {
        arrivedPickupAt: at('ARRIVED_PICKUP'),
        arrivedDropoffAt: at('ARRIVED_DROPOFF'),
    };
}

/**
 * [방안 1] 서버 재시작 시 DB에서 콜을 불러와 1회성 카카오 궤적 복구 연산
 * ⚠️ 직접 호출하지 말 것 — bootstrapUserSession() 을 통해서만 실행된다.
 */
export async function restoreAndRecalculateSession(userId: string, io: any) {
    const session = getUserSession(userId);
    if (session.isRestored) return; // 이미 복구했으면 스킵
    session.isRestored = true;

    try {
        const { todayStartIso, unfinishedSinceIso } = restoreWindow(Date.now());

        // 1. orders와 places 테이블을 조인하여 복구 대상 콜과 X, Y 좌표를 불러옵니다.
        //
        // 🔴 상태 목록을 여기 손으로 적지 않는다.
        //    손으로 적으면 새 상태(ORDER_PICKED_UP · ORDER_DELIVERED 같은 것)가 빠져
        //    **짐을 실은 채 새로고침하면 콜이 사라진다.** shared 의 RESTORABLE_STATUSES 한 곳에서만 정한다.
        //
        // [임시 · Phase 7 도입 시 삭제] 미완료 콜은 날짜 무관(3일 상한)으로 되살린다.
        //    `timestamp >= 오늘 자정` 만 쓰면 **전날 상차한 콜이 사라져서**
        //    전날 상차 → 다음날 배송하는 운행이 통째로 깨진다.
        //    종결 콜은 지금처럼 오늘 것만 — 목록이 무한정 길어질 이유가 없다.
        const statusPlaceholders = RESTORABLE_STATUSES.map(() => '?').join(', ');
        const progressPlaceholders = IN_PROGRESS_STATUSES.map(() => '?').join(', ');
        /* 🗓️ 창은 shared `restoreWhere` 한 벌 — «오늘 하차»도 살린다 (자정 넘긴 운행) */
        const win = restoreWhere(Date.now(), 'o.');
        const rows = db.prepare(`
            SELECT o.*,
                   pPlace.x as pickupX, pPlace.y as pickupY,
                   dPlace.x as dropoffX, dPlace.y as dropoffY
            FROM orders o
            LEFT JOIN orderStops pStop ON pStop.orderId = o.id AND pStop.stopType = 'pickup'
            LEFT JOIN places pPlace ON pStop.placeId = pPlace.id
            LEFT JOIN orderStops dStop ON dStop.orderId = o.id AND dStop.stopType = 'dropoff'
            LEFT JOIN places dPlace ON dStop.placeId = dPlace.id
            WHERE o.userId = ? AND o.status IN (${statusPlaceholders})
              AND ${win.sql}
            ORDER BY o.timestamp ASC
        `).all(userId, ...RESTORABLE_STATUSES, ...win.params) as any[];

        // 🔴 상한을 넘겨 **빠진** 미완료 콜은 조용히 사라지게 두지 않는다.
        //    기사님이 모르는 채로 콜을 잃으면 안 된다 — 상한을 두면서 그 실패를 새로 만들 수는 없다.
        const dropped = db.prepare(`
            SELECT id, status, pickup, dropoff, timestamp FROM orders
            WHERE userId = ? AND status IN (${progressPlaceholders}) AND timestamp < ?
            ORDER BY timestamp DESC LIMIT 20
        `).all(userId, ...IN_PROGRESS_STATUSES, unfinishedSinceIso) as any[];

        if (dropped.length > 0) {
            const daysAgo = (t: string) =>
                Math.floor((Date.now() - new Date(t).getTime()) / 86_400_000);
            console.warn(
                `⚠️ [복구 제외] ${UNFINISHED_RESTORE_DAYS}일이 지난 미완료 콜 ${dropped.length}건이 화면에서 빠집니다:\n` +
                dropped.map(o => `   · ${o.id.slice(0, 8)} ${o.status} ${o.pickup}→${o.dropoff} (${daysAgo(o.timestamp)}일 전)`).join('\n')
            );
            io?.to(userId).emit("stale-orders-dropped", {
                count: dropped.length,
                days: UNFINISHED_RESTORE_DAYS,
                orders: dropped.map(o => ({
                    id: o.id, status: o.status, pickup: o.pickup, dropoff: o.dropoff,
                    daysAgo: daysAgo(o.timestamp),
                })),
            });
        }

        if (rows.length === 0) return;

        logRoadmapEvent("서버", `[Session DB Load] 서버 재시작으로 인한 궤적(Polyline) 복구 연산 시작. 대상 콜: ${rows.length}개`);

        // 2. session 메모리 재구성
        for (const row of rows) {
            const order: MyOrder = {
                id: row.id,
                type: row.type,
                pickup: row.pickup,
                dropoff: row.dropoff,
                fare: row.fare,
                timestamp: row.timestamp,
                status: row.status,
                capturedAt: row.capturedAt,
                /** 🎯 판 — 안 읽으면 재기동 뒤 전부 하차지 시로 조용히 물러난다 (#131) */
                goalCity: row.goalCity ?? undefined,
                capturedDeviceId: row.capturedDeviceId,
                vehicleType: row.vehicleType,
                distanceKm: row.distanceKm,
                totalDistanceKm: row.totalDistanceKm,
                totalDurationMin: row.totalDurationMin,
                /**
                 * 🗺️ **장부에 남은 궤적을 그대로 되살린다** (기사님 확정).
                 * 이게 있으면 아래 카카오 복구 연산을 건너뛴다 — 한 번 잰 경로를 다시 재지 않는다.
                 * 깨진 값이면 없는 것으로 친다 (그러면 아래에서 다시 잰다 — 안전망).
                 */
                routePolyline: parsePolyline(row.routePolyline),
                kakaoSoloDistanceKm: row.kakaoSoloDistanceKm,
                kakaoSoloDurationMin: row.kakaoSoloDurationMin,
                kakaoTimeExt: row.kakaoTimeExt,
                pickupX: row.pickupX,
                pickupY: row.pickupY,
                dropoffX: row.dropoffX,
                dropoffY: row.dropoffY,
                // [T8] 착불 여부가 복구에서 빠져 있었다 — 재접속 직후 착불 표시가 사라진다
                paymentType: row.paymentType,
                /**
                 * 🏁 **하차 시각** — 화면의 사이클 경계가 이걸 본다.
                 * 없으면 관제웹이 "언제 내렸는지 모른다"가 되어 지난 운행의 완료분을
                 * 못 가른다 (그래도 카드를 지우진 않는다 — 규칙 ④).
                 */
                completedAt: row.completedAt,
                isShared: !!row.isShared,
                isExpress: !!row.isExpress,
                // 🧭 어떻게 잡았나(자동·알람·직접) — 안 되살리면 재부팅마다 갈래 배지가 사라진다
                capturedVia: row.capturedVia,
                orderForm: row.orderForm,
                detailMemo: row.detailMemo,
                /**
                 * 🚏 **도착 시각을 되살린다**.
                 * 안 되살리면 재시작 직후 `hasVisitedStop` 이 false 가 되어
                 * **이미 다녀온 정거장으로 되돌아가는 경로**가 다시 그려진다.
                 */
                ...hydrateVisitedStops(row.id),
                /**
                 * 🎨 **색도 되살린다** — 심사 스냅샷(DB)을 재시작 뒤 콜에 붙인다. 안 붙이면 관제웹이
                 *    **문장을 뒤져** 색을 정하다가 재탐색 문구(`🍯 (꿀)` — 괄호)를 못 잡아
                 *    **꿀콜이 「보통」 초록**으로 보인다. 🚨 `(사고)` 도 마찬가지다.
                 *    새로 재는 게 아니라 **그때 그 값**이다 — 색은 심사 1회 고정 (v2 ③④).
                 */
                judgment: OrderRepository.getJudgmentVerdict(row.id) ?? undefined,
            };
            rememberOrder(session, order as any);
        }

        const allLoaded = Array.from(session.pendingOrdersData.values()) as MyOrder[];
        session.myOrders = allLoaded;

        // 카카오 궤적 복원 연산 시에는 진행 중인(취소/방출/완료가 아닌) 콜만 필터링하여 사용
        const routingOptions = SettingsRepository.getKakaoRoutingOptions(userId);
        const activeCalls = getActiveCalls(session);
        const activeMain = activeCalls[0];
        const activeSubs = activeCalls.slice(1);

        // 3. 첫짐 콜의 카카오 궤적 1회 복구
        if (activeMain && activeMain.pickupX && activeMain.dropoffX) {
            /**
             * 🗺️ **장부에 궤적이 있으면 다시 재지 않는다** (기사님 확정).
             *
             * 기사님: *"확정된 경로를 새로 받아올 필요가 없다 생각되어서 하는 질문이야."*
             *
             * 거리·시간·접근 구간까지 행에 남아 있으므로 카카오를 부를 이유가 없다.
             * ⚠️ 궤적이 없거나(옛 행·연산 실패) 깨졌으면 **아래로 내려가 다시 잰다** —
             *    안전망은 빼지 않는다 (규칙 ②).
             */
            if (activeMain.routePolyline?.length) {
                console.log(`🗺️ [복구 - 궤적 재사용] ${activeMain.id} — 장부의 ${activeMain.routePolyline.length}점을 그대로 씁니다 (카카오 호출 없음)`);
            } else
            try {
                // 🔴 복구도 마찬가지다 — 상차하고 달리다 **새로고침만 해도** 경로가 상차지로
                //    되돌아가던 자리다.
                const res = await calculateSoloRoute(
                    activeMain.pickupX, activeMain.pickupY!,
                    activeMain.dropoffX, activeMain.dropoffY!,
                    originOf(session),
                    routingOptions.defaultPriority,
                    routingOptions.carType,
                    hasVisitedStop(activeMain, 'pickup'),
                );
                // 🔴 복구도 기록 규약 `applySoloRoute` 한 곳을 거친다 — 폴리라인·ETA 만 손으로 쓰면
                //    `approachDuration` · `kakaoSolo*` · `totalDistanceKm` 가 버려져 **재접속하면 접근 구간이 '모름'** 이 되고,
                //    통화에서 "몇 시까지 갈 수 있다"를 말할 수가 없다.
                applySoloRouteAndSave(activeMain, res);   // sectionEtas 도 여기서 함께 기록된다

                if (res.approachDuration) {
                    console.log(`🗺️ [복구 - 접근 구간] ${originOf(session)?.isFallback ? '임시 출발지' : '현위치'} → 상차지 ` +
                        `${toKm(res.approachDistance || 0)}km / ${toMin(res.approachDuration)}분`);
                }
            } catch(e) {
                console.error('🗺️ [첫짐 콜 복구 연산 실패]', e);
            }
        }

        // 4. 합짐(서브콜) 카카오 궤적 1회 복구
        if (activeSubs.length > 0 && activeMain) {
            try {
                const calcResult = await composeMergedRoute({
                    calls: activeCalls,
                    origin: originOf(session),
                    priority: routingOptions.defaultPriority,
                    carType: routingOptions.carType,
                });
                // myOrders 에는 종료된 콜도 함께 로드되므로 반드시 활성 콜 기준으로 잡아야 한다.
                if (calcResult) applyRouteAndSave(pickRouteHolder(activeCalls, activeMain), calcResult.merged);
            } catch(e) {
                console.error('🗺️ [합짐 복구 연산 실패]', e);
            }
        }

        logRoadmapEvent("서버", `[Session DB Load] 궤적 복구 연산 완료. 클라이언트로 sync-active-orders 강제 전송`);

        // 5. [이슈 W] 복구된 데이터로부터 배차 상태를 다시 "파생"시킨다.
        //
        // activeFilter 를 복구하지 않으면 진행 중인 콜이 있는데도 필터가 STANDBY(첫짐) /
        // isSharedMode=false 로 남아 콜 잡기가 계속된다. 그러면
        //   - OrderEvaluator가 도착지 경유 검사를 건너뛰어 경로 이탈 콜도 통과
        //   - 첫짐 절대하한가(minFare)가 잘못 적용
        //   - 남은 적재 공간을 무시한 차종 허용 (라보 2건 만재여도 1t 콜을 잡으러 감)
        //   - KEEP 시 isShared=0 으로 기록되어 통계 왜곡 (이슈 R)
        //
        // 상태를 따로 저장했다가 되살리는 대신 **데이터에서 매번 파생**시킨다.
        // 저장된 상태는 실제와 어긋날 수 있지만 파생값은 어긋날 수 없다.
        //
        // ⚠️ 미완료 콜은 3일까지 되살아나므로 며칠 전 콜이 섞여 들어올 수 있다. 그래도 안전한 이유는
        //    **파생**이다: 아래 상태는 전부 `getActiveCalls(session)` 에서 매번 다시 구하므로
        //    "지금 실려 있는 콜"이 진실인 것은 변하지 않는다.
        const restoredActive = getActiveCalls(session);
        if (restoredActive.length > 0) {
            const myVehicle = SettingsRepository.getKakaoRoutingOptions(userId).vehicleType || '1t';
            const loadedVehicles = restoredActive.map(c => c.vehicleType || myVehicle);
            // 복구 시점엔 출발 사실이 없다(서버 재시작으로 세션이 새로 났다) → 모으기부터 다시
            const phase = deriveDispatchPhase(restoredActive.length, !!session.departedAt);

            updateActiveFilter(userId, {
                dispatchPhase: phase,
                isSharedMode: true,
                allowedVehicleTypes: getRemainingCapacityTypes(myVehicle, loadedVehicles),
            }, io);

            // 경유 키워드는 부트스트랩 ⑤(rebuildDestinationKeywords)가 일괄 처리한다.
            // 여기서 또 계산하면 같은 지리 연산을 두 번 돌린다.

            const f = session.activeFilter;
            console.log(`🔄 [상태 복구] 진행 중 ${restoredActive.length}건 → phase=${phase}, 합짐=ON, ` +
                `추가 가능 차종=[${(f.allowedVehicleTypes || []).join(', ')}], 경유 키워드=${(f.destinationKeywords || []).length}개`);
            logRoadmapEvent("서버", `[Session DB Load] 진행 중 ${restoredActive.length}건 기준으로 배차 상태 재구성 (${phase}/합짐)`);

            // 관제탑에 복구 사실을 알린다.
            // 이미 배달했는데 완료 처리를 안 한 건이 있으면 서버는 계속 "적재 중"으로 믿고
            // 합짐 필터를 좁게 유지하므로, 기사님이 완료 처리를 하도록 유도해야 한다.
            if (io) {
                io.to(userId).emit("session-restored", {
                    restoredCount: restoredActive.length,
                    dispatchPhase: phase,
                    orderIds: restoredActive.map(c => c.id),
                });
            }
        }

        // 6. 프론트엔드로 복구된 궤적 즉시 전송
        if (io) {
            console.log(`📤 [Socket 푸시] sync-active-orders (활성 ${getActiveCalls(session).length}건)`);
            io.to(userId).emit("sync-active-orders", buildOrderSync(session));
        }

    } catch (err) {
        console.error('🚨 [restoreAndRecalculateSession] 오류 발생:', err);
    }
}

// ━━━ [socketHandlers 인라인 로직 추출] ━━━
// 아래 함수들은 socketHandlers.ts의 소켓 이벤트 핸들러에 85줄+ 인라인되어 있던 
// 비즈니스 로직을 함수로 추출한 것입니다.

export interface MilestoneResult {
    success: boolean;
    /** 이미 같은 마일스톤이 기록돼 있어 아무것도 하지 않음 (오류가 아니다) */
    duplicated?: boolean;
    reason?: string;
    status?: string;
}

/**
 * 잘못 누른 마일스톤을 되돌린다.
 *
 * 상태를 손으로 되돌리지 않는다 — 지우고 나서 **남은 마일스톤으로 다시 파생**시킨다.
 * (`deriveStatusFromMilestones`) 취소 경로마다 목표 상태를 정하면 그 규칙들이 갈라진다.
 */
export async function undoMilestone(userId: string, orderId: string, milestone: Milestone, io: any) {
    const session = getUserSession(userId);
    // 기록의 되돌림은 장부의 마감 해제다
    if (!milestoneAlreadyRecorded(orderId, milestone)) return { success: false, reason: 'NOT_FOUND' as const };
    bridgeUndoMilestone(userId, orderId, milestone);

    // 🚏 도착을 되돌리면 "다녀왔다"도 되돌린다 — 안 지우면 경로에서 영영 빠진 채 남는다
    const undoField = milestone === 'ARRIVED_PICKUP' ? 'arrivedPickupAt'
                    : milestone === 'ARRIVED_DROPOFF' ? 'arrivedDropoffAt' : null;
    if (undoField) {
        const o = session.myOrders.find(c => c.id === orderId);
        if (o) delete (o as any)[undoField];
        const cached = session.pendingOrdersData.get(orderId);
        if (cached) delete (cached as any)[undoField];
    }

    const rest = stepRecordsOf(orderId).milestones as { milestone: string }[];   // 🔄 파생 치환 ②
    const status = deriveStatusFromMilestones(rest);

    setOrderStatus(session, orderId, status);
    try {
        db.prepare(`UPDATE orders SET status = ?, completedAt = CASE WHEN ? = 'ORDER_DELIVERED' THEN completedAt ELSE NULL END
                    WHERE id = ? AND userId = ?`).run(status, status, orderId, userId);
    } catch (e) {
        console.error('🚨 [마일스톤 취소] DB 갱신 실패:', e);
    }

    console.log(`↩️ [마일스톤 취소] ${MILESTONE_LABEL[milestone]} 삭제 → 남은 기록 기준 ${status}`);
    logRoadmapEvent("서버", `[마일스톤 취소] ${MILESTONE_LABEL[milestone]}`);

    // 되돌린 것도 저장이다 — 같은 규칙으로 전파한다
    await recalculateActiveKakaoRoute(userId, io);
    updateActiveFilter(userId, {}, io);
    if (io) {
        io.to(userId).emit("sync-active-orders", buildOrderSync(session));
        io.to(userId).emit("steps-synced", { orderId, steps: stepsView(orderId, session.judgment) });
    }
    return { success: true, status };
}

/**
 * 상차/하차 보고를 받는 **유일한 진입점**.
 *
 * 기사님 말: *"화면 분석해서 자동으로 하든, 내가 직접 누르든, 앱으로부터 받든
 * 이벤트를 받게 될 것이다."* — 진입점이 셋이다.
 * 오늘 EE에서 배운 것: **갈래가 셋이면 셋이 어긋난다. 진입점만 셋, 본체는 하나.**
 *
 * 이 함수가 책임지는 것
 *   ① 멱등성   같은 보고가 자동 감지 + 수동 클릭으로 두 번 와도 한 번만 반영
 *   ② 역행 방지 하차한 뒤 상차 보고가 늦게 도착해도 상태를 되돌리지 않는다
 *   ③ 상태 전이 ORDER_CONFIRMED → ORDER_PICKED_UP → ORDER_DELIVERED
 *   ④ 적재 회복 DELIVERED 는 종결 상태이므로 getActiveCalls()에서 빠지고,
 *              경로 재계산이 잔여 용량과 경유를 다시 넓혀 준다
 *   ⑤ 출처 기록 나중에 자동 감지 정확도를 측정할 유일한 근거
 */
export async function reportMilestone(
    userId: string,
    orderId: string,
    milestone: Milestone,
    source: MilestoneSource,
    io: any,
    occurredAt?: string,
    /** 이 시점에 우리가 예상했던 시각. 오차를 재기 위해 함께 저장한다 */
    predictedAt?: string,
    /** 📍 도착 사유 (기사님) — 정상 도착이면 비어 있다 */
    reasons?: string[],
): Promise<MilestoneResult> {
    const session = getUserSession(userId);
    const order = session.myOrders.find(c => c.id === orderId);
    if (!order) {
        console.warn(`⚠️ [마일스톤] ${milestone} — 오더 ${orderId} 를 찾을 수 없음`);
        return { success: false, reason: "ORDER_NOT_FOUND" };
    }

    // ② 역행 방지. 이미 하차한 콜에 상차 보고가 늦게 도착하는 경우가 실제로 생긴다
    //    (앱이 통신 끊겼다 복구되며 밀린 이벤트를 몰아서 보낼 때)
    if (!canReportMilestone(order.status, milestone)) {
        // "이미 보고함"과 "순서가 안 맞음"은 기사님에게 다른 뜻이다.
        // 앞은 정상(버튼 두 번 누름), 뒤는 뭔가 어긋났다는 신호이므로 구분해서 돌려준다.
        const already = !!MILESTONE_TO_STATUS[milestone] && order.status === MILESTONE_TO_STATUS[milestone];
        const reason = already ? "ALREADY_REPORTED" : "OUT_OF_ORDER";
        console.log(`↩️ [마일스톤] ${milestone} 무시 (${reason}) — 현재 상태 ${order.status}`);
        return { success: true, duplicated: true, reason, status: order.status };
    }

    const nowIso = new Date().toISOString();
    // ① 멱등성 — 장부의 단계 행이 그 근거다: 행마다 UNIQUE(orderId) + occurred_at 존재 여부
    if (milestoneAlreadyRecorded(orderId, milestone)) {
        console.log(`🔁 [마일스톤] ${milestone} (${source}) 중복 — ${orderId} 는 이미 기록됨`);
        return { success: true, duplicated: true, status: order.status };
    }

    /**
     * 🚏 **도착 시각을 콜 객체에도 남긴다**.
     *
     * 경로 조립(`planArrivalStops`·`planMergedStops`)이 "다녀왔는가"를 판단할 때
     * 매번 DB 를 뒤지지 않게, 세션 콜에 실어 둔다. `hasVisitedStop` 이 이 값을 본다.
     * 두 기억(myOrders·pendingOrdersData)에 함께 쓴다 — 한쪽만 쓰면 갈라진다 (helpers 규칙).
     */
    const arrivedField = milestone === 'ARRIVED_PICKUP' ? 'arrivedPickupAt'
                       : milestone === 'ARRIVED_DROPOFF' ? 'arrivedDropoffAt' : null;
    if (arrivedField) {
        const at = occurredAt || nowIso;
        (order as any)[arrivedField] = at;
        const cached = session.pendingOrdersData.get(orderId);
        if (cached && cached !== (order as any)) (cached as any)[arrivedField] = at;
    }

    // ③ 상태 전이. 도착(ARRIVED_*)은 상태를 바꾸지 않는다 — 도착했다고 짐이 실린 건 아니다
    const nextStatus = MILESTONE_TO_STATUS[milestone];
    if (nextStatus) {
        setOrderStatus(session, orderId, nextStatus);

        try {
            if (milestone === 'DELIVERED') {
                const deliveredAt = occurredAt || nowIso;
                db.prepare(`UPDATE orders SET status = ?, completedAt = ? WHERE id = ? AND userId = ?`)
                  .run(nextStatus, deliveredAt, orderId, userId);
                /**
                 * 🏁 **메모리에도 같이 적는다** — 장부에만 쓰면 재시작 전까지 화면이
                 * 하차 시각을 모른다. 그러면 사이클 경계(`deckOfCycle`)가 지난 운행의
                 * 완료분을 못 가른다 (「기억 갈라짐」 클래스 예방).
                 */
                (order as any).completedAt = deliveredAt;
                const cachedDone = session.pendingOrdersData.get(orderId);
                if (cachedDone && cachedDone !== (order as any)) (cachedDone as any).completedAt = deliveredAt;
            } else {
                db.prepare(`UPDATE orders SET status = ? WHERE id = ? AND userId = ?`)
                  .run(nextStatus, orderId, userId);
            }
        } catch (e) {
            console.error(`🚨 [마일스톤] DB 갱신 실패:`, e);
        }
    }

    // 예상과 실제의 오차를 남긴다. 쌓이면 상하차 소요 계수와 카카오 ETA 를 교정할 수 있다
    const err = timingError(predictedAt, occurredAt || nowIso);
    const errText = err === null ? '' : ` | 예상 대비 ${err > 0 ? `+${err}분 지연` : err < 0 ? `${-err}분 빠름` : '정시'}`;
    console.log(`📦 [${MILESTONE_LABEL[milestone]}] ${orderId.slice(0, 8)} (${source})${nextStatus ? ` → ${nextStatus}` : ''}${errText}`);
    logRoadmapEvent("서버", `[마일스톤] ${MILESTONE_LABEL[milestone]} 수신 (${source})${errText}`);

    // ④ 하차하면 그 짐은 더 이상 실려 있지 않다. 경로·잔여 용량·경유를 다시 계산한다.
    //    (recalculateActiveKakaoRoute 는 활성 콜이 0건이면 경유도 첫짐 모드로 되돌린다)
    if (milestone === 'DELIVERED') {
        // [T8] 착불인데 수령 여부를 안 고르고 완료했다면 **미수금으로 잡는다.**
        //
        // 기사님은 완료를 누르기 전에 현금을 받는다. 그래도 안 고르고 누를 수 있는데,
        // 그때 0 원으로 조용히 넘기면 **받지도 못한 돈이 정산된 것처럼 사라진다.**
        // 현장을 막지 않으면서(버튼을 강제하지 않는다) 기록만 안전한 쪽으로 남긴다.
        try {
            const row = db.prepare(`SELECT paymentType, fare, settlementStatus FROM orders WHERE id = ? AND userId = ?`)
                          .get(orderId, userId) as any;
            if (row?.paymentType === '착불' && (!row.settlementStatus || row.settlementStatus === '미정산')) {
                OrderRepository.setCodCollected(orderId, userId, false, row.fare ?? 0);
                console.warn(`💵 [착불 미확인] ${orderId.slice(0, 8)} — 수령 여부를 고르지 않고 하차 완료. ${(row.fare ?? 0).toLocaleString()}원을 미수금으로 잡습니다`);
                // 화면은 sync(orders 필드)로 안다 — 따로 정산 이벤트를 쏘지 않는다
            }
        } catch (e) {
            console.error(`🚨 [착불 확인 실패]`, e);
        }

        const remaining = getActiveCalls(session);
        await recalculateActiveKakaoRoute(userId, io);
        console.log(`🚚 [적재 회복] 하차 완료 → 남은 활성 콜 ${remaining.length}건 기준으로 필터 재계산`);

        /**
         * 🧭 타겟 자동 순환
         *
         * 🔴 **여기(DELIVERED 처리부)에 있는 이유**: "하차 완료로 끝난 사이클"에만 발동해야
         *    하는데, STANDBY 복귀 불변식은 취소·방출로 0건이 된 경우도 지나간다 — 거기서는
         *    끝난 건지 무산된 건지 모른다. 마일스톤이 원인을 아는 유일한 자리가 여기다.
         *
         * 자동은 **제안**이다 — setCallTarget 한 길로만 가고(파생 한 곳), 스와이프가 언제나 이긴다.
         */
        {
            const home = SettingsRepository.getHomeLocation(userId);
            const distToHome = (home && order.dropoffX != null && order.dropoffY != null)
                ? haversineKm(order.dropoffY, order.dropoffX, home.y, home.x)
                : null;
            /* 🔴 «쥔 콜 0건»으로 감싸지 않는다 — 복귀 끝은 0건이 아니라 «마지막 복귀콜을 집 가까이 내림»으로 안다 (#131) */
            const next = decideTargetAfterDelivery({
                current: session.activeFilter.callTarget,
                remainingCount: remaining.length,
                distToHomeKm: distToHome,
                deliveredHomeCall: homeCallsOf(session, userId, [order as any]).length > 0,
                homeCallsInProgress: homeCallsOf(session, userId, remaining).length,
            });
            if (next && next !== session.activeFilter.callTarget) {
                const from = session.activeFilter.callTarget ?? 'DEST';
                console.log(`🧭 [타겟 자동 순환] ${from} → ${next} (집까지 ${distToHome === null ? '모름' : distToHome.toFixed(1) + 'km'} · 남은 콜 ${remaining.length}건)`);
                await setCallTarget(userId, next, io, 'auto');
                console.log(`📤 [Socket 푸시] target-auto-switched (${from} → ${next})`);
                io.to(userId).emit("target-auto-switched", { from, to: next });
            }
        }
    }

    /**
     * 🔴 `filter-updated` 만 쏘면 **필터를 다시 파생시키지 않아** 낡은 값을 그대로 다시 보낸다.
     *
     *    기사님이 세운 기준: *"각 단계별로 값이 저장되면 거기에 따른 필터나
     *    관련 값들이 수정되어 전파되어야 한다."*
     *    그래서 모든 단계가 저장 뒤 필터를 다시 파생한다.
     *    단계마다 규칙이 다르면 어느 단계에서 무엇이 갱신되는지 아무도 못 외운다.
     *
     *    `updateActiveFilter` 가 불변식 재파생과 broadcast 를 함께 하므로 손으로 emit 하지 않는다.
     */
    updateActiveFilter(userId, {}, io);

    if (io) {
        io.to(userId).emit("sync-active-orders", buildOrderSync(session));
    }

    return { success: true, status: nextStatus ?? order.status };
}

/**
 * 🔴 **완료 이름은 하나다** — 둘을 두면 매출 집계가 다른 이름을 세어 오늘 매출이 0원으로 나온다.
 *
 * 콜의 끝은 마일스톤 `DELIVERED` → `ORDER_DELIVERED` 하나다.
 * `ORDER_COMPLETED`(정산 완료)는 **정산 페이지가 생길 때 거기서** 만든다 —
 * 기사님 결정: *"관제앱은 업무 단위, 정산은 관제앱에서 만들어진 데이터로 정산 페이지에서 따로."*
 */


/**
 * **타겟 전환** — 기사님이 필터의 복귀 토글로 지금 무엇을 콜 잡기할지 고른다.
 *
 *   DEST(노선행) ↔ HOME(복귀행) · 관내는 따로 재지 않는다 (목적지 가까이 옴 `filterArea.withNearness`)
 *
 * 🔴 전환은 **활성 콜을 완료로 만들지 않는다.**
 *    기사님: *"투트랙은 활성콜을 완료처리하는 것이 아니고 지금 상황에 맞는 콜을
 *    필터에 넣어야 한다는 거지. **콜은 무조건 배달을 해서 완료되어야 한다.**"*
 *    완료로 만들면 배달하지도 않은 콜이 완료로 기록돼 정산도 운행일지도 통째로 틀어진다.
 *    `destinationCity` 에 없는 도시 이름을 넣지도 않는다 — 그 값을 읽는 모든 곳이 함께 속는다.
 *
 * **이 함수는 필터만 바꾼다. 콜 상태는 건드리지 않는다.**
 * 적재 상태에서 파생되는 값(`dispatchPhase`·`isSharedMode`·허용 차종)도 건드리지 않는다 —
 * `updateActiveFilter` 가 활성 콜에서 매번 다시 구한다.
 */
export async function setCallTarget(
    userId: string,
    phase: CallTarget,
    io: any,
    /** 누가 바꾸나 — 기사님 버튼(`driver`) · 자동 순환(`auto`). `call_target_events` 에 함께 적는다 */
    by: 'driver' | 'auto',
): Promise<{ success: boolean; phase: CallTarget; city?: string; message?: string }> {
    try {
        const session = getUserSession(userId);
        console.log(`🧭 [국면 전환] ${session.activeFilter.callTarget ?? 'DEST'} → ${phase} (userId: ${userId})`);

        /**
         * 국면마다 **"어디로 가는 콜을 찾는가"만** 다르다.
         *
         * 🔴 여기서 반경(`destinationRadiusKm`)을 **정하지 않는다.**
         *
         * 여기서 `baseFilter.destinationRadiusKm` 을 실어 보내면 반경의 원천이 둘이 되어,
         * 전환할 때 기사님이 정한 반경이 평소값으로 덮인다. 반경은 `filterManager` 한 곳에서 나온다.
         */
        let city: string | null = null;

        if (phase === 'DEST') {
            /* 오늘 정한 목적지로 돌아간다 — 오늘값이 먼저, 없으면 평소값 */
            city = session.activeFilter.destinationCity
                || session.baseFilter.destinationCity
                || null;
            /**
             * 🔴 **관내로 따로 가르지 않는다** — `destinationCity` 를 «지금 있는 곳의 시»로 갈아치우면
             * 기사님이 정한 김포시가 성남시가 된다. 기사님:
             * *"우린 집으로 갈건지 말껀지만 있어"* · *"개선되어 중복인건 그냥 삭제 할꺼야."*
             *
             * 관내는 따로 재지 않는다 — **목적지는 그대로 둔 채**
             * «목적지 가까이 옴»(`filterArea.withNearness`)이면 현위치 영역 · 목적지 영역 전체를 쓴다.
             * 기사님 규칙은 그대로 산다: *"관내콜은 거리로 하지 말자.
             * 그냥 상차지와 하차지가 같은 시도에 있으면."*
             */
        } else {
            /**
             * 복귀행 = **집이 있는 시**. 집 주소는 설정에 있다.
             * 기점(짐이 남았으면 마지막 하차지 / 다 내렸으면 현위치)은 경유가 알아서 잡는다 —
             * 여기서는 "어디로 가는가"만 정한다.
             */
            const settings = db.prepare("SELECT home_address FROM user_settings WHERE user_id = ?").get(userId) as any;
            if (!settings?.home_address) {
                return { success: false, phase, message: '설정에 집 주소가 없습니다' };
            }
            /**
             * 🏠 **시는 좌표로 뽑는다**. 주소 글자에서 「시」를 찾던 코드는 기사님
             *    실제 주소(`경기도 광주 초월 동광뷰엘`)에서 **실패해 복귀를 못 켰다.**
             *    한 곳(`filterManager.homeCityOf`)이 좌표 → 시를 낸다 — `goalCityOf` 와 같은 답이다.
             */
            city = homeCityOf(userId);
            if (!city) {
                return { success: false, phase, message: `집 위치에서 시/군을 찾지 못했습니다 (${settings.home_address})` };
            }
        }

        /**
         * 입력만 넘긴다 — 키워드·별칭 같은 파생값은 `filterManager` 가 만든다.
         * (여기서 직접 채우면 `recalculateDerivedFields` 가 자기 계산을 건너뛰어
         *  `customCityFilters` 가 안 채워진다)
         */
        /**
         * 🔴 **`destinationCity` 를 안 보낸다** (전수 조사 ①-1).
         *    HOME 이면 집 시로 덮어쓰면 돌아올 때 원래 목적지가 없어진다 — 파주가 광주로 굳는다.
         *    그물이 향하는 시는 `filterManager.goalCityOf` 가 `callTarget` 에서 **파생**한다.
         *    위의 `city` 는 «집 주소에서 시를 뽑을 수 있나» 확인과 로그용으로만 남는다.
         */
        const prevTarget = session.activeFilter.callTarget ?? 'DEST';
        updateActiveFilter(userId, {
            callTarget: phase,
            isActive: true,
        }, io);
        /**
         * 🧭 **바꾼 일을 적는다** (#131 · `core/callTargetEvents.ts`) — 서버를 다시 띄워도 오늘 줄에서 복귀 켬을 되살린다.
         *    같은 값으로 다시 누르면 안 적는다. 관내(`LOCAL`)는 파생이라 표에 없다.
         */
        if (phase !== prevTarget && (phase === 'HOME' || phase === 'DEST')) recordCallTarget(userId, phase, by, Date.now());
        /**
         * 🕸️ **하차 · 상차 목록을 바로 다시 만든다** (하차 목록» ③ 시점).
         *    살아 있는 목적지(`goalCitiesOf`)와 목적지 상태(`goalZonesOf`)가 `callTarget` 에서 파생되는데,
         *    `updateActiveFilter` 는 이 전환으로 목록을 안 만든다 — 여기서 안 만들면 복귀를 꺼도
         *    원달앱 목록과 지도가 복귀 전 목록(«이천 ∪ 광주»)에 남는다.
         * 🔴 켠 시각을 적은 **뒤**에 만든다 — «복귀콜을 잡았나»(`homeCallsOf`)가 그 시각을 읽는다.
         */
        rebuildNetFilter(userId, io);

        console.log(`🧭 [국면 전환] 완료 → ${CALL_TARGET_LABEL[phase]} · 목적 ${city} ` +
            `(반경 ${session.activeFilter.destinationRadiusKm}km — 국면 설정에서) · ` +
            `콜 ${getActiveCalls(session).length}건 그대로`);

        return { success: true, phase, city: city! };
    } catch (e: any) {
        console.error("🧭 [국면 전환] 에러:", e);
        return { success: false, phase, message: e.message || "국면 전환 실패" };
    }
}

/**
 * 귀가콜 생성: 현재 위치 → 집 주소로 가상 오더 생성 + 경유 자동 세팅
 */
export async function createHomeReturn(
    userId: string, 
    io: any, 
    options?: { detourRadiusKm?: number; destinationRadiusKm?: number }
): Promise<{ success: boolean; orderId?: string; message?: string }> {
    try {
        const session = getUserSession(userId);
        const settings = db.prepare("SELECT home_address, home_x, home_y, vehicle_type FROM user_settings WHERE user_id = ?").get(userId) as any;

        if (!settings || !settings.home_address) {
            return { success: false, message: "집 주소가 설정되지 않았습니다. 설정에서 먼저 등록해주세요." };
        }
        if (!settings.home_x || !settings.home_y) {
            return { success: false, message: "집 주소의 좌표가 없습니다. 설정에서 📍위치 확인 후 다시 저장해주세요." };
        }

        const currentLoc = originOf(session);
        const pickupX = currentLoc?.x || settings.home_x;
        const pickupY = currentLoc?.y || settings.home_y;

        const homeOrder = {
            id: `home-${Date.now()}`,
            type: 'MANUAL' as const,
            pickup: '현재 위치',
            dropoff: settings.home_address,
            fare: 0,
            pickupX, pickupY,
            dropoffX: settings.home_x,
            dropoffY: settings.home_y,
            status: 'ORDER_CONFIRMED' as const,
            capturedDeviceId: 'control-tower',
            capturedAt: new Date().toISOString(),
            timestamp: new Date().toISOString(),
            vehicleType: settings.vehicle_type || '1t',
            receiptStatus: '귀가',
            itemDescription: '귀가 운행',
            tripType: '편도',
            orderForm: '보통',
            paymentType: '선불' as const,
            billingType: '무과세' as const,
            companyName: '자가 운행',
            dispatcherName: '관제탑 (자동생성)',
            isMock: false,
            isShared: false,
            commissionRate: '0%',
            tollFare: '0',
        };

        session.myOrders.push(homeOrder as any);
        await evaluateNewOrder(userId, homeOrder as any, io);
        // 🏠 귀가콜은 기사님이 직접 생성한 확정 콜이므로, 평가 후 AWAITING_DECISION으로 바뀐 상태를 ORDER_CONFIRMED로 즉시 복원
        homeOrder.status = 'ORDER_CONFIRMED';

        const targetDetour = options?.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM;
        updateActiveFilter(userId, {
            dispatchPhase: 'GATHERING',
            isSharedMode: true,
            isActive: true,
            detourRadiusKm: targetDetour,
        }, io);
        session.filterLine = getActivePolyline(session);   // 🛣️ 귀가콜도 확정 — 라인을 얼린다
        syncDetourFilter(userId, io);

        console.log(`🏠 [귀가콜] 가상 오더 생성 완료: ${settings.home_address}`);
        io.to(userId).emit("order-confirmed", homeOrder.id);

        return { success: true, orderId: homeOrder.id };
    } catch (e: any) {
        console.error("🏠 [귀가콜] 에러:", e);
        return { success: false, message: e.message || "귀가콜 생성 실패" };
    }
}
