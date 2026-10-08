import { SUPPLY_EVENTS, SUPPLY_NAMESPACE } from "@onedal/shared";
import type { PhoneDecision, PhoneFold, SupplyDecisionAction } from "@onedal/shared";
import type { UserSession } from "./userSessionStore";
import { cancelOrderWaits } from "./waits";
import { releaseEvaluatingDevices } from "../core/helpers";
import { flushSupply } from "./phoneSupply";
import { slog } from "../utils/fileLogger";
import { deviceLabelOf } from "../core/deviceAuth";
import { OrderRepository } from "../repositories/OrderRepository";

/**
 * 바깥 일을 하는 함수: foldRemainMsOf(지금 시각) · decide · sendFold · ackDecision(세션 · 장부 · 소켓 · 지금 시각 · 로그) (빨리 접기 남은 ms · 결재 줄 셈 foldRemainMsFrom · phoneDecisionsFrom 은 값만 받는다)
 *
 * ⚖️ **결재 정하기 · 받았음 — 한 곳**.
 * 결재 행동(`pendingDecisions[콜].action`)을 쓰는 곳은 `decide` 하나다 — `phoneSupply.test.ts` 가 이 파일 밖의 쓰기를 문다.
 * 결재는 관제앱 공급 소켓(`/supply`)으로 그 순간 `phone-decision` 이 가고 관제앱이 블루투스로 넘긴다 — 보고 응답에는 안 싣는다.
 * 폰이 실행했다는 «받았음»은 어느 길로 오든 `ackDecision` 이 치운다.
 */

/** ⏩ 이 콜의 빨리 접기 남은 ms(서버 시계) — 판정 끝에 정한 초가 없으면 undefined */
export function foldRemainMsOf(session: Pick<UserSession, 'pendingOrdersData'>, orderId: string | undefined): number | undefined {
    const order = orderId ? session.pendingOrdersData.get(orderId) : undefined;
    return foldRemainMsFrom(order, Date.now());
}

/** ⏩ 빨리 접기 남은 ms — 값만 받는 셈 (콜의 접기 초 · 판정 끝 시각 · 지금 시각) */
export function foldRemainMsFrom(order: { foldAfterSec?: number | null; judgeUntil?: number } | undefined, nowMs: number): number | undefined {
    return order?.foldAfterSec != null && order.judgeUntil != null
        ? Math.max(0, Math.round(order.judgeUntil - nowMs)) : undefined;
}

/** 📮 그 콜을 쥔 폰마다 관제앱에 갈 결재 — 행동이 아직 없으면 빈 목록 */
function phoneDecisionsOf(session: UserSession, orderId: string): PhoneDecision[] {
    const action = session.pendingDecisions.get(orderId)?.action;
    return phoneDecisionsFrom(orderId, action, action ? foldRemainMsOf(session, orderId) : undefined, session.deviceEvaluatingMap);
}

/** 📮 결재 줄 — 값만 받는 셈 (콜 · 행동 · 접기 남은 ms · 폰 → 심사 중 콜) */
export function phoneDecisionsFrom(orderId: string, action: SupplyDecisionAction | null | undefined, foldMs: number | undefined,
                                   evaluating: Iterable<[string, string]>): PhoneDecision[] {
    if (!action) return [];
    const out: PhoneDecision[] = [];
    for (const [deviceId, id] of evaluating) {
        if (id === orderId) out.push({ deviceId, orderId, action, ...(foldMs != null ? { foldMs } : {}) });
    }
    return out;
}

/** 🔁 «받았음»이 안 온 결재 전부 — 공급 소켓이 (다시) 붙으면 보낸다 */
export function unackedPhoneDecisions(session: UserSession): PhoneDecision[] {
    const orderIds = new Set(session.deviceEvaluatingMap.values());
    return [...orderIds].flatMap(id => phoneDecisionsOf(session, id));
}

/**
 * ⚖️ 결재를 정한다 — 기다림 줄이 있으면 행동만 채우고, 없으면 새로 적는다.
 * 같은 콜에 같은 행동이 이미 정해졌으면 관제앱에 다시 보내지 않는다 — 직접 누른 콜은 상세 문과 결재 처리가 둘 다 KEEP 을 정한다(폰 시험 · 두 번 갔다 · 원달앱이 걸렀다).
 */
/**
 * 🌐 **인터넷 길 — 이 폰 몫 결재 · 빨리 접기** (`GET /api/devices/:deviceId/supply`).
 * 공급 소켓이 보내는 것과 같은 결재 큐 · 같은 셈(`phoneDecisionsOf` · `foldRemainMsOf`) — 이 폰이 심사 중인 콜 하나만.
 */
export function phoneDecisionsForDevice(session: UserSession, deviceId: string): { decisions: PhoneDecision[]; folds: PhoneFold[] } {
    const orderId = session.deviceEvaluatingMap.get(deviceId);
    if (!orderId) return { decisions: [], folds: [] };
    const decisions = phoneDecisionsOf(session, orderId).filter(d => d.deviceId === deviceId);
    const remainMs = foldRemainMsOf(session, orderId);
    return { decisions, folds: remainMs == null ? [] : [{ deviceId, orderId, remainMs }] };
}

export function decide(io: any, session: UserSession, userId: string, orderId: string, action: SupplyDecisionAction): void {
    const row = session.pendingDecisions.get(orderId);
    if (row?.action === action) return;
    if (row) row.action = action;
    else session.pendingDecisions.set(orderId, { action, evaluatedAt: Date.now() });
    const nsp = io?.of?.(SUPPLY_NAMESPACE);
    if (!nsp?.adapter?.rooms?.get(userId)?.size) return;   // 공급 소켓이 안 붙었으면 결재는 큐에 남아 붙을 때 다시 보낸다(unackedPhoneDecisions)
    for (const d of phoneDecisionsOf(session, orderId)) {
        nsp.to(userId).emit(SUPPLY_EVENTS.decision, d);
        slog('결재', `📡 [공급 소켓] ${orderId} 결재(${action})를 관제앱으로 — ${deviceLabelOf(d.deviceId)}`);
    }
    flushSupply(io, userId);
}

/**
 * ⏩ 판정 끝 빨리 접기를 관제앱으로 — 그 콜을 쥔 폰마다 한 번(결재가 없는 미리보기 콜 · `applyQuickFold`).
 *    관제앱이 남은 시간 동안 들고 있다가 그 폰이 다시 붙으면 줄여서 보낸다 — 서버는 한 번만 보낸다.
 */
export function sendFold(io: any, session: UserSession, userId: string, orderId: string): void {
    const remainMs = foldRemainMsOf(session, orderId);
    const nsp = io?.of?.(SUPPLY_NAMESPACE);
    if (remainMs == null || !nsp?.adapter?.rooms?.get(userId)?.size) return;
    for (const [deviceId, id] of session.deviceEvaluatingMap) {
        if (id !== orderId) continue;
        const f: PhoneFold = { deviceId, orderId, remainMs };
        nsp.to(userId).emit(SUPPLY_EVENTS.fold, f);
        slog('판정', `📡 [공급 소켓] ${orderId.slice(-6)} 빨리 접기 ${(remainMs / 1000).toFixed(1)}초 → 관제앱 — ${deviceLabelOf(deviceId)}`);
    }
}

/**
 * 🧹 폰이 결재를 실행했다 — 기다림 끄기 · 결재 지우기 · 그 콜을 쥔 폰의 «심사 중» 풀기.
 * 큐가 이미 비었으면(시한 정리 뒤 늦게 온 받았음) 폰 표시만 푼다 — 안 풀면 폰이 다음 콜을 안 누른다.
 * 큐가 없는데 장부에 받았음 없는 확정 줄이 있으면(서버가 다시 뜬 사이 폰이 KEEP 을 실행) 장부에 받았음을 찍는다 — 안 찍으면 진짜 잡은 콜이 다음 복구에서 빠진다.
 * @returns 무엇이든 치웠으면 true
 */
export function ackDecision(io: any, session: UserSession, userId: string, orderId: string, via: string): boolean {
    let done = false;
    if (session.pendingDecisions.has(orderId)) {
        /* 🧾 폰이 KEEP 을 실행했다 — 장부의 확정이 이제 되살릴 값이다 (db.ts ackedAt) */
        if (session.pendingDecisions.get(orderId)?.action === 'KEEP') OrderRepository.markAcked(orderId, new Date().toISOString());
        cancelOrderWaits(session, orderId, '폰 확인');
        session.pendingDecisions.delete(orderId);
        releaseEvaluatingDevices(session, orderId);
        slog('결재', `🧹 [받았음 · ${via}] 기사님 폰에서 ${orderId} 판결 수신 확인 — 큐에서 지운다`);
        done = true;
    } else if (OrderRepository.markLateAcked(orderId, new Date().toISOString())) {
        /* 🧾 서버가 다시 뜬 사이 폰이 KEEP 을 실행했다 — 장부만 맞춘다(그날 진행 중 목록에는 안 올림 · 35 X7 남는 것) */
        releaseEvaluatingDevices(session, orderId);
        slog('경고', `🧾 [늦은 받았음 · ${via}] ${orderId} — 서버가 다시 뜬 사이 폰이 KEEP 을 실행했다 · 장부에 받았음을 찍는다 — 다음 재시작 때 되살아남`);
        done = true;
    } else if (releaseEvaluatingDevices(session, orderId) > 0) {
        slog('결재', `🧹 [늦은 받았음 · ${via}] ${orderId} — 큐는 이미 비었다 · 폰 잡기를 다시 연다`);
        done = true;
    }
    if (done && io) flushSupply(io, userId);
    return done;
}
