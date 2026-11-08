import { describe, it, expect } from 'vitest';
import { firstPickupStop, lastDropoffStop, isReservedCall, firstStopKm, deliveryKmOf } from './timing';

/**
 * 🚏 **첫 상차 · 마지막 하차 정거장** — 정거장만 있는 콜에서 상차 목록의 처음 · 하차 목록의 끝을 낸다.
 *    **예약 콜** — 첫 상차 정거장의 «예약» 글자 · 날로 가른다.
 *    **상차 거리 · 배송 거리** — 정거장 거리에서 꺼내고, 배송 거리는 한 곳이라도 모르면 null.
 * 못 잡는 것: 관제웹 화면 글자(관제웹 `stopScreenText.test.ts`) · 서버 판정 값(서버 jest).
 */
describe('🚏 firstPickupStop · lastDropoffStop', () => {
    it('정거장만 있는 콜 — 상차는 첫 정거장 · 하차는 마지막 정거장', () => {
        const o = {
            pickupDetails: [{ listText: '초월읍', geo: { x: 127.31, y: 37.36 }, customerName: '모다아울렛' }, { customerName: '둘째' }],
            dropoffDetails: [{ customerName: '첫 하차' }, { listText: '신둔면', customerName: '하나로마트', phone1: '010-0000-0000' }],
        };
        expect(firstPickupStop(o)).toEqual({ listText: '초월읍', geo: { x: 127.31, y: 37.36 }, customerName: '모다아울렛' });
        expect(lastDropoffStop(o)).toEqual({ listText: '신둔면', customerName: '하나로마트', phone1: '010-0000-0000' });
    });
    it('정거장이 없으면 null', () => {
        expect(firstPickupStop({})).toBeNull();
        expect(lastDropoffStop({ dropoffDetails: [] })).toBeNull();
    });
    it('사본이 아니다 — 돌려준 정거장이 콜의 정거장이다(쓰는 곳은 이 정거장에 쓴다)', () => {
        const o = { pickupDetails: [{ customerName: '모다아울렛' }] };
        expect(firstPickupStop(o)).toBe(o.pickupDetails[0]);
    });
});

describe('📅 isReservedCall — «예약» 글자가 보이거나 첫 상차 날 ≥ 1', () => {
    it('«당상» · «17:04까지 픽업» 은 날 0 오늘 콜 → 예약 아님', () => {
        expect(isReservedCall({ pickupDetails: [{ promiseText: '당상', requestedDay: 0, requestedTime: null }] })).toBe(false);
        expect(isReservedCall({ pickupDetails: [{ promiseText: '17:04까지 픽업', requestedDay: 0, requestedTime: '17:04' }] })).toBe(false);
    });
    it('«예약» 글자 · «낼8:30»(날 1) → 예약', () => {
        expect(isReservedCall({ pickupDetails: [{ promiseText: '예약', requestedDay: 0, requestedTime: null }] })).toBe(true);
        expect(isReservedCall({ pickupDetails: [{ promiseText: '@낼8:30', requestedDay: 1, requestedTime: '08:30' }] })).toBe(true);
    });
    it('약속이 없는 콜 · 하차 날만 1 인 콜은 예약 아님', () => {
        expect(isReservedCall({})).toBe(false);
        expect(isReservedCall({ dropoffDetails: [{ promiseText: '내착', requestedDay: 1 }] })).toBe(false);
    });
});

describe('📏 firstStopKm · deliveryKmOf — 정거장 거리에서 꺼낸다', () => {
    const km = (pickups: Array<number | null>, drops: Array<number | null>) => ({
        pickupDetails: pickups.map(distanceKm => ({ distanceKm })),
        dropoffDetails: drops.map(distanceKm => ({ distanceKm })),
    });
    it('한 곳 — 상차 거리는 첫 상차 · 배송 거리는 마지막 하차 정거장 거리', () => {
        const o = km([2.6], [20.4]);
        expect(firstStopKm(o)).toBe(2.6);
        expect(deliveryKmOf(o)).toBe(20.4);
    });
    it('0 은 그대로 0 — 거르는 일은 부르는 쪽 몫', () => {
        expect(deliveryKmOf(km([20.4], [0]))).toBe(0);
    });
    it('두 곳 — 첫 상차 뒤 정거장 거리를 다 더한다', () => {
        const o = km([5], [12, 30]);
        expect(firstStopKm(o)).toBe(5);
        expect(deliveryKmOf(o)).toBe(42);
        expect(deliveryKmOf(km([5, 3], [30]))).toBe(33);
    });
    it('한 곳이라도 모르면 null — 아는 것만 더하지 않는다', () => {
        expect(firstStopKm(km([null], [20.4]))).toBeNull();
        expect(deliveryKmOf(km([6.8], [null]))).toBeNull();
        expect(deliveryKmOf(km([5], [null, 30]))).toBeNull();
        expect(deliveryKmOf({})).toBeNull();
    });
});
