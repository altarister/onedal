/**
 * 📋 **상차 목록 — 이름 규칙과 다시 만드는 때** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 *
 * 🔴 **상차 영역의 모양은 여기 없다** — shared `filterArea.pickupShapeOf` 한 곳이다 (`docs/지금/필터.md` «상차 영역»).
 *    계산은 서버 `geoService.pickupListFor`, 그림은 관제웹 «상차» 레이어가 같은 함수를 부른다.
 *
 * 2026-09-15 이천 왕복 03:08:52 D3: 되돌아가는 경로에서 다시 지날 신둔면을 «지나왔다»며 빼고(동마다 경로 km 한 값),
 * 원달앱 경로 순서 필터가 집 가는 앞길 위 좋은 콜을 막았다. 뒤쪽은 «경로 몇 km»가 아니라 **«지금 내 위치 둘레»** 로 뺀다.
 */
import { haversineKm } from './callNet';

/** 📏 이만큼 움직이면 상차 목록을 다시 만든다 — 기사님 확정 2026-09-15 (실측 36초에 한 번 · 시간당 4~10KB) */
export const PICKUP_LIST_MOVE_KM = 0.5;

/**
 * 🔴 **읍·면·동 이름만** — 시·구·군이 섞이면 «분당구»처럼 동 없이 온 상차지가 토큰 대조로 새어 나간다 (기사님 ③ 가 · 픽커 카드).
 */
export function isPickupListName(name: string): boolean {
    return /(동|읍|면|가|리)$/.test(name) && !/(시|구|군)$/.test(name);
}

/** 다시 만들까 — 처음이면 만든다 · 위치를 모르면 안 만든다 · 0.5km 넘게 움직였으면 */
export function pickupListNeedsRebuild(last: { x: number; y: number } | null, here: { x: number; y: number } | null, km = PICKUP_LIST_MOVE_KM): boolean {
    if (!here) return false;
    if (!last) return true;
    return haversineKm({ lng: last.x, lat: last.y }, { lng: here.x, lat: here.y }) > km;
}
