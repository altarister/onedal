import { describe, it, expect } from 'vitest';
import { pickupAreaPlan, pickupAreaTest, isPickupListName, pickupListNeedsRebuild, PICKUP_LIST_MOVE_KM } from './pickupList';

/**
 * 📋 **상차 영역 — 기사님 확정 표** (2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 *
 * | 콜 전 | 현위치 반경 원 전체 ∪ 목적지 방향 마름모 — «아직 콜을 못 잡았어 뒤로 가서라도 잡아야 해» |
 * | 경로가 섰다 (노선) | 현위치 반경 ∩ 라인 띠 — 마름모 안 더함 |
 * | 복귀 켬 · 집 방향 콜 없음 | (현위치 ∩ 집 마름모) ∪ (현위치 ∩ 목적지 원) ∪ 라인 있으면 (현위치 ∩ 라인) |
 * | 복귀 켬 · 집 방향 콜 잡음 | 현위치 반경 ∩ 라인 띠 — 관내 부분은 빠진다 |
 * 도형끼리 교집합·합집합이다 — 동 목록끼리가 아니다.
 */
describe('상차 영역 계획 — 항들의 합집합 · 항은 도형들의 교집합', () => {
    it('콜 전: 원 전체 ∪ 목적지 방향 마름모', () => {
        expect(pickupAreaPlan({ hasLine: false, homeOn: false, homeCaught: false })).toEqual([['me'], ['quadDest']]);
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
