import { mapVehicleToKakaoCarType, getSharedModeVehicleTypes } from "@onedal/shared";
import type { SecuredOrder, AutoDispatchFilter, PricingConfig, PendingOrder, MyOrder } from "@onedal/shared";
import { geocodeAddress, calculateSoloRoute, calculateDetourRoute, compareDirections } from "./kakaoService";
import { fetchRealWorldRoute } from "../routes/osrmUtil";
import { getUserSession } from "../state/userSessionStore";
import { updateActiveFilter } from "../state/filterManager";
import { optimizeWaypoints } from "../utils/routeOptimizer";
import { getCorridorRegions } from "../services/geoService";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../config/dispatchConfig";
import db from "../db";
import { incrementDeviceStats } from "../routes/devices";

/**
 * 장소명 정규화 (공백 및 주식회사 텍스트 제거)
 * 예: "주식회사 레드 캠프" -> "레드캠프"
 */
export const normalizePlaceName = (name?: string) => {
    if (!name) return "미상";
    return name.replace(/\(주\)|주식회사|\s/g, '').trim();
};

function getKakaoRoutingOptions(userId: string) {
    const row = db.prepare("SELECT vehicle_type, default_priority FROM user_settings WHERE user_id = ?").get(userId) as any;
    const vehicleTypeStr = row?.vehicle_type || '1t';
    return {
        carType: mapVehicleToKakaoCarType(vehicleTypeStr),
        defaultPriority: row?.default_priority || "RECOMMEND",
        vehicleType: vehicleTypeStr
    };
}

/** 
 * DB에서 기사의 요율 설정(차종별 단가, 수수료율, 할인율)을 로드합니다.
 * 서버 전용 데이터이므로 앱으로 전송되지 않습니다.
 */
function loadPricingConfig(userId: string): PricingConfig {
    const row = db.prepare("SELECT vehicle_rates, agency_fee_percent, max_discount_percent FROM user_filters WHERE user_id = ?").get(userId) as any;
    const defaultRates: Record<string, number> = {
        "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
        "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
        "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
    };
    return {
        vehicleRates: row?.vehicle_rates ? JSON.parse(row.vehicle_rates) : defaultRates,
        agencyFeePercent: row?.agency_fee_percent ?? 23,
        maxDiscountPercent: row?.max_discount_percent ?? 10
    };
}

/**
 * 다이내믹 요율 계산 엔진
 * 
 * 적정 금액 = 거리(km) × 차종 단가 × (1 - 수수료율)
 * 수용 하한선 = 적정 금액 × (1 - 최대할인율)
 * 
 * @returns 적정 금액, 수용 하한선, 꿀콜/적정/미달 판정
 */
export function calculateDynamicFare(
    distanceKm: number,
    orderVehicleType: string | undefined,
    fallbackVehicleType: string,
    pricing: PricingConfig
): { fairPrice: number; minAcceptable: number; verdict: 'HONEY' | 'FAIR' | 'UNDERPAID' } {
    const vehicleKey = orderVehicleType && pricing.vehicleRates[orderVehicleType]
        ? orderVehicleType
        : fallbackVehicleType;
    const ratePerKm = pricing.vehicleRates[vehicleKey] || 1000;
    const feeMultiplier = 1 - (pricing.agencyFeePercent / 100);
    const discountMultiplier = 1 - (pricing.maxDiscountPercent / 100);

    const fairPrice = Math.round(distanceKm * ratePerKm * feeMultiplier);
    const minAcceptable = Math.round(fairPrice * discountMultiplier);

    return { fairPrice, minAcceptable, verdict: 'FAIR' }; // verdict는 호출부에서 실제 금액과 비교하여 결정
}

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
        io.to(userId).emit("order-canceled", orderId);
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
    const activeCalls = [session.mainCallState, ...session.subCalls].filter(c => c && c.status !== 'completed') as MyOrder[];

    if (activeCalls.length === 0) return; // 경로를 계산할 활성 콜이 없음

    const activeMain = activeCalls[0];
    const activeSubs = activeCalls.slice(1);

    try {
        const apiKey = process.env.KAKAO_REST_API_KEY || "";
        if (!apiKey) return;

        const routingOptions = getKakaoRoutingOptions(userId);

        if (activeSubs.length === 0) {
            // 단독 오더 라우팅
            const res = await calculateSoloRoute(
                activeMain.pickupX!, activeMain.pickupY!,
                activeMain.dropoffX!, activeMain.dropoffY!,
                session.driverLocation,
                routingOptions.defaultPriority,
                routingOptions.carType
            );
            activeMain.routePolyline = res.polyline;
            activeMain.totalDistanceKm = Math.round(res.distance / 1000);
            activeMain.totalDurationMin = Math.round(res.duration / 60);

            if (res.approachDistance && res.approachDuration) {
                console.log(`🗺️ [사후 재계산 - 첫짐] 현위치 접근: ${res.approachDistance}m (${res.approachDuration}초) / 총 이동: ${res.distance}m`);
            }
        } else {
            // 다중 오더 라우팅 (TSP)
            const allPickups = [
                { x: activeMain.pickupX!, y: activeMain.pickupY! },
                ...activeSubs.map(c => ({ x: c.pickupX!, y: c.pickupY! }))
            ];
            const allDropoffs = [
                { x: activeMain.dropoffX!, y: activeMain.dropoffY! },
                ...activeSubs.map(c => ({ x: c.dropoffX!, y: c.dropoffY! }))
            ];

            const startLoc = session.driverLocation || allPickups[0];
            const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);

            const mergedDest = sortedDropoffs.pop()!;
            const waypoints = [...sortedPickups, ...sortedDropoffs];

            const result = await calculateDetourRoute(
                activeMain.dropoffX!, activeMain.dropoffY!,
                activeMain.pickupX!, activeMain.pickupY!,
                mergedDest.x, mergedDest.y,
                waypoints,
                session.driverLocation,
                routingOptions.defaultPriority,
                routingOptions.carType
            );

            const lastSub = activeSubs[activeSubs.length - 1];
            lastSub.routePolyline = result.merged.polyline;
            lastSub.totalDistanceKm = result.merged.distance / 1000;
            lastSub.totalDurationMin = Math.round(result.merged.duration / 60);

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
        io.to(userId).emit("sync-active-orders", payload);
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

        const currentOrders = Array.from(session.pendingOrdersData.values());
        let previousOrders = [session.mainCallState, ...session.subCalls].filter(o => o && o.id !== orderId && o.status !== 'completed') as MyOrder[];
        if (previousOrders.length > 0) isDetour = true;

        const routingOptions = getKakaoRoutingOptions(userId);

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

            timeExt = `[${paramLabel}] 재탐색 완료`;

            securedOrder.routePolyline = result.polyline;
            securedOrder.totalDistanceKm = parseFloat((result.distance / 1000).toFixed(1));
            securedOrder.totalDurationMin = Math.round(result.duration / 60);
        } else {
            const allPickups: { x: number; y: number }[] = [];
            const allDropoffs: { x: number; y: number }[] = [];

            if (session.mainCallState) {
                allPickups.push({ x: session.mainCallState.pickupX!, y: session.mainCallState.pickupY! });
                allDropoffs.push({ x: session.mainCallState.dropoffX!, y: session.mainCallState.dropoffY! });
            }
            session.subCalls.forEach(c => {
                if (c.pickupX && c.pickupY) allPickups.push({ x: c.pickupX, y: c.pickupY });
                if (c.dropoffX && c.dropoffY) allDropoffs.push({ x: c.dropoffX, y: c.dropoffY });
            });

            const isIncluded = session.mainCallState?.id === securedOrder.id || session.subCalls.some(c => c.id === securedOrder.id);
            if (!isIncluded && securedOrder.pickupX && securedOrder.pickupY && securedOrder.dropoffX && securedOrder.dropoffY) {
                allPickups.push({ x: securedOrder.pickupX, y: securedOrder.pickupY });
                allDropoffs.push({ x: securedOrder.dropoffX, y: securedOrder.dropoffY });
            }

            const startLoc = session.driverLocation || allPickups[0];
            const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);

            const mergedDest = sortedDropoffs.pop()!;
            const waypoints = [...sortedPickups, ...sortedDropoffs];

            let firstPickX = allPickups[0].x;
            let firstPickY = allPickups[0].y;
            let firstDestX = allDropoffs[0].x;
            let firstDestY = allDropoffs[0].y;

            if (session.mainCallState) {
                firstPickX = session.mainCallState.pickupX!;
                firstPickY = session.mainCallState.pickupY!;
                firstDestX = session.mainCallState.dropoffX!;
                firstDestY = session.mainCallState.dropoffY!;
            }

            const result = await calculateDetourRoute(
                firstDestX, firstDestY,
                firstPickX, firstPickY,
                mergedDest.x, mergedDest.y,
                waypoints,
                session.driverLocation,
                priority || routingOptions.defaultPriority,
                routingOptions.carType
            );

            securedOrder.routePolyline = result.merged.polyline;
            securedOrder.totalDistanceKm = Math.round(result.merged.distance / 1000);
            securedOrder.totalDurationMin = Math.round(result.merged.duration / 60);
            securedOrder.sectionEtas = result.merged.sectionEtas;

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

        if (session.mainCallState?.id === securedOrder.id || session.subCalls.some(c => c.id === securedOrder.id)) {
            syncCorridorFilter(userId, io);
        }

        logRoadmapEvent("서버", "관제탑에게 재산출된 노선(order-evaluated) 정보 전달");
        io.to(userId).emit("order-evaluated", securedOrder);
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

export const resetMainCallState = (userId: string) => {
    const session = getUserSession(userId);
    session.mainCallState = null;
};

export const recalculateCorridorFilter = (userId: string, corridorRadiusKm: number, destinationRadiusKm?: number) => {
    const session = getUserSession(userId);
    let polylineToUse = null;
    if (session.subCalls.length > 0) {
        polylineToUse = session.subCalls[session.subCalls.length - 1].routePolyline;
    } else if (session.mainCallState) {
        polylineToUse = session.mainCallState.routePolyline;
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
    const activeCalls = [session.mainCallState, ...session.subCalls].filter(c => c && c.status !== 'completed');
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
export async function handleDecision(userId: string, orderId: string, action: 'KEEP' | 'CANCEL', io: any) {
    const session = getUserSession(userId);

    // [Option B] Piggyback 결재 기록: pendingDecisions에 action을 기록하면
    // 다음 1.0초 텔레메트리(/scrap) 응답에 이 결재가 태워져서 앱으로 전달됩니다.
    if (session.pendingDecisions.has(orderId)) {
        const decisionData = session.pendingDecisions.get(orderId)!;
        decisionData.action = action;
        if (action === 'KEEP') logRoadmapEvent("서버", "앱폰에게 Action=Keep 최종 판결 Piggyback 등록");
        else logRoadmapEvent("서버", "앱폰에게 Action=Cancel 최종 판결 Piggyback 등록");
        console.log(`📦 [Piggyback V2] 관제탑 판결(${action})을 큐에 기록. 다음 텔레메트리에 태워 보냅니다. (orderId: ${orderId})`);
    } else {
        // pendingDecisions에 없는 경우 (이미 타임아웃으로 삭제되었거나, MANUAL 건)
        if (action === 'KEEP') logRoadmapEvent("서버", "앱폰에게 Action=Keep 최종 판결 응답 전달 (즉시)");
        else logRoadmapEvent("서버", "앱폰에게 Action=Cancel 최종 판결 응답 전달 (즉시)");
        console.log(`⚠️ [Piggyback V2] pendingDecisions에 ${orderId}가 없습니다. (MANUAL 건이거나 이미 타임아웃 처리됨)`);
    }

    // [Piggyback V2] deviceEvaluatingMap은 여기서 절대 삭제하지 않습니다!
    // KEEP이든 CANCEL이든 앱이 다음 /scrap 폴링으로 decision을 가져가야 하므로
    // scrap.ts → deviceEvaluatingMap.get(deviceId) 조회가 성공해야 합니다.
    // 실제 삭제는 scrap.ts의 ACK 처리 블록에서만 수행합니다.

    const targetDeviceId = session.pendingOrdersData.get(orderId)?.capturedDeviceId;

    if (action === 'CANCEL' && io) {
        logRoadmapEvent("서버", "관제탑으로 부터 Cancel 결재 요청 받음");
        logRoadmapEvent("서버", "취소된 콜을 메모리 큐에서 삭제 처리 연산");
        session.pendingOrdersData.delete(orderId);

        if (targetDeviceId) {
            incrementDeviceStats(targetDeviceId, "canceled");
            console.log(`   📈 기기(${targetDeviceId}) 취소 카운트 +1 반영 (reason: DECISION_CANCEL)`);
        }
    }

    if (action === 'KEEP') {
        logRoadmapEvent("서버", "관제탑으로 부터 Keep 결재 요청 받음");
        const cachedOrder = session.pendingOrdersData.get(orderId);

        if (!cachedOrder) return { success: false, action };

        // [V2 핵심] PendingOrder → MyOrder 승격 (심사 완료 → 내 퀵 확정)
        const confirmedOrder: MyOrder = {
            ...cachedOrder,
            status: 'confirmed',
        };
        // phase는 PendingOrder 전용이므로 제거
        delete (confirmedOrder as any).phase;

        // ⭐ 핵심 수정: 승격된 객체를 하트비트 메모리맵에 덮어씌워서 롤백 현상 방지
        session.pendingOrdersData.set(orderId, confirmedOrder as any);

        const isAlreadyMain = session.mainCallState?.id === orderId;
        const isAlreadySub = session.subCalls.some(c => c.id === orderId);

        if (!isAlreadyMain && !isAlreadySub) {
            logRoadmapEvent("서버", "해당 콜을 '메인콜' (또는 서브콜) 로 승격 및 병합 궤적 생성 연산");
            if (!session.mainCallState) {
                session.mainCallState = confirmedOrder;
            } else {
                session.subCalls.push(confirmedOrder);
                try {
                    const hasApiKey = !!process.env.KAKAO_REST_API_KEY;
                    if (hasApiKey) {
                        const activeCalls = [session.mainCallState, ...session.subCalls].filter(c => c && c.status !== 'completed') as MyOrder[];
                        if (activeCalls.length > 0) {
                            const activeMain = activeCalls[0];
                            const activeSubs = activeCalls.slice(1);

                            const allPickups = [
                                { x: activeMain.pickupX!, y: activeMain.pickupY! },
                                ...activeSubs.map(c => ({ x: c.pickupX!, y: c.pickupY! }))
                            ];
                            const allDropoffs = [
                                { x: activeMain.dropoffX!, y: activeMain.dropoffY! },
                                ...activeSubs.map(c => ({ x: c.dropoffX!, y: c.dropoffY! }))
                            ];

                            const startLoc = allPickups[0];
                            const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);

                            const mergedDest = sortedDropoffs.pop()!;
                            const waypoints = [...sortedPickups, ...sortedDropoffs];

                            const routingOptions = getKakaoRoutingOptions(userId);

                            const calcResult = await calculateDetourRoute(
                                activeMain.dropoffX!, activeMain.dropoffY!,
                                activeMain.pickupX!, activeMain.pickupY!,
                                mergedDest.x, mergedDest.y,
                                waypoints,
                                session.driverLocation,
                                routingOptions.defaultPriority,
                                routingOptions.carType
                            );

                            const lastSub = session.subCalls[session.subCalls.length - 1];
                            lastSub.routePolyline = calcResult.merged.polyline;
                            lastSub.totalDistanceKm = calcResult.merged.distance / 1000;
                            lastSub.totalDurationMin = Math.round(calcResult.merged.duration / 60);
                            lastSub.sectionEtas = calcResult.merged.sectionEtas;
                        }
                    }
                } catch (e) {
                    console.error('🗺️ [사후 병합 궤적 생성 실패]', e);
                }
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
            // isShared: 세션의 합짐 모드 여부로 판단
            const isShared = session.activeFilter.isSharedMode ? 1 : 0;
            // isExpress: 파서가 추출한 orderForm이 "급송"이면 true
            const isExpress = (cachedOrder.orderForm === '급송') ? 1 : 0;

            // 1. orders 등록 (v5 전체 컬럼)
            const stmtOrder = db.prepare(`
                INSERT INTO orders (
                    id, type, pickup, dropoff, fare, timestamp, status, userId, capturedAt, capturedDeviceId,
                    vehicleType, distanceKm, totalDistanceKm, totalDurationMin, kakaoSoloDistanceKm, kakaoSoloDurationMin, kakaoTimeExt,
                    paymentType, billingType, commissionRate, tollFare, tripType, orderForm, itemDescription, detailMemo,
                    dispatcherName, dispatcherPhone, isShared, isExpress
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET 
                    status = 'confirmed', 
                    userId = excluded.userId, 
                    capturedAt = excluded.capturedAt
            `);
            stmtOrder.run(
                cachedOrder.id,
                cachedOrder.type || "NEW_ORDER",
                cachedOrder.pickup,
                cachedOrder.dropoff,
                cachedOrder.fare || 0,
                cachedOrder.timestamp || new Date().toISOString(),
                "confirmed",
                userId,
                cachedOrder.capturedAt || new Date().toISOString(),
                cachedOrder.capturedDeviceId || null,
                cachedOrder.vehicleType || null,
                cachedOrder.distanceKm || null,
                cachedOrder.totalDistanceKm || null,
                cachedOrder.totalDurationMin || null,
                cachedOrder.kakaoSoloDistanceKm || null,
                cachedOrder.kakaoSoloDurationMin || null,
                cachedOrder.kakaoTimeExt || null,
                cachedOrder.paymentType || null,
                cachedOrder.billingType || null,
                cachedOrder.commissionRate || null,
                cachedOrder.tollFare || null,
                cachedOrder.tripType || null,
                cachedOrder.orderForm || null,
                cachedOrder.itemDescription || null,
                cachedOrder.detailMemo || null,
                cachedOrder.dispatcherName || null,
                cachedOrder.dispatcherPhone || null,
                isShared,
                isExpress
            );

            // 2. places UPSERT 및 orderStops 추가 (상차지)
            const pickupName = normalizePlaceName(cachedOrder.pickupDetails?.[0]?.customerName || "미상");
            const pickupAddress = cachedOrder.pickupDetails?.[0]?.addressDetail || cachedOrder.pickup;
            const pickupRegion = cachedOrder.pickupDetails?.[0]?.region || cachedOrder.pickup.split(' ').slice(0, 2).join(' ') || "미상";
            const stmtPlace = db.prepare(`
                INSERT INTO places (addressDetail, customerName, region, x, y, phone1, visitCount, lastVisitedAt)
                VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now','localtime'))
                ON CONFLICT(addressDetail, customerName)
                DO UPDATE SET
                    visitCount = visitCount + 1,
                    lastVisitedAt = datetime('now','localtime'),
                    x = COALESCE(excluded.x, x),
                    y = COALESCE(excluded.y, y),
                    phone1 = COALESCE(excluded.phone1, phone1),
                    region = COALESCE(excluded.region, region)
                RETURNING id
            `);
            const pPlace = stmtPlace.get(
                pickupAddress, pickupName, pickupRegion,
                cachedOrder.pickupX || null, cachedOrder.pickupY || null,
                cachedOrder.pickupDetails?.[0]?.phone1 || null
            ) as { id: number };
            if (pPlace) {
                db.prepare(`INSERT INTO orderStops (orderId, placeId, stopType, customerNameSnapshot, phoneSnapshot) VALUES (?, ?, 'pickup', ?, ?)`).run(
                    cachedOrder.id, pPlace.id, pickupName, cachedOrder.pickupDetails?.[0]?.phone1 || null
                );
            }

            // 3. places UPSERT 및 orderStops 추가 (하차지)
            const dropoffName = normalizePlaceName(cachedOrder.dropoffDetails?.[0]?.customerName || "미상");
            const dropoffAddress = cachedOrder.dropoffDetails?.[0]?.addressDetail || cachedOrder.dropoff;
            const dropoffRegion = cachedOrder.dropoffDetails?.[0]?.region || cachedOrder.dropoff.split(' ').slice(0, 2).join(' ') || "미상";
            const dPlace = stmtPlace.get(
                dropoffAddress, dropoffName, dropoffRegion,
                cachedOrder.dropoffX || null, cachedOrder.dropoffY || null,
                cachedOrder.dropoffDetails?.[0]?.phone1 || null
            ) as { id: number };
            if (dPlace) {
                db.prepare(`INSERT INTO orderStops (orderId, placeId, stopType, customerNameSnapshot, phoneSnapshot) VALUES (?, ?, 'dropoff', ?, ?)`).run(
                    cachedOrder.id, dPlace.id, dropoffName, cachedOrder.dropoffDetails?.[0]?.phone1 || null
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
        const currentPhase = session.activeFilter.dispatchPhase || 'STANDBY';

        // 합짐 차종: 첫 짐 오더의 차종을 기준으로 남은 적재 가능 차종 추론
        const routingOpts = getKakaoRoutingOptions(userId);
        const firstLoadVehicle = cachedOrder.vehicleType || routingOpts.vehicleType; // 차종 불명 시 기사 차종 Fallback
        const sharedVehicleTypes = getSharedModeVehicleTypes(firstLoadVehicle);

        if (currentPhase === 'STANDBY') {
            // 첫짐 → GATHERING: 기사님의 DB설정값(corridorRadiusKm)을 그대로 사용
            // 상차반경은 앱이 isSharedMode=true를 보고 자체 무시함 (데이터 변조 불필요)
            updateActiveFilter(userId, {
                isSharedMode: true,
                isActive: true,
                // loadState 삭제됨
                dispatchPhase: 'GATHERING',   // [V2] 합짐 탐색 단계
                // corridorRadiusKm: 삭제 — 기사님의 activeFilter 원본값(5km)을 그대로 유지
                destinationKeywords,
                allowedVehicleTypes: sharedVehicleTypes,
            }, io);
            console.log(`🔄 [State Machine] EMPTY → GATHERING (첫짐: ${firstLoadVehicle}, 합짐 허용: [${sharedVehicleTypes.join(',')}])`);
        } else if (currentPhase === 'GATHERING') {
            // [V2 수정] 2번째 콜을 잡아도 GATHERING 유지 — 기사님이 "🚀 출발" 누르기 전까지 자동 DRIVING 전환 안 함
            // corridorRadiusKm도 그대로 유지 (기사님의 설정값 5km)
            updateActiveFilter(userId, {
                isSharedMode: true,
                isActive: true,
                // loadState는 더이상 사용하지 않음
                // dispatchPhase: 'GATHERING' 유지 (변경하지 않음)
                destinationKeywords,
                allowedVehicleTypes: sharedVehicleTypes,
            }, io);
            console.log(`🔄 [State Machine] GATHERING 유지 (추가 콜 KEEP, 기사 수동 출발 대기)`);
        } else {
            // DRIVING(DELIVERING) 중에도 추가 KEEP 가능 (가는길 콜)
            updateActiveFilter(userId, {
                isSharedMode: true,
                isActive: true,
                destinationKeywords,
                allowedVehicleTypes: sharedVehicleTypes,
            }, io);
            console.log(`🔄 [State Machine] DELIVERING 유지 (가는길 추가 콜 KEEP)`);
        }
        logRoadmapEvent("서버", "새로 부여된 합짐 필터(isSharedMode)값 메모리 세션 갱신");
        logRoadmapEvent("서버", "앱폰 및 관제탑에게 새로운 타겟팅 필터(filter-updated) 정보 전달");
    } else {
        if (session.mainCallState?.id === orderId) {
            session.mainCallState = null;
        } else {
            const subIndex = session.subCalls.findIndex(c => c.id === orderId);
            if (subIndex > -1) {
                session.subCalls.splice(subIndex, 1);
            }
        }

        logRoadmapEvent("서버", "관제탑에게 콜이 삭제되었음(order-canceled) 정보 전달");
        io.to(userId).emit("order-canceled", orderId);

        if (!session.activeFilter.isActive || session.activeFilter.isSharedMode) {
            const resetFilter: Partial<AutoDispatchFilter> = { isActive: true };

            if (!session.mainCallState && session.subCalls.length === 0) {
                // 잡은 콜이 하나도 안 남았을 경우 → 완전히 초기화 (EMPTY)
                resetFilter.isSharedMode = false;
                resetFilter.dispatchPhase = 'STANDBY';
                resetFilter.driverAction = 'WAITING';
                logRoadmapEvent("서버", "모든 콜이 취소되어 필터를 완전 초기화(STANDBY)합니다.");
            } else {
                // 본콜이 남아있는 경우 → 현재 상태(LOADING/DRIVING)를 그대로 유지하고 탐색만 재개
                logRoadmapEvent("서버", `본콜이 유지 중이므로 현재 상태(${session.activeFilter.dispatchPhase})를 유지하며 탐색을 재개합니다.`);
            }

            updateActiveFilter(userId, resetFilter, io);
            logRoadmapEvent("서버", "앱폰 및 관제탑에게 탐색 재개(filter-updated) 정보 전달");
        }
        session.pendingOrdersData.delete(orderId);

        recalculateActiveKakaoRoute(userId, io);
    }

    console.log(`🛡️ [서버] 결재 완료(Keep/Cancel) 직후: 캐시 된 해당 오더(${orderId}) 메모리의 생명주기(TTL) 만료 및 가비지 컬렉션(GC) 삭제 처리 완료`);
    return { success: true, action };
}

/** [필수#1] 최초 오더 평가: 지오코딩 + 카카오 경로 연산 + 꿀/콜/똥 판정 (detail.ts에서 추출) */
export async function evaluateNewOrder(userId: string, securedOrder: SecuredOrder | PendingOrder, io: any) {
    const session = getUserSession(userId);
    let timeExt = "카카오 연산 실패";
    const reasons: string[] = [];  // 🔍 모든 단점/패널티 사유를 여기에 수집 (Non-Short-Circuit)
    const pros: string[] = [];     // ✅ 모든 장점/긍정 사유를 여기에 수집

    // "미상" 타이틀 덮어쓰기: 정밀 주소가 있으면 교체
    if (securedOrder.pickupDetails?.[0]?.addressDetail) {
        securedOrder.pickup = securedOrder.pickupDetails[0].addressDetail;
    }
    if (securedOrder.dropoffDetails?.[0]?.addressDetail) {
        securedOrder.dropoff = securedOrder.dropoffDetails[0].addressDetail;
    }

    console.log(`\n======================================================`);
    console.log(`[서버-사이드 카카오 연산] 🚀 ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

    try {
        const hasApiKey = !!process.env.KAKAO_REST_API_KEY;
        if (hasApiKey) {
            // ━━━ Stage 1: 형상 필터 검증 (Non-Short-Circuit — 여기서 return 하지 않음) ━━━
            const filter = session.activeFilter;

            // 1) 차종 검사
            if (filter.allowedVehicleTypes.length > 0 && securedOrder.vehicleType) {
                if (!filter.allowedVehicleTypes.includes(securedOrder.vehicleType)) {
                    reasons.push(`차종(${securedOrder.vehicleType}) 불일치`);
                } else {
                    pros.push(`차종(${securedOrder.vehicleType}) 일치`);
                }
            }

            // 2) 첫짐 절대 하한가 검사 (EMPTY 상태일 때만)
            if (filter.dispatchPhase === 'STANDBY' && filter.minFare > 0 && securedOrder.fare > 0) {
                if (securedOrder.fare < filter.minFare) {
                    reasons.push(`첫짐 절대하한가 미달 (${filter.minFare.toLocaleString()}원)`);
                    console.log(`   - 💸 [첫짐 하한가] 똥콜 — 실제 ${securedOrder.fare.toLocaleString()}원 < 절대하한 ${filter.minFare.toLocaleString()}원`);
                } else {
                    pros.push(`첫짐 절대하한가 통과`);
                }
            }

            // 3) 최대 운임 검사
            if (filter.maxFare > 0 && filter.maxFare < 1000000 && securedOrder.fare > 0) {
                if (securedOrder.fare > filter.maxFare) {
                    reasons.push(`요금(${(securedOrder.fare / 10000).toFixed(1)}만) 초과`);
                }
            }

            // 4) 제외 키워드 검사 (착불, 수거, 까대기 등)
            if (filter.excludedKeywords.length > 0) {
                const rawText = `${securedOrder.pickup} ${securedOrder.dropoff} ${securedOrder.detailMemo || ''} ${securedOrder.rawText || ''}`;
                let hasExcluded = false;
                for (const kw of filter.excludedKeywords) {
                    if (kw && rawText.includes(kw)) {
                        reasons.push(`제외키워드(${kw}) 감지`);
                        hasExcluded = true;
                    }
                }
                if (!hasExcluded) {
                    pros.push(`제외키워드 없음`);
                }
            }

            // 5) 도착지 키워드 검사 (합짐 모드일 때)
            if (filter.isSharedMode && filter.destinationKeywords.length > 0) {
                const dropoffText = securedOrder.dropoff || '';
                const matched = filter.destinationKeywords.some(kw => dropoffText.includes(kw));
                if (!matched) {
                    reasons.push(`도착지(${dropoffText.substring(0, 10)}) 회랑 이탈`);
                } else {
                    pros.push(`도착지 회랑 적중`);
                }
            }

            console.log(`   - 🔍 [Stage 1] 형상 필터 검증 완료: ${reasons.length === 0 ? '✅ 통과' : `❌ ${reasons.join(', ')}`}`);
            // ━━━ Stage 1 끝 — return 하지 않고 Stage 2(지오코딩+카카오)로 계속 진행 ━━━

            logRoadmapEvent("서버", "🛡️ 주소 3중 폴백 (괄호제거 ➡️ 주소검색 ➡️ 키워드 ➡️ 절사) 연산");

            // 1.5단계: 지오코딩 (텍스트 주소를 X, Y 좌표로 변환)
            if (!securedOrder.pickupX || !securedOrder.pickupY) {
                const bestPickupQuery = securedOrder.pickupDetails?.[0]?.addressDetail || securedOrder.pickup;
                const pCoord = await geocodeAddress(bestPickupQuery);
                console.log(`🌍 [Geocoding] 상차지 변환: '${bestPickupQuery}' -> ${pCoord ? `X:${pCoord.x}, Y:${pCoord.y}` : '실패(null)'}`);
                if (pCoord) {
                    securedOrder.pickupX = pCoord.x;
                    securedOrder.pickupY = pCoord.y;
                }
            }
            if (!securedOrder.dropoffX || !securedOrder.dropoffY) {
                const bestDropoffQuery = securedOrder.dropoffDetails?.[0]?.addressDetail || securedOrder.dropoff;
                const dCoord = await geocodeAddress(bestDropoffQuery);
                console.log(`🌍 [Geocoding] 하차지 변환: '${bestDropoffQuery}' -> ${dCoord ? `X:${dCoord.x}, Y:${dCoord.y}` : '실패(null)'}`);
                if (dCoord) {
                    securedOrder.dropoffX = dCoord.x;
                    securedOrder.dropoffY = dCoord.y;
                }
            }

            logRoadmapEvent("서버", "카카오 지오코딩으로 반환된 출발지/도착지 X/Y 좌표 메모리 갱신 연산");
            // 좌표 보존
            session.pendingOrdersData.set(securedOrder.id, securedOrder as PendingOrder);

            if (securedOrder.pickupX && securedOrder.dropoffY) {
                const routingOptions = getKakaoRoutingOptions(userId);

                if (!session.mainCallState) {
                    // 첫짐: 단독 주행 연산
                    logRoadmapEvent("서버", "시간/통행료를 바탕으로 콜의 실수익률(기회비용) 연산");
                    console.log(`   - 💡 상태: [첫짐] 단독 주행 연산`);
                    const result = await calculateSoloRoute(
                        securedOrder.pickupX, securedOrder.pickupY!,
                        securedOrder.dropoffX!, securedOrder.dropoffY,
                        session.driverLocation,
                        routingOptions.defaultPriority,
                        routingOptions.carType
                    );
                    const durationMin = Math.round(result.duration / 60);
                    const distKm = (result.distance / 1000).toFixed(1);
                    let recommend = "'콜'";
                    if (durationMin <= DISPATCH_CONFIG.SOLO_HONEY_TIME_MAX) recommend = "'꿀'";
                    else if (durationMin >= DISPATCH_CONFIG.SOLO_SHIT_TIME_MIN) recommend = "'똥'";

                    // Stage 2: 카카오 Solo 경로 — 장/단점 양면 수집
                    if (durationMin >= DISPATCH_CONFIG.SOLO_SHIT_TIME_MIN) {
                        reasons.push(`운행시간(${durationMin}분) 초과`);
                    } else if (durationMin <= DISPATCH_CONFIG.SOLO_HONEY_TIME_MAX) {
                        pros.push(`운행시간(${durationMin}분) 양호 🍯`);
                    } else {
                        pros.push(`운행시간(${durationMin}분) 보통`);
                    }

                    timeExt = `단독 ${distKm}km, ${durationMin}분 ${recommend}`;
                    securedOrder.routePolyline = result.polyline;
                    securedOrder.totalDistanceKm = parseFloat(distKm);
                    securedOrder.totalDurationMin = durationMin;
                    securedOrder.kakaoSoloDistanceKm = parseFloat(distKm);
                    securedOrder.kakaoSoloDurationMin = durationMin;

                    const appDist = result.approachDistance ? (result.approachDistance / 1000).toFixed(1) : '?';
                    const appTime = result.approachDuration ? Math.round(result.approachDuration / 60) : '?';
                    console.log(`   - ⏱️ 결과: ${timeExt} (현위치접근: ${appDist}km, ${appTime}분)`);
                    console.log(`   - 🗺️ 궤적 길이 (Solo): ${securedOrder.routePolyline?.length || '없음'}`);

                } else if (session.mainCallState.pickupX && session.mainCallState.dropoffY) {
                    // 합짐: 우회 동선 연산
                    logRoadmapEvent("서버", "기존 직진 시 대비 추가 소모 시간(+15분) 및 거리(+6km) 패널티 산출");
                    console.log(`   - 💡 상태: [합짐] 우회 동선 연산`);
                    console.log(`   - 기존 본콜: ${session.mainCallState.pickup} ➡️ ${session.mainCallState.dropoff}`);
                    console.log(`   - 추가 경유: ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

                    // 단일 콜 값 (추가 API 호출 방지 및 쿼터 절약을 위해 안드로이드에서 파싱한 거리값 재활용)
                    // (앱에서 '거리: 52.9' 처럼 파싱된 distanceKm이 이미 존재합니다.)
                    securedOrder.kakaoSoloDistanceKm = securedOrder.distanceKm || 0;
                    // 소요시간은 대략 도심 평균(시속 본콜 환산 기준)으로 유추하거나, 제외할 수 있습니다. 
                    // 여기서는 1km당 1.5분(40km/h) 정도로 러프하게 유추합니다.
                    securedOrder.kakaoSoloDurationMin = securedOrder.distanceKm ? Math.round(securedOrder.distanceKm * 1.5) : 0;

                    // OSRM 무료 엔진 호출을 활용한 단독 주행 연산 (UI 표출 우선 순위값 확보용)
                    try {
                        const osrmResult = await fetchRealWorldRoute([
                            { name: 'pickup', centroid: [securedOrder.pickupX, securedOrder.pickupY!] },
                            { name: 'dropoff', centroid: [securedOrder.dropoffX!, securedOrder.dropoffY!] }
                        ]);
                        if (osrmResult) {
                            securedOrder.osrmSoloDistanceKm = osrmResult.totalDistanceKm;
                            securedOrder.osrmSoloDurationMin = Math.round(osrmResult.durationSeconds / 60);
                        } else {
                            securedOrder.osrmError = "경로결과 없음";
                        }
                    } catch (osrmError: any) {
                        console.warn("OSRM 단독 경로 연산 실패 (방어 로직 발동)", osrmError.message);
                        securedOrder.osrmError = osrmError.message || "통신오류/타임아웃";
                    }

                    const allPickups = [
                        { x: session.mainCallState.pickupX!, y: session.mainCallState.pickupY! },
                        ...session.subCalls.map(c => ({ x: c.pickupX!, y: c.pickupY! })),
                        { x: securedOrder.pickupX, y: securedOrder.pickupY! }
                    ];
                    const allDropoffs = [
                        { x: session.mainCallState.dropoffX!, y: session.mainCallState.dropoffY! },
                        ...session.subCalls.map(c => ({ x: c.dropoffX!, y: c.dropoffY! })),
                        { x: securedOrder.dropoffX!, y: securedOrder.dropoffY }
                    ];

                    const startLoc = session.driverLocation || allPickups[0];
                    const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);

                    const mergedDest = sortedDropoffs.pop()!;
                    const waypoints = [...sortedPickups, ...sortedDropoffs];

                    const result = await calculateDetourRoute(
                        session.mainCallState.dropoffX!, session.mainCallState.dropoffY!,
                        session.mainCallState.pickupX!, session.mainCallState.pickupY!,
                        mergedDest.x, mergedDest.y,
                        waypoints,
                        session.driverLocation,
                        routingOptions.defaultPriority,
                        routingOptions.carType
                    );

                    let recommend = "'콜'";
                    const distDiff = parseFloat(result.distDiffKm);
                    if (result.timeDiffMin <= DISPATCH_CONFIG.DETOUR_HONEY_TIME_MAX && distDiff <= DISPATCH_CONFIG.DETOUR_HONEY_DIST_MAX) recommend = "'꿀'";
                    else if (result.timeDiffMin >= DISPATCH_CONFIG.DETOUR_SHIT_TIME_MIN || distDiff >= DISPATCH_CONFIG.DETOUR_SHIT_DIST_MIN) recommend = "'똥'";

                    // Stage 2: 카카오 Detour 경로 — 장/단점 양면 수집 (시간/거리 각각 독립 체크)
                    if (result.timeDiffMin >= DISPATCH_CONFIG.DETOUR_SHIT_TIME_MIN) {
                        reasons.push(`우회시간(+${result.timeDiffMin}분) 초과`);
                    } else if (result.timeDiffMin <= DISPATCH_CONFIG.DETOUR_HONEY_TIME_MAX) {
                        pros.push(`우회시간(+${result.timeDiffMin}분) 양호 🍯`);
                    } else {
                        pros.push(`우회시간(+${result.timeDiffMin}분) 보통`);
                    }
                    if (distDiff >= DISPATCH_CONFIG.DETOUR_SHIT_DIST_MIN) {
                        reasons.push(`우회거리(+${result.distDiffKm}km) 초과`);
                    } else if (distDiff <= DISPATCH_CONFIG.DETOUR_HONEY_DIST_MAX) {
                        pros.push(`우회거리(+${result.distDiffKm}km) 양호 🍯`);
                    } else {
                        pros.push(`우회거리(+${result.distDiffKm}km) 보통`);
                    }

                    const signDist = distDiff > 0 ? "+" : "";
                    const signTime = result.timeDiffMin > 0 ? "+" : "";

                    timeExt = `${signDist}${result.distDiffKm}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
                    securedOrder.routePolyline = result.merged.polyline;
                    securedOrder.totalDistanceKm = result.merged.distance / 1000;
                    securedOrder.totalDurationMin = Math.round(result.merged.duration / 60);
                    securedOrder.sectionEtas = result.merged.sectionEtas;

                    const appDist = result.merged.approachDistance ? (result.merged.approachDistance / 1000).toFixed(1) : '?';
                    const appTime = result.merged.approachDuration ? Math.round(result.merged.approachDuration / 60) : '?';
                    console.log(`   - ⚠️ 패널티 결과: ${timeExt} (현위치접근: ${appDist}km, ${appTime}분)`);
                    console.log(`   - 🗺️ 궤적 길이 (Detour): ${securedOrder.routePolyline?.length || '없음'}`);
                    console.log(`🛡️ [서버] 우회 노선 연산 중: 카카오 TSP 연산 결과가 지정된 회랑 반경(Corridor Radius)을 이탈했는지 평가 감지 완료`);
                } else {
                    reasons.push(`본콜 좌표 누락`);
                    console.log(`   - ❌ 본콜은 있으나 좌표값이 누락됨.`);
                }
            } else {
                reasons.push(`지오코딩 실패(좌표 변환 불가)`);
                console.log(`   - ❌ 지오코딩 실패: X/Y 좌표 변환 불가능`);
            }
        } else {
            reasons.push(`API KEY 부재`);
            console.log(`   - ❌ KAKAO_REST_API_KEY 서버 환경 변수 누락`);
        }
    } catch (error: any) {
        console.error("서버-사이드 카카오 연산 에러:", error);
        const errMsg = error.message || '알 수 없는 오류';
        timeExt = `카카오 연산 실패: ${errMsg}`;
        reasons.push(`카카오 연산 실패(${errMsg})`);
    }
    console.log(`======================================================\n`);

    logRoadmapEvent("서버", "경로 폴리라인 및 최종 수익성(콜/꿀/똥) 라벨링 연산");
    securedOrder.kakaoTimeExt = timeExt;

    // 💰 다이내믹 요율 계산 (Stage 3: 수익성 판정)
    if (securedOrder.kakaoSoloDistanceKm && securedOrder.fare) {
        try {
            const pricing = loadPricingConfig(userId);
            const routingOpts = getKakaoRoutingOptions(userId);
            const fareResult = calculateDynamicFare(
                securedOrder.kakaoSoloDistanceKm,
                securedOrder.vehicleType || undefined,
                routingOpts.vehicleType,
                pricing
            );

            const actualFare = securedOrder.fare;
            if (actualFare < fareResult.minAcceptable) {
                const diff = actualFare - fareResult.minAcceptable;
                reasons.push(`요율 미달 (적정: ${fareResult.fairPrice.toLocaleString()}원, 하한: ${fareResult.minAcceptable.toLocaleString()}원, 실제: ${actualFare.toLocaleString()}원, ${diff.toLocaleString()}원)`);
                console.log(`   - 💸 [요율 판정] 똥콜 — 실제 ${actualFare.toLocaleString()}원 < 하한 ${fareResult.minAcceptable.toLocaleString()}원`);
            } else if (actualFare >= fareResult.fairPrice) {
                pros.push(`꿀콜 🍯 (적정 ${fareResult.fairPrice.toLocaleString()}원 이상)`);
                console.log(`   - 🍯 [요율 판정] 꿀콜 — 실제 ${actualFare.toLocaleString()}원 ≥ 적정 ${fareResult.fairPrice.toLocaleString()}원`);
            } else {
                console.log(`   - ✅ [요율 판정] 적정 범위 — 실제 ${actualFare.toLocaleString()}원 (하한 ${fareResult.minAcceptable.toLocaleString()} ~ 적정 ${fareResult.fairPrice.toLocaleString()})`);
            }
        } catch (e) {
            console.error(`   - ⚠️ [요율 판정] 계산 실패:`, e);
        }
    }

    // 🔍 종합 평가 결과 주입 (Stage 1 + Stage 2 + Stage 3 사유 통합)
    securedOrder.rejectionReasons = reasons;
    securedOrder.approvalReasons = pros;
    securedOrder.isRejected = reasons.length > 0;
    if (reasons.length > 0) {
        console.log(`   - 💩 [종합 평가] 똥콜 판정 (${reasons.length}건): ${reasons.join(' | ')}`);
    } else {
        console.log(`   - ✅ [종합 평가] 필터/경로 모두 통과`);
    }
    if (pros.length > 0) {
        console.log(`   - 👍 [장점 수집] (${pros.length}건): ${pros.join(' | ')}`);
    }

    if (io) {
        console.log(`📤 [Socket 푸시] order-evaluated (${securedOrder.id})`);
        io.to(userId).emit("order-evaluated", securedOrder);

        if (timeExt.includes("실패")) {
            logRoadmapEvent("서버", "관제탑에게 카카오 에러 상태(order-evaluated error) 정보 전달");
        } else {
            logRoadmapEvent("서버", "관제탑에게 최종 판독된 오더 정보(order-evaluated) 전달");
        }

        console.log(`🔎 [카카오 연산 완료] ${timeExt} | Polyline 길이: ${securedOrder.routePolyline?.length || 0}`);
    }
}

/**
 * [방안 1] 서버 재시작 시 DB에서 콜을 불러와 1회성 카카오 궤적 복구 연산
 */
export async function restoreAndRecalculateSession(userId: string, io: any) {
    const session = getUserSession(userId);
    if (session.isRestored) return; // 이미 복구했으면 스킵
    session.isRestored = true;

    try {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        // 1. orders와 places 테이블을 조인하여 오늘 확정(confirmed)된 콜과 X, Y 좌표를 불러옵니다.
        const rows = db.prepare(`
            SELECT o.*, 
                   pPlace.x as pickupX, pPlace.y as pickupY,
                   dPlace.x as dropoffX, dPlace.y as dropoffY
            FROM orders o
            LEFT JOIN orderStops pStop ON pStop.orderId = o.id AND pStop.stopType = 'pickup'
            LEFT JOIN places pPlace ON pStop.placeId = pPlace.id
            LEFT JOIN orderStops dStop ON dStop.orderId = o.id AND dStop.stopType = 'dropoff'
            LEFT JOIN places dPlace ON dStop.placeId = dPlace.id
            WHERE o.userId = ? AND o.status = 'confirmed' AND o.timestamp >= ?
            ORDER BY o.timestamp ASC
        `).all(userId, todayStart.toISOString()) as any[];

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

        const activeCalls = Array.from(session.pendingOrdersData.values()) as MyOrder[];
        session.mainCallState = activeCalls[0];
        session.subCalls = activeCalls.slice(1);

        const routingOptions = getKakaoRoutingOptions(userId);

        // 3. 본콜 카카오 궤적 1회 복구
        if (session.mainCallState && session.mainCallState.pickupX && session.mainCallState.dropoffX) {
            try {
                const res = await calculateSoloRoute(
                    session.mainCallState.pickupX, session.mainCallState.pickupY!,
                    session.mainCallState.dropoffX, session.mainCallState.dropoffY!,
                    session.driverLocation,
                    routingOptions.defaultPriority,
                    routingOptions.carType
                );
                session.mainCallState.routePolyline = res.polyline;
                session.mainCallState.sectionEtas = res.sectionEtas;
            } catch(e) {
                console.error('🗺️ [본콜 복구 연산 실패]', e);
            }
        }

        // 4. 합짐(서브콜) 카카오 궤적 1회 복구
        if (session.subCalls.length > 0 && session.mainCallState) {
            try {
                const activeMain = session.mainCallState;
                const activeSubs = session.subCalls;
                const allPickups = [
                    { x: activeMain.pickupX!, y: activeMain.pickupY! },
                    ...activeSubs.map(c => ({ x: c.pickupX!, y: c.pickupY! }))
                ];
                const allDropoffs = [
                    { x: activeMain.dropoffX!, y: activeMain.dropoffY! },
                    ...activeSubs.map(c => ({ x: c.dropoffX!, y: c.dropoffY! }))
                ];
                const startLoc = allPickups[0];
                const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);
                const mergedDest = sortedDropoffs.pop()!;
                const waypoints = [...sortedPickups, ...sortedDropoffs];

                const calcResult = await calculateDetourRoute(
                    activeMain.dropoffX!, activeMain.dropoffY!,
                    activeMain.pickupX!, activeMain.pickupY!,
                    mergedDest.x, mergedDest.y,
                    waypoints,
                    session.driverLocation,
                    routingOptions.defaultPriority,
                    routingOptions.carType
                );

                const lastSub = session.subCalls[session.subCalls.length - 1];
                lastSub.routePolyline = calcResult.merged.polyline;
                lastSub.sectionEtas = calcResult.merged.sectionEtas;
            } catch(e) {
                console.error('🗺️ [합짐 복구 연산 실패]', e);
            }
        }

        logRoadmapEvent("서버", `[Session DB Load] 궤적 복구 연산 완료. 클라이언트로 sync-active-orders 강제 전송`);
        
        // 5. 프론트엔드로 복구된 궤적 즉시 전송
        if (io) {
            io.to(userId).emit("sync-active-orders", Array.from(session.pendingOrdersData.values()));
        }

    } catch (err) {
        console.error('🚨 [restoreAndRecalculateSession] 오류 발생:', err);
    }
}
