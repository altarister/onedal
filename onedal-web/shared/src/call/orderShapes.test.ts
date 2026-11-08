import { describe, it, expect } from 'vitest';
import { withStopLists } from './orderShapes';
import { STOP_CONTACT_KEYS } from '../network/pageRead';
import type { AppCallReport, CallStop } from './orderShapes';

/**
 * 🚏 **정거장 위에 다른 정거장의 칸을 얹는다** — 원달앱 보고는 콜 모양 그대로라 서버 입구가 옮겨 담지 않는다.
 *    /detail 은 두 번 얹는다 — ① 보고 정거장 위에 앞 기억의 서버 칸(좌표 · 찍은 글) ② 그 위에 상세 원문 연락처 칸.
 * 못 잡는 것: 원달앱이 실제로 어느 칸을 싣나(`appOrderShape` · 원달앱 JVM 검사 · 폰) · 판정 값(서버 jest · `pnpm scenario`).
 */
const report: AppCallReport = {
    id: 'c1', type: 'NEW_ORDER', fare: 45000, timestamp: '',
    pickupDetails: [{ listText: '경기 광주시 초월읍', distanceKm: 2.6, promiseText: '@낼8:30', requestedDay: 1, requestedTime: '08:30' }],
    dropoffDetails: [{ listText: '신둔면', distanceKm: 20.4 }],
    load: { vehicleText: '다', sizeText: null, itemText: null, lines: [] },
};
const before = {
    pickupDetails: [{ listText: '초월읍', geo: { x: 127.31, y: 37.36 }, geoText: '초월읍', distanceKm: 9.9, promiseText: '옛 약속' }],
    dropoffDetails: [{ listText: '옛 하차', geo: { x: 127.40, y: 37.30 } }],
};

describe('📱🚏 원달앱 보고 = 콜 — ① 앞 기억의 서버 칸만 잇는다', () => {
    it('보고 정거장 그대로 · 좌표 · 찍은 글만 앞 기억 값', () => {
        const out = withStopLists(report, before, ['geo', 'geoText']);
        expect(out.pickupDetails).toEqual([{ ...report.pickupDetails![0], geo: { x: 127.31, y: 37.36 }, geoText: '초월읍' }]);
        expect(out.dropoffDetails).toEqual([{ listText: '신둔면', distanceKm: 20.4, geo: { x: 127.40, y: 37.30 } }]);
    });
    it('앞 기억에 그 칸이 없으면 보고 값이 남는다', () => {
        const out = withStopLists(report, { pickupDetails: [], dropoffDetails: [] }, ['geo', 'geoText']);
        expect(out.pickupDetails).toEqual(report.pickupDetails);
        expect(out.dropoffDetails).toEqual(report.dropoffDetails);
    });
    it('보고의 정거장 객체를 고치지 않는다', () => {
        withStopLists(report, before, ['geo', 'geoText']);
        expect(report.pickupDetails![0]).not.toHaveProperty('geo');
    });
});

describe('🚏 ② 상세 연락처 칸만 얹는다', () => {
    const call = { ...report, ...withStopLists(report, before, ['geo', 'geoText']) };
    it('연락처 · 상세 주소는 상세 값 · 글자 · 좌표 · 약속 · 거리 · 찍은 글은 콜의 값', () => {
        const out = withStopLists(call, {
            pickupDetails: [{ customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907' }],
            dropoffDetails: [{ customerName: '하나로마트', phone1: '010-0000-0000' }],
        }, STOP_CONTACT_KEYS);
        expect(out.pickupDetails).toEqual([{
            listText: '경기 광주시 초월읍', distanceKm: 2.6, promiseText: '@낼8:30', requestedDay: 1, requestedTime: '08:30',
            geo: { x: 127.31, y: 37.36 }, geoText: '초월읍', customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907',
        }]);
        expect(out.dropoffDetails).toEqual([{ listText: '신둔면', distanceKm: 20.4, geo: { x: 127.40, y: 37.30 }, customerName: '하나로마트', phone1: '010-0000-0000' }]);
    });
    it('상세 목록이 비어도(상세 머리표 없음) 콜 정거장이 그대로 남는다', () => {
        const out = withStopLists(call, { pickupDetails: [], dropoffDetails: [] }, STOP_CONTACT_KEYS);
        expect(out).toEqual({ pickupDetails: call.pickupDetails, dropoffDetails: call.dropoffDetails });
    });
    it('🔴 마지막 하차 약속도 남는다 — 하차 덩어리가 와도 · 빈 목록이어도', () => {
        const promise = { promiseText: '14시전', requestedDay: 0, requestedTime: '14:00' };
        const withDrop = { ...call, dropoffDetails: [{ ...call.dropoffDetails[0], ...promise }] };
        const out = withStopLists(withDrop, { pickupDetails: [], dropoffDetails: [{ customerName: '하나로마트' }] }, STOP_CONTACT_KEYS);
        expect(out.dropoffDetails[0]).toMatchObject({ customerName: '하나로마트', ...promise });
        expect(withStopLists(withDrop, { pickupDetails: [], dropoffDetails: [] }, STOP_CONTACT_KEYS).dropoffDetails[0]).toMatchObject(promise);
    });
    it('정거장 목록이 비어 있으면 한 곳을 만든다', () => {
        const out = withStopLists({}, { pickupDetails: [{ customerName: '모다아울렛' }] }, STOP_CONTACT_KEYS);
        expect(out).toEqual({ pickupDetails: [{ customerName: '모다아울렛' }], dropoffDetails: [{} as CallStop] });
    });
});
