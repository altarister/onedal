import { getAddressLabel } from './routeUtils';

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
    const d = new Date(u.at);
    const p = (n: number) => String(n).padStart(2, '0');
    const at = Number.isFinite(d.getTime()) ? `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` : '--:--:--';
    const parts = [at, u.pickup ? getAddressLabel(u.pickup) : '상차 모름', u.fare ? `${(u.fare / 10000).toFixed(1)}만` : null];
    return { head: `⚪ 판정 못 함 — ${u.reason}`, sub: parts.filter(Boolean).join(' · ') };
}
