import { describe, it, expect } from 'vitest';
import { callBandsOf } from './callBands';

/**
 * 🌈 **콜마다 «내 짐이 차에 있는 동안»을 띠로 그린다** (기사님 확정).
 *
 * 구간 i 는 «정거장 i 에 닿는 길»이다. 그러므로 한 콜의 띠는
 * **그 콜을 실으러 가는 구간부터 내리는 구간까지**다. 두 콜이 함께 가는 구간은 두 띠가 겹친다 —
 * 그래야 «이 구간은 A 만 간다»는 오해가 없다.
 *
 * 🔴 이미 다녀온 상차지는 정거장 목록에 없다 — 그때 띠는 **경로 처음부터** 시작한다 (이미 싣고 달리는 중).
 */
const stops = (...keys: string[]) => keys.map(k => {
    const [orderId, stopType] = k.split(':');
    return { orderId, stopType: stopType as 'pickup' | 'dropoff' };
});

describe('콜별 띠 — 실으러 가는 길부터 내릴 때까지', () => {
    it('🔴 두 콜이 함께 가는 구간이 겹친다', () => {
        // 현위치 → B상차 → A상차 → A하차 → B하차
        const bands = callBandsOf(stops('B:pickup', 'A:pickup', 'A:dropoff', 'B:dropoff'));
        expect(bands.get('B')).toEqual({ from: 0, to: 3 });   // 실으러 가는 길(0)부터 내릴 때(3)까지
        expect(bands.get('A')).toEqual({ from: 1, to: 2 });   // A 는 그 안에 겹쳐 있다
    });

    it('🔴 이미 상차한 콜은 경로 처음부터 — 싣고 달리는 중이다', () => {
        const bands = callBandsOf(stops('B:pickup', 'A:dropoff', 'B:dropoff'));
        expect(bands.get('A')).toEqual({ from: 0, to: 1 });
    });

    it('하차지가 없는 콜은 띠를 만들지 않는다 — 그릴 끝이 없다', () => {
        expect(callBandsOf(stops('A:pickup')).has('A')).toBe(false);
    });

    it('정거장이 없으면 빈 것을 준다', () => {
        expect(callBandsOf([]).size).toBe(0);
    });
});
