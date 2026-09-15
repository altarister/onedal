import { initGeoService, regionsTouchingNetGrouped } from '../../src/services/geoService';
import { netForGoal, cityCenter, quadShapeFrom } from '@onedal/shared';

/**
 * 🔵 **먼 목적지의 하차 조각도 «걸친 동»을 넣는다 — 실제 지도로** (기사님 2026-09-15 «영역에 지역이 걸치고 있으면 들어가는거야»).
 *
 * 그물(`netForGoal`)은 동을 **중심점 하나**로 본다 — 원 · 마름모 가장자리에 걸쳤는데 중심이 밖인 넓은 읍 · 면이 빠졌다
 * (인천 조건 실측 45곳). 걸침은 상차 목록과 같은 식이다 (`geoService.regionsTouchingAreaGrouped` — 격자 점 ∪ 동 꼭짓점).
 * 좌표는 이천 왕복 시나리오 실값 · 반경은 그때 자동 반경이 준 값.
 */
const MODA = { lng: 127.312587, lat: 37.363298, name: '내 위치' };        // 모다아울렛 (초월읍)
const TERMINAL = { lng: 127.446936, lat: 37.277421, name: '종착지' };    // 이천터미널 (중리동)
const SINDUN = { lng: 127.40410, lat: 37.30574 };                         // HD현대 신둔
const shape = quadShapeFrom(null);
const params = { srcAngleDeg: shape.srcAngleDeg, dstAngleDeg: shape.dstAngleDeg, quadRadiusKm: 15.9, srcDiamKm: 4.55 * 2, dstDiamKm: 4.55 * 2 };
const ICHEON = { ...cityCenter('이천시'), name: '이천시' };

beforeAll(() => { initGeoService(); });

const namesOf = (g: Record<string, string[]>) => new Set(Object.values(g).flat());

describe('🔵 먼 목적지 조각 — 걸친 동', () => {
    it('🔴 콜 없음(현위치 원 ∪ 마름모 ∪ 목적지 원): 중심점으로 든 동은 전부 들고 · 가장자리에 걸친 동이 더 든다', () => {
        const centroid = new Set(netForGoal(ICHEON, { line: null, lineRadiusKm: 2.73, lastDrop: null, params, anchor: MODA, me: MODA }).pass.map(d => d.name));
        const touch = namesOf(regionsTouchingNetGrouped({ goal: ICHEON, anchor: MODA, me: MODA, line: null, lastDrop: null, params, lineRadiusKm: 2.73 }));
        for (const n of centroid) expect(touch.has(n)).toBe(true);
        expect(touch.size).toBeGreaterThan(centroid.size);
    });

    it('🔴 운행 뒤(라인 ∪ 종착지→목적지 마름모 ∪ 목적지 원 · 현위치 원 없음): 중심점 목록을 품고 더 넓다', () => {
        const line: Array<[number, number]> = [[MODA.lng, MODA.lat], [SINDUN.lng, SINDUN.lat], [TERMINAL.lng, TERMINAL.lat]];
        const centroid = new Set(netForGoal(ICHEON, { line, lineRadiusKm: 2.73, lastDrop: TERMINAL, params, anchor: MODA, me: null }).pass.map(d => d.name));
        const touch = namesOf(regionsTouchingNetGrouped({ goal: ICHEON, anchor: MODA, me: null, line, lastDrop: TERMINAL, params, lineRadiusKm: 2.73 }));
        for (const n of centroid) expect(touch.has(n)).toBe(true);
        expect(touch.size).toBeGreaterThanOrEqual(centroid.size);
    });

    it('시 · 군 · 구로 묶어 낸다 — 시 별칭(`cityAliases`)이 이 이름으로 만들어진다', () => {
        const g = regionsTouchingNetGrouped({ goal: ICHEON, anchor: MODA, me: MODA, line: null, lastDrop: null, params, lineRadiusKm: 2.73 });
        expect(Object.keys(g).some(k => k.includes('이천'))).toBe(true);
    });
});
