import { CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgmentConfig, PromiseFacts } from '@onedal/shared';

/**
 * ⏰ **늦는다고 한 번에 떨어뜨리지 않는다** (기사님 확정)
 *
 * ── 왜 ──
 *
 * 버퍼(`bufferAfterMin`)가 마이너스일 때 **1분이든 60분이든 똑같이 0점**을 주면
 * 조금만 밀리는 콜을 다 버리게 된다 — 정차 중에 3~4콜을 모으려면 몇 분씩은 밀린다.
 * 그래서 밀린 분만큼만 깎는다.
 *
 * 🔴 **통화로 굳힌 약속이 깨지는 것은 다른 일이다** — 그건 `lateStops` 로 오고
 *    무조건 빨간불이다 (`hardFailIsConfirmed.test.ts`). 여기서 재는 것은 **통화 전 임시 지연**이다.
 *
 * ── 어떻게 ──
 *
 * 세 자리를 지나는 꺾은선이다 — **분은 설정에서, 계수는 코드**에 (우회 감쇠와 같은 모양).
 *
 *     버퍼 0분 95점 → 지연 5분 90점 → 지연 15분 60점 → 지연 30분 0점
 *
 * 🔴 **색을 덮지는 않는다** — 통화 전 지연은 서버가 지레짐작한 시간이다
 *    (`hardFailIsConfirmed`: *«임시 약속이 깨졌다고 색을 덮으면 좋은 콜이 🔴 가 된다»*).
 *    0 점이면 색이 «똥» 이라 충분히 말린다.
 *
 * 🔴 **`slack.zeroScore`(버퍼 0분 점수)는 95 다 — 지연 5분 점수(90)보다 높아야 한다.** 낮으면(예: 40) «지연 5분 90점»이
 *    «버퍼 0분 40점»보다 높아져 **늦는 콜이 딱 맞춘 콜보다 좋아진다** (순위 뒤집힘).
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

    /** 🔴 1분과 60분을 똑같이 0점으로 주지 않는다 — 밀린 분만큼만 깎는다 */
    it('🔴 지연 5분은 90점이다 — 몇 분 밀린다고 버리지 않는다', () => {
        expect(점수(-5)).toBe(90);
    });

    it('지연 15분은 60점이다', () => {
        expect(점수(-15)).toBe(60);
    });

    /**
     * 🔴 **한계를 넘어도 0 으로 멈추지 않는다 — 계속 내려가되 0 에 수렴한다** (기사님 확정).
     *
     * 0 한 값으로 끝내면 **31분과 283분이 같은 점수**가 된다. 오늘 고친 「뭉치는 문제」가
     * 그 구간에 다시 생기는 것이다. 31분은 전화 한 통으로 미룰 수 있고 283분은 못 미룬다 —
     * 화면이 그 차이를 보여야 기사님이 고르실 수 있다.
     * 🔴 색은 안 바뀐다 — 한계 밖은 어떤 경우에도 «보통 경계»(40) 한참 아래다.
     */
    it('🔴 한계를 넘으면 늦을수록 계속 낮아진다 — 0 한 값으로 뭉치지 않는다', () => {
        const 넘김 = [31, 44, 110, 283].map(m => 점수(-m)!);
        for (let i = 1; i < 넘김.length; i++) expect(넘김[i]).toBeLessThan(넘김[i - 1]);
        expect(넘김[0]).toBeLessThan(DEFAULT_JUDGMENT.color.normalMin);   // 그래도 «똥» 이다
        expect(넘김[넘김.length - 1]).toBeGreaterThan(0);                  // 0 에 닿지는 않는다
    });

    /** 🔴 한계 앞뒤가 이어져야 한다 — 끊기면 «29분보다 31분이 좋다» 가 된다 */
    it('🔴 어디서도 뒤집히지 않는다 — 늦을수록 낮다 (0~300분 전수)', () => {
        let prev = Infinity;
        for (let m = 0; m <= 300; m++) {
            const v = 점수(-m)!;
            expect(v).toBeLessThanOrEqual(prev + 0.5);   // 반올림 오차만 허용
            prev = v;
        }
    });

    /** 🔴 지레짐작한 시간으로 색을 덮지 않는다 — 덮는 것은 굳힌 약속뿐이다 */
    it('🔴 아무리 밀려도 색은 안 덮는다', () => {
        for (const m of [-31, -103, -600]) {
            const out = 여유(m);
            expect(out.kind).toBe('scored');
            if (out.kind === 'scored') expect(out.hardFail).toBeFalsy();
        }
    });

    /** 🔴 버퍼 0분 점수가 지연 5분 점수보다 높다 — 아니면 늦는 콜이 딱 맞춘 콜보다 좋아진다 */
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

    /** 🔴 통화로 굳힌 약속은 이 꺾은선과 무관하다 — 깨지면 무조건 사고다 */
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
        expect(점수(-31, 너그럽게)).toBeGreaterThan(점수(-31)!);
    });

    it('왜 깎였는지 이유에 분이 남는다', () => {
        const out = 여유(-12);
        expect(out.why).toMatch(/12/);
    });

    /**
     * 🔴 **이 점수가 총점의 천장이다** (기사님 확정 · 판정 균형).
     *
     * «0점이면 색이 똥이라 충분히 말린다»는 기준이 **다섯**이던 때 참이었다. 지금은 **아홉**이라
     * 한 축이 0점이어도 나머지가 끌어올린다 — 실측에서 **「110분 지연 — 한계 밖(0점)」인 합짐이
     * 🔵 꿀 71점**으로 떴다. 🔴 를 만들지 않는다는 판단은 그대로 두고(지레짐작이라서),
     * 천장으로 그 빈칸을 메운다.
     */
    it('🔴 추정 지연 점수가 총점의 천장이다 — 다른 축이 만점이어도 그 위로 못 간다', () => {
        const out = 여유(-110);
        expect(out.kind).toBe('scored');
        if (out.kind === 'scored') {
            expect(out.capsTotal).toBe(true);
            expect(out.hardFail).toBeFalsy();     // 🔴 는 굳힌 약속뿐이다
        }
    });

    it('🔴 여유가 넉넉한 쪽도 천장을 말한다 — 국면이나 크기로 가르지 않는다', () => {
        for (const m of [60, 0, -5, -15, -31]) {
            const out = 여유(m);
            if (out.kind === 'scored') expect(out.capsTotal).toBe(true);
        }
    });

    /** 🔴 «서버 짐작»임을 기사님이 아시게 — 굳힌 약속과 글자가 같으면 못 가리신다 */
    it('🔴 이유에 «추정» 이 적힌다', () => {
        expect(여유(-110).why).toContain('추정');
        expect(여유(-12).why).toContain('추정');
    });
});
