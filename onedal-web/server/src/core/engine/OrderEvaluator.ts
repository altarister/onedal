import { PendingOrder, SecuredOrder, MyOrder, scoreMerge, scoreSolo, describeJudgment, TRUCK_CAPACITY_SLOTS, callName , DEFAULT_DEADLINE_RULES,
         scoreDryRun, describeDryRun, deriveRouteTimeline, minRouteBuffer, marginalDetourMin } from "@onedal/shared";
import type { DryRunGate } from "@onedal/shared";
import { OrderRepository } from "../../repositories/OrderRepository";
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

                        // 🔴 예전에는 여기서 손으로 필드를 채웠다. routeComposer 의 규약을 안 타서
                        //    **접근 구간(현위치 → 상차지)이 통째로 버려지고** 있었다.
                        //    콜을 잡는 이 경로가 주 경로인데, 여기만 규약 밖에 있었던 것이다.
                        //    (EE 리팩터링에서 composeMergedRoute 를 쓰는 곳만 통일하고 여기를 놓쳤다)
                        applySoloRoute(securedOrder, result);

                        /**
                         * 🎯 **첫짐 판정 — 단가로 잰다** (기사님 확정 2026-08-18)
                         *
                         * 🔴 운행시간 축을 버렸다. 첫짐에서 운행시간이 길다는 건 나쁜 게 아니라
                         *    **그게 일감**이다. 노선(광주→파주)이 늘 80~100분이라 옛 기준(40/90분)으로는
                         *    잡은 콜이 **전부 똥**으로 떴다 — 100,000원짜리가 0점이었다.
                         *
                         * 기사님: *"필터는 최저값보다 크기만 하면 올려주니, 내가 판단하는 건
                         *          단가가 좋은지 아닌지로 하면 된다."*
                         *
                         * 앱이 이미 `요금 ≥ 배송거리 × 단가` 로 하한을 넘긴 콜만 올린다.
                         * 그러므로 서버가 답할 것은 하나다 — **적정가를 넘었는가.**
                         */
                        const pricing = this.loadPricing(securedOrder, userId);
                        const soloVerdict = scoreSolo({
                            fare: securedOrder.fare,
                            fairPrice: pricing?.fairPrice ?? null,
                            minAcceptable: pricing?.minAcceptable ?? null,
                        }, session.judgment);
                        const soloMark = `'${soloVerdict.color}'`;
                        console.log(`   - 🎯 [판정] ${describeJudgment(soloVerdict)}`);
                        if (soloVerdict.color === '똥') {
                            reasons.push(`총점 ${soloVerdict.score}점 — ${soloVerdict.parts.map(pt => `${pt.name} ${pt.raw}`).join(' · ')}`);
                        } else {
                            pros.push(`총점 ${soloVerdict.score}점 — ${soloVerdict.parts.map(pt => `${pt.name} ${pt.raw}`).join(' · ')}`);
                        }

                        // 관제웹 카드가 이 문자열의 '꿀'/'똥' 표식으로 색을 정한다 (합짐 timeExt 와 같은 규약)
                        timeExt = `추천거리 ${securedOrder.kakaoSoloDistanceKm}km, 소요 ${securedOrder.kakaoSoloDurationMin}분`
                            + (securedOrder.approachDurationMin ? ` (상차지까지 ${securedOrder.approachDurationMin}분)` : '')
                            + ` ${soloMark} · ${soloVerdict.score}점`;

                        // 🧪 새 판정 병행 (dryRun) — 첫짐은 시급 축 (확정안 v2). 로그 한 줄뿐.
                        try {
                            const dwell = totalDetourCost(0, securedOrder.id, session.judgment.unknown);
                            const total = securedOrder.totalDurationMin != null
                                ? securedOrder.totalDurationMin + dwell.dwell : null;
                            const tags: string[] = [];
                            if (securedOrder.approachDurationMin != null
                                && securedOrder.approachDurationMin > session.judgment.unknown.pickupOffsetMin)
                                tags.push('통화 필수 — 무통보 상차 한계 밖');
                            if (dwell.hasUnknown) tags.push('정차 미확인(일반값)');
                            const dry = scoreDryRun({
                                kind: 'first', fare: securedOrder.fare, totalMinutes: total,
                                gates: [], tags,
                            }, session.judgment);
                            console.log(`   - 🧪 [dryRun] ${describeDryRun(dry)}`);
                        } catch (e) {
                            console.log(`   - 🧪 [dryRun] 계산 실패: ${(e as Error).message}`);
                        }

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
                            // 🏗️ 옛 판정 경로 잔재 — 여유·휴게는 두 시계로 폐기됐다(⑯). 새 판정(dryRun)으로
                            //    대체될 때까지 DEFAULT 상수로 물려 둔다 (판정 기준 탭 값 아님)
                            { pickupOffsetMinutes: session.judgment.unknown.pickupOffsetMin,
                              restMarginMinutes: DEFAULT_DEADLINE_RULES.restMarginMinutes,
                              arrivalMarginMinutes: DEFAULT_DEADLINE_RULES.arrivalMarginMinutes });
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

                        /**
                         * 🧪 **새 판정 병행 (dryRun)** — 판정색_확정안 v2. 화면은 옛 색 그대로,
                         * 이 결과는 로그 한 줄뿐이다. 문제지(13~16) 캘리브레이션이 끝나면 전환.
                         * 실패해도 심사를 막지 않는다 — try 로 감싼다.
                         */
                        try {
                            const secStops = (result.merged as any).sectionStops as
                                Array<{ orderId: string; stopType: 'pickup' | 'dropoff' }> | undefined;
                            const secMins = result.merged.sectionDriveMin;
                            const stopsAfter = secStops && secMins && secStops.length === secMins.length
                                ? secStops.map((st, i) => ({ ...st, driveMinutes: secMins[i] }))
                                : [];
                            const rules = {
                                ...DEFAULT_DEADLINE_RULES,
                                pickupOffsetMinutes: session.judgment.unknown.pickupOffsetMin,
                                deadlineRatioPct: session.judgment.deadline.ratioPct,
                            };
                            // 후보를 **포함한** 경로의 타임라인 — 기존 콜 약속이 어떻게 되는지가 문지기다
                            const tlAfter = stopsAfter.length
                                ? deriveRouteTimeline(stopsAfter as any, [...activeCalls, securedOrder] as any,
                                    id => OrderRepository.getCargoReports(id) as any,
                                    id => OrderRepository.getMilestones(id) as any,
                                    Date.now(), new Date().toISOString(), rules)
                                : [];
                            const existing = tlAfter.filter(e => e.orderId !== securedOrder.id);
                            const late = existing.filter(e => e.lateMinutes > 0);
                            // 콜 호칭 조합 규칙 — "노선합짐1콜 하차 약속이 깨집니다"
                            const nameOf = (id: string) => {
                                const idx = activeCalls.findIndex(c => c.id === id);
                                return idx >= 0
                                    ? callName({ target: session.activeFilter.callTarget, index: idx })
                                    : id.slice(-6);
                            };
                            const gates: DryRunGate[] = [{
                                key: 'routePromiseGuard', name: '기존 콜 약속 보존', pass: late.length === 0,
                                why: late.length
                                    ? `잡으면 ${late.map(e =>
                                        `${nameOf(e.orderId)} ${e.stopType === 'pickup' ? '상차' : '하차'} 약속이 ${e.lateMinutes}분 깨집니다`).join(' · ')}`
                                    : null,
                            }];
                            if (conflicts.length) gates.push({
                                key: 'cargoTagCompat', name: '짐 동승', pass: false,
                                why: `동승 불가 — ${conflicts.map(([a, b]) => `${a}+${b}`).join(' · ')}`,
                            });

                            const bufAfter = minRouteBuffer(existing);

                            /**
                             * 🧮 우회는 **한계 비용** — 직전 경로(붙이기 전) 총 소요를 뺀다.
                             * 카카오 delta(첫짐 단독 대비 누적)를 그대로 쓰면 나중 후보가
                             * 앞 합짐들의 비용을 뒤집어쓴다 (문제지 16번: +189분, 진짜는 43분).
                             * 직전 총 소요는 경로 홀더가 들고 있다 — "값이 있는 마지막 콜".
                             */
                            const prevTotal = [...activeCalls].reverse()
                                .find(c => c.totalDurationMin != null)?.totalDurationMin ?? null;
                            const marginal = marginalDetourMin(
                                Math.round(result.merged.duration / 60), prevTotal, result.timeDiffMin);

                            // 딱지 — 판단 없이 사실만 (절대치 문턱의 강등 자리). 분·km 둘 다 한계 기준
                            const prevKm = [...activeCalls].reverse()
                                .find(c => c.totalDistanceKm != null)?.totalDistanceKm ?? null;
                            const marginalKm = prevKm != null
                                ? Math.round((result.merged.distance / 1000 - prevKm) * 10) / 10 : distDiff;
                            const tags = [`우회 ${marginal > 0 ? '+' : ''}${marginal}분 · ${marginalKm > 0 ? '+' : ''}${marginalKm}km`];
                            const candPickup = tlAfter.find(e => e.orderId === securedOrder.id && e.stopType === 'pickup');
                            const clockMs = Date.now() + session.judgment.unknown.pickupOffsetMin * 60_000;
                            if (candPickup?.etaMs != null && candPickup.etaMs > clockMs) tags.push('통화 필수 — 무통보 상차 한계 밖');
                            if (cost.hasUnknown) tags.push('정차 미확인(일반값)');
                            if (!bufAfter) tags.push('버퍼 잴 약속 없음');

                            const dry = scoreDryRun({
                                kind: 'merge', fare: securedOrder.fare,
                                detourExtraMin: marginal + cost.dwell,
                                bufferAfterMin: bufAfter?.minutes ?? null,
                                slotsFreePct: slotsTotal > 0
                                    ? (Math.max(0, slotsTotal - slotsUsed) / slotsTotal) * 100 : null,
                                gates, tags,
                            }, session.judgment);
                            console.log(`   - 🧪 [dryRun] ${describeDryRun(dry)}`);
                        } catch (e) {
                            console.log(`   - 🧪 [dryRun] 계산 실패: ${(e as Error).message}`);
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

    /**
     * 적정가·하한가를 한 곳에서 구한다.
     *
     * 🔴 **첫짐 색과 요율 문구가 같은 값을 봐야 한다** (2026-08-18).
     *    첫짐 판정이 단가 기준으로 바뀌면서 이 값을 두 곳에서 쓰게 됐다.
     *    각자 계산하면 언젠가 갈라진다 — 파생값은 한 곳에서 만든다 (규칙 ③).
     *
     * 못 구하면 `null` 을 준다. 0 이나 짐작값을 지어내지 않는다 (규칙 ④).
     */
    private loadPricing(order: SecuredOrder | PendingOrder, userId: string):
        { fairPrice: number; minAcceptable: number } | null {
        if (!order.kakaoSoloDistanceKm || !order.fare) return null;
        try {
            const pricing = SettingsRepository.loadPricingConfig(userId);
            const routingOpts = SettingsRepository.getKakaoRoutingOptions(userId);
            const base = PricingEngine.calculateDynamicFare(
                order.kakaoSoloDistanceKm,
                order.vehicleType || undefined,
                routingOpts.vehicleType,
                pricing
            );
            const adjusted = this.plugin.applyPricingExceptions(
                order.fare, base.fairPrice, base.minAcceptable
            );
            return {
                fairPrice: adjusted.adjustedFairPrice,
                minAcceptable: adjusted.adjustedMinAcceptable,
            };
        } catch (e) {
            console.error(`   - ⚠️ [요율] 적정가 계산 실패:`, e);
            return null;
        }
    }

    private runStage3Pricing(order: SecuredOrder | PendingOrder, userId: string, reasons: string[], pros: string[]) {
        const p = this.loadPricing(order, userId);
        if (p) {
            {
                const adjusted = { adjustedFairPrice: p.fairPrice, adjustedMinAcceptable: p.minAcceptable };

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
            }
        }
    }
}
