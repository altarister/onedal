// @ts-nocheck
import { createHash } from 'crypto';
import db from '../../src/db';
import devicesRouter from '../../src/routes/devices';
import scrapRouter from '../../src/routes/scrap';
import { generatePin } from '../../src/state/pairingStore';
import { authDevice } from '../../src/core/deviceAuth';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { DEVICE_LINK_ERRORS } from '@onedal/shared';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🚧 **막힌 계정의 폰은 받지 않는다** (reviews/29 2단계 · onedal-1f «가»).
 * 승인 전 · 탈퇴 · 즉시 정지 계정의 폰 연결과 폰 보고는 403 ACCOUNT_BLOCKED — 앱은 «이용이 멈췄습니다» 띠로 받는다(앱 변경 없음).
 * «끝난 뒤» 정지는 진행 중 콜이 있으면 끝날 때까지 받는다 — 중간에 끊으면 안전취소가 멈춘다.
 * 🔴 토큰 없는 옛 길도 같은 문을 지난다 — 막힌 계정이 토큰만 빼면 지나가는 구멍이 없게.
 */
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handle = (router: any, method: string, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const call = async (h: any, body: any, headers: any = {}) => {
    let status = 200, out: any = null;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await h({ app, body, headers, ip: '9.9.9.8', get: (k: string) => headers[k.toLowerCase()] }, res);
    return { status, out };
};
const sha = (t: string) => createHash('sha256').update(t).digest('hex');

const NEW = 'test-gate-new', OK = 'test-gate-ok', WD = 'test-gate-wd', SUS = 'test-gate-sus', AFTER = 'test-gate-after';
const ALL = [NEW, OK, WD, SUS, AFTER];
const user = (id: string, set = '') => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    if (set) db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(id);
};
const link = (userId: string, deviceId: string, token?: string) =>
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, token_hash) VALUES (?, ?, ?)`).run(userId, deviceId, token ? sha(token) : null);

beforeAll(() => {
    user(NEW);
    approvedUser(OK);
    user(WD, `approved_at = '2026-01-01T00:00:00', withdrawn_at = '2026-01-02T00:00:00'`);
    user(SUS, `approved_at = '2026-01-01T00:00:00', suspended_at = '2026-01-02T00:00:00', suspend_after_active = 0`);
    user(AFTER, `approved_at = '2026-01-01T00:00:00', suspended_at = '2026-01-02T00:00:00', suspend_after_active = 1`);
    link(NEW, 'd-gate-new'); link(NEW, 'd-gate-new-tok', 'tok-new');
    link(OK, 'd-gate-ok'); link(WD, 'd-gate-wd'); link(SUS, 'd-gate-sus'); link(AFTER, 'd-gate-after');
});
afterAll(() => {
    for (const id of ALL) {
        db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(id);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
        clearUserSession(id);
    }
});

const blocked = { ok: false, status: 403, error: DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED };

describe('🚧 폰 문 — 계정 사실', () => {
    it('🔴 승인 전 계정 — 토큰 없는 옛 길도 · 토큰을 실은 길도 403', () => {
        expect(authDevice('d-gate-new', undefined)).toEqual(blocked);
        expect(authDevice('d-gate-new-tok', 'tok-new')).toEqual(blocked);
    });
    it('🔴 승인된 계정은 지금처럼 지난다', () => {
        expect(authDevice('d-gate-ok', undefined)).toMatchObject({ ok: true, userId: OK });
    });
    it('🔴 탈퇴 · 즉시 정지는 403', () => {
        expect(authDevice('d-gate-wd', undefined)).toEqual(blocked);
        expect(authDevice('d-gate-sus', undefined)).toEqual(blocked);
    });
    it('🔴 «끝난 뒤» 정지 — 진행 중 콜이 있으면 받고, 없으면 403', () => {
        expect(authDevice('d-gate-after', undefined)).toEqual(blocked);
        getUserSession(AFTER).myOrders.push({ id: 'o-gate-after', status: 'ORDER_CONFIRMED' } as any);
        expect(authDevice('d-gate-after', undefined)).toMatchObject({ ok: true, userId: AFTER });
        getUserSession(AFTER).myOrders[0].status = 'ORDER_COMPLETED';
        expect(authDevice('d-gate-after', undefined)).toEqual(blocked);
    });
});

describe('🚧 서버가 다시 떠도 진행 중 콜을 안다', () => {
    const putOrder = (id: string, status: string, timestamp = new Date().toISOString()) =>
        db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, pickup, dropoff, fare) VALUES (?, 'AUTO', ?, ?, ?, '상차', '하차', 10000)`).run(id, status, AFTER, timestamp);
    afterAll(() => db.prepare(`DELETE FROM orders WHERE userId = ?`).run(AFTER));

    it('🔴 «끝난 뒤» 정지 + 세션 없음(재기동) + DB 에 진행 중 콜 → 받는다 — 결재 · 비상 보고가 그 콜에 닿게', () => {
        clearUserSession(AFTER);
        putOrder('o-gate-db', 'ORDER_CONFIRMED');
        expect(authDevice('d-gate-after', undefined)).toMatchObject({ ok: true, userId: AFTER });
    });
    it('🔴 DB 의 콜이 끝났거나 복구 창(어제 영업일)보다 오래된 미완료면 막는다 — 옛 줄이 정지를 영원히 미루지 않게', () => {
        clearUserSession(AFTER);
        putOrder('o-gate-db', 'ORDER_COMPLETED');
        expect(authDevice('d-gate-after', undefined)).toEqual(blocked);
        putOrder('o-gate-db', 'ORDER_CONFIRMED', new Date(Date.now() - 5 * 86_400_000).toISOString());
        expect(authDevice('d-gate-after', undefined)).toEqual(blocked);
    });
    it('🔴 즉시 정지는 진행 중 콜이 있어도 막는다', () => {
        db.prepare(`INSERT OR REPLACE INTO orders (id, type, status, userId, timestamp, pickup, dropoff, fare) VALUES ('o-gate-sus', 'AUTO', 'ORDER_CONFIRMED', ?, ?, '상차', '하차', 10000)`).run(SUS, new Date().toISOString());
        expect(authDevice('d-gate-sus', undefined)).toEqual(blocked);
        db.prepare(`DELETE FROM orders WHERE id = 'o-gate-sus'`).run();
    });
});

describe('🚧 평범한 회원은 진행 중 콜을 안 읽는다', () => {
    it('🔴 승인된 회원의 폰 보고는 orders 를 읽지 않는다 — 폰 보고는 분당 수십 번이다', () => {
        clearUserSession(OK);
        const spy = jest.spyOn(db, 'prepare');
        expect(authDevice('d-gate-ok', undefined)).toMatchObject({ ok: true });
        expect(spy.mock.calls.some(([sql]) => /FROM orders/.test(String(sql)))).toBe(false);
        spy.mockRestore();
    });
});

describe('🚧 문 두 곳', () => {
    it('🔴 승인 전 계정의 폰 연결(연결 번호)은 403 · 폰 줄을 만들지 않는다', async () => {
        const { pin } = generatePin(NEW);
        const { status, out } = await call(handle(devicesRouter, 'post', '/pair'), { pin, deviceId: 'd-gate-pair', deviceName: 'SM-GATE' });
        expect(status).toBe(403);
        expect(out.error).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
        expect(db.prepare(`SELECT COUNT(*) n FROM user_devices WHERE device_id = 'd-gate-pair'`).get().n).toBe(0);
    });
    it('🔴 승인 전 계정의 /api/scrap 은 403', async () => {
        const { status, out } = await call(handle(scrapRouter, 'post', '/'), { deviceId: 'd-gate-new', data: [] });
        expect(status).toBe(403);
        expect(out.error).toBe(DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED);
    });
});
