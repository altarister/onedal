import {
    ALL_ORDER_STATUSES, EVALUATING_STATUSES, TERMINAL_STATUSES, RESTORABLE_STATUSES,
    isEvaluating, isTerminal,
} from '@onedal/shared';

/**
 * 🔴 2026-08-11 사고의 재발 방지.
 *
 * 복구 대상 상태 목록이 **세 군데에 손으로 적혀** 있었고 서로 갈라졌다.
 * Phase 8.3 이 `ORDER_PICKED_UP` · `ORDER_DELIVERED` 를 만들면서
 * 복구 쿼리에 넣는 걸 빠뜨렸고, **짐을 실은 채 새로고침하면 콜이 사라졌다.**
 * 서버는 빈 차로 착각해 1t 콜까지 잡으러 갔다.
 *
 * 이 파일의 목적은 "지금 맞는지"가 아니라
 * **새 상태를 추가할 때 결정을 강제하는 것**이다.
 */
describe('상태 목록은 단일 출처에서 파생된다', () => {
    it('🔴 모든 상태는 평가 중이거나 복구 대상이다 — 새 상태를 추가하면 여기서 걸린다', () => {
        const covered = new Set([...EVALUATING_STATUSES, ...RESTORABLE_STATUSES]);
        const missing = ALL_ORDER_STATUSES.filter(s => !covered.has(s));
        expect(missing).toEqual([]);
        expect(covered.size).toBe(ALL_ORDER_STATUSES.length);
    });

    it('평가 중과 복구 대상은 겹치지 않는다', () => {
        const overlap = RESTORABLE_STATUSES.filter(s => EVALUATING_STATUSES.includes(s));
        expect(overlap).toEqual([]);
    });

    it('🔴 상차·하차한 콜은 반드시 복구된다 (이번 사고의 직접 원인)', () => {
        expect(RESTORABLE_STATUSES).toContain('ORDER_PICKED_UP');
        expect(RESTORABLE_STATUSES).toContain('ORDER_DELIVERED');
    });

    it('종결 상태도 복구된다 — 완료됨·취소/방출 탭이 새로고침 후에도 차 있어야 한다', () => {
        for (const s of TERMINAL_STATUSES) expect(RESTORABLE_STATUSES).toContain(s);
    });

    it('평가 중 상태는 복구하지 않는다 — 서버 메모리에만 존재한다', () => {
        for (const s of EVALUATING_STATUSES) expect(RESTORABLE_STATUSES).not.toContain(s);
    });

    it('상차 중인 콜은 종결이 아니다 — 종결이면 적재 계산에서 빠져 빈 차가 된다', () => {
        expect(isTerminal('ORDER_PICKED_UP')).toBe(false);
        expect(isEvaluating('ORDER_PICKED_UP')).toBe(false);
    });

    it('하차한 콜은 종결이다 — 적재 용량이 회복되어야 다음 짐을 잡는다', () => {
        expect(isTerminal('ORDER_DELIVERED')).toBe(true);
    });

    it('ALL_ORDER_STATUSES 에 중복이 없다', () => {
        expect(new Set(ALL_ORDER_STATUSES).size).toBe(ALL_ORDER_STATUSES.length);
    });
});
