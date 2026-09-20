import fs from 'fs';
import path from 'path';

/**
 * 🚚 **판정 재료는 «나르기만» 한다 — 받아 놓고 버리지 않는다**
 *
 * ── 왜 ──
 *
 * `judgeFacts.ts` 머리가 적어 두었다 — *«새로 계산하지 않는다. 옮겨 담기만 한다»*(규칙 ③).
 * 그 규칙은 **더 재는 것**을 막지만 **안 나르는 것**은 못 막는다.
 * 칸을 받아 놓고 반환에 `null`·`[]` 를 박으면 타입도 맞고 검사도 초록인데 **재료가 영영 안 온다.**
 *
 * 🔴 실제로 그렇게 돌고 있었다 — 「성질」 기준은 다 만들어져 있는데 `excludedHits: []` 가
 *    박혀 있어 한 번도 안 쟀다.
 *
 * ── 어떻게 ──
 *
 * **입력으로 받은 칸은 본문에서 반드시 쓰인다.** 타입스크립트는 객체 속성이라 안 잡는다.
 * 🔴 **개별 검사에 흩지 않는다** — 같은 구멍을 다섯 번 만나고서야 한 곳으로 모았다.
 *    칸을 새로 만들어도 이 검사는 자동으로 문다 (목록을 손으로 안 적는다).
 */

const codeOnly = fs.readFileSync(path.join(__dirname, '../../src/core/engine/judgeFacts.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** `export function 이름(input: {...}): ... { ... }` 한 덩이 */
const 함수 = (name: string): string => {
    const after = codeOnly.split(`export function ${name}`)[1];
    if (!after) throw new Error(`${name} 을 못 찾았다`);
    return after.split('\nexport ')[0];
};

/**
 * 입력 타입 선언의 칸 이름들 — 들여쓰기 네 칸에 `이름:` 또는 `이름?:`.
 * 🔴 **중첩 칸은 한 겹 더 들어간다** (`progress?: { ratio, awayKm }`) — 안 그러면
 *    바깥 이름 하나만 쓰여도 통과해, 안쪽 칸을 버려도 초록이 된다.
 */
const 받는칸 = (본문: string): string[] => {
    const 선언부 = 본문.split('): JudgeFacts')[0];
    const out: string[] = [];
    for (const m of 선언부.matchAll(/^ {4}(\w+)\??:\s*(\{[^}]*\})?/gm)) {
        const [, 이름, 안] = m;
        if (!안) { out.push(이름); continue; }
        for (const i of 안.matchAll(/(\w+)\??:/g)) out.push(`${이름}?.${i[1]}`);
    }
    return out;
};

describe('🚚 판정 재료는 나르기만 한다', () => {

    for (const fn of ['firstLoadFacts', 'mergeFacts']) {
        const 본문 = 함수(fn);
        const 칸들 = 받는칸(본문);

        it(`${fn} — 받는 칸이 있다 (읽기가 깨지지 않았다)`, () => {
            expect(칸들.length).toBeGreaterThan(3);
        });

        for (const 칸 of 칸들) {
            it(`🔴 ${fn} 이 «${칸}» 을 버리지 않는다`, () => {
                expect(본문).toMatch(new RegExp(`input\\.${칸.replace(/[?.]/g, m => '\\' + m)}\\b`));
            });
        }
    }

    /** 🔴 산술이 생기면 잘못 만든 것이다 — 파일 머리가 그렇게 적어 두었다 */
    it('🔴 재료를 담는 곳에서 다시 재지 않는다 — 재는 함수를 부르기만 한다', () => {
        for (const fn of ['firstLoadFacts', 'mergeFacts']) {
            expect(함수(fn)).not.toMatch(/haversineKm\(|destGainKm\(|Math\.(max|min|round)\(/);
        }
    });
});
