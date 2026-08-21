import { readFileSync } from 'fs';
import { join } from 'path';
import { deriveRouteTimeline } from '@onedal/shared';

/**
 * 🕒 **약속은 구간이다** (기사님 확정 2026-08-19)
 *
 * 기사님: *"딱 그 시간 도착으로 잡는다면 스케줄 잡는 것이 물리적으로 너무 어려워질
 * 수 있다. '12시부터 12시30분 사이에 갈게요' 나 '1시 전에 갈게요' 이렇게 잡는다면
 * 여유가 생겨서 다음 약속 잡을 때 그 사이로 시간 조율이 가능할 것 같은데."*
 *
 * 스키마는 자연스럽다 — 지금 질문이 이미 *"몇 시까지 갈까요?"* 라서
 * `promisedArrivalAt` 은 그대로 **"까지"(상한)** 이고, **"부터"(하한)** 한 칸만 는다.
 *
 *   "1시 전에 갈게요"       → 부터 없음 · 까지 13:00   (탭 1번 — 기존과 동일)
 *   "12~12:30 사이 갈게요"  → 부터 12:00 · 까지 12:30  (탭 2번)
 *
 * 둘의 역할이 다르다:
 *   까지 — 출발 마감·지각 판정의 기준 (기존과 동일)
 *   부터 — **일찍 가도 소용없음.** 11:40 에 도착해도 화주가 12시부터라면 상차는
 *          12시 시작 → 뒤 정거장 도착예상이 그만큼 밀린다. 이걸 빼먹으면
 *          뒤 약속이 낙관으로 잡힌다.
 */
const NOW = Date.parse('2026-08-19T04:00:00Z');
const COMPUTED = '2026-08-19T04:00:00Z';

const stops = [
    { orderId: 'A', stopType: 'pickup',  driveMinutes: 10 },
    { orderId: 'A', stopType: 'dropoff', driveMinutes: 70 },
] as any;
const orders = [{ id: 'A', capturedAt: '2026-08-19T03:50:00Z' }] as any;
const none = (_id: string) => [] as any;

describe('타임라인 — 부터(하한)는 기다림으로 뒤 정거장에 전파된다', () => {
    /**
     * 🔄 **기준을 "부터"에서 "까지"로 바꿨다** (2026-08-19 코드리뷰).
     *
     * 처음엔 "부터"(05:00)만 기다림으로 전파했다 — 구간의 이점(여유)을 살리려는
     * 낙관이었다. 그런데 그러면 **뒤 약속을 못 지킨다**: 05:00 기준으로 하차를
     * 약속했는데 실제로 05:30 에 상차하면 그대로 30분 지각이다.
     * 화주와 정하는 것은 언제나 "언제까지"이므로, 뒤 계산의 기준도 **상한**이어야 한다.
     * 구간의 여유는 *이 정거장에서 합짐을 잡을 시간*으로 쓰이지, 뒤 약속을 당기는
     * 근거가 되지는 않는다.
     */
    it('🔴 구간 약속이면 "까지"(상한)가 뒤 정거장의 기준이 된다 — 지킬 수 있는 약속만 권한다', () => {
        // 도착예상 04:10 · 약속 05:00~05:30 → 뒤는 05:30 기준 (80분 밀림)
        const reportsOf = (id: string) => id === 'A' ? [{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalFromAt: '2026-08-19T05:00:00.000Z',
            promisedArrivalAt: '2026-08-19T05:30:00.000Z',
        }] as any : [];
        const withWait = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, COMPUTED);
        const noWait = deriveRouteTimeline(stops, orders, none, none, NOW, COMPUTED);
        const shift = withWait[1].etaMs! - noWait[1].etaMs!;
        expect(shift).toBe(80 * 60_000);
    });

    it('"부터"가 도착예상보다 일러도 확정 "까지" 기준은 그대로다', () => {
        const reportsOf = (id: string) => id === 'A' ? [{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalFromAt: '2026-08-19T04:05:00.000Z',   // 도착예상(04:10)보다 이름
            promisedArrivalAt: '2026-08-19T05:30:00.000Z',
        }] as any : [];
        const withFrom = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, COMPUTED);
        const confirmedOnly = deriveRouteTimeline(stops, orders, (id: string) => id === 'A' ? [{
            stopType: 'pickup', kind: 'DECLARED', promisedArrivalAt: '2026-08-19T05:30:00.000Z',
        }] as any : [], none, NOW, COMPUTED);
        expect(withFrom[1].etaMs).toBe(confirmedOnly[1].etaMs);
    });

    it('출발 마감은 여전히 "까지" 기준이다 — 기다림은 늦게 떠나면 저절로 줄어드는 시간이라 빼지 않는다', () => {
        const reportsOf = (id: string) => id === 'A' ? [{
            stopType: 'pickup', kind: 'DECLARED',
            promisedArrivalFromAt: '2026-08-19T05:00:00.000Z',
            promisedArrivalAt: '2026-08-19T05:30:00.000Z',
        }] as any : [];
        const tl = deriveRouteTimeline(stops, orders, reportsOf, none, NOW, COMPUTED);
        // 상차 출발마감 = 까지(05:30) − 주행 10분
        expect(tl[0].departByMs).toBe(Date.parse('2026-08-19T05:20:00.000Z'));
    });
});

describe('저장 경로 — 부터가 유실되지 않는다', () => {
    const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

    it('🔴 저장 경로(bridgeCargoReport → 단계 행)가 부터를 실어 나른다', () => {
        // 🏗️ 옛 upsert(stop_cargo_reports)는 철거 (2026-08-21) — 부터의 저장 경로는 다리 하나다
        const seeder = read('../../src/services/stepSeeder.ts');
        expect(seeder).toContain('promised_arrival_from_at: report.promisedArrivalFromAt');
        const records = read('../../../shared/src/stepRecords.ts');
        expect(records).toContain('promisedArrivalFromAt: r.promised_arrival_from_at');
    });

    it('🔴 새 단계 시트가 부터(기간)를 저장하고, 단계 행에 칸이 있다', () => {
        // 🏗️ 옛 시트는 철거 (2026-08-21) — 기간 저장은 StepSheetMock + 단계 행이 잇는다
        const sheet = read('../../../client-app/src/components/dashboard/StepSheetMock.tsx');
        expect(sheet).toContain('promisedArrivalFromAt');
        const tables = read('../../../shared/src/stepTables.ts');
        expect(tables).toContain('promised_arrival_from_at');
    });
});
