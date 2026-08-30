import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔤 **식별자는 영문만 쓴다** (기사님 확정 2026-08-30)
 *
 * 기사님: *"너는 앞으로 변수명에 영문만 사용한다라고 명시하고 기억해. 지금 다 바꿔."*
 *
 * 🔴 **바꾸는 것은 이름뿐이다.** 주석과 화면 문자열은 한국어가 맞다 —
 *    이 레포의 주석에는 *"어느 날 무엇이 왜 사고였나"* 가 살고, 쓰는 사람은 한 분이다.
 *
 * 🔴 **왜 이름만은 영문인가** — 이 레포의 감사가 식별자를 **ASCII 정규식**으로 훑는다:
 *
 * ```js
 * // audit-docs.mjs ② 사라진 식별자
 * /`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|…)`/
 * ```
 *
 * 한글 이름은 그 그물에 **안 걸린다** — 죽은 채로 남아도, 문서가 없는 이름을 가리켜도
 * **전부 초록불**이다. 2026-08-30 에 «게이트 일곱 종이 통과했는데 결함이 일곱»이던
 * 사각지대와 같은 종류다. 검색·자동완성·리팩터도 함께 약해진다.
 *
 * ⚠️ **선언 자리만 본다.** 문자열·주석·정규식 안의 한글은 건드리지 않는다 —
 *    거기까지 잡으려다 오탐이 나면 검사가 무력화되고, 그러면 없는 것과 같다.
 */

const ROOT = join(__dirname, '../../../..');
const ROOTS = [
    'onedal-web/server/src',
    'onedal-web/client-app/src',
    'onedal-web/shared/src',
    'onedal-web/logbook/src',
    'onedal-web/scripts',
    'onedal-app/app/src/main/java',
];
const EXT = /\.(ts|tsx|mjs|js|kt)$/;

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return out; }
    for (const e of entries) {
        if (e === 'node_modules' || e === 'dist' || e === 'build') continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (EXT.test(e)) out.push(p);
    }
    return out;
}

/**
 * 선언 자리의 한글 이름을 찾는다.
 * TS/JS: `const|let|var|function|class 한글` · Kotlin: `val|var|fun 한글`
 */
const DECL = /\b(?:const|let|var|function|class|val|fun)\s+([가-힣][가-힣A-Za-z0-9_]*)/g;

/** 주석은 뺀다 — 주석 안의 «const 아무개» 서술이 오탐이 되지 않게 */
const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function offenders(): Array<{ file: string; name: string; line: number }> {
    const found: Array<{ file: string; name: string; line: number }> = [];
    for (const r of ROOTS) {
        for (const f of walk(join(ROOT, r))) {
            const src = readFileSync(f, 'utf8');
            const lines = stripComments(src).split('\n');
            lines.forEach((l, i) => {
                for (const m of l.matchAll(DECL)) {
                    found.push({ file: f.slice(ROOT.length + 1), name: m[1], line: i + 1 });
                }
            });
        }
    }
    return found;
}

describe('🔤 식별자는 영문만', () => {
    it('🔴 선언 자리에 한글 이름이 없다', () => {
        const bad = offenders();
        const report = bad.map(b => `  ${b.file}:${b.line}  ${b.name}`).join('\n');
        expect(bad.length === 0 ? '' : `\n한글 식별자 ${bad.length}곳:\n${report}\n`).toBe('');
    });

    /**
     * 🔴 **검사가 실제로 읽고 있는지 스스로 묻는다.** 경로가 틀리면 0건이면서 초록불이 된다 —
     *    2026-08-29 에 옛말 검사가 `.kt` 를 안 봐서 19곳을 놓쳤던 것과 같은 함정이다.
     */
    it('🔴 검사가 파일을 실제로 읽고 있다 (0건이면서 초록불이 되지 않게)', () => {
        const files = ROOTS.flatMap(r => walk(join(ROOT, r)));
        expect(files.length).toBeGreaterThan(200);
        expect(files.some(f => f.endsWith('.kt'))).toBe(true);
        expect(files.some(f => f.endsWith('.tsx'))).toBe(true);
        expect(files.some(f => f.endsWith('.mjs'))).toBe(true);
    });

    /**
     * ⚠️ **주석·문자열은 건드리지 않는다**는 것을 못박는다.
     *    이 검사가 넓어지면 레포의 한국어 주석이 통째로 위반이 된다.
     */
    it('주석 안의 한글은 위반이 아니다', () => {
        const sample = '// const 예약 = []\n/* let 계획 */\nconst plan = [];';
        const lines = stripComments(sample).split('\n');
        const hits = lines.flatMap(l => [...l.matchAll(DECL)]);
        expect(hits).toHaveLength(0);
    });
});
