import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔄 **파생 치환 ② — 서버 계산의 재료는 새 장부 하나다** (2026-08-21)
 *
 * 적재·정차·동승·타임라인·복구가 옛 장부(stop_cargo_reports · order_milestones)를
 * 직접 읽으면, 다리(dual-write)가 한쪽을 놓치는 순간 **두 장부 두 목소리**가 된다
 * (#33 클래스). 계산 소비처는 전부 `stepRecordsOf` 관문 하나를 거친다.
 *
 * 옛 장부 읽기가 **허용되는 곳** (아직 철거 전):
 *   · milestone-log 등 옛 소켓 이벤트 송신 (관제웹 useCallProgress 가 아직 듣는다)
 *   · reportMilestone 내부의 중복·역행 방어 (옛 테이블 UNIQUE 가 그 방어의 일부)
 *   · ledger(pnpm ledger) — 옛 장부를 눈으로 보는 도구 자체
 * 관제웹 치환이 끝나면 옛 테이블과 함께 걷는다 (손으로, 확인 받고).
 */

const read = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('파생 치환 ② — 계산은 stepRecordsOf 관문 하나', () => {
    it('🔴 helpers(정차·동승)가 옛 장부를 직접 읽지 않는다', () => {
        const h = codeOnly(read('core/helpers.ts'));
        expect(h).toMatch(/stepRecordsOf\(/);
        expect(h).not.toMatch(/OrderRepository\.getCargoReports/);
        expect(h).not.toMatch(/OrderRepository\.getMilestones/);
    });

    it('🔴 적재(computeLoadedPoints 재료)가 새 장부에서 온다', () => {
        const fm = codeOnly(read('state/filterManager.ts'));
        expect(fm).toMatch(/stepRecordsOf\(c\.id\)\.reports/);
        expect(fm).not.toMatch(/OrderRepository\.getCargoReports/);
    });

    it('🔴 심사 타임라인(OrderEvaluator)·서버 타임라인(routeTlOf)이 새 장부를 먹는다', () => {
        const ev = codeOnly(read('core/engine/OrderEvaluator.ts'));
        expect(ev).toMatch(/stepRecordsOf\(id\)\.reports/);
        expect(ev).not.toMatch(/OrderRepository\.getCargoReports/);
        const sh = codeOnly(read('socket/socketHandlers.ts'));
        const tl = sh.slice(sh.indexOf('function routeTlOf'), sh.indexOf('\n}', sh.indexOf('function routeTlOf')));
        expect(tl).toMatch(/stepRecordsOf\(/);
        expect(tl).not.toMatch(/getCargoReports|getMilestones/);
    });

    it('🔴 복구(hydrateVisitedStops·상태 파생)가 새 장부의 마일스톤을 읽는다', () => {
        const en = codeOnly(read('services/dispatchEngine.ts'));
        expect(en).toMatch(/stepRecordsOf\(orderId\)\.milestones/);
        expect(en).not.toMatch(/OrderRepository\.getMilestones\(orderId\) as \{ milestone: string/);
    });
});
