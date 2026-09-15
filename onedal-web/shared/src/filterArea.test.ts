import { describe, it, expect } from 'vitest';
import { goalZonesOf, pickupShapeOf } from './filterArea';

/**
 * 🧩 **필터 영역 — 살아 있는 목적지마다 상태 셋** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «필터 영역» · «상차 영역»).
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
