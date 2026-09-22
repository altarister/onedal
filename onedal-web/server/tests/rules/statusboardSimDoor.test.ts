import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * 🚪 **현황판은 시뮬 전용 문(`/api/sim/*`)을 문지기 하나로만 연다**.
 *
 * 서버는 이 문들을 운영에서 닫는다 (`routes/sim.ts` 의 `isDevBuild()` — 기사님 실시간 좌표를
 * 무인증으로 여는 문이라 **일부러** 닫았다). 그래서 라이브의 404 는 고장이 아니라 **답**이다.
 *
 * 이 검사가 막는 것 셋:
 *   ① 카드가 `/sim/` 을 직접 `fetch` 하는 것 — 그러면 «`ok` 를 안 보는 자리»가 새 카드마다 생긴다
 *   ② 닫힌 문의 404 본문을 값으로 믿는 것 — «없는 값은 `null`» (규칙 ④)
 *   ③ 시뮬 전용 칸이 문 닫힌 서버(라이브)에 서는 것 — 서버 `isDevBuild()` 와 짝이다
 */

const BOARD = join(__dirname, '../../../client-app/src/statusboard');
const read = (rel: string) => readFileSync(join(BOARD, rel), 'utf8');
/** 주석을 걷어낸 **코드만** — 주석에 적은 예시 모양이 거짓 빨간불을 만들지 않게 */
const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('현황판 — 시뮬 전용 문(`/api/sim/*`)을 한 곳으로 지난다', () => {

    it('🔴 문지기 파일이 있다 — 시뮬 문을 여는 유일한 자리', () => {
        expect(existsSync(join(BOARD, 'simDoor.ts'))).toBe(true);
    });

    /**
     * 🔴 **카드가 `fetch` 로 시뮬 문을 직접 두드리지 않는다.**
     *    두드리는 자리가 늘어나는 만큼 «ok 를 안 보는 자리»도 늘어난다.
     */
    it('🔴 `/sim/` 을 직접 `fetch` 하는 카드가 없다 — 전부 `simFetch` 를 지난다', () => {
        const raw: string[] = [];
        for (const f of ['StatusBoard.tsx', 'ScenarioCard.tsx']) {
            const src = codeOnly(read(f));
            for (const m of src.matchAll(/fetch\(\s*`\$\{apiBase\(\)\}\/sim[^`]*`/g)) {
                raw.push(`${f}: ${m[0].slice(0, 60)}`);
            }
        }
        expect(raw).toEqual([]);
    });

    /**
     * 🔴 **문지기는 `ok` 아닌 답을 값으로 안 넘긴다** — 404 본문을 흘리면
     *    그것이 «위치»·«시나리오»가 되어 화면이 거짓말을 한다 (규칙 ④).
     */
    it('🔴 `simFetch` 가 `r.ok` 를 보고, 아니면 값 대신 `null` 을 준다', () => {
        const src = codeOnly(read('simDoor.ts'));
        expect(src).toMatch(/r\.ok/);
        /* 🔴 «없음»을 말하는 낱말이 `null` 이다 — `0` 도 빈 객체도 아니다 */
        expect(src).toMatch(/Promise<\s*T\s*\|\s*null\s*>/);
        /* 🔴 ok 를 보기 전에 본문을 값으로 만들지 않는다 */
        const okAt = src.indexOf('r.ok');
        const jsonAt = src.indexOf('r.json()');
        expect(okAt).toBeGreaterThan(-1);
        expect(jsonAt).toBeGreaterThan(okAt);
    });

    /**
     * 🔴 **닫힌 것을 알면 다시 안 묻는다** — 5초·1.5초마다 계속 두드리면
     *    콘솔이 404 로 뒤덮인다.
     */
    it('🔴 문이 닫힌 것을 기억하고 그 뒤로는 묻지 않는다', () => {
        const src = codeOnly(read('simDoor.ts'));
        expect(src).toMatch(/closed/);
        expect(src).toMatch(/404/);
    });

    /**
     * 🔴 **시뮬 전용 구역은 문이 닫힌 서버에서 안 뜬다** — 라이브에서 못 쓰는 칸이
     *    좁은 현황판의 자리를 차지하면 안 된다. 서버의 `isDevBuild()` 와 짝이다.
     */
    it('🔴 🧪 테스트용 구역이 문 상태를 보고 선다', () => {
        const src = codeOnly(read('StatusBoard.tsx'));
        expect(src).toMatch(/simDoor|useSimDoor/);
        const i = src.indexOf('function TestOnlySection');
        expect(i).toBeGreaterThan(-1);
        const body = src.slice(i, i + 900);
        expect(body).toMatch(/useSimDoor|doorOpen|return null/);
    });

    /**
     * 🔴 **`index !== null` 만 믿지 않는다** — `undefined !== null` 이 true 라
     *    «줄이 있다»로 읽혀 `rows[undefined]` 로 터진다.
     */
    it('🔴 `ScenarioCard` 는 줄(`rows`)이 배열일 때만 화면을 세운다', () => {
        const src = codeOnly(read('ScenarioCard.tsx'));
        expect(src).toMatch(/Array\.isArray\([^)]*\.rows\s*\)/);
    });
});
