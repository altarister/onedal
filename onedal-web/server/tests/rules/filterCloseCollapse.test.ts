import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🪗 **필터를 닫을 때도 접히며 올라간다** (기사님 «열 때와 닫을 때 애니메이션이 다르다» · 04 원인 · onedal-1f).
 *
 * Collapse(ui/collapse.tsx)는 닫히는 200ms 동안 자식을 들고 있다가 버린다. 대시보드가 필터에 isOpen={isFilterOpen} 을 넘기면
 * 닫는 순간 필터가 스스로 `return null` 해 200ms 동안 빈 상자를 접는다 — 닫을 때만 «뿅».
 * Collapse 안에서는 늘 열림으로 넘기고, 버리는 때는 Collapse 에 맡긴다.
 */
const dash = readFileSync(join(__dirname, '../../../client-app/src/pages/Dashboard.tsx'), 'utf8');

describe('🪗 필터 닫힘', () => {
    it('🔴 Collapse 안의 필터에 isFilterOpen 을 넘기지 않는다 — 늘 열림 · 버리는 때는 Collapse', () => {
        const i = dash.indexOf('<Collapse open={isFilterOpen}>');
        expect(i).toBeGreaterThan(-1);
        const inner = dash.slice(i, dash.indexOf('</Collapse>', i));
        expect(inner).toContain('<OrderFilterModal');
        expect(inner).not.toMatch(/isOpen=\{isFilterOpen\}/);
        expect(inner).toMatch(/<OrderFilterModal\s+isOpen\s/);
    });
});
