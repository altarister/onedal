// @ts-nocheck
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import { networkLevelOf, NETWORK_ALARM, needsUpdateOf, locationStaleOf, GPS_STALE_MS } from '../../src/services/opsHome';
import { touchDeviceSession } from '../../src/routes/devices';
import { homeOf, locationsOf } from '../../src/routes/ops';
import { getUserSession, peekUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { kakaoTotalOf } from '@onedal/shared';

/**
 * 🏠 **운영센터 홈 — 한 번에 읽는 숫자는 그 쪽 문과 같은 함수로** (reviews/33 2단계 · onedal-69 «가» · 모양은 onedal-ea).
 *    두 벌로 세면 홈과 쪽의 숫자가 갈린다 — 홈 숫자 = 쪽 숫자를 문끼리 대조한다. 읽기만 · 세션을 만들지 않는다.
 */
const A = 'test-home-admin', D = 'test-home-driver', P = 'test-home-pending', Q = 'test-home-quiet';
const ORDER = 'TEST-HOME-1';
const io = { to: () => ({ emit: () => {} }), in: () => ({ disconnectSockets: () => {} }), of: () => ({ sockets: new Map(), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const call = async (path: string, query: any = {}) => {
    const layer = opsRouter.stack.find((l: any) => l.route?.path === path && l.route.methods.get);
    let out: any;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params: {}, query, body: {}, user: { id: A }, headers: {} }, res);
    return out;
};

beforeAll(() => {
    for (const id of [A, D, P, Q]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET approved_at = datetime('now'), ops_allowed_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`UPDATE users SET approved_at = datetime('now') WHERE id IN (?, ?)`).run(D, Q);
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(ORDER);
    db.prepare(`INSERT INTO orders (id, userId, status, timestamp, capturedAt, pickup, dropoff, fare) VALUES (?, ?, 'ORDER_CONFIRMED', ?, ?, '경기 광주시 경안동', '경기 파주시 금촌동', 30000)`)
        .run(ORDER, D, new Date().toISOString(), new Date(Date.now() - 4 * 60_000).toISOString());
    clearUserSession(Q);
});
afterAll(() => {
    db.prepare(`DELETE FROM orders WHERE id = ?`).run(ORDER);
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [A, D, P, Q]) { db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(id); db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('🏠 홈 숫자 = 쪽 숫자', () => {
    it('🔴 지금 할 일 셋은 /counts 와 같다 · 접속은 /board/server 와 같다 · 카카오는 /board/kakao 줄의 합', async () => {
        const home = homeOf(io);
        const counts = await call('/counts');
        expect(home.todo).toMatchObject({ callsTodo: counts.callsTodo, pendingMembers: counts.pendingMembers, phonesOffline: counts.phonesOffline });
        const server = await call('/board/server');
        expect(home.access).toMatchObject({ bootedAt: server.bootedAt, sockets: server.sockets, lastScrapAt: server.lastScrapAt, phonesOffline: counts.phonesOffline });
        expect(home.kakao).toEqual(kakaoTotalOf((await call('/board/kakao')).rows));
    });
    it('🔴 운행 중 = /calls 의 회원 수 · 그 기사 줄이 있다', async () => {
        const home = homeOf(io);
        const calls = await call('/calls');
        expect(home.working.driving).toBe(new Set(calls.map((c: any) => c.memberId)).size);
        expect(home.working.rows.map((r: any) => r.memberId)).toContain(D);
    });
    it('🔴 회원 갈래 — 승인 대기는 승인 전 · 탈퇴 아님', () => {
        const home = homeOf(io);
        const pending = db.prepare(`SELECT COUNT(*) n FROM users WHERE approved_at IS NULL AND withdrawn_at IS NULL`).get().n;
        expect(home.members.pending).toBe(pending);
        expect(home.members.total).toBe(db.prepare(`SELECT COUNT(*) n FROM users WHERE withdrawn_at IS NULL`).get().n);
    });
    it('🔴 세션을 만들지 않는다 · 지역은 /locations 의 오늘 점 regions 와 같다', () => {
        const home = homeOf(io);
        expect(peekUserSession(Q)).toBeUndefined();
        expect(home.regions).toEqual(locationsOf({ todayOnly: true }).regions);
    });
    it('🔴 /home 문이 같은 것을 준다', async () => {
        const out = await call('/home');
        expect(out.todo.callsTodo).toBe(homeOf(io).todo.callsTodo);
    });
    it('🔴 진행 중 콜이 있는데 운전석 폰 GPS 가 10분 넘게 안 오면 기사 이상 신호', () => {
        /* 세션이 없거나 점을 한 번도 못 받았으면 «안 옴»이다 — 운전석 폰이 GPS 를 안 보내는 것 */
        const s = getUserSession(D);
        s.lastFix = { x: 127.2, y: 37.4 };
        s.lastFixAt = Date.now();
        const fresh = homeOf(io).todo.emergencies;
        s.lastFixAt = Date.now() - 11 * 60_000;
        expect(homeOf(io).todo.emergencies).toBe(fresh + 1);
    });
    /* 배차망 앱을 앞에 띄우고 달리면 관제웹은 위치를 멈춘다 — 원달앱 폰이 보고에 위치를 실어 보내는 중이면 «위치 안 옴»이 아니다 (onedal-69 «나» · f5 026d5917) */
    it('🔴 운전석 GPS 가 10분 넘어도 원달앱 폰이 위치를 실어 보내는 중이면 안 울린다', () => {
        db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, 'd-home-driver')`).run(D);
        const s = getUserSession(D);
        s.lastFix = { x: 127.2, y: 37.4 };
        s.lastFixAt = Date.now();
        touchDeviceSession('d-home-driver', D, 0, 'LIST', io, false, 37.4, 127.2);   // 폰을 먼저 붙인다 — 안 붙은 폰은 «폰 끊김»으로 따로 울려 이 칸을 가린다
        const fresh = homeOf(io).todo.emergencies;
        s.lastFixAt = Date.now() - 11 * 60_000;
        expect(homeOf(io).todo.emergencies).toBe(fresh);
        db.prepare(`DELETE FROM user_devices WHERE device_id = 'd-home-driver'`).run();
    });
});

describe('🏠 배차망 단계 · 업데이트 판단', () => {
    it('🔴 🟡 주의 = 오늘 처음 보는 글자 · 🔴 비상 = 그 앱이 떠 있는데 한동안 실물 읽기 0 · 못 읽음 여러 번', () => {
        expect(networkLevelOf({ shownNow: true, readsInWindow: 0, failsInWindow: NETWORK_ALARM.FAILS, newWords: 0 })).toBe('alarm');
        expect(networkLevelOf({ shownNow: false, readsInWindow: 0, failsInWindow: NETWORK_ALARM.FAILS, newWords: 0 })).toBe('ok');
        expect(networkLevelOf({ shownNow: true, readsInWindow: 1, failsInWindow: NETWORK_ALARM.FAILS, newWords: 0 })).toBe('ok');
        expect(networkLevelOf({ shownNow: true, readsInWindow: 0, failsInWindow: NETWORK_ALARM.FAILS - 1, newWords: 2 })).toBe('warn');
    });
    it('🔴 위치 안 옴 = 운전석 GPS · 원달앱 폰 위치 중 늦은 것이 10분 넘음 · 둘 다 모르면 안 옴', () => {
        const now = 1_000_000_000_000, old = now - GPS_STALE_MS - 1, fresh = now - 1000;
        expect(locationStaleOf(old, [fresh], now)).toBe(false);
        expect(locationStaleOf(fresh, [old], now)).toBe(false);
        expect(locationStaleOf(old, [old, undefined], now)).toBe(true);
        expect(locationStaleOf(null, [], now)).toBe(true);
    });
    it('🔴 업데이트 필요 = 앱 배포 표에서 그 판 이름의 코드가 최소 판보다 낮다 · 표에 없는 이름 · 최소 판 없음은 안 센다', () => {
        const rel = [{ versionName: '1.0.3', versionCode: 103 }, { versionName: '1.0.5', versionCode: 105 }];
        expect(needsUpdateOf('1.0.3', rel, 105)).toBe(true);
        expect(needsUpdateOf('1.0.5', rel, 105)).toBe(false);
        expect(needsUpdateOf('9.9.9-dev', rel, 105)).toBe(false);
        expect(needsUpdateOf('1.0.3', rel, undefined)).toBe(false);
    });
});
