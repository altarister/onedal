import { describe, it, expect } from 'vitest';
import { callFromAppReport, withStopLists } from './orderShapes';
import type { AppCallReport } from './orderShapes';

/**
 * 📱→🚏 **원달앱 보고를 콜로** — 원달앱 양식의 맨 위 칸(글자 · 좌표 · 약속 · 거리)을 첫 상차 · 마지막 하차 정거장으로 옮겨 담는다.
 *    /detail 은 앞 기억 위에 보고를 펼친다 — 보고에 없는 칸은 앞 기억 값이 남는다(`before`).
 *    상세 연락처를 새로 펼쳐도 옮겨 담은 칸은 남는다(`withStopLists`).
 * 못 잡는 것: 원달앱이 실제로 어느 칸을 싣나(`appOrderShape` · 폰) · 판정 값(서버 jest · `pnpm scenario`).
 */
const report = (o: Partial<AppCallReport>): AppCallReport => ({ id: 'c1', type: 'NEW_ORDER', pickup: '', dropoff: '', fare: 0, timestamp: '', ...o });

describe('📱→🚏 callFromAppReport', () => {
    it('맨 위 글자 · 좌표 · 거리를 첫 상차 · 마지막 하차 정거장으로 — 맨 위 칸은 콜에 남지 않는다', () => {
        const call = callFromAppReport(report({
            pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31, pickupY: 37.36, dropoffX: 127.40, dropoffY: 37.30,
            pickupDistance: 2.6, deliveryDistance: 20.4, fare: 45000,
        }));
        expect(call.pickupDetails).toEqual([{ listText: '초월읍', geo: { x: 127.31, y: 37.36 }, distanceKm: 2.6, promiseText: undefined, requestedDay: undefined, requestedTime: undefined }]);
        expect(call.dropoffDetails).toEqual([{ listText: '신둔면', geo: { x: 127.40, y: 37.30 }, distanceKm: 20.4 }]);
        expect(call.fare).toBe(45000);
        for (const k of ['pickup', 'dropoff', 'pickupX', 'pickupY', 'dropoffX', 'dropoffY', 'scheduleText', 'reservedDay', 'reservedAt', 'pickupDistance', 'deliveryDistance']) {
            expect(call).not.toHaveProperty(k);
        }
    });
    it('좌표가 하나라도 없으면 geo 는 null · 거리가 없으면 null', () => {
        const call = callFromAppReport(report({ pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31 }));
        expect(call.pickupDetails?.[0]).toMatchObject({ geo: null, distanceKm: null });
        expect(call.dropoffDetails?.[0]).toMatchObject({ geo: null, distanceKm: null });
    });
    it('약속 원문 · 날 · 시각은 첫 상차 약속 칸으로 · 맨 위가 비면 정거장 칸 그대로 · `reserved` 는 콜에 남는다', () => {
        const call = callFromAppReport(report({ pickup: '가산동', scheduleText: '@낼8:30', reservedDay: 1, reservedAt: '08:30', reserved: true }));
        const stop = call.pickupDetails?.[0];
        expect([stop?.promiseText, stop?.requestedDay, stop?.requestedTime]).toEqual(['@낼8:30', 1, '08:30']);
        expect(call.reserved).toBe(true);
        const own = callFromAppReport(report({ pickupDetails: [{ promiseText: '당상', requestedDay: 0, requestedTime: null }] })).pickupDetails?.[0];
        expect([own?.promiseText, own?.requestedDay, own?.requestedTime]).toEqual(['당상', 0, null]);
        expect(call.dropoffDetails?.[0]?.promiseText).toBeUndefined();
    });
    it('정거장 칸도 있는 보고 — 상차는 첫 정거장 · 하차는 마지막 정거장에 얹고 나머지 정거장은 그대로', () => {
        const call = callFromAppReport(report({
            pickup: '초월읍', dropoff: '신둔면',
            pickupDetails: [{ customerName: '모다아울렛' }, { customerName: '둘째' }],
            dropoffDetails: [{ customerName: '첫 하차' }, { customerName: '하나로마트' }],
        }));
        expect(call.pickupDetails?.map(s => [s.customerName, s.listText])).toEqual([['모다아울렛', '초월읍'], ['둘째', undefined]]);
        expect(call.dropoffDetails?.map(s => [s.customerName, s.listText])).toEqual([['첫 하차', undefined], ['하나로마트', '신둔면']]);
    });
    it('보고의 정거장 객체를 고치지 않는다', () => {
        const pickupDetails = [{ customerName: '모다아울렛' }];
        callFromAppReport(report({ pickup: '초월읍', pickupDetails }));
        expect(pickupDetails).toEqual([{ customerName: '모다아울렛' }]);
    });

    describe('앞 기억(before) — /detail 이 앞 기억 위에 보고를 펼칠 때', () => {
        const before = callFromAppReport(report({
            pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31, pickupY: 37.36, deliveryDistance: 20.4, scheduleText: '@낼8:30', reservedDay: 1, reservedAt: '08:30',
        }));
        before.pickupDetails![0].geoText = '초월읍';
        it('보고에 없는 칸(배송거리 · 약속 · 좌표)은 앞 기억 값 · 찍은 글도 남는다', () => {
            const call = callFromAppReport(report({ pickup: '경기 광주시 초월읍', dropoff: '신둔면' }), before);
            expect(call.pickupDetails?.[0]).toMatchObject({ listText: '경기 광주시 초월읍', geo: { x: 127.31, y: 37.36 }, geoText: '초월읍', promiseText: '@낼8:30', requestedDay: 1, requestedTime: '08:30' });
            expect(call.dropoffDetails?.[0]).toMatchObject({ listText: '신둔면', distanceKm: 20.4 });
        });
        it('보고에 있는 칸은 보고 값 — null 도 값이다', () => {
            const call = callFromAppReport(report({ pickup: '초월읍', dropoff: '신둔면', pickupX: 127.5, pickupY: 37.5, deliveryDistance: null as unknown as number }), before);
            expect(call.pickupDetails?.[0]?.geo).toEqual({ x: 127.5, y: 37.5 });
            expect(call.dropoffDetails?.[0]?.distanceKm).toBeNull();
        });
    });
});

describe('📱→📦 callFromAppReport — 짐은 맨 위 칸 글자 그대로 옮겨 담고 돈은 옮기지 않는다', () => {
    it('보고 차종 · 크기 · 물품 → 짐 묶음 글자 그대로 · 짐 줄 없음', () => {
        const call = callFromAppReport(report({ vehicleType: '오', itemSize: null, itemDescription: '소형 가전' }));
        expect(call.load).toEqual({ vehicleText: '오', sizeText: null, itemText: '소형 가전', lines: [] });
    });
    it('보고에 짐 묶음이 있으면 그대로 · 맨 위 칸 셋이 다 없으면 짐 칸 없음', () => {
        const load = { vehicleText: '1t', sizeText: '소형', itemText: null, lines: [{ kind: 'weight' as const, shown: '3kg' }] };
        expect(callFromAppReport(report({ vehicleType: '오', load })).load).toBe(load);
        expect(callFromAppReport(report({}))).not.toHaveProperty('load');
    });
    it('보고 요금이 있어도 돈 묶음은 만들지 않는다 — 화면에 보인 금액만(상세 원문 조각 줄)', () => {
        const call = callFromAppReport(report({ fare: 42000, paymentType: '신용' }));
        expect(call).not.toHaveProperty('money');
        expect(call.fare).toBe(42000);
    });
});

describe('🚏 withStopLists — 상세 연락처를 펼쳐도 옮겨 담은 칸은 남는다', () => {
    const call = callFromAppReport(report({ pickup: '초월읍', dropoff: '신둔면', pickupX: 127.31, pickupY: 37.36, deliveryDistance: 20.4, scheduleText: '@낼8:30', reservedDay: 1 }));
    call.pickupDetails![0].geoText = '초월읍';
    it('연락처 · 상세 주소는 새 목록 · 글자 · 좌표 · 약속 · 거리 · 찍은 글은 콜의 값', () => {
        const out = withStopLists(call, {
            pickupDetails: [{ customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907' }],
            dropoffDetails: [{ customerName: '하나로마트', phone1: '010-0000-0000' }],
        });
        expect(out.pickupDetails).toEqual([{
            customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907',
            listText: '초월읍', geo: { x: 127.31, y: 37.36 }, distanceKm: null, promiseText: '@낼8:30', requestedDay: 1, geoText: '초월읍',
        }]);
        expect(out.dropoffDetails).toEqual([{ customerName: '하나로마트', phone1: '010-0000-0000', listText: '신둔면', geo: null, distanceKm: 20.4 }]);
    });
    it('새 목록이 비어도(상세 머리표 없음) 정거장 한 곳이 남는다', () => {
        const out = withStopLists(call, { pickupDetails: [], dropoffDetails: [] });
        expect(out.pickupDetails?.[0]?.listText).toBe('초월읍');
        expect(out.dropoffDetails?.[0]).toEqual({ listText: '신둔면', geo: null, distanceKm: 20.4 });
    });
    it('🔴 마지막 하차 약속도 남는다 — 하차 덩어리가 와도 · 빈 목록이어도', () => {
        const promise = { promiseText: '14시전', requestedDay: 0, requestedTime: '14:00' };
        const withDrop = { ...call, dropoffDetails: [{ ...call.dropoffDetails![0], ...promise }] };
        const out = withStopLists(withDrop, { pickupDetails: [], dropoffDetails: [{ customerName: '하나로마트' }] });
        expect(out.dropoffDetails[0]).toMatchObject({ customerName: '하나로마트', ...promise });
        expect(withStopLists(withDrop, { pickupDetails: [], dropoffDetails: [] }).dropoffDetails[0]).toMatchObject(promise);
    });
});
