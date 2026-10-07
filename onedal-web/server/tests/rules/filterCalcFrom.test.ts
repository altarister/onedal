// @ts-nocheck
import { initGeoService } from '../../src/services/geoService';
import { homeCityFrom, goalCityFrom, homeCallsFrom, goalZonesFrom } from '../../src/state/filterGoals';
import { cityCenter } from '@onedal/shared';

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
