// @ts-nocheck
import db from '../../src/db';
import scrapRouter from '../../src/routes/scrap';
import { phoneSupplyOf } from '../../src/state/phoneSupply';
import opsRouter from '../../src/routes/ops';
import devicesRouter from '../../src/routes/devices';
import { initGeoService } from '../../src/services/geoService';
import { APP_FILTER_KEYS, effectiveRadii, reservedPickupRadiusKmOf, callFilterBlocker } from '@onedal/shared';
import { capacityFullHold, filterVersionOf } from '../../src/core/helpers';
import { readWaitTimes } from '../../src/core/waitTimes';
import { ensureReservedPickupList } from '../../src/state/filterManager';
import { getUserSession, peekUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 📦 **앱에 내려갈 필터는 한 함수(`appFilterOf`)가 만든다 — 폰 응답 · 운영센터 · 관제웹이 같은 값을 본다** (onedal-69 «가» · ea 발견).
 * 화면이 `activeFilter` 만 읽으면 자동 반경 · 복귀 목적지 · 내일 콜 칸 · 잠금이 빠져 폰이 받는 값과 다르다.
 * 🔴 폰 쪽은 그대로다 — 아래 «옛 조립»은 함수로 빼기 전 scrap 의 값 만들기를 옮겨 둔 것이고, 폰 응답과 새 함수가 이것과 깊이 같다.
 * 🔴 읽는 문은 로그를 찍거나 세션을 바꾸지 않는다 — 내일 콜 목록은 폰에 마지막으로 실은 것(`session.reservedPickup`)을 쓴다.
 */
const U = 'test-appfilter', O = 'test-appfilter-other', A = 'test-appfilter-admin';
const DEV = 'dev-appfilter-1';
const HOME = { x: 127.4432, y: 37.2723 };
const io = { in: () => ({ disconnectSockets: () => {} }), to: () => ({ emit: () => {} }), of: () => ({ sockets: new Map(), to: () => ({ emit: () => {} }) }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any, path: string, method: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    if (!layer) return null;
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const run = async (handle: any, req: any) => {
    let status = 200, out: any = null;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await handle({ app, ip: '1.1.1.1', headers: {}, get: () => undefined, params: {}, query: {}, body: {}, ...req }, res);
    return { status, out };
};
/** 📡 보고는 폰을 살아 있게만 한다 — 폰에 가는 필터는 관제앱 공급 한 길(reviews/50 ①-5) · 공급의 폰 몫 심사 중을 필터 칸으로 붙여 옛 조립과 견준다 */
const report = async (_v2: boolean) => {
    const r = await run(handlerOf(scrapRouter, '/', 'post'), { body: { data: [], deviceId: DEV, filterVersion: '', supplyLinked: true } });
    const sup = phoneSupplyOf(U);
    return { ...r, out: { dispatchEngineArgs: { ...sup.filter, evaluatingNow: sup.phones[DEV]?.evaluatingNow ?? false }, filterVersion: sup.filterVersion } };
};
const appFilterOf = (...a: any[]) => require('../../src/state/appFilter').appFilterOf(...a);

/** 🗄️ 옛 조립 — 함수로 빼기 전 `routes/scrap.ts` 의 값 만들기(로그 · 깃발 빼고) 그대로 · 공급(phoneSupplyOf)이 같은 함수를 부른다 */
function oldAssembly(session: any, userId: string, deviceId: string) {
    const src = session.activeFilter;
    const appFilter: Record<string, unknown> = {};
    for (const k of APP_FILTER_KEYS) if (src[k] !== undefined) appFilter[k] = src[k];
    {
        const eff = effectiveRadii(session.activeFilter);
        appFilter.pickupRadiusKm = eff.pickupRadiusKm;
        appFilter.destinationRadiusKm = eff.destinationRadiusKm;
        const reservedR = reservedPickupRadiusKmOf(session.baseFilter);
        if (reservedR != null) appFilter.reservedPickupRadiusKm = reservedR;
        const reservedList = ensureReservedPickupList(session, userId);
        if (reservedList) {
            appFilter.reservedPickupKeywords = reservedList.keywords;
            appFilter.reservedPickupGroups = reservedList.groups;
        }
    }
    if (session.activeFilter.goalCity) appFilter.destinationCity = session.activeFilter.goalCity;
    appFilter.evaluatingNow = !!session.deviceEvaluatingMap.get(deviceId);
    Object.assign(appFilter, readWaitTimes(userId));
    if (session.isBootstrapping) appFilter.isActive = false;
    if (capacityFullHold(session.activeFilter)) appFilter.isActive = false;
    if (!session.isRestored) appFilter.isActive = false;
    if (callFilterBlocker(session.activeFilter)) appFilter.isActive = false;
    return appFilter;
}
/** 🧬 v2 판 글자 — scrap 이 폰에 싣는 그대로(evaluatingNow 빼기) */
function v2VersionOf(f: any) {
    const { evaluatingNow: _live, ...versioned } = f;
    return filterVersionOf(versioned);
}

const setHome = (h: any) =>
    db.prepare(`UPDATE user_settings SET home_x = ?, home_y = ?, home_address = ? WHERE user_id = ?`).run(h?.x ?? null, h?.y ?? null, h ? '경기 이천시' : null, U);

beforeAll(() => {
    initGeoService();
    for (const id of [U, O, A]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    approvedUser(U);
    db.prepare(`UPDATE users SET ops_allowed_at = datetime('now'), approved_at = datetime('now') WHERE id = ?`).run(A);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
    db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(U);
});
afterAll(() => {
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    for (const id of [U, O, A]) {
        db.prepare(`DELETE FROM user_settings WHERE user_id = ?`).run(id);
        db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
        clearUserSession(id);
    }
});

/** 네 경우 — 기본 · 자동 반경 켬 · 복귀(+ 이 폰이 심사 중) · 내일 콜(집 + 기본 반경) */
const CASES: Array<[string, (s: any) => void, (f: any) => void]> = [
    ['기본', () => setHome(null), f => expect(f).not.toHaveProperty('reservedPickupKeywords')],
    ['자동 반경 켬', s => { s.activeFilter = { ...s.activeFilter, pickupRadiusKm: 25, radiusAuto: true, radiusDistanceKm: 33.747, radiusBaseKm: 50 }; },
        f => expect(f.pickupRadiusKm).toBeCloseTo(16.87, 1)],
    ['복귀 · 심사 중', s => { setHome(HOME); s.activeFilter = { ...s.activeFilter, destinationCity: '서울 강남구', callTarget: 'HOME' }; s.deviceEvaluatingMap.set(DEV, 'o-appfilter'); },
        f => { expect(f.destinationCity).toContain('이천'); expect(f.evaluatingNow).toBe(true); }],
    ['내일 콜', s => { setHome(HOME); s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 25 }; },
        f => expect(f.reservedPickupKeywords.length).toBeGreaterThan(10)],
];

describe.each(CASES)('📦 앱 필터 — %s', (_name, arrange, shows) => {
    /* 필터를 켜 둔 채 시작한다 — 꺼져 있으면 잠금 넷(isActive=false)을 빼먹어도 값이 같아 검사가 못 문다 */
    beforeEach(() => { clearUserSession(U); const s = getUserSession(U); s.activeFilter = { ...s.activeFilter, isActive: true }; arrange(s); });

    it('🔴 관제앱 공급 필터(+ 폰 몫 심사 중)가 옛 조립과 깊이 같다', async () => {
        const { out } = await report(false);
        shows(out.dispatchEngineArgs);                         // 이 경우가 정말 그 칸을 만든다(빈 비교가 아니다)
        expect(out.dispatchEngineArgs).toEqual(oldAssembly(getUserSession(U), U, DEV));
    });
    it('🔴 공급 판 글자가 옛 조립에서 낸 것과 같다(심사 중 빼기)', async () => {
        const { out } = await report(true);
        expect(out.filterVersion).toBe(v2VersionOf(oldAssembly(getUserSession(U), U, DEV)));
    });
    it('🔴 새 함수가 옛 조립과 깊이 같다 · 세션을 바꾸지 않는다', async () => {
        await report(false);                                   // 폰이 한 번 받아 내일 콜 목록이 세션에 앉은 뒤
        const s = getUserSession(U);
        const before = { reserved: s.reservedPickup };
        const { filter } = appFilterOf(s, U, DEV, s.reservedPickup ?? null);
        expect(filter).toEqual(oldAssembly(s, U, DEV));
        expect(s.reservedPickup).toBe(before.reserved);
    });
});

/**
 * 📋 **앱이 보는 지역은 두 모음이다 — 상차 목록 · 하차 목록.** 경로 위 동도 하차 목록에 그대로 싣고, 경로 순서 숫자(orderKm)는 안 보낸다.
 *    하차 목록에서 경로 위 동을 빼면 그 목록만 보는 원달앱이 경로 위로 가는 콜을 막는다.
 */
describe('📋 앱 필터 — 상차 목록 · 하차 목록 두 모음', () => {
    const LINE = ['신둔면', '관고동'];
    beforeEach(() => {
        clearUserSession(U);
        const s = getUserSession(U);
        s.activeFilter = { ...s.activeFilter, isActive: true, destinationKeywords: [...LINE, '중리동'] };
        s.myOrders = [{ id: 'o-appfilter-line', status: 'ORDER_CONFIRMED', pickup: '초월읍', dropoff: '관고동', fare: 50000 }];
        s.detourProgressKm = { '신둔면': 6.1, '관고동': 9.4 };
    });
    it('🔴 새 원달앱(v2)에 간 하차 목록에 경로 위 동이 있다', async () => {
        const { out } = await report(true);
        expect(out.dispatchEngineArgs.destinationKeywords).toEqual(expect.arrayContaining(LINE));
    });
    it('🔴 앱 필터에 경로 순서 숫자(orderKm) 칸이 없다', async () => {
        const { out } = await report(false);
        expect(out.dispatchEngineArgs).not.toHaveProperty('orderKm');
    });
});

describe('🚪 앱 필터를 읽는 문 둘', () => {
    it('🔴 운영센터 /board/filter — 세션 있으면 기기마다 app · 폰이 받는 값과 같다', async () => {
        clearUserSession(U);
        await report(false);
        const { out } = await run(handlerOf(opsRouter, '/board/filter', 'get'), { user: { id: A }, query: { memberId: U } });
        const s = getUserSession(U);
        expect(out.app).toEqual([{ deviceId: DEV, filter: appFilterOf(s, U, DEV, s.reservedPickup ?? null).filter }]);
    });
    it('🔴 운영센터 /board/filter — 세션 없으면 app null · 세션 안 만듦', async () => {
        clearUserSession(U);
        const { out } = await run(handlerOf(opsRouter, '/board/filter', 'get'), { user: { id: A }, query: { memberId: U } });
        expect(out.app).toBeNull();
        expect(peekUserSession(U)).toBeUndefined();
    });
    it('🔴 앱 필터를 사람에게 보이는 문은 운영센터 /board/filter 하나 — 관제웹 /app-filter 문은 없다(현황판 칸을 걷음 · ea 7303f2fb)', () => {
        expect(handlerOf(devicesRouter, '/app-filter', 'get')).toBeNull();
    });
});
