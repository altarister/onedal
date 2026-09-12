import { progressAlongKm } from '@onedal/shared';

/**
 * 🛣️ **남은 거리를 «길을 따라» 잰다** (기사님 지적 2026-09-13: *"frontend에서 다 알고
 *    있는 값일껀데."* — 맞았다).
 *
 * ── 왜 ──
 * 시트 상태바가 정차 중에 «얼마나 더 가야 하나»를 말해야 한다. 예전에 그 조각을 **뺐는데**
 * 이유는 *"직선 거리는 우리가 아는 값 중 가장 부정확했다"*(화면규칙 B5 ㉱)였다.
 * 그래서 «서버가 도로 기준 거리를 새로 줘야 한다»고 봤다 — **틀렸다.**
 *
 * 🔴 **폴리라인이 곧 도로다.** 카카오가 준 점열이 화면에 이미 와 있고(`routePolyline`),
 *    «경로 위 진행도»를 재는 함수도 `shared` 에 이미 있다(`progressAlongKm`).
 *
 *        남은 거리 = 정거장의 진행도 − 내 위치의 진행도
 *
 *    둘을 **같은 폴리라인·같은 함수**로 재니 일관되고 산을 뚫지 않는다. 새로 만든 것도,
 *    서버에 더 달라고 할 것도 없었다 (규칙 ③ — 이미 있는 것을 되쓴다).
 *
 * 🟢 **정거장이 도로에서 떨어져 있어도 된다** — 최근접 도로점으로 붙으므로 그 값이 곧
 *    «얼마나 더 달려야 하나»다 (실측: 곤지암 물류센터가 도로에서 601m).
 * 🔴 **모르면 `null`** — 경로가 없거나 이미 지났으면 지어내지 않는다 (규칙 ④).
 *    음수를 «남았다»고 적는 것이 안 적는 것보다 나쁘다.
 *
 * ⚠️ **한 곳이 약하다 — 경로를 크게 벗어나 있을 때.** `progressAlongKm` 은 얼마나 떨어졌든
 *    최근접점을 돌려주므로, 경로에서 멀리 있으면 이 값이 «그 경로 위의 어디»를 말할 뿐이다.
 *    서버가 점마다 `off_route_m` 을 이미 쟤 두고 있으니(2026-09-12), 그 값이 화면까지
 *    오면 «많이 벗어났으면 null» 을 여기 더한다. 그때까지는 이 한계를 알고 쓴다.
 *
 * 🔬 검사는 `remainOnRoute.test.ts` — 특히 «굽은 길은 직선보다 멀다»가 이 파일의 이유다.
 */
interface Pt { x: number; y: number }

export function remainOnRouteKm(
    polyline: ReadonlyArray<Pt> | undefined | null,
    me: Pt | null | undefined,
    stop: Pt | null | undefined,
): number | null {
    if (!polyline || polyline.length < 2 || !me || !stop) return null;
    if (![me.x, me.y, stop.x, stop.y].every(Number.isFinite)) return null;

    /* 🔴 `progressAlongKm` 은 `[경도, 위도]` 짝을 받는다 — 옮기는 곳을 한 군데로 둔다 */
    const line = polyline.map(p => [p.x, p.y] as [number, number]);
    const here = progressAlongKm({ lng: me.x, lat: me.y }, line);
    const there = progressAlongKm({ lng: stop.x, lat: stop.y }, line);
    const remain = there - here;
    /* 이미 지났다 — «남았다»고 말할 것이 없다 */
    return remain > 0 ? remain : null;
}
