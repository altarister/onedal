import { describe, it, expect } from 'vitest';
import type { SecuredOrder } from '@onedal/shared';
import { ringsNow } from './ringsNow';

/**
 * 🔔 **사실 ④ — call.mp3 반복의 지금 답** (31 P0 C1 · 29 N6 «지금» 칸).
 * 심사 중 · 카카오 결과 있음 · 서버 벨 — 셋이 다 맞을 때만. 모드는 안 본다 — P4 에서 «클릭할 곳»으로 바뀌면 이 기댓값이 바뀐다.
 * 못 잡는 것: 소리 재생 자체(`soundManager`) · 콜 목록이 바뀔 때 켜고 끄는 배선(`useOrderEngine`).
 */
const order = (o: Partial<SecuredOrder> & { bell?: boolean }): SecuredOrder => ({
    id: 'r1', status: 'ORDER_AWAITING_DECISION', kakaoTimeExt: '14.7km · 26분',
    judgment: { bell: o.bell ?? true },
    ...o,
} as unknown as SecuredOrder);

describe('🔔 call.mp3 를 반복할 콜인가', () => {
    it('심사 중 · 카카오 결과 · 벨이 다 맞으면 울린다', () => {
        expect(ringsNow(order({}))).toBe(true);
    });
    it('심사 중이 아니면(잡은 뒤) 안 울린다', () => {
        expect(ringsNow(order({ status: 'ORDER_CONFIRMED' as SecuredOrder['status'] }))).toBe(false);
    });
    it('카카오 결과가 아직 없으면 안 울린다', () => {
        expect(ringsNow(order({ kakaoTimeExt: undefined }))).toBe(false);
    });
    it('서버 벨이 아니면 안 울린다', () => {
        expect(ringsNow(order({ bell: false }))).toBe(false);
    });
});
