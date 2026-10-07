import { describe, it, expect } from 'vitest';
import { hhmmText } from '@onedal/shared';
import { stepDoneOf, stepCurIdxOf, stepViewOf, stepPaneOf, stopDetailRowsOf, rawFieldsOf } from './callCardViews';

/**
 * 🧾 **펼친 콜 카드의 셈** — 값만 넣고 값을 본다. 카드가 그 값을 글자로 그리는지는 `pinnedRouteCard.test.tsx` 가 본다.
 * 못 잡는 것: 6단계 트랙의 그림(단계 행은 소켓으로 와 노드에서 못 그린다 — 화면 사진 몫) · 시트 안의 저장(`StepSheetMock`).
 */
const row = (step: string, o: Record<string, unknown> = {}, born = true) => ({ step, label: step, born, row: { status: 'PLANNED', ...o } }) as any;
const STEPS = [row('CALL_PICKUP', { planned_unit: '박스', planned_quantity: 3, planned_dwell_min: 12 }), row('ARRIVE_PICKUP'), row('LOADED'),
    row('CALL_DROPOFF'), row('ARRIVE_DROPOFF'), row('DELIVERED')];
const ROUTE = {
    id: 'c1', pickup: '경기 광주시 초월읍', dropoff: '경기 이천시 신둔면', fare: 50000, paymentType: '착불',
    pickupDetails: [{ contactName: '모다', addressDetail: '경충대로 907', phone: '010-1111-2222' }],
    dropoffDetails: [{ customerName: '신둔농협', addressDetail: '수광리 1' }],
} as any;
/* 남의 콜(c2)이 앞에 선다 — 경로 차례가 그렇다 */
const TL = [
    { orderId: 'c2', stopType: 'pickup', departPrevMs: 888, segmentDriveMinutes: 88 },
    { orderId: 'c1', stopType: 'pickup', departPrevMs: 111, segmentDriveMinutes: 9 },
    { orderId: 'c2', stopType: 'dropoff', departPrevMs: 999, segmentDriveMinutes: 99 },
    { orderId: 'c1', stopType: 'dropoff', departPrevMs: 222, segmentDriveMinutes: 21 },
] as any[];

describe('🌱 6단계 — 단계 시트 재료', () => {
    it('🔴 시트의 주행 · 앞 정거장 출발은 경로 타임라인의 «이 콜 · 이 정거장»에서', () => {
        const p = stepPaneOf({ route: ROUTE, step: STEPS[0], seededSteps: STEPS, timeline: TL });
        expect([p.departPrevMs, p.segmentDriveMinutes]).toEqual([111, 9]);
        const d = stepPaneOf({ route: ROUTE, step: STEPS[3], seededSteps: STEPS, timeline: TL });
        expect([d.departPrevMs, d.segmentDriveMinutes]).toEqual([222, 21]);   // 남의 콜(c2) 것이 아니다
        expect(stepPaneOf({ route: ROUTE, step: STEPS[3], seededSteps: STEPS }).segmentDriveMinutes).toBeNull();
    });
    it('🔴 시트의 key 에 콜 id 와 단계가 함께 — 콜이 달라지면 시트가 새로 선다', () => {
        expect(stepPaneOf({ route: ROUTE, step: STEPS[1], seededSteps: STEPS }).key).toBe('c1:ARRIVE_PICKUP');
        expect(stepPaneOf({ route: { ...ROUTE, id: 'c9' }, step: STEPS[1], seededSteps: STEPS }).key).toBe('c9:ARRIVE_PICKUP');
    });
    it('장소 · 전화는 그 단계의 정거장 · 착불이면 받을 돈 · 선행 시간은 상차 통화 행에서', () => {
        const p = stepPaneOf({ route: ROUTE, step: STEPS[2], seededSteps: STEPS });
        expect(p.place).toMatchObject({ name: '모다', address: '경충대로 907' });
        const d = stepPaneOf({ route: ROUTE, step: STEPS[5], seededSteps: STEPS });
        expect(d.place).toMatchObject({ name: '신둔농협', address: '수광리 1' });
        expect(d.codAmount).toBe(50000);
        expect(stepPaneOf({ route: { ...ROUTE, paymentType: '신용' }, step: STEPS[5], seededSteps: STEPS }).codAmount).toBeNull();
        expect(d.leadMinutes).toBe(12);
        expect(d.prevName).toBe('모다');
    });
    it('짐 칸이 없는 하차 단계는 가장 신선한 짐을 빌려 입는다 — 실측(상차 완료)이 상차 통화를 이긴다', () => {
        expect(stepViewOf(STEPS[3], STEPS).row).toMatchObject({ planned_unit: '박스', planned_quantity: 3 });
        const loaded = STEPS.map(x => x.step === 'LOADED' ? row('LOADED', { status: 'DONE', actual_unit: '팔레트', actual_quantity: 1 }) : x);
        expect(stepViewOf(loaded[5], loaded).row).toMatchObject({ planned_unit: '팔레트', planned_quantity: 1 });
        expect(stepViewOf(STEPS[0], STEPS)).toBe(STEPS[0]);   // 상차 단계는 그대로
    });
    it('🔴 현재 단계는 «첫 미완료»가 아니라 증거 최전방의 다음 · 태어나지 않은 행은 끝난 것이 아니다', () => {
        const s = STEPS.map((x, i) => (i === 0 || i === 2) ? row(x.step, { status: i === 0 ? 'SKIPPED' : 'DONE' }) : x);
        expect(stepCurIdxOf(s)).toBe(3);                       // 1번(도착)을 건너뛰었어도 2번 뒤
        expect(stepCurIdxOf(null)).toBe(0);
        expect(stepCurIdxOf(STEPS.map(x => row(x.step, { status: 'DONE' })))).toBe(5);   // 끝이면 마지막
        expect(stepDoneOf(row('LOADED', { status: 'DONE' }, false))).toBe(false);
    });
});

describe('🧭 상 · 하차 줄의 값', () => {
    const timing = { approachKm: 2.6, approachMinutes: 7, soloKm: 14.7, soloMinutes: 22, arrivedPickup: true, arrivedDropoff: false,
        pickupPromisedArrivalAt: '2026-10-07T00:20:00Z', dropoffPromisedArrivalAt: '2026-10-07T01:00:00Z' } as any;
    it('🔴 약속은 타임라인을 먼저 · 구간 분도 타임라인을 먼저 · 지난 곳은 예정이 없다', () => {
        const tl = [{ orderId: 'c1', stopType: 'dropoff', promisedUntil: '2026-10-07T02:00:00Z', segmentDriveMinutes: 30, etaMs: Date.parse('2026-10-07T01:30:00Z'), dwellShiftMinutes: 4, lateMinutes: 0, promiseConfirmed: true }] as any;
        const [p, d] = stopDetailRowsOf({ route: ROUTE, timeline: tl, visitOrder: { pickupIdx: 1, dropoffIdx: 3 }, timing, etas: { pickupEta: '09:00' } });
        expect(p).toMatchObject({ kind: '상차', seq: 1, legKm: 2.6, legMin: 7, real: null, arrived: true, shiftMin: 0, promisedText: hhmmText('2026-10-07T00:20:00Z') });
        expect(d).toMatchObject({ kind: '하차', seq: 3, legMin: 30, shiftMin: 4, promiseConfirmed: true,
            promisedText: hhmmText('2026-10-07T02:00:00Z'), real: hhmmText(Date.parse('2026-10-07T01:30:00Z')) });
    });
    it('타임라인이 없으면 타이틀이 쓰는 예정(etaMap · 장부)을 · 약속도 없으면 --:--', () => {
        const [, d] = stopDetailRowsOf({ route: ROUTE, timing: { ...timing, dropoffPromisedArrivalAt: null }, etas: { dropoffEta: '10:10' } });
        expect(d).toMatchObject({ real: '10:10', promisedText: '--:--', legMin: 22, seq: undefined });
    });
});

describe('🗄️ 판정 근거 서랍 — 원본 칸', () => {
    it('원본 칸은 정해진 차례로 · 첫 칸은 id · 배송거리(추정의 입력)까지', () => {
        const f = rawFieldsOf({ ...ROUTE, type: 'AUTO', status: 'ORDER_CONFIRMED', deliveryDistance: 30 });
        expect(f[0]).toEqual(['id', 'c1']);
        expect(f.map(([k]) => k).slice(0, 3)).toEqual(['id', 'type', 'status']);
        expect(f.at(-1)).toEqual(['deliveryDistance', 30]);
    });
});
