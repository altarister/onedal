import { describe, it, expect } from 'vitest';
import { seatConclusion } from './seatConclusion';

/**
 * 🧾 **심사석의 결론 — 이 후보를 받으면 기존 콜이 어떻게 되나**.
 *
 * 기사님: *"'기존 콜은 안 밀린다'가 아니고 모른다, 카카오가 값을 잘못 줬다 … 이렇게 표시하던가 해야 하는 거지"*
 * 기사님은 색만 보고 1~2초에 누르신다 — 모르는 것을 초록(«안 밀린다»)으로 칠하는 것이 가장 큰 사고다.
 */
const stop = (over: Partial<{ name: string; place: string; stopType: 'pickup' | 'dropoff'; promisedAt: string | null; etaAt: string | null; lateMin: number | null; confirmed: boolean; arrived: boolean }> = {}) => ({
    name: '노선첫짐 하차', stopType: 'dropoff' as const, promisedAt: '2026-09-14T06:30:00.000Z', etaAt: '2026-09-14T06:20:00.000Z',
    lateMin: -10, confirmed: false, arrived: false, ...over,
});

describe('🧾 심사석 결론', () => {
    it('🔴 못 잰 까닭이 있으면 «모른다» — 정거장이 멀쩡해 보여도 «안 밀린다»고 하지 않는다', () => {
        const c = seatConclusion({ unknownWhy: '못 잰 구간이 있다', stops: [stop()] });
        expect(c?.kind).toBe('unknown');
        expect(c?.text).toMatch(/모른다/);
        expect(c?.text).toMatch(/못 잰 구간이 있다/);
    });

    it('🔴 늦는 정거장이 있으면 가장 늦는 하나를 이름과 분으로', () => {
        const c = seatConclusion({ unknownWhy: null, stops: [
            stop({ name: '노선첫짐 상차', stopType: 'pickup', lateMin: 5 }),
            stop({ name: '노선첫짐 하차', lateMin: 12 }),
        ] });
        expect(c?.kind).toBe('late');
        expect(c?.text).toMatch(/노선첫짐 하차/);
        expect(c?.text).toMatch(/12분 늦어진다/);
    });

    it('지난 정거장은 안 센다 — 이미 지났으면 밀릴 것이 없다', () => {
        const c = seatConclusion({ unknownWhy: null, stops: [stop({ lateMin: 30, arrived: true }), stop({ lateMin: -3 })] });
        expect(c?.kind).toBe('ok');
    });

    it('늦는 곳이 없으면 «안 밀린다»', () => {
        expect(seatConclusion({ unknownWhy: null, stops: [stop({ lateMin: 0 }), stop({ lateMin: -8 })] })?.text).toMatch(/안 밀린다/);
    });

    it('🔴 정거장의 예정을 모르면(lateMin null) «모른다» — 한 곳이라도', () => {
        expect(seatConclusion({ unknownWhy: null, stops: [stop({ lateMin: null, etaAt: null }), stop({ lateMin: -8 })] })?.kind).toBe('unknown');
    });

    /**
     * 🔴 **«전화할 곳»은 동 이름이다** (전수표 #42) — 어디에 거는 전화인지가 이 줄의 일이다.
     *
     * 🔴 **«☎️ 전화»라는 글자는 이 줄에 없다** — 그 **행동**은 시급 바로 아래 줄
     *    (`lib/verdict.ts` 의 `action` — 「☎️ 전화하면 잡습니다」)이 더 큰 글자로 말한다.
     *    🟡 는 «잡아 둔 콜이 있다»가 전제라 두 줄이 **늘 함께** 뜬다 — `lateMin` 과 「약속」 축의
     *    `bufferAfterMin` 이 같은 배열에서 나오기 때문이다 (`OrderEvaluator.ts`).
     *    둘이 같은 말을 하면 1~2초에 읽는 화면에서 그게 곧 노이즈다.
     *    #42 가 정한 «어디에»와 «얼마나»는 그대로 지켜진다 — 아래 둘이 그것을 잠근다.
     */
    it('🔴 늦으면 전화할 곳을 말한다 — 가장 늦는 정거장의 동 이름 (전수표 #42)', () => {
        const c = seatConclusion({ unknownWhy: null, stops: [
            stop({ name: '노선첫짐 하차', place: '중리동', lateMin: 12 }),
            stop({ name: '노선합짐1 상차', place: '곤지암읍', stopType: 'pickup', lateMin: 3 }),
        ] });
        expect(c?.text).toMatch(/중리동/);
        expect(c?.text).toMatch(/12분/);              // 얼마나 늦나
        expect(c?.worst?.place).toBe('중리동');
    });

    it('첫짐 심사(기존 콜 없음)는 결론이 없다 — 말할 것이 없으면 줄을 안 만든다', () => {
        expect(seatConclusion({ unknownWhy: null, stops: [] })).toBeNull();
        expect(seatConclusion(undefined)).toBeNull();
    });
});
