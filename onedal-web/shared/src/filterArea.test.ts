import { describe, it, expect } from 'vitest';
import { goalZonesOf, pickupShapeOf, dropoffPartsOf, lastDropOf, lineUntil, isNearGoal, withNearness } from './filterArea';
import { cityCenter } from './callNet';

/**
 * 🎯 **목적지 가까이 옴** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «필터 영역»)
 * Q(현위치→목적지) 마름모가 현위치 원 ∪ 그 목적지 원 안에 **통째로** 들어가면 — 상차 A 전체 · 하차 그 목적지 원 전체.
 * 좌표는 이천 왕복 시나리오 실값 · 반경 · 모양은 그때 자동 반경이 준 값.
 */
describe('🎯 목적지 가까이 옴 — 마름모가 두 원 안에 통째로', () => {
    const TERMINAL = { x: 127.446936, y: 37.277421 };   // 이천터미널 — 이천 중심 1.2km
    const MODA = { x: 127.312587, y: 37.363298 };       // 모다아울렛 — 이천 중심 16km
    const ICHEON = cityCenter('이천시');
    const params = { srcAngleDeg: 120, dstAngleDeg: 120, quadRadiusKm: 15.9, srcDiamKm: 4.55 * 2, dstDiamKm: 4.55 * 2 };
    it('🔴 이천터미널에 서 있으면 이천은 가까이 옴', () => {
        expect(isNearGoal({ me: TERMINAL, goal: ICHEON, params })).toBe(true);
    });
    it('🔴 모다아울렛이면 이천은 멀다 — 마름모가 두 원 밖으로 넓게 나간다', () => {
        expect(isNearGoal({ me: MODA, goal: ICHEON, params })).toBe(false);
    });
    it('반경을 크게 두면(수동) 더 먼 곳에서도 가까이 옴 — 기사님 «수동으로 둘의 크기를 다르게 설정할 수 있어»', () => {
        expect(isNearGoal({ me: MODA, goal: ICHEON, params: { ...params, quadRadiusKm: 2, srcDiamKm: 24, dstDiamKm: 24 } })).toBe(true);
    });
    it('목적지마다 따로 — 이천에 와서 복귀를 켜면 이천은 가까이 옴 · 집(광주)은 멀다 · 모르는 시는 멀다로 둔다', () => {
        const z = withNearness([
            { city: '이천시', isHome: false, state: 'idle' },
            { city: '광주시', isHome: true, state: 'idle' },
            { city: '없는시', isHome: false, state: 'idle' },
        ], { me: TERMINAL, params });
        expect(z.map(g => g.near)).toEqual([true, false, false]);
    });
    it('🔴 가까이 온 목적지가 있으면 운행 중이어도 상차는 A 전체', () => {
        expect(pickupShapeOf([{ city: '이천시', isHome: false, state: 'driving', near: true }])).toBe('me');
        expect(pickupShapeOf([{ city: '이천시', isHome: false, state: 'driving', near: false }])).toBe('meLine');
    });
    it('🔴 가까이 온 목적지의 하차 조각은 목적지 원뿐 — 현위치 원 · 라인 · 마름모 없음', () => {
        expect(dropoffPartsOf('driving', true, true)).toEqual({ me: false, line: false, quadFrom: null });
        expect(dropoffPartsOf('idle', false, true)).toEqual({ me: false, line: false, quadFrom: null });
    });
});

/**
 * 🧩 **필터 영역 — 살아 있는 목적지마다 상태 셋** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «필터 영역» · «상차 영역» · «하차 영역»).
 *
 * | 그 목적지의 상태 | 필터 영역 | 상차 영역 |
 * | 콜 없음 (idle)            | A ∪ Q(현위치→목적지) ∪ 목적지 영역 | A |
 * | 경로 생김 · 운행 전 (routed) | A ∪ 라인 ∪ Q(종착지→목적지) ∪ 목적지 영역 | A |
 * | 운행 뒤 (driving)         | (A ∩ 라인) ∪ 라인 ∪ Q(종착지→목적지) ∪ 목적지 영역 | A ∩ 라인 |
 *
 * 살아 있는 목적지: 목적지 = 복귀 끔 · 복귀콜 아직 못 잡음 · 목적지 콜 남음 / 집 = 복귀 켬
 */
const base = { destinationCity: '이천시', homeCity: '광주시', homeOn: false, homeCaught: false, departed: false };
const destCall = { goalCity: '이천시' };
const homeCall = { goalCity: '광주시' };

describe('살아 있는 목적지와 상태 — 기사님이 적은 경우 그대로', () => {
    it('콜 없음 → 목적지 하나 · 콜 없음 · 상차는 A', () => {
        const z = goalZonesOf({ ...base, activeCalls: [] });
        expect(z).toEqual([{ city: '이천시', isHome: false, state: 'idle' }]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('콜을 잡아 경로가 생김 (운행 전) → 상차는 A 전체', () => {
        const z = goalZonesOf({ ...base, activeCalls: [destCall] });
        expect(z).toEqual([{ city: '이천시', isHome: false, state: 'routed' }]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('운행 시작 뒤 → 상차는 A ∩ 라인', () => {
        const z = goalZonesOf({ ...base, departed: true, activeCalls: [destCall] });
        expect(z).toEqual([{ city: '이천시', isHome: false, state: 'driving' }]);
        expect(pickupShapeOf(z)).toBe('meLine');
    });
    it('🔴 운행 뒤 · 목적지 콜 남음 · 복귀 켬 → 집은 «콜 없음»이라 상차는 A 전체', () => {
        const z = goalZonesOf({ ...base, homeOn: true, departed: true, activeCalls: [destCall] });
        expect(z).toEqual([
            { city: '이천시', isHome: false, state: 'driving' },
            { city: '광주시', isHome: true, state: 'idle' },
        ]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('🔴 위 + 집 가는 콜 잡음 → 목적지 콜이 남았으니 목적지도 산다 · 상차는 A ∩ 라인', () => {
        const z = goalZonesOf({ ...base, homeOn: true, homeCaught: true, departed: true, activeCalls: [destCall, homeCall] });
        expect(z).toEqual([
            { city: '이천시', isHome: false, state: 'driving' },
            { city: '광주시', isHome: true, state: 'driving' },
        ]);
        expect(pickupShapeOf(z)).toBe('meLine');
    });
    it('목적지 콜 끝 · 복귀 켬 · 집 가는 콜 잡음 → 집만 · 상차는 A ∩ 라인', () => {
        const z = goalZonesOf({ ...base, homeOn: true, homeCaught: true, departed: true, activeCalls: [homeCall] });
        expect(z).toEqual([{ city: '광주시', isHome: true, state: 'driving' }]);
        expect(pickupShapeOf(z)).toBe('meLine');
    });
});

describe('표에 안 적힌 경우 — 같은 규칙으로', () => {
    it('복귀 켬 · 복귀콜 아직 없음 · 콜 0건 → 목적지 ∪ 집 · 둘 다 콜 없음 (관내 가까운 콜도 하자)', () => {
        const z = goalZonesOf({ ...base, homeOn: true, activeCalls: [] });
        expect(z.map(g => [g.city, g.state])).toEqual([['이천시', 'idle'], ['광주시', 'idle']]);
        expect(pickupShapeOf(z)).toBe('me');
    });
    it('복귀콜을 잡았다 내렸고 둘째를 아직 못 잡음 → 집만 · 콜 없음 (목적지는 다시 안 산다)', () => {
        const z = goalZonesOf({ ...base, homeOn: true, homeCaught: true, activeCalls: [] });
        expect(z).toEqual([{ city: '광주시', isHome: true, state: 'idle' }]);
    });
    it('🏘️ 관내는 따로 없다 — 목적지에서 콜을 다 내리면 그냥 «콜 없음»', () => {
        expect(goalZonesOf({ ...base, activeCalls: [] })[0].state).toBe('idle');
    });
});

describe('모르는 값은 지어내지 않는다 (규칙 ④)', () => {
    it('목적지를 모르면 목적지가 없다 · 상차 도형도 없다', () => {
        const z = goalZonesOf({ ...base, destinationCity: null, activeCalls: [] });
        expect(z).toEqual([]);
        expect(pickupShapeOf(z)).toBeNull();
    });
    it('복귀 켬인데 집을 모르면 목적지만 — 서버 `goalCitiesOf` 와 같다', () => {
        const z = goalZonesOf({ ...base, homeCity: null, homeOn: true, activeCalls: [destCall] });
        expect(z.map(g => g.city)).toEqual(['이천시']);
    });
});

describe('🔵 하차 영역 — 목적지 하나에 넣는 조각 (목적지 원은 늘 넣는다)', () => {
    it('콜 없음: 현위치 원 ∪ 현위치→목적지 마름모', () => {
        expect(dropoffPartsOf('idle', false)).toEqual({ me: true, line: false, quadFrom: 'me' });
    });
    it('경로 생김 (운행 전): 현위치 원 ∪ 라인 ∪ 종착지→목적지 마름모', () => {
        expect(dropoffPartsOf('routed', true)).toEqual({ me: true, line: true, quadFrom: 'lastDrop' });
    });
    it('운행 뒤: 라인 ∪ 종착지→목적지 마름모 — (A ∩ 라인)은 라인 안이라 현위치 원은 안 넣는다', () => {
        expect(dropoffPartsOf('driving', true)).toEqual({ me: false, line: true, quadFrom: 'lastDrop' });
    });
    it('🔷 라인이 없으면(동선 · 경로를 모름) «콜 없음» 모양으로 본다 — 라인을 지어내지 않는다', () => {
        expect(dropoffPartsOf('driving', false)).toEqual({ me: true, line: false, quadFrom: 'me' });
        expect(dropoffPartsOf('routed', false)).toEqual({ me: true, line: false, quadFrom: 'me' });
    });
});

describe('목적지마다 경로의 종착지 — 경로 순서에서 그 목적지 콜의 마지막 하차지', () => {
    const calls = [
        { id: 'a', goalCity: '이천시', dropoffX: 127.43, dropoffY: 37.28 },
        { id: 'b', goalCity: '광주시', dropoffX: 127.30, dropoffY: 37.37 },
        { id: 'c', goalCity: '이천시', dropoffX: 127.41, dropoffY: 37.29 },
    ];
    const stops = [
        { orderId: 'a', stopType: 'pickup' as const }, { orderId: 'b', stopType: 'pickup' as const },
        { orderId: 'c', stopType: 'dropoff' as const }, { orderId: 'a', stopType: 'dropoff' as const },
        { orderId: 'b', stopType: 'dropoff' as const },
    ];
    const home = { homeOn: true, homeCity: '광주시' };
    it('목적지 쪽은 목적지 콜 중 가장 뒤에 내리는 곳 (a) · 집 쪽은 집 콜 (b)', () => {
        expect(lastDropOf({ isHome: false, ...home, stops, calls })).toEqual({ x: 127.43, y: 37.28 });
        expect(lastDropOf({ isHome: true, ...home, stops, calls })).toEqual({ x: 127.30, y: 37.37 });
    });
    it('복귀 끔이면 모든 콜이 목적지 콜 — 마지막 하차지는 b', () => {
        expect(lastDropOf({ isHome: false, homeOn: false, homeCity: '광주시', stops, calls })).toEqual({ x: 127.30, y: 37.37 });
    });
    it('그 목적지 하차 정거장이 없거나 좌표를 모르면 null — 지어내지 않는다', () => {
        expect(lastDropOf({ isHome: true, ...home, stops: stops.slice(0, 4), calls })).toBeNull();
        expect(lastDropOf({ isHome: true, ...home, stops, calls: calls.map(c => ({ ...c, dropoffX: undefined })) })).toBeNull();
    });
});

describe('라인을 종착지까지 자른다', () => {
    const line = [{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.02, y: 0 }, { x: 0.03, y: 0 }];
    it('종착지에서 가장 가까운 점까지', () => {
        expect(lineUntil(line, { x: 0.019, y: 0.001 })).toEqual(line.slice(0, 3));
    });
    it('끝점이 종착지면 통째로 · 점이 둘보다 적으면 빈 라인', () => {
        expect(lineUntil(line, { x: 0.03, y: 0 })).toEqual(line);
        expect(lineUntil([{ x: 0, y: 0 }], { x: 0, y: 0 })).toEqual([]);
    });
});
