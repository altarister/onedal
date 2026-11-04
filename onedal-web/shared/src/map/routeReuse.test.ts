import { describe, it, expect } from 'vitest';
import { routeNeedsRecompute } from './routeReuse';

/**
 * 🗺️ **카카오를 다시 부르는 때는 넷뿐이다** (기사님 확정).
 *
 * 1·2·3·4 로 가는 중에 1 에 도착해도 2·3·4 로 가는 길은 그대로다 — 이미 받아 둔 구간 값을 쓴다.
 * 그래서 도착·상차 완료·하차 통화·하차 완료·되돌리기에서는 **다시 안 받는다.**
 *
 * 🔴 다시 받는 때: 정거장이 **늘 때**(새 콜) · 예정에 없이 **빠질 때**(취소) · **순서가 바뀔 때** ·
 *    기사님이 재탐색을 누르거나 경로를 크게 벗어났을 때(이 함수 밖에서 판단한다).
 */
const s = (...keys: string[]) => keys.map(k => {
    const [orderId, stopType] = k.split(':');
    return { orderId, stopType: stopType as 'pickup' | 'dropoff' };
});

describe('routeNeedsRecompute — 이미 받은 순서로 남은 길을 덮는가', () => {
    it('🔴 도착만 찍혀 앞이 하나 줄었으면 다시 안 받는다', () => {
        expect(routeNeedsRecompute(s('A:pickup', 'A:dropoff', 'B:dropoff'), s('A:dropoff', 'B:dropoff'))).toBe(false);
    });

    it('🔴 정거장이 늘면 받는다 — 새 콜이 붙었다', () => {
        expect(routeNeedsRecompute(s('A:pickup', 'A:dropoff'), s('A:pickup', 'A:dropoff', 'B:pickup', 'B:dropoff'))).toBe(true);
    });

    it('🔴 순서가 바뀌면 받는다 — 약속이 순서를 다시 정했다', () => {
        expect(routeNeedsRecompute(s('A:pickup', 'B:pickup'), s('B:pickup', 'A:pickup'))).toBe(true);
    });

    it('가운데가 빠져도 남은 것이 같은 차례면 안 받는다 — 콜 하나가 끝났다', () => {
        expect(routeNeedsRecompute(s('A:pickup', 'B:pickup', 'A:dropoff', 'B:dropoff'), s('B:pickup', 'B:dropoff'))).toBe(false);
    });

    it('받아 둔 순서가 없으면 받는다 — 견줄 것이 없다', () => {
        expect(routeNeedsRecompute(null, s('A:pickup'))).toBe(true);
    });

    it('남은 정거장이 없으면 안 받는다 — 갈 곳이 없다', () => {
        expect(routeNeedsRecompute(s('A:pickup'), [])).toBe(false);
    });
});
