import { readFileSync } from 'fs';
import { join } from 'path';
import { computeLoadedPoints } from '../../src/core/helpers';
import { cargoMismatchRatio, unitPoints, peakLoadPoints } from '@onedal/shared';
import type { CargoReport, MyOrder } from '@onedal/shared';

/**
 * 🔴 **화면은 짐을 `unit`(파레트·라면박스…)으로만 보낸다** — 그러니 입구의 관문 두 개도
 *    필드(`sizeClass`)가 아니라 점수로 건다. `sizeClass` 로 걸면
 *
 *        computeLoadedPoints : if (chosen?.sizeClass)        → 항상 false
 *        cargoMismatchRatio  : if (!declared?.sizeClass ...) → 항상 null
 *
 *    두 관문이 늘 닫혀
 *      · 신고한 짐 양을 무시하고 늘 차종 추정 → 합짐 2건이면 [오토바이]만 남고
 *      · 불일치 경고가 **한 번도 안 뜬다** (2.5배여도 조용)
 *
 *    `sizeClass` 로만 쓴 검사는 이 구멍을 못 잡는다.
 *    그래서 **실제로 화면이 보내는 모양**(unit)으로 건다.
 */
const call = (id: string, vehicleType = '1t'): MyOrder =>
    ({ id, vehicleType, status: 'ORDER_CONFIRMED' }) as MyOrder;

const rp = (kind: 'DECLARED' | 'ACTUAL', o: Partial<CargoReport> = {}): CargoReport =>
    ({ stopType: 'pickup', kind, ...o }) as CargoReport;

describe('computeLoadedPoints — 화면이 보내는 unit 을 반영한다', () => {
    it('🔴 unit 기반 신고가 점수에 반영된다 (예전엔 통째로 무시됐다)', () => {
        const reports = new Map([['a', [rp('DECLARED', { unit: '파레트', quantity: 2 })]]]);
        const { points, confidence } = computeLoadedPoints([call('a')], '1t', reports);

        expect(points).toBe(unitPoints('파레트', 2));   // 30
        expect(confidence).toBe('DECLARED');
    });

    it('현장 실측이 있으면 그 값을 쓰고 CONFIRMED 로 올라간다', () => {
        const reports = new Map([['a', [
            rp('DECLARED', { unit: '파레트', quantity: 2 }),
            rp('ACTUAL', { unit: '파레트', quantity: 5 }),
        ]]]);
        const { points, confidence } = computeLoadedPoints([call('a')], '1t', reports);

        expect(points).toBe(unitPoints('파레트', 5));   // 실측이 진실이다
        expect(confidence).toBe('CONFIRMED');
    });

    it('짐 정보가 없으면 차종으로 추정하고 ESTIMATED — 폴백은 살아 있어야 한다', () => {
        const { points, confidence } = computeLoadedPoints([call('a', '라보')], '1t', new Map());
        expect(points).toBe(40);                       // 라보 짐 = 40박스 (라면박스 축)
        expect(confidence).toBe('ESTIMATED');
    });

    it('옛 sizeClass 데이터도 계속 읽힌다 — 기존 DB 행이 남아 있다', () => {
        const reports = new Map([['a', [rp('DECLARED', { sizeClass: '중', quantity: 2 })]]]);
        expect(computeLoadedPoints([call('a')], '1t', reports).points).toBeGreaterThan(0);
    });

    it('한 건은 신고, 한 건은 미신고면 ESTIMATED (낙관하지 않는다)', () => {
        const reports = new Map([['a', [rp('DECLARED', { unit: '마대', quantity: 3 })]]]);
        const { confidence } = computeLoadedPoints([call('a'), call('b')], '1t', reports);
        expect(confidence).toBe('ESTIMATED');
    });

    it('신고는 있으나 부피가 0점이면 차종 추정으로 떨어진다 (방법만 고른 경우)', () => {
        const reports = new Map([['a', [rp('DECLARED', { handling: '지게차' })]]]);
        const { confidence } = computeLoadedPoints([call('a', '라보')], '1t', reports);
        expect(confidence).toBe('ESTIMATED');
    });
});

describe('cargoMismatchRatio — 화면이 보내는 unit 으로 판정한다', () => {
    it('🔴 통화 파레트 2개 → 현장 5개면 2.5배 (예전엔 null 이라 경고가 안 떴다)', () => {
        const d = rp('DECLARED', { unit: '파레트', quantity: 2 });
        const a = rp('ACTUAL', { unit: '파레트', quantity: 5 });
        expect(cargoMismatchRatio(d, a)).toBeCloseTo(2.5);
    });

    it('신고대로면 1배 — 경고 임계(1.5배)에 안 걸린다', () => {
        const r = { unit: '파레트' as const, quantity: 2 };
        expect(cargoMismatchRatio(rp('DECLARED', r), rp('ACTUAL', r))).toBe(1);
    });

    it('단위가 달라도 점수로 비교한다 — 라면박스 4개 vs 파레트 1개', () => {
        const d = rp('DECLARED', { unit: '라면박스', quantity: 4 });   // 4박스
        const a = rp('ACTUAL', { unit: '파레트', quantity: 1 });        // 40박스
        expect(cargoMismatchRatio(d, a)).toBe(10);
    });

    it('⚠️ 하차지는 null 이다 — 부피를 묻지 않는 설계다. 버그가 아니다', () => {
        // StopCallSheet 는 unit/quantity 를 상차지에서만 보낸다.
        // 기사님: "하차지 통화 시 부피는 이미 파악된 상태이고 시간과 방법만 관심사."
        const d = { stopType: 'dropoff', kind: 'DECLARED', handling: '지게차' } as CargoReport;
        const a = { stopType: 'dropoff', kind: 'ACTUAL', handling: '수작업' } as CargoReport;
        expect(cargoMismatchRatio(d, a)).toBeNull();
    });

    it('한쪽만 있으면 비교하지 않는다', () => {
        const d = rp('DECLARED', { unit: '파레트', quantity: 1 });
        expect(cargoMismatchRatio(d, null)).toBeNull();
        expect(cargoMismatchRatio(null, d)).toBeNull();
    });
});

/**
 * 📦 **잡은 콜을 다 더해 세지 않는다 — «함께 실리는 최대»다** (기사님: KEEP 은 예약이다)
 *
 * `computeLoadedPoints` 가 내는 `points` 는 **합**이다. 그대로 «지금 적재»로 쓰면
 * 하루 노선 3 + 복귀 3 을 도는데 3~4콜에서 «만재»로 막힌다. 여기서 둘을 나란히 놓고 잠근다.
 */
describe('📦 합과 최대는 다르다', () => {
    const reports = (ids: string[], boxes: number) =>
        new Map(ids.map(id => [id, [rp('DECLARED', { unit: '라면박스', quantity: boxes } as any)]]));

    it('🔴 다 더한 값과 함께 실리는 최대가 다르다 — 안 겹치면 하나뿐이다', () => {
        const calls = [call('A'), call('B'), call('C')];
        const { points, pointsByOrder } = computeLoadedPoints(calls, '1t', reports(['A', 'B', 'C'], 30));
        expect(points).toBe(90);                    // 합 — 1t 정원 100 을 거의 먹는다

        // 한 건씩 싣고 내리는 경로라면 함께 실리는 것은 30 이다
        const 차례로 = [
            { orderId: 'A', stopType: 'pickup' as const }, { orderId: 'A', stopType: 'dropoff' as const },
            { orderId: 'B', stopType: 'pickup' as const }, { orderId: 'B', stopType: 'dropoff' as const },
            { orderId: 'C', stopType: 'pickup' as const }, { orderId: 'C', stopType: 'dropoff' as const },
        ];
        expect(peakLoadPoints(pointsByOrder, 차례로, [])).toBe(30);
    });

    it('🔴 셋을 다 싣고 달리는 경로면 합과 같다 — 낙관하지 않는다', () => {
        const calls = [call('A'), call('B'), call('C')];
        const { points, pointsByOrder } = computeLoadedPoints(calls, '1t', reports(['A', 'B', 'C'], 30));
        const 모아서 = [
            { orderId: 'A', stopType: 'pickup' as const }, { orderId: 'B', stopType: 'pickup' as const },
            { orderId: 'C', stopType: 'pickup' as const }, { orderId: 'A', stopType: 'dropoff' as const },
            { orderId: 'B', stopType: 'dropoff' as const }, { orderId: 'C', stopType: 'dropoff' as const },
        ];
        expect(peakLoadPoints(pointsByOrder, 모아서, [])).toBe(points);
    });

    it('🔴 콜마다의 점수를 함께 낸다 — 최대를 세는 재료다', () => {
        const { pointsByOrder } = computeLoadedPoints([call('A'), call('B')], '1t', reports(['A'], 30));
        expect(pointsByOrder.A).toBe(30);
        expect(pointsByOrder.B).toBeGreaterThan(0);   // 신고가 없으면 차종 추정
    });
});

/**
 * 🔴 **배선이 합으로 되돌아가면 아무 검사도 안 문다** — 함수는 멀쩡한데 부르는 쪽이 `points` 를
 *    넘기면 다시 3~4콜에서 막힌다. 그 되돌림을 여기서 문다.
 */
describe('📦 필터가 «최대»를 쓴다 (배선)', () => {
    const codeOnly = (x: string) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const fm = codeOnly(readFileSync(join(__dirname, '../../src/state/filterManager.ts'), 'utf8'));

    it('🔴 남은 차종을 «최대»로 구한다 — 합이 아니다', () => {
        expect(fm).toMatch(/getRemainingCapacityTypesByPoints\(myVehicle,\s*peak\)/);
        expect(fm).not.toMatch(/getRemainingCapacityTypesByPoints\(myVehicle,\s*points\)/);
    });

    it('🔴 화면에 보이는 적재도 «최대»다 — 화면과 판정이 두 말을 하면 안 된다', () => {
        expect(fm).toMatch(/slotsUsed = Math\.min\([\s\S]{0,80}Math\.round\(peak \* 10\)/);
    });

    it('🔴 순서와 «이미 실은 콜»을 함께 넘긴다 — 둘 중 하나가 빠지면 셈이 틀린다', () => {
        expect(fm).toMatch(/peakLoadPoints\(pointsByOrder,\s*orderedStops,\s*pickedUpIds\)/);
        expect(fm).toMatch(/sectionStops\?\.length/);
        expect(fm).toMatch(/status === 'ORDER_PICKED_UP'/);
    });
});
