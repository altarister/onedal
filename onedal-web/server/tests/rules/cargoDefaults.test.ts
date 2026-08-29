import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CARGO_TAG, DEFAULT_PROTECTIONS, DEFAULT_AFTERWORKS } from '@onedal/shared';

/**
 * 📦 **미리 눌러 두는 기본값은 한 곳에서만 만든다** (규칙 ③ · 2026-08-29)
 *
 * 통화 전에 화면이 **미리 눌러 두는** 값 셋 — 🔒 결박 · 🧹 정리 · 🏷️ 일반화물.
 * 기사님 확정: *"미리 눌러 두고 내가 틀린 것만 고친다."*
 *
 * ── 왜 검사가 필요한가 ──
 *
 * 이 셋이 **두 벌**이었다. `shared` 에 상수가 있는데 서버 시딩(`stepSeeder`)이
 * **글자를 손으로 다시 적고** 있었다:
 *
 * ```
 * shared   DEFAULT_CARGO_TAG = '일반화물'
 * 서버      … ?? ['일반화물']            ← 같은 글자를 또 적었다
 * ```
 *
 * 🔴 **리허설로는 이걸 못 잡는다.** 지금은 두 벌이 **같은 값**이라 화면이 똑같이 나온다.
 *    사고는 **한쪽만 고치는 날** 난다 — 이 레포가 겪은 「두 목소리」 사고 전부가 그 모양이었다
 *    (경유 4벌 · 상태목록 3벌 · 시별칭 · 설정=파주/필터=용인).
 *    그래서 재현이 아니라 **구조를 잠그는** 검사를 둔다.
 *
 * ⚠️ 이 검사는 **글자를 본다.** 값이 아니라 «상수를 쓰는가»를 보는 것이라 그렇다.
 */

const 시딩 = readFileSync(join(__dirname, '../../src/services/stepSeeder.ts'), 'utf8');
/** 주석 속 예시는 세지 않는다 — 역사 서술일 수 있다 */
const 코드만 = 시딩.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('📦 미리 눌러 두는 기본값 — 원천은 shared 하나다', () => {
    it('🔴 시딩이 「일반화물」을 손으로 적지 않는다', () => {
        expect(코드만).not.toMatch(/\['일반화물'\]/);
        expect(코드만).toMatch(/DEFAULT_CARGO_TAG/);
    });

    it('🔴 시딩이 「결박」을 손으로 적지 않는다', () => {
        expect(코드만).not.toMatch(/\['결박'\]/);
        expect(코드만).toMatch(/DEFAULT_PROTECTIONS/);
    });

    it('🔴 시딩이 「정리」를 손으로 적지 않는다', () => {
        expect(코드만).not.toMatch(/\['정리'\]/);
        expect(코드만).toMatch(/DEFAULT_AFTERWORKS/);
    });

    /** 값 자체는 기사님이 정한 것 — 바뀌면 이 줄이 알려 준다 */
    it('지금 기본값은 결박 · 정리 · 일반화물이다', () => {
        expect(DEFAULT_CARGO_TAG).toBe('일반화물');
        expect(DEFAULT_PROTECTIONS).toEqual(['결박']);
        expect(DEFAULT_AFTERWORKS).toEqual(['정리']);
    });
});
