import { describe, it, expect } from 'vitest';
import { pickupAreaPlan, pickupAreaTest, pickupAreaPoints, isPickupListName, pickupListNeedsRebuild, PICKUP_LIST_MOVE_KM, PICKUP_GRID_KM } from './pickupList';
import { haversineKm } from './callNet';

/**
 * 🧮 **격자 점 — 서버 목록과 관제웹 지도가 같은 점을 쓴다** (기사님 2026-09-15 «현위치 영역에 교집합 영역이 보이지 않는다»).
 * 지도가 칠하는 것이 곧 목록을 만든 점이어야 한다 — 여기서 «교집합이 원보다 좁다»를 문다.
 */
describe('상차 영역 격자 점 — pickupAreaPoints', () => {
    const MODA = { x: 127.312587, y: 37.363298 };       // 모다아울렛 (초월읍)
    const TERMINAL = { x: 127.446936, y: 37.277421 };   // 이천터미널 (중리동)
    const base = {
        me: MODA,
        radii: { pickupRadiusKm: 4.55, destinationRadiusKm: 4.55, quadRadiusKm: 15.9, detourRadiusKm: 1 },
        shape: { srcAngleDeg: 120, dstAngleDeg: 120 },
        destinationCity: '이천시', homeCity: '광주시', homeOn: false, homeCaught: false,
    };
    const inCircle = (pts: { lng: number; lat: number }[]) =>
        pts.filter(p => haversineKm({ lng: MODA.x, lat: MODA.y }, p) <= base.radii.pickupRadiusKm).length;

    it('🔴 원 ∩ 라인은 원 안 점만 · 원 전체보다 적다 — 교집합이 합집합으로 칠해지면 여기서 걸린다', () => {
        const whole = pickupAreaPoints({ ...base, line: null });   // 콜 전 = 원 전체
        const cut = pickupAreaPoints({ ...base, line: [MODA, TERMINAL] });
        expect(cut.plan).toEqual([['me', 'line']]);
        expect(cut.points.length).toBeGreaterThan(0);
        expect(inCircle(cut.points)).toBe(cut.points.length);           // 원 밖 점이 없다
        expect(cut.points.length).toBeLessThan(inCircle(whole.points));  // 원 전체보다 좁다
    });

    it('점마다 칸 크기를 싣는다 — 원 항은 격자 한 칸', () => {
        const cut = pickupAreaPoints({ ...base, line: [MODA, TERMINAL] });
        expect(cut.points.every(p => p.stepKm === PICKUP_GRID_KM)).toBe(true);
    });
});

/**
 * 📋 **상차 영역 — 기사님 확정 표** (2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 *
 * | 콜 전 | 현위치 반경 원 전체 — 마름모 안 더함 (2026-09-15 개정 «마름모 영역까지 상차를 20분 안에 할 수 없잖아») |
 * | 경로가 섰다 (노선) | 현위치 반경 ∩ 라인 띠 — 마름모 안 더함 |
 * | 복귀 켬 · 집 방향 콜 없음 | (현위치 ∩ 집 마름모) ∪ (현위치 ∩ 목적지 원) ∪ 라인 있으면 (현위치 ∩ 라인) |
 * | 복귀 켬 · 집 방향 콜 잡음 | 현위치 반경 ∩ 라인 띠 — 관내 부분은 빠진다 |
 * 도형끼리 교집합·합집합이다 — 동 목록끼리가 아니다.
 */
describe('상차 영역 계획 — 항들의 합집합 · 항은 도형들의 교집합', () => {
    it('🔴 콜 전: 내 위치 반경뿐 — 마름모를 더하지 않는다', () => {
        /* 🔴 기사님 2026-09-15 개정: «아무리 빨리 가도 마름모 영역까지 상차를 20분 안에 할 수 없잖아» — 출발 전 상차지는 내 위치 반경뿐 */
        expect(pickupAreaPlan({ hasLine: false, homeOn: false, homeCaught: false })).toEqual([['me']]);
    });
    it('🔴 노선 · 경로 섰다: 원 ∩ 라인만 — 마름모를 안 더한다', () => {
        expect(pickupAreaPlan({ hasLine: true, homeOn: false, homeCaught: false })).toEqual([['me', 'line']]);
    });
    it('🔴 복귀 켬 · 집 방향 콜 없음: 집 마름모 ∪ 가까운 관내(목적지 원) — 관내콜을 쥐었으면 라인도', () => {
        expect(pickupAreaPlan({ hasLine: false, homeOn: true, homeCaught: false })).toEqual([['me', 'quadHome'], ['me', 'destRing']]);
        expect(pickupAreaPlan({ hasLine: true, homeOn: true, homeCaught: false })).toEqual([['me', 'quadHome'], ['me', 'destRing'], ['me', 'line']]);
    });
    it('복귀 켬 · 집 방향 콜 잡음: 원 ∩ 라인 — 관내 부분은 빠진다', () => {
        expect(pickupAreaPlan({ hasLine: true, homeOn: true, homeCaught: true })).toEqual([['me', 'line']]);
    });
});

describe('영역 판정 — 계획대로 점을 가른다', () => {
    const tests = {
        me: (p: { lng: number; lat: number }) => p.lng <= 5,
        line: (p: { lng: number; lat: number }) => p.lat === 0,
        quadDest: (p: { lng: number; lat: number }) => p.lng >= 3,
    };
    it('항 안은 모두 맞아야(교집합) · 항끼리는 하나만 맞아도(합집합)', () => {
        const inLine = pickupAreaTest([['me', 'line']], tests);
        expect(inLine({ lng: 1, lat: 0 })).toBe(true);
        expect(inLine({ lng: 9, lat: 0 })).toBe(false);   // 라인 위지만 원 밖
        const before = pickupAreaTest([['me'], ['quadDest']], tests);
        expect(before({ lng: 9, lat: 7 })).toBe(true);    // 원 밖이지만 마름모 안
        expect(before({ lng: 1, lat: 7 })).toBe(true);    // 마름모 밖이지만 원 안 (뒤쪽)
    });
    it('🔴 도형을 모르면(목적지·집 없음) 그 항은 거짓 — 지어내지 않는다', () => {
        expect(pickupAreaTest([['me', 'quadHome']], tests)({ lng: 1, lat: 0 })).toBe(false);
    });
});

describe('이름 · 다시 만드는 때', () => {
    it('🔴 읍·면·동 이름만 — 시·구·군이 섞이면 구 단위 상차지가 새어 나간다', () => {
        for (const n of ['서현1동', '신둔면', '곤지암읍', '종로1가']) expect(isPickupListName(n)).toBe(true);
        for (const n of ['분당구', '이천시', '양평군']) expect(isPickupListName(n)).toBe(false);
    });
    it('0.5km 움직일 때마다 — 처음이면 만든다 · 위치를 모르면 안 만든다', () => {
        const LAT_PER_KM = 1 / 110.574, here = { x: 127.3, y: 37.3 };
        expect(PICKUP_LIST_MOVE_KM).toBe(0.5);
        expect(pickupListNeedsRebuild(null, here)).toBe(true);
        expect(pickupListNeedsRebuild(here, null)).toBe(false);
        expect(pickupListNeedsRebuild(here, { x: 127.3, y: 37.3 + 0.4 * LAT_PER_KM })).toBe(false);
        expect(pickupListNeedsRebuild(here, { x: 127.3, y: 37.3 + 0.6 * LAT_PER_KM })).toBe(true);
    });
});
