import { describe, it, expect } from 'vitest';
import { isPickupListName, pickupListNeedsRebuild, PICKUP_LIST_MOVE_KM } from './pickupList';

/**
 * 📋 **상차 목록 — 이름 규칙과 다시 만드는 때** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 * 상차 영역의 모양 검사는 `filterArea.test.ts` · 실제 지도로 동을 찾는 검사는 서버 `tests/rules/pickupListGeo.test.ts`.
 */
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
