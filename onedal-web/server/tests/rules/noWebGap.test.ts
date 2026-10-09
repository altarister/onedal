// @ts-nocheck
import db from '../../src/db';
import * as supply from '../../src/state/phoneSupply';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * ⏳ **관제웹이 잠깐 끊겨도 자동 폰을 곧바로 알람으로 내리지 않는다** (40 X1-a · 기사님 Q1 «가»).
 *
 * 관제앱 안 관제웹 소켓이 다시 붙는 사이(새로고침 · 네트워크 순간 끊김 — 10-06~09 로그 0.6~4.4초) 서버가 «관제웹 없음»으로 읽어
 * 자동을 알람으로 내렸다 — 그 2~4초 동안 원달앱이 확정을 못 눌렀다(66판 «자동 → 알람 → 자동»).
 * 끊긴 뒤 5초 안이면 «관제웹 있음»으로 셈한다 · 5초가 지나면 지금처럼 알람 · 한 번도 안 붙었으면 곧바로 알람.
 */
const U = 'test-noweb-gap';
const DEV = 'dev-noweb-gap';
const now = Date.now();

beforeAll(() => {
    approvedUser(U);
    db.prepare(`UPDATE users SET auto_allowed_at = datetime('now', 'localtime'), auto_until = NULL WHERE id = ?`).run(U);
});
afterAll(() => {
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('⏳ 관제웹 짧은 끊김', () => {
    it('🔴 값 함수 — 붙음 · 끊긴 지 2초는 있음 · 6초 · 한 번도 안 붙음은 없음', () => {
        expect(supply.webAttachedOf({ activeWebSession: { socketId: 's' } as any, webLeftAt: null }, now)).toBe(true);
        expect(supply.webAttachedOf({ activeWebSession: null, webLeftAt: now - 2_000 }, now)).toBe(true);
        expect(supply.webAttachedOf({ activeWebSession: null, webLeftAt: now - 6_000 }, now)).toBe(false);
        expect(supply.webAttachedOf({ activeWebSession: null, webLeftAt: null }, now)).toBe(false);
    });

    it('🔴 자동 명령 폰 — 관제웹이 끊긴 지 2초면 자동 그대로 · 6초면 알람 · 한 번도 안 붙었으면 알람', () => {
        const s = getUserSession(U);
        s.activeWebSession = null;
        s.webLeftAt = Date.now() - 2_000;
        expect(supply.modeSentToPhone(DEV, U, 'AUTO', [DEV])).toBe('AUTO');
        s.webLeftAt = Date.now() - 6_000;
        expect(supply.modeSentToPhone(DEV, U, 'AUTO', [DEV])).toBe('ALARM');
        s.webLeftAt = null;
        expect(supply.modeSentToPhone(DEV, U, 'AUTO', [DEV])).toBe('ALARM');
    });
});
