import { describe, it, expect } from 'vitest';
import { seatConclusion } from './seatConclusion';

/**
 * 🧾 **심사석의 결론 — 이 후보를 받으면 기존 콜이 어떻게 되나** (전수표 #43 #45 #46 #47 · 목업 «④ 후보콜에 대한 심사 결론»).
 *
 * 목업 기사님 2026-09-09: *"'기존 콜은 안 밀린다'가 아니고 모른다, 카카오가 값을 잘못 줬다 … 이렇게 표시하던가 해야 하는 거지"*
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

    it('🔴 늦으면 전화할 곳을 말한다 — 가장 늦는 정거장의 동 이름과 ☎️ (전수표 #42)', () => {
        const c = seatConclusion({ unknownWhy: null, stops: [
            stop({ name: '노선첫짐 하차', place: '중리동', lateMin: 12 }),
            stop({ name: '노선합짐1 상차', place: '곤지암읍', stopType: 'pickup', lateMin: 3 }),
        ] });
        expect(c?.text).toMatch(/중리동/);
        expect(c?.text).toMatch(/☎️/);
        expect(c?.worst?.place).toBe('중리동');
    });

    it('첫짐 심사(기존 콜 없음)는 결론이 없다 — 말할 것이 없으면 줄을 안 만든다', () => {
        expect(seatConclusion({ unknownWhy: null, stops: [] })).toBeNull();
        expect(seatConclusion(undefined)).toBeNull();
    });
});
