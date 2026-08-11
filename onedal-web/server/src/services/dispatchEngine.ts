import { mapVehicleToKakaoCarType, getRemainingCapacityTypes, deriveDispatchPhase, normalizeVehicleType,
         MILESTONE_TO_STATUS, MILESTONE_LABEL, canReportMilestone, timingError,
         RESTORABLE_STATUSES } from "@onedal/shared";
import type { SecuredOrder, AutoDispatchFilter, PricingConfig, PendingOrder, MyOrder,
              Milestone, MilestoneSource } from "@onedal/shared";
import { geocodeAddress, calculateSoloRoute, calculateDetourRoute, compareDirections } from "./kakaoService";
import { fetchRealWorldRoute } from "../routes/osrmUtil";
import { getUserSession } from "../state/userSessionStore";
import { updateActiveFilter } from "../state/filterManager";
import { getCorridorRegions, getCityRegionsWithRadius, reverseGeocodeToRegion } from "../services/geoService";
import { composeMergedRoute, applyRoute, applySoloRoute, pickRouteHolder, toKm, toMin } from "./routeComposer";
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
import { getActiveCalls, buildOrderSync, setOrderStatus } from "../core/helpers";

/**
 * 장소명 정규화 (공백 및 주식회사 텍스트 제거)
 * 예: "주식회사 레드 캠프" -> "레드캠프"
 */
export const normalizePlaceName = (name?: string) => {
    if (!name) return "미상";
    return name.replace(/\(주\)|주식회사|\s/g, '').trim();
};



/** 기존 평가 중이던 콜을 외부에서 강제 삭제할 때 호출 */
export function forceCancelEvaluatingOrder(userId: string, orderId: string, io: any) {
    const session = getUserSession(userId);
    let targetDeviceId: string | undefined;

    if (session.pendingOrdersData.has(orderId)) {
        targetDeviceId = session.pendingOrdersData.get(orderId)?.capturedDeviceId;
        session.pendingOrdersData.delete(orderId);
    }
    // [Option B] 결재 큐 및 데스밸리 타이머 청소
    if (session.pendingDecisions.has(orderId)) {
        session.pendingDecisions.delete(orderId);
    }
    const warnTimer = session.activeTimers.get(`warn_${orderId}`);
    const timeoutTimer = session.activeTimers.get(`timeout_${orderId}`);
    if (warnTimer) clearTimeout(warnTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    session.activeTimers.delete(`warn_${orderId}`);
    session.activeTimers.delete(`timeout_${orderId}`);
    Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
        if (v === orderId) session.deviceEvaluatingMap.delete(k);
    });
    if (io) {
        console.log(`📤 [Socket 푸시] order-canceled (${orderId}) to ${userId}`);
        io.to(userId).emit("order-canceled", { id: orderId, status: 'ORDER_CANCELED' });
    }

    if (targetDeviceId) {
        incrementDeviceStats(targetDeviceId, "canceled");
        console.log(`   📈 기기(${targetDeviceId}) 취소 카운트 +1 반영 (reason: FORCE_CANCEL)`);
    }
}

/** 취소/방출 등 메모리 변동 발생 시, 오더가 남아있다면 카카오 경로를 백그라운드에서 재탐색하여 폴리라인 및 소요시간을 복원합니다. */
export async function recalculateActiveKakaoRoute(userId: string, io: any) {
    const session = getUserSession(userId);

    // 완료되지 않은 활성 콜만 추출 (On-the-fly 필터링)
    const activeCalls = getActiveCalls(session);

    if (activeCalls.length === 0) {
        // 마지막 콜을 취소·완료해 첫짐 모드로 돌아왔다. 회랑 키워드를 그대로 두면
        // 이미 끝난 경로 주변만 계속 사냥하게 되므로 도시 기준으로 되돌린다.
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
            const res = await calculateSoloRoute(
                activeMain.pickupX!, activeMain.pickupY!,
                activeMain.dropoffX!, activeMain.dropoffY!,
                session.driverLocation,
                routingOptions.defaultPriority,
                routingOptions.carType
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

    // [핵심 보강] 갱신된 새 폴리라인을 바탕으로 타겟팅 키워드(회랑) 다시 추출!
    syncCorridorFilter(userId, io);

    if (io) {
        const payload = Array.from(session.pendingOrdersData.values());
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
                routingOptions.carType
            );

            let paramLabel = "추천";
            if (priority === "TIME") paramLabel = "최단시간";
            if (priority === "DISTANCE") paramLabel = "최단거리";

            // routeComposer 규약으로 기록한다. 손으로 채우면 접근 구간이 또 버려진다
            // (이 파일에만 같은 기록 로직이 여섯 벌 있었다 — OrderEvaluator 포함)
            applySoloRoute(securedOrder, result);

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

            let recommend = "";
            if (Number(result.distDiffKm) > 10 || Number(result.timeDiffMin) > 30) {
                recommend = "💩 (패널티 🚨)";
            } else if (Number(result.distDiffKm) > 0 || Number(result.timeDiffMin) > 0) {
                recommend = "🚙 (양호)";
            } else {
                recommend = "🍯 (꿀)";
            }

            let paramLabel = "추천";
            if (priority === "TIME") paramLabel = "최단시간";
            if (priority === "DISTANCE") paramLabel = "최단거리";

            timeExt = `[${paramLabel}] ${signDist}${result.distDiffKm}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
        }

        logRoadmapEvent("서버", "재탐색 결과로 폴리라인 및 소요시간 갱신 연산");
        securedOrder.kakaoTimeExt = timeExt;

        if (getActiveCalls(session).some(c => c.id === securedOrder.id)) {
            syncCorridorFilter(userId, io);
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

export const recalculateCorridorFilter = (userId: string, corridorRadiusKm: number, destinationRadiusKm?: number) => {
    const session = getUserSession(userId);
    let polylineToUse = null;
    const activeCalls = getActiveCalls(session);
    if (activeCalls.length > 0) {
        polylineToUse = activeCalls[activeCalls.length - 1].routePolyline;
    }

    if (polylineToUse && polylineToUse.length > 0) {
        const regions = getCorridorRegions(polylineToUse, corridorRadiusKm, destinationRadiusKm);
        if (regions && regions.flat.length > 0) {
            return {
                destinationKeywords: regions.flat,
                destinationGroups: regions.grouped,
                customCityFilters: regions.customCityFilters
            };
        }
    }
    return null;
};

export const syncCorridorFilter = (userId: string, io: any) => {
    const session = getUserSession(userId);
    let polylineToUse = null;

    // 완료되지 않은 활성 콜만 추출하여 최신 폴리라인을 가져옵니다.
    const activeCalls = getActiveCalls(session);
    if (activeCalls.length > 0) {
        polylineToUse = activeCalls[activeCalls.length - 1]?.routePolyline;
    }

    if (polylineToUse && polylineToUse.length > 0) {
        const cRadius = session.activeFilter.corridorRadiusKm ?? 10;
        const dRadius = session.activeFilter.destinationRadiusKm;
        const regions = getCorridorRegions(polylineToUse, cRadius, dRadius);

        if (regions && regions.flat.length > 0) {
            updateActiveFilter(userId, {
                destinationKeywords: regions.flat,
                destinationGroups: regions.grouped,
                customCityFilters: regions.customCityFilters
            }, io);
        }
    }
};

/** 관제사 최종 판정 처리 */
export async function handleDecision(userId: string, orderId: string, status: 'ORDER_CONFIRMED' | 'ORDER_CANCELED' | 'ORDER_RELEASED' | 'ORDER_FORCE_CANCELED', io: any) {
    const session = getUserSession(userId);

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

        // ✅ mainCallState/subCalls 할당 완료 후 회랑 재계산 (경로 기반 키워드 갱신)
        let destinationKeywords = session.activeFilter.destinationKeywords;
        if (cachedOrder && cachedOrder.routePolyline) {
            syncCorridorFilter(userId, io);
            destinationKeywords = session.activeFilter.destinationKeywords;
            console.log(`🗺️ [회랑 갱신] KEEP 후 destinationKeywords ${destinationKeywords.length}개로 재계산 완료`);
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
            const pickupName = normalizePlaceName(cachedOrder.pickupDetails?.[0]?.customerName || "미상");
            const pickupAddress = cachedOrder.pickupDetails?.[0]?.addressDetail || cachedOrder.pickup;
            const pickupRegion = cachedOrder.pickupDetails?.[0]?.region || cachedOrder.pickup.split(' ').slice(0, 2).join(' ') || "미상";
            
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
            const dropoffName = normalizePlaceName(cachedOrder.dropoffDetails?.[0]?.customerName || "미상");
            const dropoffAddress = cachedOrder.dropoffDetails?.[0]?.addressDetail || cachedOrder.dropoff;
            const dropoffRegion = cachedOrder.dropoffDetails?.[0]?.region || cachedOrder.dropoff.split(' ').slice(0, 2).join(' ') || "미상";
            
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
        // 허용 차종이 [오토바이] 하나로 줄어 합짐 사냥이 사실상 정지했다.
        // 짐이 작을수록 공간이 더 남는데 범위가 좁아지는 역설이었다.
        // 이제 내 차 용량에서 실제 적재분을 빼서 계산한다.
        const routingOpts = SettingsRepository.getKakaoRoutingOptions(userId);
        const myVehicle = routingOpts.vehicleType || '1t';
        // 방금 push한 confirmedOrder 포함, 현재 적재 중인 활성 콜 전부
        const loadedVehicles = getActiveCalls(session).map(c => c.vehicleType || myVehicle);
        const sharedVehicleTypes = getRemainingCapacityTypes(myVehicle, loadedVehicles);
        console.log(`🚚 [적재 용량] 내 차: ${myVehicle} | 실은 짐: [${loadedVehicles.join(', ')}] → 추가 가능 차종: [${sharedVehicleTypes.join(', ')}]`);

        // [자체 리뷰 C] 차종을 인식하지 못하면 보수적으로 "내 차를 가득 채운 것"으로 계산한다.
        // 안전한 방향이지만 그만큼 합짐 사냥 범위가 좁아지므로, 조용히 넘어가면 안 된다.
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

        const existingOrder = session.myOrders.find(c => c.id === orderId);
        if (existingOrder) {
            try {
                // 수동 거절(ORDER_CANCELED)일지라도 DB에 저장하도록 함
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
 *   getUserSession(동기·DB로드+지리연산) / restoreAndRecalculateSession(비동기) / syncCorridorFilter
 * 소켓 핸들러가 복구를 await 하지 않고 곧바로 filter-init 을 쏘는 바람에
 *   ① 앱폰이 1~3초간 "첫짐 필터(회랑 없음)"를 받아 경로 이탈 콜을 잡을 수 있었고
 *   ② 관제탑은 첫짐 → 합짐으로 깜빡였으며
 *   ③ destinationKeywords 를 4곳이 각자 만들어 진실 공급원이 없었다.
 *
 * 이제 아래 순서를 한 함수가 책임진다. **⑥ 이전에는 앱폰에 사냥을 시키지 않는다.**
 *
 *   ① 세션 확보    DB에서 baseFilter 로드 (지리 연산 없음)
 *   ② 데이터 로드   오늘의 활성 콜 복구 → myOrders
 *   ③ 노선 산출    카카오 Solo / Detour+TSP → routePolyline
 *   ④ 상태 파생    dispatchPhase · allowedVehicleTypes · isSharedMode
 *   ⑤ 회랑 도출    폴리라인 기준(활성 콜 있음) 또는 destinationCity 기준(없음)
 *   ⑥ 필터 확정    activeFilter 완성 → 관제탑 filter-init 1회 + 앱폰 사냥 재개
 */
export async function bootstrapUserSession(userId: string, io: any): Promise<void> {
    const session = getUserSession(userId);          // ① (지리 연산 없이 baseFilter 만)
    if (session.isRestored || session.isBootstrapping) return;

    session.isBootstrapping = true;                  // 이 순간부터 앱폰은 isActive=false 를 받는다
    const t0 = Date.now();
    logRoadmapEvent("서버", "[Bootstrap] 시작 — 필터 확정 전까지 앱폰 사냥 일시 정지");

    try {
        await restoreAndRecalculateSession(userId, io);   // ②③④ (DB 로드 → 카카오 노선 → 상태 파생)
        rebuildDestinationKeywords(userId, io);           // ⑤ (활성 콜 유무로 회랑/도시 분기)
    } catch (err) {
        console.error("🚨 [Bootstrap] 실패:", err);
    } finally {
        // ⑥ 성공하든 실패하든 반드시 잠금을 푼다. 여기서 막히면 사냥이 영영 멈춘다.
        session.isBootstrapping = false;
    }

    const f = session.activeFilter;
    console.log(`✅ [Bootstrap 완료] ${Date.now() - t0}ms | phase=${f.dispatchPhase} 합짐=${f.isSharedMode} ` +
        `차종=${(f.allowedVehicleTypes || []).length}종 키워드=${(f.destinationKeywords || []).length}개`);
    logRoadmapEvent("서버", `[Bootstrap] 완료 (${Date.now() - t0}ms) — 관제탑에 확정 필터 1회 전송, 앱폰 사냥 재개`);

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
 * 예전에는 이 값을 네 군데(userSessionStore 세션 생성 / 부트스트랩 / syncCorridorFilter /
 * 필터 변경)가 각자 만들었고, 그래서 "지금 어느 지역을 사냥 중인가"에 대한 답이
 * 호출 순서에 따라 달라졌다. 이제 갈래는 여기 하나뿐이다.
 *
 *   활성 콜 있음 → 주행 경로 주변 회랑 (syncCorridorFilter)
 *   활성 콜 없음 → 기사님이 설정한 destinationCity + 반경
 *
 * 특히 **마지막 콜을 취소해 활성 0건이 됐을 때**가 중요하다. 예전에는
 * recalculateActiveKakaoRoute 가 `activeCalls.length === 0`이면 곧바로 return 해서
 * 회랑 키워드가 그대로 남았고, 첫짐 모드로 돌아왔는데도 옛 경로 주변만 사냥했다.
 */
export function rebuildDestinationKeywords(userId: string, io: any): void {
    const session = getUserSession(userId);

    if (getActiveCalls(session).length > 0) {
        syncCorridorFilter(userId, io);
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
export async function restoreAndRecalculateSession(userId: string, io: any) {
    const session = getUserSession(userId);
    if (session.isRestored) return; // 이미 복구했으면 스킵
    session.isRestored = true;

    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. orders와 places 테이블을 조인하여 복구 대상 콜과 X, Y 좌표를 불러옵니다.
        //
        // 🔴 상태 목록을 여기 손으로 적지 않는다 (2026-08-11).
        //    예전에는 5개를 나열해 뒀는데 Phase 8.3 이 만든 ORDER_PICKED_UP · ORDER_DELIVERED
        //    가 빠져서 **짐을 실은 채 새로고침하면 콜이 사라졌다.**
        //    이제 shared 의 RESTORABLE_STATUSES 한 곳에서만 정한다.
        const statusPlaceholders = RESTORABLE_STATUSES.map(() => '?').join(', ');
        const rows = db.prepare(`
            SELECT o.*,
                   pPlace.x as pickupX, pPlace.y as pickupY,
                   dPlace.x as dropoffX, dPlace.y as dropoffY
            FROM orders o
            LEFT JOIN orderStops pStop ON pStop.orderId = o.id AND pStop.stopType = 'pickup'
            LEFT JOIN places pPlace ON pStop.placeId = pPlace.id
            LEFT JOIN orderStops dStop ON dStop.orderId = o.id AND dStop.stopType = 'dropoff'
            LEFT JOIN places dPlace ON dStop.placeId = dPlace.id
            WHERE o.userId = ? AND o.status IN (${statusPlaceholders}) AND o.timestamp >= ?
            ORDER BY o.timestamp ASC
        `).all(userId, ...RESTORABLE_STATUSES, todayStart.toISOString()) as any[];

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
                isShared: !!row.isShared,
                isExpress: !!row.isExpress,
                orderForm: row.orderForm,
                detailMemo: row.detailMemo
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

        // 3. 본콜 카카오 궤적 1회 복구
        if (activeMain && activeMain.pickupX && activeMain.dropoffX) {
            try {
                const res = await calculateSoloRoute(
                    activeMain.pickupX, activeMain.pickupY!,
                    activeMain.dropoffX, activeMain.dropoffY!,
                    session.driverLocation,
                    routingOptions.defaultPriority,
                    routingOptions.carType
                );
                activeMain.routePolyline = res.polyline;
                activeMain.sectionEtas = res.sectionEtas;
            } catch(e) {
                console.error('🗺️ [본콜 복구 연산 실패]', e);
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
        // 상태로 사냥이 계속되었다. 그 결과
        //   - OrderEvaluator가 도착지 회랑 검사를 건너뛰어 경로 이탈 콜도 통과
        //   - 첫짐 절대하한가(minFare)가 잘못 적용
        //   - 남은 적재 공간을 무시한 차종 허용 (라보 2건 만재여도 1t 콜을 잡으러 감)
        //   - KEEP 시 isShared=0 으로 기록되어 통계 왜곡 (이슈 R)
        //
        // 상태를 따로 저장했다가 되살리는 대신 **데이터에서 매번 파생**시킨다.
        // 저장된 상태는 실제와 어긋날 수 있지만 파생값은 어긋날 수 없다.
        // (복구 쿼리가 오늘 것만 가져오므로 어제 상태가 살아날 우려도 없다)
        const restoredActive = getActiveCalls(session);
        if (restoredActive.length > 0) {
            const myVehicle = SettingsRepository.getKakaoRoutingOptions(userId).vehicleType || '1t';
            const loadedVehicles = restoredActive.map(c => c.vehicleType || myVehicle);
            const phase = deriveDispatchPhase(session.activeFilter.driverAction ?? 'WAITING', restoredActive.length);

            updateActiveFilter(userId, {
                dispatchPhase: phase,
                isSharedMode: true,
                allowedVehicleTypes: getRemainingCapacityTypes(myVehicle, loadedVehicles),
            }, io);

            // 회랑 키워드는 부트스트랩 ⑤(rebuildDestinationKeywords)가 일괄 처리한다.
            // 여기서 또 계산하면 같은 지리 연산을 두 번 돌린다.

            const f = session.activeFilter;
            console.log(`🔄 [상태 복구] 진행 중 ${restoredActive.length}건 → phase=${phase}, 합짐=ON, ` +
                `추가 가능 차종=[${(f.allowedVehicleTypes || []).join(', ')}], 회랑 키워드=${(f.destinationKeywords || []).length}개`);
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
 *              경로 재계산이 잔여 용량과 회랑을 다시 넓혀 준다
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

    // ④ 하차하면 그 짐은 더 이상 실려 있지 않다. 경로·잔여 용량·회랑을 다시 계산한다.
    //    (recalculateActiveKakaoRoute 는 활성 콜이 0건이면 회랑도 첫짐 모드로 되돌린다)
    if (milestone === 'DELIVERED') {
        const remaining = getActiveCalls(session);
        await recalculateActiveKakaoRoute(userId, io);
        console.log(`🚚 [적재 회복] 하차 완료 → 남은 활성 콜 ${remaining.length}건 기준으로 필터 재계산`);
    }

    if (io) {
        io.to(userId).emit("sync-active-orders", buildOrderSync(session));
        io.to(userId).emit("filter-updated", {
            activeFilter: session.activeFilter,
            baseFilter: session.baseFilter,
        });
    }

    return { success: true, status: nextStatus ?? order.status };
}

/**
 * 운행 완료 처리: 메모리 상태 변경 + DB 영구화 + 경로 재계산
 * ⚠️ 하차 보고(reportMilestone DELIVERED)와 별개인 **수동 종료** 경로다.
 *    마일스톤을 건너뛰고 바로 닫고 싶을 때만 쓴다.
 */
export async function completeOrder(userId: string, orderId: string, io: any): Promise<boolean> {
    const session = getUserSession(userId);
    const existingOrder = session.myOrders.find(c => c.id === orderId);
    if (!existingOrder) return false;

    // 두 메모리를 함께 갱신한다 — 예전에는 myOrders 만 바꿔 관제탑에 낡은 상태가 갔다
    setOrderStatus(session, orderId, 'ORDER_COMPLETED');

    try {
        db.prepare("UPDATE orders SET status = 'ORDER_COMPLETED', completedAt = datetime('now', 'localtime') WHERE id = ? AND userId = ?").run(orderId, userId);
        console.log(`✅ [운행 완료] ${orderId} - DB 업데이트 완료 (completedAt 갱신)`);
    } catch (e) {
        console.error("DB 업데이트 에러:", e);
    }

    // 경로 재계산 (완료된 짐 제외한 On-the-fly 라우팅)
    await recalculateActiveKakaoRoute(userId, io);

    io.to(userId).emit("filter-updated", {
        activeFilter: session.activeFilter,
        baseFilter: session.baseFilter
    });

    return true;
}

/**
 * 투-트랙 사냥 모드: 기존 콜 전부 완료 → 필터 STANDBY 리셋 → 집+현위치 동시 스캔
 */
export async function startTwoTrack(userId: string, io: any): Promise<{ success: boolean; keywords: string[]; message?: string }> {
    try {
        const session = getUserSession(userId);
        console.log(`🎯 [투-트랙] 사냥 모드 전환 시작 (userId: ${userId})`);

        // 1. 기존 활성 콜 전부 completed 처리 (메모리 + DB)
        const allCalls = getActiveCalls(session);
        for (const call of allCalls) {
            if (!call) continue;
            setOrderStatus(session, call.id, 'ORDER_COMPLETED');
            try {
                db.prepare("UPDATE orders SET status = 'ORDER_COMPLETED', completedAt = datetime('now', 'localtime') WHERE id = ? AND userId = ?").run(call.id, userId);
                console.log(`   ✅ [투-트랙] 기존 콜 완료 처리: ${call.id} (${call.pickup} → ${call.dropoff})`);
            } catch (e) {
                console.error(`   ⚠️ [투-트랙] DB 업데이트 실패:`, e);
            }
        }

        // 2. 집 주소에서 키워드 추출
        const settings = db.prepare("SELECT home_address FROM user_settings WHERE user_id = ?").get(userId) as any;
        const homeKeywords: string[] = [];
        if (settings?.home_address) {
            const parts = settings.home_address.split(/\s+/);
            for (const p of parts) {
                if (p.endsWith('시') || p.endsWith('군') || p.endsWith('구') || p.endsWith('읍') || p.endsWith('면') || p.endsWith('동')) {
                    homeKeywords.push(p);
                }
            }
        }

        // 3. 현재 위치 주변 키워드 추출
        const currentKeywords: string[] = [];
        if (session.activeFilter.destinationCity) {
            currentKeywords.push(session.activeFilter.destinationCity);
        }
        if (session.driverLocation) {
            const region = reverseGeocodeToRegion(session.driverLocation.y, session.driverLocation.x);
            if (region) {
                currentKeywords.push(region);
            }
        }

        // 4. 필터 리셋: STANDBY 모드 + 동시 키워드 투입
        const mergedKeywords = [...new Set([...homeKeywords, ...currentKeywords])];
        updateActiveFilter(userId, {
            isSharedMode: false,
            isActive: true,
            driverAction: 'WAITING',
            dispatchPhase: 'STANDBY',
            destinationCity: '🎯 투-트랙 탐색',
            destinationKeywords: mergedKeywords,
            corridorRadiusKm: 0,
        }, io);

        console.log(`🎯 [투-트랙] 필터 전환 완료 → 키워드: [${mergedKeywords.join(', ')}]`);

        // 5. 프론트엔드 동기화
        io.to(userId).emit("filter-updated", {
            activeFilter: session.activeFilter,
            baseFilter: session.baseFilter
        });
        const payload = Array.from(session.pendingOrdersData.values());
        io.to(userId).emit("sync-active-orders", buildOrderSync(session));

        return { success: true, keywords: mergedKeywords };
    } catch (e: any) {
        console.error("🎯 [투-트랙] 에러:", e);
        return { success: false, keywords: [], message: e.message || "투-트랙 전환 실패" };
    }
}

/**
 * 귀가콜 생성: 현재 위치 → 집 주소로 가상 오더 생성 + 회랑 자동 세팅
 */
export async function createHomeReturn(
    userId: string, 
    io: any, 
    options?: { corridorRadiusKm?: number; destinationRadiusKm?: number }
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

        const targetCorridor = options?.corridorRadiusKm ?? 10;
        updateActiveFilter(userId, {
            dispatchPhase: 'GATHERING',
            isSharedMode: true,
            isActive: true,
            corridorRadiusKm: targetCorridor,
        }, io);
        syncCorridorFilter(userId, io);

        console.log(`🏠 [귀가콜] 가상 오더 생성 완료: ${settings.home_address}`);
        io.to(userId).emit("order-confirmed", homeOrder.id);

        return { success: true, orderId: homeOrder.id };
    } catch (e: any) {
        console.error("🏠 [귀가콜] 에러:", e);
        return { success: false, message: e.message || "귀가콜 생성 실패" };
    }
}
