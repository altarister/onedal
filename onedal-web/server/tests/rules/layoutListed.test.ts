import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 🗂️ **「구성」과 실제 폴더는 늘 같다** (기사님 지시).
 *
 * 기사님: *"문서나 폴더를 생성할 때 CLAUDE.md 구성과 다르면 사용자에게 물어봐라.
 * 이런 것도 있어야 우리 구성이 항상 코드와 같을 것 같다."*
 *
 * 🔴 **표와 폴더가 갈라지면 루트 README.md 가 매 세션 틀린 구성을 가르친다.**
 *    2026-09-14 한 줄씩 대조에서 표에 없는 폴더가 셋(`onedal-sim` · `onedal-app/simulator-app`
 *    · `onedal-map`)이었고, `shared` 는 «앱 ↔ 서버»라 적혀 있었다 (앱은 0곳에서 쓴다).
 *
 * 규칙(«새 폴더를 만들기 전에 묻는다»)은 루트 CLAUDE.md 「일하는 순서」에 있다.
 * 이 검사는 그 뒤 **«표에 올렸나»** 를 문다 — 글로만 적어 두면 잊는다.
 */

const ROOT = join(__dirname, '../../../..');
const md = readFileSync(join(ROOT, 'README.md'), 'utf8');

/** 루트 README.md 의 「## 구성」 절 — 다음 `## ` 앞까지 */
function layoutSection(): string {
    const start = md.indexOf('\n## 구성');
    if (start < 0) return '';
    const next = md.indexOf('\n## ', start + 1);
    return md.slice(start, next < 0 ? undefined : next);
}

const dirsOf = (abs: string) =>
    readdirSync(abs).filter(n => !n.startsWith('.') && n !== 'node_modules' && statSync(join(abs, n)).isDirectory());

/** 앱 폴더 = 제 빌드 파일을 가진 폴더 (문서·스크립트·gradle 래퍼 폴더는 앱이 아니다) */
const isApp = (abs: string) =>
    ['package.json', 'build.gradle.kts', 'build.gradle'].some(f => existsSync(join(abs, f)));

describe('🗂️ 「구성」과 실제 폴더는 늘 같다', () => {

    it('루트 README.md 에 「구성」 절이 있다', () => {
        expect(layoutSection()).not.toBe('');
    });

    it('🔴 최상위 폴더마다 「구성」에 이름이 있다', () => {
        const sec = layoutSection();
        const missing = dirsOf(ROOT).filter(d => !sec.includes(`\`${d}/`));
        expect(missing).toEqual([]);
    });

    it('🔴 onedal-app/ · onedal-web/ 안의 앱 폴더마다 「구성」 표에 줄이 있다', () => {
        const sec = layoutSection();
        const missing: string[] = [];
        for (const parent of ['onedal-app', 'onedal-web']) {
            for (const d of dirsOf(join(ROOT, parent))) {
                if (!isApp(join(ROOT, parent, d))) continue;
                if (!sec.includes(`\`${parent}/${d}/\``)) missing.push(`${parent}/${d}/`);
            }
        }
        expect(missing).toEqual([]);
    });

    it('🔴 「구성」 표의 줄이 실제 있는 폴더를 가리킨다 — 지운 폴더의 줄이 남으면 거짓말이다', () => {
        const rows = layoutSection().split('\n').filter(l => /^\|\s*`[\w./-]+\/`/.test(l));
        const ghosts = rows
            .map(l => /^\|\s*`([\w./-]+)\/`/.exec(l)![1])
            .filter(p => !existsSync(join(ROOT, p)));
        expect(rows.length).toBeGreaterThan(0);
        expect(ghosts).toEqual([]);
    });
});
