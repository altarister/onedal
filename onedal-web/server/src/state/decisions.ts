import { SUPPLY_EVENTS, SUPPLY_NAMESPACE } from "@onedal/shared";
import type { PhoneDecision, SupplyDecisionAction } from "@onedal/shared";
import type { UserSession } from "./userSessionStore";
import { cancelOrderWaits } from "./waits";
import { releaseEvaluatingDevices } from "../core/helpers";
import { flushSupply } from "./phoneSupply";
import { slog } from "../utils/fileLogger";
import { deviceLabelOf } from "../core/deviceAuth";

/**
 * ⚖️ **결재 정하기 · 받았음 — 한 곳** (reviews/50 ①-1).
 * 결재 행동(`pendingDecisions[콜].action`)을 쓰는 곳은 `decide` 하나다 — `phoneSupply.test.ts` 가 이 파일 밖의 쓰기를 문다.
 * 보고 응답(scrap)은 지금처럼 다음 보고에 결재를 싣고, 관제앱 공급 소켓(`/supply`)에는 그 순간 `phone-decision` 이 간다.
 * 폰이 실행했다는 «받았음»은 어느 길로 오든 `ackDecision` 이 치운다.
 */

/** ⏩ 이 콜의 빨리 접기 남은 ms(서버 시계) — 판정 끝에 정한 초가 없으면 undefined */
export function foldRemainMsOf(session: Pick<UserSession, 'pendingOrdersData'>, orderId: string | undefined): number | undefined {
    const order = orderId ? session.pendingOrdersData.get(orderId) : undefined;
    return order?.foldAfterSec != null && order.judgeUntil != null
        ? Math.max(0, Math.round(order.judgeUntil - Date.now())) : undefined;
}

/** 📮 그 콜을 쥔 폰마다 관제앱에 갈 결재 — 행동이 아직 없으면 빈 목록 */
function phoneDecisionsOf(session: UserSession, orderId: string): PhoneDecision[] {
    const action = session.pendingDecisions.get(orderId)?.action;
    if (!action) return [];
    const foldMs = foldRemainMsOf(session, orderId);
    const out: PhoneDecision[] = [];
    for (const [deviceId, id] of session.deviceEvaluatingMap) {
        if (id === orderId) out.push({ deviceId, orderId, action, ...(foldMs != null ? { foldMs } : {}) });
    }
    return out;
}

/** 🔁 «받았음»이 안 온 결재 전부 — 공급 소켓이 (다시) 붙으면 보낸다 */
export function unackedPhoneDecisions(session: UserSession): PhoneDecision[] {
    const orderIds = new Set(session.deviceEvaluatingMap.values());
    return [...orderIds].flatMap(id => phoneDecisionsOf(session, id));
}

/** ⚖️ 결재를 정한다 — 기다림 줄이 있으면 행동만 채우고, 없으면 새로 적는다 */
export function decide(io: any, session: UserSession, userId: string, orderId: string, action: SupplyDecisionAction): void {
    const row = session.pendingDecisions.get(orderId);
    if (row) row.action = action;
    else session.pendingDecisions.set(orderId, { action, evaluatedAt: Date.now() });
    const nsp = io?.of?.(SUPPLY_NAMESPACE);
    if (!nsp?.adapter?.rooms?.get(userId)?.size) return;   // 공급 소켓이 안 붙었으면 보고 응답 길만
    for (const d of phoneDecisionsOf(session, orderId)) {
        nsp.to(userId).emit(SUPPLY_EVENTS.decision, d);
        slog('결재', `📡 [공급 소켓] ${orderId} 결재(${action})를 관제앱으로 — ${deviceLabelOf(d.deviceId)}`);
    }
    flushSupply(io, userId);
}

/**
 * 🧹 폰이 결재를 실행했다 — 기다림 끄기 · 결재 지우기 · 그 콜을 쥔 폰의 «심사 중» 풀기.
 * 큐가 이미 비었으면(시한 정리 뒤 늦게 온 받았음) 폰 표시만 푼다 — 안 풀면 폰이 다음 콜을 안 누른다.
 * @returns 무엇이든 치웠으면 true
 */
export function ackDecision(io: any, session: UserSession, userId: string, orderId: string, via: string): boolean {
    let done = false;
    if (session.pendingDecisions.has(orderId)) {
        cancelOrderWaits(session, orderId, '폰 확인');
        session.pendingDecisions.delete(orderId);
        releaseEvaluatingDevices(session, orderId);
        slog('결재', `🧹 [받았음 · ${via}] 기사님 폰에서 ${orderId} 판결 수신 확인 — 큐에서 지운다`);
        done = true;
    } else if (releaseEvaluatingDevices(session, orderId) > 0) {
        slog('결재', `🧹 [늦은 받았음 · ${via}] ${orderId} — 큐는 이미 비었다 · 폰 잡기를 다시 연다`);
        done = true;
    }
    if (done && io) flushSupply(io, userId);
    return done;
}
