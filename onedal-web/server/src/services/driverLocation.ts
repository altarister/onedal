import { originOf } from "./geoService";

/**
 * 📍 **기사의 «지금 자리» — 서버가 경로를 그릴 때 쓰는 바로 그 기점** (originOf 가 지금 고른다 · 저장된 칸을 읽지 않는다).
 *    관제웹 현황판 «📍 내 위치»(GET /api/sim/driver-location)와 운영센터 회원 상세(GET /api/ops/board/member)가 같이 부른다 — 두 벌 금지.
 *    source 는 온 그대로(gps · mock · manual · home) — 여기서 다시 판단하지 않는다. 모르면 null.
 */
export function driverLocationOf(session: Parameters<typeof originOf>[0] & { lastFixAt?: number | null }) {
    const loc = originOf(session);
    if (!loc) return null;
    return { x: loc.x, y: loc.y, isFallback: loc.isFallback, at: session.lastFixAt ?? null, source: loc.source };
}
