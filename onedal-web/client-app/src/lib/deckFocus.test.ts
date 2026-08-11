import { describe, it, expect } from 'vitest';
import { pickAutoFocus } from './deckFocus';
import type { OrderStatus } from '@onedal/shared';

const o = (id: string, status: string) => ({ id, status: status as OrderStatus });

/**
 * 자동 이동은 **기사님 손에서 화면을 뺏는 동작**이다.
 * 통화 중에 엉뚱한 카드로 넘어가면 다른 콜의 칩을 누르게 된다.
 * 그래서 "언제 옮기지 않는가"를 옮기는 조건보다 더 촘촘히 건다.
 */
describe('pickAutoFocus — 새 콜로 화면을 옮길 것인가', () => {
    it('첫 렌더에서는 옮기지 않는다 — 처음엔 전부 새 콜이라 무조건 튄다', () => {
        expect(pickAutoFocus(null, [o('a', 'ORDER_SECURED_EVALUATING')])).toBeNull();
    });

    it('🔴 새 평가중 콜이 오면 그리로 옮긴다 (30초 안에 결재해야 한다)', () => {
        const seen = new Set(['a']);
        expect(pickAutoFocus(seen, [o('new', 'ORDER_SECURED_EVALUATING'), o('a', 'ORDER_CONFIRMED')]))
            .toBe('new');
    });

    it('데스밸리 결재 대기 상태도 대상이다', () => {
        expect(pickAutoFocus(new Set(['a']), [o('new', 'ORDER_AWAITING_DECISION')])).toBe('new');
    });

    it('🔴 이미 확정된 콜이 새로 와도 옮기지 않는다 — 통화 중 입력을 뺏지 않는다', () => {
        expect(pickAutoFocus(new Set(['a']), [o('new', 'ORDER_CONFIRMED'), o('a', 'ORDER_CONFIRMED')]))
            .toBeNull();
    });

    it('상차 완료된 콜이 목록에 새로 나타나도 옮기지 않는다 (재접속 복구 등)', () => {
        expect(pickAutoFocus(new Set(['a']), [o('new', 'ORDER_PICKED_UP')])).toBeNull();
    });

    it('이미 본 평가중 콜로는 다시 옮기지 않는다 — 매 렌더 튀면 조작이 불가능하다', () => {
        const seen = new Set(['a']);
        expect(pickAutoFocus(seen, [o('a', 'ORDER_SECURED_EVALUATING')])).toBeNull();
    });

    it('새 콜이 여럿이면 목록 순서(평가중 먼저·최신순)대로 첫 번째', () => {
        expect(pickAutoFocus(new Set(), [
            o('x', 'ORDER_AWAITING_DECISION'), o('y', 'ORDER_SECURED_EVALUATING'),
        ])).toBe('x');
    });

    it('목록이 비면 옮길 곳이 없다', () => {
        expect(pickAutoFocus(new Set(['a']), [])).toBeNull();
    });
});
