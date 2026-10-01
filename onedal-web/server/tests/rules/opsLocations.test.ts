// @ts-nocheck
import db from '../../src/db';
import opsRouter, { homeOf, locationsOf } from '../../src/routes/ops';
import { getUserSession, peekUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🗺️ **회원 위치 — 운전석 폰 GPS 마지막 점** (reviews/33 3단계 · 기사님 «가» · onedal-69 «가» Q5).
 *    세션의 lastFix 중 폰이 보낸 진짜 위치(gps)만 — 모의 주행 · 손으로 찍은 점은 «지금 어디 있나»에 섞으면 거짓 위치다.
 *    시 · 구는 동 명부(nearestDong · 카카오 안 부름). 오래된 점도 시각과 함께 준다(지어내지 않는다) · 홈 뱃지는 오늘 점만.
 *    좌표를 보는 문이라 열람 기록 «위치 봄» — 같은 관리자가 60초 안에 다시 읽으면 줄을 안 더한다. 세션을 만들지 않는다.
 */
const A = 'test-loc-admin', G = 'test-loc-gps', M = 'test-loc-mock', OLD = 'test-loc-old', NONE = 'test-loc-none';
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ sockets: new Map(), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const readLocations = async () => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === '/locations' && l.route.methods.get);
    let out: any;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params: {}, query: {}, body: {}, user: { id: A }, headers: {} }, res);
    return out;
};
const views = () => db.prepare(`SELECT COUNT(*) n FROM ops_audit WHERE admin_id = ? AND action = '위치 봄'`).get(A).n;
const fix = (id: string, x: number, y: number, source: string, at: number) => {
    const s = getUserSession(id);
    s.lastFix = { x, y }; s.lastFixSource = source; s.lastFixIsMock = source === 'mock'; s.lastFixAt = at;
};

beforeAll(() => {
    for (const id of [A, G, M, OLD, NONE]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    fix(G, 126.896, 37.517, 'gps', Date.now());                      // 서울 영등포구 근처
    fix(M, 127.26, 37.41, 'mock', Date.now());                       // 모의 주행 — 빠진다
    fix(OLD, 127.26, 37.41, 'gps', Date.now() - 3 * 86_400_000);      // 사흘 전 점 — /locations 엔 있고 홈 뱃지엔 없다
    clearUserSession(NONE);
});
afterAll(() => {
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [A, G, M, OLD, NONE]) { db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(id); db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('🗺️ 회원 위치', () => {
    it('🔴 진짜 GPS 점만 — 시 · 구는 동 명부 · 모의 점은 없다 · 세션 없는 회원은 줄 없음(세션 안 생김)', () => {
        const { rows } = locationsOf({ todayOnly: false });
        const g = rows.find((r: any) => r.memberId === G);
        expect(g).toMatchObject({ lat: 37.517, lng: 126.896, region: expect.stringContaining('영등포') });
        expect(g.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(rows.some((r: any) => r.memberId === M)).toBe(false);
        expect(rows.some((r: any) => r.memberId === OLD)).toBe(true);
        expect(rows.some((r: any) => r.memberId === NONE)).toBe(false);
        expect(peekUserSession(NONE)).toBeUndefined();
    });
    it('🔴 regions 는 rows 의 시 · 구를 센 것 · 오늘만이면 어제 점이 빠진다', () => {
        const all = locationsOf({ todayOnly: false });
        expect(all.regions.reduce((n: number, r: any) => n + r.count, 0)).toBe(all.rows.length);
        const today = locationsOf({ todayOnly: true });
        expect(today.rows.some((r: any) => r.memberId === OLD)).toBe(false);
        expect(today.rows.some((r: any) => r.memberId === G)).toBe(true);
    });
    it('🔴 /locations 는 오래된 점까지 · 읽으면 «위치 봄» 한 줄 · 60초 안 다시 읽으면 안 늘어남', async () => {
        const before = views();
        const out = await readLocations();
        expect(out).toEqual(locationsOf({ todayOnly: false }));
        expect(views()).toBe(before + 1);
        await readLocations();
        expect(views()).toBe(before + 1);
    });
    it('🔴 홈 지역 뱃지 = /locations 중 오늘 점의 regions · 홈은 열람 기록을 안 남긴다', () => {
        const before = views();
        expect(homeOf(io).regions).toEqual(locationsOf({ todayOnly: true }).regions);
        expect(views()).toBe(before);
    });
});
