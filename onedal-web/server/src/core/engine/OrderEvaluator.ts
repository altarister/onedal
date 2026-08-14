import { PendingOrder, SecuredOrder, MyOrder } from "@onedal/shared";
import { getUserSession } from "../../state/userSessionStore";
import { computeAllowedDetour, findLoadConflicts, totalDetourCost } from "../helpers";
import { geocodeAddress, calculateSoloRoute } from "../../services/kakaoService";
import { logRoadmapEvent } from "../../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../../config/dispatchConfig";
import { SettingsRepository } from "../../repositories/SettingsRepository";
import { PricingEngine } from "./PricingEngine";
import { applySoloRoute, composeMergedRoute } from "../../services/routeComposer";
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

                // 지오코딩 (상차지 + 하차지 병렬 실행)
                const needPickup = !securedOrder.pickupX || !securedOrder.pickupY;
                const needDropoff = !securedOrder.dropoffX || !securedOrder.dropoffY;

                const [pCoord, dCoord] = await Promise.all([
                    needPickup ? geocodeAddress(securedOrder.pickup) : Promise.resolve(null),
                    needDropoff ? geocodeAddress(securedOrder.dropoff) : Promise.resolve(null),
                ]);

                if (needPickup) {
                    console.log(`🌍 [Geocoding] 상차지 변환: '${securedOrder.pickup}' -> ${pCoord ? `X:${pCoord.x}, Y:${pCoord.y}` : '실패(null)'}`);
                    if (pCoord) {
                        securedOrder.pickupX = pCoord.x;
                        securedOrder.pickupY = pCoord.y;
                    }
                }
                if (needDropoff) {
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
                        
                        // 🔴 예전에는 여기서 손으로 필드를 채웠다. routeComposer 의 규약을 안 타서
                        //    **접근 구간(현위치 → 상차지)이 통째로 버려지고** 있었다.
                        //    콜을 잡는 이 경로가 주 경로인데, 여기만 규약 밖에 있었던 것이다.
                        //    (EE 리팩터링에서 composeMergedRoute 를 쓰는 곳만 통일하고 여기를 놓쳤다)
                        applySoloRoute(securedOrder, result);
                        timeExt = `추천거리 ${securedOrder.kakaoSoloDistanceKm}km, 소요 ${securedOrder.kakaoSoloDurationMin}분`
                            + (securedOrder.approachDurationMin ? ` (상차지까지 ${securedOrder.approachDurationMin}분)` : '');

                        console.log(`   - 🗺️ 궤적 길이 (Solo): ${securedOrder.routePolyline?.length || '없음'}`);
                    } else {
                        /**
                         * 합짐(Detour) 연산 — **경유지 조립은 `routeComposer` 한 곳에만 있다.**
                         *
                         * 🔴 2026-08-14 — 여기가 `allPickups`/`allDropoffs` 를 **손으로 조립**하고
                         *    `calculateDetourRoute` 를 직접 불렀다. 그래서 **이미 상차한 콜의
                         *    상차지까지 경유지에 넣었다** — 다녀온 곳을 다시 가는 경로다.
                         *    거리·시간이 부풀고, 그 값으로 우회 예산을 재니 **합짐 판정이 통째로
                         *    틀어진다**(꿀콜이 똥콜이 되고 순서가 뒤집힌다).
                         *
                         *    같은 파일이 같은 이유로 **두 번째**다 — 위 103행에
                         *    *"EE 리팩터링에서 composeMergedRoute 를 쓰는 곳만 통일하고 여기를
                         *    놓쳤다"* 고 적혀 있다. 이번엔 조립을 아예 안 한다.
                         *
                         *    `extra` 가 정확히 이 자리를 위한 파라미터다 —
                         *    *"후보 콜은 아직 안 실었으므로 상차지를 남긴다."*
                         */
                        const result = await composeMergedRoute({
                            calls: activeCalls,
                            extra: securedOrder,
                            driverLocation: session.driverLocation,
                            priority: routingOptions.defaultPriority,
                            carType: routingOptions.carType,
                        });
                        if (!result) {
                            // 좌표가 하나도 없다 — 기존 실패 처리로 떨어뜨린다
                            throw new Error("합짐 경로 조립 실패: 유효한 좌표가 없습니다");
                        }

                        let recommend = "'콜'";
                        const distDiff = parseFloat(result.distDiffKm);

                        // [Phase 8.4] 🔴 우회 허용치를 **실린 짐의 마감 시각**에서 구한다.
                        //
                        // 예전에는 DISPATCH_CONFIG 의 고정 상수(30분/60분)만 봤다.
                        // 그래서 마감이 20분 뒤인 짐을 싣고도 50분 우회를 '보통'이라 통과시키고,
                        // 여유가 3시간인데도 70분 우회를 '똥'이라 걸러 **잡을 수 있는 합짐을 놓쳤다.**
                        //
                        // 기사님: "오후 2시에 콜을 잡았는데 5시까지는 와야 한다든지 하는 정보가
                        //          있어야 할 것 같아. 그래야 합짐을 잡을 수 있을 듯."
                        //
                        // 마감을 아는 짐이 하나도 없으면 null → 기존 상수로 폴백한다.
                        const slackLimit = computeAllowedDetour(userId, session);
                        const shitTime = slackLimit ?? DISPATCH_CONFIG.DETOUR_SHIT_TIME_MIN;
                        const honeyTime = slackLimit !== null
                            ? Math.max(0, Math.floor(slackLimit / 2))   // 여유의 절반 안이면 꿀
                            : DISPATCH_CONFIG.DETOUR_HONEY_TIME_MAX;

                        // 🔴 카카오의 timeDiffMin 은 **주행 delta 뿐**이다.
                        //    이 콜을 잡으면 상차·하차를 한 번씩 더 해야 하고, 수작업이면
                        //    거기서만 40~60분이 붙는다. 그걸 빼고 판정하면 무조건 낙관하게 된다.
                        const cost = totalDetourCost(result.timeDiffMin, securedOrder.id);

                        if (cost.total <= honeyTime && distDiff <= DISPATCH_CONFIG.DETOUR_HONEY_DIST_MAX) recommend = "'꿀'";
                        else if (cost.total >= shitTime || distDiff >= DISPATCH_CONFIG.DETOUR_SHIT_DIST_MIN) recommend = "'똥'";

                        const basis = slackLimit !== null ? `마감 여유 ${slackLimit}분 기준` : '기본 기준';
                        const breakdown = `주행 +${result.timeDiffMin}분 + 상하차 ${cost.dwell}분`
                            + (cost.hasUnknown ? ' (상하차 방법 미확인)' : '');
                        if (cost.total >= shitTime) {
                            reasons.push(`총 추가시간(+${cost.total}분) 초과 — ${breakdown} · ${basis}`);
                        } else if (cost.total <= honeyTime) {
                            pros.push(`총 추가시간(+${cost.total}분) 양호 🍯 — ${breakdown} · ${basis}`);
                        } else {
                            pros.push(`총 추가시간(+${cost.total}분) 보통 — ${breakdown} · ${basis}`);
                        }

                        // 함께 실을 수 없는 화물인지 (위험물 + 식료품 등)
                        const conflicts = findLoadConflicts(userId, session, securedOrder.id);
                        for (const [a, b] of conflicts) {
                            reasons.push(`동승 불가: 실린 화물(${a}) + 이 화물(${b})`);
                            recommend = "'똥'";
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

        /**
         * 5) 도착지 키워드 검사 (합짐 모드일 때)
         *
         * 🔴 2026-08-12 — 예전에는 `length > 0` 일 때만 검사했다. 즉 **회랑이 없으면
         *    검사를 통째로 건너뛰었다.** 앱도 같은 방향으로 열려 있어서
         *    (`isEmpty() → true`) 두 겹이 동시에 무력화됐다.
         *
         *    회랑을 못 구한 상태는 "어디든 좋다"가 아니라 **"판단할 근거가 없다"** 다.
         *    데스밸리 30초 안에 근거 없이 KEEP 하면 그대로 똥콜을 안고 간다.
         */
        if (filter.isSharedMode) {
            const keywords = filter.destinationKeywords || [];
            if (keywords.length === 0) {
                reasons.push(`회랑 미확정 (경로가 아직 안 잡혔습니다)`);
            } else {
                const dropoffText = order.dropoff || '';
                const matched = keywords.some((kw: string) => dropoffText.includes(kw));
                if (!matched) {
                    reasons.push(`도착지(${dropoffText.substring(0, 10)}) 회랑 이탈`);
                } else {
                    pros.push(`도착지 회랑 적중`);
                }
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
