import { CRITERIA, DEFAULT_JUDGMENT, destGainKm, destProgressRatio } from '@onedal/shared';
import type { JudgmentConfig, GeographyFacts } from '@onedal/shared';
import fs from 'fs';
import path from 'path';

/**
 * 🛫 **반대쪽으로 «얼마나» 멀어지나** — 첫짐
 *
 * ── 왜 ──
 *
 * 노하우: *"먼 첫짐은 비싸도 나쁘다 (합짐 예산이 안 남는다)"* ·
 * *"잘못 고르면 **오전이 1콜로 끝난다**"* — 멀리 나가면 그 길 위에도 그 끝에도 콜이 드물다.
 *
 * 🔴 **전진율만으로는 그걸 못 본다.** 전진율은 **나누기**라서 «얼마나»가 약분된다 —
 *    60km 멀어지는 것과 180km 멀어지는 것이 둘 다 `-1` 이다.
 *    그래서 나누기 전의 값(`destGainKm`)으로 한 번 더 잰다.
 *
 * 🔴 **거리만으로 깎으면 안 된다** (노하우: *«장거리 꿀콜이 억울하게 떨어질 수 있다»*).
 *    서울→부산 400km 는 **목적지 쪽**이면 좋은 콜이다. 그래서 «멀어진 km» 로 잰다 —
 *    방향과 거리가 한 값에 담겨, 가까워지는 장거리는 아예 안 걸린다.
 *
 * ── 어떻게 ──
 *
 * 「지리」 배수에 한 번 더 곱한다. 🔴 버리지 않는다 (규칙 ①) · 못 쟀으면 안 깎는다 (규칙 ⑤-2).
 */

const GEOGRAPHY = CRITERIA.find(c => c.key === 'geography')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;
const SRC = path.join(__dirname, '../../src/core/engine');
const codeOnly = (f: string) =>
    fs.readFileSync(path.join(SRC, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const 배수 = (over: Partial<GeographyFacts>, c: JudgmentConfig = cfg) => {
    const f: GeographyFacts = { firstLoad: true, progressRatio: -0.5, ...over };
    const out = GEOGRAPHY.measure(f as never, c);
    if (out.kind !== 'scored') throw new Error(`점수가 아니다: ${out.kind}`);
    return (out as { multiplier?: number }).multiplier ?? 1;
};

describe('🛫 첫짐 — 멀어진 거리를 본다', () => {

    /** 🔴 나누기 전의 값을 살린다 — 셈은 한 곳이다 (규칙 ③) */
    it('🔴 «가까워진 km» 를 잰다 — 멀어지면 음수다', () => {
        const 남 = { lng: 127, lat: 36 }, 북1 = { lng: 127, lat: 37 }, 북2 = { lng: 127, lat: 38 };
        expect(destGainKm(남, 북1, 북2)).toBeGreaterThan(0);    // 목적지 쪽으로
        expect(destGainKm(북1, 남, 북2)).toBeLessThan(0);       // 멀어진다
    });

    it('🔴 전진율은 그 값을 나눈 것이다 — 두 벌로 세지 않는다', () => {
        const 남 = { lng: 127, lat: 36 }, 북1 = { lng: 127, lat: 37 }, 북2 = { lng: 127, lat: 38 };
        expect(destProgressRatio(남, 북1, 북2)).toBeCloseTo(1, 3);
        expect(codeOnly('judgeFacts.ts')).not.toMatch(/haversineKm\([^)]*goal[^)]*\)\s*-\s*haversineKm/);
    });

    /** 🔴 60km 와 180km 가 같은 점수가 되지 않는다 */
    it('🔴 멀리 멀어질수록 더 깎인다', () => {
        const a = 배수({ awayKm: 60 }), b = 배수({ awayKm: 180 });
        expect(b).toBeLessThan(a);
    });

    it('가까운 거리는 안 깎는다 — 흔한 일이다', () => {
        expect(배수({ awayKm: 10 })).toBe(배수({ awayKm: 0 }));
        expect(배수({ awayKm: cfg.destBonus.awayFreeKm })).toBe(배수({ awayKm: 0 }));
    });

    /** 🔴 노하우 — 장거리 꿀콜을 죽이지 않는다 */
    it('🔴 목적지 쪽으로 가는 장거리는 안 깎는다 — 멀어진 게 아니다', () => {
        expect(배수({ awayKm: -400, progressRatio: 0.9 })).toBe(배수({ awayKm: 0, progressRatio: 0.9 }));
    });

    it('한계를 넘으면 더는 안 깎인다 — 바닥이 있다', () => {
        expect(배수({ awayKm: cfg.destBonus.awayHardKm })).toBe(배수({ awayKm: 9999 }));
    });

    /** 🔴 못 쟀으면 안 깎는다 (규칙 ⑤-2) */
    it('🔴 목적지를 안 정하셨으면 안 깎는다', () => {
        expect(배수({ awayKm: null })).toBe(배수({ awayKm: 0 }));
    });

    it('🔴 버리지 않는다 — 색으로만 말한다 (규칙 ①)', () => {
        const out = GEOGRAPHY.measure({ firstLoad: true, progressRatio: -0.9, awayKm: 300 } as never, cfg);
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') expect(out.hardFail).toBeFalsy();
        expect(out.why).toMatch(/멀어/);
    });

    it('🔴 합짐은 안 본다 — 한계 우회가 이미 센다 (규칙 ③)', () => {
        const out = GEOGRAPHY.measure({ firstLoad: false, progressRatio: null, awayKm: 300 } as never, cfg);
        expect(out.kind).toBe('nothing');
    });

    /** 두 자리를 기사님이 판정 기준 탭에서 움직인다 (규칙 ⑤-4) */
    it('한계를 늘리면 같은 콜이 살아난다 — 코드에 박혀 있지 않다', () => {
        const 너그럽게: JudgmentConfig = {
            ...cfg, destBonus: { ...cfg.destBonus, awayFreeKm: 200, awayHardKm: 500 },
        };
        expect(배수({ awayKm: 180 }, 너그럽게)).toBeGreaterThan(배수({ awayKm: 180 }));
    });

    /** 🔗 사슬 — 서버가 재서 넘기지 않으면 위 검사는 다 초록인데 화면은 그대로다 */
    it('🔴 첫짐을 부르는 자리가 멀어진 거리를 넘긴다', () => {
        const src = codeOnly('OrderEvaluator.ts');
        const spots = [...src.matchAll(/firstLoadFacts\(\{/g)].map(m => m.index!);
        expect(spots.length).toBeGreaterThan(0);
        for (const i of spots) {
            const call = src.slice(i, src.indexOf('}), judgmentCfg', i));
            expect(call).toMatch(/progress/);
        }
        expect(codeOnly('judgeFacts.ts')).toMatch(/destGainKm\(/);
    });
});
