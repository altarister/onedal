import { describe, expect, it } from 'vitest';
import { findMockEntry, generateBaseCall } from '@altari/core-simulator';
import { seededRandom } from './seededRandom';

/**
 * 🔒 **콜의 공통 칸 — 주소·좌표·거리** 를 씨앗마다 잠근다 (카카오픽커_시뮬레이터.md 0단계 0-2 ④)
 *
 * 0-2 ④ 에서 생성기를 «공통 칸»과 «배차망별 칸(요금·차종·결제…)»으로 가른다. 가르면 난수를 뽑는 **순서**가
 * 바뀌어 배차망별 칸의 값은 달라질 수 있지만(계획서가 미리 밝혔다), 상차지·하차지는 가장 먼저 뽑으므로
 * **씨앗 하나에 콜 하나**면 가른 뒤에도 똑같아야 한다. 가르기 **전에** 옛 `generateSimCall` 로 이 스냅숏을 떴고,
 * 가른 뒤 `generateBaseCall` 로 바꿔 부르며 스냅숏은 한 글자도 안 고쳤다.
 *
 * ⚠️ 시각(상차·하차 시각)은 넣지 않았다 — 요금 난수 뒤에 뽑던 값이라 가르면 달라진다.
 */
const config = { driverLon: 127.294, driverLat: 37.3772, maxPickupKm: 15, minFare: 30000 };
const SEEDS = [1, 7, 42, 914, 2026, 31337, 65535, 20260914];

type Common = { pickups: unknown; dropoffs: unknown; pickupDetails?: unknown; dropoffDetails?: unknown; pickupDistanceKm?: unknown; distanceKm: unknown };
const commonOf = (c: Common | null) => c && {
    pickups: c.pickups, dropoffs: c.dropoffs, pickupDetails: c.pickupDetails, dropoffDetails: c.dropoffDetails,
    pickupDistanceKm: c.pickupDistanceKm, distanceKm: c.distanceKm,
};

describe('콜의 공통 칸 — 씨앗 하나에 콜 하나', () => {
    it('랜덤 콜의 주소·좌표·거리', () => {
        expect(SEEDS.map(s => commonOf(generateBaseCall(config, undefined, seededRandom(s))))).toMatchSnapshot();
    });

    it('문제지 콜(정해진 상차·하차)의 주소·좌표·거리', () => {
        const forced = { pickup: findMockEntry('초월')!, dropoff: findMockEntry('분당')!, fare: 45000, vehicleType: '다마스' };
        expect(SEEDS.map(s => commonOf(generateBaseCall(config, forced, seededRandom(s))))).toMatchSnapshot();
    });
});
