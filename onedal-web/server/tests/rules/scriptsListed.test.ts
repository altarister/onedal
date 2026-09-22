import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 🧰 **검증 스크립트는 표에 올라야 산다** (기사님 지시).
 *
 * 기사님: *"스크립트를 만들면 CLAUDE.md 에 추가하라 같은 기준이 있으면 잊지 않고 너가
 * 만들어 넣겠군. 만들고 나면 항상 쓰는 거라 검수도 필요할 것 같은데?"*
 *
 * 🔴 **글로 된 기준만으로는 또 잊는다.** 명령 이름도 없고 표에도 없는 도구는
 *    아무도 몰라, 같은 목적의 도구를 또 만들게 된다.
 *
 * 🔴 **«못 잡는 것»이 비면 틀린 안심을 준다.** 예: `audit:docs` 는 파일·식별자·링크만 보므로
 *    초록이어도 `CLAUDE.md` 구성 표가 틀릴 수 있다.
 *    한계를 모르고 쓴 초록불은 «문서가 맞다»로 읽힌다.
 *
 * 🔴 **«검수»가 비면 도구를 믿을 근거가 없다.** 빨간불을 한 번도 못 본 도구는
 *    «잡는다»가 주장일 뿐이다. 그래서 어떻게 빨간불을 봤는지(또는 왜 못 봤는지)를 적는다.
 */

const WEB = join(__dirname, '../../..');
const pkgScripts: Record<string, string> =
    JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')).scripts;
const md = readFileSync(join(WEB, 'CLAUDE.md'), 'utf8');

/**
 * `pnpm dev` 가 셋을 함께 띄운다 — **따로 부르라고 둔 명령이 아니다.**
 * 이 목록에 넣으려면 사유를 적는다. 사유 없이 늘리면 표를 피하는 뒷문이 된다.
 */
const LAUNCHED_BY_DEV = new Set(['dev:server', 'dev:client', 'dev:logbook']);

/** 「검증 스크립트」 절의 표 줄 — `| \`pnpm 명령\` | … |` 꼴 */
function tableRows(): { name: string; cells: string[] }[] {
    const start = md.indexOf('## 검증 스크립트');
    if (start < 0) return [];
    const lines = md.slice(start).split('\n');
    const rows: { name: string; cells: string[] }[] = [];
    let inTable = false;
    for (const line of lines.slice(1)) {
        if (line.startsWith('|')) { inTable = true; } else if (inTable) break; else continue;
        const m = /^\|\s*`pnpm ([\w:-]+)`\s*\|/.exec(line);
        if (!m) continue;   // 머리줄·구분줄
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        rows.push({ name: m[1], cells });
    }
    return rows;
}

describe('🧰 검증 스크립트는 표에 올라야 산다', () => {

    it('「검증 스크립트」 표가 있다', () => {
        expect(tableRows().length).toBeGreaterThan(0);
    });

    it('🔴 scripts/*.mjs 마다 부르는 명령이 package.json 에 있다 — 이름 없는 도구는 아무도 모른다', () => {
        const files = readdirSync(join(WEB, 'scripts')).filter(f => f.endsWith('.mjs'));
        const unnamed = files.filter(f => !Object.values(pkgScripts).some(cmd => cmd.includes(`scripts/${f}`)));
        expect(unnamed).toEqual([]);
    });

    it('🔴 package.json 명령마다 표에 한 줄이 있다', () => {
        const listed = new Set(tableRows().map(r => r.name));
        const missing = Object.keys(pkgScripts).filter(k => !LAUNCHED_BY_DEV.has(k) && !listed.has(k));
        expect(missing).toEqual([]);
    });

    it('🔴 표에 없는 명령을 적지 않는다 — 지운 도구의 줄이 남으면 문서가 거짓말한다', () => {
        const ghosts = tableRows().map(r => r.name).filter(n => !(n in pkgScripts));
        expect(ghosts).toEqual([]);
    });

    it('🔴 줄마다 «잡는 것 · 못 잡는 것 · 검수» 가 비어 있지 않다', () => {
        const thin = tableRows()
            .filter(r => r.cells.length < 4 || r.cells.slice(1, 4).some(c => c === '' || c === '-'))
            .map(r => `${r.name} (칸 ${r.cells.length})`);
        expect(thin).toEqual([]);
    });
});
