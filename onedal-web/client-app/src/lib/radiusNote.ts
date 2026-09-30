import { radiusScaleOf, reservedPickupRadiusKmOf, RADIUS_BASE_KM_DEFAULT, type ReservationMode } from '@onedal/shared';

/**
 * 📏 **필터 화면의 반경 설명 한 줄** — 숫자는 전부 이미 있는 값(`radiusDistanceKm` · `radiusBaseKm` · `radiusScaleOf`)에서 온다.
 *    기준거리는 «줄이기 시작하는 문턱»이다 — 잰 거리가 그보다 멀면 배율 1.0 이라 기준거리를 밀어도 반경이 그대로다. 까닭만 보인다.
 * 📅 자동으로 줄였고 내일 콜을 받으면(«오늘 콜만»이 아니면) — 내일 콜은 줄이지 않은 기본 상차 반경 그대로임을 붙인다 (기사님 «가»).
 *    그 값은 서버 판정·앱 알람 필터와 같은 함수(`reservedPickupRadiusKmOf`)다.
 */
export function radiusScaleNoteOf(
    filter: { radiusDistanceKm?: number | null; radiusBaseKm?: number; reservationMode?: ReservationMode } | null | undefined,
    base: { pickupRadiusKm?: number | null } | null | undefined,
): string {
    const d = filter?.radiusDistanceKm;
    const b = filter?.radiusBaseKm ?? RADIUS_BASE_KM_DEFAULT;
    if (!Number.isFinite(d as number)) return '거리를 못 재서 배율 ×1.0 — 반경은 원값 그대로입니다';
    const dKm = Math.round((d as number) * 10) / 10;
    const s = radiusScaleOf(d, b);
    if (s >= 1) return `목적지가 ${dKm}km 라 기준거리 ${b}km 로는 안 줄어듭니다 — ${dKm}km 위로 올려야 줄어듭니다`;
    const line = `목적지(${dKm}km)가 기준거리 ${b}km 보다 가까워 반경 넷을 ×${Math.round(s * 100) / 100} 로 줄였습니다`;
    const reservedR = reservedPickupRadiusKmOf(base);
    return (filter?.reservationMode ?? 'today') !== 'today' && reservedR != null
        ? `${line} · 내일 콜은 줄이지 않은 ${reservedR}km 그대로` : line;
}
