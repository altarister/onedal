import { describe, it, expect } from 'vitest';
import { showsInPanel, emergencyLabelOf } from './emergencyLine';

/**
 * ⏱️ **KEEP 이 폰에 못 가 배차망에서 취소된 경보는 폰 칸 빨간 줄에 보인다** (40 S2-2 · 23 · 71 «다»).
 * 보통 «자동 취소» · «버튼 못 찾음»은 루틴이라 지금처럼 빨간 줄에 안 띄운다(사이렌은 울림).
 * 못 잡는 것: 그 줄이 실제로 그려지는 모양(폰 시험 T2 사진).
 */
const alert = (o: Record<string, unknown>) => ({ deviceId: 'd', orderId: 'o', reason: 'AUTO_CANCEL', screenContext: 'LIST', timestamp: 't', ...o }) as any;

describe('⏱️ 비상 경보 빨간 줄', () => {
    it('🔴 KEEP 못 감 경보는 보인다 · 보통 자동 취소 · 버튼 못 찾음은 안 보인다 · 다른 까닭은 보인다', () => {
        expect(showsInPanel(alert({ keepLost: true }))).toBe(true);
        expect(showsInPanel(alert({}))).toBe(false);
        expect(showsInPanel(alert({ reason: 'BUTTON_NOT_FOUND' }))).toBe(false);
        expect(showsInPanel(alert({ reason: 'CANCEL_EXPIRED' }))).toBe(true);
    });

    it('🔴 KEEP 못 감 글은 그 배차망 이름(shared 이름표) · 모르면 «배차망»', () => {
        expect(emergencyLabelOf(alert({ keepLost: true, targetApp: 'insung' }))).toBe('⏱️ KEEP 이 폰에 못 갔습니다 — 인성에서 자동 취소됨');
        expect(emergencyLabelOf(alert({ keepLost: true, targetApp: 'hwamul24' }))).toBe('⏱️ KEEP 이 폰에 못 갔습니다 — 24시에서 자동 취소됨');
        expect(emergencyLabelOf(alert({ keepLost: true }))).toBe('⏱️ KEEP 이 폰에 못 갔습니다 — 배차망에서 자동 취소됨');
        expect(emergencyLabelOf(alert({ keepLost: true, targetApp: '모르는앱' }))).toBe('⏱️ KEEP 이 폰에 못 갔습니다 — 배차망에서 자동 취소됨');
    });

    it('다른 까닭은 지금 글 · 모르는 까닭은 까닭 글자 그대로', () => {
        expect(emergencyLabelOf(alert({ reason: 'CANCEL_EXPIRED' }))).toBe('🔴 취소 불가 팝업! 배차실 직접 취소 요망!');
        expect(emergencyLabelOf(alert({ reason: 'NEW_THING' }))).toBe('NEW_THING');
    });
});
