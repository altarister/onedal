import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findMockEntry, generateSimCall } from '@altari/core-simulator';
import { FIXED_NOW, seededRandom } from './seededRandom';

/**
 * 🔒 **콜 생성기의 지금 동작을 그대로 잠근다** (2026-09-14 · 카카오픽커_시뮬레이터.md 0단계 0-1 ④)
 *
 * 0단계에서 생성기를 «공통 칸(주소·좌표·거리·시각)»과 «배차망별 칸(요금·차종·결제…)»으로 가른다.
 * 가르기 전에 **같은 씨앗 · 같은 시각이면 무엇이 나오는지**를 스냅숏으로 적어 둔다.
 *
 * ⚠️ 가르면 난수를 뽑는 **순서**가 바뀔 수 있다. 그때 배차망별 칸의 값은 달라질 수 있어
 *    (계획서 0단계 «숨기지 않고 적는다»), 이 스냅숏은 **가르기 전 기준**이다 — 가른 뒤에는
 *    공통 칸만 같은지 보도록 검사를 나눈다. 그 전까지는 한 글자도 안 바뀌어야 한다.
 */
const config = { driverLon: 127.294, driverLat: 37.3772, maxPickupKm: 15, minFare: 30000 };

describe('콜 생성기 — 씨앗 있는 난수', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FIXED_NOW); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('같은 씨앗이면 같은 콜 다섯 개', () => {
        const run = () => { const rng = seededRandom(20260914); return Array.from({ length: 5 }, () => generateSimCall(config, undefined, rng)); };
        const a = run();
        expect(run()).toEqual(a);
        expect(a).toMatchSnapshot();
    });

    it('문제지(정해진 상차·하차·요금)도 씨앗이면 같다', () => {
        const pickup = findMockEntry('초월');
        const dropoff = findMockEntry('분당');
        expect(pickup).toBeDefined();
        expect(dropoff).toBeDefined();
        const call = generateSimCall(config, { pickup: pickup!, dropoff: dropoff!, fare: 45000, vehicleType: '다마스' }, seededRandom(7));
        expect(call).toMatchSnapshot();
    });

    it('난수를 안 넘기면 지금처럼 Math.random 을 쓴다 — 동작 불변', () => {
        const spy = vi.spyOn(Math, 'random');
        generateSimCall(config);
        expect(spy).toHaveBeenCalled();
    });
});
