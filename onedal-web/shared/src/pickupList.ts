/**
 * 📋 **상차 목록 — 원달앱이 상차지를 거르는 동 목록** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 *
 * 2026-09-15 이천 왕복 03:08:52 D3: 되돌아가는 경로에서 다시 지날 신둔면을 «지나왔다»며 빼고(동마다 경로 km 한 값),
 * 원달앱 경로 순서 필터가 집 가는 앞길 위 좋은 콜을 막았다. 기사님 원칙 «지나온 곳은 빼고, 앞으로 지날 곳은 잡는다»를
 * **«경로 몇 km»가 아니라 «지금 내 위치 둘레(내 영역)»** 로 잰다 — 되돌아가는 경로를 셈할 일이 없다.
 *
 * 🔴 **순수 판단만 둔다** — 동 목록(내 영역 · 경로 영역)은 서버가 지도로 재어 넘긴다 (`geoService`).
 */
import { haversineKm } from './callNet';

/** 📏 이만큼 움직이면 상차 목록을 다시 만든다 — 기사님 확정 2026-09-15 (실측 36초에 한 번 · 시간당 4~10KB) */
export const PICKUP_LIST_MOVE_KM = 0.5;

export type PickupStage = 'line' | 'home' | 'departed' | 'before';

/** 어느 줄로 만드나 — 위에서부터 먼저 맞는 줄 (⚠️ 순서는 기사님 네 단계를 읽은 것 · 필터.md) */
export function pickupStageOf(o: { hasLine: boolean; homeOn: boolean; departed: boolean }): PickupStage {
    if (o.hasLine) return 'line';
    if (o.homeOn) return 'home';
    if (o.departed) return 'departed';
    return 'before';
}

/**
 * 🔴 **읍·면·동 이름만** — 시·구·군이 섞이면 «분당구»처럼 동 없이 온 상차지가 토큰 대조로 새어 나간다 (기사님 ③ 가 · 픽커 카드).
 */
export function isPickupListName(name: string): boolean {
    return /(동|읍|면|가|리)$/.test(name) && !/(시|구|군)$/.test(name);
}

/**
 * 상차 목록.
 *   line     경로 영역 ∩ 내 영역 — 경로 위라도 내 위치 둘레 밖이면 안 든다 (기사님 «가까워지면 올라온다»)
 *   departed 내 영역 ∩ 하차 목록 — 하차 목록에 마름모·목적지가 들어 있다 (경로 없이 출발한 드문 경우)
 *   home     ⬜ 모양 기사님 대기 — 그동안 내 영역
 *   before   내 영역
 */
export function pickupListOf(o: { stage: PickupStage; meDongs: string[]; lineDongs: string[] | null; dropDongs: string[] }): string[] {
    const me = new Set(o.meDongs.filter(isPickupListName));
    let out: string[];
    if (o.stage === 'line') out = (o.lineDongs ?? []).filter(d => me.has(d));
    else if (o.stage === 'departed') out = o.dropDongs.filter(d => me.has(d));
    else out = [...me];
    return [...new Set(out.filter(isPickupListName))].sort();
}

/** 다시 만들까 — 처음이면 만든다 · 위치를 모르면 안 만든다 · 0.5km 넘게 움직였으면 */
export function pickupListNeedsRebuild(last: { x: number; y: number } | null, here: { x: number; y: number } | null, km = PICKUP_LIST_MOVE_KM): boolean {
    if (!here) return false;
    if (!last) return true;
    return haversineKm({ lng: last.x, lat: last.y }, { lng: here.x, lat: here.y }) > km;
}
