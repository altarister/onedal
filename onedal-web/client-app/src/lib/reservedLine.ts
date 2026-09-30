import { reservedForOf, WEEKDAY_KO, type SecuredOrder } from '@onedal/shared';
import { getAddressLabel } from './routeUtils';
import { verdictOf, VERDICT_DOT } from './verdict';

const partsOf = (reservedFor: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reservedFor ?? '');
    return m ? { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) } : null;
};

/** 📅 보관 날 글자 «10/3(토)» — 서랍 줄과 판정석 알약이 같이 쓴다. 요일은 보관 날 기준. 모르면 «—» */
export function reservedDayLabel(reservedFor: string | null | undefined): string {
    const p = partsOf(reservedFor);
    return p ? `${p.mo}/${p.d}(${WEEKDAY_KO[new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()]})` : '—';
}

type ReservedFields = { reservedFor?: string | null; reservedDay?: number | null; reservedAt?: string | null; capturedAt?: string };
/** 보관 날 — 적힌 것(`reservedFor` · 보관된 콜)이 먼저, 없으면 잡은 날 + `reservedDay`(서버와 같은 `reservedForOf`). 오늘 콜이면 null */
const reservedDayOf = (c: ReservedFields) => c.reservedFor || reservedForOf(c);

/** 📅 상태바 한 줄 심사석의 짧은 꼴 «10/3» (시각·요일 없음) — 오늘 콜이면 null */
export function reservedShortOf(c: ReservedFields): string | null {
    const p = partsOf(reservedDayOf(c));
    return p ? `${p.mo}/${p.d}` : null;
}

/**
 * 📅 **판정석의 예약 알약** — 손으로 연 예약 콜을 오늘 콜로 보고 수락하지 않게 (onedal-1f · 기사님 «가»).
 * 보관 날은 적힌 것(`reservedFor` · 보관된 콜)이 먼저, 없으면 잡은 날 + `reservedDay`(서버와 같은 `reservedForOf`).
 * 오늘 콜(0 · 없음)이면 null — 아무것도 안 그린다. 시각을 모르면 «시각 모름» (지어내지 않는다).
 */
export function reservedBadgeOf(c: ReservedFields): string | null {
    const day = reservedDayOf(c);
    if (!day) return null;
    const at = c.reservedAt && /^\d{1,2}:\d{2}$/.test(c.reservedAt) ? c.reservedAt : '시각 모름';
    return `📅 ${reservedDayLabel(day)} ${at} 예약`;
}

/**
 * 📅 **서랍 «예약» 칸의 한 줄** (reviews/23 B-4) — 먼발치 1~2초에 읽히게 «날 · 상차 시각 · 상차→하차 · 요금 · 색» 그 순서.
 * 🔴 모르는 칸은 지어내지 않는다 — 시각이 없으면 «--:--», 판정이 없으면 «—» (규칙 ④).
 */
export function reservedLineOf(c: SecuredOrder & { reservedFor?: string; reservedAt?: string | null }): {
    day: string; at: string; route: string; fare: string; dot: string; text: string;
} {
    const day = reservedDayLabel(c.reservedFor);
    const at = c.reservedAt && /^\d{1,2}:\d{2}$/.test(c.reservedAt) ? c.reservedAt : '--:--';
    const route = `${getAddressLabel(c.pickup)} → ${getAddressLabel(c.dropoff)}`;
    const fare = c.fare == null ? '—' : `${(c.fare / 10000).toFixed(1)}만`;
    const color = verdictOf(c as any).color;
    const dot = color ? VERDICT_DOT[color] : '—';
    return { day, at, route, fare, dot, text: `${day} · ${at} · ${route} · ${fare} · ${dot}` };
}
