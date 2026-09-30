import { describe, expect, it } from 'vitest';
import { codeVersionLine, needsReload, reloadDecision } from './webCodeVersion';

/**
 * 🖥️ **관제웹이 자기 코드 판을 서버에 알린다 · 훅 모양이 바뀌면 스스로 한 번 다시 읽는다** (기사님 «새로고침을 나에게 묻지 말고 너가 코드로 확인해» · onedal-1f «가»).
 * 개발 서버(3000)에서는 커밋이 뜬 뒤에 생기니 «마지막 핫 교체»(시각·파일)를 함께 싣는다 — 서버 파일 수정 시각과 견주면 그 창이 새 코드인지 안다.
 */
const at = (h: number, m: number, s: number) => new Date(2026, 8, 30, h, m, s);

describe('🖥️ 코드 판 한 줄', () => {
    it('🔴 판 · 로드 시각 · 마지막 핫 교체', () => {
        expect(codeVersionLine({ commit: 'dc62c484', loadedAt: at(20, 17, 49), lastHot: null }))
            .toBe('🖥️ [관제웹 코드] 판 dc62c484 · 로드 20:17:49 · 마지막 핫 교체 없음');
        expect(codeVersionLine({ commit: 'dc62c484', loadedAt: at(20, 17, 49), lastHot: { at: at(20, 20, 1), files: ['JudgmentSeat.tsx'] } }))
            .toBe('🖥️ [관제웹 코드] 판 dc62c484 · 로드 20:17:49 · 마지막 핫 교체 20:20:01 JudgmentSeat.tsx');
    });
});

describe('🔄 스스로 다시 읽기', () => {
    it('🔴 훅을 가진 파일(부품 .tsx · hooks/)이 바뀌면 다시 읽어야 한다 · 순수 lib 은 아니다', () => {
        expect(needsReload(['/src/components/dashboard/JudgmentSeat.tsx'])).toBe(true);
        expect(needsReload(['/src/hooks/useOrderEngine.ts'])).toBe(true);
        expect(needsReload(['/src/lib/unreadable.ts'])).toBe(false);
    });
    it('🔴 판정 중 콜이 있거나 ⚪ 가 떠 있으면 미룬다', () => {
        expect(reloadDecision({ pending: true, seatBusy: true })).toBe('defer');
        expect(reloadDecision({ pending: true, seatBusy: false })).toBe('now');
        expect(reloadDecision({ pending: false, seatBusy: false })).toBe('none');
    });
});
