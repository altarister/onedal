import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findMockEntry, generateBaseCall, fixedTimesOf, toInjectedForced } from '@altari/core-simulator';
import { insungTimeLabel } from '../packages/ui-simulators/src/insung/SimDispatchBoard';

/**
 * 🎲 **무작위 상차 시각 · 예약은 설정 하나(`randomTime`) — 시험 콜은 끈다** (기사님 «렌덤값을 붙이는 걸 설정으로 빼고 테스트할 때는 off»).
 * 밤 23:16 폰 시험 S04 의 시험 콜이 «지금 + 59분 = 0:15» 로 «@낼0시15»(내일 예약)가 되어 원달앱 필터 «예약(내일)»에서 떨어졌다 —
 * 정해진 시험이 돌리는 시각에 따라 결과가 갈렸다.
 * 못 잡는 것: 시험 도구가 실제로 randomTime: false 를 싣는지(phone-e2e-test/day.py do_call — 폰 판 · 시뮬 목록 글자로 본다).
 */
const config = { driverLon: 127.294, driverLat: 37.3772, maxPickupKm: 15, minFare: 30000 };
const at = (h: number, m: number) => new Date(2026, 9, 22, h, m, 0, 0);
const forced = (randomTime?: boolean) => ({
    pickup: findMockEntry('초월')!, dropoff: findMockEntry('분당')!, fare: 45000,
    ...(randomTime === undefined ? {} : { randomTime }),
});

describe('🎲 randomTime', () => {
    afterEach(() => { vi.useRealTimers(); });

    it('🔴 끄면 밤 23:16 에도 상차는 오늘 23:36 — «낼»이 아니다', () => {
        vi.useFakeTimers(); vi.setSystemTime(at(23, 16));
        const draft = generateBaseCall(config, forced(false), () => 0)!;   // 0 이면 무작위 길에서는 예약(15%) 쪽이다
        expect(new Date(draft.pickupAt!).getHours()).toBe(23);
        expect(draft.pickupTime).toBe('23:36');
        expect(insungTimeLabel(draft.pickupAt!, draft.pickupTime!, at(23, 16))?.isTomorrow).toBe(false);
    });
    it('끄면 자정을 넘길 자리는 오늘 23:59 로 당긴다 — 상차도 하차도', () => {
        const { pickupAt, dropoffAt } = fixedTimesOf(at(23, 50));
        expect([pickupAt.getDate(), pickupAt.getHours(), pickupAt.getMinutes()]).toEqual([22, 23, 59]);
        expect([dropoffAt.getDate(), dropoffAt.getHours(), dropoffAt.getMinutes()]).toEqual([22, 23, 59]);
        const day = fixedTimesOf(at(10, 0));
        expect([day.pickupAt.getHours(), day.pickupAt.getMinutes(), day.dropoffAt.getHours(), day.dropoffAt.getMinutes()]).toEqual([10, 20, 11, 50]);
    });
    it('켜면(없으면) 전처럼 무작위 — 난수 0 이면 예약(지금 + 2시간)', () => {
        vi.useFakeTimers(); vi.setSystemTime(at(10, 0));
        const draft = generateBaseCall(config, forced(), () => 0)!;
        expect(draft.pickupTime).toBe('12:00');
    });
    it('시험 콜(서버 개별콜)의 randomTime 이 강제 쌍으로 넘어간다', () => {
        const p = { addressDetail: '경기 광주시 초월읍', region: '초월읍', lon: 127.29, lat: 37.38 };
        expect(toInjectedForced({ seq: 1, pickup: p, dropoff: p, fare: 1, randomTime: false }).randomTime).toBe(false);
        expect(toInjectedForced({ seq: 1, pickup: p, dropoff: p, fare: 1 })).not.toHaveProperty('randomTime');
    });
});
