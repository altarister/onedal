import { describe, expect, it } from 'vitest';
import { CALL_SHAPE_VERSION, callFromShape, callShapeOf, ledgerCopiesOf } from './callShape';
import { OFFICE_ORDER_SAMPLE_09 } from './sample';
import type { MyOrder, OfficeOrder } from './orderShapes';

/**
 * 🧾 **콜 한 칸 — 콜 모양 ↔ 글 · 사본 칸**.
 * 견본 09(마지막 모양)를 글로 썼다 되돌리면 같은 콜인가 · 서버 칸 · 실행 중 칸 · 정거장 찍은 글은 글에 안 들어가나 ·
 * 판 번호가 다르거나 글이 깨졌거나 정거장 목록이 비면 옛 길(null)인가 · 돈 줄 · 짐 줄의 틀린 줄은 버리나 · 사본 칸이 콜에서 나온 값과 같은가를 묻는다.
 */
const sample = OFFICE_ORDER_SAMPLE_09 as unknown as OfficeOrder;
const shapeText = (o: Record<string, unknown>) => JSON.stringify({ ...sample, ...o });

describe('🧾 콜 모양 → 글 → 콜 모양', () => {
    it('견본 09 를 글로 썼다 되돌리면 같은 콜이다 — 서버 칸 · 정거장 찍은 글은 빠진다', () => {
        const call = {
            ...sample,
            pickupDetails: sample.pickupDetails!.map(s => ({ ...s, geoText: '찍은 글' })),
            dropoffDetails: sample.dropoffDetails!.map(s => ({ ...s, geoText: '찍은 글' })),
            status: 'ORDER_PICKED_UP', completedAt: '2026-11-09T10:00:00.000Z', terminatedAt: null,
            judgment: { color: '꿀', score: 80, axes: [], gates: [], tags: [] },
            reservedFor: '2026-11-10', goalCity: '이천시', isShared: true, isExpress: false,
            capturedAt: '2026-11-09T09:00:00.000Z', capturedDeviceId: '기기', routePolyline: [{ x: 1, y: 2 }],
        } as MyOrder;
        const text = callShapeOf(call);
        expect(text).not.toBeNull();
        expect(callFromShape(text, CALL_SHAPE_VERSION)).toEqual(sample);
    });

    it('서버 칸(`status` · `completedAt` 등)과 목록 밖 실행 중 칸(`phase`)은 글에 안 들어간다', () => {
        const call = { ...sample, status: 'ORDER_CONFIRMED', completedAt: null, isExpress: true, kakaoSoloDistanceKm: 12, judgeUntil: 1, phase: 'GATHERING' } as unknown as MyOrder;
        const keys = Object.keys(JSON.parse(callShapeOf(call)!));
        for (const k of ['status', 'completedAt', 'isExpress', 'kakaoSoloDistanceKm', 'judgeUntil', 'phase']) expect(keys).not.toContain(k);
        expect(keys).toContain('id');
        expect(keys).toContain('money');
    });

    it('글에 다른 칸이 있어도 되살린 콜에는 콜 모양 칸만 남는다', () => {
        const back = callFromShape(shapeText({ status: 'ORDER_CONFIRMED', completedAt: 'x', phase: 'y' }), CALL_SHAPE_VERSION) as unknown as Record<string, unknown>;
        expect(back).not.toHaveProperty('status');
        expect(back).not.toHaveProperty('completedAt');
        expect(back).not.toHaveProperty('phase');
    });

    it('글로 못 바꾸는 콜(돌고 도는 참조)이면 던지지 않고 null', () => {
        const loop: Record<string, unknown> = { vehicleText: null, sizeText: null, itemText: null, lines: [] };
        loop.self = loop;
        expect(callShapeOf({ ...sample, load: loop } as unknown as OfficeOrder)).toBeNull();
    });
});

describe('🧾 글 → 콜 모양 — 못 믿을 글이면 옛 길(null)', () => {
    it.each([
        ['판 번호 없음', shapeText({}), null],
        ['판 번호 2', shapeText({}), 2],
        ['깨진 글', '{', CALL_SHAPE_VERSION],
        ['배열', '[]', CALL_SHAPE_VERSION],
        ['빈 글', '', CALL_SHAPE_VERSION],
        ['상차 목록이 배열 아님', shapeText({ pickupDetails: '초월읍' }), CALL_SHAPE_VERSION],
        ['상차 목록이 비었음', shapeText({ pickupDetails: [] }), CALL_SHAPE_VERSION],
        ['하차 목록이 비었음', shapeText({ dropoffDetails: [] }), CALL_SHAPE_VERSION],
        ['하차 목록 없음', shapeText({ dropoffDetails: undefined }), CALL_SHAPE_VERSION],
        ['id 없음', shapeText({ id: undefined }), CALL_SHAPE_VERSION],
        ['id 가 숫자', shapeText({ id: 7 }), CALL_SHAPE_VERSION],
    ] as const)('%s', (_name, text, version) => {
        expect(callFromShape(text, version)).toBeNull();
    });

    it('글이 null 이면 null', () => {
        expect(callFromShape(null, CALL_SHAPE_VERSION)).toBeNull();
        expect(callFromShape(undefined, undefined)).toBeNull();
    });
});

describe('🧾 돈 줄 · 짐 줄 — 틀린 줄은 버리고 나머지는 남긴다', () => {
    it('모르는 갈래 · 숫자 아닌 원 · 글자 아닌 shown 은 버린다', () => {
        const text = shapeText({
            money: { ...sample.money, lines: [
                { kind: 'income', won: 5000, shown: '5,000' },
                { kind: 'bonus', won: 1, shown: 'x' },
                { kind: 'fee', won: '2', shown: '2' },
            ] },
            load: { ...sample.load, lines: [
                { kind: 'weight', shown: '3.85톤' },
                { kind: 'color', shown: '빨강' },
                { kind: 'care', shown: 3 },
            ] },
        });
        const back = callFromShape(text, CALL_SHAPE_VERSION)!;
        expect(back.money!.lines).toEqual([{ kind: 'income', won: 5000, shown: '5,000' }]);
        expect(back.load!.lines).toEqual([{ kind: 'weight', shown: '3.85톤' }]);
        expect(back.money!.paymentType).toBe('신용');
        expect(back.load!.vehicleText).toBe('다마스');
    });

    it('묶음이 없던 콜은 되살려도 칸이 없다', () => {
        const back = callFromShape(shapeText({ money: undefined, load: undefined }), CALL_SHAPE_VERSION)!;
        expect(back).not.toHaveProperty('money');
        expect(back).not.toHaveProperty('load');
    });
});

describe('🧾 사본 칸 — 콜에서 나온 값과 같다', () => {
    it('기사님 몫 = incomeOf · 상차 = 첫 상차 목록 글자 · 하차 = 마지막 하차 목록 글자', () => {
        const call = { ...sample, dropoffDetails: [{ listText: '첫 하차' }, ...sample.dropoffDetails!] };
        const c = ledgerCopiesOf(call);
        expect(c.incomeWon).toBe(50000);
        expect(c.pickup).toBe('초월읍');
        expect(c.dropoff).toBe('신둔면');
        expect(c.scheduleText).toBe('상차 약속 글자');
        expect(c.reservedDay).toBe(0);
        expect(c.reservedAt).toBe('10:01');
        expect(c.deliveryDistance).toBe(201);
        expect(c.paymentType).toBeNull();          // 견본 09 는 결제를 돈 묶음에만 둔다 — 옛 칸은 콜 칸 그대로
        expect(c.tripType).toBe('편도');
        expect(c.orderForm).toBe('보통');
    });

    it('급송 = isExpressForm(형태) · 돈 묶음이 없으면 기사님 몫 null · 정거장이 없으면 상차 · 하차는 빈 글자', () => {
        const c = ledgerCopiesOf({ ...sample, orderForm: '급송', money: undefined, pickupDetails: [], dropoffDetails: undefined });
        expect(c.isExpress).toBe(1);
        expect(c.incomeWon).toBeNull();
        expect(c.pickup).toBe('');
        expect(c.dropoff).toBe('');
        expect(ledgerCopiesOf(sample).isExpress).toBe(0);
    });
});
