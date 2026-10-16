import { radiusScaleOf, reservedPickupRadiusKmOf, RADIUS_BASE_KM_DEFAULT, type ReservationMode } from '@onedal/shared';

/**
 * 📏 **필터 화면의 반경 설명 한 줄** — 숫자는 전부 이미 있는 값(`radiusDistanceKm` · `radiusBaseKm` · `radiusScaleOf`)에서 온다.
 *    배율 = 목적지 거리 ÷ 기준거리(상한 없음) — 멀면 늘리고, 가까우면 줄이고, 같으면 그대로다. 까닭만 보인다.
 * 📅 늘리거나 줄였고 내일 콜을 받으면(«오늘 콜만»이 아니면) — 내일 콜은 기준값 상차 반경 그대로임을 붙인다 (기사님 «가»).
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
    if (s === 1) return `목적지가 ${dKm}km 로 기준거리 ${b}km 와 같아 반경은 기준값 그대로입니다`;
    const x = Math.round(s * 100) / 100;
    const line = s > 1
        ? `목적지(${dKm}km)가 기준거리 ${b}km 보다 멀어 반경 넷을 ×${x} 로 늘렸습니다`
        : `목적지(${dKm}km)가 기준거리 ${b}km 보다 가까워 반경 넷을 ×${x} 로 줄였습니다`;
    const reservedR = reservedPickupRadiusKmOf(base);
    return (filter?.reservationMode ?? 'today') !== 'today' && reservedR != null
        ? `${line} · 내일 콜은 기준값 ${reservedR}km 그대로` : line;
}
