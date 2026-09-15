import { describe, it, expect } from 'vitest';
import { goalZonesOf, pickupShapeOf, dropoffPartsOf, lastDropOf, lineUntil } from './filterArea';

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
