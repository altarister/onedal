// @ts-nocheck
import { initGeoService, trapsForKeywords, cityAliases } from '../../src/services/geoService';
import { getCityRegionsWithRadius, regionsTouchingCircleGrouped, pickupListFor } from '../../src/services/geoRegions';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { updateActiveFilter, rebuildNetFilter, trimTraveled } from '../../src/state/filterManager';
import { rebuildPickupList, applyTraveledTrim, ensureReservedPickupList } from '../../src/state/filterNet';
import { homeCityOf, goalCityOf, goalCitiesOf, homeCallsOf } from '../../src/state/filterGoals';
import { SettingsRepository } from '../../src/repositories/SettingsRepository';
import * as callTargetEvents from '../../src/core/callTargetEvents';
import { cityCenter, haversineKm, netForGoal, quadShapeFrom, progressAlongKm, reservedPickupRadiusKmOf } from '@onedal/shared';

/**
 * 🕸️ **콜 필터 목록 규칙을 동작으로 문다** — 목적지 · 집 셈 · 그물(하차 목록) · 상차 목록 · 지나온 곳 빼기 · 내일 상차 목록.
 * 세션을 꾸며 공개 함수를 부르고 activeFilter · 진행도를 본다. 규칙마다 «안 일어나야 함 + 일어나야 함»을 나란히 둔다.
 * 소스 글자로 보면 파일을 나눌 때 옮긴 글자를 따라가 동작이 바뀌어도 초록이다.
 * 좌표는 이천 왕복 시나리오 실값(`pickupListGeo` 와 같은 점).
 */
const MODA = { x: 127.312587, y: 37.363298 };            // 모다아울렛 (광주 초월읍)
const TERMINAL = { x: 127.446936, y: 37.277421 };        // 이천터미널 (이천 중리동)
const HD_SINDUN = { x: 127.40410, y: 37.30574 };         // HD현대 신둔 (이천 신둔면)
const GONJIAM_STAR = { x: 127.33209, y: 37.35310 };      // 곤지암 (광주 곤지암읍)
const HOME = { x: 127.29444030053442, y: 37.376686997522675, address: '경기 광주시 초월읍' };
const LINE = [MODA, GONJIAM_STAR, HD_SINDUN, TERMINAL];
const quiet = { to: () => ({ emit: () => {} }) };

let homeNow: any = HOME;
beforeAll(() => { initGeoService(); });
beforeEach(() => {
    homeNow = HOME;
    jest.spyOn(SettingsRepository, 'getHomeLocation').mockImplementation(() => homeNow);
});
afterEach(() => jest.restoreAllMocks());

/** 빈 차 세션 — 목적지 이천 · 수동 반경 · 지금 GPS 가 `me` */
function make(u: string, me: { x: number; y: number } | null = MODA, f: Record<string, unknown> = {}) {
    clearUserSession(u);
    const s = getUserSession(u);
    Object.assign(s.activeFilter, {
        destinationCity: '이천시', callTarget: 'DEST', routeMode: true, radiusAuto: false, radiusBaseKm: 40, radiusDistanceKm: undefined,
        pickupRadiusKm: 10, destinationRadiusKm: 5, quadRadiusKm: 35, detourRadiusKm: 3, srcAngleDeg: 120, dstAngleDeg: 120, excludedRegions: [],
    }, f);
    Object.assign(s, { lastFix: me, lastFixAt: me ? Date.now() : null, lastFixSource: 'gps', lastFixIsMock: false });
    s.myOrders = [];
    return s;
}
/** 확정 콜 하나(곤지암 → 이천터미널)를 쥐고 KEEP 순간 경로를 얼린 합짐 세션 */
function withCall(s: any, f: Record<string, unknown> = {}) {
    s.myOrders = [{ id: `${s.userId}-c1`, status: 'ORDER_CONFIRMED', pickupX: GONJIAM_STAR.x, pickupY: GONJIAM_STAR.y,
        dropoffX: TERMINAL.x, dropoffY: TERMINAL.y, goalCity: '이천시', capturedAt: new Date().toISOString(), ...f }];
    s.filterLine = LINE;
    s.activeFilter.dispatchPhase = 'GATHERING';
    s.activeFilter.isSharedMode = true;
    return s;
}
const kw = (s: any) => [...(s.activeFilter.destinationKeywords ?? [])];
const pairs = (g: Record<string, string[]>) => Object.entries(g).flatMap(([c, ns]) => ns.map(n => `${c}|${n}`));

describe('🎯 목적지 · 집 셈', () => {
    it('🔴 집이 있는 시는 좌표로 뽑는다 — 주소 글자가 다른 시를 적어도 좌표가 이긴다 · 좌표가 없을 때만 주소 글자', () => {
        homeNow = { ...HOME, address: '경기 이천시 아무개로' };
        expect(homeCityOf('u-home')).toBe('광주시');
        homeNow = { x: NaN, y: NaN, address: '경기 여주시 가남읍' };
        expect(homeCityOf('u-home')).toBe('여주시');
        homeNow = null;
        expect(homeCityOf('u-home')).toBeNull();
    });

    it('🔴 그물이 향하는 시 — 복귀면 집 시 · 아니면 기사님 목적지 · 집을 모르면 목적지로 물러선다 · 목적지를 덮어쓰지 않는다', () => {
        const s = make('u-goal');
        expect(goalCityOf(s, 'u-goal')).toBe('이천시');
        s.activeFilter.callTarget = 'HOME';
        expect(goalCityOf(s, 'u-goal')).toBe('광주시');
        homeNow = null;
        expect(goalCityOf(s, 'u-goal')).toBe('이천시');
        expect(s.activeFilter.destinationCity).toBe('이천시');
    });

    it('🔴 살아 있는 목적지 = 필터값 ∪ 진행 중인 마지막 확정 콜의 목표값 — 취소한 콜은 안 센다', () => {
        const s = make('u-goals');
        expect(goalCitiesOf(s, 'u-goals')).toEqual(['이천시']);
        s.myOrders = [{ id: 'g1', status: 'ORDER_CONFIRMED', goalCity: '여주시' }];
        expect(goalCitiesOf(s, 'u-goals')).toEqual(['이천시', '여주시']);
        s.myOrders = [{ id: 'g1', status: 'ORDER_CONFIRMED', goalCity: '여주시' }, { id: 'g2', status: 'SAFE_CANCEL', goalCity: '양평군' }];
        expect(goalCitiesOf(s, 'u-goals')).toEqual(['이천시', '여주시']);
        s.activeFilter.callTarget = 'HOME';
        expect(goalCitiesOf(s, 'u-goals')).toEqual(['광주시', '여주시']);
    });

    it('🔴 복귀콜 = 복귀를 켠 뒤에 잡았고 판이 집인 콜 — 하차를 마친 콜도 센다(이번 운행으로 세지 않는다) · 판이 비면 하차지 좌표의 시', () => {
        const on = '2026-10-07T03:00:00.000Z';
        jest.spyOn(callTargetEvents, 'callTargetToday').mockReturnValue({ target: 'HOME', homeOnAt: on });
        const s = make('u-homecalls');
        const after = '2026-10-07T04:00:00.000Z', before = '2026-10-07T02:00:00.000Z';
        const orders = [
            { id: 'done', status: 'ORDER_DELIVERED', capturedAt: after, goalCity: '광주시' },
            { id: 'early', status: 'ORDER_CONFIRMED', capturedAt: before, goalCity: '광주시' },
            { id: 'byDrop', status: 'ORDER_CONFIRMED', capturedAt: after, dropoffX: MODA.x, dropoffY: MODA.y },
            { id: 'other', status: 'ORDER_CONFIRMED', capturedAt: after, goalCity: '이천시' },
            { id: 'cancel', status: 'SAFE_CANCEL', capturedAt: after, goalCity: '광주시' },
        ];
        expect(homeCallsOf(s, 'u-homecalls', orders).map(o => o.id)).toEqual(['done', 'byDrop']);
    });

    it('🔴 복귀를 켜면 그물이 집 시를 향한다 — 기사님 목적지는 그대로 · 화면이 읽는 goalCity 는 파생', () => {
        const s = make('u-home-net', GONJIAM_STAR, { callTarget: 'HOME' });
        updateActiveFilter('u-home-net', { destinationRadiusKm: 6 });
        expect(s.activeFilter.goalCity).toBe('광주시');
        expect(s.activeFilter.destinationCity).toBe('이천시');
        expect(Object.keys(s.activeFilter.destinationGroups)).toContain('광주시');
        expect(kw(s)).not.toContain('중리동');
        expect(s.activeFilter.goalCities).toEqual(['광주시']);
    });

    it('🔴 상차 목록이 싣는 지도 재료 — 복귀 켬 · 집 시 · 복귀콜 쥠은 목적지 셈 한 곳에서', () => {
        jest.spyOn(callTargetEvents, 'callTargetToday').mockReturnValue({ target: 'HOME', homeOnAt: '2026-10-07T03:00:00.000Z' });
        const s = make('u-area', MODA, { callTarget: 'HOME' });
        rebuildPickupList(s, 'u-area');
        expect(s.activeFilter.pickupArea).toMatchObject({ homeOn: true, homeCity: '광주시', homeCaught: false });
        s.myOrders = [{ id: 'h1', status: 'ORDER_CONFIRMED', capturedAt: '2026-10-07T04:00:00.000Z', goalCity: '광주시' }];
        rebuildPickupList(s, 'u-area');
        expect(s.activeFilter.pickupArea).toMatchObject({ homeOn: true, homeCaught: true });
    });
});

describe('📏 자동 반경이 쓸 잰 거리', () => {
    it('🔴 비어 있으면 «내 위치 → 목적지 중심»으로 재서 싣는다 — 수동이어도 싣는다 · 들고 있으면 그대로', () => {
        const s = make('u-dist');
        rebuildNetFilter('u-dist', null);
        const c = cityCenter('이천시');
        expect(s.activeFilter.radiusDistanceKm).toBeCloseTo(haversineKm(MODA, { x: c.lng, y: c.lat }), 6);
        expect(s.activeFilter.radiusScale).toBeUndefined();   // 배율이 아니라 잰 거리를 싣는다
        const held = make('u-dist2', MODA, { radiusDistanceKm: 30 });
        rebuildNetFilter('u-dist2', null);
        expect(held.activeFilter.radiusDistanceKm).toBe(30);
    });

    it('🔴 하차 목록도 반경을 쓰기 전에 잰다 — 합짐 중 라인반경만 바꿔(상차 목록을 안 거침) 다시 그려도 거리가 실린다', () => {
        const s = withCall(make('u-dist3', MODA, { radiusAuto: true }));
        s.activeFilter.destinationKeywords = ['가짜동'];
        s.activeFilter.destinationGroups = { '이천시': ['가짜동'] };
        updateActiveFilter('u-dist3', { detourRadiusKm: 4 });
        expect(s.activeFilter.radiusDistanceKm).toBeGreaterThan(15);
    });

    it('🔴 자동일 때만 반경을 거리로 맞춘다 — 수동이면 잰 거리가 달라도 목록이 같다', () => {
        const near = make('u-auto1', MODA, { radiusDistanceKm: 5 }); rebuildNetFilter('u-auto1', null);
        const far = make('u-auto2', MODA, { radiusDistanceKm: 60 }); rebuildNetFilter('u-auto2', null);
        expect(kw(near)).toEqual(kw(far));
        const aNear = make('u-auto3', MODA, { radiusAuto: true, radiusDistanceKm: 5 }); rebuildNetFilter('u-auto3', null);
        const aFar = make('u-auto4', MODA, { radiusAuto: true, radiusDistanceKm: 60 }); rebuildNetFilter('u-auto4', null);
        expect(kw(aNear).length).toBeLessThan(kw(aFar).length);
    });
});

describe('🕸️ 하차 목록 — 그물 한 벌', () => {
    it('🔴 첫짐 목록은 shared 그물(netForGoal)이 담은 동을 다 든다 · 마름모 모양은 평면 필터 값에서', () => {
        const s = make('u-net');
        rebuildNetFilter('u-net', null);
        const goal = cityCenter('이천시');
        const f = s.activeFilter;
        const net = netForGoal(goal, {
            line: null, lineRadiusKm: f.detourRadiusKm, lastDrop: null,
            params: { ...quadShapeFrom(f), srcDiamKm: f.pickupRadiusKm * 2, dstDiamKm: f.destinationRadiusKm * 2 },
            anchor: { name: '내 위치', lng: MODA.x, lat: MODA.y }, me: null,
        });
        expect(net.pass.length).toBeGreaterThan(5);
        for (const d of net.pass) expect(kw(s)).toContain(d.name);
        const narrow = make('u-net2', MODA, { dstAngleDeg: 30 });
        rebuildNetFilter('u-net2', null);
        expect(kw(narrow).length).toBeLessThan(kw(s).length);
    });

    it('🔴 하차 조각에 현위치 원을 넣지 않는다 — 콜을 쥐고 라인이 있어도 내 뒤 7km 목현동은 안 들고 · 상차 목록에는 든다', () => {
        const s = withCall(make('u-behind'));
        rebuildNetFilter('u-behind', null);
        expect(s.activeFilter.pickupKeywords).toContain('목현동');
        expect(kw(s)).not.toContain('목현동');
        expect(kw(s)).toContain('신둔면');
    });

    it('🔴 하차 목록은 상차 목록을 빼지 않는다 — 가는 방향 신둔면은 두 목록에 다 든다', () => {
        const s = make('u-nosub');
        rebuildNetFilter('u-nosub', null);
        expect(s.activeFilter.pickupKeywords).toContain('신둔면');
        expect(kw(s)).toContain('신둔면');
    });

    it('🔴 내 위치도 집도 모르면 도시 둘레로 물러선다 — 비우지 않는다', () => {
        homeNow = null;
        const s = make('u-fallback', null);
        rebuildNetFilter('u-fallback', null);
        const around = getCityRegionsWithRadius('이천시', 5).flat;
        expect(around.length).toBeGreaterThan(5);
        for (const n of around) expect(kw(s)).toContain(n);
    });

    it('🔴 목적지 가까이 오면 목적지 원에 걸친 동 전체 — 관내를 따로 재지 않고 목적지를 갈아치우지 않는다', () => {
        const g = cityCenter('이천시');
        /* 목적지 중심에서 동쪽 약 1.8km — 목적지 반경(5km) 안 */
        const s = make('u-near', { x: g.lng + 0.02, y: g.lat });
        rebuildNetFilter('u-near', null);
        const ring = [...new Set(Object.values(regionsTouchingCircleGrouped({ lng: g.lng, lat: g.lat }, 5)).flat())].sort();
        expect(ring.length).toBeGreaterThan(5);
        expect(kw(s)).toEqual(ring);   // 원에 걸친 동 그대로 — 마름모 · 그물로 더 넓히지 않는다
        expect(s.activeFilter.destinationCity).toBe('이천시');
        expect('localMode' in s.activeFilter).toBe(false);
        /* 먼 목적지는 원이 아니라 그물 — 같은 자리 목록이 다르다 */
        const far = make('u-near-far');
        rebuildNetFilter('u-near-far', null);
        expect(kw(far)).not.toEqual(kw(s));
    });

    it('🔴 빼신 곳은 목록을 만드는 두 길 모두에서 빠진다 — 첫짐 재계산 · 합짐 라인반경 바꿈', () => {
        const s = make('u-ex');
        rebuildNetFilter('u-ex', null);
        expect(kw(s)).toContain('신둔면');
        updateActiveFilter('u-ex', { excludedRegions: ['D|이천시|신둔면'] });
        expect(kw(s)).not.toContain('신둔면');
        const m = withCall(make('u-ex2', MODA, { excludedRegions: ['D|이천시|신둔면'] }));
        m.activeFilter.destinationKeywords = ['가짜동'];
        m.activeFilter.destinationGroups = { '이천시': ['가짜동'] };
        updateActiveFilter('u-ex2', { detourRadiusKm: 4 });
        expect(kw(m)).not.toContain('가짜동');
        expect(kw(m)).not.toContain('신둔면');
        expect(kw(m).length).toBeGreaterThan(5);
    });

    it('🔴 시 별칭은 목록에 든 시 전부에서 — 목적지 시 하나만 싣지 않는다', () => {
        const s = make('u-alias');
        rebuildNetFilter('u-alias', null);
        const parents = Object.keys(s.activeFilter.destinationGroups);
        expect(parents.length).toBeGreaterThan(1);
        for (const p of parents) for (const a of cityAliases(p)) expect(s.activeFilter.customCityFilters).toContain(a);
    });

    it('🔴 합짐 목록 · 진행도는 얼린 라인에서 한 벌 — 진행도는 목록 안 동에만 · 목적지 원으로 든 동(중리동)에는 진행도가 없다', () => {
        const s = withCall(make('u-prog'));
        rebuildNetFilter('u-prog', null);
        const prog = s.detourProgressKm;
        expect(prog && Object.keys(prog).length).toBeGreaterThan(2);
        for (const n of Object.keys(prog)) expect(kw(s)).toContain(n);
        expect(kw(s)).toContain('중리동');
        expect(prog['중리동']).toBeUndefined();
        expect(s.detourFlat).toEqual(Object.keys(prog));
    });

    it('🔴 동선이면 라인을 안 쓴다 — 콜을 쥐었어도 콜 없는 첫짐과 같은 목록(마름모는 내 위치에서) · 노선이면 다르다', () => {
        const off = withCall(make('u-route-off', MODA, { routeMode: false }));
        rebuildNetFilter('u-route-off', null);
        const noLine = make('u-route-none', MODA, { routeMode: false });
        rebuildNetFilter('u-route-none', null);
        expect(kw(off)).toEqual(kw(noLine));
        const on = withCall(make('u-route-on'));
        rebuildNetFilter('u-route-on', null);
        expect(kw(on)).not.toEqual(kw(off));
    });

    it('🔴 필터 목록은 상차 목록 판 값(pickupRadiusKm)을 가짜 값으로 덮어쓰지 않는다', () => {
        const s = withCall(make('u-999'));
        rebuildNetFilter('u-999', null);
        updateActiveFilter('u-999', { detourRadiusKm: 4 });
        expect(s.activeFilter.pickupRadiusKm).toBe(10);
    });

    it('🔴 판정 · 필터는 «상대가 취소함» 칸을 안 읽는다 — 그 칸이 있어도 목록이 같다', () => {
        const a = withCall(make('u-cc1'));
        rebuildNetFilter('u-cc1', null);
        const b = withCall(make('u-cc2'), { counterpartCancelled: true });
        rebuildNetFilter('u-cc2', null);
        expect(kw(b)).toEqual(kw(a));
        expect(b.activeFilter.pickupKeywords).toEqual(a.activeFilter.pickupKeywords);
    });
});

describe('🛣️ 합짐 중 반경 · 제외가 바뀌면 경유를 다시 그린다', () => {
    const merge = (u: string) => {
        const s = withCall(make(u));
        s.activeFilter.destinationKeywords = ['가짜동'];
        s.activeFilter.destinationGroups = { '이천시': ['가짜동'] };
        s.activeFilter.customCityFilters = ['가짜시'];
        return s;
    };

    it('🔴 라인반경이 바뀌면 목록 · 묶음 · 별칭 · 진행도를 한 벌로 다시 넣는다', () => {
        const s = merge('u-detour');
        updateActiveFilter('u-detour', { detourRadiusKm: 4 });
        expect(kw(s)).not.toContain('가짜동');
        expect(kw(s).length).toBeGreaterThan(5);
        expect(pairs(s.activeFilter.destinationGroups).length).toBeGreaterThanOrEqual(kw(s).length - 10);
        expect(s.activeFilter.customCityFilters).not.toContain('가짜시');
        for (const p of Object.keys(s.activeFilter.destinationGroups)) for (const a of cityAliases(p)) expect(s.activeFilter.customCityFilters).toContain(a);
        expect(s.detourProgressKm && Object.keys(s.detourProgressKm).length).toBeGreaterThan(0);
    });

    it('🔴 반경 · 제외가 그대로면 다시 그리지 않는다', () => {
        const s = merge('u-detour-same');
        updateActiveFilter('u-detour-same', { minFare: 30000 });
        expect(kw(s)).toContain('가짜동');
    });

    it('🔴 경로가 없으면 아무것도 넣지 않는다 — 없는 라인을 지어내지 않는다', () => {
        const s = merge('u-detour-noline');
        s.myOrders = [];
        s.filterLine = null;
        updateActiveFilter('u-detour-noline', { detourRadiusKm: 4 });
        expect(kw(s)).toContain('가짜동');
    });
});

describe('📋 상차 목록', () => {
    it('🔴 목적지가 없으면 빈 목록 — «제한 없음»이 아니라 고장으로 막힌다 · 있으면 든다', () => {
        const none = make('u-pick-none', MODA, { destinationCity: '' });
        rebuildPickupList(none, 'u-pick-none');
        expect(none.activeFilter.pickupKeywords).toEqual([]);
        const some = make('u-pick-some');
        rebuildPickupList(some, 'u-pick-some');
        expect(some.activeFilter.pickupKeywords).toContain('초월읍');
    });

    it('🔴 «바뀌었나»는 목록만이 아니라 지도 재료 · 가까이 옴도 본다', () => {
        const s = make('u-pick-changed');
        expect(rebuildPickupList(s, 'u-pick-changed')).toBe(true);
        expect(rebuildPickupList(s, 'u-pick-changed')).toBe(false);
        s.pickupNearKey = undefined;
        expect(rebuildPickupList(s, 'u-pick-changed')).toBe(true);
        s.activeFilter.pickupArea = undefined;
        expect(rebuildPickupList(s, 'u-pick-changed')).toBe(true);
    });

    it('🔴 함정 낱말은 상차 목록 ∪ 하차 목록에서 한 벌 — 하차 목록만으로 만들지 않는다', () => {
        const s = make('u-traps');
        rebuildNetFilter('u-traps', null);
        const f = s.activeFilter;
        expect(f.keywordTraps).toEqual(trapsForKeywords([...new Set([...f.destinationKeywords, ...f.pickupKeywords])]));
        expect(f.keywordTraps).not.toEqual(trapsForKeywords(f.destinationKeywords));
        /* 상차 목록을 다시 만드는 길도 함정 낱말을 새로 만든다 */
        f.keywordTraps = {};
        rebuildPickupList(s, 'u-traps');
        expect(f.keywordTraps).toEqual(trapsForKeywords([...new Set([...f.destinationKeywords, ...f.pickupKeywords])]));
    });

    it('🔴 내일 상차 목록은 판정과 같은 두 값(집 · 기본 반경)으로 오늘 상차 목록과 같은 함수를 부른다 — 오늘 반경이 아니다', () => {
        const s = make('u-reserved', MODA, { pickupRadiusKm: 3 });
        s.baseFilter = { ...s.baseFilter, pickupRadiusKm: 15 };
        s.reservedPickup = null;
        const r = ensureReservedPickupList(s, 'u-reserved');
        const want = pickupListFor({ me: { x: HOME.x, y: HOME.y }, radii: { pickupRadiusKm: reservedPickupRadiusKmOf(s.baseFilter), detourRadiusKm: 0 },
            line: null, parts: { line: false, goalCities: [] } });
        expect(r.keywords).toEqual(want.list);
        expect(r.groups).toEqual(want.grouped);
    });
});

describe('🔄 지나온 곳 빼기', () => {
    /** 경로 위 진행도를 직접 적은 세션 — 지금 GPS 는 HD현대 신둔 */
    const trimSession = (u: string, gps = HD_SINDUN) => {
        const s = withCall(make(u, gps));
        const at = progressAlongKm({ lng: gps.x, lat: gps.y }, LINE.map(p => [p.x, p.y]));
        const behind = ['초월읍', '곤지암읍', '도척면', '마장면', '실촌읍', '퇴촌면', '경안동', '쌍령동'];
        s.activeFilter.destinationGroups = { '광주시': behind.filter(n => n !== '마장면'), '이천시': ['마장면', '신둔면', '중리동', '관고동'] };
        s.activeFilter.destinationKeywords = [...behind, '신둔면', '중리동', '관고동'].sort();
        s.activeFilter.customCityFilters = ['광주시', '광주', '이천시', '이천'];
        s.detourProgressKm = { ...Object.fromEntries(behind.map((n, i) => [n, at - 1 - i * 0.1])), '신둔면': at + 1, '중리동': at + 5 };
        return { s, at, behind };
    };

    it('🔴 지나온 동만 뺀다 — 진행도를 모르는 동(관고동)은 남긴다 · 묶음 · 별칭도 한 벌로 줄인다', () => {
        const { s, behind } = trimSession('u-trim');
        expect(applyTraveledTrim(s)).toBe(true);
        for (const n of behind) expect(kw(s)).not.toContain(n);
        expect(kw(s)).toEqual(['관고동', '신둔면', '중리동']);
        expect(s.activeFilter.destinationGroups).toEqual({ '이천시': ['신둔면', '중리동', '관고동'] });
        expect(s.activeFilter.customCityFilters).not.toContain('광주');
        expect(s.activeFilter.customCityFilters).toContain('이천');
    });

    it('🔴 국면을 보지 않는다 — 모으는 중이든 운행 중이든 같다', () => {
        const a = trimSession('u-trim-g').s;
        const b = trimSession('u-trim-d').s;
        b.activeFilter.dispatchPhase = 'DELIVERING';
        applyTraveledTrim(a); applyTraveledTrim(b);
        expect(kw(b)).toEqual(kw(a));
    });

    it('🔴 전부 빠지면 아무것도 안 한다 — 빈 필터는 «제한 없음»이 아니라 고장', () => {
        const { s } = trimSession('u-trim-all');
        s.activeFilter.destinationKeywords = ['초월읍', '곤지암읍'];
        expect(applyTraveledTrim(s)).toBe(false);
        expect(kw(s)).toEqual(['초월읍', '곤지암읍']);
    });

    it('🔴 지금 위치로만 뺀다 — 묵은 위치 · 집 주소로 대신한 위치면 안 뺀다', () => {
        const { s } = trimSession('u-trim-stale');
        const before = kw(s);
        /* 집을 경로 앞쪽(이천터미널)에 둔다 — 집 주소로 대신 재면 «다 지나왔다»가 되는 자리 */
        homeNow = { x: TERMINAL.x, y: TERMINAL.y, address: '경기 이천시 중리동' };
        s.lastFixAt = Date.now() - 60 * 60 * 1000;
        expect(applyTraveledTrim(s)).toBe(false);
        expect(kw(s)).toEqual(before);
    });

    it('🔴 뺀 줄에 동 이름을 싣는다 — 많으면 앞 여섯 + «외 N»', () => {
        const { s } = trimSession('u-trim-log');
        const log = jest.spyOn(console, 'log').mockImplementation(() => {});
        applyTraveledTrim(s);
        const line = log.mock.calls.map(c => String(c[0])).find(t => t.includes('[지나온 구간]'));
        expect(line).toMatch(/뺀 8개: 경안동·곤지암읍·도척면·마장면·실촌읍·쌍령동 외 2\)/);
    });

    it('🔴 부르는 길 둘 — 필터를 바꿀 때 끝에서 · GPS 전용 통로에서 · 전용 통로는 파생 재계산(허용 차종)을 안 거치고 알리기만 한다', () => {
        const a = trimSession('u-trim-upd').s;
        updateActiveFilter('u-trim-upd', { minFare: 30000 });
        expect(kw(a)).not.toContain('초월읍');
        const b = trimSession('u-trim-gps').s;
        b.activeFilter.allowedVehicleTypes = ['표시용'];
        const emit = jest.fn();
        trimTraveled('u-trim-gps', { to: () => ({ emit }) });
        expect(kw(b)).not.toContain('초월읍');
        expect(b.activeFilter.allowedVehicleTypes).toEqual(['표시용']);
        expect(emit).toHaveBeenCalledWith('filter-updated', expect.anything());
        void quiet;
    });
});
