import { decideNextTargetAfterCycle, mapVehicleToKakaoCarType, getRemainingCapacityTypes, deriveDispatchPhase, normalizeVehicleType,
         MILESTONE_TO_STATUS, MILESTONE_LABEL, canReportMilestone, timingError,
         RESTORABLE_STATUSES, IN_PROGRESS_STATUSES, UNFINISHED_RESTORE_DAYS, deriveStatusFromMilestones,
         restoreWindow, getEffectiveDetourRadius, DEFAULT_DETOUR_RADIUS_KM,
         CALL_TARGET_LABEL, scoreMerge, describeJudgment, TRUCK_CAPACITY_SLOTS, isEvaluating } from "@onedal/shared";
import type { SecuredOrder, AutoDispatchFilter, PricingConfig, PendingOrder, MyOrder,
              Milestone, MilestoneSource, CallTarget } from "@onedal/shared";
import { geocodeAddress, calculateSoloRoute, calculateDetourRoute, compareDirections } from "./kakaoService";
import { fetchRealWorldRoute } from "../routes/osrmUtil";
import { getUserSession, clearOrderTimers } from "../state/userSessionStore";
import { updateActiveFilter, rememberDetourProgress } from "../state/filterManager";
import { getDetourRegions, getCityRegionsWithRadius, reverseGeocodeToRegion, haversineKm } from "../services/geoService";
import { composeMergedRoute, applyRoute, applySoloRoute, pickRouteHolder, toKm, toMin, isAlreadyLoaded } from "./routeComposer";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../config/dispatchConfig";
import db from "../db";
import { incrementDeviceStats } from "../routes/devices";
import { OrderRepository } from "../repositories/OrderRepository";
import { PlaceRepository } from "../repositories/PlaceRepository";
import { SettingsRepository } from "../repositories/SettingsRepository";
import { PricingEngine } from "../core/engine/PricingEngine";
import { OrderEvaluator } from "../core/engine/OrderEvaluator";
import { StateMachine } from "../core/engine/StateMachine";
import { getActiveCalls, buildOrderSync, setOrderStatus, totalDetourCost, computeAllowedDetour } from "../core/helpers";

/**
 * 장소명 정규화 (공백 및 주식회사 텍스트 제거)
 * 예: "주식회사 레드 캠프" -> "레드캠프"
 */
export const normalizePlaceName = (name?: string) => {
    if (!name) return "배차값없음";
    return name.replace(/\(주\)|주식회사|\s/g, '').trim();
};



/** 기존 평가 중이던 콜을 외부에서 강제 삭제할 때 호출 */
export function forceCancelEvaluatingOrder(userId: string, orderId: string, io: any) {
    const session = getUserSession(userId);
    let targetDeviceId: string | undefined;

    /**
     * 🔴 **심사 중인 콜만 정리한다 — KEEP 된 콜은 절대 취소하지 않는다** (규칙 ①).
     *
     * 2026-08-19 실사고: KEEP 10초 뒤 앱이 리스트로 돌아가자 화면 이탈 감지가
     * 이 함수를 불렀고, **확정된 콜을 SAFE_CANCEL 로 덮어썼다.** 이탈 감지는
     * deviceEvaluatingMap 만 봤는데, 그 맵은 피기백 ACK 까지 남아 있어야 해서
     * KEEP 뒤에도 살아 있다 — 그러니 상태는 여기서 본다 (호출자 셋이 전부 거친다).
     * 맵은 지우지 않는다 — 지우면 아직 ACK 못 받은 판결이 배달되지 않는다 (규칙 ②).
     */
    const current = session.pendingOrdersData.get(orderId) ?? session.myOrders.find(o => o.id === orderId);
    if (current && !isEvaluating(current.status)) {
        console.log(`🛡️ [강제 정리 차단] ${orderId} 는 심사 중이 아니라 ${current.status} — 건드리지 않는다 (규칙 ①)`);
        return;
    }

    if (session.pendingOrdersData.has(orderId)) {
        const cached = session.pendingOrdersData.get(orderId)!;
        targetDeviceId = cached.capturedDeviceId;

        /**
         * 🔴 **강제 정리도 장부에 남긴다** (2026-08-18 실사고 — 송정동 → 고덕동)
         *
         * 앱이 확정 클릭 후 리스트로 이탈하자 이 함수가 콜을 지웠는데, DB 를 안 거쳐
         * **관제웹에서 "그냥 사라졌다."** 결재 취소는 저장하도록 고쳤으면서(②-2)
         * 이 경로를 빠뜨렸다. 취소 경로가 셋(화면 이탈·타임아웃·비상)인데
         * 저장은 결재 경로에만 있었다 — 아래 isActive 주석이 경고한 바로 그 형태다.
         *
         * 안전취소는 배차망 취소 횟수(10회)에 들어간다. 기사님이 몇 번 썼는지
         * 알려면 **한 건도 새면 안 된다** (용어집 §2-1). 캐시 삭제 전에 저장한다.
         */
        try {
            const isShared = getActiveCalls(session).length > 1 ? 1 : 0;
            const isExpress = (cached as any).orderForm === '급송' ? 1 : 0;
            OrderRepository.upsertOrder(cached as any, userId, isShared, isExpress);
            OrderRepository.updateOrderStatus(orderId, userId, 'SAFE_CANCEL');
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

    if (targetDeviceId) {
        incrementDeviceStats(targetDeviceId, "canceled");
        console.log(`   📈 기기(${targetDeviceId}) 취소 카운트 +1 반영 (reason: FORCE_CANCEL)`);
    }

    /**
     * 🔴 콜 잡기 재개(`isActive`)는 **여기서 하지 않는다.**
     *    `filterManager` 의 불변식이 "선점 중인 콜이 0건이면 켠다"로 파생시킨다 —
     *    취소 경로가 셋(화면 이탈·타임아웃·비상)인데 각자 켜면 하나를 빠뜨린다.
     *    실제로 2026-08-14 에 이 경로가 빠져 콜 잡기가 죽은 채로 남았다.
     */
    updateActiveFilter(userId, {}, io);
}

/** 취소/방출 등 메모리 변동 발생 시, 오더가 남아있다면 카카오 경로를 백그라운드에서 재탐색하여 폴리라인 및 소요시간을 복원합니다. */
export async function recalculateActiveKakaoRoute(userId: string, io: any) {
    const session = getUserSession(userId);

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
            //    합짐(composeMergedRoute)은 2026-08-13 에 고쳤는데 **여기가 빠져 있었다.**
            const res = await calculateSoloRoute(
                activeMain.pickupX!, activeMain.pickupY!,
                activeMain.dropoffX!, activeMain.dropoffY!,
                session.driverLocation,
                routingOptions.defaultPriority,
                routingOptions.carType,
                isAlreadyLoaded(activeMain),
            );
            applySoloRoute(activeMain, res);

            if (res.approachDistance && res.approachDuration) {
                console.log(`🗺️ [사후 재계산 - 첫짐] 현위치 접근: ${res.approachDistance}m (${res.approachDuration}초) / 총 이동: ${res.distance}m`);
            }
        } else {
            // 다중 오더 라우팅 (TSP) — 조립 규약은 routeComposer 한 곳에만 있다
            const result = await composeMergedRoute({
                calls: activeCalls,
                driverLocation: session.driverLocation,
                priority: routingOptions.defaultPriority,
                carType: routingOptions.carType,
            });
            if (!result) return;

            applyRoute(pickRouteHolder(activeCalls, activeMain), result.merged);

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
                session.driverLocation,
                priority || routingOptions.defaultPriority,
                routingOptions.carType,
                isAlreadyLoaded(securedOrder),
            );

            let paramLabel = "추천";
            if (priority === "TIME") paramLabel = "최단시간";
            if (priority === "DISTANCE") paramLabel = "최단거리";

            // routeComposer 규약으로 기록한다. 손으로 채우면 접근 구간이 또 버려진다
            // (이 파일에만 같은 기록 로직이 여섯 벌 있었다 — OrderEvaluator 포함)
            applySoloRoute(securedOrder, result);

            /**
             * 🔴 **두 기억을 함께 갱신한다** (2026-08-17 실측 사고).
             *
             * 여기의 securedOrder 는 pendingOrdersData(심사 캐시)의 사본인데, KEEP 된 콜의
             * 진실은 myOrders(활성)다. 사본에만 새 경로를 쓰면 — 지도는 남양주 우회를
             * 그리는데 경유 재계산(syncDetourFilter)은 myOrders 의 **옛(서울 통과) 폴리라인**을
             * 읽어 지역이 안 바뀌고, 앱은 서울 경로 동네로 계속 필터링한다.
             * (setOrderStatus 가 상태를 두 기억에 같이 쓰는 것과 같은 이유 — helpers 규칙)
             */
            const activeTwin = session.myOrders.find(c => c.id === orderId);
            if (activeTwin && (activeTwin as any) !== (securedOrder as any)) {
                applySoloRoute(activeTwin as any, result);
            }

            // [재탐색 ②] 예전에는 "[최단시간] 재탐색 완료" 만 표시해, 눌러도 무엇이 달라졌는지
            // 알 수 없었다. 합짐일 때만 수치가 나오고 단독일 때는 없었다.
            // 재탐색은 "어느 쪽이 유리한가"를 보려고 누르는 것이므로 결과 수치가 필수다.
            timeExt = `[${paramLabel}] ${securedOrder.kakaoSoloDistanceKm}km, ${securedOrder.kakaoSoloDurationMin}분`
                + (securedOrder.approachDurationMin ? ` (상차지까지 ${securedOrder.approachDurationMin}분)` : '');
        } else {
            const existingActive = getActiveCalls(session);
            const result = await composeMergedRoute({
                calls: existingActive,
                extra: securedOrder,
                driverLocation: session.driverLocation,
                priority: priority || routingOptions.defaultPriority,
                carType: routingOptions.carType,
            });
            if (!result) return { success: false, msg: "좌표가 있는 활성 콜이 없음" };

            // 병합 궤적은 "마지막 활성 콜"에 싣는다 (routeComposer 규약).
            const routeHolder = pickRouteHolder(existingActive, securedOrder);
            applyRoute(routeHolder, result.merged);
            mergedRouteHolder = routeHolder;

            let signDist = Number(result.distDiffKm) > 0 ? "+" : "";
            let signTime = Number(result.timeDiffMin) > 0 ? "+" : "";

            /**
             * 🔴 **색은 `shared/judgment.ts` 한 곳에서만 정한다** (2026-08-15).
             *
             * 예전에는 여기가 **자기 숫자**를 갖고 있었다 —
             *     `distDiffKm > 10 || timeDiffMin > 30  →  💩`
             * 최초 평가(`OrderEvaluator`)는 `60분 / 30km` 기준인데 여기는 `30분 / 10km` 였다.
             * **같은 콜이 재탐색만 해도 색이 바뀌었다.** 이 레포의 반복 실패(같은 판단 두 곳) 그대로다.
             */
            const reVerdict = scoreMerge({
                driveDiffMin: Number(result.timeDiffMin),
                detourKm: Number(result.distDiffKm),
                dwellMin: totalDetourCost(0, securedOrder.id, session.judgment.unknown).dwell,
                dwellAssumed: totalDetourCost(0, securedOrder.id, session.judgment.unknown).hasUnknown,
                detourBufferMin: computeAllowedDetour(userId, session, Date.now(), session.judgment.unknown,
                    { pickupOffsetMinutes: session.judgment.unknown.pickupOffsetMin,
                      restMarginMinutes: session.judgment.unknown.restMarginMin,
                              arrivalMarginMinutes: session.judgment.unknown.arrivalMarginMin }),
                slotsFree: Math.max(0, TRUCK_CAPACITY_SLOTS - (session.activeFilter.slotsUsed ?? 0)),
                slotsTotal: TRUCK_CAPACITY_SLOTS,
            }, session.judgment);   // 🎯 재탐색도 **같은** 기준을 읽는다
            const recommend = reVerdict.color === '꿀' ? "🍯 (꿀)"
                            : reVerdict.color === '보통' ? "🚙 (양호)" : "💩 (패널티 🚨)";
            console.log(`   - 🎯 [판정·재탐색] ${describeJudgment(reVerdict)}`);

            let paramLabel = "추천";
            if (priority === "TIME") paramLabel = "최단시간";
            if (priority === "DISTANCE") paramLabel = "최단거리";

            timeExt = `[${paramLabel}] ${signDist}${result.distDiffKm}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
        }

        logRoadmapEvent("서버", "재탐색 결과로 폴리라인 및 소요시간 갱신 연산");
        securedOrder.kakaoTimeExt = timeExt;
        const twin = session.myOrders.find(c => c.id === securedOrder.id);
        if (twin && (twin as any) !== (securedOrder as any)) twin.kakaoTimeExt = timeExt;   // 주기 sync 가 옛 문구로 되돌리지 않게

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
 * `recalculateDetourFilter` 는 **`state/filterManager` 로 옮겼다** (2026-08-14).
 *
 * 국면별 설정(§2-4)이 들어오면서 경유을 다시 그려야 하는 자리가 셋으로 늘었다 —
 * 관제탑 필터 저장 · **국면별 설정 저장** · **국면 전환**. 뒤의 둘은 `filterManager` 안이라
 * 여기(dispatchEngine)를 부르면 순환 참조가 된다. 그래서 함수를 아래(경계가 낮은 쪽)로 옮겼다.
 * 경유 계산은 이 레포에서 이미 **4벌**로 갈라진 적이 있다. 두 벌째를 만들지 않는다.
 */
export { recalculateDetourFilter } from "../state/filterManager";

export const syncDetourFilter = (userId: string, io: any) => {
    const session = getUserSession(userId);
    let polylineToUse = null;

    // 완료되지 않은 활성 콜만 추출하여 최신 폴리라인을 가져옵니다.
    const activeCalls = getActiveCalls(session);
    if (activeCalls.length > 0) {
        polylineToUse = activeCalls[activeCalls.length - 1]?.routePolyline;
    }

    /**
     * 🔴 2026-08-12 — 기사님이 손으로 고친 필터를 자동 갱신이 덮어쓰고 있었다.
     *
     * 관제웹은 수동 조작 때 `userOverrides: true` 를 보내는데 **서버가 한 번도 안 읽었다.**
     * 타입 주석에 "서버 덮어쓰기 방지용"이라 적혀 있는데 방지가 안 됐다 —
     * 경유을 손으로 좁혀 놔도 다음 경로 갱신 한 번에 되돌아갔다.
     *
     * 조용히 넘어가지 않는다. 고정됐다는 사실을 로그와 화면에 남긴다.
     * (콜 잡기 사이클이 끝나 STANDBY 로 돌아가면 baseFilter 로 리셋되며 자동 해제된다)
     */
    if (session.activeFilter.userOverrides) {
        console.log(`🔒 [경유 고정] 기사님이 손으로 고친 필터라 자동 갱신을 건너뜁니다 ` +
            `(키워드 ${(session.activeFilter.destinationKeywords || []).length}개 유지)`);
        return;
    }

    if (polylineToUse && polylineToUse.length > 0) {
        /**
         * 🔴 `getEffectiveDetourRadius` 는 정의만 되어 있고 **호출하는 곳이 없었다.**
         *    "이 함수를 통해서만 detourRadiusKm 를 결정하므로 하드코딩이 원천 차단됩니다"
         *    라는 주석이 붙어 있었는데, 정작 여기서 `?? 10` 을 직접 쓰고 있었다.
         *    그래서 **운행 중(DELIVERING)에도 경유이 안 좁혀졌다** — 우회 금지가 안 걸린 것이다.
         */
        const cRadius = getEffectiveDetourRadius(
            session.activeFilter.dispatchPhase ?? 'STANDBY',
            session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM,
        );
        const dRadius = session.activeFilter.destinationRadiusKm;
        const regions = getDetourRegions(polylineToUse, cRadius, dRadius);

        if (regions && regions.flat.length > 0) {
            // 🔴 진행도를 **키워드보다 먼저** 기억한다. updateActiveFilter 의 파생 계산 끝에서
            //    지나온 구간을 빼는데, 그때 옛 진행도가 남아 있으면 엉뚱한 동이 사라진다
            rememberDetourProgress(session, regions);
            updateActiveFilter(userId, {
                destinationKeywords: regions.flat,
                destinationGroups: regions.grouped,
                customCityFilters: regions.customCityFilters
            }, io);
        }
    }
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

    const isKeep = status === 'ORDER_CONFIRMED';
    const piggybackAction = isKeep ? 'KEEP' : 'CANCEL';

    // [Option B] Piggyback 결재 기록: pendingDecisions에 action을 기록하면
    // 다음 1.0초 텔레메트리(/scrap) 응답에 이 결재가 태워져서 앱으로 전달됩니다.
    if (session.pendingDecisions.has(orderId)) {
        const decisionData = session.pendingDecisions.get(orderId)!;
        decisionData.action = piggybackAction;
        if (isKeep) logRoadmapEvent("서버", "앱폰에게 Action=Keep 최종 판결 Piggyback 등록");
        else logRoadmapEvent("서버", "앱폰에게 Action=Cancel 최종 판결 Piggyback 등록");
        console.log(`📦 [Piggyback V2] 관제탑 판결(${piggybackAction})을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: ${orderId})`);
    } else {
        // pendingDecisions에 없는 경우 (이미 타임아웃으로 삭제되었거나, MANUAL 건)
        if (isKeep) logRoadmapEvent("서버", "앱폰에게 Action=Keep 최종 판결 응답 전달 (즉시)");
        else logRoadmapEvent("서버", "앱폰에게 Action=Cancel 최종 판결 응답 전달 (즉시)");
        console.log(`⚠️ [Piggyback V2] pendingDecisions에 ${orderId}가 없습니다. (MANUAL 건이거나 이미 타임아웃 처리됨)`);
    }

    // [Piggyback V2] deviceEvaluatingMap은 여기서 절대 삭제하지 않습니다!
    // KEEP이든 CANCEL이든 앱이 다음 /scrap 폴링으로 decision을 가져가야 하므로
    // scrap.ts → deviceEvaluatingMap.get(deviceId) 조회가 성공해야 합니다.
    // 실제 삭제는 scrap.ts의 ACK 처리 블록에서만 수행합니다.

    const targetDeviceId = session.pendingOrdersData.get(orderId)?.capturedDeviceId;

    // 삭제됨: 중복된 !isKeep 로직은 하단의 else 블록으로 통합되었습니다.

    if (isKeep) {
        logRoadmapEvent("서버", "관제탑으로 부터 Keep 결재 요청 받음");
        const cachedOrder = session.pendingOrdersData.get(orderId);

        if (!cachedOrder) return { success: false, action: status };

        // [V2 핵심] PendingOrder → MyOrder 승격 (심사 완료 → 내 퀵 확정)
        const confirmedOrder: MyOrder = {
            ...cachedOrder,
            status: 'ORDER_CONFIRMED',
        };
        // phase는 PendingOrder 전용이므로 제거
        delete (confirmedOrder as any).phase;

        // ⭐ 핵심 수정: 승격된 객체를 하트비트 메모리맵에 덮어씌워서 롤백 현상 방지
        session.pendingOrdersData.set(orderId, confirmedOrder as any);

        const isAlreadyIncluded = session.myOrders.some(c => c.id === orderId);

        if (!isAlreadyIncluded) {
            logRoadmapEvent("서버", "해당 콜을 '내 퀵(myOrders)' 배열에 추가 및 병합 궤적 생성 연산");
            session.myOrders.push(confirmedOrder);
            
            try {
                const hasApiKey = !!process.env.KAKAO_REST_API_KEY;
                if (hasApiKey) {
                    const activeCalls = getActiveCalls(session);
                    if (activeCalls.length > 0) {
                        const activeMain = activeCalls[0];
                        const activeSubs = activeCalls.slice(1);
                        
                        if (activeSubs.length > 0) {
                            const routingOptions = SettingsRepository.getKakaoRoutingOptions(userId);
                            const calcResult = await composeMergedRoute({
                                calls: activeCalls,
                                driverLocation: session.driverLocation,
                                priority: routingOptions.defaultPriority,
                                carType: routingOptions.carType,
                            });
                            if (calcResult) {
                                applyRoute(pickRouteHolder(activeCalls, activeMain), calcResult.merged);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('🗺️ [사후 병합 궤적 생성 실패]', e);
            }
        }

        // ✅ mainCallState/subCalls 할당 완료 후 경유 재계산 (경로 기반 키워드 갱신)
        let destinationKeywords = session.activeFilter.destinationKeywords;
        if (cachedOrder && cachedOrder.routePolyline) {
            syncDetourFilter(userId, io);
            destinationKeywords = session.activeFilter.destinationKeywords;
            console.log(`🗺️ [경유 갱신] KEEP 후 destinationKeywords ${destinationKeywords.length}개로 재계산 완료`);
        }

        // DB에 영구 저장 (status: confirmed) 및 places/orderStops 기록 (v5 스키마)
        try {
            // [이슈 R] isShared는 "필터가 합짐 모드였는가"가 아니라
            // "이 콜을 잡을 때 이미 실린 짐이 있었는가"로 판정한다.
            //
            // 이전에는 session.activeFilter.isSharedMode를 그대로 썼는데,
            // 필터 상태는 서버 재시작 등으로 실제와 어긋날 수 있어(이슈 W)
            // 명백한 합짐 콜이 isShared=0으로 기록되는 일이 있었다.
            // (실측: Waypoints 2개로 우회 연산까지 했는데 DB에는 단독으로 남음)
            //
            // 이 시점에는 confirmedOrder가 이미 myOrders에 push된 뒤이므로,
            // 활성 콜이 2건 이상이면 앞선 짐이 있었다는 뜻 = 합짐이다.
            const isShared = getActiveCalls(session).length > 1 ? 1 : 0;
            // isExpress: 파서가 추출한 orderForm이 "급송"이면 true
            const isExpress = (cachedOrder.orderForm === '급송') ? 1 : 0;

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
        } catch (dbErr) {
            console.error("DB 저장 에러:", dbErr);
        }

        logRoadmapEvent("서버", "관제탑에게 확정되었음(order-confirmed) 정보 전달");
        io.to(userId).emit("order-confirmed", orderId);

        logRoadmapEvent("서버", "합짐을 위한 반경/목적지 추천 키워드로 다이나믹 필터 생성 연산");

        // ━━━ 3단계 State Machine 적용 ━━━
        // 합짐 차종: [내 차 용량 − 확정된 콜 전부의 용량]으로 남은 적재 가능 차종을 추론한다.
        //
        // [Phase 3 / 이슈 S] 이전에는 getSharedModeVehicleTypes(첫 짐 차종) 하나만 보고
        // "첫 짐 이하 등급"을 반환했다. 그 결과 오토바이급(가장 작은) 콜을 잡으면
        // 허용 차종이 [오토바이] 하나로 줄어 합짐 콜 잡기가 사실상 정지했다.
        // 짐이 작을수록 공간이 더 남는데 범위가 좁아지는 역설이었다.
        // 이제 내 차 용량에서 실제 적재분을 빼서 계산한다.
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

        const transition = StateMachine.advanceOnKeep(session, cachedOrder, destinationKeywords, sharedVehicleTypes);
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

        /**
         * 🔴 **버린 콜도 장부에 남긴다** (기사님 2026-08-18)
         *
         * 예전에는 `myOrders` 에 있는 콜만 저장했다 — 즉 **KEEP 한 뒤 버린 것만** 남고,
         * 심사 중에 버린 안전취소는 행이 없는 채로 `UPDATE` 가 0행에 적용돼 조용히 사라졌다.
         * 3개월치 백업에도 `SAFE_CANCEL` 이 **0건**이었다.
         *
         * 화면(취소 탭)에는 보였는데 그건 세션 메모리라 **서버를 재시작하면 없어진다.**
         * 기사님: *"인성 입장에선 내가 잡았다 버린 거니 10회 페널티에 들어간다.
         *          내가 알고 있어야 한다."*
         *
         * → 행이 없으면 **만들고** 상태를 준다. 순서가 중요하다 —
         *   `upsertOrder` 는 항상 `ORDER_CONFIRMED` 로 넣으므로 그 뒤에 진짜 상태를 덮는다.
         */
        const cachedForLedger = session.myOrders.find(c => c.id === orderId)
            ?? session.pendingOrdersData.get(orderId);
        if (cachedForLedger) {
            try {
                const isShared = getActiveCalls(session).length > 1 ? 1 : 0;
                const isExpress = (cachedForLedger as any).orderForm === '급송' ? 1 : 0;
                OrderRepository.upsertOrder(cachedForLedger as any, userId, isShared, isExpress);
                OrderRepository.updateOrderStatus(orderId, userId, status);
                console.log(`✅ [상태 동기화] ${orderId} - DB 업데이트 완료 (상태: ${status})`);
            } catch (e) {
                console.error("DB 업데이트 에러:", e);
            }
        }

        if (targetDeviceId) {
            incrementDeviceStats(targetDeviceId, "canceled");
            console.log(`   📈 기기(${targetDeviceId}) 취소 카운트 +1 반영 (reason: DECISION_CANCEL)`);
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

    console.log(`🛡️ [서버] 결재 완료(Keep/Cancel) 직후: 캐시 된 해당 오더(${orderId}) 메모리의 생명주기(TTL) 만료 및 가비지 컬렉션(GC) 삭제 처리 완료`);
    return { success: true, action: status };
}

/** [필수#1] 최초 오더 평가: 지오코딩 + 카카오 경로 연산 + 꿀/콜/똥 판정 (detail.ts에서 추출) */
export async function evaluateNewOrder(userId: string, securedOrder: SecuredOrder | PendingOrder, io: any, targetApp: string = 'insung') {
    const evaluator = new OrderEvaluator(targetApp);
    await evaluator.evaluate(userId, securedOrder, io);
}

/**
 * [Phase 6] 로그인·소켓 접속 시 실행되는 **단일 부트스트랩 시퀀스**.
 *
 * 예전에는 이 과정이 세 군데로 흩어져 각자 다른 시점에 돌았다.
 *   getUserSession(동기·DB로드+지리연산) / restoreAndRecalculateSession(비동기) / syncDetourFilter
 * 소켓 핸들러가 복구를 await 하지 않고 곧바로 filter-init 을 쏘는 바람에
 *   ① 앱폰이 1~3초간 "첫짐 필터(경유 없음)"를 받아 경로 이탈 콜을 잡을 수 있었고
 *   ② 관제탑은 첫짐 → 합짐으로 깜빡였으며
 *   ③ destinationKeywords 를 4곳이 각자 만들어 진실 공급원이 없었다.
 *
 * 이제 아래 순서를 한 함수가 책임진다. **⑥ 이전에는 앱폰에 콜 잡기를 시키지 않는다.**
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
         * [2026-08-12] 예전에는 주소·좌표를 코드에 박은 임시 파일을 썼는데,
         * 기사님이 이미 설정에 같은 주소를 지오코딩까지 해서 넣어 둔 상태였다.
         * 있는 값을 쓰면 임시 코드가 필요 없고, 이사하면 설정만 바꾸면 된다.
         *
         * **GPS 가 들어오면 그 값이 언제나 이긴다** (dashboard-gps-update).
         * 추정으로 계산했다는 사실은 `driverLocationIsFallback` 으로 숨기지 않는다.
         */
        if (!session.driverLocation) {
            const home = SettingsRepository.getHomeLocation(userId);
            if (home) {
                session.driverLocation = { x: home.x, y: home.y };
                session.driverLocationIsFallback = true;
                console.log(`📍 [출발지 대체] GPS 미수신 — 내 주소(${home.address}) 기준으로 경로를 계산합니다`);
            } else {
                console.warn(`⚠️ [출발지 없음] GPS 도 내 주소도 없습니다 — 접근 구간을 계산할 수 없습니다 (설정에서 내 주소를 넣어 주세요)`);
            }
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
            phaseSettings: session.phaseSettings,
            basePhaseSettings: session.basePhaseSettings,
        });
    }
}

/**
 * **`destinationKeywords` 를 만드는 유일한 함수.**
 *
 * 예전에는 이 값을 네 군데(userSessionStore 세션 생성 / 부트스트랩 / syncDetourFilter /
 * 필터 변경)가 각자 만들었고, 그래서 "지금 어느 지역을 콜 잡는 중인가"에 대한 답이
 * 호출 순서에 따라 달라졌다. 이제 갈래는 여기 하나뿐이다.
 *
 *   활성 콜 있음 → 주행 경로 주변 경유 (syncDetourFilter)
 *   활성 콜 없음 → 기사님이 설정한 destinationCity + 반경
 *
 * 특히 **마지막 콜을 취소해 활성 0건이 됐을 때**가 중요하다. 예전에는
 * recalculateActiveKakaoRoute 가 `activeCalls.length === 0`이면 곧바로 return 해서
 * 경유 키워드가 그대로 남았고, 첫짐 모드로 돌아왔는데도 옛 경로 주변만 콜 잡기했다.
 */
export function rebuildDestinationKeywords(userId: string, io: any): void {
    const session = getUserSession(userId);

    if (getActiveCalls(session).length > 0) {
        syncDetourFilter(userId, io);
        return;
    }

    const city = session.activeFilter.destinationCity || '';
    if (!city) {
        updateActiveFilter(userId, { destinationKeywords: [], destinationGroups: {} }, io);
        return;
    }

    const { flat, grouped } = getCityRegionsWithRadius(city, session.activeFilter.destinationRadiusKm || 0);
    updateActiveFilter(userId, { destinationKeywords: flat, destinationGroups: grouped }, io);
    console.log(`🗺️ [키워드 재구성] 첫짐 모드 — '${city}' 기준 ${flat.length}개`);
}

/**
 * [방안 1] 서버 재시작 시 DB에서 콜을 불러와 1회성 카카오 궤적 복구 연산
 * ⚠️ 직접 호출하지 말 것 — bootstrapUserSession() 을 통해서만 실행된다.
 */
/** 장부의 도착 마일스톤을 콜 객체 칸으로 되살린다 — 재시작해도 다녀온 곳을 기억하게 */
function hydrateVisitedStops(orderId: string): { arrivedPickupAt?: string; arrivedDropoffAt?: string } {
    const rows = OrderRepository.getMilestones(orderId) as { milestone: string; occurredAt: string }[];
    const at = (m: string) => rows.find(r => r.milestone === m)?.occurredAt;
    return {
        arrivedPickupAt: at('ARRIVED_PICKUP'),
        arrivedDropoffAt: at('ARRIVED_DROPOFF'),
    };
}

export async function restoreAndRecalculateSession(userId: string, io: any) {
    const session = getUserSession(userId);
    if (session.isRestored) return; // 이미 복구했으면 스킵
    session.isRestored = true;

    try {
        const { todayStartIso, unfinishedSinceIso } = restoreWindow(Date.now());

        // 1. orders와 places 테이블을 조인하여 복구 대상 콜과 X, Y 좌표를 불러옵니다.
        //
        // 🔴 상태 목록을 여기 손으로 적지 않는다 (2026-08-11).
        //    예전에는 5개를 나열해 뒀는데 Phase 8.3 이 만든 ORDER_PICKED_UP · ORDER_DELIVERED
        //    가 빠져서 **짐을 실은 채 새로고침하면 콜이 사라졌다.**
        //    이제 shared 의 RESTORABLE_STATUSES 한 곳에서만 정한다.
        //
        // [임시 · Phase 7 도입 시 삭제] 미완료 콜은 날짜 무관(3일 상한)으로 되살린다.
        //    `timestamp >= 오늘 자정` 만 쓰면 **전날 상차한 콜이 사라져서**
        //    전날 상차 → 다음날 배송하는 운행이 통째로 깨진다.
        //    종결 콜은 지금처럼 오늘 것만 — 목록이 무한정 길어질 이유가 없다.
        const statusPlaceholders = RESTORABLE_STATUSES.map(() => '?').join(', ');
        const progressPlaceholders = IN_PROGRESS_STATUSES.map(() => '?').join(', ');
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
              AND ( o.timestamp >= ?
                    OR (o.status IN (${progressPlaceholders}) AND o.timestamp >= ?) )
            ORDER BY o.timestamp ASC
        `).all(
            userId, ...RESTORABLE_STATUSES,
            todayStartIso,
            ...IN_PROGRESS_STATUSES, unfinishedSinceIso,
        ) as any[];

        // 🔴 상한을 넘겨 **빠진** 미완료 콜은 조용히 사라지게 두지 않는다.
        //    기사님이 모르는 채로 콜을 잃는 것이 2026-08-11 사고의 본질이었다.
        //    같은 실패 방식을 상한 하나 두면서 새로 만들 수는 없다.
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
                capturedDeviceId: row.capturedDeviceId,
                vehicleType: row.vehicleType,
                distanceKm: row.distanceKm,
                totalDistanceKm: row.totalDistanceKm,
                totalDurationMin: row.totalDurationMin,
                kakaoSoloDistanceKm: row.kakaoSoloDistanceKm,
                kakaoSoloDurationMin: row.kakaoSoloDurationMin,
                kakaoTimeExt: row.kakaoTimeExt,
                pickupX: row.pickupX,
                pickupY: row.pickupY,
                dropoffX: row.dropoffX,
                dropoffY: row.dropoffY,
                // [T8] 착불 여부가 복구에서 빠져 있었다 — 재접속 직후 착불 표시가 사라진다
                paymentType: row.paymentType,
                isShared: !!row.isShared,
                isExpress: !!row.isExpress,
                orderForm: row.orderForm,
                detailMemo: row.detailMemo,
                /**
                 * 🚏 **도착 시각을 되살린다** (2026-08-19).
                 * 안 되살리면 재시작 직후 `hasVisitedStop` 이 false 가 되어
                 * **이미 다녀온 정거장으로 되돌아가는 경로**가 다시 그려진다.
                 */
                ...hydrateVisitedStops(row.id),
            };
            session.pendingOrdersData.set(order.id, order as any);
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
            try {
                // 🔴 복구도 마찬가지다 — 상차하고 달리다 **새로고침만 해도** 경로가 상차지로
                //    되돌아가던 자리다 (2026-08-14).
                const res = await calculateSoloRoute(
                    activeMain.pickupX, activeMain.pickupY!,
                    activeMain.dropoffX, activeMain.dropoffY!,
                    session.driverLocation,
                    routingOptions.defaultPriority,
                    routingOptions.carType,
                    isAlreadyLoaded(activeMain),
                );
                // 🔴 2026-08-12 — 여기가 **폴리라인과 ETA 두 개만 손으로** 쓰고 있었다.
                //    카카오에는 현위치를 넣어 제대로 물어보고(origin=...) 답도 받아 놓고서
                //    `approachDuration` · `kakaoSolo*` · `totalDistanceKm` 를 통째로 버렸다.
                //    그래서 **재접속하면 접근 구간이 늘 '모름'** 이었다 —
                //    통화에서 "몇 시까지 갈 수 있다"를 말할 수가 없었던 직접 원인이다.
                //
                //    2026-08-10 에 같은 실수(QQ)를 OrderEvaluator·재탐색에서 고치면서
                //    기록 규약을 `applySoloRoute` 한 곳으로 모았는데, **복구 경로만 빠져 있었다.**
                //    손으로 쓰지 않는다.
                applySoloRoute(activeMain, res);   // sectionEtas 도 여기서 함께 기록된다

                if (res.approachDuration) {
                    console.log(`🗺️ [복구 - 접근 구간] ${session.driverLocationIsFallback ? '임시 출발지' : '현위치'} → 상차지 ` +
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
                    driverLocation: session.driverLocation,
                    priority: routingOptions.defaultPriority,
                    carType: routingOptions.carType,
                });
                // myOrders 에는 종료된 콜도 함께 로드되므로 반드시 활성 콜 기준으로 잡아야 한다.
                if (calcResult) applyRoute(pickRouteHolder(activeCalls, activeMain), calcResult.merged);
            } catch(e) {
                console.error('🗺️ [합짐 복구 연산 실패]', e);
            }
        }

        logRoadmapEvent("서버", `[Session DB Load] 궤적 복구 연산 완료. 클라이언트로 sync-active-orders 강제 전송`);

        // 5. [이슈 W] 복구된 데이터로부터 배차 상태를 다시 "파생"시킨다.
        //
        // 이전에는 myOrders와 궤적만 복구하고 activeFilter는 손대지 않아,
        // 진행 중인 콜이 3건 있는데도 필터는 STANDBY(첫짐) / isSharedMode=false 인
        // 상태로 콜 잡기가 계속되었다. 그 결과
        //   - OrderEvaluator가 도착지 경유 검사를 건너뛰어 경로 이탈 콜도 통과
        //   - 첫짐 절대하한가(minFare)가 잘못 적용
        //   - 남은 적재 공간을 무시한 차종 허용 (라보 2건 만재여도 1t 콜을 잡으러 감)
        //   - KEEP 시 isShared=0 으로 기록되어 통계 왜곡 (이슈 R)
        //
        // 상태를 따로 저장했다가 되살리는 대신 **데이터에서 매번 파생**시킨다.
        // 저장된 상태는 실제와 어긋날 수 있지만 파생값은 어긋날 수 없다.
        //
        // ⚠️ 2026-08-11 — 여기 원래 "(복구 쿼리가 오늘 것만 가져오므로 어제 상태가
        //    살아날 우려도 없다)" 고 적혀 있었다. **T5 로 그 전제가 깨졌다** —
        //    미완료 콜은 이제 3일까지 되살아난다.
        //    그래도 안전한 이유는 전제가 아니라 **파생**이다: 아래 상태는 전부
        //    `getActiveCalls(session)` 에서 매번 다시 구하므로, 며칠 전 콜이 섞여 들어와도
        //    "지금 실려 있는 콜"이 진실인 것은 변하지 않는다.
        //    (전제에 기대는 코드가 더 있는지 확인했고 이 블록이 유일했다)
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
 * [Phase 8.2] 상차/하차 보고를 받는 **유일한 진입점**.
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
 *              경로 재계산이 잔여 용량과 경유을 다시 넓혀 준다
 *   ⑤ 출처 기록 나중에 자동 감지 정확도를 측정할 유일한 근거
 */
/**
 * 잘못 누른 마일스톤을 되돌린다.
 *
 * 상태를 손으로 되돌리지 않는다 — 지우고 나서 **남은 마일스톤으로 다시 파생**시킨다.
 * (`deriveStatusFromMilestones`) 취소 경로마다 목표 상태를 정하면 그 규칙들이 갈라진다.
 */
export async function undoMilestone(userId: string, orderId: string, milestone: Milestone, io: any) {
    const session = getUserSession(userId);
    const removed = OrderRepository.deleteMilestone(orderId, userId, milestone);
    if (!removed) return { success: false, reason: 'NOT_FOUND' as const };

    // 🚏 도착을 되돌리면 "다녀왔다"도 되돌린다 — 안 지우면 경로에서 영영 빠진 채 남는다
    const undoField = milestone === 'ARRIVED_PICKUP' ? 'arrivedPickupAt'
                    : milestone === 'ARRIVED_DROPOFF' ? 'arrivedDropoffAt' : null;
    if (undoField) {
        const o = session.myOrders.find(c => c.id === orderId);
        if (o) delete (o as any)[undoField];
        const cached = session.pendingOrdersData.get(orderId);
        if (cached) delete (cached as any)[undoField];
    }

    const rest = OrderRepository.getMilestones(orderId) as { milestone: string }[];
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
        console.log(`📤 [Socket 푸시] milestone-log (${orderId.slice(0, 8)})`);
        io.to(userId).emit("milestone-log", { orderId, milestones: OrderRepository.getMilestones(orderId) });
    }
    return { success: true, status };
}

export async function reportMilestone(
    userId: string,
    orderId: string,
    milestone: Milestone,
    source: MilestoneSource,
    io: any,
    occurredAt?: string,
    /** 이 시점에 우리가 예상했던 시각. 오차를 재기 위해 함께 저장한다 */
    predictedAt?: string,
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
    // ① 멱등성은 DB UNIQUE 로 보장한다. 애플리케이션 체크만 두면 동시 요청에서 뚫린다
    const insert = db.prepare(`
        INSERT OR IGNORE INTO order_milestones (orderId, userId, milestone, source, occurredAt, predictedAt, recordedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(orderId, userId, milestone, source, occurredAt || nowIso, predictedAt || null, nowIso);

    if (insert.changes === 0) {
        console.log(`🔁 [마일스톤] ${milestone} (${source}) 중복 — ${orderId} 는 이미 기록됨`);
        return { success: true, duplicated: true, status: order.status };
    }

    /**
     * 🚏 **도착 시각을 콜 객체에도 남긴다** (2026-08-19).
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
                db.prepare(`UPDATE orders SET status = ?, completedAt = ? WHERE id = ? AND userId = ?`)
                  .run(nextStatus, occurredAt || nowIso, orderId, userId);
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

    // ④ 하차하면 그 짐은 더 이상 실려 있지 않다. 경로·잔여 용량·경유을 다시 계산한다.
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
                io?.to(userId).emit("settlement-updated", {
                    orderId, ...OrderRepository.getSettlement(orderId), autoMarked: true,
                });
            }
        } catch (e) {
            console.error(`🚨 [착불 확인 실패]`, e);
        }

        const remaining = getActiveCalls(session);
        await recalculateActiveKakaoRoute(userId, io);
        console.log(`🚚 [적재 회복] 하차 완료 → 남은 활성 콜 ${remaining.length}건 기준으로 필터 재계산`);

        /**
         * 🧭 타겟 자동 순환 (기사님 확정 2026-08-17 — docs/타겟_자동순환_계획.md)
         *
         * 🔴 **여기(DELIVERED 처리부)에 있는 이유**: "하차 완료로 끝난 사이클"에만 발동해야
         *    하는데, STANDBY 복귀 불변식은 취소·방출로 0건이 된 경우도 지나간다 — 거기서는
         *    끝난 건지 무산된 건지 모른다. 마일스톤이 원인을 아는 유일한 자리가 여기다.
         *
         * 자동은 **제안**이다 — setCallTarget 한 길로만 가고(파생 한 곳), 스와이프가 언제나 이긴다.
         */
        if (remaining.length === 0) {
            const home = SettingsRepository.getHomeLocation(userId);
            const distToHome = (home && order.dropoffX != null && order.dropoffY != null)
                ? haversineKm(order.dropoffY, order.dropoffX, home.y, home.x)
                : null;
            const next = decideNextTargetAfterCycle(session.activeFilter.callTarget, distToHome);
            if (next && next !== session.activeFilter.callTarget) {
                const from = session.activeFilter.callTarget ?? 'DEST';
                console.log(`🧭 [타겟 자동 순환] ${from} → ${next} (집까지 ${distToHome === null ? '모름' : distToHome.toFixed(1) + 'km'})`);
                await setCallTarget(userId, next, io);
                console.log(`📤 [Socket 푸시] target-auto-switched (${from} → ${next})`);
                io.to(userId).emit("target-auto-switched", { from, to: next });
            }
        }
    }

    /**
     * 🔴 2026-08-12 — 여기서 `filter-updated` 를 쏘긴 했는데 **필터를 다시 파생시키지는 않았다.**
     *    그래서 옛 값을 그대로 다시 보내고 있었다.
     *
     *    기사님이 세운 기준: *"각 단계별로 값이 저장되면 거기에 따른 필터나
     *    관련 값들이 수정되어 전파되어야 한다."*
     *    통화·현장 저장(`save-cargo-report`)은 T4 에서 재파생을 걸었는데
     *    **마일스톤 4종은 DELIVERED 만** 재계산되고 나머지 셋은 빠져 있었다.
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
 * 🔴 **`completeOrder` 를 지웠다** (2026-08-14).
 *
 * 닿는 길이 `dispatch-complete` 소켓 하나뿐이었는데 **그 이벤트를 쏘는 곳이 없었다** —
 * 태어날 때부터 죽어 있었다. 그런데 죽은 채로 `ORDER_COMPLETED` 라는 **두 번째 완료 이름**을
 * 남겨 두었고, 매출 집계가 하필 그 이름을 세는 바람에 **오늘 매출이 0원으로 나왔다.**
 *
 * 콜의 끝은 마일스톤 `DELIVERED` → `ORDER_DELIVERED` 하나다.
 * `ORDER_COMPLETED`(정산 완료)는 **정산 페이지가 생길 때 거기서** 만든다 —
 * 기사님 결정: *"관제앱은 업무 단위, 정산은 관제앱에서 만들어진 데이터로 정산 페이지에서 따로."*
 */


/**
 * **국면 전환** — 기사님이 요약줄을 스와이프해서 지금 무엇을 콜 잡기할지 고른다.
 *
 *   DEST(노선행) → LOCAL(이 동네에서 찾기) → HOME(복귀행)
 *
 * 🔴 2026-08-13 — 이 함수가 `startTwoTrack` 을 대체한다.
 *
 *    옛 함수는 전환하면서 **활성 콜을 전부 `ORDER_COMPLETED` 로 만들었다.**
 *    기사님: *"투트랙은 활성콜을 완료처리하는 것이 아니고 지금 상황에 맞는 콜을
 *    필터에 넣어야 한다는 거지. **콜은 무조건 배달을 해서 완료되어야 한다.**"*
 *    짐을 싣고 가는 중에 눌렀다면 배달하지도 않은 콜이 완료로 기록됐다 —
 *    정산도 운행일지도 통째로 틀어진다.
 *
 *    또 `destinationCity` 에 `'🎯 투-트랙 탐색'` 이라는 **없는 도시 이름**을 넣었다.
 *    그 값을 읽는 모든 곳(지리 연산·화면 표시)이 함께 속는다.
 *
 * **이 함수는 필터만 바꾼다. 콜 상태는 건드리지 않는다.**
 * 적재 상태에서 파생되는 값(`dispatchPhase`·`isSharedMode`·허용 차종)도 건드리지 않는다 —
 * `updateActiveFilter` 가 활성 콜에서 매번 다시 구한다.
 */
export async function setCallTarget(
    userId: string,
    phase: CallTarget,
    io: any
): Promise<{ success: boolean; phase: CallTarget; city?: string; message?: string }> {
    try {
        const session = getUserSession(userId);
        console.log(`🧭 [국면 전환] ${session.activeFilter.callTarget ?? 'DEST'} → ${phase} (userId: ${userId})`);

        /**
         * 국면마다 **"어디로 가는 콜을 찾는가"만** 다르다.
         *
         * 🔴 2026-08-14 — 여기서 반경(`destinationRadiusKm`)을 **더 이상 정하지 않는다.**
         *
         * 예전에는 `baseFilter.destinationRadiusKm` 을 실어 보냈다. 그래서 국면별 설정(§2-4)에
         * 첫짐 하차 7km 를 저장해 둬도, 관내에 갔다 돌아오면 **평소값 1km 로 덮였다.**
         * 반경의 원천이 둘(평소 설정 · 국면 설정)이 된 것이다.
         * 이제 반경은 국면 설정 한 곳에서만 나온다 — `filterManager` 가 전환을 감지해 펼친다.
         */
        let city: string | null = null;

        if (phase === 'DEST') {
            // 오늘 정한 목적지로 돌아간다 — 첫짐 국면이 기억하고 있는 도시가 먼저다
            city = session.phaseSettings.first.destinationCity
                || session.baseFilter.destinationCity
                || null;
        } else if (phase === 'LOCAL') {
            /**
             * 이 동네 = **지금 있는 곳의 시**. 반경은 관내 국면 설정이 정한다(기본 0) —
             * 그 시 안에서 끝나는 콜만.
             * 기사님: *"관내콜은 거리로 하지 말자. 그냥 상차지와 하차지가 같은 시도에 있으면."*
             *
             * 기점은 GPS 다. 없으면 전환할 수 없다 — **없는 위치를 지어내지 않는다.**
             */
            if (!session.driverLocation) {
                return { success: false, phase, message: '현재 위치를 아직 못 잡았습니다. 잠시 후 다시 시도해 주세요' };
            }
            city = reverseGeocodeToRegion(session.driverLocation.y, session.driverLocation.x);
            if (!city) {
                return { success: false, phase, message: '지금 위치가 어느 시인지 알 수 없습니다' };
            }
        } else {
            /**
             * 복귀행 = **집이 있는 시**. 집 주소는 설정에 있다.
             * 기점(짐이 남았으면 마지막 하차지 / 다 내렸으면 현위치)은 경유이 알아서 잡는다 —
             * 여기서는 "어디로 가는가"만 정한다.
             */
            const settings = db.prepare("SELECT home_address FROM user_settings WHERE user_id = ?").get(userId) as any;
            if (!settings?.home_address) {
                return { success: false, phase, message: '설정에 집 주소가 없습니다' };
            }
            // 주소에서 시/군 조각을 뽑는다 (예: "경기 광주시 초월읍 ..." → "광주시")
            city = settings.home_address.split(/\s+/).find((p: string) => p.endsWith('시') || p.endsWith('군')) ?? null;
            if (!city) {
                return { success: false, phase, message: `집 주소에서 시/군을 찾지 못했습니다 (${settings.home_address})` };
            }
        }

        /**
         * 입력만 넘긴다 — 키워드·별칭 같은 파생값은 `filterManager` 가 만든다.
         * (여기서 직접 채우면 `recalculateDerivedFields` 가 자기 계산을 건너뛰어
         *  `customCityFilters` 가 안 채워진다 — 2026-08-12 에 실제로 그랬다)
         */
        updateActiveFilter(userId, {
            callTarget: phase,
            destinationCity: city!,
            isActive: true,
        }, io);

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

        const currentLoc = session.driverLocation;
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

        const targetDetour = options?.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM;
        updateActiveFilter(userId, {
            dispatchPhase: 'GATHERING',
            isSharedMode: true,
            isActive: true,
            detourRadiusKm: targetDetour,
        }, io);
        syncDetourFilter(userId, io);

        console.log(`🏠 [귀가콜] 가상 오더 생성 완료: ${settings.home_address}`);
        io.to(userId).emit("order-confirmed", homeOrder.id);

        return { success: true, orderId: homeOrder.id };
    } catch (e: any) {
        console.error("🏠 [귀가콜] 에러:", e);
        return { success: false, message: e.message || "귀가콜 생성 실패" };
    }
}
