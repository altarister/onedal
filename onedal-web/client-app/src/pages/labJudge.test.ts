import { describe, it, expect } from 'vitest';
import { judge, CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import { buildLabFacts, lateAndBuffer } from './labJudge';

/**
 * 🎨 **실험실이 실물 엔진으로 색을 낸다** (기사님 2026-09-09).
 *
 * 🔴 여기서 잠그는 것은 «채점»이 아니라 **«사실을 옳게 옮겼는가»** 다.
 *    채점은 실물(`judge` · `CRITERIA`)이 하고 그 검사는 서버 쪽에 이미 있다.
 */
const T = Date.UTC(2026, 8, 9, 0, 0, 0);
const at = (min: number) => T + min * 60000;

const base = {
    fare: 100_000, boxes: 1, driveMin: 60, dwellMin: 25,
    hasExistingCalls: false, stops: [], slotsUsed: 0, capacitySlots: 100,
};

describe('⏰ 늦음과 여유 — 한 값(약속 − 예정)에서 둘 다 나온다', () => {
    it('예정이 약속보다 늦으면 늦은 정거장으로, 분은 양수로 적는다', () => {
        const r = lateAndBuffer([{ label: '①하차', promisedAt: at(60), etaAt: at(75) }]);
        expect(r.lateStops).toEqual([{ label: '①하차', lateMinutes: 15 }]);
        expect(r.bufferAfterMin).toBe(-15);
    });

    it('여유는 **가장 빠듯한** 것이다 — 넉넉한 쪽이 가리면 안 된다', () => {
        const r = lateAndBuffer([
            { label: '①하차', promisedAt: at(120), etaAt: at(60) },   // +60
            { label: '②하차', promisedAt: at(100), etaAt: at(95) },   // +5  ← 이것이 답
        ]);
        expect(r.lateStops).toEqual([]);
        expect(r.bufferAfterMin).toBe(5);
    });

    it('🔴 못 잰 정거장은 안 센다 — 지어내지 않는다 (규칙 ④)', () => {
        const r = lateAndBuffer([
            { label: '①하차', promisedAt: null, etaAt: at(60) },
            { label: '②하차', promisedAt: at(100), etaAt: null },
        ]);
        expect(r.lateStops).toEqual([]);
        expect(r.bufferAfterMin).toBeNull();
    });
});

describe('🎨 실험실 사실 → 실물 엔진이 색을 낸다', () => {
    const colorOf = (facts: ReturnType<typeof buildLabFacts>) =>
        judge(CRITERIA, facts, DEFAULT_JUDGMENT).color;

    it('첫짐 · 10만원 · 85분이면 색이 나온다 (사고색이 아니다)', () => {
        const color = colorOf(buildLabFacts(base));
        expect(['꿀', '보통', '똥']).toContain(color);
    });

    it('🔴 주행을 못 쟀으면 «더 쓰는 시간»이 없다 — 0 으로 치지 않는다', () => {
        const facts = buildLabFacts({ ...base, driveMin: null });
        expect(facts.money?.extraMinutes).toBeNull();
        expect(colorOf(facts)).toBe('사고');       // 잴 수 없으면 사고색 (실물 규칙)
    });

    it('더 쓰는 시간은 **주행 + 정차**다 — 정차를 빼면 시급이 부풀어 색이 틀린다', () => {
        expect(buildLabFacts(base).money?.extraMinutes).toBe(85);   // 60 + 25
    });

    it('같은 시간이면 요금이 큰 쪽이 좋은 색이다', () => {
        const rich = judge(CRITERIA, buildLabFacts({ ...base, fare: 200_000 }), DEFAULT_JUDGMENT);
        const poor = judge(CRITERIA, buildLabFacts({ ...base, fare: 20_000 }), DEFAULT_JUDGMENT);
        expect(rich.score!).toBeGreaterThan(poor.score!);
    });

    it('🔴 약속을 깨는 콜은 잡으면 사고다 — 점수와 무관하게 빨간불', () => {
        const facts = buildLabFacts({
            ...base, fare: 500_000, hasExistingCalls: true,
            stops: [{ label: '①하차', promisedAt: at(60), etaAt: at(90) }],
        });
        expect(facts.promise?.lateStops).toEqual([{ label: '①하차', lateMinutes: 30 }]);
        expect(colorOf(facts)).toBe('사고');
    });

    it('📦 자리가 모자라면 공간 점수가 0 으로 떨어진다', () => {
        const facts = buildLabFacts({ ...base, slotsUsed: 95, boxes: 20 });
        expect(facts.space?.freePct).toBeLessThan(0);
        expect(judge(CRITERIA, facts, DEFAULT_JUDGMENT).criteria
            .find(c => c.key === 'space')?.outcome).toMatchObject({ score: 0 });
    });

    it('🏷️ 성질은 «잴 게 없다»로 지나간다 — 적요가 없는 콜이라 빈 배열이 사실이다', () => {
        const row = judge(CRITERIA, buildLabFacts(base), DEFAULT_JUDGMENT).criteria
            .find(c => c.key === 'nature');
        expect(row?.outcome.kind).not.toBe('unmeasurable');   // 못 잰 것이 아니다
    });

    it('🧭 지리는 기본 가중치가 0 이라 «안 봄» — 색을 사고로 만들지 않는다', () => {
        const row = judge(CRITERIA, buildLabFacts(base), DEFAULT_JUDGMENT).criteria
            .find(c => c.key === 'geography');
        expect(row?.weight).toBe(0);
        expect(colorOf(buildLabFacts(base))).not.toBe('사고');
    });
});
