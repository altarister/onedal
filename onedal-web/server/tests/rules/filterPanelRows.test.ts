import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧰 **필터 판 — 지도를 보면서 고친다** (기사님 확정 2026-09-15 · 목업 https://claude.ai/artifact/RfDCyjwqHM2UcoNGaBTwPy).
 *
 * 기사님: *"필터 영역이 너무 커서 한번에 저장버튼이 보이지 않아서 불편하고 필터가 덩어리 감이 없어서 보기가 어려워"* ·
 * *"의도가 지도의 영역을 보면서 반경과 등을 수정하고 싶거든 — 높이 사이즈를 줄이고 모두 닫기 모드로 … 하나만 열리게"* ·
 * *"칸을 누르면 올라가기만하거든 내리는것도 필요해"* · *"필터 박스가 있음으로 내부박스를 따로 만들필요가 없을꺼 같아"* ·
 * *"어디로에 노선, 동선을 넣으면 영역이 더 넓어질꺼 같다"* · *"딱 이모양이면 될꺼 같다"*.
 *
 * 🔴 판은 **내용만큼만** 선다 — 네 행이 모두 닫힌 채 시작하고 **하나만** 열린다. 저장 줄은 스크롤 밖 바닥에 늘 보인다.
 */
const CLIENT = join(__dirname, '../../../client-app/src');
const read = (rel: string) => readFileSync(join(CLIENT, rel), 'utf8');
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('🧰 필터 판 — 네 행 · 하나만 열림 · 저장 줄 고정', () => {
    const modal = read('components/dashboard/OrderFilterModal.tsx');
    const code = codeOnly(modal);

    it('🔴 네 행이 있고 모두 닫힌 채 시작한다 · 열린 행은 하나뿐이다', () => {
        expect(code).toMatch(/const \[openRow, setOpenRow\] = useState<RowId \| null>\(null\)/);
        for (const id of ['where', 'wide', 'call', 'exclude']) expect(code).toMatch(new RegExp(`id="${id}"`));
    });

    it('🔴 노선·동선은 «어디로» 행 안에 있다', () => {
        const where = code.indexOf('id="where"'), wide = code.indexOf('id="wide"');
        const tabs = code.indexOf("'🛣️ 노선'");
        expect(tabs).toBeGreaterThan(where);
        expect(tabs).toBeLessThan(wide);
    });

    it('🔴 저장 줄은 스크롤 밖 바닥에 따로 있다', () => {
        const bar = code.indexOf('data-save-bar');
        expect(bar).toBeGreaterThan(-1);
        expect(code.indexOf('💾 서버 저장', bar)).toBeGreaterThan(bar);
        expect(code.indexOf('↩︎ 되돌리기', bar)).toBeGreaterThan(bar);
    });

    it('🔴 설명 글 두 덩어리는 판에서 뺐다', () => {
        expect(code).not.toMatch(/상차 반경<\/b>은 곧/);
        expect(code).not.toMatch(/라인반경<\/b> = 지금 경로/);
    });

    it('🔴 관내 표시 셋은 남는다 (onedal-4c 가 걷는다)', () => {
        expect(code).toMatch(/filter\.localMode/);
        expect(code).toMatch(/exampleKm/);
        expect(code).toMatch(/isLocal/);
    });
});

describe('🎚️ KnobGrid — 칸 안에서 − / + 로 올리고 내린다', () => {
    const knob = codeOnly(read('components/ui/KnobGrid.tsx'));

    it('🔴 칸마다 줄이기·늘리기가 있다 — 값을 누르면 슬라이더 레이어', () => {
        expect(knob).toMatch(/\$\{k\.label\} 줄이기/);
        expect(knob).toMatch(/\$\{k\.label\} 늘리기/);
        expect(knob).toMatch(/type="range"/);
    });
});
