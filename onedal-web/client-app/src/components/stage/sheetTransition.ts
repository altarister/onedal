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
        /**
         * 🔴 **콜이 없어도 올라간다 — 빈 상태를 보여 준다** (기사님 확정 2026-09-05).
         *
         * 한때 «열 것이 없으면 «나»에 선다»로 막았다. 그러면 끌었는데 아무 일이 없어
         * **고장처럼 보인다.** 관행(iOS·안드로이드 기본 시트)은 **단이 내용과 무관하게
         * 늘 있고**, 안에 «아직 없습니다»를 보여 주는 쪽이다. 그 길로 간다.
         *
         * 그러니 «다»의 정의는 «**콜이 있으면** 하나 열린 상태»로 좁혀진다.
         */
        if (callCount <= 0) return { snap: 'full', openIdx: -1 };
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

/**
 * 🪧 **심사가 들어오면 시트가 「나」까지 올라온다** (기사님 2026-09-05).
 *
 * 🔴 **「가」는 상태바만 보이는 높이(72px)라 판정이 들어갈 자리가 없다.** 그대로 두면
 *    주행 중에 합짐 심사가 와도 **화면에 아무것도 안 뜬다** — 30초 안에 결정해야 하는데
 *    보이지도 않는다. 안전취소가 흘러 자동으로 취소된다.
 *
 * 🔴 **이것은 «지도가 뛰지 않게» 걷어낸 곁다리들과 다르다.** 그때 없앤 것은 «판을 골랐더니
 *    시트가 따라 움직이는» 이유 없는 움직임이었다. 이건 **이유가 있다** — 지금 봐야 할
 *    것이 생겼다는 신호다. 그리고 30초 뒤 제자리로 돌아간다.
 *
 * ⚠️ 「나」·「다」에 있으면 그대로 둔다 — 이미 보이니 건드릴 이유가 없다.
 */
export function snapOnJudging(current: SheetSnap): SheetSnap {
    return current === 'peek' ? 'list' : current;
}

/**
 * 🪧 **심사가 끝나면 원래 자리로** — 올렸던 경우에만 되돌린다.
 *
 * 🔴 주행 중이었으면 다시 내려가야 한다. 안 그러면 심사 하나 때문에 **남은 주행 내내
 *    지도가 가려진다.** 올린 적이 없으면(기사님이 손으로 올려 두셨으면) 그대로 둔다 —
 *    손이 이긴다.
 */
export function snapAfterJudging(current: SheetSnap, raisedFrom: SheetSnap | null): SheetSnap {
    return raisedFrom && current === 'list' ? raisedFrom : current;
}
