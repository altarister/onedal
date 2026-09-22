import { describe, it, expect } from 'vitest';
import { barFocusOf } from './barFocus';

/**
 * 🎬 **시트가 맨 위로 올라가면 시트 상태바가 말하는 «그 콜 · 그 단계»를 연다** (기사님).
 *
 * 상태바가 «✅ 10 초월읍 하차 도착»이면 그 콜의 하차지 도착 단계 · «2번 콜 · 상차»면 그 콜의 지금 할 단계.
 */
describe('barFocusOf — 상태바가 가리키는 콜·단계', () => {
    it('도착 곁이면 그 콜의 도착 단계다', () => {
        expect(barFocusOf({ arrivedHere: { orderId: 'a', stop: '하차' }, next: { orderId: 'b' } }))
            .toEqual({ orderId: 'a', step: 'ARRIVE_DROPOFF' });
        expect(barFocusOf({ arrivedHere: { orderId: 'a', stop: '상차' }, next: null }))
            .toEqual({ orderId: 'a', step: 'ARRIVE_PICKUP' });
    });

    it('도착이 아니면 다음 정거장 콜의 지금 할 단계다 (단계는 장부가 정한다)', () => {
        expect(barFocusOf({ arrivedHere: null, next: { orderId: 'b' } }))
            .toEqual({ orderId: 'b', step: null });
    });

    it('갈 곳도 도착도 없으면 가리키는 것이 없다', () => {
        expect(barFocusOf({ arrivedHere: null, next: null })).toBeNull();
    });
});
