import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveRouteTimeline } from '@onedal/shared';

const sheet = () => readFileSync(join(__dirname,
    '../../../client-app/src/components/dashboard/StepSheetMock.tsx'), 'utf8');
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

/**
 * 🏗️ 옛 시트의 복원(loadInto)·손댐 표식(deadlineTouched) 검사는 시트 철거(2026-08-21)와
 * 함께 걷었다. 새 설계에서 그 사고를 막는 자리가 바뀌었다:
 *   · 시트는 저장된 행을 그리기만 한다 (복원 분기 자체가 소멸 — 규칙 ③)
 *   · "통화 없이 확정할 권한이 없다"는 **kind 로** 지켜진다 — 통화 완료(DONE)만
 *     DECLARED(확정)가 되고, 스킵(SKIPPED)은 약속으로 안 굳는다.
 *     그 규칙의 검사는 shared(stepRecords 변환·timing 의 DECLARED-만-확정)에 있다.
 */
describe('약속 확정 — 통화 완료 행위로만', () => {
    it('격자가 "통화 완료 때 약속으로 저장"을 말한다 (미리 눌림 ≠ 확정)', () => {
        expect(sheet()).toMatch(/통화 완료 때/);
    });
});
