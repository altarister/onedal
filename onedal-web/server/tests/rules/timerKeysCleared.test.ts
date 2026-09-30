import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const SERVER = join(__dirname, "../../src");
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const walk = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.ts') ? [p] : []);
});

/**
 * ⏰ **세션 장부에 거는 기다림은 전부 콜을 싣는다** — 그래야 콜이 끝날 때 함께 꺼진다
 *
 * 🔴 콜이 끝나면 `cancelOrderWaits` 가 장부 줄의 `orderId` 로 그 콜 것을 모두 끈다.
 *    `orderId` 없이 건 기다림은 콜이 정상으로 끝난 뒤에도 살아남아 깨어난다 (`server/CLAUDE.md` «좀비 타이머»).
 *    사용자 세션에 안 묶이는 기다림(`globalWaits`)만 콜 없이 건다.
 *
 * 🔴 **거는 자리를 못 읽으면 빨간불이다** (규칙 ④) — 읽을 수 없는 모양으로 걸면 이 검사가 지킬 수 없다.
 */
describe('기다림 — 세션 장부에 거는 것은 전부 orderId', () => {

    const files = walk(SERVER)
        .filter(p => !p.endsWith('state/waits.ts'))
        .map(p => ({ where: p.slice(SERVER.length + 1), src: codeOnly(readFileSync(p, 'utf8')) }));

    /** ⏰ 거는 자리 — `armWait(장부, 키, { … })` 의 장부와 설정 덩어리 */
    const armed: { book: string; spec: string; where: string }[] = [];
    const unreadable: string[] = [];
    for (const f of files) {
        for (const m of f.src.matchAll(/armWait\(\s*([\w$.]+)\s*,\s*(?:`[^`]*`|[\w$.]+)\s*,\s*(\{[^}]*\})/g)) {
            armed.push({ book: m[1], spec: m[2], where: f.where });
        }
        const calls = (f.src.match(/armWait\(/g) ?? []).length;
        const read = armed.filter(a => a.where === f.where).length;
        if (calls !== read) unreadable.push(`${f.where} — armWait ${calls}곳 중 ${read}곳만 읽음`);
    }

    it('🔴 거는 자리가 적어도 하나는 잡힌다 (정규식이 죽으면 이 검사가 조용히 통과한다)', () => {
        expect(armed.length).toBeGreaterThan(0);
    });

    it('🔴 거는 자리를 읽을 수 없는 곳이 없다 — 읽을 수 없으면 지킬 수 없다', () => {
        expect(unreadable).toEqual([]);
    });

    it('🔴 세션 장부에 거는 기다림은 전부 orderId 를 싣는다', () => {
        const missing = armed.filter(a => a.book !== 'globalWaits' && !/\borderId\b/.test(a.spec))
            .map(a => `${a.where} — ${a.spec.slice(0, 60)}`);
        expect(missing).toEqual([]);
    });
});
