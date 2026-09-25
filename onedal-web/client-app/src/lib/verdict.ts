import type { SecuredOrder } from '@onedal/shared';

/**
 * 🎨 **색을 정하는 곳은 여기 하나다** — 서버가 값으로 보낸 색(`order.judgment.color`)을 쓴다.
 *
 * 판정 **문장**에 `'꿀'` 이라는 글자가 들어 있는지 **뒤져서** 색을 정하면, 문구를 다듬을 때
 * 색이 조용히 바뀐다 — 따옴표를 빼면 꿀콜이 「보통」이 되고, 사유에 `'똥'` 이 섞이면 꿀콜이
 * 노랑이 된다. 터지지도, 검사에 걸리지도 않는다. **색이 곧 기사님의 결정이다** (규칙 ⑤-3).
 *
 * 🔴 **문장 읽기는 값이 안 올 때의 폴백으로 겹쳐 둔다** (규칙 ②: 안전장치는 겹쳐 둔다).
 *    `source` 로 어느 쪽인지 알 수 있으니, 늘 「값」이면 그때 문장 읽기를 지운다.
 */
export type VerdictColor = '꿀' | '보통' | '똥' | '사고';

export interface Verdict {
    /** 아직 연산 전이면 `null` — 색을 지어내지 않는다 */
    color: VerdictColor | null;
    /** 버튼에 적을 짧은 말 */
    title: string;
    /**
     * 왜 그 색인지 — **잡은 뒤 카드**(`PinnedRouteCard`)의 큰 글자이고, 심사석에서는 시급을
     * 못 쟀을 때만 나온다. 🔴 **이미 잡은 콜에게 하는 말이다** — 「잡지 마세요」는 그대로 뜻이
     * 통하지만(취소할 수 있다) 🟡 의 「전화하면 **잡습니다**」는 틀린 말이 된다. 그래서 갈랐다.
     */
    reason: string;
    /**
     * 🎬 **기사님이 지금 할 일** — 심사석이 시급 바로 아래에 적는다. **잡기 전**의 말이다.
     *
     * 색은 «무엇을 해야 하나»를 말하는데(판정 1단계), 색만으로는 1~2초에 안 읽힌다.
     * 이 문장이 이미 `reason` 에 있었는데 **화면에 안 닿고 있었다** — 심사석은 시급을
     * 못 쟀을 때만 `reason` 을 그렸다. 그래서 따로 내보내 늘 그리게 한다.
     *
     * 🔴 **🔵🟢 에는 없다** (`undefined`) — 색이 이미 «그냥 잡는다»를 말했고,
     *    그것을 글로 한 번 더 적으면 정보가 0 인 줄이 화면을 한 칸 먹는다.
     * 🔴 **「판단 불가」에도 없다** — 무엇을 해야 하는지 우리가 모른다. 지어내지 않는다 (규칙 ④).
     *    ⚠️ 잡은 뒤에도 그때 무엇을 해야 하는지는 **아직 아무 데도 없다** — 찾을 자리로 남겨 둔다.
     */
    action?: string;
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

/**
 * 🔴 **«잡지 마세요»는 두 화면에서 같은 뜻이다** — 잡기 전이면 «누르지 마세요», 잡은 뒤면
 *    «취소하세요»로 읽힌다. 그래서 한 상수에서 `reason`·`action` 둘을 만든다 (규칙 ③) —
 *    따로 적으면 한쪽만 고쳐져 화면 두 자리가 다른 말을 한다.
 */
const STOP = '🔴 잡지 마세요';
/**
 * ☎️ **노란색은 «전화하면 잡는다» 하나만 뜻한다** (판정 1단계 · 기사님 확정).
 *
 * 🔴 **두 화면이 다른 말을 해야 한다** — 잡기 전에는 «고를 수 있다»(잡습니다)이고,
 *    잡은 뒤에는 이미 잡았으니 «할 일»만 남는다. 한 낱말로 두면 잡은 뒤 카드가 틀린 말을 한다.
 * 🔴 **누구에게 거는 전화인지는 여기서 말하지 않는다** — 그 대상(가장 늦는 정거장)은
 *    심사석 넷째 줄(`lib/seatConclusion.ts`)이 적는다. 두 곳이 적으면 한쪽이 틀린다.
 */
const CALL_BEFORE = '☎️ 전화하면 잡습니다';
const CALL_AFTER = '☎️ 전화해서 약속을 미루세요';

export function verdictOf(order: Judged): Verdict {
    const j = order.judgment;

    if (j?.color) {
        /**
         * 🔴 **빨강은 두 뜻이다** — 「잡으면 사고」와 「못 쟀다」.
         *    색으로는 못 가르지만 **딱지(「잴 수 없음」)와 조건으로 가른다**.
         *    🔴 못 쟀다는 것은 **나쁘다는 뜻이 아니다** (규칙 ⑤).
         */
        if (j.color === '사고') {
            const broken = brokenGates(j);
            if (broken.length) return { color: '사고', title: '잡으면 사고', reason: `${STOP} — ${broken.join(' · ')}`, action: STOP, source: '값' };
            /* 🔴 못 쟀으면 행동을 지어내지 않는다 — 무엇을 해야 하는지 우리가 모른다 (규칙 ④) */
            if (isUnmeasurable(j)) return { color: '사고', title: '판단 불가', reason: '🔴 재료가 없어 점수를 못 냈습니다 — 나쁘다는 뜻이 아닙니다', source: '값' };
            return { color: '사고', title: '잡으면 사고', reason: `${STOP} — 조건 위반`, action: STOP, source: '값' };
        }
        if (j.color === '꿀') return { color: '꿀', title: '유지 확정', reason: '🍯 꿀콜', source: '값' };
        if (j.color === '똥') return { color: '똥', title: '유지 확정', reason: CALL_AFTER, action: CALL_BEFORE, source: '값' };
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
