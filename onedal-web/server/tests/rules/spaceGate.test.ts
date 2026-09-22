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

    it('🔴 적재 근거를 판정에 실어 준다', () => {
        expect(ev).toMatch(/confidence:\s*session\.activeFilter\.capacityConfidence/);
    });
});
