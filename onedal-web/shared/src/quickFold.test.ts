import { describe, expect, it } from 'vitest';
import { QUICK_FOLD_SEC, quickFoldSecOf } from './judge';

/**
 * ⏩ **빨리 접기 — 판정이 나온 때부터 10초** (기사님 «붉은색과 50점 이하는 … 10초 정도면 생각할 시간도 있고, 빨리 접어서 다른 콜을 보게» · onedal-1f).
 * 대상: 앱이 알람 모드로 연 상세(openedByApp) · 조건: 점수 없음(🔴) 또는 벨 점수 미만(bell=false). 손으로 연 상세는 그대로.
 * 코드 상수다 — 설정값·저장 칸이 아니다. 기준선은 벨 점수를 그대로 쓴다.
 */
describe('⏩ 빨리 접기', () => {
    it('🔴 10초 한 벌', () => { expect(QUICK_FOLD_SEC).toBe(10); });
    it('🔴 앱이 연 콜 · 점수 없음 → 10 · 벨 미만 → 10 · 벨 이상 → null', () => {
        expect(quickFoldSecOf({ score: null, bell: false }, true)).toBe(10);
        expect(quickFoldSecOf({ score: 30, bell: false }, true)).toBe(10);
        expect(quickFoldSecOf({ score: 60, bell: true }, true)).toBeNull();
        // 🔴 꿀 콜은 벨 점수 아래여도 안 접는다 — 접는 선은 벨 점수와 꿀 경계 중 낮은 쪽
        expect(quickFoldSecOf({ score: 75, bell: false, color: '꿀' }, true)).toBeNull();
        expect(quickFoldSecOf({ score: 65, bell: false, color: '보통' }, true)).toBe(10);
    });
    it('🔴 손으로 연 콜 · 모름 · 판정 없음 → null', () => {
        expect(quickFoldSecOf({ score: null, bell: false }, false)).toBeNull();
        expect(quickFoldSecOf({ score: 30, bell: false }, undefined)).toBeNull();
        expect(quickFoldSecOf(null, true)).toBeNull();
    });
});
