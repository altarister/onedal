// @ts-nocheck
import db from '../../src/db';
import devicesRouter from '../../src/routes/devices';
import { DEVICE_LINK_ERRORS } from '@onedal/shared';

/**
 * 🔢 **막힌 계정의 연결 번호는 지우지 않는다** (onedal-69 «가» · 다른 LLM 리뷰 ②).
 *    번호를 먼저 지우고 막힘을 보면, 승인 전 계정이 넣은 번호가 사라져 승인 뒤 같은 번호를 다시 넣을 때 «틀린 번호»가 된다.
 *    → 번호가 맞으면 그 주인의 막힘(core/accountGate)을 먼저 보고, 막혔으면 번호를 남기고 403 · 실패로 세지도 않는다.
 *    번호 발급(/pin)도 막힌 계정이면 403 — 같은 판단 한 곳.
 */
const U = 'test-pair-blocked';
const call = async (path: string, req: any) => {
    const layer = devicesRouter.stack.find((l: any) => l.route?.path === path && l.route.methods.post);
    let status = 200, out: any = null;
    const res = { status: (c: number) => { status = c; return res; }, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ ip: '10.9.9.9', get: () => undefined, app: { get: () => undefined }, ...req }, res);
    return { status, out };
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    db.prepare(`UPDATE users SET approved_at = datetime('now', 'localtime') WHERE id = ?`).run(U);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('🔢 막힌 계정과 연결 번호', () => {
    it('🔴 막힌 주인의 번호는 403 뒤에도 남는다 — 승인되면 같은 번호로 연결된다', async () => {
        const { out: issued } = await call('/pin', { user: { id: U } });
        db.prepare(`UPDATE users SET approved_at = NULL WHERE id = ?`).run(U);   // 번호를 받은 뒤 승인 전으로(승인 취소 · 정지와 같은 길)

        const blocked = await call('/pair', { body: { pin: issued.pin, deviceId: 'dev-pair-blocked' } });
        expect(blocked.status).toBe(403);
        expect(blocked.out.error).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);

        db.prepare(`UPDATE users SET approved_at = datetime('now', 'localtime') WHERE id = ?`).run(U);
        const ok = await call('/pair', { body: { pin: issued.pin, deviceId: 'dev-pair-blocked' } });
        expect(ok.status).toBe(200);
        expect(ok.out.success).toBe(true);
    });

    it('🔴 막힌 계정은 번호를 받지 못한다', async () => {
        db.prepare(`UPDATE users SET approved_at = NULL WHERE id = ?`).run(U);
        const r = await call('/pin', { user: { id: U } });
        expect(r.status).toBe(403);
        expect(r.out.error).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
        db.prepare(`UPDATE users SET approved_at = datetime('now', 'localtime') WHERE id = ?`).run(U);
    });
});
