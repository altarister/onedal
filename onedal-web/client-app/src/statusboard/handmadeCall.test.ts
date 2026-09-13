import { describe, expect, it } from 'vitest';
import { LAB_EVENING, LAB_MORNING } from '../pages/labProblems';
import {
    HANDMADE_MARK, callStepsOf, handmadeOrderFrom, isHandmade, parseCallWhere,
} from './handmadeCall';

/**
 * 🖐️ **손으로 만든 콜이 문제지와 어긋나지 않게 잠근다** (2026-09-13).
 *
 * 값을 베끼지 않고 `labProblems.ts` 를 그대로 읽는 것이 이 부품의 요점이다.
 * 그러니 **문제지의 꼴이 바뀌면 여기가 먼저 빨간불**이어야 한다 — 조용히 null 을
 * 내면 버튼이 «아무 일도 안 하는 버튼»이 되고, 그건 화면이 거짓말하는 것이다.
 */
describe('손으로 만든 콜', () => {
    it('문제지 한 줄에서 상차지·하차지·요금을 읽는다', () => {
        expect(parseCallWhere('양촌읍 → 가산동 (34,650)')).toEqual({
            pickup: '양촌읍', dropoff: '가산동', fare: 34650,
        });
    });

    it('지명에 띄어쓰기가 있어도 읽는다 — 문제지에 실제로 있다', () => {
        expect(parseCallWhere('대전 문지로 188 → 오산 황새로 211 (38,500)')).toEqual({
            pickup: '대전 문지로 188', dropoff: '오산 황새로 211', fare: 38500,
        });
    });

    it('꼴이 어긋나면 null — 반쪽을 올리지 않는다', () => {
        expect(parseCallWhere('검단양촌 나들목까지 달린다 (18:10)')).toBeNull();
        expect(parseCallWhere('양촌읍 → 가산동')).toBeNull();
        expect(parseCallWhere('')).toBeNull();
    });

    it('🔴 문제지의 콜 걸음이 하나도 빠짐없이 읽힌다 — 꼴이 바뀌면 여기가 잡는다', () => {
        for (const steps of [LAB_EVENING, LAB_MORNING]) {
            const calls = callStepsOf(steps);
            expect(calls.length).toBeGreaterThan(0);
            for (const c of calls) {
                expect(parseCallWhere(c.where), `못 읽은 줄: ${c.where}`).not.toBeNull();
            }
        }
    });

    it('달리는 걸음은 콜이 아니다', () => {
        const calls = callStepsOf(LAB_EVENING);
        expect(calls.length).toBe(LAB_EVENING.filter(s => s.kind === 'call').length);
        expect(calls.every(c => c.kind === 'call')).toBe(true);
    });

    it('콜 하나를 서버가 기다리는 모양으로 만든다 — 좌표는 문제지 값 그대로', () => {
        const step = callStepsOf(LAB_EVENING)[0];
        const at = new Date('2026-09-13T08:22:15.056Z');
        const o = handmadeOrderFrom(step, at, 0)!;

        expect(o.pickup).toBe('양촌읍');
        expect(o.dropoff).toBe('가산동');
        expect(o.fare).toBe(34650);
        expect(o.pickupX).toBe(step.from.lng);
        expect(o.pickupY).toBe(step.from.lat);
        expect(o.dropoffX).toBe(step.to.lng);
        expect(o.dropoffY).toBe(step.to.lat);
        expect(o.timestamp).toBe('2026-09-13T08:22:15.056Z');
        expect(o.id).toBe(`HAND-${at.getTime()}-0`);
    });

    it('🔴 판정을 지어내지 않는다 — verdict 는 null 이다 (규칙 ④)', () => {
        const o = handmadeOrderFrom(callStepsOf(LAB_EVENING)[0], new Date(), 0)!;
        expect(o.verdict).toBeNull();
    });

    it('🔴 손으로 만든 것임을 콜 자신이 말한다 — 표식 없이 올리면 원장이 거짓말한다', () => {
        const o = handmadeOrderFrom(callStepsOf(LAB_EVENING)[0], new Date(), 0)!;
        expect(o.rawText.startsWith(HANDMADE_MARK)).toBe(true);
        expect(isHandmade(o.rawText)).toBe(true);
    });

    it('앱이 올린 콜은 손으로 만든 것이 아니다', () => {
        expect(isHandmade('퀵 승 중형 광주 쌍령 15,785')).toBe(false);
        expect(isHandmade(null)).toBe(false);
        expect(isHandmade(undefined)).toBe(false);
    });
});
