import { describe, it, expect } from 'vitest';
import { isPickupListName, pickupListNeedsRebuild, PICKUP_LIST_MOVE_KM, pickupAreaKey } from './pickupList';

describe('🗺️ 지도 재료가 바뀌면 알린다 — 목록이 그대로여도', () => {
    const area = { at: { x: 127.3, y: 37.3 }, homeCity: '광주시', homeOn: true, homeCaught: false, hasLine: false };
    it('🔴 복귀를 끄면 키가 달라진다 — 목록이 같아도 관제웹에 보내야 옛 «복귀 켬»으로 안 그린다 (2026-09-15 15:47 광주 원이 남았다)', () => {
        expect(pickupAreaKey({ ...area, homeOn: false })).not.toBe(pickupAreaKey(area));
        expect(pickupAreaKey({ ...area, homeCaught: true })).not.toBe(pickupAreaKey(area));
        expect(pickupAreaKey({ ...area, hasLine: true })).not.toBe(pickupAreaKey(area));
        expect(pickupAreaKey({ ...area, homeCity: null })).not.toBe(pickupAreaKey(area));
    });
    it('목록을 만든 자리(at)만 바뀌면 같은 키 — 지도는 실시간 위치를 쓰니 0.5km 마다 보낼 까닭이 없다', () => {
        expect(pickupAreaKey({ ...area, at: { x: 127.4, y: 37.2 } })).toBe(pickupAreaKey(area));
    });
    it('아직 없으면 빈 키', () => {
        expect(pickupAreaKey(undefined)).toBe('');
    });
});

/**
 * 📋 **상차 목록 — 이름 규칙과 다시 만드는 때** (기사님 확정 · 하차 목록»).
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
