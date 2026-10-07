import { judge, CRITERIA, DEFAULT_JUDGMENT } from '@onedal/shared';
import type { JudgeFacts } from '@onedal/shared';
import { readFileSync } from 'fs';
import { join } from 'path';

const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * 📦 **자리가 모자라면 🔴 — 단, 기사님이 «신고한» 적재일 때만** (기사님 확정)
 *
 * 무엇을 막나
 * - **추정 적재로 색을 덮는 것** — 차종 글자를 오독하면 멀쩡한 콜이 🔴 가 된다.
 *   지금 적재는 신고가 없으면 «그 차종의 정원을 다 먹는다»고 가정한 값이다
 * - **신고했는데도 추천하는 것** — 물리적으로 안 들어가는 짐을 밀면 현장에서 상차 거부 사고가 난다
 * - 남는 자리를 **0 에서 자르는 것** — 자르면 «자리 부족»이 «여유 0%»로 보여 무조건 빨간불이 영영 안 켜진다
 */
const 합짐 = (freePct: number | null, confidence: 'CONFIRMED' | 'DECLARED' | 'ESTIMATED' | null): JudgeFacts => ({
    money: { fare: 50_000, extraMinutes: 60, firstLoad: false },
    promise: { hasExistingCalls: true, lateStops: [], bufferAfterMin: 60 },
    space: { freePct, hasLoad: true, confidence },
    nature: { conflicts: [], excludedHits: [], hasLoad: true },
});
const 본다 = (f: JudgeFacts) => judge(CRITERIA, f, DEFAULT_JUDGMENT);
const 공간줄 = (f: JudgeFacts) => 본다(f).criteria.find(c => c.key === 'space')!;
const 덮었나 = (f: JudgeFacts) => !!(공간줄(f).outcome as { hardFail?: boolean }).hardFail;

describe('📦 신고한 적재로 자리가 없으면 색을 덮는다', () => {

    it('🔴 통화로 신고한 짐이 안 들어가면 🔴 다', () => {
        const f = 합짐(-20, 'DECLARED');
        expect(덮었나(f)).toBe(true);
        expect(본다(f).color).toBe('사고');
    });

    it('🔴 현장에서 실측한 짐이 안 들어가도 🔴 다', () => {
        expect(덮었나(합짐(-5, 'CONFIRMED'))).toBe(true);
    });

    it('🔴 추정 적재는 덮지 않는다 — 오독으로 멀쩡한 콜을 버리면 안 된다', () => {
        const f = 합짐(-20, 'ESTIMATED');
        expect(덮었나(f)).toBe(false);
        /* 🔴 점수를 안 낸다 — 추정 오독이 평균을 끌어내리지 않게 (규칙 ⑤-2) */
        expect(공간줄(f).outcome.kind).toBe('unmeasurable');
        expect(공간줄(f).outcome.why).toContain('추정');
    });

    it('🔴 근거를 모르면 덮지 않는다 — 없는 확신을 지어내지 않는다 (규칙 ④)', () => {
        expect(덮었나(합짐(-20, null))).toBe(false);
    });

    it('자리가 남으면 신고값이어도 그냥 점수다', () => {
        const f = 합짐(40, 'DECLARED');
        expect(덮었나(f)).toBe(false);
        expect((공간줄(f).outcome as { score: number }).score).toBe(40);
    });

    it('🔴 딱 0% 는 부족이 아니다 — 꽉 맞게 들어간다', () => {
        expect(덮었나(합짐(0, 'DECLARED'))).toBe(false);
    });
});

describe('📦 남는 자리를 0 에서 자르지 않는다 (배선)', () => {
    const ev = codeOnly(readFileSync(join(__dirname, '../../src/core/engine/OrderEvaluator.ts'), 'utf8'));

    it('🔴 `Math.max(0, …)` 로 음수를 지우지 않는다 — 지우면 무조건 빨간불이 영영 안 켜진다', () => {
        expect(ev).not.toMatch(/freePct:[\s\S]{0,120}Math\.max\(0,\s*slotsTotal/);
    });
});

/**
 * 🟦 **추정 적재로 넘치면 색은 보통 — «짐 크기 추정 — 확인하세요»** (기사님 «가»)
 *
 * 무엇을 막나
 * - **차종 오독 하나로 합짐이 🔴 가 되는 것** — 추정은 재료가 있는데 못 믿는 것이지, 재료가 없는 것이 아니다
 * - **확인 안 한 자리로 꿀을 주는 것** — 꿀은 «그냥 잡으면 된다»라 자리를 모르는 콜에 줄 수 없다
 * - **어떻게 알았는지 모르는 넘침과 재료가 없는 기준까지 보통이 되는 것** — 그건 지금처럼 🔴
 */
describe('🟦 추정 적재로 넘치면 보통 · 확인하세요', () => {
    const 꿀합짐 = (freePct: number | null, confidence: 'CONFIRMED' | 'DECLARED' | 'ESTIMATED' | null): JudgeFacts =>
        ({ ...합짐(freePct, confidence), money: { fare: 200_000, extraMinutes: 10, firstLoad: false } });

    it('🔴 추정으로 넘치면 사고가 아니라 보통 — 딱지에 «짐 크기 추정 — 확인하세요»', () => {
        const v = 본다(합짐(-20, 'ESTIMATED'));
        expect(v.color).toBe('보통');
        expect(v.notes.some(n => n.includes('짐 크기 추정 — 확인하세요'))).toBe(true);
        expect(v.notes.some(n => n.startsWith('잴 수 없음'))).toBe(false);
    });

    it('🔴 점수가 꿀 문턱을 넘어도 추정 넘침이면 보통 — 꿀이 아니다', () => {
        expect(본다(꿀합짐(40, 'DECLARED')).color).toBe('꿀');
        expect(본다(꿀합짐(-20, 'ESTIMATED')).color).toBe('보통');
    });

    it('🔴 어떻게 알았는지 모르면 지금처럼 사고 — 글은 «추정»이 아니라 «어떻게 알았는지 모름»', () => {
        const v = 본다(합짐(-20, null));
        expect(v.color).toBe('사고');
        expect(공간줄(합짐(-20, null)).outcome.why).toContain('짐 크기를 어떻게 알았는지 모름');
        expect(공간줄(합짐(-20, null)).outcome.why).not.toContain('(추정)');
    });

    it('🔴 재료가 없는 기준은 그대로 사고 — 적재 상태가 안 오면', () => {
        const f = { ...꿀합짐(40, 'DECLARED'), space: undefined } as unknown as JudgeFacts;
        expect(본다(f).color).toBe('사고');
    });
});
