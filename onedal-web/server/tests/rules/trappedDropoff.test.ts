import { CRITERIA, DEFAULT_JUDGMENT, isTrappedRegion, TRAPPED_REGIONS } from '@onedal/shared';
import type { JudgmentConfig, GeographyFacts } from '@onedal/shared';
import { firstLoadFacts } from '../../src/core/engine/judgeFacts';
import fs from 'fs';
import path from 'path';

/**
 * 🏔️ **들어가면 빈 차로 나온다 — 첫짐의 탈출력**
 *
 * ── 왜 ──
 *
 * 노하우의 「못 빠져나온다」 줄에 일곱 곳이 적혀 있다 —
 * 강화도 · 연천 · 양평 · 남양주 수동면 · 포천 산정호수 · 춘천 · 가평.
 * *"들어가면 **빈차로 돌아온다**"*
 *
 * 🔴 **요금으로는 안 보인다.** 그쪽 콜은 오히려 비싸다 — 아무도 안 가려 하니까.
 *    「돈」 기준은 그 콜 하나만 보므로 🔵 를 낸다. 하루가 거기서 끝나는 것은 못 센다.
 *
 * 🔴 **첫짐만 본다.** 합짐은 하차지가 여럿이고 이미 경로가 있다 — 되돌아오는 값은
 *    한계 우회가 센다 (규칙 ③).
 *
 * ── 어떻게 ──
 *
 * 「지리」 배수에 한 번 더 곱한다. 🔴 **버리지 않는다** (규칙 ①) — 색으로만 말한다.
 * 기사님이 «그래도 간다» 하시면 가신다.
 */

const GEOGRAPHY = CRITERIA.find(c => c.key === 'geography')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;
const SRC = path.join(__dirname, '../../src/core/engine');
const codeOnly = (f: string) =>
    fs.readFileSync(path.join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

const 배수 = (over: Partial<GeographyFacts>) => {
    const f: GeographyFacts = { firstLoad: true, progressRatio: 0.5, ...over };
    const out = GEOGRAPHY.measure(f as never, cfg);
    if (out.kind !== 'scored') throw new Error(`점수가 아니다: ${out.kind}`);
    return (out as { multiplier?: number }).multiplier ?? 1;
};

describe('🏔️ 갇힘 지역 — 첫짐의 탈출력', () => {

    it('🔴 노하우 일곱 곳을 안다', () => {
        for (const 곳 of ['인천 강화군', '연천군', '양평군', '가평군', '춘천시']) {
            expect(isTrappedRegion(곳, '아무읍')).toBe(true);
        }
        expect(isTrappedRegion('남양주시', '수동면')).toBe(true);
        expect(isTrappedRegion('포천시', '영북면')).toBe(true);
    });

    /** 🔴 시 전체가 갇힘인 곳과 일부만 갇힘인 곳을 가른다 */
    it('🔴 남양주·포천은 그 면만이다 — 시 전체를 막지 않는다', () => {
        expect(isTrappedRegion('남양주시', '다산동')).toBe(false);
        expect(isTrappedRegion('포천시', '소흘읍')).toBe(false);
    });

    it('멀쩡한 곳은 아니다', () => {
        expect(isTrappedRegion('서울 강남구', '역삼동')).toBe(false);
        expect(isTrappedRegion('이천시', '부발읍')).toBe(false);
        expect(isTrappedRegion(null, null)).toBe(false);
    });

    /** 🔴 요금이 높아도 하루가 끝난다 */
    it('🔴 갇힘 지역 하차는 배수가 깎인다', () => {
        expect(배수({ trapped: true })).toBeLessThan(배수({ trapped: false }));
    });

    it('🔴 못 쟀으면 안 깎는다 — 좌표가 없을 수 있다 (규칙 ⑤-2)', () => {
        expect(배수({ trapped: null })).toBe(배수({ trapped: false }));
    });

    /** 🔴 합짐은 이 배수를 안 본다 — 한계 우회가 이미 센다 (규칙 ③) */
    it('🔴 합짐의 지리는 그대로 «잴 게 없다» 다', () => {
        const out = GEOGRAPHY.measure({ firstLoad: false, progressRatio: null, trapped: true } as never, cfg);
        expect(out.kind).toBe('nothing');
    });

    it('🔴 버리지 않는다 — 색으로만 말한다 (규칙 ①)', () => {
        const out = GEOGRAPHY.measure({ firstLoad: true, progressRatio: 0.5, trapped: true } as never, cfg);
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') expect(out.hardFail).toBeFalsy();
        expect(out.why).toMatch(/빠져나|갇/);
    });

    /** 얼마나 깎을지는 기사님이 판정 기준 탭에서 움직인다 (규칙 ⑤-4) */
    it('깎는 정도가 코드에 박혀 있지 않다', () => {
        const 너그럽게: JudgmentConfig = { ...cfg, destBonus: { ...cfg.destBonus, trappedMult: 1 } };
        const f = { firstLoad: true, progressRatio: 0.5, trapped: true } as never;
        const a = GEOGRAPHY.measure(f, 너그럽게), b = GEOGRAPHY.measure(f, cfg);
        if (a.kind !== 'scored' || b.kind !== 'scored') throw new Error('점수가 아니다');
        expect((a as { multiplier?: number }).multiplier).toBeGreaterThan((b as { multiplier?: number }).multiplier!);
    });

    it('목록이 비어 있지 않다 — 노하우에서 옮긴 것이다', () => {
        expect(TRAPPED_REGIONS.length).toBeGreaterThan(0);
    });

    /** 🔗 사슬 — 서버가 재서 넘기지 않으면 위 검사는 다 초록인데 화면은 그대로다 */
    it('🔴 첫짐을 부르는 자리가 갇힘을 재서 넘긴다', () => {
        const src = codeOnly('OrderEvaluator.ts');
        expect(src).toMatch(/isTrappedRegion\(|trappedOf\(/);
        const spots = [...src.matchAll(/firstLoadFacts\(\{/g)].map(m => m.index!);
        expect(spots.length).toBeGreaterThan(0);
        for (const i of spots) {
            const call = src.slice(i, src.indexOf('}), judgmentCfg', i));
            /** 🔴 «재는 함수를 쓰는가» 를 본다 — `trapped: null` 을 박아도 통과하면 안 된다 */
            expect(call).toMatch(/trapped:\s*trappedOf\(/);
        }
    });

    it('첫짐 재료에 그대로 실린다', () => {
        const f = firstLoadFacts({
            fare: 50_000, totalMinutes: 60, tags: [], excludedHits: [],
            pickupBackward: null, trapped: true,
        });
        expect(f.geography!.trapped).toBe(true);
    });
});
