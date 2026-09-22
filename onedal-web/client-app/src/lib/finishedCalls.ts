import { isDeliveredCall, isEvaluating } from '@onedal/shared';

/**
 * 📋 **끝난 콜을 갈래로 나누는 규칙 — 한 벌**
 *
 * 두 곳이 같은 목록을 그린다:
 *   · ☰ 서랍 `FinishedCalls` — 새 화면의 자리 (폰에서도 보인다)
 *   · 옛 화면 `PinnedRoute` 의 탭 줄 — 토글을 지울 때까지
 *
 * 🔴 **거르는 규칙을 양쪽에 적지 않는다** (규칙 ③). 적으면 한쪽만 고쳐져,
 *    «취소 탭에는 있는데 서랍에는 없는» 콜이 생긴다. 이 레포가 여러 번 당한 모양이다.
 *
 * ⚠️ 여기는 **고르고 줄 세우는 것**만 한다 — 어떻게 그리는지는 부르는 쪽이 정한다
 *    (서랍은 한 줄 요약, 옛 화면은 콜 카드).
 */

/**
 * 🔴 **«콜처럼 생긴 것»이면 받는다** — `SecuredOrder` 를 통째로 요구하지 않는다.
 *    이 계산에 필요한 것은 세 칸뿐이고, 좁게 받아야 검사가 세 칸짜리 표본으로 돈다.
 *    `capturedAt` 이 없을 수 있다는 것도 여기 적힌 대로다 (아래 정렬이 이미 그렇게 다룬다).
 */
export type CallLike = {
    id: string;
    status?: string | null;
    capturedAt?: string | null;
};

/** 콜 목록의 갈래. `ALL` 은 옛 화면 탭에만 있다 — 서랍은 셋만 쓴다 */
export type CallView = 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL';

/** 서랍이 쓰는 셋 — 화면에 그릴 이름·표시와 함께 */
export const FINISHED_TABS: { key: Exclude<CallView, 'ACTIVE' | 'ALL'>; label: string; mark: string }[] = [
    { key: 'COMPLETED', label: '완료됨', mark: '✅' },
    { key: 'CANCELED', label: '취소', mark: '❌' },
    { key: 'RELEASED', label: '방출', mark: '↩️' },
];

/**
 * 이 콜이 그 갈래에 드나.
 *
 * @param inCycleDeck 지금 사이클의 «진행 중» 덱에 아직 있나.
 *   🔴 하차를 마쳐도 사이클이 도는 동안에는 진행 중에 남는다 — 그때 완료됨에도 넣으면
 *      **같은 콜이 두 탭에 동시에 보인다.**
 */
export function belongsToView(
    call: CallLike,
    view: CallView,
    inCycleDeck: boolean,
): boolean {
    switch (view) {
        // 하차 보고(ORDER_DELIVERED)가 곧 배송 완료다
        case 'COMPLETED': return isDeliveredCall(call) && !inCycleDeck;
        case 'CANCELED': return call.status === 'SAFE_CANCEL';
        case 'RELEASED': return call.status === 'ORDER_RELEASED_BY_ME'
                             || call.status === 'ORDER_RELEASED_BY_OFFICE';
        case 'ALL': return true;
        // 진행 중은 덱이 담당한다 — 여기로 오지 않는다
        case 'ACTIVE': return false;
    }
}

/**
 * 그 갈래의 콜을 골라 줄 세운다 — **나중에 잡은 것이 위로**.
 * 심사 중인 콜은 늘 맨 위다 (`ALL` 에서만 나온다 — 끝난 콜에는 심사 중이 없다).
 */
export function callsInView<T extends CallLike>(
    calls: readonly T[],
    view: CallView,
    cycleDeckIds: ReadonlySet<string>,
): T[] {
    return calls
        .filter(c => belongsToView(c, view, cycleDeckIds.has(c.id)))
        .sort((a, b) => {
            const aEval = isEvaluating(a.status ?? undefined);
            const bEval = isEvaluating(b.status ?? undefined);
            if (aEval && !bEval) return -1;
            if (!aEval && bEval) return 1;
            const ta = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
            const tb = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
            return tb - ta;
        });
}

/** 갈래마다 몇 건인가 — 탭에 숫자를 적는다 */
export function countsByView<T extends CallLike>(
    calls: readonly T[],
    cycleDeckIds: ReadonlySet<string>,
): Record<Exclude<CallView, 'ACTIVE' | 'ALL'>, number> {
    const out = { COMPLETED: 0, CANCELED: 0, RELEASED: 0 };
    for (const t of FINISHED_TABS) {
        out[t.key] = calls.filter(c => belongsToView(c, t.key, cycleDeckIds.has(c.id))).length;
    }
    return out;
}

/** 끝난 콜이 한 건이라도 있나 — 서랍 배지에 쓴다 */
export function finishedCount<T extends CallLike>(
    calls: readonly T[],
    cycleDeckIds: ReadonlySet<string>,
): number {
    const c = countsByView(calls, cycleDeckIds);
    return c.COMPLETED + c.CANCELED + c.RELEASED;
}
