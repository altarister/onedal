import { readFileSync } from 'fs';
import { join } from 'path';
import { CRITERIA, DEFAULT_JUDGMENT, JUDGMENT_FIELDS, judgmentDefaults } from '@onedal/shared';
import type { JudgmentConfig, PromiseFacts } from '@onedal/shared';

/**
 * ⏰ **약속은 색으로 말하고 점수를 안 깎는다** (기사님 확정)
 *
 * 기사님: *"약속으로 색을 판단하고 점수로 금액을 판단한다"* ·
 *         *"처음부터 우리는 약속이 있는 것과 같아. 확정을 하지 않은 약속"* ·
 *         *"전화를 하였어도 10분 정도 늦어 질수 있는거고 전화를 하지 않았으면 20분정도"*
 *
 * ── 색이 말하는 것 ──
 *   흔들림 안                                    그냥 잡으면 된다
 *   흔들림 밖                                    🟡 전화해서 미룬다
 *   전화한 곳이 흔들림 밖 · 전화 안 한 곳이 몇 배 밖   🔴 지금 그대로는 못 잡는다
 *
 * 🔴 **점수는 어느 경우에도 안 깎인다.** 🔴 옆에 90점이 그대로 보여야
 *    기사님이 *"좋은 콜이니 다른 걸 취소할까"* 를 판단하신다.
 */

const PROMISE = CRITERIA.find(c => c.key === 'promise')!;
const cfg: JudgmentConfig = DEFAULT_JUDGMENT;

const 여유 = (bufferAfterMin: number, c: JudgmentConfig = cfg) =>
    PROMISE.measure({ hasExistingCalls: true, lateStops: [], bufferAfterMin } as never, c);
const 굳힘 = (lateMinutes: number, firm: boolean, c: JudgmentConfig = cfg) =>
    PROMISE.measure({ hasExistingCalls: true, bufferAfterMin: 60,
        lateStops: [{ label: '노선합짐1콜 하차 약속', lateMinutes, firm }] } as never, c);
const 어떻게 = (o: ReturnType<typeof 여유>) => o.kind !== 'scored' ? o.kind
    : (o as any).hardFail ? '🔴' : (o as any).needsCall ? '🟡' : '그냥';
const 점수 = (o: ReturnType<typeof 여유>) => o.kind === 'scored' ? o.score : null;

describe('⏰ 전화 안 한 약속 — 흔들림으로 가른다', () => {

    it('🔴 흔들림 안이면 그냥 잡는다', () => {
        expect(어떻게(여유(-(cfg.slack.slipUncalledMin - 1)))).toBe('그냥');
    });

    it('🔴 흔들림 밖이면 🟡 — 전화해서 미룬다', () => {
        expect(어떻게(여유(-(cfg.slack.slipUncalledMin + 1)))).toBe('🟡');
    });

    it('🔴 흔들림을 크게 넘으면 🔴 — 전화로 될 일이 아니다', () => {
        expect(어떻게(여유(-cfg.slack.slipUncalledMin * 5))).toBe('🔴');
    });

    /** 🔴 이 판의 뜻 그대로 — 늦는다고 «얼마짜리인가»가 달라지지 않는다 */
    it('🔴 어느 경우에도 점수를 안 깎는다', () => {
        for (const m of [60, 0, -5, -19, -21, -60, -110, -300]) {
            expect(점수(여유(m))).toBe(100);
        }
    });

    it('여유가 넉넉하면 그대로 만점이다', () => {
        expect(어떻게(여유(60))).toBe('그냥');
        expect(점수(여유(60))).toBe(100);
    });

    it('왜 그런지 이유에 분이 남는다', () => {
        expect((여유(-25) as any).why).toMatch(/25/);
    });
});

describe('⏰ 전화로 굳힌 약속 — 흔들림이 더 작다', () => {

    /** 🔴 지금까지는 1분만 늦어도 🔴 였다 — 기사님 모델에서 그건 있을 수 있는 일이다 */
    it('🔴 흔들림 안이면 🔴 가 아니다 (한 번 한 약속도 몇 분은 흔들린다)', () => {
        expect(어떻게(굳힘(cfg.slack.slipCalledMin - 1, true))).toBe('그냥');
    });

    it('🔴 흔들림 밖이면 바로 🔴 — 한 번 한 약속은 무겁다', () => {
        expect(어떻게(굳힘(cfg.slack.slipCalledMin + 1, true))).toBe('🔴');
    });

    /** 🔴 같은 분이라도 전화를 안 했으면 아직 🟡 다 — 흔들림이 크기 때문이다 */
    it('🔴 같은 분이라도 전화 안 한 곳은 아직 🟡 다', () => {
        const m = cfg.slack.slipCalledMin + 1;
        expect(어떻게(굳힘(m, true))).toBe('🔴');
        expect(어떻게(굳힘(m, false))).toBe('그냥');
    });

    it('🔴 어느 쪽이든 점수는 안 깎인다', () => {
        expect(점수(굳힘(3, true))).toBe(100);
        expect(점수(굳힘(300, true))).toBe(100);
    });

    /** 🔴 한 콜에 약속이 둘이다 — 딱지에 어느 약속인지 적힌다 */
    it('🔴 어느 콜 어느 약속인지 이유에 적힌다', () => {
        expect((굳힘(30, true) as any).why).toMatch(/하차 약속/);
        expect((굳힘(30, true) as any).why).toMatch(/전화함/);
        expect((굳힘(30, false) as any).why).toMatch(/전화 안 함/);
    });
});

describe('⏰ 흔들림 두 칸은 판정 기준 탭에서 온다 (규칙 ⑤-4 ①)', () => {

    it('🔴 표에 두 칸이 있고 DB 칸과 1:1 이다', () => {
        const cols = JUDGMENT_FIELDS.map(f => f.col);
        for (const c of ['slack_slip_called_min', 'slack_slip_uncalled_min']) {
            expect(cols).toContain(c);
            expect(judgmentDefaults()[c]).toBeGreaterThan(0);
        }
    });

    it('🔴 통화한 곳의 흔들림이 더 작다 — 통화는 폭을 줄이는 일이다', () => {
        expect(DEFAULT_JUDGMENT.slack.slipCalledMin).toBeLessThan(DEFAULT_JUDGMENT.slack.slipUncalledMin);
    });

    it('🔴 기사님이 흔들림을 넓히면 같은 콜이 «그냥»이 된다 — 코드에 안 박혀 있다', () => {
        const 넓게: JudgmentConfig = { ...cfg, slack: { ...cfg.slack, slipUncalledMin: 120 } };
        expect(어떻게(여유(-60))).toBe('🟡');
        expect(어떻게(여유(-60, 넓게))).toBe('그냥');
    });

    /** 🔴 «전화로 될 일이 아닌 배수»는 코드 상수다 — 분은 설정, 배수는 코드 */
    it('🔴 배수는 코드에 한 곳이다', () => {
        const src = readFileSync(join(__dirname, '../../../shared/src/criteria.ts'), 'utf8');
        expect(src.match(/HARD_SLIP_TIMES/g)!.length).toBeGreaterThanOrEqual(2);
    });
});
