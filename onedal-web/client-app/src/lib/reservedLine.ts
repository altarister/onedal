import type { SecuredOrder } from '@onedal/shared';
import { getAddressLabel } from './routeUtils';
import { verdictOf, VERDICT_DOT } from './verdict';

/**
 * 📅 **서랍 «예약» 칸의 한 줄** (reviews/23 B-4) — 먼발치 1~2초에 읽히게 «날 · 상차 시각 · 상차→하차 · 요금 · 색» 그 순서.
 * 🔴 모르는 칸은 지어내지 않는다 — 시각이 없으면 «--:--», 판정이 없으면 «—» (규칙 ④).
 */
export function reservedLineOf(c: SecuredOrder & { reservedFor?: string; reservedAt?: string | null }): {
    day: string; at: string; route: string; fare: string; dot: string; text: string;
} {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(c.reservedFor ?? '');
    const day = m ? `${Number(m[1])}/${Number(m[2])}` : '—';
    const at = c.reservedAt && /^\d{1,2}:\d{2}$/.test(c.reservedAt) ? c.reservedAt : '--:--';
    const route = `${getAddressLabel(c.pickup)} → ${getAddressLabel(c.dropoff)}`;
    const fare = c.fare == null ? '—' : `${(c.fare / 10000).toFixed(1)}만`;
    const color = verdictOf(c as any).color;
    const dot = color ? VERDICT_DOT[color] : '—';
    return { day, at, route, fare, dot, text: `${day} · ${at} · ${route} · ${fare} · ${dot}` };
}
