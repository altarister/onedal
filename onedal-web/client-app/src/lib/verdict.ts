import type { SecuredOrder } from '@onedal/shared';

/**
 * 🎨 **색을 정하는 곳은 여기 하나다** (2026-08-29 · 4단계)
 *
 * 예전에는 서버가 판정을 **문장**으로 보내고 화면이 그 문장에 `'꿀'` 이라는 글자가
 * 들어 있는지 **뒤져서** 색을 정했다. 문구를 다듬으면 색이 조용히 바뀌었다 —
 * 따옴표를 빼면 꿀콜이 「보통」이 되고, 사유에 `'똥'` 이 섞이면 꿀콜이 노랑이 됐다.
 * 터지지도, 검사에 걸리지도 않는다. **색이 곧 기사님의 결정이다** (규칙 ⑤-3).
 *
 * 서버는 색을 **이미 값으로** 보내고 있었다(`order.judgment.color`). 화면도 그 값을
 * 쓰고 있었다 — 사유 문장은 `judgment.gates` 에서 꺼내 썼다. **정작 색만** 문장
 * 뒤지기였다.
 *
 * 🔴 **한 번에 갈아치우지 않는다** (규칙 ②: 안전장치는 겹쳐 둔다).
 *    값이 있으면 값을, 없으면 예전처럼 문장을 읽는다. `source` 로 어느 쪽인지 알 수
 *    있으니, 며칠 돌려 늘 「값」이면 그때 문장 읽기를 지운다.
 */
export type VerdictColor = '꿀' | '보통' | '똥' | '사고';

export interface Verdict {
    /** 아직 연산 전이면 `null` — 색을 지어내지 않는다 */
    color: VerdictColor | null;
    /** 버튼에 적을 짧은 말 */
    title: string;
    /** 왜 그 색인지 — 화면에 함께 적는다 */
    reason: string;
    /** 어디서 왔나 — 「값」이 정상, 「문장」은 옛 경로 */
    source: '값' | '문장' | '없음';
}

/** 판정에 필요한 것만 — 콜 전체를 요구하지 않는다 (검사가 쉬워진다) */
type Judgment = NonNullable<SecuredOrder['judgment']>;
type Judged = { kakaoTimeExt?: string; judgment?: Judgment };

const brokenGates = (j: Judgment) =>
    (j.gates ?? []).filter(g => !g.pass).map(g => g.why ?? g.name);

const isUnmeasurable = (j: Judgment) =>
    (j.tags ?? []).some(t => t.startsWith('잴 수 없음'));

export function verdictOf(order: Judged): Verdict {
    const j = order.judgment;

    if (j?.color) {
        /**
         * 🔴 **빨강은 두 뜻이다** — 「잡으면 사고」와 「못 쟀다」. 이미 아는 숙제다
         *    (docs/지금/판정.md §7). 색으로는 못 가르지만 **딱지와 조건으로 가른다** —
         *    3단계에서 「잴 수 없음」 딱지를 깔아 둔 것이 여기서 쓰인다.
         *    🔴 못 쟀다는 것은 **나쁘다는 뜻이 아니다** (규칙 ⑤).
         */
        if (j.color === '사고') {
            const broken = brokenGates(j);
            if (broken.length) return { color: '사고', title: '잡으면 사고', reason: `🔴 잡지 마세요 — ${broken.join(' · ')}`, source: '값' };
            if (isUnmeasurable(j)) return { color: '사고', title: '판단 불가', reason: '🔴 재료가 없어 점수를 못 냈습니다 — 나쁘다는 뜻이 아닙니다', source: '값' };
            return { color: '사고', title: '잡으면 사고', reason: '🔴 잡지 마세요 — 조건 위반', source: '값' };
        }
        if (j.color === '꿀') return { color: '꿀', title: '유지 확정', reason: '🍯 꿀콜', source: '값' };
        if (j.color === '똥') return { color: '똥', title: '유지 확정', reason: '💩 별로입니다', source: '값' };
        return { color: '보통', title: '유지 확정', reason: '보통', source: '값' };
    }

    // ── 여기부터는 옛 경로다. 값이 안 올 때만 쓴다 — 언젠가 지울 자리 ──
    const t = order.kakaoTimeExt;
    if (!t) return { color: null, title: '유지 확정', reason: '', source: '없음' };

    if (t.includes('실패') || t.includes('에러'))
        return { color: '사고', title: '판단 불가', reason: '🔴 잡지 마세요 — 경로·요율을 계산하지 못했습니다', source: '문장' };
    if (t.includes("'사고'"))
        return { color: '사고', title: '잡으면 사고', reason: '🔴 잡지 마세요 — 조건 위반', source: '문장' };
    if (t.includes("'꿀'")) return { color: '꿀', title: '유지 확정', reason: '🍯 꿀콜', source: '문장' };
    if (t.includes("'똥'")) return { color: '똥', title: '유지 확정', reason: '💩 별로입니다', source: '문장' };
    return { color: '보통', title: '유지 확정', reason: '보통', source: '문장' };
}

/** 색 → 버튼 칠. 색과 칠을 한 곳에서 짝지어 둔다 (두 벌이 되지 않게 · 규칙 ③) */
export const BUTTON_BG: Record<VerdictColor | '없음', string> = {
    '꿀': 'bg-info hover:bg-info/80 shadow-[0_0_15px_var(--theme-glow-primary)]',
    '보통': 'bg-success hover:bg-success/80',
    '똥': 'bg-warning hover:bg-warning/80 shadow-[0_0_15px_var(--theme-glow-warning)]',
    '사고': 'bg-danger hover:bg-danger/80 shadow-[0_0_15px_var(--theme-glow-warning)]',
    '없음': 'bg-success hover:bg-success/80',
};
