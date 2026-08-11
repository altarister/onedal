import { describe, it, expect } from 'vitest';
import { pickAutoFocus, deckOrder } from './deckFocus';
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

/**
 * 🔴 스와이프 오작동의 뿌리. 순서가 흔들리면 손가락과 화면이 어긋난다.
 * 기사님: *"새 아이디 들어온 것을 시간순으로 인덱스 주면 해결될 듯"*
 */
describe('deckOrder — 덱에 카드를 놓는 순서', () => {
    const c = (id: string, capturedAt: string, status = 'ORDER_CONFIRMED') => ({ id, capturedAt, status });

    it('잡은 시간순으로 놓는다 (오래된 것이 앞)', () => {
        const out = deckOrder([
            c('c', '2026-08-12T10:00:00Z'), c('a', '2026-08-12T08:00:00Z'), c('b', '2026-08-12T09:00:00Z'),
        ]);
        expect(out.map(o => o.id)).toEqual(['a', 'b', 'c']);
    });

    it('🔴 새 콜은 **뒤에 붙는다** — 기존 위치가 안 밀린다', () => {
        const before = deckOrder([c('a', '2026-08-12T08:00:00Z'), c('b', '2026-08-12T09:00:00Z')]);
        const after = deckOrder([...before, c('new', '2026-08-12T10:00:00Z')]);
        expect(after.map(o => o.id)).toEqual(['a', 'b', 'new']);
        // 앞의 두 칸은 그대로여야 한다. 밀리면 스와이프 도중 카드가 바뀐다
        expect(after.slice(0, 2).map(o => o.id)).toEqual(before.map(o => o.id));
    });

    it('🔴 평가중이 확정으로 바뀌어도 자리가 안 움직인다 (예전 정렬의 재배치 원인)', () => {
        const evaluating = deckOrder([
            c('a', '2026-08-12T08:00:00Z'), c('b', '2026-08-12T09:00:00Z', 'ORDER_SECURED_EVALUATING'),
        ]);
        const confirmed = deckOrder([
            c('a', '2026-08-12T08:00:00Z'), c('b', '2026-08-12T09:00:00Z', 'ORDER_CONFIRMED'),
        ]);
        expect(confirmed.map(o => o.id)).toEqual(evaluating.map(o => o.id));
    });

    it('원본 배열을 건드리지 않는다', () => {
        const src = [c('b', '2026-08-12T09:00:00Z'), c('a', '2026-08-12T08:00:00Z')];
        deckOrder(src);
        expect(src.map(o => o.id)).toEqual(['b', 'a']);
    });

    it('시각이 없으면 맨 앞으로 (0 으로 취급) — 순서가 흔들리지만 않으면 된다', () => {
        const out = deckOrder([c('a', '2026-08-12T08:00:00Z'), { id: 'x', status: 'ORDER_CONFIRMED' } as any]);
        expect(out[0].id).toBe('x');
    });
});
