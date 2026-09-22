import { CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgmentConfig, SpaceFacts } from '@onedal/shared';

/**
 * 📦 **추정으로 «자리 부족»이 나오면 점수를 깎지 않고 «못 쟀다»로 둔다** (규칙 ⑤-2)
 *
 * ── 왜 ──
 *
 * 적재량을 **차종 글자에서 추정**하는데 그 글자를 자주 못 읽는다 (실측: 리스트 29개 중 9개).
 * 오독 하나를 «자리 부족 0점»으로 두면 **멀쩡한 꿀콜의 평균을 끌어내린다.**
 *
 * 규칙 ⑤-2 가 이미 답을 적어 두었다 —
 * *«모르는 값은 불리하게 가정해 떨어뜨리지 않는다. 흔한 값으로 계산하고 화면에 «미확인»이라 적는다»*
 *
 * ── 어떻게 ──
 *
 * 추정으로 부족이 나오면 **`unmeasurable`(못 쟀다)** 로 답한다. 그러면
 *   · 가중평균에서 **아예 빠진다** — 0점으로 평균을 끌어내리지 않는다
 *   · 화면에는 이유가 그대로 남는다 — 기사님이 «추정»임을 보신다
 *
 * 🔴 **확정값(신고·실측)은 그대로 🔴 다.** 못 싣는 짐을 추천하면 현장에서 상차 거부 사고가 난다.
 *    가르는 것은 «얼마나 부족한가»가 아니라 **«어떻게 알았나»** 다.
 */

const SPACE = CRITERIA.find(c => c.key === 'space')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;

const space = (over: Partial<SpaceFacts>): SpaceFacts =>
    ({ freePct: 30, hasLoad: true, ...over });

const run = (f: SpaceFacts) => SPACE.measure(f as never, cfg);

describe('📦 자리 부족 — 어떻게 알았나로 가른다', () => {

    /** 🔴 이 검사가 생긴 까닭 — 차종 오독이 꿀콜을 깎는다 */
    it('🔴 추정으로 부족하면 «못 쟀다» 다 — 0점으로 평균을 끌어내리지 않는다', () => {
        const out = run(space({ freePct: -15, confidence: 'ESTIMATED' }));
        expect(out.kind).toBe('unmeasurable');
    });

    it('추정이면 이유에 «추정»이 남는다 — 기사님이 보고 판단하신다', () => {
        const out = run(space({ freePct: -15, confidence: 'ESTIMATED' }));
        expect(out.why).toMatch(/추정/);
    });

    it('🔴 신고(DECLARED)로 부족하면 사고다 — 현장에서 상차 거부가 난다', () => {
        const out = run(space({ freePct: -15, confidence: 'DECLARED' }));
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') {
            expect(out.hardFail).toBe(true);
            expect(out.score).toBe(0);
        }
    });

    it('🔴 실측(CONFIRMED)으로 부족해도 사고다', () => {
        const out = run(space({ freePct: -20, confidence: 'CONFIRMED' }));
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') expect(out.hardFail).toBe(true);
    });

    /** 🔴 확신을 모르면 지어내지 않는다 — 덮지도, 깎지도 않는다 (규칙 ④) */
    it('🔴 어떻게 알았는지 모르면 «못 쟀다» 다 — 없는 확신을 지어내지 않는다', () => {
        const out = run(space({ freePct: -15, confidence: null }));
        expect(out.kind).toBe('unmeasurable');
    });

    it('자리가 있으면 그대로 점수다 — 이 판은 안 건드렸다', () => {
        const out = run(space({ freePct: 70, confidence: 'ESTIMATED' }));
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') {
            expect(out.score).toBe(70);
            expect(out.hardFail).toBeFalsy();
        }
    });

    it('빈 차면 잴 게 없다', () => {
        expect(run(space({ hasLoad: false })).kind).toBe('nothing');
    });
});
