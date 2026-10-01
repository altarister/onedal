// @ts-nocheck
import db from '../../src/db';
import joinRouter from '../../src/routes/join';
import contentsRouter from '../../src/routes/contents';
import { authDevice } from '../../src/core/deviceAuth';
import { clearUserSession } from '../../src/state/userSessionStore';
import { DEVICE_LINK_ERRORS } from '@onedal/shared';

/**
 * 📝 **가입 · 동의 · 탈퇴 · 글 읽기** (reviews/29 2단계 · shared join.ts 규격 · onedal-1f «가»).
 * 글이 비어도 흐름이 돈다 — 글이 없는 종류는 동의를 요구하지 않는다. 동의 판이 지금 최신과 다르면 409(화면이 글을 다시 읽는다).
 * 탈퇴는 지우지 않는다 — withdrawn_at 만 적고, 폰은 폰 문에서 막힌다.
 */
const U = 'test-join-new';
const ACK = ['thirdParty', 'networkRisk'];
const handle = (router: any, method: string, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const call = async (h: any, { body = {}, params = {}, userId = U }: any = {}) => {
    let status = 200, out: any = undefined;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await h({ body, params, user: userId ? { id: userId } : undefined, headers: {} }, res);
    return { status, out };
};
const me = () => call(handle(joinRouter, 'get', '/me'));
const join = (body: any) => call(handle(joinRouter, 'post', '/'), { body });
const agree = (agreements: any[]) => call(handle(joinRouter, 'post', '/agree'), { body: { agreements } });
const content = (kind: string) => call(handle(contentsRouter, 'get', '/:kind'), { params: { kind }, userId: null });
const putContent = (kind: string, version: number, body = '본문') =>
    db.prepare(`INSERT INTO contents (kind, version, title, body, updated_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`).run(kind, version, kind, body);

beforeAll(() => {
    db.prepare(`DELETE FROM contents`).run();
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, 'd-join-new');
});
afterAll(() => {
    db.prepare(`DELETE FROM contents`).run();
    db.prepare(`DELETE FROM agreements WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📝 글이 비어도 흐름이 돈다', () => {
    it('🔴 새 계정 — 승인 전 · 막힘 · 다시 동의할 것 없음', async () => {
        const { status, out } = await me();
        expect(status).toBe(200);
        expect(out).toMatchObject({ approvedAt: null, withdrawnAt: null, blocked: true, info: null, agreed: [], reconsent: [], paidUntil: null });
    });
    it('🔴 가입 정보 저장 — 동의할 글이 없으니 빈 동의로 통과 · 승인 시각은 안 건드림', async () => {
        const { status, out } = await join({ info: { phone: '010-1234-5678', dispatchNetworks: ['insung', 'kakaopicker'] }, agreements: [], acknowledged: ACK });
        expect(status).toBe(200);
        expect(out.info).toEqual({ phone: '010-1234-5678', dispatchNetworks: ['insung', 'kakaopicker'] });
        expect(out.approvedAt).toBeNull();
    });
    it('🔴 모르는 배차망 · 빈 연락처는 400', async () => {
        expect((await join({ info: { phone: '010-1234-5678', dispatchNetworks: ['nope'] }, agreements: [], acknowledged: ACK })).status).toBe(400);
        expect((await join({ info: { phone: '', dispatchNetworks: ['insung'] }, agreements: [], acknowledged: ACK })).status).toBe(400);
    });
    it('🔴 글은 로그인 없이 읽는다 — 없으면 null · 모르는 종류는 404', async () => {
        expect(await content('terms')).toEqual({ status: 200, out: null });
        expect((await content('nope')).status).toBe(404);
    });
});

describe('📝 글 없는 고지 둘도 동의 기록이 남는다', () => {
    const acks = () => db.prepare(`SELECT kind, version, item FROM agreements WHERE user_id = ? AND kind = 'ack' ORDER BY item`).all(U);
    it('🔴 가입은 고지 둘(제3자 정보 · 배차망 제재 위험)이 다 있어야 받는다 — 하나라도 없으면 400', async () => {
        const info = { phone: '010-1234-5678', dispatchNetworks: ['insung'] };
        expect((await join({ info, agreements: [] })).status).toBe(400);
        expect((await join({ info, agreements: [], acknowledged: ['thirdParty'] })).status).toBe(400);
        expect((await join({ info, agreements: [], acknowledged: ['thirdParty', 'nope'] })).status).toBe(400);
    });
    it('🔴 받은 고지는 agreements 에 kind ack · 0판 · item 키로 · /me 의 동의한 글에는 안 섞인다', async () => {
        expect(acks()).toEqual([
            { kind: 'ack', version: 0, item: 'networkRisk' },
            { kind: 'ack', version: 0, item: 'thirdParty' },
        ]);
        expect((await me()).out.agreed.some((a: any) => a.kind === 'ack')).toBe(false);
    });
    it('🔴 /agree 는 고지를 받지 않는다(첫 가입 때만)', async () => {
        const n = acks().length;
        await call(handle(joinRouter, 'post', '/agree'), { body: { agreements: [], acknowledged: ACK } });
        expect(acks().length).toBe(n);
    });
    it('🔴 고지 줄이 없는 기존 회원은 막지도, 다시 동의로 보내지도 않는다', async () => {
        const OLD = 'test-join-old';
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name, approved_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(OLD, `g-${OLD}`, `${OLD}@test`, OLD);
        const r = await call(handle(joinRouter, 'get', '/me'), { userId: OLD });
        expect(r.out).toMatchObject({ blocked: false, reconsent: [] });
        db.prepare(`DELETE FROM users WHERE id = ?`).run(OLD);
    });
});

describe('📝 글이 생기면 동의 · 판이 오르면 다시 동의', () => {
    it('🔴 약관 1판이 생기면 reconsent 에 terms · 1판 동의로 비워진다', async () => {
        putContent('terms', 1, '첫 판');
        expect((await me()).out.reconsent).toEqual(['terms']);
        expect((await content('terms')).out).toMatchObject({ kind: 'terms', version: 1, body: '첫 판' });
        const r = await agree([{ kind: 'terms', version: 1 }]);
        expect(r.status).toBe(200);
        expect(r.out.reconsent).toEqual([]);
        expect(r.out.agreed).toEqual([{ kind: 'terms', version: 1 }]);
    });
    it('🔴 2판이 오르면 다시 동의 · 옛 판으로 동의하면 409', async () => {
        putContent('terms', 2, '둘째 판');
        expect((await me()).out.reconsent).toEqual(['terms']);
        expect((await content('terms')).out.version).toBe(2);
        expect((await agree([{ kind: 'terms', version: 1 }])).status).toBe(409);
        expect((await agree([{ kind: 'terms', version: 2 }])).out.reconsent).toEqual([]);
    });
    it('🔴 가입도 동의 판이 최신과 다르면 409', async () => {
        const r = await join({ info: { phone: '010-1234-5678', dispatchNetworks: ['insung'] }, agreements: [{ kind: 'terms', version: 1 }], acknowledged: ACK });
        expect(r.status).toBe(409);
    });
});

describe('📝 탈퇴', () => {
    it('🔴 withdrawn_at 만 적고 지우지 않는다 · 폰은 막힌다', async () => {
        db.prepare(`UPDATE users SET approved_at = datetime('now', 'localtime') WHERE id = ?`).run(U);
        expect(authDevice('d-join-new', undefined)).toMatchObject({ ok: true });
        const r = await call(handle(joinRouter, 'post', '/withdraw'));
        expect(r).toEqual({ status: 200, out: { ok: true } });
        expect(db.prepare(`SELECT withdrawn_at FROM users WHERE id = ?`).get(U).withdrawn_at).not.toBeNull();
        expect(db.prepare(`SELECT COUNT(*) n FROM agreements WHERE user_id = ?`).get(U).n).toBeGreaterThan(0);
        expect(authDevice('d-join-new', undefined)).toEqual({ ok: false, status: 403, error: DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED });
    });
});
