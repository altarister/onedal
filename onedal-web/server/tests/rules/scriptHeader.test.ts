import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 🧭 **검증 스크립트는 머리에 «누가 · 언제 · 어디서 · 무엇을 · 왜» 다섯 줄을 둔다.**
 *
 * 기사님: *"*.mjs 가 뭘 하려는지 의도가 드러나지 않아 누가 언제 어디서 무엇을 왜 쓰는지 알 수 없다."*
 * 잡는 것 · 못 잡는 것 · 검수는 onedal-web/CLAUDE.md 스크립트 표가 원천이라 머리에 다시 적지 않는다.
 *
 * 모양 (파일 맨 위 주석 블록 안, 한 줄에 하나)
 *   누가: 사람 · 에이전트 · 훅 · 다른 스크립트 — 이 파일을 부르는 쪽
 *   언제: 어떤 일을 마친 뒤, 또는 어떤 상황에서
 *   어디서: 어느 폴더에서 어느 명령으로
 *   무엇을: 하는 일 한 줄
 *   왜: 없으면 무엇을 못 잡나
 */

const SCRIPTS = join(__dirname, '../../../scripts');
const LABELS = ['누가', '언제', '어디서', '무엇을', '왜'] as const;

function mjsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) out.push(...mjsFiles(p));
        else if (e.endsWith('.mjs')) out.push(p);
    }
    return out;
}

/** 파일 맨 위 주석 블록 — 셔뱅 다음의 첫 `/** … *\/` */
function headComment(src: string): string {
    const m = src.match(/^(?:#![^\n]*\n)?\s*\/\*\*([\s\S]*?)\*\//);
    return m ? m[1] : '';
}

describe('🧭 검증 스크립트 머리 — 누가 · 언제 · 어디서 · 무엇을 · 왜', () => {
    const files = mjsFiles(SCRIPTS);

    it('스크립트가 있다', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const f of files) {
        const name = f.slice(SCRIPTS.length + 1);
        it(`🔴 ${name} — 다섯 줄이 다 있다`, () => {
            const head = headComment(readFileSync(f, 'utf8'));
            const missing = LABELS.filter(l => !new RegExp(`^\\s*\\*\\s*${l}\\s*[:：]`, 'm').test(head));
            expect(missing).toEqual([]);
        });
    }
});
