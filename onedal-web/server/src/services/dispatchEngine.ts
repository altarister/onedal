import { mapVehicleToKakaoCarType } from "@onedal/shared";
import type { DispatchConfirmResponse, SecuredOrder, AutoDispatchFilter } from "@onedal/shared";
import { geocodeAddress, calculateSoloRoute, calculateDetourRoute } from "../routes/kakaoUtil";
import { getUserSession } from "../state/userSessionStore";
import { optimizeWaypoints } from "../utils/routeOptimizer";
import { getCorridorRegions } from "../services/geoService";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../config/dispatchConfig";
import db from "../db";

function getKakaoRoutingOptions(userId: string) {
    const row = db.prepare("SELECT vehicle_type, default_priority FROM user_settings WHERE user_id = ?").get(userId) as any;
    const vehicleTypeStr = row?.vehicle_type || '1t';
    return {
        carType: mapVehicleToKakaoCarType(vehicleTypeStr),
        defaultPriority: row?.default_priority || "RECOMMEND"
    };
}

/** 기존 평가 중이던 콜을 외부에서 강제 삭제할 때 호출 */
export function forceCancelEvaluatingOrder(userId: string, orderId: string, io: any) {
    const session = getUserSession(userId);
    if (session.pendingOrdersData.has(orderId)) {
        session.pendingOrdersData.delete(orderId);
    }
    if (session.pendingDetailRequests.has(orderId)) {
        const heldRes = session.pendingDetailRequests.get(orderId);
        session.pendingDetailRequests.delete(orderId);
        if (heldRes && !heldRes.headersSent) {
            heldRes.status(408).json({ error: "Background Force Cleaned" });
        }
    }
    Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
        if (v === orderId) session.deviceEvaluatingMap.delete(k);
    });
    if (io) {
        console.log(`📤 [Socket 푸시] order-canceled (${orderId}) to ${userId}`);
        io.to(userId).emit("order-canceled", orderId);
    }
}

/** 취소/방출 등 메모리 변동 발생 시, 오더가 남아있다면 카카오 경로를 백그라운드에서 재탐색하여 폴리라인 및 소요시간을 복원합니다. */
export async function recalculateActiveKakaoRoute(userId: string, io: any) {
    const session = getUserSession(userId);
    if (!session.mainCallState && session.subCalls.length > 0) {
        session.mainCallState = session.subCalls.shift() || null;
    }

    if (session.mainCallState) {
        try {
            const apiKey = process.env.KAKAO_REST_API_KEY || "";
            if (!apiKey) return;

            const routingOptions = getKakaoRoutingOptions(userId);

            if (session.subCalls.length === 0) {
                // 단독 오더로 복귀
                const res = await calculateSoloRoute(
                    apiKey,
                    session.mainCallState.pickupX!, session.mainCallState.pickupY!,
                    session.mainCallState.dropoffX!, session.mainCallState.dropoffY!,
                    session.driverLocation,
                    routingOptions.defaultPriority,
                    routingOptions.carType
                );
                session.mainCallState.routePolyline = res.polyline;
                session.mainCallState.totalDistanceKm = Math.round(res.distance / 1000);
                session.mainCallState.totalDurationMin = Math.round(res.duration / 60);

                if (res.approachDistance && res.approachDuration) {
                    console.log(`🗺️ [사후 재계산 - 첫짐] 현위치 접근: ${res.approachDistance}m (${res.approachDuration}초) / 총 이동: ${res.distance}m`);
                }
            } else {
                // 스마트 라우팅 (경유지 최적화 - TSP)
                const allPickups = [
                    { x: session.mainCallState.pickupX!, y: session.mainCallState.pickupY! },
                    ...session.subCalls.map(c => ({ x: c.pickupX!, y: c.pickupY! }))
                ];
                const allDropoffs = [
                    { x: session.mainCallState.dropoffX!, y: session.mainCallState.dropoffY! },
                    ...session.subCalls.map(c => ({ x: c.dropoffX!, y: c.dropoffY! }))
                ];

                const startLoc = session.driverLocation || allPickups[0];
                const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);
                
                const mergedDest = sortedDropoffs.pop()!;
                const waypoints = [...sortedPickups, ...sortedDropoffs];

                const result = await calculateDetourRoute(
                    apiKey,
                    session.mainCallState.dropoffX!, session.mainCallState.dropoffY!, 
                    session.mainCallState.pickupX!, session.mainCallState.pickupY!,   
                    mergedDest.x, mergedDest.y,                       
                    waypoints,
                    session.driverLocation,
                    routingOptions.defaultPriority,
                    routingOptions.carType
                );
                
                const lastSub = session.subCalls[session.subCalls.length - 1]; 
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
    }
    
    if (io) {
        const payload = Array.from(session.pendingOrdersData.values());
        io.to(userId).emit("sync-active-orders", payload);
    }
}

/** 카카오 경로 재탐색 핸들러 */
export async function recalculateKakaoRoute(userId: string, orderId: string, priority: string, io: any) {
    const session = getUserSession(userId);
    const securedOrder = session.pendingOrdersData.get(orderId);
    if (!securedOrder) {
        console.warn(`[Recalculate] 메모리에 존재하지 않는 오더입니다. (ID: ${orderId})`);
        return { success: false, msg: "오더 소멸됨" };
    }
    
    const apiKey = process.env.KAKAO_REST_API_KEY;
    if (!apiKey) return { success: false, msg: "API KEY 부재" };
    
    try {
        let timeExt = "카카오 연산 실패";
        let isDetour = false;
        
        const currentOrders = Array.from(session.pendingOrdersData.values());
        let previousOrders = currentOrders.filter(o => o.id !== orderId && o.status === 'confirmed');
        if (previousOrders.length > 0) isDetour = true;
        
        const routingOptions = getKakaoRoutingOptions(userId);
        
        if (!isDetour) {
            const result = await calculateSoloRoute(
                apiKey,
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
                apiKey,
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
        
        securedOrder.kakaoTimeExt = timeExt;
        
        if (securedOrder.status === 'confirmed' || session.mainCallState?.id === securedOrder.id || session.subCalls.some(c => c.id === securedOrder.id)) {
            syncCorridorFilter(userId, io);
        }

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
    if (session.subCalls.length > 0) {
        polylineToUse = session.subCalls[session.subCalls.length - 1].routePolyline;
    } else if (session.mainCallState) {
        polylineToUse = session.mainCallState.routePolyline;
    }

    if (polylineToUse && polylineToUse.length > 0) {
        const cRadius = session.activeFilter.corridorRadiusKm || 10;
        const dRadius = session.activeFilter.destinationRadiusKm;
        const regions = getCorridorRegions(polylineToUse, cRadius, dRadius);
        
        if (regions && regions.flat.length > 0) {
            session.activeFilter = { 
                ...session.activeFilter,
                destinationKeywords: regions.flat,
                destinationGroups: regions.grouped,
                customCityFilters: regions.customCityFilters
            };
            if (io) {
                io.to(userId).emit("filter-updated", session.activeFilter);
            }
        }
    }
};

/** 관제사 최종 판정 처리 */
export async function handleDecision(userId: string, orderId: string, action: 'KEEP' | 'CANCEL', io: any) {
    const session = getUserSession(userId);
    const heldRes = session.pendingDetailRequests.get(orderId);

    if (heldRes && !heldRes.headersSent) {
        session.pendingDetailRequests.delete(orderId);
        const deviceResponse: DispatchConfirmResponse = { deviceId: 'server', action };
        logRoadmapEvent("서버", `[HTTP 폴링] 응답 /orders/detail ${action === 'KEEP' ? '유지' : '취소'} 정보 전송`);
        heldRes.json(deviceResponse);
    }

    Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
        if (v === orderId) session.deviceEvaluatingMap.delete(k);
    });

    if (action === 'CANCEL' && io) {
        session.pendingOrdersData.delete(orderId);
    }

    if (action === 'KEEP') {
        const cachedOrder = session.pendingOrdersData.get(orderId);
        
        if (!cachedOrder) return { success: false, action };

        let destinationKeywords = session.activeFilter.destinationKeywords;

        if (cachedOrder && cachedOrder.routePolyline) {
            syncCorridorFilter(userId, null);
            destinationKeywords = session.activeFilter.destinationKeywords;
        }
        if (cachedOrder) {
            cachedOrder.status = 'confirmed';
        }

        const isAlreadyMain = session.mainCallState?.id === orderId;
        const isAlreadySub = session.subCalls.some(c => c.id === orderId);

        if (!isAlreadyMain && !isAlreadySub && cachedOrder) {
            if (!session.mainCallState) {
                session.mainCallState = cachedOrder;
            } else {
                session.subCalls.push(cachedOrder);
                try {
                    const apiKey = process.env.KAKAO_REST_API_KEY;
                    if (apiKey) {
                        const allPickups = [
                            { x: session.mainCallState.pickupX!, y: session.mainCallState.pickupY! },
                            ...session.subCalls.map(c => ({ x: c.pickupX!, y: c.pickupY! }))
                        ];
                        const allDropoffs = [
                            { x: session.mainCallState.dropoffX!, y: session.mainCallState.dropoffY! },
                            ...session.subCalls.map(c => ({ x: c.dropoffX!, y: c.dropoffY! }))
                        ];
                        
                        const startLoc = allPickups[0]; 
                        const { sortedPickups, sortedDropoffs } = optimizeWaypoints(startLoc, allPickups, allDropoffs);
                        
                        const mergedDest = sortedDropoffs.pop()!;
                        const waypoints = [...sortedPickups, ...sortedDropoffs];
                        
                        const routingOptions = getKakaoRoutingOptions(userId);
                        
                        const calcResult = await calculateDetourRoute(
                            apiKey,
                            session.mainCallState.dropoffX!, session.mainCallState.dropoffY!,
                            session.mainCallState.pickupX!, session.mainCallState.pickupY!,
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
                } catch(e) {
                    console.error('🗺️ [사후 병합 궤적 생성 실패]', e);
                }
            }
        }

        io.to(userId).emit("order-confirmed", orderId);

        session.activeFilter = { 
            ...session.activeFilter,
            isSharedMode: true, 
            isActive: true, 
            destinationKeywords,
            allowedVehicleTypes: ["다마스", "라보", "오토바이"] 
        };
        logRoadmapEvent("서버", "합짐 필터로 설정값 업데이트 (합짐 사냥용)");
        io.to(userId).emit("filter-updated", session.activeFilter);
    } else {
        if (session.mainCallState?.id === orderId) {
            session.mainCallState = null;
        } else {
            const subIndex = session.subCalls.findIndex(c => c.id === orderId);
            if (subIndex > -1) {
                session.subCalls.splice(subIndex, 1);
            }
        }

        io.to(userId).emit("order-canceled", orderId);

        if (!session.activeFilter.isActive || session.activeFilter.isSharedMode) {
            const resetFilter: Partial<AutoDispatchFilter> = { isActive: true };
            if (!session.mainCallState && session.subCalls.length === 0) {
                resetFilter.isSharedMode = false;
                resetFilter.allowedVehicleTypes = [];
            }
            session.activeFilter = { ...session.activeFilter, ...resetFilter };
            logRoadmapEvent("서버", "첫콜 필터로 설정값 업데이트");
            io.to(userId).emit("filter-updated", session.activeFilter);
        }
        session.pendingOrdersData.delete(orderId);
        
        recalculateActiveKakaoRoute(userId, io);
    }

    return { success: true, action };
}

/** [필수#1] 최초 오더 평가: 지오코딩 + 카카오 경로 연산 + 꿀/콜/똥 판정 (detail.ts에서 추출) */
export async function evaluateNewOrder(userId: string, securedOrder: SecuredOrder, io: any) {
    const session = getUserSession(userId);
    let timeExt = "카카오 연산 실패";

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
        const apiKey = process.env.KAKAO_REST_API_KEY;
        if (apiKey) {
            logRoadmapEvent("서버", "🛡️ [카카오 API 3중 폴백] 괄호제거 ➡️ 주소검색 ➡️ 키워드검색 ➡️ 4어절 절사");

            // 1.5단계: 지오코딩 (텍스트 주소를 X, Y 좌표로 변환)
            if (!securedOrder.pickupX || !securedOrder.pickupY) {
                const bestPickupQuery = securedOrder.pickupDetails?.[0]?.addressDetail || securedOrder.pickup;
                const pCoord = await geocodeAddress(apiKey, bestPickupQuery);
                console.log(`🌍 [Geocoding] 상차지 변환: '${bestPickupQuery}' -> ${pCoord ? `X:${pCoord.x}, Y:${pCoord.y}` : '실패(null)'}`);
                if (pCoord) {
                    securedOrder.pickupX = pCoord.x;
                    securedOrder.pickupY = pCoord.y;
                }
            }
            if (!securedOrder.dropoffX || !securedOrder.dropoffY) {
                const bestDropoffQuery = securedOrder.dropoffDetails?.[0]?.addressDetail || securedOrder.dropoff;
                const dCoord = await geocodeAddress(apiKey, bestDropoffQuery);
                console.log(`🌍 [Geocoding] 하차지 변환: '${bestDropoffQuery}' -> ${dCoord ? `X:${dCoord.x}, Y:${dCoord.y}` : '실패(null)'}`);
                if (dCoord) {
                    securedOrder.dropoffX = dCoord.x;
                    securedOrder.dropoffY = dCoord.y;
                }
            }

            // 좌표 보존
            session.pendingOrdersData.set(securedOrder.id, securedOrder);

            if (securedOrder.pickupX && securedOrder.dropoffY) {
                const routingOptions = getKakaoRoutingOptions(userId);

                if (!session.mainCallState) {
                    // 첫짐: 단독 주행 연산
                    console.log(`   - 💡 상태: [첫짐] 단독 주행 연산`);
                    const result = await calculateSoloRoute(
                        apiKey,
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

                    timeExt = `단독 ${distKm}km, ${durationMin}분 ${recommend}`;
                    securedOrder.routePolyline = result.polyline;
                    securedOrder.totalDistanceKm = parseFloat(distKm);
                    securedOrder.totalDurationMin = durationMin;

                    const appDist = result.approachDistance ? (result.approachDistance/1000).toFixed(1) : '?';
                    const appTime = result.approachDuration ? Math.round(result.approachDuration/60) : '?';
                    console.log(`   - ⏱️ 결과: ${timeExt} (현위치접근: ${appDist}km, ${appTime}분)`);
                    console.log(`   - 🗺️ 궤적 길이 (Solo): ${securedOrder.routePolyline?.length || '없음'}`);

                } else if (session.mainCallState.pickupX && session.mainCallState.dropoffY) {
                    // 합짐: 우회 동선 연산
                    console.log(`   - 💡 상태: [합짐] 우회 동선 연산`);
                    console.log(`   - 기존 본콜: ${session.mainCallState.pickup} ➡️ ${session.mainCallState.dropoff}`);
                    console.log(`   - 추가 경유: ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

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
                        apiKey,
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

                    const signDist = distDiff > 0 ? "+" : "";
                    const signTime = result.timeDiffMin > 0 ? "+" : "";

                    timeExt = `${signDist}${result.distDiffKm}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
                    securedOrder.routePolyline = result.merged.polyline;
                    securedOrder.totalDistanceKm = result.merged.distance / 1000;
                    securedOrder.totalDurationMin = Math.round(result.merged.duration / 60);
                    securedOrder.sectionEtas = result.merged.sectionEtas;

                    const appDist = result.merged.approachDistance ? (result.merged.approachDistance/1000).toFixed(1) : '?';
                    const appTime = result.merged.approachDuration ? Math.round(result.merged.approachDuration/60) : '?';
                    console.log(`   - ⚠️ 패널티 결과: ${timeExt} (현위치접근: ${appDist}km, ${appTime}분)`);
                    console.log(`   - 🗺️ 궤적 길이 (Detour): ${securedOrder.routePolyline?.length || '없음'}`);
                } else {
                    console.log(`   - ❌ 본콜은 있으나 좌표값이 누락됨.`);
                }
            } else {
                console.log(`   - ❌ 지오코딩 실패: X/Y 좌표 변환 불가능`);
            }
        } else {
            console.log(`   - ❌ KAKAO_REST_API_KEY 서버 환경 변수 누락`);
        }
    } catch (error: any) {
        console.error("서버-사이드 카카오 연산 에러:", error);
        if (error.message) {
            timeExt = `카카오 연산 실패: ${error.message}`;
        }
    }
    console.log(`======================================================\n`);

    securedOrder.kakaoTimeExt = timeExt;

    if (io) {
        console.log(`📤 [Socket 푸시] order-evaluated (${securedOrder.id})`);
        io.to(userId).emit("order-evaluated", securedOrder);
        logRoadmapEvent("서버", "[Socket] 경로 및 시간 정보, 수익률 전송");
        console.log(`🔎 [카카오 연산 완료] ${timeExt} | Polyline 길이: ${securedOrder.routePolyline?.length || 0}`);
    }
}
