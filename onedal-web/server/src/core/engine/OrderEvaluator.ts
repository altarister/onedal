import { PendingOrder, SecuredOrder, MyOrder, scoreMerge, scoreSolo, describeJudgment, TRUCK_CAPACITY_SLOTS, callName } from "@onedal/shared";
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

                        /**
                         * 🎯 첫짐 판정 — 색을 정하는 곳은 `shared/judgment.ts` 하나뿐이다.
                         * 🔴 예전에는 코드 상수(SOLO_SHIT_TIME_MIN 90분)를 직접 비교해 사유만
                         *    남겼고, 색·점수가 없어 "요율 🍯 인데 종합 💩" 로 갈라져 보였다
                         *    (2026-08-17 실측). 이제 기준은 user_judgment(첫짐 40/90)에서 온다.
                         */
                        const soloVerdict = scoreSolo({ driveMin: result.duration / 60 }, session.judgment);
                        const soloMark = `'${soloVerdict.color}'`;
                        console.log(`   - 🎯 [판정] ${describeJudgment(soloVerdict)}`);
                        if (soloVerdict.color === '똥') {
                            reasons.push(`총점 ${soloVerdict.score}점 — 운행시간 ${Math.round(result.duration / 60)}분`);
                        } else {
                            pros.push(`총점 ${soloVerdict.score}점 — ${soloVerdict.parts.map(pt => `${pt.name} ${pt.raw}`).join(' · ')}`);
                        }
                        
                        // 🔴 예전에는 여기서 손으로 필드를 채웠다. routeComposer 의 규약을 안 타서
                        //    **접근 구간(현위치 → 상차지)이 통째로 버려지고** 있었다.
                        //    콜을 잡는 이 경로가 주 경로인데, 여기만 규약 밖에 있었던 것이다.
                        //    (EE 리팩터링에서 composeMergedRoute 를 쓰는 곳만 통일하고 여기를 놓쳤다)
                        applySoloRoute(securedOrder, result);
                        // 관제웹 카드가 이 문자열의 '꿀'/'똥' 표식으로 색을 정한다 (합짐 timeExt 와 같은 규약)
                        timeExt = `추천거리 ${securedOrder.kakaoSoloDistanceKm}km, 소요 ${securedOrder.kakaoSoloDurationMin}분`
                            + (securedOrder.approachDurationMin ? ` (상차지까지 ${securedOrder.approachDurationMin}분)` : '')
                            + ` ${soloMark} · ${soloVerdict.score}점`;

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

                        /**
                         * 🔴 **색을 정하는 곳은 `shared/judgment.ts` 하나뿐이다** (2026-08-15).
                         *
                         * 예전에는 여기서 직접 임계값을 비교했고, 재탐색(`recalculateKakaoRoute`)은
                         * **자기 숫자(10km/30분)** 를 따로 갖고 있었다 — 같은 콜이 재탐색만 해도
                         * 색이 바뀌었다. 이제 둘 다 `scoreMerge()` 를 부른다.
                         *
                         * [Phase 8.4] 우회 허용치는 **실린 짐의 마감 시각**에서 구한다.
                         * 기사님: *"오후 2시에 콜을 잡았는데 5시까지는 와야 한다든지 하는 정보가
                         * 있어야 할 것 같아. 그래야 합짐을 잡을 수 있을 듯."*
                         *
                         * 🔴 카카오의 `timeDiffMin` 은 **주행 delta 뿐**이라 상하차를 더해야 한다.
                         */
                        const slackLimit = computeAllowedDetour(userId, session, Date.now(), session.judgment.unknown,
                            { pickupOffsetMinutes: session.judgment.unknown.pickupOffsetMin,
                              restMarginMinutes: session.judgment.unknown.restMarginMin });
                        const cost = totalDetourCost(result.timeDiffMin, securedOrder.id, session.judgment.unknown);

                        const slotsTotal = TRUCK_CAPACITY_SLOTS;
                        const slotsUsed = session.activeFilter.slotsUsed ?? 0;

                        const verdict = scoreMerge({
                            driveDiffMin: result.timeDiffMin,
                            detourKm: distDiff,
                            dwellMin: cost.dwell,
                            dwellAssumed: cost.hasUnknown,
                            detourBufferMin: slackLimit,
                            slotsFree: Math.max(0, slotsTotal - slotsUsed),
                            slotsTotal,
                        }, session.judgment);   // 🎯 DB 에서 온 기준 (기본값이 아니다)

                        recommend = `'${verdict.color}'`;
                        console.log(`   - 🎯 [판정] ${describeJudgment(verdict)}`);

                        if (verdict.blocked) reasons.push(verdict.blocked);
                        else if (verdict.color === '똥') {
                            const worst = [...verdict.parts].sort((a, b) => a.score - b.score)[0];
                            reasons.push(`총점 ${verdict.score}점 — 가장 나쁜 요소: ${worst.name} ${worst.raw}`);
                        } else {
                            pros.push(`총점 ${verdict.score}점 — ${verdict.parts.map(p => `${p.name} ${p.raw}`).join(' · ')}`);
                        }

                        // 함께 실을 수 없는 화물인지 (위험물 + 식료품 등)
                        const conflicts = findLoadConflicts(userId, session, securedOrder.id);
                        for (const [a, b] of conflicts) {
                            reasons.push(`동승 불가: 실린 화물(${a}) + 이 화물(${b})`);
                            recommend = "'똥'";
                        }

                        // 🔴 우회거리를 따로 또 판정하던 블록을 지웠다 — 이제 `scoreMerge` 안에서
                        //    다른 요소와 **가중치로 섞인다.** 예전에는 `OR` 라 거리 하나만 넘어도
                        //    시간과 무관하게 똥이 됐다 (`+31.1km` 콜이 그렇게 걸렸다).

                        const signDist = distDiff > 0 ? "+" : "";
                        const signTime = result.timeDiffMin > 0 ? "+" : "";
                        /**
                         * 🔴 관제웹 카드가 이 문자열을 읽어 **색을 정한다**(`'꿀'`·`'똥'` 표식).
                         *    그래서 표식은 그대로 두고 **총점만 덧붙인다** — 기사님이 색을 믿고
                         *    바로 누르시되, 숫자가 궁금하면 바로 보이게 (규칙 ⑤-3).
                         *    요소별 상세는 서버 로그의 `🎯 [판정]` 한 줄에 다 있다.
                         */
                        timeExt = `${signDist}${distDiff}km, ${signTime}${result.timeDiffMin}분 ${recommend} · ${verdict.score}점`;
                        securedOrder.routePolyline = result.merged.polyline;
                        securedOrder.totalDistanceKm = result.merged.distance / 1000;
                        securedOrder.totalDurationMin = Math.round(result.merged.duration / 60);
                        securedOrder.sectionEtas = result.merged.sectionEtas;
                        
                        console.log(`   - 🗺️ 궤적 길이 (Detour): ${securedOrder.routePolyline?.length || '없음'}`);
                    }
                } else {
                    /**
                     * 🔴 **좌표가 없는 것은 `후보콜` 자신이다** (2026-08-16).
                     *    예전 메시지는 `본콜 좌표 누락` 이었는데, 기사님이
                     *    *"내가 KEEP 한 첫 콜에 문제가 있나?"* 로 읽으셨다 — 실제로는 방금
                     *    앱이 집어 온 **후보콜의 주소를 카카오가 못 찾은 것**이다.
                     *    (실측: 초월읍 신세계사이먼 아울렛 — 3중 폴백 끝에 실패)
                     */
                    const who = callName({ target: session.activeFilter.callTarget,
                                           index: getActiveCalls(session).length, candidate: true });
                    const missing = !securedOrder.pickupX ? '상차지' : '하차지';
                    const addr = (!securedOrder.pickupX ? securedOrder.pickup : securedOrder.dropoff) || '';
                    reasons.push(`${who}의 ${missing} 주소를 찾지 못했습니다`);
                    console.log(`   - ❌ ${who}: ${missing} 좌표 변환 실패 — '${addr}'`);
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
         * 🔴 2026-08-12 — 예전에는 `length > 0` 일 때만 검사했다. 즉 **경유이 없으면
         *    검사를 통째로 건너뛰었다.** 앱도 같은 방향으로 열려 있어서
         *    (`isEmpty() → true`) 두 겹이 동시에 무력화됐다.
         *
         *    경유을 못 구한 상태는 "어디든 좋다"가 아니라 **"판단할 근거가 없다"** 다.
         *    안전취소 30초 안에 근거 없이 KEEP 하면 그대로 똥콜을 안고 간다.
         */
        if (filter.isSharedMode) {
            const keywords = filter.destinationKeywords || [];
            if (keywords.length === 0) {
                reasons.push(`경유 미확정 (경로가 아직 안 잡혔습니다)`);
            } else {
                const dropoffText = order.dropoff || '';
                const matched = keywords.some((kw: string) => dropoffText.includes(kw));
                if (!matched) {
                    reasons.push(`도착지(${dropoffText.substring(0, 10)}) 경유 이탈`);
                } else {
                    pros.push(`도착지 경유 적중`);
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
