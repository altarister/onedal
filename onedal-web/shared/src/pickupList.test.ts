import { describe, it, expect } from 'vitest';
import { pickupStageOf, pickupListOf, isPickupListName, pickupListNeedsRebuild, PICKUP_LIST_MOVE_KM } from './pickupList';

/**
 * 📋 **상차 목록 — 원달앱이 상차지를 거르는 동 목록** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 *
 * 2026-09-15 이천 왕복 03:08:52 D3: 되돌아가는 경로에서 다시 지날 신둔면을 «지나왔다»며 빼고 원달앱 경로 순서 필터가 막았다.
 * 뒤쪽은 «경로 몇 km»가 아니라 **«지금 내 위치 둘레(내 영역)»** 로 뺀다 — 되돌아가는 경로를 셈할 일이 없다.
 */
describe('어느 줄로 만드나 — 위에서부터 먼저 맞는 줄', () => {
    it('경로가 섰으면 출발·복귀보다 먼저 «경로 영역 ∩ 내 영역»', () => {
        expect(pickupStageOf({ hasLine: true, homeOn: true, departed: true })).toBe('line');
    });
    it('경로 없이 복귀를 켰으면 복귀 줄 (⬜ 모양은 기사님 대기 — 그동안 내 영역)', () => {
        expect(pickupStageOf({ hasLine: false, homeOn: true, departed: true })).toBe('home');
    });
    it('경로 없이 출발했으면 출발 줄 · 아무것도 없으면 콜 전', () => {
        expect(pickupStageOf({ hasLine: false, homeOn: false, departed: true })).toBe('departed');
        expect(pickupStageOf({ hasLine: false, homeOn: false, departed: false })).toBe('before');
    });
});

describe('목록', () => {
    const me = ['신둔면', '중리동', '관고동', '사음동'];
    it('🔴 경로가 섰으면 경로 영역 ∩ 내 영역 — 경로 위라도 내 위치 둘레 밖이면 안 든다 (기사님 «가까워지면 올라온다»)', () => {
        expect(pickupListOf({ stage: 'line', meDongs: me, lineDongs: ['신둔면', '중리동', '초월읍', '곤지암읍'], dropDongs: [] }))
            .toEqual(['신둔면', '중리동']);
    });
    it('🔴 되돌아가는 경로라도 «지나왔나»를 안 묻는다 — 경로 영역에 있고 내 위치 둘레면 든다 (D3 신둔면)', () => {
        expect(pickupListOf({ stage: 'line', meDongs: ['신둔면', '중리동'], lineDongs: ['중리동', '신둔면'], dropDongs: [] }))
            .toContain('신둔면');
    });
    it('콜 전은 내 영역 · 출발(경로 없음)은 내 영역 ∩ 하차 목록 · 복귀(경로 없음)는 ⬜ 그동안 내 영역', () => {
        expect(pickupListOf({ stage: 'before', meDongs: me, lineDongs: null, dropDongs: [] })).toEqual([...me].sort());
        expect(pickupListOf({ stage: 'departed', meDongs: me, lineDongs: null, dropDongs: ['관고동', '부발읍'] })).toEqual(['관고동']);
        expect(pickupListOf({ stage: 'home', meDongs: me, lineDongs: null, dropDongs: [] })).toEqual([...me].sort());
    });
    it('🔴 읍·면·동 이름만 싣는다 — 시·구·군이 섞이면 구 단위 상차지가 새어 나간다 (기사님 ③ 가)', () => {
        expect(isPickupListName('서현1동')).toBe(true);
        expect(isPickupListName('신둔면')).toBe(true);
        expect(isPickupListName('곤지암읍')).toBe(true);
        expect(isPickupListName('종로1가')).toBe(true);
        expect(isPickupListName('분당구')).toBe(false);
        expect(isPickupListName('이천시')).toBe(false);
        expect(isPickupListName('양평군')).toBe(false);
        expect(pickupListOf({ stage: 'before', meDongs: ['분당구', '서현1동', '성남시'], lineDongs: null, dropDongs: [] })).toEqual(['서현1동']);
    });
});

describe('다시 만드는 때 — 0.5km 움직일 때마다 (기사님 확정)', () => {
    const LAT_PER_KM = 1 / 110.574;
    const here = { x: 127.3, y: 37.3 };
    it('처음이면 만든다 · 위치를 모르면 안 만든다', () => {
        expect(pickupListNeedsRebuild(null, here)).toBe(true);
        expect(pickupListNeedsRebuild(here, null)).toBe(false);
    });
    it('0.5km 안이면 그대로 · 넘으면 다시', () => {
        expect(PICKUP_LIST_MOVE_KM).toBe(0.5);
        expect(pickupListNeedsRebuild(here, { x: 127.3, y: 37.3 + 0.4 * LAT_PER_KM })).toBe(false);
        expect(pickupListNeedsRebuild(here, { x: 127.3, y: 37.3 + 0.6 * LAT_PER_KM })).toBe(true);
    });
});
