import { describe, it, expect } from 'vitest';
import { workStageLabel, isModeApplying } from './index';

/**
 * 🚦 **관제웹이 폰의 «지금 하는 일»과 «모드가 닿았나»를 읽는 자리**
 * (기사님 확정 2026-09-02 · `docs/기획/폰_상태바.md` 0단계)
 *
 * 🔴 낱말은 **여기 한 곳**에서 짓는다. 앱은 칸과 숫자만 보낸다 —
 *    한글을 앱에도 두면 한쪽만 고쳐진다 (규칙 ③).
 */
describe('🚦 작업 단계 이름', () => {
    it('다섯 칸을 사람 말로 짓는다', () => {
        expect(workStageLabel({ workStage: 'IDLE' })).toBe('대기');
        expect(workStageLabel({ workStage: 'DETAIL' })).toBe('상세');
        expect(workStageLabel({ workStage: 'POPUP', workStageStep: 2 })).toBe('팝업 2/3');
        expect(workStageLabel({ workStage: 'AWAITING_VERDICT' })).toBe('판결 대기');
        expect(workStageLabel({ workStage: 'SAFE_CANCEL', workStageSeconds: 12 })).toBe('안전취소 12초');
    });

    it('구앱은 아무것도 안 그린다 — «대기»로 지어내지 않는다 (규칙 ④)', () => {
        expect(workStageLabel({})).toBeNull();
    });

    it('숫자가 빠진 팝업은 장수 없이 그린다 — 없는 숫자를 만들지 않는다', () => {
        expect(workStageLabel({ workStage: 'POPUP' })).toBe('팝업');
    });
});

/**
 * 🎛️ **「적용중」은 저장하지 않고 대조로 파생시킨다** (0단계 ② · 규칙 ③).
 *
 * 🔴 여태 관제웹은 버튼을 누르는 순간 바뀐 것처럼 그렸다(«낙관적 업데이트») —
 *    폰이 받았는지 모르면서. 이제 앱이 «나 지금 이 모드다»를 대답하므로 대조하면 된다.
 */
describe('🎛️ 모드가 폰에 닿았나', () => {
    it('관제가 정한 모드와 폰이 말한 모드가 다르면 «적용중»이다', () => {
        expect(isModeApplying({ mode: 'ALARM', appliedMode: 'AUTO' })).toBe(true);
    });

    it('같으면 적용된 것이다', () => {
        expect(isModeApplying({ mode: 'ALARM', appliedMode: 'ALARM' })).toBe(false);
    });

    it('대답을 안 싣는 구앱은 «적용중»이라 하지 않는다 — 모름을 «안 됐다»로 읽지 않는다', () => {
        expect(isModeApplying({ mode: 'ALARM' })).toBe(false);
    });
});
