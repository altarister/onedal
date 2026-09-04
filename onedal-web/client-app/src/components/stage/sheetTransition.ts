import type { SheetSnap } from './StageSheet';

/**
 * 🪟 **어느 단으로 갈 때 아코디언은 어떻게 되나** (기사님 정의 2026-09-05)
 *
 * ── 왜 함수로 뽑았나 ──
 * 🔴 **손잡이가 둘이면 갈라진다** (규칙 ③). 시트를 끌 때와 조작판에서 누를 때가
 *    각자 높이를 정하고 있었고, 조작판 쪽은 전이 규칙을 **건너뛰었다.**
 *    그래서 «시트는 100% 인데 아코디언이 다 닫혀 아래가 텅 빈» 화면이 나왔다 —
 *    기사님이 «이 화면은 있을 수 없는 경우의 수다» 라고 하신 그것이다 (2026-09-05).
 *
 * ── 기사님이 정한 세 단 ──
 * | 가 `peek` | 시트 상태바만 |
 * | 나 `list` | 상태바 + 아코디언 타이틀 전부 (+ 판정 영역) |
 * | 다 `full` | 지도 자리까지 다 쓰고 **하나만 열린** 상태 |
 *
 * 🔴 «다»의 정의에 **«하나 열린»이 들어 있다.** 그러니 열린 것 없이 «다»에 서는 상태는
 *    정의상 존재하지 않는다 — 규칙이 그것을 만들지 않게 막는다.
 */
export interface SheetMove {
    snap: SheetSnap;
    /** 열어 둘 콜의 자리 — `-1` 은 전부 닫힘 */
    openIdx: number;
}

export function sheetTransition(
    next: SheetSnap,
    now: { openIdx: number; callCount: number; preferIdx?: number },
): SheetMove {
    const { openIdx, callCount } = now;

    if (next === 'full') {
        /* 🔴 열 것이 하나도 없으면 «다»가 될 수 없다 — 빈 자리가 지도를 덮을 뿐이다.
           콜이 없는 판(콜 대기 등)에서는 «나»에 선다. */
        if (callCount <= 0) return { snap: 'list', openIdx: -1 };
        if (openIdx >= 0) return { snap: 'full', openIdx };
        /* 열린 것이 없으면 **다음 갈 콜**을 연다 — 없으면 첫 콜 */
        const pick = now.preferIdx != null && now.preferIdx >= 0 && now.preferIdx < callCount
            ? now.preferIdx : 0;
        return { snap: 'full', openIdx: pick };
    }

    /* 🔴 «가»·«나»는 **열린 것이 없는** 단이다 — 열린 채로 내려오면 시트 안 것이
       시트 높이를 벗어난다 (기사님 정의 두 번째 줄). */
    return { snap: next, openIdx: -1 };
}
