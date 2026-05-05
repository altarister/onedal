import { PendingOrder, SecuredOrder, MyOrder } from "@onedal/shared";
import { getUserSession } from "../../state/userSessionStore";
import { geocodeAddress, calculateSoloRoute, calculateDetourRoute } from "../../services/kakaoService";
import { optimizeWaypoints } from "../../utils/routeOptimizer";
import { logRoadmapEvent } from "../../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../../config/dispatchConfig";
import { SettingsRepository } from "../../repositories/SettingsRepository";
import { PricingEngine } from "./PricingEngine";
import { IAppPlugin } from "../plugins/IAppPlugin";
import { PluginFactory } from "../plugins/PluginFactory";
import { getActiveCalls } from "../helpers";

export class OrderEvaluator {
    private plugin: IAppPlugin;

    constructor(targetApp: string = 'insung') {
        this.plugin = PluginFactory.getPlugin(targetApp);
    }

    /**
     * 앱에서 올라온 PendingOrder를 심사하여 장/단점(pros/reasons)을 주입합니다.
     */
    public async evaluate(userId: string, securedOrder: SecuredOrder | PendingOrder, io: any): Promise<void> {
        const session = getUserSession(userId);
        const reasons: string[] = [];
        const pros: string[] = [];
        let timeExt = "카카오 연산 실패";

        console.log(`\n======================================================`);
        console.log(`[서버-사이드 카카오 연산] 🚀 ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

        // 1. 주소 정규화 (플러그인 의존)
        if (securedOrder.pickupDetails?.[0]?.addressDetail) {
            securedOrder.pickup = securedOrder.pickupDetails[0].addressDetail;
        }
        if (securedOrder.dropoffDetails?.[0]?.addressDetail) {
            securedOrder.dropoff = securedOrder.dropoffDetails[0].addressDetail;
        }
        securedOrder.pickup = this.plugin.normalizeAddress(securedOrder.pickup);
        securedOrder.dropoff = this.plugin.normalizeAddress(securedOrder.dropoff);

        // Stage 1. 형상 필터
        this.runStage1ShapeFilter(securedOrder, session, reasons, pros);

        // Stage 1.5 지오코딩 및 카카오 연산
        try {
            const hasApiKey = !!process.env.KAKAO_REST_API_KEY;
            if (hasApiKey) {
                logRoadmapEvent("서버", "🛡️ 주소 3중 폴백 (괄호제거 ➡️ 주소검색 ➡️ 키워드 ➡️ 절사) 연산");

                // 지오코딩 (상차지)
                if (!securedOrder.pickupX || !securedOrder.pickupY) {
                    const pCoord = await geocodeAddress(securedOrder.pickup);
                    console.log(`🌍 [Geocoding] 상차지 변환: '${securedOrder.pickup}' -> ${pCoord ? `X:${pCoord.x}, Y:${pCoord.y}` : '실패(null)'}`);
                    if (pCoord) {
                        securedOrder.pickupX = pCoord.x;
                        securedOrder.pickupY = pCoord.y;
                    }
                }

                // 지오코딩 (하차지)
                if (!securedOrder.dropoffX || !securedOrder.dropoffY) {
                    const dCoord = await geocodeAddress(securedOrder.dropoff);
                    console.log(`🌍 [Geocoding] 하차지 변환: '${securedOrder.dropoff}' -> ${dCoord ? `X:${dCoord.x}, Y:${dCoord.y}` : '실패(null)'}`);
                    if (dCoord) {
                        securedOrder.dropoffX = dCoord.x;
                        securedOrder.dropoffY = dCoord.y;
                    }
                }

                // 카카오 라우팅 연산
                if (securedOrder.pickupX && securedOrder.dropoffY) {
                    const routingOptions = SettingsRepository.getKakaoRoutingOptions(userId);
                    const activeCalls = getActiveCalls(session);
                    const activeMain = activeCalls[0];
                    const activeSubs = activeCalls.slice(1);
                    
                    const isSharedEvaluate = activeCalls.length > 0;

                    if (!isSharedEvaluate) {
                        // 단독 오더 연산
                        const result = await calculateSoloRoute(
                            securedOrder.pickupX!, securedOrder.pickupY!,
                            securedOrder.dropoffX!, securedOrder.dropoffY!,
                            session.driverLocation,
                            routingOptions.defaultPriority,
                            routingOptions.carType
                        );

                        // Stage 2 판단
                        if (result.duration >= DISPATCH_CONFIG.SOLO_SHIT_TIME_MIN * 60) {
                            reasons.push(`운행시간(${Math.round(result.duration/60)}분) 초과`);
                        }
                        
                        timeExt = `추천거리 ${Math.round(result.distance / 1000)}km, 소요 ${Math.round(result.duration / 60)}분`;
                        securedOrder.routePolyline = result.polyline;
                        securedOrder.kakaoSoloDistanceKm = parseFloat((result.distance / 1000).toFixed(1));
                        securedOrder.kakaoSoloDurationMin = Math.round(result.duration / 60);
                        securedOrder.totalDistanceKm = securedOrder.kakaoSoloDistanceKm;
                        securedOrder.totalDurationMin = securedOrder.kakaoSoloDurationMin;

                        console.log(`   - 🗺️ 궤적 길이 (Solo): ${securedOrder.routePolyline?.length || '없음'}`);
                    } else {
                        // 합짐(Detour) 연산
                        const allPickups = [
                            { x: activeMain.pickupX!, y: activeMain.pickupY! },
                            ...activeSubs.map(c => ({ x: c.pickupX!, y: c.pickupY! })),
                            { x: securedOrder.pickupX!, y: securedOrder.pickupY! }
                        ];
                        const allDropoffs = [
                            { x: activeMain.dropoffX!, y: activeMain.dropoffY! },
                            ...activeSubs.map(c => ({ x: c.dropoffX!, y: c.dropoffY! })),
                            { x: securedOrder.dropoffX!, y: securedOrder.dropoffY! }
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

                        let recommend = "'콜'";
                        const distDiff = parseFloat(result.distDiffKm);
                        if (result.timeDiffMin <= DISPATCH_CONFIG.DETOUR_HONEY_TIME_MAX && distDiff <= DISPATCH_CONFIG.DETOUR_HONEY_DIST_MAX) recommend = "'꿀'";
                        else if (result.timeDiffMin >= DISPATCH_CONFIG.DETOUR_SHIT_TIME_MIN || distDiff >= DISPATCH_CONFIG.DETOUR_SHIT_DIST_MIN) recommend = "'똥'";

                        if (result.timeDiffMin >= DISPATCH_CONFIG.DETOUR_SHIT_TIME_MIN) {
                            reasons.push(`우회시간(+${result.timeDiffMin}분) 초과`);
                        } else if (result.timeDiffMin <= DISPATCH_CONFIG.DETOUR_HONEY_TIME_MAX) {
                            pros.push(`우회시간(+${result.timeDiffMin}분) 양호 🍯`);
                        } else {
                            pros.push(`우회시간(+${result.timeDiffMin}분) 보통`);
                        }

                        if (distDiff >= DISPATCH_CONFIG.DETOUR_SHIT_DIST_MIN) {
                            reasons.push(`우회거리(+${distDiff}km) 초과`);
                        } else if (distDiff <= DISPATCH_CONFIG.DETOUR_HONEY_DIST_MAX) {
                            pros.push(`우회거리(+${distDiff}km) 양호 🍯`);
                        } else {
                            pros.push(`우회거리(+${distDiff}km) 보통`);
                        }

                        const signDist = distDiff > 0 ? "+" : "";
                        const signTime = result.timeDiffMin > 0 ? "+" : "";
                        timeExt = `${signDist}${distDiff}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
                        securedOrder.routePolyline = result.merged.polyline;
                        securedOrder.totalDistanceKm = result.merged.distance / 1000;
                        securedOrder.totalDurationMin = Math.round(result.merged.duration / 60);
                        securedOrder.sectionEtas = result.merged.sectionEtas;
                        
                        console.log(`   - 🗺️ 궤적 길이 (Detour): ${securedOrder.routePolyline?.length || '없음'}`);
                    }
                } else {
                    reasons.push(`본콜 좌표 누락`);
                    console.log(`   - ❌ 본콜은 있으나 좌표값이 누락됨.`);
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

        // Stage 3. 요율 판정
        this.runStage3Pricing(securedOrder, userId, reasons, pros);

        // 최종 평가 합산
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

        securedOrder.status = 'ORDER_AWAITING_DECISION';

        if (io) {
            console.log(`📤 [Socket 푸시] order-evaluated (${securedOrder.id}) - 상태 승급: ORDER_AWAITING_DECISION`);
            io.to(userId).emit("order-evaluated", securedOrder);

            if (timeExt.includes("실패")) {
                logRoadmapEvent("서버", "관제탑에게 카카오 에러 상태(order-evaluated error) 정보 전달");
            } else {
                logRoadmapEvent("서버", "관제탑에게 최종 판독된 오더 정보(order-evaluated) 전달");
            }
        }
    }

    private runStage1ShapeFilter(order: SecuredOrder | PendingOrder, session: any, reasons: string[], pros: string[]) {
        const filter = session.activeFilter;
        
        // 1) 차종 검사
        if (filter.allowedVehicleTypes && filter.allowedVehicleTypes.length > 0 && order.vehicleType) {
            if (!filter.allowedVehicleTypes.includes(order.vehicleType)) {
                reasons.push(`차종(${order.vehicleType}) 불일치`);
            } else {
                pros.push(`차종(${order.vehicleType}) 일치`);
            }
        }

        // 2) 첫짐 절대 하한가 검사
        if (filter.dispatchPhase === 'STANDBY' && filter.minFare > 0 && order.fare && order.fare > 0) {
            if (order.fare < filter.minFare) {
                reasons.push(`첫짐 절대하한가 미달 (${filter.minFare.toLocaleString()}원)`);
                console.log(`   - 💸 [첫짐 하한가] 똥콜 — 실제 ${order.fare.toLocaleString()}원 < 절대하한 ${filter.minFare.toLocaleString()}원`);
            } else {
                pros.push(`첫짐 절대하한가 통과`);
            }
        }

        // 3) 최대 운임 검사
        if (filter.maxFare > 0 && filter.maxFare < 1000000 && order.fare && order.fare > 0) {
            if (order.fare > filter.maxFare) {
                reasons.push(`요금(${(order.fare / 10000).toFixed(1)}만) 초과`);
            }
        }

        // 4) 제외 키워드 검사 (플러그인 커스텀 룰 혼합)
        const rawText = `${order.pickup} ${order.dropoff} ${order.detailMemo || ''} ${(order as any).rawText || ''}`;
        if (filter.excludedKeywords && filter.excludedKeywords.length > 0) {
            let hasExcluded = false;
            for (const kw of filter.excludedKeywords) {
                if (kw && rawText.includes(kw)) {
                    reasons.push(`제외키워드(${kw}) 감지`);
                    hasExcluded = true;
                }
            }
            if (!hasExcluded) pros.push(`제외키워드 없음`);
        }
        
        const customReasons = this.plugin.evaluateCustomRules(rawText);
        reasons.push(...customReasons);

        // 5) 도착지 키워드 검사 (합짐 모드일 때)
        if (filter.isSharedMode && filter.destinationKeywords && filter.destinationKeywords.length > 0) {
            const dropoffText = order.dropoff || '';
            const matched = filter.destinationKeywords.some((kw: string) => dropoffText.includes(kw));
            if (!matched) {
                reasons.push(`도착지(${dropoffText.substring(0, 10)}) 회랑 이탈`);
            } else {
                pros.push(`도착지 회랑 적중`);
            }
        }

        console.log(`   - 🔍 [Stage 1] 형상 필터 검증 완료: ${reasons.length === 0 ? '✅ 통과' : `❌ ${reasons.join(', ')}`}`);
    }

    private runStage3Pricing(order: SecuredOrder | PendingOrder, userId: string, reasons: string[], pros: string[]) {
        if (order.kakaoSoloDistanceKm && order.fare) {
            try {
                const pricing = SettingsRepository.loadPricingConfig(userId);
                const routingOpts = SettingsRepository.getKakaoRoutingOptions(userId);
                const baseResult = PricingEngine.calculateDynamicFare(
                    order.kakaoSoloDistanceKm,
                    order.vehicleType || undefined,
                    routingOpts.vehicleType,
                    pricing
                );

                const adjusted = this.plugin.applyPricingExceptions(
                    order.fare, 
                    baseResult.fairPrice, 
                    baseResult.minAcceptable
                );

                if (order.fare < adjusted.adjustedMinAcceptable) {
                    const diff = order.fare - adjusted.adjustedMinAcceptable;
                    reasons.push(`요율 미달 (적정: ${adjusted.adjustedFairPrice.toLocaleString()}원, 하한: ${adjusted.adjustedMinAcceptable.toLocaleString()}원, 실제: ${order.fare.toLocaleString()}원, ${diff.toLocaleString()}원)`);
                    console.log(`   - 💸 [요율 판정] 똥콜 — 실제 ${order.fare.toLocaleString()}원 < 하한 ${adjusted.adjustedMinAcceptable.toLocaleString()}원`);
                } else if (order.fare >= adjusted.adjustedFairPrice) {
                    pros.push(`꿀콜 🍯 (적정 ${adjusted.adjustedFairPrice.toLocaleString()}원 이상)`);
                    console.log(`   - 🍯 [요율 판정] 꿀콜 — 실제 ${order.fare.toLocaleString()}원 ≥ 적정 ${adjusted.adjustedFairPrice.toLocaleString()}원`);
                } else {
                    console.log(`   - ✅ [요율 판정] 적정 범위 — 실제 ${order.fare.toLocaleString()}원 (하한 ${adjusted.adjustedMinAcceptable.toLocaleString()} ~ 적정 ${adjusted.adjustedFairPrice.toLocaleString()})`);
                }
            } catch (e) {
                console.error(`   - ⚠️ [요율 판정] 계산 실패:`, e);
            }
        }
    }
}
