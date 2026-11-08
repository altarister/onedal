import { describe, it, expect } from 'vitest';
import { firstPickupStop, lastDropoffStop, callFromAppReport } from '@onedal/shared';
import { stopDetailRowsOf, stopBlocksOf, rawFieldsOf } from '../components/dashboard/callCardViews';
import { reservedBadgeOf, reservedLineOf, reservedShortOf } from './reservedLine';
import { visitedSequenceOf } from './visitedSequence';
import { getAddressLabel } from './routeUtils';

/**
 * 🚏 **관제웹이 정거장으로 읽어도 화면 글자는 그대로다** — 인성 · 픽커 · 플렉스 콜 한 건씩.
 *    짧은 이름 · 통째 주소 줄 · 🕒 약속 줄 · 예약 표시 · 하차 칸 주소 자리 · 원본 칸 · 발자취 좌표를 지금 글자로 묶는다.
 * 못 잡는 것: JSX 안에서 바로 읽는 줄(판정석 · 펼친 카드 머리 · 서랍 · 정산 줄)의 그림 — 같은 함수(`firstPickupStop` · `lastDropoffStop`)를 부르는지는 `tsc -b` 가 본다.
 */
const capturedAt = new Date(2026, 8, 30, 16, 0).toISOString();   // 2026-09-30(수) 16:00 KST

const INSUNG_REPORT = {
    id: 'i1', type: 'NEW_ORDER', status: 'ORDER_PICKED_UP', fare: 45000, timestamp: capturedAt, capturedAt,
    pickup: '서울 금천구 가산동', dropoff: '경기 이천시 관고동',
    pickupX: 126.88, pickupY: 37.48, dropoffX: 127.44, dropoffY: 37.27,
    scheduleText: '@낼8:30', reservedDay: 1, reservedAt: '08:30', deliveryDistance: 61.2,
    pickupDetails: [{ customerName: '가산물류', addressDetail: '서울 금천구 가산동 60-5(서울 금천구 가산동)' }],
    dropoffDetails: [{ contactName: '김과장', addressDetail: '경기 이천시 관고동 100' }],
    arrivedPickupAt: '2026-10-01T08:40:00+09:00',
} as any;
const PICKER_REPORT = {
    id: 'k1', type: 'NEW_ORDER', status: 'ORDER_PICKED_UP', fare: 11000, timestamp: capturedAt, capturedAt,
    pickup: '광주 송정', dropoff: '성남시 중원구 은행동',
    pickupX: 127.25, pickupY: 37.41, dropoffX: 127.16, dropoffY: 37.45,
    scheduleText: '17:04까지 픽업', reservedDay: 0, reservedAt: '17:04', deliveryDistance: 12.4,
    pickupDetails: [{ customerName: '퓨전중화요리-궁' }],
    arrivedPickupAt: '2026-09-30T16:30:00+09:00',
} as any;
const FLEX_REPORT = {
    id: 'f1', type: 'NEW_ORDER', status: 'ORDER_PICKED_UP', fare: 30000, timestamp: capturedAt, capturedAt,
    pickup: '경기 수원시 영통구 이의동', dropoff: '경기 광주시 초월읍',
    scheduleText: '@', deliveryDistance: 0,
    pickupDetails: [{ addressDetail: '@경기 수원시영통구 @낼08:20/수원이의동' }],
    dropoffDetails: [{ customerName: '모다아울렛', addressDetail: '경기 광주시 초월읍 경충대로 907' }],
} as any;
/** 서버가 관제웹에 보내는 콜 — 원달앱 보고를 서버 입구가 정거장으로 옮겨 담은 것 */
const INSUNG = callFromAppReport(INSUNG_REPORT) as any;
const PICKER = callFromAppReport(PICKER_REPORT) as any;
const FLEX = callFromAppReport(FLEX_REPORT) as any;
/** 첫 상차 정거장 칸만 바꾼 사본 */
const withFirstPickup = (o: any, patch: object) => ({ ...o, pickupDetails: [{ ...o.pickupDetails[0], ...patch }, ...o.pickupDetails.slice(1)] });

const timing = { approachKm: 2.6, approachMinutes: 7, soloKm: 14.7, soloMinutes: 22, arrivedPickup: false, arrivedDropoff: false } as any;
const names = (route: any) => stopDetailRowsOf({ route, timing, etas: {} }).map(r => r.name);
const addresses = (route: any) => stopBlocksOf({ route, timing, etas: {}, seededSteps: null }).map(b => b.address);

describe('🚏 짧은 이름 · 통째 주소 줄 — 목록 글자(listText) 그대로', () => {
    it('정거장 목록 글자 = 원달앱이 보낸 맨 위 칸 글자', () => {
        for (const [o, r] of [[INSUNG, INSUNG_REPORT], [PICKER, PICKER_REPORT], [FLEX, FLEX_REPORT]]) {
            expect(firstPickupStop(o)?.listText).toBe(r.pickup);
            expect(lastDropoffStop(o)?.listText).toBe(r.dropoff);
        }
    });
    it('펼친 카드 정거장 줄의 짧은 이름', () => {
        expect(names(INSUNG)).toEqual(['가산동', '관고동']);
        expect(names(PICKER)).toEqual([getAddressLabel('광주 송정'), '은행동']);
        expect(names(FLEX)).toEqual(['이의동', '초월읍']);
    });
    it('예약 칸 한 줄의 «상차 → 하차»', () => {
        expect(reservedLineOf({ ...INSUNG, reservedFor: '2026-10-01' }).route).toBe('가산동 → 관고동');
    });
});

describe('📍 하차 칸 주소 자리 — 상세 주소가 먼저 · 없으면 목록 글자', () => {
    it('인성 · 픽커 · 플렉스', () => {
        expect(addresses(INSUNG)).toEqual(['서울 금천구 가산동 60-5(서울 금천구 가산동)', '경기 이천시 관고동 100']);
        expect(addresses(PICKER)).toEqual(['광주 송정', '성남시 중원구 은행동']);
        expect(addresses(FLEX)).toEqual(['@경기 수원시영통구 @낼08:20/수원이의동', '경기 광주시 초월읍 경충대로 907']);
    });
});

describe('🕒 약속 줄 · 📅 예약 표시', () => {
    it('🕒 글자 = 약속 원문', () => {
        expect(firstPickupStop(INSUNG)?.promiseText).toBe('@낼8:30');
        expect(firstPickupStop(PICKER)?.promiseText).toBe('17:04까지 픽업');
        expect(firstPickupStop(FLEX)?.promiseText).toBe('@');
        expect(firstPickupStop(callFromAppReport({ pickup: '초월읍' } as any))?.promiseText).toBeUndefined();   // 약속이 없으면 줄이 없다
    });
    it('📅 판정석 알약 · 상태바 짧은 꼴 — 날 1 이면 «내일», 날 0 · 없음이면 없다', () => {
        expect(reservedBadgeOf(INSUNG)).toBe('📅 10/1(목) 08:30 예약');
        expect(reservedShortOf(INSUNG)).toBe('10/1');
        expect(reservedBadgeOf(PICKER)).toBeNull();
        expect(reservedBadgeOf(FLEX)).toBeNull();
        expect(reservedBadgeOf(withFirstPickup(INSUNG, { requestedTime: null }))).toBe('📅 10/1(목) 시각 모름 예약');
    });
    it('📅 예약 칸 한 줄의 시각', () => {
        expect(reservedLineOf({ ...INSUNG, reservedFor: '2026-10-01' }).at).toBe('08:30');
        expect(reservedLineOf({ ...FLEX, reservedFor: '2026-10-01' }).at).toBe('--:--');
    });
});

describe('🗄️ 원본 칸 · 👣 발자취', () => {
    it('원본 칸 줄 이름 그대로 · 값은 정거장에서', () => {
        const raw = Object.fromEntries(rawFieldsOf(INSUNG));
        expect([raw.pickup, raw.dropoff, raw.scheduleText, raw.deliveryDistance]).toEqual(['서울 금천구 가산동', '경기 이천시 관고동', '@낼8:30', 61.2]);
        expect(Object.fromEntries(rawFieldsOf(FLEX)).deliveryDistance).toBe(0);
    });
    it('발자취 — 다녀온 정거장의 짧은 이름 · 좌표', () => {
        const trail = visitedSequenceOf([INSUNG, PICKER], getAddressLabel);
        expect(trail.map(v => [v.name, v.x, v.y])).toEqual([
            [getAddressLabel('광주 송정'), 127.25, 37.41],
            ['가산동', 126.88, 37.48],
        ]);
    });
});
