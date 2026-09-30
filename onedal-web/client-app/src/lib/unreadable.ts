import { getAddressLabel } from './routeUtils';
import { clockText } from "@onedal/shared";

/**
 * ⚪ **평가 자리의 «판정 못 함»** (기사님 «가» · onedal-1f) — 손으로 연 상세를 앱이 못 읽어 콜을 버렸을 때 서버가 보낸 한 줄.
 * 진짜 판정이 오면(`order-evaluating`) 판정석으로 바뀌고, 폰이 상세에서 나가면(`detail-unreadable-clear`) 사라진다.
 */
export interface Unreadable { reason: string; pickup: string | null; fare: number | null; at: string }
type UnreadableEvent = { type: 'unreadable'; body: Unreadable } | { type: 'evaluating' } | { type: 'clear' };

export function unreadableAfter(_state: Unreadable | null, ev: UnreadableEvent): Unreadable | null {
    return ev.type === 'unreadable' ? ev.body : null;
}

/** 두 줄 — «⚪ 판정 못 함 — 요금을 못 읽음» · «19:46:24 · 광남2동 · 1.1만» (받은 시각: 늦게 닿은 옛 보고를 알아보게) */
export function unreadableLine(u: Unreadable): { head: string; sub: string } {
    const at = clockText(u.at) ?? '--:--:--';   // 🕐 한 모양은 shared
    const parts = [at, u.pickup ? getAddressLabel(u.pickup) : '상차 모름', u.fare ? `${(u.fare / 10000).toFixed(1)}만` : null];
    return { head: `⚪ 판정 못 함 — ${u.reason}`, sub: parts.filter(Boolean).join(' · ') };
}

/** 👁️ 요소가 창 안에 보이는가 — 높이가 있고 창의 위아래 안에 걸치면 예. 접힌 시트 아래 · 스크롤 밖이면 아니오 */
export function visibleIn(rect: { top: number; bottom: number; height: number }, viewportH: number): boolean {
    return rect.height > 0 && rect.bottom > 0 && rect.top < viewportH;
}

/**
 * 🪧 **평가 자리가 차 있나** — 판정 중 콜이 있거나 ⚪ 가 떠 있다. 시트 규칙(`stageStep` 의 `judging` 신호)이 이것을 받는다 —
 *    ⚪ 는 손으로 상세를 연 순간의 판정 결과라 진짜 판정과 같은 길로 시트를 올리고 내린다(같은 순서, 다른 것은 인자).
 */
export function seatOccupied(judging: { id: string } | null | undefined, unreadable: Unreadable | null | undefined): boolean {
    return !!judging || !!unreadable;
}

/** 🔑 평가 자리의 열쇠 — 바뀔 때마다 시트 규칙에 `judge` 한 번. 판정 중 콜이 먼저, 없으면 ⚪ 의 받은 시각 */
export function seatKeyOf(judgingId: string | null, unreadable: Unreadable | null | undefined): string | null {
    return judgingId ?? (unreadable ? `unreadable:${unreadable.at}` : null);
}
