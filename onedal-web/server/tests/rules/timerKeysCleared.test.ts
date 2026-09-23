import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SERVER = join(__dirname, "../../src");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.ts') ? [p] : []);
});

/**
 * ⏰ **타이머를 거는 접두사는 전부 거두는 목록에 있어야 한다**
 *
 * 🔴 `clearOrderTimers` 가 접두사를 **손으로 나열**한다. 새 타이머를 그 목록에 안 넣으면
 *    콜이 정상으로 끝난 뒤에도 그 타이머가 살아남아 깨어난다 (`server/CLAUDE.md` «좀비 타이머»).
 *    같은 함정이 두 번 났다 — `listExit_` 가 목록 밖에서 걸리고 있었다.
 *
 * 🔴 **키를 못 읽으면 빨간불이다** (규칙 ④). 접두사를 지어내지 않는다 — 읽을 수 없는 모양으로
 *    키를 만들면 이 검사가 지킬 수 없으므로, 그때는 키 만드는 법을 바꾼다.
 */
describe('타이머 키 — 거는 접두사는 전부 거두는 목록에 있다', () => {

    const files = walk(SERVER).map(p => ({ path: p, src: codeOnly(readFileSync(p, 'utf8')) }));

    /** 🧹 거두는 목록 — `clearOrderTimers` 가 도는 접두사들 */
    const cleared = (() => {
        const store = files.find(f => f.path.endsWith('userSessionStore.ts'))!;
        const m = store.src.match(/function clearOrderTimers[\s\S]*?for \(const prefix of \[([^\]]*)\]/);
        if (!m) throw new Error('clearOrderTimers 의 접두사 목록을 못 읽었다');
        return m[1].split(',').map(s => s.trim().replace(/^['"`]|['"`]$/g, '')).filter(Boolean);
    })();

    /** ⏰ 거는 접두사 — `activeTimers.set(…)` 의 첫 인자에서 뽑는다 */
    const armed: { prefix: string; where: string }[] = [];
    const unreadable: string[] = [];
    for (const f of files) {
        const where = f.path.slice(SERVER.length + 1);
        for (const m of f.src.matchAll(/activeTimers\.set\(\s*([^,]+),/g)) {
            const arg = m[1].trim();
            const direct = arg.match(/^`([a-zA-Z][a-zA-Z0-9]*_)\$\{/);
            if (direct) { armed.push({ prefix: direct[1], where }); continue; }
            if (/^[a-zA-Z_$][\w$]*$/.test(arg)) {
                const decl = f.src.match(new RegExp(`(?:const|let)\\s+${arg}\\s*=\\s*\`([a-zA-Z][a-zA-Z0-9]*_)\\$\\{`));
                if (decl) { armed.push({ prefix: decl[1], where }); continue; }
            }
            unreadable.push(`${where} — ${arg}`);
        }
    }

    it('🔴 타이머를 거는 자리가 적어도 하나는 잡힌다 (정규식이 죽으면 이 검사가 조용히 통과한다)', () => {
        expect(armed.length).toBeGreaterThan(0);
    });

    it('🔴 키를 읽을 수 없는 자리가 없다 — 읽을 수 없으면 지킬 수 없다', () => {
        expect(unreadable).toEqual([]);
    });

    it('🔴 거는 접두사가 전부 거두는 목록에 있다 (`listExit_` 가 빠져 있었다)', () => {
        const missing = armed.filter(a => !cleared.includes(a.prefix))
            .map(a => `${a.prefix} (${a.where})`);
        expect(missing).toEqual([]);
    });
});
