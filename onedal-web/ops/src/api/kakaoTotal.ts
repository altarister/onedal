import type { OpsBoardKakao } from '@onedal/shared';

/** 카카오 호출 합계 — 서버가 준 줄들의 덧셈(서버는 합을 따로 주지 않는다 — 같은 숫자를 두 벌로 두지 않게) */
export function kakaoTotalOf(rows: OpsBoardKakao['rows']): { route: { today: number; month: number }; local: { today: number; month: number } } {
    const sum = (pick: (r: OpsBoardKakao['rows'][number]) => number) => rows.reduce((n, r) => n + pick(r), 0);
    return {
        route: { today: sum(r => r.route.today), month: sum(r => r.route.month) },
        local: { today: sum(r => r.local.today), month: sum(r => r.local.month) },
    };
}
