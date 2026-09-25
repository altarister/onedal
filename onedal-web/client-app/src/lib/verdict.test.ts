import { describe, it, expect } from 'vitest';
import { verdictOf } from './verdict';

/**
 * 🎨 **색은 값으로 온다 — 문장을 뒤져서 정하지 않는다**
 *
 * 화면은 서버가 값으로 보낸 색(`judgment.color`)을 쓴다 — 사유 문장이 `judgment.gates` 에서 오는 것과 같다.
 * 판정 **문장** 안에 `'꿀'` 이라는 **글자가 들어 있는지 뒤져서** 색을 정하면
 *
 * ```
 * 서버:  "'꿀' 🍯 [추천] 총 87분 · 3.5만/h …"
 * 화면:  문장에 "'꿀'" 이 있나? → 파랑
 * ```
 *
 * 🔴 **문구를 다듬으면 색이 조용히 바뀐다.** 따옴표를 빼면 꿀콜이 「보통」이 되고,
 *    사유 문장에 `'똥'` 이 우연히 섞이면 꿀콜이 노란색이 된다. 터지지도, 검사에
 *    걸리지도 않는다 — **화면만 조용히 틀린 색을 낸다.**
 *    색이 곧 기사님의 결정이다 (규칙 ⑤-3).
 *
 * 값이 있으면 값을 쓰고, **없으면 문장에서 글자를 찾는다** — 서버 재시작 직후처럼 값이 안 오는 경우가 있어
 * 문장 읽기를 폴백으로 겹쳐 둔다 (규칙 ②: 겹쳐 둔다).
 */

const phraseOf = (s: string) => ({ kakaoTimeExt: s });
const valueOf_ = (color: string, over: any = {}) =>
    ({ kakaoTimeExt: `'${color}' 어쩌고 저쩌고`, judgment: { color, score: 80, axes: [], gates: [], tags: [], ...over } });

describe('🎨 색은 값에서 온다', () => {
    it('값이 오면 값을 쓴다', () => {
        expect(verdictOf(valueOf_('꿀') as any).color).toBe('꿀');
        expect(verdictOf(valueOf_('똥') as any).color).toBe('똥');
        expect(verdictOf(valueOf_('보통') as any).color).toBe('보통');
    });

    /** 🔴 핵심 — 문장이 뭐라 하든 값이 이긴다 */
    it('🔴 문장과 값이 다르면 **값이 이긴다**', () => {
        const mismatch = { kakaoTimeExt: "'똥' 이라고 적혀 있지만", judgment: { color: '꿀', score: 90, axes: [], gates: [], tags: [] } };
        expect(verdictOf(mismatch as any).color).toBe('꿀');
        expect(verdictOf(mismatch as any).source).toBe('값');
    });

    /** 🔴 문구를 다듬어도 값이 있으면 색이 안 흔들린다 */
    it('🔴 따옴표를 빼도 색이 안 바뀐다 — 예전엔 「보통」으로 떨어졌다', () => {
        const trimmedPhrase = { kakaoTimeExt: '꿀콜입니다 총 87분', judgment: { color: '꿀', score: 83, axes: [], gates: [], tags: [] } };
        expect(verdictOf(trimmedPhrase as any).color).toBe('꿀');
    });

    /**
     * 🔴 **최초 심사와 재탐색은 같은 색을 다른 모양으로 적는다** (코드로 확인).
     *
     * 최초 심사는 `'꿀'`(따옴표)로 적는데, **재탐색**(맵뷰의 추천/최단시간/최단거리 버튼)은
     * 같은 색을 `🍯 (꿀)`(괄호)로 적는다 — `dispatchEngine.ts` 의 `recommend`.
     * 문장 뒤지기는 따옴표만 찾으므로 값이 없으면 **재탐색을 누른 순간 꿀콜이 「보통」 초록으로 떨어진다.**
     * 🚨 `(사고)` 도 마찬가지 — **잡으면 사고인 콜이 초록**으로 보인다.
     */
    it('🔴 재탐색이 쓰는 「🍯 (꿀)」 모양에서도 색이 안 흔들린다', () => {
        const researched = { kakaoTimeExt: '[최단시간] +3.2km, +12분 🍯 (꿀) ',
                       judgment: { color: '꿀', score: 83, axes: [], gates: [], tags: [] } };
        expect(verdictOf(researched as any).color).toBe('꿀');
        // 값이 없으면 이 문구는 「보통」으로 떨어진다 — 그래서 값을 먼저 쓴다
        expect(verdictOf({ kakaoTimeExt: researched.kakaoTimeExt } as any).color).toBe('보통');
    });

    it('사유에 「똥」이 섞여도 꿀은 꿀이다', () => {
        const mixed = { kakaoTimeExt: "'꿀' — 앞 콜이 '똥' 이라 뺐습니다", judgment: { color: '꿀', score: 85, axes: [], gates: [], tags: [] } };
        expect(verdictOf(mixed as any).color).toBe('꿀');
    });
});

describe('🔴 두 가지 빨강을 가른다 — 딱지가 가른다 (3단계에서 깔아 둔 것)', () => {
    it('조건이 깨진 것은 「잡으면 사고」', () => {
        const v = verdictOf(valueOf_('사고', { gates: [{ key: 'routePromiseGuard', name: '약속 보존', pass: false, why: '7분 깨집니다' }] }) as any);
        expect(v.color).toBe('사고');
        expect(v.title).toBe('잡으면 사고');
        expect(v.reason).toContain('7분 깨집니다');
    });

    it('못 잰 것은 「판단 불가」 — 나쁘다는 뜻이 아니다', () => {
        const v = verdictOf(valueOf_('사고', { tags: ['잴 수 없음 — 재료가 없어 점수를 못 냅니다'] }) as any);
        expect(v.color).toBe('사고');
        expect(v.title).toBe('판단 불가');
        expect(v.reason).toContain('못');
    });
});

/**
 * 🎬 **화면이 «지금 할 일»을 글로 적는다** (판정 4단계)
 *
 * ── 왜 생겼나 ──
 * 그 문장은 **이미 만들어져 있었는데 화면에 안 닿고 있었다.** 심사석(`JudgmentSeat.tsx`)이
 * 시급을 못 쟀을 때만 `reason` 을 그려서, 시급이 있는 🔴 콜은 「잡지 마세요」가 사라졌다.
 * 새 문구를 만드는 것이 아니라 **있는 것을 잇는 일**이다.
 *
 * ── 두 화면이 다른 말을 한다 ──
 * `action` 은 심사석(**잡기 전**), `reason` 은 잡은 뒤 카드(`PinnedRouteCard`)의 큰 글자다.
 * 🔴 는 두 화면에서 뜻이 같아(누르지 마세요 / 취소하세요) 한 상수를 나눠 쓰고,
 * 🟡 는 갈라야 한다 — 이미 잡은 콜에 「전화하면 **잡습니다**」는 틀린 말이다.
 *
 * 🔴 **🔵🟢 에는 없다** — 색이 이미 «그냥 잡는다»를 말했다. 글로 반복하면 정보가 0 이다.
 * 🔴 **첫짐 🟡 은 없다** — 「전화할 곳」·「약속」 두 축이 `hasExistingCalls` 로 먼저 막히고
 *    (`criteria.ts` 491·547줄), `nothing` 은 색 계산(`counted`)에 안 들어간다.
 *    그래서 이 줄이 첫짐에서 값을 내는 것은 **🔴** 일 때다 (등 뒤 상차 · 제외 키워드).
 *    첫짐에는 넷째 줄(`seatConclusion`)이 없어 이 줄이 **유일한 행동 문장**이다.
 */
describe('🎬 지금 할 일 — action', () => {
    it('🔴 문지기가 막았으면 「잡지 마세요」', () => {
        const v = verdictOf(valueOf_('사고', { gates: [{ key: 'g', name: '약속 보존', pass: false, why: '7분 깨집니다' }] }) as any);
        expect(v.action).toContain('잡지 마세요');
    });

    /** 🔴 까닭은 셋째 줄(`rejectionReasons`)이 이미 적는다 — 행동 줄은 행동만 */
    it('🔴 행동에는 까닭을 안 적는다', () => {
        const v = verdictOf(valueOf_('사고', { gates: [{ key: 'g', name: '약속 보존', pass: false, why: '7분 깨집니다' }] }) as any);
        expect(v.action).not.toContain('7분');
        expect(v.reason).toContain('7분');
    });

    /**
     * 🔴 **🔴 은 한 낱말을 둘이 나눠 쓴다** — 두 화면에서 뜻이 같다.
     *    따로 적으면 한쪽만 고쳐진다 (규칙 ③).
     */
    it('🔴 사고의 행동 문구가 까닭 문구의 앞머리와 같다', () => {
        const v = verdictOf(valueOf_('사고', { gates: [{ key: 'g', name: '약속 보존', pass: false, why: '7분' }] }) as any);
        expect(v.reason.startsWith(v.action!)).toBe(true);
    });

    it('🔴 노란색은 「전화하면 잡습니다」 — 옛말 「별로입니다」가 아니다', () => {
        const v = verdictOf(valueOf_('똥') as any);
        expect(v.action).toContain('전화하면 잡습니다');
        expect(v.action).not.toContain('별로');
        expect(v.reason).not.toContain('별로');
    });

    /**
     * 🔴 **🟡 은 두 화면이 다른 말을 한다** — 잡은 뒤 카드에 「잡습니다」는 틀린 말이다.
     *    둘 다 ☎️ 로 시작해 한쪽만 엉뚱하게 고쳐지는 것은 여전히 잡는다.
     */
    it('🔴 노란색의 잡은 뒤 문구는 「잡습니다」라 하지 않는다', () => {
        const v = verdictOf(valueOf_('똥') as any);
        expect(v.reason).not.toBe(v.action);
        expect(v.reason).not.toContain('잡습니다');
        expect(v.reason.startsWith('☎️')).toBe(true);
        expect(v.action!.startsWith('☎️')).toBe(true);
    });

    /** 🔴 대상을 두 곳에서 적지 않는다 — 어디에 거는 전화인지는 넷째 줄이 말한다 */
    it('🔴 행동에 전화 대상을 적지 않는다', () => {
        const v = verdictOf(valueOf_('똥') as any);
        expect(v.action).not.toMatch(/상차|하차|화주|기사/);
    });

    /** 🔴 색이 이미 한 말을 글로 반복하지 않는다 */
    it('🔴 꿀·보통에는 할 일이 없다', () => {
        expect(verdictOf(valueOf_('꿀') as any).action).toBeUndefined();
        expect(verdictOf(valueOf_('보통') as any).action).toBeUndefined();
    });

    /** 🔴 모르는 것에 행동을 지어내지 않는다 (규칙 ④) */
    it('🔴 판단 불가에는 할 일이 없다 — 무엇을 해야 하는지 우리가 모른다', () => {
        const v = verdictOf(valueOf_('사고', { tags: ['잴 수 없음 — 재료가 없어 점수를 못 냅니다'] }) as any);
        expect(v.action).toBeUndefined();
    });

    it('판정 전에는 할 일도 없다', () => {
        expect(verdictOf({}).action).toBeUndefined();
    });
});

describe('값이 없으면 예전처럼 문장을 뒤진다 (겹쳐 둔다 · 규칙 ②)', () => {
    it("'꿀' · '똥' · '사고' 를 그대로 읽는다", () => {
        expect(verdictOf(phraseOf("'꿀' 총 87분") as any).color).toBe('꿀');
        expect(verdictOf(phraseOf("'똥' 총 87분") as any).color).toBe('똥');
        expect(verdictOf(phraseOf("'사고' 총 87분") as any).color).toBe('사고');
        expect(verdictOf(phraseOf("'보통' 총 87분") as any).source).toBe('문장');
    });

    it('카카오가 터졌으면 판단 불가다', () => {
        const v = verdictOf(phraseOf('카카오 연산 실패: timeout') as any);
        expect(v.color).toBe('사고');
        expect(v.title).toBe('판단 불가');
    });

    it('아직 연산 전이면 색을 만들지 않는다', () => {
        expect(verdictOf({} as any).color).toBe(null);
    });
});
