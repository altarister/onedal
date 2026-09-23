import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧾 **결재를 보내는 자리는 전부 흔적을 남긴다** (기사님 · 실주행에서 잡힘)
 *
 * ── 왜 ──
 *
 * 기사님이 누르지 않은 취소가 나갔는데 **어느 버튼에서 왔는지 아무도 몰랐다**.
 * 서버 로그에는 이렇게만 남는다:
 *
 * ```
 * ⚖️ [소켓 Decision] … Status Action: SAFE_CANCEL
 *    "관제탑으로 부터 수동 취소/방출(SAFE_CANCEL) 요청 받음"
 *    📈 기기 취소 카운트 +1
 * ```
 *
 * 서버는 «관제탑에서 왔다»까지만 안다 — **누가 눌렀는지는 보내는 쪽만** 안다.
 * `PinnedRouteCard` 의 버튼들은 클릭을 적고 있었는데 `JudgmentSeat` 의 결재 버튼은 안 적어서,
 * 취소 한도가 한 칸 깎였는데도 원인을 못 가렸다. **취소 한도는 되돌릴 수 없다.**
 *
 * 🔴 **화면을 안 바꾸는 고침이다** — 로그 한 줄이라 기사님 화면에는 아무 변화가 없다.
 * 🔴 **새 버튼을 만들면 이 검사가 문다** — 결재를 보내면서 흔적을 안 남기면 빨간불.
 */

const SRC = join(__dirname, '../..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** 주석을 걷어낸 코드 글자만 — 주석 속 낱말이 «있다»로 세어지지 않게 */
const codeOnly = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * 🔍 **결재를 쏘는 한 줄마다 그 앞에 로그가 붙었나** — `onDecision(…)` 을 부르는 자리를 찾아
 *    같은 `onClick` 안에 `logRoadmapEvent` 가 있는지 본다.
 */
function decisionCallsWithoutLog(src: string): string[] {
    const code = codeOnly(src);
    const out: string[] = [];
    /* onClick={...} 한 덩어리씩 — 중괄호가 아니라 «onClick=» 사이로 자른다 (중첩을 안 세도 된다) */
    const chunks = code.split(/onClick=/).slice(1);
    for (const chunk of chunks) {
        const head = chunk.slice(0, chunk.indexOf('}}') + 2 || 400);
        if (!/onDecision\??\.?\(/.test(head)) continue;
        if (!/logRoadmapEvent\(/.test(head)) out.push(head.replace(/\s+/g, ' ').slice(0, 90));
    }
    return out;
}

describe('🧾 결재 버튼은 어느 버튼인지 로그를 남긴다', () => {

    /** 🔴 이 검사가 생긴 까닭 — 누르지 않은 취소가 나갔는데 어느 버튼인지 못 가렸다 */
    it('🔴 심사석의 결재 자리가 전부 흔적을 남긴다', () => {
        expect(decisionCallsWithoutLog(read('components/dashboard/JudgmentSeat.tsx'))).toEqual([]);
    });

    it('🔴 콜 카드의 결재 자리도 전부 남긴다', () => {
        expect(decisionCallsWithoutLog(read('components/dashboard/PinnedRouteCard.tsx'))).toEqual([]);
    });

    it('심사석이 거절·KEEP 을 가려 적는다 — 둘이 같은 말이면 못 가린다', () => {
        const src = read('components/dashboard/JudgmentSeat.tsx');
        expect(src).toContain('심사석 — 거절(왼쪽) 버튼 클릭');
        expect(src).toContain('심사석 — KEEP(오른쪽) 버튼 클릭');
    });

    /** 🔴 미리보기는 취소 한도를 안 깎지만, «카드를 눌러 치웠다»도 흔적이 있어야 한다 */
    it('미리보기 «눌러서 치우기»도 남긴다', () => {
        expect(read('components/dashboard/JudgmentSeat.tsx')).toContain('미리보기 카드를 눌러 치움');
    });
});
