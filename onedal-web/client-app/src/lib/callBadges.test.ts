import { describe, it, expect } from 'vitest';
import { modeActsOf } from '@onedal/shared';
import { drawsDecisionButtons, practiceBadgeOf, capturedHowOf } from './callBadges';

/**
 * 🏷️ **결재석 · 목록 줄이 같은 콜을 같은 말 · 같은 색으로** (29 N7 «어디서나 같게» · 34 P5 · 🔴8).
 * 결재 버튼을 그리나 · 연습 배지 · 잡은 방식을 값 함수 하나씩으로 — 두 화면과 로그가 같은 함수를 읽는다.
 * 못 잡는 것: 그 함수를 화면이 실제로 부르는지(두 부품의 마운트 검사 몫).
 */
const call = (o: Record<string, unknown>) => ({ id: 'c', type: 'NEW_ORDER', status: 'ORDER_AWAITING_DECISION', ...o }) as any;

describe('🔘 결재 버튼을 그리나', () => {
    it('🔴 연습 콜은 미리보기 · 직접 갈래여도 그린다(결재 연습)', () => {
        expect(drawsDecisionButtons(call({ isSimulated: true, isPreview: true }))).toBe(true);
        expect(drawsDecisionButtons(call({ isSimulated: true, type: 'MANUAL' }))).toBe(true);
    });
    it('알람 미리보기 · 직접 갈래는 안 그린다 · 보통 심사 콜은 그린다', () => {
        expect(drawsDecisionButtons(call({ isPreview: true }))).toBe(false);
        expect(drawsDecisionButtons(call({ type: 'MANUAL_CLICK' }))).toBe(false);
        expect(drawsDecisionButtons(call({}))).toBe(true);
    });
});

describe('🐥 연습 배지', () => {
    it('🔴 색은 모드 표의 «자동(계약 안 함)» 색 하나 — 결재석 · 목록 줄이 같은 노랑', () => {
        expect(practiceBadgeOf(call({ isSimulated: true }))?.tone).toBe(modeActsOf('SIMULATION').tone);
    });
    it('끝난 연습 콜은 «연습 끝» · 심사 중은 «연습» · 연습이 아니면 없음', () => {
        expect(practiceBadgeOf(call({ isSimulated: true, status: 'SAFE_CANCEL' }))?.text).toBe('🐥 연습 끝');
        expect(practiceBadgeOf(call({ isSimulated: true }))?.text).toBe('🐥 연습');
        expect(practiceBadgeOf(call({}))).toBeNull();
    });
});

describe('🖱️ 잡은 방식', () => {
    it('🔴 새 칸(그때 도는 모드)이 알람이면 🔔 — 옛 칸이 MANUAL 이어도', () => {
        expect(capturedHowOf(call({ capturedMode: 'ALARM', capturedVia: 'MANUAL' }))).toEqual({ icon: '🔔', label: '🔔 알람콜' });
    });
    it('새 칸이 없는 옛 줄은 옛 칸으로 · 알람이 아니면 ✋ 직접콜', () => {
        expect(capturedHowOf(call({ capturedVia: 'ALARM' })).icon).toBe('🔔');
        expect(capturedHowOf(call({ capturedMode: 'AUTO' }))).toEqual({ icon: '✋', label: '✋ 직접콜' });
        expect(capturedHowOf(call({})).icon).toBe('✋');
    });
});
