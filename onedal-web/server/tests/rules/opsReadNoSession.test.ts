// @ts-nocheck
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import { getDeviceMode } from '../../src/routes/devices';
import { peekUserSession, getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 👀 **운영센터는 읽기만 — 남의 기사 세션을 만들지도 깨우지도 않는다** (onedal-1f · reviews/29 3단계 버그).
 * 폰 목록이 «등록됐지만 안 붙은 폰»의 모드를 고를 때 getUserSession 을 불러, 운행 안 하는 회원(와이프 · 승인 대기)의
 * 기사 세션이 생기고 user_settings 줄까지 쓰였다 — 그 회원이 1초 고리에 들어갔다.
 * 화면용 모드 판단은 저장된 선택 › 있는 세션의 필터(peek) › MANUAL. 🔴 폰 보고 길(getDeviceMode)은 그대로다.
 */
const A = 'test-nosess-admin', M = 'test-nosess-member', DRV = 'test-nosess-driver';
const io = { in: () => ({ disconnectSockets: () => {} }), to: () => ({ emit: () => {} }), of: () => ({ to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const call = async (path: string, params = {}) => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === path && l.route.methods.get);
    let out: any;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params, query: {}, body: {}, user: { id: A }, headers: {} }, res);
    return out;
};

beforeAll(() => {
    for (const id of [A, M, DRV]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name, approved_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name) VALUES (?, 'd-nosess-m', '안 붙은 폰')`).run(M);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name) VALUES (?, 'd-nosess-drv', '기사 폰')`).run(DRV);
    db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(M);
    clearUserSession(M);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id IN (?, ?)`).run(M, DRV);
    db.prepare(`DELETE FROM user_settings WHERE user_id IN (?, ?)`).run(M, DRV);
    for (const id of [A, M, DRV]) { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('👀 운영센터 읽기는 세션을 안 만든다', () => {
    it('🔴 /members · /phones · /counts 를 읽어도 세션 없는 회원의 세션이 안 생기고 user_settings 줄도 안 생긴다', async () => {
        const members = await call('/members');
        expect(members.find((m: any) => m.id === M).phones.map((p: any) => p.deviceId)).toEqual(['d-nosess-m']);
        await call('/phones');
        await call('/counts');
        expect(peekUserSession(M)).toBeUndefined();
        expect(db.prepare(`SELECT COUNT(*) n FROM user_settings WHERE user_id = ?`).get(M).n).toBe(0);
    });
    it('🔴 안 붙은 폰의 화면 모드 — 저장된 선택 › 있는 세션의 필터 › MANUAL', async () => {
        expect((await call('/phones')).find((p: any) => p.deviceId === 'd-nosess-m').mode).toBe('MANUAL');
        db.prepare(`UPDATE user_devices SET mode = 'ALARM' WHERE device_id = 'd-nosess-m'`).run();
        expect((await call('/phones')).find((p: any) => p.deviceId === 'd-nosess-m').mode).toBe('ALARM');
        expect(peekUserSession(M)).toBeUndefined();
    });
    it('🔴 폰 보고 길(getDeviceMode)은 그대로 — 세션 필터가 켜졌고 저장 선택이 없으면 AUTO', () => {
        const s = getUserSession(DRV);
        s.activeFilter = { ...(s.activeFilter ?? {}), isActive: true };
        expect(getDeviceMode('d-nosess-drv', DRV)).toBe('AUTO');
        s.activeFilter = { ...s.activeFilter, isActive: false };
        expect(getDeviceMode('d-nosess-drv', DRV)).toBe('MANUAL');
    });
});
