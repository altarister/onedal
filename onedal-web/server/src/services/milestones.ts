/**
 * 📦 **단계 보고 · 되돌리기 · 복귀 켬** — 도착 · 상차 · 하차 보고의 유일한 진입점 · 잘못 누른 단계 되돌리기 · 노선 ↔ 복귀 전환.
 * 🔴 이 파일은 세션 되살리기(state/sessionRestore)를 가져오지 않는다 — 방향: sessionRestore · milestones → dispatchEngine(결재 · 경로 재계산).
 */
import { MILESTONE_TO_STATUS, MILESTONE_LABEL, canReportMilestone, timingError, deriveStatusFromMilestones, CALL_TARGET_LABEL } from "@onedal/shared";
import type { Milestone, MilestoneSource, CallTarget } from "@onedal/shared";
import { getUserSession } from "../state/userSessionStore";
import { updateActiveFilter, rebuildNetFilter } from "../state/filterManager";
import { homeCityOf } from "../state/filterGoals";
import { recordCallTarget } from "../core/callTargetEvents";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import db from "../db";
import { OrderRepository } from "../repositories/OrderRepository";
import { getActiveCalls } from "../core/activeCalls";
import { buildOrderSync, setOrderStatus } from "../core/helpers";
import { stepRecordsOf, stepsView, bridgeUndoMilestone, milestoneAlreadyRecorded } from "./stepSeeder";
import { slog } from "../utils/fileLogger";
import { wonText } from "@onedal/shared";
import { recalcRouteIfStopsChanged } from "./dispatchEngine";

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

    slog('콜단계', `↩️ [마일스톤 취소] ${MILESTONE_LABEL[milestone]} 삭제 → 남은 기록 기준 ${status}`);
    logRoadmapEvent('콜단계', "서버", `[마일스톤 취소] ${MILESTONE_LABEL[milestone]}`);

    // 되돌린 것도 저장이다 — 같은 규칙으로 전파한다
    await recalcRouteIfStopsChanged(userId, io, `단계 되돌리기(${MILESTONE_LABEL[milestone]})`);
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
        slog('콜단계', `↩️ [마일스톤] ${milestone} 무시 (${reason}) — 현재 상태 ${order.status}`);
        return { success: true, duplicated: true, reason, status: order.status };
    }

    const nowIso = new Date().toISOString();
    // ① 멱등성 — 장부의 단계 행이 그 근거다: 행마다 UNIQUE(orderId) + occurred_at 존재 여부
    if (milestoneAlreadyRecorded(orderId, milestone)) {
        slog('콜단계', `🔁 [마일스톤] ${milestone} (${source}) 중복 — ${orderId} 는 이미 기록됨`);
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
    slog('콜단계', `📦 [${MILESTONE_LABEL[milestone]}] ${orderId.slice(0, 8)} (${source})${nextStatus ? ` → ${nextStatus}` : ''}${errText}`);
    logRoadmapEvent('콜단계', "서버", `[마일스톤] ${MILESTONE_LABEL[milestone]} 수신 (${source})${errText}`);

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
                console.warn(`💵 [착불 미확인] ${orderId.slice(0, 8)} — 수령 여부를 고르지 않고 하차 완료. ${wonText(row.fare ?? 0)}을 미수금으로 잡습니다`);
                // 화면은 sync(orders 필드)로 안다 — 따로 정산 이벤트를 쏘지 않는다
            }
        } catch (e) {
            console.error(`🚨 [착불 확인 실패]`, e);
        }

        const remaining = getActiveCalls(session);
        await recalcRouteIfStopsChanged(userId, io, '하차 완료');
        slog('필터', `🚚 [적재 회복] 하차 완료 → 남은 활성 콜 ${remaining.length}건 기준으로 필터 재계산`);

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
        slog('필터', `🧭 [국면 전환] ${session.activeFilter.callTarget ?? 'DEST'} → ${phase} (userId: ${userId})`);

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
             *    한 곳(`filterGoals.homeCityOf`)이 좌표 → 시를 낸다 — `goalCityOf` 와 같은 답이다.
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
         *    그물이 향하는 시는 `filterGoals.goalCityOf` 가 `callTarget` 에서 **파생**한다.
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

        slog('필터', `🧭 [국면 전환] 완료 → ${CALL_TARGET_LABEL[phase]} · 목적 ${city} ` +
            `(반경 ${session.activeFilter.destinationRadiusKm}km — 국면 설정에서) · ` +
            `콜 ${getActiveCalls(session).length}건 그대로`);

        return { success: true, phase, city: city! };
    } catch (e: any) {
        console.error("🧭 [국면 전환] 에러:", e);
        return { success: false, phase, message: e.message || "국면 전환 실패" };
    }
}
