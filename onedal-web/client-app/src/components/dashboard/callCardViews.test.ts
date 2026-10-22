import { describe, it, expect } from 'vitest';
import { hhmmText, manwonText } from '@onedal/shared';
import { stepDoneOf, stepCurIdxOf, stepViewOf, stepPaneOf, stopDetailRowsOf, rawFieldsOf, stepSummaryOf, popupCloseReasonOf } from './callCardViews';

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

describe('🪪 6단계 — 카드에 보일 글자 · 단추(카드는 보기만 · 고치기는 팝업)', () => {
    const labels = (x: any, o: any = {}) => stepSummaryOf(x, o).buttons.map(b => b.label);
    it('🔴 칸마다 카드 단추 — 통화: 스킵 · 통화 / 도착: 스킵 · 도착 · 이슈 / 상차 완료: 스킵 · 상차 완료 · 수정 / 하차 완료: 하차 완료 · 수정', () => {
        expect(labels(row('CALL_PICKUP'))).toEqual(['스킵', '통화']);
        expect(labels(row('CALL_DROPOFF'))).toEqual(['스킵', '통화']);
        expect(labels(row('ARRIVE_PICKUP'))).toEqual(['스킵', '도착', '이슈']);
        expect(labels(row('LOADED'))).toEqual(['스킵', '상차 완료', '수정']);
        expect(labels(row('DELIVERED'))).toEqual(['하차 완료', '수정']);   // 하차 완료엔 스킵 없음 — 콜을 끝내는 단계
    });
    it('🔴 «통화 · 이슈 · 수정»은 팝업을 열고, 나머지는 바로 저장', () => {
        const s = stepSummaryOf(row('ARRIVE_DROPOFF'), {});
        expect(s.buttons.map(b => [b.label, b.popup])).toEqual([['스킵', false], ['도착', false], ['이슈', true]]);
        expect(stepSummaryOf(row('CALL_PICKUP'), {}).buttons.find(b => b.label === '통화')?.popup).toBe(true);
    });
    it('🔴 착불 콜의 하차 완료 칸은 «받았음 · 못 받음»이 하차 완료 바로 위 — 받은 뒤엔 안 보인다', () => {
        expect(labels(row('DELIVERED'), { codAmount: 30000 })).toEqual(['받았음', '못 받음', '하차 완료', '수정']);
        expect(labels(row('DELIVERED', { cod_received: 1 }), { codAmount: 30000 })).toEqual(['하차 완료', '수정']);
        expect(stepSummaryOf(row('DELIVERED'), { codAmount: 30000 }).lines.join(' ')).toContain(`착불 ${manwonText(30000)}`);
    });
    it('🔴 안 생긴 칸은 단추 없음 · 끝난 칸은 «✓ 시각 (출처)» 와 «수정»만', () => {
        expect(stepSummaryOf(row('LOADED', {}, false), {}).buttons).toEqual([]);
        const done = stepSummaryOf(row('ARRIVE_PICKUP', { status: 'DONE', occurred_at: '2026-10-22T01:03:00Z', source: 'GPS' }), {});
        expect(done.doneText).toBe(`✓ ${hhmmText('2026-10-22T01:03:00Z')} (🛰️ 자동)`);
        expect(done.buttons.map(b => b.label)).toEqual(['수정']);
        expect(stepSummaryOf(row('CALL_PICKUP', { status: 'SKIPPED', occurred_at: '2026-10-22T01:00:00Z' }), {}).doneText).toContain('⏭️ 건너뜀');
    });
    it('통화 칸 글자 = 짐 · 방법 · 약속 · 메모 + 어디서 온 값 · 적다 만 것이 있으면 «통화 ✍️»', () => {
        const s = stepSummaryOf(row('CALL_PICKUP', { planned_unit: '라면박스', planned_quantity: 20, planned_handling: '수작업',
            promised_arrival_at: '2026-10-22T01:20:00Z', memo: '경비실 통과', planned_source: 'MEMO' }), { draft: true });
        expect(s.lines.join(' ')).toContain('라면박스 20 · 수작업');
        expect(s.lines.join(' ')).toContain(`약속 ${hhmmText('2026-10-22T01:20:00Z')}`);
        expect(s.lines.join(' ')).toContain('경비실 통과');
        expect(s.source).toBe('📄 적요');
        expect(s.buttons.map(b => b.label)).toEqual(['스킵', '통화 ✍️']);   // 바로 저장 단추엔 안 붙는다
        expect(stepSummaryOf(row('LOADED', { status: 'DONE', occurred_at: '2026-10-22T01:00:00Z' }), { draft: true }).buttons.map(b => b.label)).toEqual(['수정']);   // 끝난 칸엔 안 붙는다
    });
});

describe('🔔 단계 팝업 — 언제 닫나', () => {
    const at = { interrupt: 3, arrivalTick: 7, status: 'PLANNED', occurredAt: null };
    it('🔴 열린 뒤 새 콜 심사가 오면 닫힘 · 이미 심사 중에 열었으면(사건 수 그대로) 안 닫힘', () => {
        expect(popupCloseReasonOf(at, { ...at, interrupt: 4 })).toBe('새 콜 심사');
        expect(popupCloseReasonOf(at, { ...at })).toBeNull();
    });
    it('🔴 도착 감지 tick 이 바뀌면 닫힘', () => {
        expect(popupCloseReasonOf(at, { ...at, arrivalTick: 8 })).toBe('도착 감지');
        expect(popupCloseReasonOf({ ...at, arrivalTick: null }, { ...at, arrivalTick: null })).toBeNull();
    });
    it('🔴 팝업 안 저장(상태 · 일어난 시각이 바뀜)은 닫힘 · 정차 배지(recorded_at 만 바뀜)는 안 닫힘', () => {
        expect(popupCloseReasonOf(at, { ...at, status: 'DONE' })).toBe('저장됨');
        expect(popupCloseReasonOf(at, { ...at, occurredAt: '2026-10-22T01:00:00Z' })).toBe('저장됨');
        expect(popupCloseReasonOf(at, { ...at })).toBeNull();
    });
});
