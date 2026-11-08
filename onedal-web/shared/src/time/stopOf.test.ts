import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { firstPickupStop, lastDropoffStop, isReservedCall, firstStopKm, deliveryKmOf } from './timing';
import type { CallStop } from '../index';

/**
 * 🚏 **첫 상차 · 마지막 하차 정거장** — 정거장만 있는 콜에서 상차 목록의 처음 · 하차 목록의 끝을 낸다.
 *    **예약 콜** — 첫 상차 정거장의 «예약» 글자 · 날로 가른다(원달앱 `CallStopsTest` 가 같은 문제지로 같은 답을 문다).
 *    **상차 거리 · 배송 거리** — 정거장 거리에서 꺼내고, 배송 거리는 한 곳이라도 모르면 null(원달앱 `CallStopsTest` 가 같은 문제지 `stopKmCases` 로 같은 답을 문다).
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

describe('📅 isReservedCall — «예약» 글자가 보이거나 첫 상차 날 ≥ 1 (공통 문제지 reservedCallCases)', () => {
    const sheet = JSON.parse(readFileSync(join(__dirname, '../network/pageReadCases.json'), 'utf8')) as
        { reservedCallCases: Array<{ pickup: CallStop | null; dropoff: CallStop | null; reserved: boolean; why: string }> };
    it('문제지가 비지 않았다', () => expect(sheet.reservedCallCases.length).toBeGreaterThan(5));
    it.each(sheet.reservedCallCases.map(c => [c.why, c] as const))('%s', (_, c) => {
        expect(isReservedCall({ pickupDetails: c.pickup ? [c.pickup] : [], dropoffDetails: c.dropoff ? [c.dropoff] : [] })).toBe(c.reserved);
    });
});

describe('📏 firstStopKm · deliveryKmOf — 정거장 거리에서 꺼낸다 (공통 문제지 stopKmCases)', () => {
    const sheet = JSON.parse(readFileSync(join(__dirname, '../network/pageReadCases.json'), 'utf8')) as
        { stopKmCases: Array<{ pickups: CallStop[]; dropoffs: CallStop[]; firstKm: number | null; deliveryKm: number | null; why: string }> };
    it('문제지가 비지 않았다', () => expect(sheet.stopKmCases.length).toBeGreaterThan(5));
    it.each(sheet.stopKmCases.map(c => [c.why, c] as const))('%s', (_, c) => {
        const o = { pickupDetails: c.pickups, dropoffDetails: c.dropoffs };
        expect(firstStopKm(o)).toBe(c.firstKm);
        expect(deliveryKmOf(o)).toBe(c.deliveryKm);
    });
    it('정거장 목록 칸이 없어도 빈 값', () => expect(deliveryKmOf({})).toBeNull());
});
