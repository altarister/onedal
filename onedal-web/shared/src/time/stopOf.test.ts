import { describe, it, expect } from 'vitest';
import { firstPickupStop, lastDropoffStop, isReservedCall, firstStopKm, deliveryKmOf } from './timing';

/**
 * 🚏 **첫 상차 · 마지막 하차 정거장** — 맨 위 칸만 있는 콜과 정거장 칸도 있는 콜에서 같은 칸을 낸다.
 *    **예약 콜** — 첫 상차 정거장의 «예약» 글자 · 날로 가른다.
 *    **상차 거리 · 배송 거리** — 정거장 거리에서 꺼내고, 배송 거리는 한 곳이라도 모르면 null.
 * 못 잡는 것: 관제웹 · 서버가 이 함수를 읽는지(읽는 걸음에서).
 */
describe('🚏 firstPickupStop · lastDropoffStop', () => {
    it('맨 위 칸만 있는 콜 — 목록 글자와 좌표를 정거장 모양으로', () => {
        const o = { pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31, pickupY: 37.36, dropoffX: 127.40, dropoffY: 37.30 };
        expect(firstPickupStop(o)).toEqual({ listText: '초월읍', geo: { x: 127.31, y: 37.36 }, distanceKm: null });
        expect(lastDropoffStop(o)).toEqual({ listText: '신둔면', geo: { x: 127.40, y: 37.30 }, distanceKm: null });
    });
    it('좌표가 하나라도 없으면 geo 는 null · 글자가 없으면 listText 는 null', () => {
        expect(firstPickupStop({ pickupX: 127.31 })).toEqual({ listText: null, geo: null, distanceKm: null });
        expect(lastDropoffStop({})).toEqual({ listText: null, geo: null, distanceKm: null });
    });
    it('정거장 칸도 있는 콜 — 상차는 첫 정거장 · 하차는 마지막 정거장 칸에 맨 위 칸을 얹는다', () => {
        const o = {
            pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31, pickupY: 37.36,
            pickupDetails: [{ customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907' }, { customerName: '둘째' }],
            dropoffDetails: [{ customerName: '첫 하차' }, { customerName: '하나로마트', phone1: '010-0000-0000' }],
        };
        expect(firstPickupStop(o)).toEqual({
            customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907', listText: '초월읍', geo: { x: 127.31, y: 37.36 }, distanceKm: null,
        });
        expect(lastDropoffStop(o)).toEqual({ customerName: '하나로마트', phone1: '010-0000-0000', listText: '신둔면', geo: null, distanceKm: null });
    });
    it('사본이다 — 돌려준 객체를 고쳐도 콜의 정거장은 그대로', () => {
        const o = { pickup: '초월읍', pickupDetails: [{ customerName: '모다아울렛' }] };
        const stop = firstPickupStop(o)!;
        stop.customerName = '바뀜';
        expect(o.pickupDetails[0].customerName).toBe('모다아울렛');
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
    it('한 곳 — 맨 위 거리 칸을 첫 상차 · 마지막 하차 정거장 거리로 모은다', () => {
        const o = { pickupDistance: 2.6, deliveryDistance: 20.4 };
        expect(firstPickupStop(o)?.distanceKm).toBe(2.6);
        expect(lastDropoffStop(o)?.distanceKm).toBe(20.4);
        expect(firstStopKm(o)).toBe(2.6);
        expect(deliveryKmOf(o)).toBe(20.4);
    });
    it('0 은 그대로 0 — 거르는 일은 부르는 쪽 몫', () => {
        expect(deliveryKmOf({ pickupDistance: 20.4, deliveryDistance: 0 })).toBe(0);
    });
    it('두 곳 — 첫 상차 뒤 정거장 거리를 다 더한다', () => {
        const o = { pickupDistance: 5, deliveryDistance: 30, dropoffDetails: [{ distanceKm: 12 }, { customerName: '마지막' }] };
        expect(firstStopKm(o)).toBe(5);
        expect(deliveryKmOf(o)).toBe(42);
        expect(deliveryKmOf({ pickupDistance: 5, deliveryDistance: 30, pickupDetails: [{}, { distanceKm: 3 }] })).toBe(33);
    });
    it('한 곳이라도 모르면 null — 아는 것만 더하지 않는다', () => {
        expect(firstStopKm({ deliveryDistance: 20.4 })).toBeNull();
        expect(deliveryKmOf({ pickupDistance: 6.8 })).toBeNull();
        expect(deliveryKmOf({ pickupDistance: 5, deliveryDistance: 30, dropoffDetails: [{ customerName: '첫 하차' }, {}] })).toBeNull();
        expect(deliveryKmOf({})).toBeNull();
    });
});
