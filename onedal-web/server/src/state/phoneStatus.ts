import type { PhoneStatus } from "@onedal/shared";
import { registeredPhonesOf } from "../routes/devices";
import { deviceLabelOf } from "../core/deviceAuth";
import { slog } from "../utils/fileLogger";

/**
 * 📶 **블루투스로만 아는 폰 사실 — 받아 적는 한 곳** (reviews/50 ①-4 · 기사님 «나: 값마다 한 길»).
 * 원달앱 STATUS → 관제앱 → 공급 소켓 `phone-status`. 같은 서버를 보나(서버 표지) · 폰 연결 풀린 까닭 · 관제앱이 들은 마지막 숨 셋뿐이다 —
 * 다른 서버를 보는 폰 · 연결이 풀린 폰의 보고는 이 서버에 안 오므로 이 길이 그 값의 유일한 길이다(보고와 겹치지 않는다).
 * 데드맨(`lastSeen`)은 건드리지 않는다 — 그건 «서버가 이 폰과 이야기하나»(보고)다. 메모리만 · 저장 칸 없음.
 */
const statuses = new Map<string, { sameServer: boolean; unlinkedWhy: string | null; heardAt: number }>();

/** 그 기사님 등록 폰만 받는다 — 남의 폰 번호를 대는 값은 버린다 */
export function applyPhoneStatus(userId: string, s: PhoneStatus): boolean {
    if (typeof s?.deviceId !== 'string' || !registeredPhonesOf(userId).includes(s.deviceId)) {
        slog('경고', `🚫 [블루투스 폰 사실] 등록 폰이 아닌 번호 — 버림`);
        return false;
    }
    const prev = statuses.get(s.deviceId);
    /* ⏱️ 들은 때는 서버 시계로 — 관제앱 · 폰 시계와 PC 서버 시계가 어긋나면 «블루투스로는 살아 있음»이 거짓이 된다(관제 리뷰) · 관제앱은 10초마다 보내고 중계는 1초 안 */
    const next = { sameServer: s.sameServer !== false, unlinkedWhy: s.unlinkedWhy ?? null, heardAt: Date.now() };
    statuses.set(s.deviceId, next);
    if (!prev || prev.sameServer !== next.sameServer || prev.unlinkedWhy !== next.unlinkedWhy)
        slog('통신', `📶 [블루투스 폰 사실] ${deviceLabelOf(s.deviceId)} — 같은 서버 ${next.sameServer ? '예' : '아니오'}${next.unlinkedWhy ? ` · 연결 풀림(${next.unlinkedWhy})` : ''}`);
    return true;
}

/**
 * 🚫 **블루투스 받기 전 원달앱** — 보고 문이 거절한 폰(reviews/50 ①-5). 확정 · 상세 문도 이것을 보고 거절하고, 관제웹 폰 칸은 «원달앱 새로 깔기 필요».
 *    새 원달앱이 보고하면 지운다. 메모리만.
 */
const tooOld = new Set<string>();
export function markAppTooOld(deviceId: string): void {
    if (tooOld.has(deviceId)) return;
    tooOld.add(deviceId);
    slog('경고', `🚫 [옛 원달앱] ${deviceLabelOf(deviceId)} — 블루투스 받기 전 판이라 보고를 거절한다(원달앱은 스스로 알람으로 내려간다) · 새로 깔아야 한다`);
}
export function clearAppTooOld(deviceId: string): void {
    if (tooOld.delete(deviceId)) slog('통신', `✅ [옛 원달앱] ${deviceLabelOf(deviceId)} — 새 원달앱으로 보고한다`);
}
export function isAppTooOld(deviceId: string | null | undefined): boolean {
    return !!deviceId && tooOld.has(deviceId);
}

/** 기기 목록에 덧붙일 것 — 들은 적 없으면 빈 것(안 그림) */
export function phoneStatusOf(deviceId: string): { bleSameServer?: boolean; bleUnlinkedWhy?: string | null; bleHeardAt?: number; appTooOld?: boolean } {
    const s = statuses.get(deviceId);
    return { ...(s ? { bleSameServer: s.sameServer, bleUnlinkedWhy: s.unlinkedWhy, bleHeardAt: s.heardAt } : {}), ...(tooOld.has(deviceId) ? { appTooOld: true } : {}) };
}
