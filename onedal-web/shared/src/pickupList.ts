/**
 * 📋 **상차 영역 — 원달앱이 상차지를 거르는 동 목록의 모양** (기사님 확정 표 2026-09-15 · `docs/지금/필터.md` «상차 목록 · 하차 목록»).
 *
 * 2026-09-15 이천 왕복 03:08:52 D3: 되돌아가는 경로에서 다시 지날 신둔면을 «지나왔다»며 빼고(동마다 경로 km 한 값),
 * 원달앱 경로 순서 필터가 집 가는 앞길 위 좋은 콜을 막았다. 뒤쪽은 «경로 몇 km»가 아니라 **«지금 내 위치 둘레»와 겹치는 영역**으로 뺀다.
 *
 * | 콜 전 | 현위치 반경 원 전체(뒤쪽 포함) — 마름모 안 더함. 기사님 2026-09-15 개정: «아무리 빨리 가도 마름모 영역까지 상차를 20분 안에 할 수 없잖아» |
 * | 경로가 섰다 (노선) | 현위치 반경 ∩ 라인 띠 — 마름모 안 더함 |
 * | 복귀 켬 · 집 방향 콜 없음 | (현위치 ∩ 집 마름모) ∪ (현위치 ∩ 목적지 원 = 가까운 관내) ∪ 라인 있으면 (현위치 ∩ 라인) |
 * | 복귀 켬 · 집 방향 콜 잡음 | 현위치 반경 ∩ 라인 띠 — 관내 부분은 빠진다 |
 *
 * 🔴 **도형끼리** 교집합·합집합이다 — 동 목록끼리가 아니다. 마름모는 **현위치를 꼭짓점으로 목표를 향한다**(꼭짓점 원 없음).
 * 🔴 **순수 판단만 둔다** — 점마다 «그 도형 안인가»는 부르는 쪽(서버 `geoService.pickupListFor`)이 `callNet` 판정으로 넘긴다.
 */
import { haversineKm, quadTesterOf, lineZoneOf, cityCenter } from './callNet';
import type { NetParams } from './callNet';

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
    /* 🔴 출발 전은 내 위치 반경뿐 (기사님 2026-09-15 개정 — «아무리 빨리 가도 마름모 영역까지 상차를 20분 안에 할 수 없잖아») */
    return [['me']];
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

/** 격자 한 칸(km) — 겹친 영역이 이보다 가늘면 놓칠 수 있다. 원(반경 수 km)을 30×30 남짓으로 찍는다 */
export const PICKUP_GRID_KM = 0.3;

/** 상차 영역을 찍는 데 드는 값 — 서버 `filterManager.rebuildPickupList` 가 세션에서 모아 넘긴다 */
export interface PickupAreaInput {
    me: { x: number; y: number };
    radii: { pickupRadiusKm: number; destinationRadiusKm: number; quadRadiusKm: number; detourRadiusKm: number };
    shape: { srcAngleDeg: number; dstAngleDeg: number };
    line: Array<{ x: number; y: number }> | null;
    destinationCity: string | null | undefined;
    homeCity: string | null | undefined;
    homeOn: boolean;
    homeCaught: boolean;
}

/** 영역 안에 든 격자 점 하나 — `stepKm` 은 그 점이 대표하는 칸의 한 변 (지도가 그 크기로 칠한다) */
export interface PickupAreaPoint { lng: number; lat: number; stepKm: number }

/**
 * 🧮 **상차 영역을 격자 점으로 찍는다 — 한 곳** (기사님 2026-09-15 «현위치 영역에 교집합 영역이 보이지 않는다»).
 *
 * 서버는 이 점을 품은 동을 모아 상차 목록을 만들고(`geoService.pickupListFor`), 관제웹 지도는 **같은 점**을 칠한다.
 * 🔴 지도가 도형을 제 손으로 다시 자르면 «그림은 든다는데 목록은 빠졌다»가 된다 — 목록을 만든 점 그대로 그린다 (규칙 ③).
 * 🔴 **도형끼리** 겹친 영역이다 — 계획은 `pickupAreaPlan`, 점마다 «그 도형 안인가»는 `callNet` 판정 그대로.
 * 격자 — 원이 든 항은 원을 감싼 사각형만 찍는다 · 원이 없는 항(콜 전 마름모)은 목표까지 감싼 사각형을 성기게.
 */
export function pickupAreaPoints(o: PickupAreaInput): { plan: PickupShape[][]; points: PickupAreaPoint[] } {
    const hasLine = !!o.line && o.line.length >= 2;
    const plan = pickupAreaPlan({ hasLine, homeOn: o.homeOn, homeCaught: o.homeCaught });
    const me = { name: '내 위치', lng: o.me.x, lat: o.me.y };
    const centerOf = (city: string | null | undefined) => {
        if (!city) return null;
        try { return cityCenter(city); } catch { return null; }   // 지도에 없는 시 — 그 도형은 모른다
    };
    const dest = centerOf(o.destinationCity), home = centerOf(o.homeCity);
    const params = {
        srcAngleDeg: o.shape.srcAngleDeg, dstAngleDeg: o.shape.dstAngleDeg,
        quadRadiusKm: o.radii.quadRadiusKm, srcDiamKm: o.radii.pickupRadiusKm * 2, dstDiamKm: o.radii.destinationRadiusKm * 2,
    } as NetParams;
    const line = hasLine ? o.line!.map(p => [p.x, p.y] as [number, number]) : null;
    const tests: Partial<Record<PickupShape, (p: Pt) => boolean>> = {
        me: p => haversineKm(me, p) <= o.radii.pickupRadiusKm,
        ...(line ? { line: lineZoneOf(line, o.radii.detourRadiusKm, null, params, dest ?? me).pickupIn } : {}),
        ...(dest ? { quadDest: quadTesterOf(params, me, dest), destRing: (p: Pt) => haversineKm(dest, p) <= o.radii.destinationRadiusKm } : {}),
        ...(home ? { quadHome: quadTesterOf(params, me, home) } : {}),
    };
    const inArea = pickupAreaTest(plan, tests);

    const KX = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180), KY = 110.574;
    const points: PickupAreaPoint[] = [];
    const sample = (x0: number, y0: number, x1: number, y1: number, stepKm: number) => {
        const dy = stepKm / KY, dx = stepKm / KX((y0 + y1) / 2);
        for (let y = y0; y <= y1; y += dy) for (let x = x0; x <= x1; x += dx) {
            const p = { lng: x, lat: y };
            if (inArea(p)) points.push({ ...p, stepKm });
        }
    };
    for (const term of plan) {
        if (term.includes('me')) {
            const r = o.radii.pickupRadiusKm;
            sample(o.me.x - r / KX(o.me.y), o.me.y - r / KY, o.me.x + r / KX(o.me.y), o.me.y + r / KY, PICKUP_GRID_KM);
            continue;
        }
        const goal = term.includes('quadHome') ? home : dest;
        if (!goal) continue;
        const pad = o.radii.quadRadiusKm;
        const x0 = Math.min(o.me.x, goal.lng) - pad / KX(o.me.y), x1 = Math.max(o.me.x, goal.lng) + pad / KX(o.me.y);
        const y0 = Math.min(o.me.y, goal.lat) - pad / KY, y1 = Math.max(o.me.y, goal.lat) + pad / KY;
        const longestKm = Math.max((x1 - x0) * KX(o.me.y), (y1 - y0) * KY);
        sample(x0, y0, x1, y1, Math.max(PICKUP_GRID_KM, longestKm / 120));
    }
    return { plan, points };
}

/** 다시 만들까 — 처음이면 만든다 · 위치를 모르면 안 만든다 · 0.5km 넘게 움직였으면 */
export function pickupListNeedsRebuild(last: { x: number; y: number } | null, here: { x: number; y: number } | null, km = PICKUP_LIST_MOVE_KM): boolean {
    if (!here) return false;
    if (!last) return true;
    return haversineKm({ lng: last.x, lat: last.y }, { lng: here.x, lat: here.y }) > km;
}
