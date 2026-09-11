import { describe, it, expect } from 'vitest';
import { pickNextTarget } from '@onedal/shared';

/**
 * 🚗 **주행은 되돌아가지 않는다** (2026-09-09 실측으로 잡은 규칙).
 *
 * 경로 **전체**에서 가장 가까운 점을 고르면, 수도권처럼 경로가 제 몸을 스쳐 지나가는
 * 곳에서 «이미 지나온 구간»이 제일 가까울 수 있다. 그러면 목표가 뒤로 뛰고 차가
 * 되돌아간다 — 실측에서 «1→2→3 을 두 번 왕복»이 나왔고, 그동안 모의 시계만 흘러
 * 65분짜리 마지막 구간을 3시간 38분 동안 못 끝냈다.
 */
const P = (lng: number, seq: number) => ({ lng, lat: 0, seq });
//        지나온 정거장 1 쪽              아직 안 지난 정거장 2 쪽
const path = [P(0, 1), P(1, 1), P(2, 2), P(3, 2), P(4, 2)];

describe('🚗 다음 목표 정거장 고르기', () => {
    it('아직 안 지난 구간 중 가장 가까운 점의 «다음»을 고른다', () => {
        expect(pickNextTarget(path, { lng: 2.1, lat: 0 }, 1)).toBe(3);
    });

    it('🔴 지나온 구간이 더 가까워도 뒤로 안 간다', () => {
        // 지금 자리(0.1)는 지나온 점(0)이 제일 가깝지만, 정거장 1 은 이미 지났다
        expect(pickNextTarget(path, { lng: 0.1, lat: 0 }, 1)).toBe(3);
    });

    it('아무 곳도 안 지났으면 경로 전체에서 고른다', () => {
        expect(pickNextTarget(path, { lng: 0.1, lat: 0 }, 0)).toBe(1);
    });

    it('다 지났으면 마지막 점을 가리킨다', () => {
        expect(pickNextTarget(path, { lng: 0.1, lat: 0 }, 2)).toBe(4);
    });

    it('경로가 비었으면 0', () => {
        expect(pickNextTarget([], { lng: 0, lat: 0 }, 0)).toBe(0);
    });
});
