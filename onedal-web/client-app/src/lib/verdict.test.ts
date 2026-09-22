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
