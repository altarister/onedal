import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📢 **배너 층(토스트) — 지도 위에 불투명하게, 필터 줄은 가리지 않는다** (기사님).
 *
 * 기사님: *"토스트팝업이 배경을 먹고 나와서 완전오류 같거든"* · *"지도 위로 하자"*.
 *
 * 🔴 배너는 무대에서 **지도 위에** 뜬다 — 바탕이 10%(`bg-primary/10` 같은 것)면 뒤가 단색이 아니라 지도라 **90% 비친다.**
 *    그래서 바탕은 불투명하게 칠한다. 그리고 층은 **필터 줄(필터를 여는 유일한 줄) 아래**에 둔다 —
 *    헤더 바로 아래에 뜨면 필터 줄까지 10초 동안 덮는다.
 */
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (rel: string) => readFileSync(join(CLIENT, rel), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('📢 배너 층 — 지도 위 · 불투명 · 필터 줄 아래', () => {
    const dash = read('pages/Dashboard.tsx');

    it('🔴 배너 층은 필터 줄(과 열리는 필터) 아래 · 지도 위에 있다', () => {
        const layer = dash.indexOf('📢 배너 층');
        expect(layer).toBeGreaterThan(-1);
        expect(layer).toBeGreaterThan(dash.indexOf('<OrderFilterModal'));
        expect(layer).toBeLessThan(dash.indexOf('<StageView'));
    });

    it('🔴 배너 바탕이 반투명(10%)이 아니다 — 지도가 비치지 않는다', () => {
        const layer = dash.slice(dash.indexOf('📢 배너 층'), dash.indexOf('<CargoMismatchBanner'));
        expect(codeOnly(layer)).not.toMatch(/bg-(primary|warning|danger)\/10/);
        expect(codeOnly(read('components/dashboard/CargoMismatchBanner.tsx'))).not.toMatch(/bg-danger\/10/);
    });

    it('🔴 필터 상황판 오른쪽 끝 ⚙️ 는 없다 — 줄 전체가 이미 필터를 여는 버튼이다', () => {
        expect(codeOnly(read('components/dashboard/OrderFilterStatus.tsx'))).not.toMatch(/⚙️/);
    });
});
