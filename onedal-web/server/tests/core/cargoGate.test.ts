import { computeLoadedPoints } from '../../src/core/helpers';
import { cargoMismatchRatio, unitPoints } from '@onedal/shared';
import type { CargoReport, MyOrder } from '@onedal/shared';

/**
 * 🔴 2026-08-11 — 단위 체계를 `sizeClass`(소·중·대) → `unit`(파레트·라면박스…) 로 옮길 때
 *    계산 함수(`cargoPoints`)는 고쳤는데 **그 입구의 관문 두 개를 안 고쳤다.**
 *
 *        computeLoadedPoints : if (chosen?.sizeClass)        → 항상 false
 *        cargoMismatchRatio  : if (!declared?.sizeClass ...) → 항상 null
 *
 *    화면은 `unit` 만 보내므로 두 관문 모두 영원히 닫혀 있었다. 결과는
 *      · 신고한 짐 양을 무시하고 늘 차종 추정 → 합짐 2건이면 [오토바이]만 남음
 *      · 불일치 경고가 **한 번도 뜬 적이 없음** (2.5배여도 조용)
 *
 *    기존 테스트가 전부 `sizeClass` 로만 쓰여 있어 이 구멍을 못 잡았다.
 *    **실제로 화면이 보내는 모양**(unit)으로 다시 건다.
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
        expect(points).toBe(15);                       // 라보 적재량
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
        const d = rp('DECLARED', { unit: '라면박스', quantity: 4 });   // 1점
        const a = rp('ACTUAL', { unit: '파레트', quantity: 1 });        // 15점
        expect(cargoMismatchRatio(d, a)).toBe(15);
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
