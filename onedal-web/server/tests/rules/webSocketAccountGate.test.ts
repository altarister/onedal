// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { webAccountGate } from '../../src/socket/webAccountGate';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { DEVICE_LINK_ERRORS } from '@onedal/shared';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🚧 **막힌 계정은 관제웹 소켓에 붙지 못한다** (onedal-69 «가» · 다른 LLM 리뷰 ⑤).
 *    JWT 만 보면(authSocket · isKnownUser) 승인 전 · 정지 계정도 붙어 기사 세션이 생긴다.
 *    판단은 폰 문과 같은 accountGateOf — «끝난 뒤» 정지 + 진행 중 콜이면 통과(결재가 그 콜에 닿게).
 *    운영센터 소켓(/ops)은 opsGate 가 따로 지킨다 — 여기를 붙이지 않는다.
 */
const NEW = 'test-wsgate-new', OK = 'test-wsgate-ok', SUS = 'test-wsgate-sus', AFTER = 'test-wsgate-after';
const user = (id: string, set = '') => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    if (set) db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(id);
};
const gate = (id: string) => {
    let err: any = 'not-called';
    webAccountGate({ data: { user: { id } } } as any, (e?: Error) => { err = e; });
    return err;
};

beforeAll(() => {
    user(NEW);
    approvedUser(OK);
    user(SUS, `approved_at = '2026-01-01T00:00:00', suspended_at = datetime('now', 'localtime'), suspend_after_active = 0`);
    user(AFTER, `approved_at = '2026-01-01T00:00:00', suspended_at = datetime('now', 'localtime'), suspend_after_active = 1`);
});
afterAll(() => {
    for (const id of [NEW, OK, SUS, AFTER]) { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('🚧 관제웹 소켓 — 계정 막힘', () => {
    it('🔴 승인 전 · 즉시 정지는 거절 — 까닭 글자는 ACCOUNT_BLOCKED', () => {
        expect(gate(NEW)?.message).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
        expect(gate(SUS)?.message).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
    });
    it('🔴 승인된 회원은 통과', () => {
        expect(gate(OK)).toBeUndefined();
    });
    it('🔴 «끝난 뒤» 정지 — 진행 중 콜이 없으면 거절 · 있으면 통과', () => {
        expect(gate(AFTER)?.message).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
        getUserSession(AFTER).myOrders.push({ id: 'o-wsgate', status: 'ORDER_CONFIRMED' } as any);
        expect(gate(AFTER)).toBeUndefined();
    });
    it('🔴 관제웹 소켓만 — authSocket 다음에 붙고 · 운영센터(/ops)에는 없다', () => {
        const src = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
        expect(src).toMatch(/io\.use\(authSocket\);\s*\n\s*io\.use\(webAccountGate\);/);
        expect(readFileSync(join(__dirname, '../../src/socket/opsSocket.ts'), 'utf8')).not.toContain('webAccountGate');
    });
});
