import {
    ALL_ORDER_STATUSES, EVALUATING_STATUSES, TERMINAL_STATUSES, RESTORABLE_STATUSES,
    isEvaluating, isTerminal,
    IN_PROGRESS_STATUSES, UNFINISHED_RESTORE_DAYS, restoreWindow,
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

/**
 * [T5 · 임시 안전판] 미완료 콜은 날짜와 무관하게 되살린다 (3일 상한).
 *
 * 🔴 복구 쿼리가 `timestamp >= 오늘 자정` 이라 **전날 상차한 콜이 사라졌다.**
 *    전날 상차 → 다음날 배송하는 운행이 통째로 깨진다.
 *    Phase 7(영업일)이 들어오면 이 블록은 삭제된다.
 */
describe('복구 시간 창', () => {
    // 2026-08-11 14:00 KST 기준으로 고정해서 잰다
    const NOW = new Date('2026-08-11T05:00:00.000Z').getTime();

    it('진행 중 상태는 확정과 상차 완료 둘뿐이다', () => {
        expect([...IN_PROGRESS_STATUSES].sort())
            .toEqual(['ORDER_CONFIRMED', 'ORDER_PICKED_UP']);
    });

    it('진행 중 상태에 종결이 섞이지 않는다 — 섞이면 끝난 콜이 되살아난다', () => {
        for (const s of IN_PROGRESS_STATUSES) expect(isTerminal(s)).toBe(false);
    });

    it('미완료 창이 오늘 창보다 넓다', () => {
        const w = restoreWindow(NOW);
        expect(new Date(w.unfinishedSinceIso).getTime())
            .toBeLessThan(new Date(w.todayStartIso).getTime());
    });

    it('🔴 어제 상차한 콜이 미완료 창에 들어온다 (이번에 고친 것)', () => {
        const w = restoreWindow(NOW);
        const yesterday = new Date(NOW - 20 * 3600_000).toISOString();   // 20시간 전
        expect(yesterday >= w.todayStartIso).toBe(false);          // 오늘 창에는 안 들어온다
        expect(yesterday >= w.unfinishedSinceIso).toBe(true);      // 미완료 창에는 들어온다
    });

    it('상한(3일)을 넘긴 콜은 어느 창에도 안 들어온다 — 그래서 경고를 띄운다', () => {
        const w = restoreWindow(NOW);
        const old = new Date(NOW - (UNFINISHED_RESTORE_DAYS + 1) * 86_400_000).toISOString();
        expect(old >= w.unfinishedSinceIso).toBe(false);
    });

    it('상한은 정확히 3일이다 (기사님 결정 2026-08-11)', () => {
        expect(UNFINISHED_RESTORE_DAYS).toBe(3);
    });
});
