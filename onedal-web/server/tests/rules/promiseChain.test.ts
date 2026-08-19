import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveRouteTimeline } from '@onedal/shared';

const sheet = () => readFileSync(join(__dirname,
    '../../../client-app/src/components/dashboard/StopCallSheet.tsx'), 'utf8');
const code = () => sheet().split('\n')
    .filter(l => !/^\s*(\/\/|\/\*|\*)/.test(l)).join('\n');

/**
 * ⛓️ **약속은 경로를 타고 뒤로 전파된다** (2026-08-19 코드리뷰에서 발견)
 *
 * 기사님: *"이 부분 아주 중요한 부분이야. 모든 약속이 달라지거나 할 수 있어."*
 *
 * 실측 검산: 상차 약속을 11:12(까지)로 확정했는데 하차 추정이 11:51 로 떴다.
 *   상차 11:12 + 상차 8분 + 주행 97분 = **12:57** 이 물리적 최소다.
 * 타임라인이 확정 약속을 **그 정거장에만** 쓰고 누적에는 안 넣었기 때문이다
 * (정차와 "부터" 대기만 누적했다).
 *
 * → 각 정거장을 **떠나는 시각**을 누적의 기준으로 삼는다:
 *      출발ᵢ = max(도착예상ᵢ, 확정 약속ᵢ) + 정차ᵢ
 *   앞에서 늦어진 만큼 뒤가 통째로 밀린다. 이것이 없으면 하차 약속이
 *   1시간 이르게 표시되고, 그 값으로 화주와 약속하면 **무조건 지각**이다.
 */
const NOW = Date.parse('2026-08-19T00:00:00Z');
const ANCHOR = '2026-08-19T00:00:00Z';
const stops = [
    { orderId: 'A', stopType: 'pickup', driveMinutes: 13 },
    { orderId: 'A', stopType: 'dropoff', driveMinutes: 110 },   // 상차→하차 97분
] as any;
const orders = [{ id: 'A', capturedAt: '2026-08-19T00:00:00Z' }] as any;
const none = (_id: string) => [] as any;

describe('확정 약속의 전파', () => {
    it('🔴 상차 약속을 늦추면 하차 도착예상이 그만큼 밀린다', () => {
        // 도착예상 00:13 인데 "01:12 까지" 로 약속 → 실제 출발은 01:12 이후
        const reportsOf = (id: string) => id === 'A' ? [{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalAt: '2026-08-19T01:12:00.000Z',
        }] as any : [];
        const withPromise = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, ANCHOR);
        const noPromise = deriveRouteTimeline(stops, orders, none, none, NOW, ANCHOR);

        // 상차 도착예상(00:13) → 약속(01:12) 이므로 59분이 뒤로 전파돼야 한다
        expect(withPromise[1].etaMs! - noPromise[1].etaMs!).toBe(59 * 60_000);
    });

    it('🔴 하차 도착예상이 상차 약속 + 정차 + 주행보다 이를 수 없다', () => {
        const reportsOf = (id: string) => id === 'A' ? [{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalAt: '2026-08-19T01:12:00.000Z',
        }] as any : [];
        const tl = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, ANCHOR);
        const 상차약속 = Date.parse('2026-08-19T01:12:00.000Z');
        const 최소 = 상차약속 + (tl[0].dwellMinutes + 97) * 60_000;
        expect(tl[1].etaMs!).toBeGreaterThanOrEqual(최소);
    });

    it('약속이 도착예상보다 이르면 밀지 않는다 — 빨리 가는 것은 지연이 아니다', () => {
        const reportsOf = (id: string) => id === 'A' ? [{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalAt: '2026-08-19T00:05:00.000Z',   // 도착예상(00:13)보다 이름
        }] as any : [];
        const withPromise = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, ANCHOR);
        const noPromise = deriveRouteTimeline(stops, orders, none, none, NOW, ANCHOR);
        expect(withPromise[1].etaMs).toBe(noPromise[1].etaMs);
    });
});

/**
 * ⚠️ **못 지킬 약속은 화면이 말해야 한다** — 실현가능성 검산.
 * 재계산으로 경로가 바뀌든, 앞 약속이 늦춰지든, 깨지는 자리는 하나다.
 */
describe('약속 실현가능성', () => {
    it('🔴 도착예상이 확정 약속을 넘으면 지각으로 표시된다', () => {
        const reportsOf = (id: string) => id === 'A' ? [
            { stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T01:12:00.000Z' },
            // 하차는 물리적으로 불가능한 시각으로 약속 (상차 01:12 + 정차 + 97분 = 02:5x)
            { stopType: 'dropoff', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T01:51:00.000Z' },
        ] as any : [];
        const tl = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, ANCHOR);
        expect(tl[1].lateMinutes).toBeGreaterThan(0);
    });

    it('지킬 수 있는 약속은 지각이 아니다', () => {
        const reportsOf = (id: string) => id === 'A' ? [
            { stopType: 'dropoff', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T05:00:00.000Z' },
        ] as any : [];
        const tl = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, ANCHOR);
        expect(tl[1].lateMinutes).toBe(0);
    });
});

/** 🪝 닻이 메모리에만 있으면 서버 재시작에 모든 추정 약속이 리셋된다 */
describe('routeComputedAt — 닻은 장부에 남는다', () => {
    it('🔴 orders 테이블에 컬럼이 있다', () => {
        expect(readFileSync(join(__dirname, '../../src/db.ts'), 'utf8'))
            .toMatch(/ensureColumns\('orders'[\s\S]{0,200}routeComputedAt/);
    });
});

/** 📋 loadInto 3벌 복사 — 한 벌만 고치면 나머지가 조용히 갈라진다 */
describe('시트 복원 — 분기마다 갈라지지 않는다', () => {
    it('🔴 저장값 복원이 한 곳에서만 일어난다', () => {
        const c = code();
        expect((c.match(/setDeadlineAt\(src\?\.promisedArrivalAt/g) ?? []).length).toBeLessThanOrEqual(1);
    });

    it('🔴 약속이 비면 저장하지 않는다 — 통화 완료했는데 약속이 없는 일이 없게', () => {
        expect(code()).toMatch(/promisedArrivalAt: deadlineAt \?\?/);
    });
});

/**
 * ⏱️ **출발마감도 앞 약속에 묶인다** (기사님 실측 2026-08-19, 2회차)
 *
 * 화면이 동시에 두 말을 했다:
 *   콜 요약 줄  `경안동 11:49 ⚠️6분`        — 이미 6분 못 지킨다
 *   카운트다운  `1:22:45 뒤에는 출발`        — 1시간 22분 여유가 있다
 *
 * 출발마감이 `약속 − (주행 + 앞 정차)` 라서, **앞 정거장의 확정 약속 때문에
 * 반드시 늦어지는 시간**을 안 뺐기 때문이다. 초월읍에 11:41 까지 있어야 하면
 * 경안동 11:49 는 이미 물리적으로 불가능한데, 카운트다운은 여유를 말한다.
 *
 * "부터" 대기는 여전히 빼지 않는다 — 늦게 떠나면 저절로 줄어드는 시간이다.
 * 그러나 확정 "까지" 약속으로 생긴 지연은 **줄일 수 없다** (그 시각까지 거기 있어야 한다).
 */
describe('출발마감 — 앞 확정 약속의 지연을 반영한다', () => {
    const twoStops = [
        { orderId: 'A', stopType: 'pickup', driveMinutes: 10 },
        { orderId: 'B', stopType: 'pickup', driveMinutes: 20 },
    ] as any;
    const twoOrders = [
        { id: 'A', capturedAt: '2026-08-19T00:00:00Z' },
        { id: 'B', capturedAt: '2026-08-19T00:00:00Z' },
    ] as any;

    /**
     * ⚠️ **뒤 정거장에 확정 약속이 있을 때만 당겨진다.**
     *    B 가 추정 약속이면 앞이 밀릴 때 B 약속도 같이 밀리므로 출발마감은 그대로다 —
     *    그게 맞는 동작이다 (지각도 아니다). 확정 약속은 안 밀리니까 마감이 당겨진다.
     */
    it('🔴 앞을 늦게 떠나야 하면, 확정 약속이 있는 뒤 정거장의 출발마감이 당겨진다', () => {
        const bFixed = { stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T02:00:00.000Z' };
        const withPromise = deriveRouteTimeline(twoStops, twoOrders, (id: string) =>
            id === 'A' ? [{ stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T01:00:00.000Z' }] as any
                       : [bFixed] as any, none, NOW, ANCHOR);
        const noPromise = deriveRouteTimeline(twoStops, twoOrders, (id: string) =>
            id === 'A' ? [] as any : [bFixed] as any, none, NOW, ANCHOR);
        expect(withPromise[1].departByMs!).toBeLessThan(noPromise[1].departByMs!);
    });

    it('🔴 못 지키는 약속이면 출발마감이 이미 지나 있다 (여유를 말하지 않는다)', () => {
        const reportsOf = (id: string) =>
            id === 'A' ? [{ stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T01:00:00.000Z' }] as any
          : id === 'B' ? [{ stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T01:05:00.000Z' }] as any
          : [];
        const tl = deriveRouteTimeline(twoStops, twoOrders, reportsOf, none, NOW, ANCHOR);
        expect(tl[1].lateMinutes).toBeGreaterThan(0);           // 못 지킨다
        expect(tl[1].departByMs!).toBeLessThan(tl[1].etaMs!);   // 그런데 여유가 있다고 하면 모순
        expect(tl[1].departByMs!).toBeLessThanOrEqual(NOW);     // 이미 지난 시각이어야 한다
    });
});
