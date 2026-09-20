import { CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgmentConfig, PromiseFacts } from '@onedal/shared';

/**
 * ⏰ **늦는다고 한 번에 떨어뜨리지 않는다** (Step 6-1 · 기사님 확정)
 *
 * ── 왜 ──
 *
 * 여유(`bufferAfterMin`)가 마이너스면 **1분이든 60분이든 똑같이 0점**이었다.
 * 조금만 밀리는 콜을 다 버리게 된다 — 정차 중에 3~4콜을 모으려면 몇 분씩은 밀린다.
 *
 * 🔴 **통화로 굳힌 약속이 깨지는 것은 다른 일이다** — 그건 `lateStops` 로 오고
 *    무조건 빨간불이다 (`hardFailIsConfirmed.test.ts`). 여기서 재는 것은 **통화 전 임시 지연**이다.
 *
 * ── 어떻게 ──
 *
 * 세 자리를 지나는 꺾은선이다 — **분은 설정에서, 계수는 코드**에 (우회 감쇠와 같은 모양).
 *
 *     여유 0분 95점 → 지연 5분 90점 → 지연 15분 60점 → 지연 30분 0점
 *
 * 🔴 **색을 덮지는 않는다** — 통화 전 지연은 서버가 지레짐작한 시간이다
 *    (`hardFailIsConfirmed`: *«임시 약속이 깨졌다고 색을 덮으면 좋은 콜이 🔴 가 된다»*).
 *    0 점이면 색이 «똥» 이라 충분히 말린다.
 *
 * 🔴 **`slack.zeroScore` 를 40 → 95 로 함께 올렸다.** 안 올리면 «지연 5분 90점»이
 *    «여유 0분 40점»보다 높아져 **늦는 콜이 딱 맞춘 콜보다 좋아진다** (순위 뒤집힘).
 */

const PROMISE = CRITERIA.find(c => c.key === 'promise')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;

const 여유 = (bufferAfterMin: number, c: JudgmentConfig = cfg) => {
    const f: PromiseFacts = { hasExistingCalls: true, lateStops: [], bufferAfterMin };
    return PROMISE.measure(f as never, c);
};
const 점수 = (min: number, c: JudgmentConfig = cfg) => {
    const out = 여유(min, c);
    if (out.kind !== 'scored') throw new Error(`점수가 아니다: ${out.kind}`);
    return out.score;
};

describe('⏰ 임시 지연 — 분만큼만 깎는다', () => {

    /** 🔴 이 검사가 생긴 까닭 — 1분과 60분이 똑같이 0점이었다 */
    it('🔴 지연 5분은 90점이다 — 몇 분 밀린다고 버리지 않는다', () => {
        expect(점수(-5)).toBe(90);
    });

    it('지연 15분은 60점이다', () => {
        expect(점수(-15)).toBe(60);
    });

    it('🔴 지연 30분을 넘으면 0점이다', () => {
        expect(점수(-31)).toBe(0);
    });

    /** 🔴 지레짐작한 시간으로 색을 덮지 않는다 — 덮는 것은 굳힌 약속뿐이다 */
    it('🔴 아무리 밀려도 색은 안 덮는다', () => {
        for (const m of [-31, -103, -600]) {
            const out = 여유(m);
            expect(out.kind).toBe('scored');
            if (out.kind === 'scored') expect(out.hardFail).toBeFalsy();
        }
    });

    /** 🔴 눈금을 함께 올렸다 — 안 그러면 늦는 콜이 딱 맞춘 콜보다 좋아진다 */
    it('🔴 여유 0분이 지연 5분보다 높다 — 순위가 안 뒤집힌다', () => {
        expect(점수(0)).toBeGreaterThan(점수(-5));
        expect(점수(0)).toBe(cfg.slack.zeroScore);
    });

    it('늦을수록 낮다 — 어디서도 뒤집히지 않는다', () => {
        const xs = [30, 15, 5, 0, -1, -5, -10, -15, -25, -30];
        const ys = xs.map(x => 점수(x));
        for (let i = 1; i < ys.length; i++) expect(ys[i - 1]).toBeGreaterThanOrEqual(ys[i]);
    });

    it('여유가 넉넉하면 그대로 만점이다 — 이 판이 위쪽을 안 건드린다', () => {
        expect(점수(cfg.slack.fullMin)).toBe(100);
        expect(점수(cfg.slack.fullMin + 60)).toBe(100);
    });

    /** 🔴 통화로 굳힌 약속은 이 판과 무관하다 — 건드리지 않았다 */
    it('🔴 굳힌 약속이 깨지면 여전히 무조건 사고다', () => {
        const f: PromiseFacts = {
            hasExistingCalls: true,
            lateStops: [{ label: '합짐1콜 하차 약속', lateMinutes: 3 }],
            bufferAfterMin: 20,
        };
        const out = PROMISE.measure(f as never, cfg);
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') expect(out.hardFail).toBe(true);
    });

    /** 세 자리를 기사님이 판정 기준 탭에서 움직인다 (규칙 ⑤-4) */
    it('한계를 늘리면 같은 콜이 살아난다 — 코드에 박혀 있지 않다', () => {
        const 너그럽게: JudgmentConfig = {
            ...cfg, slack: { ...cfg.slack, lateSoftMin: 20, lateWarnMin: 40, lateZeroMin: 90 },
        };
        expect(점수(-31)).toBe(0);
        expect(점수(-31, 너그럽게)).toBeGreaterThan(0);
    });

    it('왜 깎였는지 이유에 분이 남는다', () => {
        const out = 여유(-12);
        expect(out.why).toMatch(/12/);
    });
});
