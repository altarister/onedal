import { describe, it, expect } from 'vitest';
import { firstPickupStop, lastDropoffStop } from './timing';

/**
 * 🚏 **첫 상차 · 마지막 하차 정거장** — 맨 위 칸만 있는 콜과 정거장 칸도 있는 콜에서 같은 칸을 낸다.
 * 못 잡는 것: 관제웹 · 서버가 이 함수를 읽는지(읽는 걸음에서).
 */
describe('🚏 firstPickupStop · lastDropoffStop', () => {
    it('맨 위 칸만 있는 콜 — 목록 글자와 좌표를 정거장 모양으로', () => {
        const o = { pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31, pickupY: 37.36, dropoffX: 127.40, dropoffY: 37.30 };
        expect(firstPickupStop(o)).toEqual({ listText: '초월읍', geo: { x: 127.31, y: 37.36 } });
        expect(lastDropoffStop(o)).toEqual({ listText: '신둔면', geo: { x: 127.40, y: 37.30 } });
    });
    it('좌표가 하나라도 없으면 geo 는 null · 글자가 없으면 listText 는 null', () => {
        expect(firstPickupStop({ pickupX: 127.31 })).toEqual({ listText: null, geo: null });
        expect(lastDropoffStop({})).toEqual({ listText: null, geo: null });
    });
    it('정거장 칸도 있는 콜 — 상차는 첫 정거장 · 하차는 마지막 정거장 칸에 맨 위 칸을 얹는다', () => {
        const o = {
            pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31, pickupY: 37.36,
            pickupDetails: [{ customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907' }, { customerName: '둘째' }],
            dropoffDetails: [{ customerName: '첫 하차' }, { customerName: '하나로마트', phone1: '010-0000-0000' }],
        };
        expect(firstPickupStop(o)).toEqual({
            customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907', listText: '초월읍', geo: { x: 127.31, y: 37.36 },
        });
        expect(lastDropoffStop(o)).toEqual({ customerName: '하나로마트', phone1: '010-0000-0000', listText: '신둔면', geo: null });
    });
    it('사본이다 — 돌려준 객체를 고쳐도 콜의 정거장은 그대로', () => {
        const o = { pickup: '초월읍', pickupDetails: [{ customerName: '모다아울렛' }] };
        const stop = firstPickupStop(o)!;
        stop.customerName = '바뀜';
        expect(o.pickupDetails[0].customerName).toBe('모다아울렛');
    });
});
