/**
 * 📋 **상차 목록 — 이름 규칙과 다시 만드는 때** (기사님 확정).
 *
 * 🔴 **상차 영역의 모양은 여기 없다** — shared `filterArea.pickupShapeOf` 한 곳이다.
 *    계산은 서버 `geoService.pickupListFor`, 그림은 관제웹 «상차» 레이어가 같은 함수를 부른다.
 *
 * 🔴 뒤쪽은 «경로 몇 km»가 아니라 **«지금 내 위치 둘레»** 로 뺀다 — 동마다 경로 km 한 값으로 빼면
 *    되돌아가는 길에 다시 지날 동(예: 신둔면)을 «지나왔다»며 빼 앞길 위 좋은 콜을 막는다.
 */
import { haversineKm } from './callNet';

/** 📏 이만큼 움직이면 상차 목록을 다시 만든다 — 기사님 확정 (실측 36초에 한 번 · 시간당 4~10KB) */
export const PICKUP_LIST_MOVE_KM = 0.5;

/**
 * 🔴 **읍·면·동 이름만** — 시·구·군이 섞이면 «분당구»처럼 동 없이 온 상차지가 토큰 대조로 새어 나간다 (기사님 확정 · 픽커 카드).
 */
export function isPickupListName(name: string): boolean {
    return /(동|읍|면|가|리)$/.test(name) && !/(시|구|군)$/.test(name);
}

/**
 * 🗺️ **지도 재료의 키** — 서버가 상차 목록과 함께 싣는 `pickupArea` 중 **관제웹 «상차» · «하차» 레이어가 읽는 값**만.
 *
 * 서버는 목록이 바뀔 때만 필터를 관제웹에 보냈다. 복귀를 꺼도 상차 목록이 그대로면 옛 «복귀 켬»이 지도에 남아
 * 광주(집) 쪽 원을 계속 그렸다. 그래서 «바뀌었나»를 **목록 ∪ 이 키**로 본다.
 * 🔴 목록을 만든 자리(`at`)는 뺀다 — 지도는 실시간 위치로 그린다. 넣으면 0.5km 마다 쓸데없이 보낸다.
 */
export function pickupAreaKey(a: { homeCity: string | null; homeOn: boolean; homeCaught: boolean; hasLine: boolean } | null | undefined): string {
    return a ? JSON.stringify([a.homeCity, a.homeOn, a.homeCaught, a.hasLine]) : '';
}

/** 다시 만들까 — 처음이면 만든다 · 위치를 모르면 안 만든다 · 0.5km 넘게 움직였으면 */
export function pickupListNeedsRebuild(last: { x: number; y: number } | null, here: { x: number; y: number } | null, km = PICKUP_LIST_MOVE_KM): boolean {
    if (!here) return false;
    if (!last) return true;
    return haversineKm({ lng: last.x, lat: last.y }, { lng: here.x, lat: here.y }) > km;
}
