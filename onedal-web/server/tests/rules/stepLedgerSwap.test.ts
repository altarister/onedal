import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔄 **파생 치환 ② — 서버 계산의 재료는 새 장부 하나다**
 *
 * 적재·정차·동승·타임라인·복구는 전부 `stepRecordsOf` 관문 하나를 거친다.
 * 계산 소비처가 다른 기록을 직접 읽으면 **두 장부 두 목소리**가 된다.
 *
 * 옛 장부(stop_cargo_reports · order_milestones)는 DB 에 만들지 않는다 —
 * 이 검사는 그 읽기(`OrderRepository.getCargoReports` · `getMilestones`)가 계산 소비처에 다시 들어오지 않는지 본다.
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
