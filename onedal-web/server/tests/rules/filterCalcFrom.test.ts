// @ts-nocheck
import { initGeoService, regionsTouchingCircleGrouped, cityAliases } from '../../src/services/geoService';
import { homeCityFrom, goalCityFrom, homeCallsFrom, goalZonesFrom } from '../../src/state/filterGoals';
import { radiusDistanceFrom, netKeywordsFrom, netOfGoalsFrom, adminDongsFrom, dongSigunguFrom, traveledTrimFrom } from '../../src/state/filterNet';
import { cityCenter, haversineKm, progressAlongKm } from '@onedal/shared';

/**
 * 🧮 **콜 필터 셈을 값만 넣어 문다** — filterGoals · filterNet 의 «…From» 셈 함수는 세션 · 설정 저장소 · DB · 지금 시각을 안 읽는다.
 * 세션을 만들지 않고 값을 넣어 값을 본다. 규칙마다 «안 일어나야 함 + 일어나야 함». 세션을 꾸며 겉 함수를 부르는 검사는 filterListRules.
 * 지도 자료(동 경계)만 부팅 때처럼 한 번 읽는다.
 */
const MODA = { x: 127.312587, y: 37.363298 };            // 광주 초월읍
const TERMINAL = { x: 127.446936, y: 37.277421 };        // 이천 중리동
const HD_SINDUN = { x: 127.40410, y: 37.30574 };         // 이천 신둔면
const GONJIAM_STAR = { x: 127.33209, y: 37.35310 };      // 광주 곤지암읍
const LINE = [MODA, GONJIAM_STAR, HD_SINDUN, TERMINAL];
const FILTER = {
    destinationCity: '이천시', callTarget: 'DEST', routeMode: true, radiusAuto: false, radiusBaseKm: 40, radiusDistanceKm: undefined,
    pickupRadiusKm: 10, destinationRadiusKm: 5, quadRadiusKm: 35, detourRadiusKm: 3, srcAngleDeg: 120, dstAngleDeg: 120, excludedRegions: [],
} as any;
const center = (city: string) => { const c = cityCenter(city); return { x: c.lng, y: c.lat }; };
const firstLoad = { line: null, lastDrop: null, withMe: false, nearGoal: false };

beforeAll(() => { initGeoService(); });

describe('🎯 filterGoals — 값만', () => {
    it('🔴 집 시는 좌표가 이긴다 · 좌표가 없을 때만 주소 글자 · 집이 없으면 null', () => {
        expect(homeCityFrom({ x: 127.2944, y: 37.3767, address: '경기 이천시 아무개로' })).toBe('광주시');
        expect(homeCityFrom({ x: NaN, y: NaN, address: '경기 여주시 가남읍' })).toBe('여주시');
        expect(homeCityFrom(null)).toBeNull();
    });

    it('🔴 그물이 향하는 시 — 복귀면 집 시 · 아니면 목적지 · 집을 모르면 목적지', () => {
        expect(goalCityFrom({ destinationCity: '이천시', callTarget: 'DEST' }, '광주시')).toBe('이천시');
        expect(goalCityFrom({ destinationCity: '이천시', callTarget: 'HOME' }, '광주시')).toBe('광주시');
        expect(goalCityFrom({ destinationCity: '이천시', callTarget: 'HOME' }, null)).toBe('이천시');
        expect(goalCityFrom({ callTarget: 'DEST' }, null)).toBe('');
    });

    it('🔴 복귀콜 — 켠 뒤에 잡았고 판이 집 · 하차 마친 콜도 · 판이 비면 하차지 좌표의 시 · 취소 콜은 안', () => {
        const on = '2026-10-07T03:00:00.000Z', after = '2026-10-07T04:00:00.000Z', before = '2026-10-07T02:00:00.000Z';
        const orders = [
            { id: 'done', status: 'ORDER_DELIVERED', capturedAt: after, goalCity: '광주시' },
            { id: 'early', status: 'ORDER_CONFIRMED', capturedAt: before, goalCity: '광주시' },
            { id: 'byDrop', status: 'ORDER_CONFIRMED', capturedAt: after, dropoffX: MODA.x, dropoffY: MODA.y },
            { id: 'other', status: 'ORDER_CONFIRMED', capturedAt: after, goalCity: '이천시' },
            { id: 'cancel', status: 'SAFE_CANCEL', capturedAt: after, goalCity: '광주시' },
        ];
        expect(homeCallsFrom(orders, on, '광주시').map(o => o.id)).toEqual(['done', 'byDrop']);
        expect(homeCallsFrom(orders, null, '광주시')).toEqual([]);
    });

    it('🔴 살아 있는 목적지 · 복귀콜 쥠 · 출발 · 가까이 옴 — 쥔 콜 · 시각 · 위치를 값으로 받는다', () => {
        const on = '2026-10-07T03:00:00.000Z';
        const call = { id: 'k1', status: 'ORDER_CONFIRMED', capturedAt: '2026-10-07T04:00:00.000Z', goalCity: '이천시' };
        const home = { ...FILTER, callTarget: 'HOME' };
        const a = goalZonesFrom({ filter: home, myOrders: [call], departedAt: null, homeCity: '광주시', homeOnAt: on, me: center('광주시') });
        expect(a.zones.map(z => z.city)).toEqual(['광주시', '이천시']);
        expect(a).toMatchObject({ homeOn: true, homeCity: '광주시', homeCaught: false, departed: false });
        expect(a.zones.find(z => z.city === '광주시').nearGoal).toBe(true);
        expect(a.zones.find(z => z.city === '이천시').nearGoal).toBe(false);
        const b = goalZonesFrom({ filter: home, myOrders: [call, { ...call, id: 'h1', goalCity: '광주시' }], departedAt: 1, homeCity: '광주시', homeOnAt: on, me: null });
        expect(b).toMatchObject({ homeCaught: true, departed: true });
        const cancelled = goalZonesFrom({ filter: FILTER, myOrders: [{ ...call, goalCity: '여주시', status: 'SAFE_CANCEL' }], departedAt: null, homeCity: '광주시', homeOnAt: null, me: null });
        expect(cancelled.zones.map(z => z.city)).toEqual(['이천시']);
    });
});

describe('🕸️ filterNet — 값만', () => {
    it('🔴 잰 거리 — 들고 있으면 그대로 · 비면 내 위치 → 목적지 중심 · 위치를 모르면 없음', () => {
        expect(radiusDistanceFrom(30, '이천시', MODA)).toBe(30);
        expect(radiusDistanceFrom(undefined, '이천시', MODA)).toBeCloseTo(haversineKm(MODA, center('이천시')), 6);
        expect(radiusDistanceFrom(undefined, '이천시', null)).toBeUndefined();
    });

    it('🔴 그물 목록 — 내 위치에서 목적지로 · 내 뒤(목현동)는 안 든다 · 잰 거리를 결과에 싣는다', () => {
        const r = netKeywordsFrom(FILTER, '이천시', 5, firstLoad, MODA);
        expect(r.byNet).toBe(true);
        expect(r.flat).toContain('신둔면');
        expect(r.flat).not.toContain('목현동');
        expect(r.measured).toBe(true);
        expect(r.distanceKm).toBeCloseTo(haversineKm(MODA, center('이천시')), 6);
    });

    it('🔴 라인이 있어도 현위치 원은 조각이 넣으라 할 때만 — 하차 조각(withMe 끔)엔 내 뒤 목현동이 없다', () => {
        const part = { line: LINE.map(p => [p.x, p.y]), lastDrop: TERMINAL, withMe: false, nearGoal: false };
        expect(netKeywordsFrom(FILTER, '이천시', 5, part, MODA).flat).not.toContain('목현동');
        expect(netKeywordsFrom(FILTER, '이천시', 5, { ...part, withMe: true }, MODA).flat).toContain('목현동');
    });

    it('🔴 꼭짓점이 없으면 도시 둘레로 물러서고 거리를 안 잰다', () => {
        const r = netKeywordsFrom(FILTER, '이천시', 5, firstLoad, null);
        expect(r.byNet).toBe(false);
        expect(r.flat.length).toBeGreaterThan(5);
        expect(r.measured).toBe(false);
    });

    it('🔴 가까이 온 목적지는 목적지 원에 걸친 동 그대로 · 제외 키는 뺀다', () => {
        const g = cityCenter('이천시');
        const ring = [...new Set(Object.values(regionsTouchingCircleGrouped({ lng: g.lng, lat: g.lat }, 5)).flat())].sort();
        const r = netKeywordsFrom(FILTER, '이천시', 5, { ...firstLoad, nearGoal: true }, MODA);
        expect(r.flat).toEqual(ring);
        const ex = netKeywordsFrom({ ...FILTER, excludedRegions: ['D|이천시|중리동'] }, '이천시', 5, { ...firstLoad, nearGoal: true }, MODA);
        expect(ex.flat).not.toContain('중리동');
        expect(ex.pruned).toBe(1);
    });

    it('🔴 목적지가 둘이면 잰 거리는 첫 목적지에서 재고 다음 목적지는 그 값을 이어 쓴다', () => {
        const goals = {
            zones: [{ city: '여주시', isHome: false, hasCalls: false, nearGoal: false }, { city: '이천시', isHome: false, hasCalls: false, nearGoal: false }],
            homeOn: false, homeCity: null, homeCaught: false, departed: false,
        };
        const r = netOfGoalsFrom({ filter: FILTER, origin: MODA, goals, activeCalls: [], line: null });
        expect(r.measured).toBe(true);
        expect(r.distanceKm).toBeCloseTo(haversineKm(MODA, center('여주시')), 6);
        expect(r.goals).toEqual(['여주시', '이천시']);
        const held = netOfGoalsFrom({ filter: { ...FILTER, radiusDistanceKm: 12 }, origin: MODA, goals, activeCalls: [], line: null });
        expect(held.distanceKm).toBe(12);
    });

    it('🔴 동선이면 콜과 라인이 있어도 라인을 안 쓴다 — 콜 없는 첫짐과 같은 목록 · 노선이면 진행도가 붙는다', () => {
        const call = { id: 'c1', status: 'ORDER_CONFIRMED', pickupX: GONJIAM_STAR.x, pickupY: GONJIAM_STAR.y, dropoffX: TERMINAL.x, dropoffY: TERMINAL.y, goalCity: '이천시' };
        const goals = { zones: [{ city: '이천시', isHome: false, hasCalls: true, nearGoal: false }], homeOn: false, homeCity: null, homeCaught: false, departed: false };
        const line = LINE.map(p => [p.x, p.y]);
        const off = netOfGoalsFrom({ filter: { ...FILTER, routeMode: false }, origin: MODA, goals, activeCalls: [call], line });
        const none = netOfGoalsFrom({ filter: { ...FILTER, routeMode: false }, origin: MODA,
            goals: { ...goals, zones: [{ ...goals.zones[0], hasCalls: false }] }, activeCalls: [], line: null });
        expect(off.flat).toEqual(none.flat);
        const on = netOfGoalsFrom({ filter: FILTER, origin: MODA, goals, activeCalls: [call], line });
        expect(on.flat).not.toEqual(off.flat);
        expect(Object.keys(on.progressKm).length).toBeGreaterThan(0);
    });

    it('🔴 행정동 — 관할 법정동이 있으면 더하고 · 바뀐 게 없으면 null', () => {
        const r = adminDongsFrom({ '성남시 수정구': ['복정동', '수진동'] }, ['복정동', '수진동']);
        expect(r.keywords).toContain('위례동');
        expect(r.groups['성남시 수정구']).toContain('위례동');
        expect(adminDongsFrom(r.groups, r.keywords)).toBeNull();   // 이미 편 목록은 그대로
    });

    it('🔴 이름이 같은 다른 지역 동만 그 시군구 꼴을 싣는다', () => {
        const r = dongSigunguFrom(['고덕동', '명일동'], { '서울 강동구': ['고덕동', '명일동'] });
        expect(Object.keys(r)).toEqual(['고덕동']);
        expect(r['고덕동'].sort()).toEqual([...new Set(cityAliases('서울 강동구'))].sort());
    });

    it('🔴 지나온 곳 빼기 — 지난 동만 · 진행도 모르는 동은 남김 · 묶음 · 별칭 한 벌 · 전부 빠지면 null · 위치가 없으면 null', () => {
        const at = progressAlongKm({ lng: HD_SINDUN.x, lat: HD_SINDUN.y }, LINE.map(p => [p.x, p.y]));
        const base = {
            progress: { '초월읍': at - 2, '곤지암읍': at - 1, '신둔면': at + 1 },
            polyline: LINE, gps: HD_SINDUN,
            keywords: ['곤지암읍', '관고동', '신둔면', '초월읍'],
            groups: { '광주시': ['곤지암읍', '초월읍'], '이천시': ['관고동', '신둔면'] },
        };
        const r = traveledTrimFrom(base);
        expect(r.at).toBeCloseTo(at, 6);
        expect(r.keywords).toEqual(['관고동', '신둔면']);
        expect(r.groups).toEqual({ '이천시': ['관고동', '신둔면'] });
        expect(r.aliases).toEqual(cityAliases('이천시'));
        expect(r.gone).toEqual(['곤지암읍', '초월읍']);
        expect(traveledTrimFrom({ ...base, keywords: ['곤지암읍', '초월읍'] })).toBeNull();
        expect(traveledTrimFrom({ ...base, gps: null })).toBeNull();
        expect(traveledTrimFrom({ ...base, progress: { '신둔면': at + 1 } })).toBeNull();
    });
});
