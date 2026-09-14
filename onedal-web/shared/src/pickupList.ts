/**
 * 📋 **상차 영역 — 원달앱이 상차지를 거르는 동 목록의 모양** (기사님 확정 표 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 *
 * 2026-09-15 이천 왕복 03:08:52 D3: 되돌아가는 경로에서 다시 지날 신둔면을 «지나왔다»며 빼고(동마다 경로 km 한 값),
 * 원달앱 경로 순서 필터가 집 가는 앞길 위 좋은 콜을 막았다. 뒤쪽은 «경로 몇 km»가 아니라 **«지금 내 위치 둘레»와 겹치는 영역**으로 뺀다.
 *
 * | 콜 전 | 현위치 반경 원 전체 ∪ 목적지 방향 마름모 — 기사님: «아직 콜을 못 잡았어 뒤로 가서라도 잡아야 해» |
 * | 경로가 섰다 (노선) | 현위치 반경 ∩ 라인 띠 — 마름모 안 더함 |
 * | 복귀 켬 · 집 방향 콜 없음 | (현위치 ∩ 집 마름모) ∪ (현위치 ∩ 목적지 원 = 가까운 관내) ∪ 라인 있으면 (현위치 ∩ 라인) |
 * | 복귀 켬 · 집 방향 콜 잡음 | 현위치 반경 ∩ 라인 띠 — 관내 부분은 빠진다 |
 *
 * 🔴 **도형끼리** 교집합·합집합이다 — 동 목록끼리가 아니다. 마름모는 **현위치를 꼭짓점으로 목표를 향한다**(꼭짓점 원 없음).
 * 🔴 **순수 판단만 둔다** — 점마다 «그 도형 안인가»는 부르는 쪽(서버 `geoService.pickupListFor`)이 `callNet` 판정으로 넘긴다.
 */
import { haversineKm } from './callNet';

/** 📏 이만큼 움직이면 상차 목록을 다시 만든다 — 기사님 확정 2026-09-15 (실측 36초에 한 번 · 시간당 4~10KB) */
export const PICKUP_LIST_MOVE_KM = 0.5;

/** 상차 영역을 이루는 도형 — 내 위치 원 · 라인 띠 · 목적지 방향 마름모 · 집 방향 마름모 · 목적지 원 */
export type PickupShape = 'me' | 'line' | 'quadDest' | 'quadHome' | 'destRing';

/**
 * 상차 영역 계획 — **항들의 합집합, 항은 도형들의 교집합** (위 표).
 * ⚠️ «복귀 켬 · 집 방향 콜 잡음 · 경로 없음»은 표에 없다 — 집 방향 마름모와의 교집합으로 둔다 (내가 읽은 것 · 필터.md).
 */
export function pickupAreaPlan(o: { hasLine: boolean; homeOn: boolean; homeCaught: boolean }): PickupShape[][] {
    if (o.homeOn && !o.homeCaught) {
        return [['me', 'quadHome'], ['me', 'destRing'], ...(o.hasLine ? [['me', 'line'] as PickupShape[]] : [])];
    }
    if (o.hasLine) return [['me', 'line']];
    if (o.homeOn) return [['me', 'quadHome']];
    return [['me'], ['quadDest']];
}

type Pt = { lng: number; lat: number };

/** 계획대로 점을 가른다 — 🔴 판정을 모르는 도형(목적지·집을 모름)이 든 항은 거짓이다 (지어내지 않는다 · 규칙 ④) */
export function pickupAreaTest(plan: PickupShape[][], tests: Partial<Record<PickupShape, (p: Pt) => boolean>>): (p: Pt) => boolean {
    return (p: Pt) => plan.some(term => term.every(shape => { const t = tests[shape]; return !!t && t(p); }));
}

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
