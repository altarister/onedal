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
    const next = { sameServer: s.sameServer !== false, unlinkedWhy: s.unlinkedWhy ?? null, heardAt: Number(s.heardAt) || Date.now() };
    statuses.set(s.deviceId, next);
    if (!prev || prev.sameServer !== next.sameServer || prev.unlinkedWhy !== next.unlinkedWhy)
        slog('통신', `📶 [블루투스 폰 사실] ${deviceLabelOf(s.deviceId)} — 같은 서버 ${next.sameServer ? '예' : '아니오'}${next.unlinkedWhy ? ` · 연결 풀림(${next.unlinkedWhy})` : ''}`);
    return true;
}

/** 기기 목록에 덧붙일 셋 — 들은 적 없으면 빈 것(안 그림) */
export function phoneStatusOf(deviceId: string): { bleSameServer?: boolean; bleUnlinkedWhy?: string | null; bleHeardAt?: number } {
    const s = statuses.get(deviceId);
    return s ? { bleSameServer: s.sameServer, bleUnlinkedWhy: s.unlinkedWhy, bleHeardAt: s.heardAt } : {};
}
