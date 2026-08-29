import { describe, it, expect } from 'vitest';
import { verdictOf } from './verdict';

/**
 * 🎨 **색은 값으로 온다 — 문장을 뒤져서 정하지 않는다** (2026-08-29 · 4단계)
 *
 * ── 무엇이 문제였나 ──
 *
 * 서버가 판정을 **문장 하나**로 만들어 보내고, 화면이 그 문장 안에 `'꿀'` 이라는
 * **글자가 들어 있는지 뒤져서** 색을 정했다.
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
 * 🔴 **어이없는 것은 서버가 색을 이미 값으로 보내고 있었다는 점이다.**
 *    화면도 그 값을 쓴다 — 사유 문장은 `judgment.gates` 에서 꺼내 쓴다.
 *    **정작 색만** 문장 뒤지기로 정했다.
 *
 * ── 어떻게 고치나 ──
 *
 * 값이 있으면 값을 쓰고, **없으면 지금처럼 글자를 찾는다.** 옛 서버·재시작 직후처럼
 * 값이 안 오는 경우가 있을 수 있어 한 번에 갈아치우지 않는다 (규칙 ②: 겹쳐 둔다).
 */

const 문구 = (s: string) => ({ kakaoTimeExt: s });
const 값 = (color: string, over: any = {}) =>
    ({ kakaoTimeExt: `'${color}' 어쩌고 저쩌고`, judgment: { color, score: 80, axes: [], gates: [], tags: [], ...over } });

describe('🎨 색은 값에서 온다', () => {
    it('값이 오면 값을 쓴다', () => {
        expect(verdictOf(값('꿀') as any).color).toBe('꿀');
        expect(verdictOf(값('똥') as any).color).toBe('똥');
        expect(verdictOf(값('보통') as any).color).toBe('보통');
    });

    /** 🔴 이게 이 고침의 핵심 — 문장이 뭐라 하든 값이 이긴다 */
    it('🔴 문장과 값이 다르면 **값이 이긴다**', () => {
        const 어긋남 = { kakaoTimeExt: "'똥' 이라고 적혀 있지만", judgment: { color: '꿀', score: 90, axes: [], gates: [], tags: [] } };
        expect(verdictOf(어긋남 as any).color).toBe('꿀');
        expect(verdictOf(어긋남 as any).source).toBe('값');
    });

    /** 🔴 문구를 다듬으면 색이 바뀌던 그 상황 — 값이 있으면 안 흔들린다 */
    it('🔴 따옴표를 빼도 색이 안 바뀐다 — 예전엔 「보통」으로 떨어졌다', () => {
        const 다듬은문구 = { kakaoTimeExt: '꿀콜입니다 총 87분', judgment: { color: '꿀', score: 83, axes: [], gates: [], tags: [] } };
        expect(verdictOf(다듬은문구 as any).color).toBe('꿀');
    });

    /**
     * 🔴 **실제로 나던 일** (2026-08-29 코드로 확인).
     *
     * 최초 심사는 `'꿀'`(따옴표)로 적는데, **재탐색**(맵뷰의 추천/최단시간/최단거리 버튼)은
     * 같은 색을 `🍯 (꿀)`(괄호)로 적는다 — `dispatchEngine.ts` 의 `recommend`.
     * 문장 뒤지기는 따옴표만 찾으므로 **재탐색을 누른 순간 꿀콜이 「보통」 초록으로 떨어졌다.**
     * 🚨 `(사고)` 도 마찬가지 — **잡으면 사고인 콜이 초록**으로 보였다.
     */
    it('🔴 재탐색이 쓰는 「🍯 (꿀)」 모양에서도 색이 안 흔들린다', () => {
        const 재탐색 = { kakaoTimeExt: '[최단시간] +3.2km, +12분 🍯 (꿀) ',
                       judgment: { color: '꿀', score: 83, axes: [], gates: [], tags: [] } };
        expect(verdictOf(재탐색 as any).color).toBe('꿀');
        // 값이 없던 예전에는 이 문구가 「보통」으로 떨어졌다 — 그게 이 고침의 이유다
        expect(verdictOf({ kakaoTimeExt: 재탐색.kakaoTimeExt } as any).color).toBe('보통');
    });

    it('사유에 「똥」이 섞여도 꿀은 꿀이다', () => {
        const 섞임 = { kakaoTimeExt: "'꿀' — 앞 콜이 '똥' 이라 뺐습니다", judgment: { color: '꿀', score: 85, axes: [], gates: [], tags: [] } };
        expect(verdictOf(섞임 as any).color).toBe('꿀');
    });
});

describe('🔴 두 가지 빨강을 가른다 — 딱지가 가른다 (3단계에서 깔아 둔 것)', () => {
    it('조건이 깨진 것은 「잡으면 사고」', () => {
        const v = verdictOf(값('사고', { gates: [{ key: 'routePromiseGuard', name: '약속 보존', pass: false, why: '7분 깨집니다' }] }) as any);
        expect(v.color).toBe('사고');
        expect(v.title).toBe('잡으면 사고');
        expect(v.reason).toContain('7분 깨집니다');
    });

    it('못 잰 것은 「판단 불가」 — 나쁘다는 뜻이 아니다', () => {
        const v = verdictOf(값('사고', { tags: ['잴 수 없음 — 재료가 없어 점수를 못 냅니다'] }) as any);
        expect(v.color).toBe('사고');
        expect(v.title).toBe('판단 불가');
        expect(v.reason).toContain('못');
    });
});

describe('값이 없으면 예전처럼 문장을 뒤진다 (겹쳐 둔다 · 규칙 ②)', () => {
    it("'꿀' · '똥' · '사고' 를 그대로 읽는다", () => {
        expect(verdictOf(문구("'꿀' 총 87분") as any).color).toBe('꿀');
        expect(verdictOf(문구("'똥' 총 87분") as any).color).toBe('똥');
        expect(verdictOf(문구("'사고' 총 87분") as any).color).toBe('사고');
        expect(verdictOf(문구("'보통' 총 87분") as any).source).toBe('문장');
    });

    it('카카오가 터졌으면 판단 불가다', () => {
        const v = verdictOf(문구('카카오 연산 실패: timeout') as any);
        expect(v.color).toBe('사고');
        expect(v.title).toBe('판단 불가');
    });

    it('아직 연산 전이면 색을 만들지 않는다', () => {
        expect(verdictOf({} as any).color).toBe(null);
    });
});
