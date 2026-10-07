import { haversineKm, sectionLinesOf, aheadOf, callBandsOf, uncoveredSectionsOf, isEvaluating } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';
import { SOAK } from './JudgmentSeat';
import { MAP_THEME_COLORS, withAlpha } from '../../styles/themes';
import { offsetScreenPath } from '../../lib/parallelPath';
import { bandStrokeOf } from '../../lib/bandStroke';
import { callNodeFill, callNodeStroke, callNodeText } from '../../styles/callPalette';
import { TILE_SIZE, TILE_MAX_ZOOM, areaBoxOf, stickyFitBox, capAreaBox, type Viewport, type GeoBox } from '../../lib/mapProjection';

/**
 * 🗺️ **지도 그리기의 층** — 지도 부품(`PinnedRouteCanvas`)의 `drawMap` 이 차례대로 부른다.
 * 이 파일은 위(`PinnedRouteCanvas`)를 가져오지 않는다 — 방향: PinnedRouteCanvas → pinnedRouteLayers.
 * 바깥 일(저장소 · 소켓 · 타이머)을 하는 곳: `collectTiles` 하나(타일 이미지를 요청하고 모듈 캐시에 둔다) — `…Of` 는 값을 받아
 *    «무엇을 그릴지»를 돌려주는 순수 함수, `draw…` · `paint…` 는 받은 값을 ctx 에 그리기만 한다(부품 상태를 닫아 쓰지 않는다).
 * 🔴 그리는 순서 · 그리는 때는 부르는 쪽(`drawMap`)이 정한다 — 여기서 바꾸지 않는다.
 */

/** 화면 좌표 한 점 */
export type ScreenPt = { cx: number; cy: number };
/** 땅 좌표 → 화면 좌표 (부르는 쪽의 `toScreenPoint(p, viewport)`) */
export type Project = (p: { x: number; y: number }) => ScreenPt;
export type MapColors = typeof MAP_THEME_COLORS[keyof typeof MAP_THEME_COLORS];
type XY = { x: number; y: number };

// ─────────────────────────── 배경 타일 ───────────────────────────
/**
 * 🗺️ **배경 타일 — 회색조로 연하게** (기사님 확정).
 *
 * 지도한테 빌리는 것은 **«어느 동네 어느 도로인가» 하나뿐**이다. 마커·경로선·발자취·
 * 이름표·탭 판정은 전부 우리가 그린다 — 그래서 SDK 를 들이지 않는다. SDK 를 쓰면
 * 줌·팬의 임자를 통째로 내줘야 하는데, 그건 «배경만»이 아니게 된다.
 *
 * 🔴 **키가 없다.** 카카오 지도는 JS 키 + 도메인 등록 + 관제앱(Capacitor)의
 *    `localhost` 오리진 처리가 붙는다. 배경 한 장 때문에 치를 값이 아니다.
 *    표기 의무(© OpenStreetMap)는 캔버스 우하단에 그린다.
 */
/** 타일 이미지 캐시 — 컴포넌트가 다시 떠도 산다 (재요청 = OSM 서버에 대한 결례) */
const tileCache = new Map<string, HTMLImageElement>();
const TILE_CACHE_MAX = 600;
/** 🖼️ 타일 한 장의 주소 — 키 없는 OpenStreetMap */
export const tileUrlOf = (z: number, tx: number, ty: number) => `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
/** © 표기 — 타일을 쓴 화면에만 (OSM 라이선스) */
export const TILE_CREDIT = '© OpenStreetMap';

/** `ctx.filter` 는 옛 사파리에 없다 — 없으면 색 그대로 깔리되 투명도로만 눌린다 */
const supportsCanvasFilter = (ctx: CanvasRenderingContext2D) => typeof ctx.filter === 'string';

/**
 * 🖼️ **지금 화면에 걸치는 타일을 모아 준다** — 아직 안 온 것은 요청만 하고 빼놓는다.
 *
 * 🔴 «없으면 안 그린다»가 맞다. 반쯤 온 배경 위에 시·도 외곽선을 겹쳐 그리면
 *    두 배경이 비쳐 지저분해진다 — 하나라도 오면 타일, 아니면 외곽선(부르는 쪽에서 가른다).
 */
export function collectTiles(
    v: Viewport, width: number, height: number, onTileReady: () => void,
): Array<{ img: HTMLImageElement; cx: number; cy: number; size: number }> {
    const { worldSize, anchorX, anchorY, centerNx, centerNy } = v;
    const z = Math.max(0, Math.min(TILE_MAX_ZOOM, Math.round(Math.log2(worldSize / TILE_SIZE))));
    const count = Math.pow(2, z);
    const tileScreenSize = worldSize / count;
    if (!Number.isFinite(tileScreenSize) || tileScreenSize <= 0) return [];

    /** 화면 모서리를 정규 좌표로 되돌린다 — 어느 타일이 걸치는지 알려면 */
    const toNx = (screenX: number) => (screenX - anchorX) / worldSize + centerNx;
    const toNy = (screenY: number) => (screenY - anchorY) / worldSize + centerNy;

    const txFrom = Math.floor(toNx(0) * count), txTo = Math.floor(toNx(width) * count);
    const tyFrom = Math.floor(toNy(0) * count), tyTo = Math.floor(toNy(height) * count);

    // 🛟 화면이 아주 넓게 축소되면 타일 수가 폭발한다 — 그럴 땐 외곽선으로 떨어진다
    if ((txTo - txFrom + 1) * (tyTo - tyFrom + 1) > 120) return [];

    const ready: Array<{ img: HTMLImageElement; cx: number; cy: number; size: number }> = [];
    for (let tx = txFrom; tx <= txTo; tx++) {
        for (let ty = tyFrom; ty <= tyTo; ty++) {
            if (tx < 0 || ty < 0 || tx >= count || ty >= count) continue;
            const key = `${z}/${tx}/${ty}`;
            let img = tileCache.get(key);
            if (!img) {
                if (tileCache.size >= TILE_CACHE_MAX) {
                    const oldest = tileCache.keys().next().value;      // 들어온 순서대로 버린다
                    if (oldest) tileCache.delete(oldest);
                }
                img = new Image();
                img.onload = onTileReady;
                img.onerror = () => { (img as any).failed = true; };   // 실패해도 다시 안 조른다
                img.src = tileUrlOf(z, tx, ty);
                tileCache.set(key, img);
            }
            if (!img.complete || !img.naturalWidth || (img as any).failed) continue;
            ready.push({
                img,
                cx: (tx / count - centerNx) * worldSize + anchorX,
                cy: (ty / count - centerNy) * worldSize + anchorY,
                size: tileScreenSize,
            });
        }
    }
    return ready;
}

/** 0. 🗺️ 타일 배경 — 톤은 `tileToneFor` 가 정한 값 · 🧅 «배경» 레이어를 끄면 타일만 빠진다 */
export function drawTiles(ctx: CanvasRenderingContext2D, readyTiles: ReturnType<typeof collectTiles>,
    tone: { alpha: number; filter: string | null; overlay: number }, showBase: boolean, width: number, height: number) {
    ctx.save();
    /* 🎨 회색조·연하게 — 배경이 시끄러우면 색 · 영역이 안 읽힌다 (규칙 ⑤-3).
       배율과 상관없이 늘 같은 톤이다 — 확대해도 제 색으로 안 돌린다 (`mapTileTone`). */
    /* 🔆 밝은 테마는 지도가 흰 바탕 위라 더 밝게 뜬다 — 조금 더 눌러 준다 */
    /* 🌓 밝기는 «어둡게» 레이어와 배율이 정한다 — 확대할수록 옅어진다 (`tileToneFor` 한 곳) */
    if (supportsCanvasFilter(ctx) && tone.filter) ctx.filter = tone.filter;
    ctx.globalAlpha = tone.alpha;
    // 🧅 «배경» 레이어 — 끄면 타일만 빠지고 경계·경로는 남는다
    if (showBase) readyTiles.forEach(t => ctx.drawImage(t.img, t.cx, t.cy, t.size + 1, t.size + 1));
    ctx.restore();
    if (tone.overlay > 0) {
        ctx.fillStyle = `rgba(10, 14, 22, ${tone.overlay})`;   // 어두운 테마에서 한 겹 더 눌러 준다
        ctx.fillRect(0, 0, width, height);
    }
}

/** 0. 🗺️ 타일이 아직 없을 때 — 시·도 외곽선을 면으로 깐다 (터널·음영에서도 빈 화면이 안 된다) */
export function drawSidoFill(ctx: CanvasRenderingContext2D, features: any[], getScreenPt: Project, mapColors: MapColors) {
    const sortedFeatures = [...features].sort((a: any, b: any) =>
        (a.properties?.isGyeonggiSigungu ? 1 : 0) - (b.properties?.isGyeonggiSigungu ? 1 : 0)
    );

    sortedFeatures.forEach((feature: any) => {
        const isGyeonggiSigungu = feature.properties?.isGyeonggiSigungu;

        ctx.fillStyle = withAlpha(mapColors.sidoFill, 0.15);
        ctx.strokeStyle = withAlpha(mapColors.sidoStroke, isGyeonggiSigungu ? 0.4 : 0.3);
        ctx.lineWidth = isGyeonggiSigungu ? 0.5 : 1;
        const geom = feature.geometry;
        if (!geom) return;
        let polygons: number[][][][] = [];
        if (geom.type === 'Polygon') polygons = [geom.coordinates];
        else if (geom.type === 'MultiPolygon') polygons = geom.coordinates;

        polygons.forEach(polygon => {
            polygon.forEach(ring => {
                ctx.beginPath();
                ring.forEach((pt, _i) => {
                    const mapped = getScreenPt({ x: pt[0], y: pt[1] });
                    if (_i === 0) ctx.moveTo(mapped.cx, mapped.cy);
                    else ctx.lineTo(mapped.cx, mapped.cy);
                });
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            });
        });
    });
}

/**
 * 0.5. 🗺️ **경계선 — 타일 위에도 얹는다** — 구역이 안 나뉘면 «서울로 간 건지 성남으로 간 건지» 모른다
 *    (자료는 `sidoData` — 서울특별시 + 경기도 시·군·구).
 *
 * 🔴 **선만 얹는다. 면은 안 칠한다** — 채우면 회색조 지도가 또 한 겹 탁해져
 *    판정 색이 안 읽힌다 (규칙 ⑤-3).
 * 🔴 **배율과 무관하게 선명도를 유지한다** — «확대하면 타일에 경계가 나오니 물러나자»가 아니다.
 *    이 타일에는 행정 경계가 없다. 물러나면 그냥 사라진다.
 */
export function drawSidoBorder(ctx: CanvasRenderingContext2D, features: any[], getScreenPt: Project, mapColors: MapColors) {
    ctx.save();
    ctx.strokeStyle = withAlpha(mapColors.sidoStroke, 0.55);
    ctx.lineWidth = 1;
    features.forEach((feature: any) => {
        const geom = feature.geometry;
        if (!geom) return;
        const polygons: number[][][][] =
            geom.type === 'Polygon' ? [geom.coordinates]
                : geom.type === 'MultiPolygon' ? geom.coordinates : [];
        polygons.forEach(polygon => polygon.forEach(ring => {
            ctx.beginPath();
            ring.forEach((pt, i) => {
                const m = getScreenPt({ x: pt[0], y: pt[1] });
                if (i === 0) ctx.moveTo(m.cx, m.cy); else ctx.lineTo(m.cx, m.cy);
            });
            ctx.closePath();
            ctx.stroke();
        }));
    });
    ctx.restore();
}

/** 좌표가 아직 하나도 없을 때 — 가운데 한 줄 */
export function drawWaiting(ctx: CanvasRenderingContext2D, width: number, height: number, mapColors: MapColors) {
    ctx.fillStyle = mapColors.textMuted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '12px sans-serif';
    ctx.fillText("위치 데이터를 기다리는 중...", width / 2, height / 2);
}

/** 4. © 표기 — 타일을 쓴 화면에만. 빌린 것은 빌렸다고 적는다 (OSM 라이선스) */
export function drawCredit(ctx: CanvasRenderingContext2D, width: number, height: number, mapColors: MapColors) {
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = withAlpha(mapColors.textMuted, 0.7);
    ctx.fillText(TILE_CREDIT, width - 4, height - 3);
}

// ─────────────────────────── 화면 맞춤 ───────────────────────────
/**
 * 🔭 **화면에 들어와야 할 좌표** — 정거장 · 경로선 · 발자취 · 달린 자취 · 현위치 · 그물 · 영역 네모 · 목적지 · 잡은 콜 경로.
 * 영역은 감싼 네모만 넣는다 — 네모는 영역이 밖으로 나가거나 절반 아래로 줄 때만 새로 잡는다:
 *    마름모는 달리는 동안 300m 눈금 · «가까이 옴»으로 계속 바뀌어, 점을 그대로 넣으면 확대가 매번 다시 잡힌다 (#150).
 * @returns `fitBox` — 흔들림 방지 기억(**자르기 전** 값). 부르는 쪽이 다음 그림의 `prevFitBox` 로 넘긴다
 */
export function fitCoordsOf(o: {
    validPoints: XY[]; validPolyline: XY[]; trail: XY[]; driven: XY[];
    myLocation: XY | null;
    coneOverlay?: { tri: Array<[number, number]>; callPath?: Array<{ x: number; y: number }> } | null;
    prevFitBox: GeoBox | null;
    pickupArea?: { me: XY; meKm: number } | null;
    dropoffArea?: { circles: Array<XY & { km: number }>; nearCircles: Array<XY & { km: number }>; quads: XY[][];
        goals: XY[]; lines: Array<{ points: XY[]; km: number }> } | null;
}): { allCoords: XY[]; fitBox: GeoBox | null } {
    const { myLocation, coneOverlay, pickupArea, dropoffArea } = o;
    const allCoords = [...o.validPoints, ...o.validPolyline, ...o.trail, ...o.driven] as { x: number, y: number }[];
    if (myLocation) allCoords.push(myLocation);
    /* 🔺 그물을 켜면 그 삼각형까지 보이게 — 안 그러면 현위치만 확대돼 선 하나만 스쳐 간다 */
    if (coneOverlay) for (const [x, y] of coneOverlay.tri) allCoords.push({ x, y });
    const areaBox = stickyFitBox(o.prevFitBox, areaBoxOf({
        circles: [
            ...(pickupArea ? [{ x: pickupArea.me.x, y: pickupArea.me.y, km: pickupArea.meKm }] : []),
            ...(dropoffArea ? [...dropoffArea.circles, ...dropoffArea.nearCircles] : []),
        ],
        polygons: dropoffArea ? dropoffArea.quads : [],
        lines: dropoffArea ? dropoffArea.lines : [],
    }));
    /* 🔭 영역은 경로 네모의 2배 안까지만 — 통째로 담으면 먼 원 하나가 화면을 다 먹어 경로가 실처럼 보인다 (`capAreaBox`) */
    const routeBox = areaBoxOf({ circles: [], polygons: [allCoords], lines: [] });
    const fitArea = capAreaBox(routeBox, areaBox);
    if (fitArea) allCoords.push({ x: fitArea.minX, y: fitArea.minY }, { x: fitArea.maxX, y: fitArea.maxY });
    /* 🎯 목적지 마커 — 움직이지 않는다 */
    if (dropoffArea) for (const g of dropoffArea.goals) allCoords.push(g);
    if (coneOverlay?.callPath) for (const p of coneOverlay.callPath) allCoords.push({ x: p.x, y: p.y });
    return { allCoords, fitBox: areaBox };
}

// ─────────────────────────── 상차 · 하차 영역 ───────────────────────────
/**
 * ✂️ **라인 시작(현위치)에서 경로와 직각인 선 앞쪽** — 서버와 같은 `aheadOf` (#151). 그 앞쪽을 덮는 큰 네모의 네 꼭짓점.
 *    끝을 평평하게(butt) 그리는 것만으로는 짧게 꺾인 자리의 둥근 이음이 차 뒤를 덮었다 — 선 하나로 자른다.
 *    방향을 모르면 `null`(자르지 않는다).
 */
export function aheadCutOf(pts: ReadonlyArray<XY>, km: number, getScreenPt: Project, width: number, height: number): ScreenPt[] | null {
    const cut = aheadOf(pts.map(p => [p.x, p.y] as [number, number]), km);
    if (!cut) return null;
    const s = getScreenPt({ x: cut.start.lng, y: cut.start.lat });
    const f = getScreenPt({
        x: cut.start.lng + cut.dir.x / (111.32 * Math.cos((cut.start.lat * Math.PI) / 180)),
        y: cut.start.lat + cut.dir.y / 110.574,
    });
    const len = Math.hypot(f.cx - s.cx, f.cy - s.cy) || 1;
    const dx = (f.cx - s.cx) / len, dy = (f.cy - s.cy) / len;
    const big = (width + height) * 4;
    return [
        { cx: s.cx - dy * big, cy: s.cy + dx * big },
        { cx: s.cx - dy * big + dx * big, cy: s.cy + dx * big + dy * big },
        { cx: s.cx + dy * big + dx * big, cy: s.cy - dx * big + dy * big },
        { cx: s.cx + dy * big, cy: s.cy - dx * big },
    ];
}

/** ✂️ 받은 네모로 자른다 — 네모가 없으면(방향 모름) 자르지 않는다 */
function clipTo(c2d: CanvasRenderingContext2D, cut: ScreenPt[] | null) {
    if (!cut) return;
    c2d.beginPath();
    c2d.moveTo(cut[0].cx, cut[0].cy);
    c2d.lineTo(cut[1].cx, cut[1].cy);
    c2d.lineTo(cut[2].cx, cut[2].cy);
    c2d.lineTo(cut[3].cx, cut[3].cy);
    c2d.closePath();
    c2d.clip();
}

/** 🟢 상차 영역 모양 — 화면 좌표로 (원 · 가까이 온 목적지 원 · 띠 · 띠를 자를 네모) */
export interface PickupTrace {
    c: ScreenPt; meR: number;
    goals: Array<{ s: ScreenPt; r: number }>;
    /** `null` 이면 띠 없음 — 좁힌 원을 통째로 칠한다 */
    band: ScreenPt[] | null; bandWidth: number; cut: ScreenPt[] | null;
}

/**
 * 🟢 **상차 영역 모양 — 한 곳** (`pickupArea` → 화면). 칠하는 색 · 합성 방식은 부르는 쪽이 정한다.
 *    «상차» 레이어가 칠하고, «하차» 레이어가 같은 모양을 **지운다**(먼 목적지는 상차 영역을 뺀다).
 * ✂️ 띠의 시작을 평평하게 자른다 — 띠의 둥근 끝이 지나온 곳을 덮지 않게 (서버 `pickupListFor` 와 같다).
 *    🔴 방향은 **첫 점 → 끝점**이다. 마지막 한 구간에서 뽑으면 골목이 영역을 통째로 돌린다.
 */
export function pickupTraceOf(area: {
    me: XY; meKm: number; line: XY[] | null; lineKm: number; goals: Array<{ at: XY; km: number }>;
}, getScreenPt: Project, width: number, height: number): PickupTrace {
    const c = getScreenPt(area.me);
    const east = getScreenPt({ x: area.me.x + 1 / (111.32 * Math.cos((area.me.y * Math.PI) / 180)), y: area.me.y });
    const pxPerKm = Math.abs(east.cx - c.cx);
    const meR = Math.max(0, area.meKm) * pxPerKm;
    const band = area.line && area.line.length >= 2 ? area.line : null;
    return {
        c, meR,
        goals: area.goals.map(g => ({ s: getScreenPt(g.at), r: Math.max(0, g.km) * pxPerKm })),
        band: band ? band.map(p => getScreenPt(p)) : null,
        bandWidth: area.lineKm * 2 * pxPerKm,
        cut: band ? aheadCutOf([band[0], band[band.length - 1]], area.lineKm, getScreenPt, width, height) : null,
    };
}

/** 🟢 상차 영역을 그린다 — 켜진 조각을 전부 겹친다(∩): 하나씩 clip 으로 좁히고 마지막에 한 번 칠한다 (겹쳐 칠하면 합집합으로 보인다) */
export function tracePickup(c2d: CanvasRenderingContext2D, t: PickupTrace) {
    c2d.save();
    c2d.beginPath(); c2d.arc(t.c.cx, t.c.cy, t.meR, 0, Math.PI * 2); c2d.clip();
    if (t.goals.length) {
        /* 🎯 가까이 온 목적지 원들은 서로 **더한다**(∪) — 한 경로에 원 여럿을 그리면 합집합으로 clip 된다 */
        c2d.beginPath();
        for (const g of t.goals) {
            c2d.moveTo(g.s.cx + g.r, g.s.cy);
            c2d.arc(g.s.cx, g.s.cy, g.r, 0, Math.PI * 2);
        }
        c2d.clip();
    }
    if (t.band) {
        clipTo(c2d, t.cut);
        c2d.beginPath();
        t.band.forEach((s, i) => { if (i === 0) c2d.moveTo(s.cx, s.cy); else c2d.lineTo(s.cx, s.cy); });
        c2d.lineWidth = t.bandWidth;
        c2d.lineCap = 'round'; c2d.lineJoin = 'round';
        c2d.stroke();
    } else {
        /* 띠가 없으면 여기까지 좁힌 영역을 통째로 칠한다 */
        c2d.beginPath(); c2d.arc(t.c.cx, t.c.cy, t.meR, 0, Math.PI * 2); c2d.fill();
    }
    c2d.restore();
}

/** 🟢 «상차» 레이어의 틀 — 초록으로 칠한다(하차 파랑과 가르려고). 🔴 테두리는 긋지 않는다 (기사님 지시) */
export function paintPickupMask(oc: CanvasRenderingContext2D, t: PickupTrace) {
    oc.fillStyle = '#16a34a'; oc.strokeStyle = '#16a34a';
    tracePickup(oc, t);
}

/** 🔵 하차 영역 모양 — 화면 좌표로 (먼 목적지 원 · 마름모 · 띠와 그 자를 네모 · 가까이 온 목적지 원) */
export interface DropoffTrace {
    circles: Array<{ s: ScreenPt; r: number }>;
    quads: ScreenPt[][];
    lines: Array<{ pts: ScreenPt[]; width: number; cut: ScreenPt[] | null }>;
    nearCircles: Array<{ s: ScreenPt; r: number }>;
}

/**
 * 🔵 **하차 영역 모양** (`dropoffArea` → 화면). 원 · 마름모 · 띠의 **합집합**이다.
 * ✂️ 띠는 시작(운행 뒤면 현위치 — 부르는 쪽이 `lineFromPoint` 로 잘랐다)에서 경로와 직각으로 자른 선 앞쪽만 — 띠 **전체**로 방향을 잰다.
 */
export function dropoffTraceOf(area: {
    circles: Array<XY & { km: number }>; nearCircles: Array<XY & { km: number }>; quads: XY[][];
    lines: Array<{ points: XY[]; km: number }>;
}, getScreenPt: Project, width: number, height: number): DropoffTrace {
    const pxPerKmAt = (p: { x: number; y: number }) => {
        const a = getScreenPt(p);
        const b = getScreenPt({ x: p.x + 1 / (111.32 * Math.cos((p.y * Math.PI) / 180)), y: p.y });
        return Math.abs(b.cx - a.cx);
    };
    const circle = (c: XY & { km: number }) => ({ s: getScreenPt(c), r: Math.max(0, c.km) * pxPerKmAt(c) });
    return {
        circles: area.circles.map(circle),
        quads: area.quads.filter(q => q.length >= 3).map(q => q.map(p => getScreenPt(p))),
        lines: area.lines.filter(l => l.points.length >= 2).map(l => ({
            pts: l.points.map(p => getScreenPt(p)),
            width: Math.max(3, l.km * 2 * pxPerKmAt(l.points[0])),
            cut: aheadCutOf(l.points, l.km, getScreenPt, width, height),
        })),
        nearCircles: area.nearCircles.map(circle),
    };
}

/**
 * 🔵 «하차» 레이어의 틀 — 파랑으로 원 · 마름모 · 띠를 모아 칠한다.
 * ✂️ 먼 목적지 조각에서 **상차 영역을 지우고**(상차 레이어를 꺼도 뺀다 — 보기 스위치와 규칙은 따로다),
 * 🎯 가까이 온 목적지 원은 **지운 뒤에** 칠한다 — 빼지 않는다 (관내콜). 🔴 테두리는 긋지 않는다 (기사님 지시)
 */
export function paintDropoffMask(oc: CanvasRenderingContext2D, t: DropoffTrace, pickup: PickupTrace | null) {
    oc.fillStyle = '#2563eb'; oc.strokeStyle = '#2563eb';
    for (const c of t.circles) {
        oc.beginPath(); oc.arc(c.s.cx, c.s.cy, c.r, 0, Math.PI * 2); oc.fill();
    }
    for (const q of t.quads) {
        oc.beginPath();
        q.forEach((s, i) => { if (i === 0) oc.moveTo(s.cx, s.cy); else oc.lineTo(s.cx, s.cy); });
        oc.closePath(); oc.fill();
    }
    for (const l of t.lines) {
        oc.save();
        clipTo(oc, l.cut);
        oc.beginPath();
        l.pts.forEach((s, i) => { if (i === 0) oc.moveTo(s.cx, s.cy); else oc.lineTo(s.cx, s.cy); });
        oc.lineWidth = l.width;
        oc.lineCap = 'round'; oc.lineJoin = 'round';
        oc.stroke();
        oc.restore();
    }
    if (pickup) {
        oc.save();
        oc.globalCompositeOperation = 'destination-out';
        tracePickup(oc, pickup);
        oc.restore();
    }
    for (const c of t.nearCircles) {
        oc.beginPath(); oc.arc(c.s.cx, c.s.cy, c.r, 0, Math.PI * 2); oc.fill();
    }
}

// ─────────────────────────── 점 · 마커 · 그물 ───────────────────────────
/**
 * 📍 **«동 점» — 원달앱에 내려간 목록** (🔵 하차 · 🟢 상차 · 테두리 없음 · 목적지 마커 아래). 그리는 차례대로.
 * 🟣 **둘 다는 보라** — 하차와 같은 파랑으로 찍으면 «이 동이 상차로도 등록됐나»를
 *    화면에서 못 가린다 (기사님 지적). 🔴 청록·노랑은 안 된다 — 지도가 이미 쓴다
 *    (자취 `#35c3a9` · 목적지 마커 주황). 보라만 남은 자리다
 */
export function dongDotMarksOf(dots: { pickup: XY[]; dropoff: XY[]; both: XY[] }): Array<{ at: XY; fill: string }> {
    return [
        ...dots.dropoff.map(at => ({ at, fill: 'rgba(2,132,199,.42)' })),
        ...dots.pickup.map(at => ({ at, fill: 'rgba(22,163,74,.45)' })),
        ...dots.both.map(at => ({ at, fill: 'rgba(192,132,252,.5)' })),
    ];
}

export function drawDongDots(ctx: CanvasRenderingContext2D, marks: Array<{ at: XY; fill: string }>, getScreenPt: Project) {
    for (const m of marks) {
        const { cx, cy } = getScreenPt(m.at);
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = m.fill; ctx.fill();
    }
}

/** 🎯 목적지 마커 — 살아 있는 목적지마다 */
export function drawGoalMarkers(ctx: CanvasRenderingContext2D, goals: XY[], getScreenPt: Project, fill: string) {
    for (const goalPt of goals) {
        const g = getScreenPt(goalPt);
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(g.cx, g.cy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
}

/** 🔺 첫 콜 그물 (목업 전용) — 통과한 동을 점으로, 삼각형을 선으로 */
export function drawConeOverlay(ctx: CanvasRenderingContext2D, coneOverlay: {
    tri: Array<[number, number]>;
    pass?: Array<{ x: number; y: number }>;
    marks?: Array<{ name: string; x: number; y: number; inside: boolean }>;
    circles?: Array<{ name: string; ring: Array<[number, number]> }>;
    callPath?: Array<{ x: number; y: number; label: string; color?: string }>;
}, getScreenPt: Project) {
    ctx.save();
    for (const p of coneOverlay.pass ?? []) {
        const { cx, cy } = getScreenPt(p);
        ctx.fillStyle = 'rgba(56,189,248,0.30)';
        ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    for (const c of coneOverlay.circles ?? []) {
        ctx.beginPath();
        c.ring.forEach(([x, y], i) => {
            const { cx, cy } = getScreenPt({ x, y });
            if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(251,191,36,0.10)'; ctx.fill();
        ctx.strokeStyle = 'rgba(251,191,36,0.85)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath();
    coneOverlay.tri.forEach(([x, y], i) => {
        const { cx, cy } = getScreenPt({ x, y });
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(56,189,248,0.07)'; ctx.fill();
    ctx.strokeStyle = 'rgba(56,189,248,0.75)'; ctx.lineWidth = 1.5; ctx.stroke();
    for (const m of coneOverlay.marks ?? []) {
        const { cx, cy } = getScreenPt(m);
        ctx.fillStyle = m.inside ? '#38bdf8' : '#f87171';
        ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.font = '700 10px system-ui'; ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
        ctx.strokeText(m.name, cx, cy - 8); ctx.fillText(m.name, cx, cy - 8);
    }
    /* ⛓️ 잡은 콜의 경로 — 출발지→상차→하차 직선. 이름표는 점 아래(경계 표지는 위라 안 겹친다).
       구간 색 = 도착점의 color — 기존 경로(장미)와 이번 콜(다른 색)이 갈라 보인다 */
    if (coneOverlay.callPath?.length) {
        const path = coneOverlay.callPath;
        for (let i = 1; i < path.length; i++) {
            const a = getScreenPt(path[i - 1]), b = getScreenPt(path[i]);
            ctx.beginPath(); ctx.moveTo(a.cx, a.cy); ctx.lineTo(b.cx, b.cy);
            ctx.strokeStyle = path[i].color ?? '#fb7185'; ctx.lineWidth = 2.5; ctx.stroke();
        }
        for (const p of path) {
            const { cx, cy } = getScreenPt(p);
            const tone = p.color ?? '#fb7185';
            ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(cx, cy, 5.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fill();
            ctx.font = '800 10px system-ui'; ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
            ctx.strokeText(p.label, cx, cy + 17); ctx.fillStyle = tone; ctx.fillText(p.label, cx, cy + 17);
        }
    }
    ctx.restore();
}

// ─────────────────────────── 직선 보조선 ───────────────────────────
/** 이보다 가까우면 «직선 N km» 글자가 마커를 덮는다 */
const MIN_GAP_PX = 90;

/**
 * 1.5. **기초 연결선 — 정거장을 직선으로 잇는 보조 점선** + 현위치 → 첫 정거장의 «직선 N km».
 *
 * 🔴 **경로선이 있으면 둘 다 안 그린다** (`path` · `label` 이 `null`) — 카카오가 준 실제 도로 경로 위에
 *    직선을 겹치면 **길이 두 개**로 보이고, 기사님은 **도로**를 달리지 직선을 달리지 않는다
 *    («주행 68.0km / 106분» 이 더 정확하고 버퍼·데드라인이 전부 그 값을 쓴다 — 한 화면이 두 답을 한다).
 *    경로가 아직 없거나 실패했을 때만 «대충 이 방향 · 얼마나 먼가»로 남긴다 (규칙 ④).
 * 🔴 **두 점이 가까워도 글자를 안 그린다** — 글자는 두 점의 **중간**에 놓여, 둘이 붙으면 마커 위에 올라앉는다.
 */
export function straightGuideOf(o: { validPolyline: XY[]; myLocation: XY | null; validPoints: XY[] }, getScreenPt: Project): {
    path: ScreenPt[] | null;
    label: { text: string; midX: number; midY: number } | null;
} {
    if (o.validPolyline.length >= 2) return { path: null, label: null };
    const path: ScreenPt[] = [];
    if (o.myLocation) path.push(getScreenPt(o.myLocation));
    o.validPoints.forEach(p => path.push(getScreenPt(p)));
    let label: { text: string; midX: number; midY: number } | null = null;
    if (o.myLocation && o.validPoints.length > 0) {
        const startPt = getScreenPt(o.myLocation);
        const endPt = getScreenPt(o.validPoints[0]);
        const distKm = haversineKm(o.myLocation, o.validPoints[0]);
        const midX = Math.round((startPt.cx + endPt.cx) / 2);
        const midY = Math.round((startPt.cy + endPt.cy) / 2);
        const gapPx = Math.hypot(endPt.cx - startPt.cx, endPt.cy - startPt.cy);
        if (gapPx >= MIN_GAP_PX) label = { text: `직선 ${distKm.toFixed(1)}km`, midX, midY };
    }
    return { path, label };
}

export function drawStraightGuide(ctx: CanvasRenderingContext2D, g: ReturnType<typeof straightGuideOf>,
    mapColors: MapColors, theme: 'dark' | 'light') {
    if (g.path) {
        ctx.beginPath();
        ctx.strokeStyle = withAlpha(mapColors.sidoStroke, 0.4);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);
        g.path.forEach((p, i) => { if (i === 0) ctx.moveTo(p.cx, p.cy); else ctx.lineTo(p.cx, p.cy); });
        ctx.stroke();
        ctx.setLineDash([]);
    }
    if (g.label) {
        const { text, midX, midY } = g.label;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        const tWidth = ctx.measureText(text).width;

        ctx.fillStyle = withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, theme === 'light' ? 0.8 : 0.7);
        ctx.fillRect(midX - (tWidth / 2) - 4, midY - 14, tWidth + 8, 18);

        ctx.fillStyle = mapColors.stroke;
        ctx.fillText(text, midX, midY - 1);
    }
}

// ─────────────────────────── 경로선 · 자취 ───────────────────────────
/** 선 하나 — 땅 좌표 · 색 · 굵기 배수(배율이 정한 기본 굵기에 곱한다) · 점선 · 진행 방향 직각으로 민 픽셀 */
export interface Stroke { pts: XY[]; color: string; widthScale: number; dash?: number[]; offsetPx?: number }

/** 🧭 경로선 재료 — 경로의 주인은 서버가 정한다(`routeHolder`). 여기서 다시 찾지 않는다 (추측 두 벌 금지) · 좌표가 깨진 점은 거른다 */
export function polylineOf(routeHolder: SecuredOrder | null | undefined): { current: any[]; valid: XY[] } {
    const current = routeHolder?.routePolyline || [];
    const valid = current.filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
    return { current, valid };
}

/**
 * ① 아래 — 카카오가 준 «가야 할 길». 그리는 차례대로 선 목록.
 *
 * 🌈 **구간마다 그 콜의 색으로 칠한다** — 서버가 구간 경계(`sectionEnds`)와 구간 주인(`sectionStops`)을 함께 보낸다.
 *    **둘의 길이가 같고**, 구간 i 는 «정거장 i 에 닿는 길»이다. 그래서 색은 그 정거장의 콜 색이다.
 * 🔴 **재료가 어긋나면 한 색으로 물러난다** — 색이 밀려 그려지는 것보다 한 색이 낫다 (규칙 ④). 걸러진 점이 있으면 경계가 어긋난다.
 * ⚠️ 미리보기(결재 전)는 노란 점선 — «아직 내 콜이 아니다»가 색의 뜻이다.
 * 🗺️ **심사 중 — 이 후보가 늘린 구간을 판정 색으로 굵게** («이 콜을 끼면 이렇게 간다»). 나머지는 노란 점선 그대로.
 *    판정 전이면 후보 구간도 노랑. ⚠️ 깜빡이게 하지 않는다 — 캔버스를 0.26초마다 다시 칠해야 한다.
 * 🌈 **콜마다 «내 짐이 차에 있는 동안»을 자기 색 띠로** — 겹친 구간은 두 색이 나란히 (`callBandsOf` · 기사님 확정).
 *    🩶 빈 차로 가는 길(어느 콜의 짐도 안 실린 구간)은 회색 점선 · 🔴 지금 향하는 콜을 맨 나중에 긋는다(겹치는 자리에서 위로).
 *    🌈 콜이 늘면 두께·간격이 함께 준다 — 전체 폭이 넘치면 굵은 띠 하나로 뭉쳐 보인다 (`bandStrokeOf`).
 * @param on 🧅 «경로» 레이어
 */
export function routeStrokesOf(o: {
    on: boolean; routeHolder: SecuredOrder | null | undefined;
    callColors?: Map<string, string>; mapColors: MapColors;
}): Stroke[] {
    const { routeHolder, callColors, mapColors } = o;
    const { current: currentPolyline, valid: validPolyline } = polylineOf(routeHolder);
    const isPreviewRoute = !!routeHolder && isEvaluating(routeHolder.status);
    if (!(o.on && currentPolyline.length > 0 && validPolyline.length > 0)) return [];
    const out: Stroke[] = [];
    const secStops = routeHolder?.sectionStops;
    const secLines = sectionLinesOf(validPolyline, routeHolder?.sectionEnds);
    const sectionsOk = !!secStops && secLines.length > 1 && secLines.length === secStops.length
        && validPolyline.length === currentPolyline.length;
    const canPaintPerSection = !isPreviewRoute && !!callColors && sectionsOk;
    const candidateColor = routeHolder?.judgment?.color ? SOAK[routeHolder.judgment.color].bar : '#e6b422';
    if (isPreviewRoute && sectionsOk) {
        secLines.forEach((line, i) => {
            const mine = secStops![i].orderId === routeHolder!.id;
            out.push({ pts: line, color: mine ? candidateColor : '#e6b422', widthScale: mine ? 1.6 : 1, dash: mine ? undefined : [10, 8] });
        });
    } else if (canPaintPerSection) {
        for (const i of uncoveredSectionsOf(secStops!, secLines.length)) out.push({ pts: secLines[i], color: mapColors.textMuted, widthScale: 0.8, dash: [7, 6] });
        const bands = [...callBandsOf(secStops!)];
        const nextOrderId = secStops![0]?.orderId;
        const drawOrder = bands
            .map((b, i) => ({ b, i }))
            .sort((p, q) => Number(p.b[0] === nextOrderId) - Number(q.b[0] === nextOrderId));
        for (const { b: [orderId, band], i: bi } of drawOrder) {
            const color = callColors!.get(orderId);
            if (!color) continue;
            const { widthScale, shiftPx } = bandStrokeOf(bands.length, bi);
            for (let i = band.from; i <= band.to && i < secLines.length; i++) out.push({ pts: secLines[i], color, widthScale, offsetPx: shiftPx });
        }
    } else {
        // 노란 점선 = 아직 결재 전
        out.push({ pts: validPolyline, color: isPreviewRoute ? '#e6b422' : mapColors.routeLine, widthScale: 1, dash: isPreviewRoute ? [10, 8] : undefined });
    }
    return out;
}

/**
 * ①-2 🟡 **후보 경로 — 확정 경로 «위에» 한 줄로 겹쳐 그린다** (기사님 확정).
 *
 * 🔴 **확정 경로를 지우지 않는다** — «가고 있는 길»과 «붙이면 갈 길»을 견주어 1~2초에 누르신다.
 * 🔴 **처음부터 끝까지 한 줄로** — 늘린 구간만 굵게 그으면 점선이 확정 경로 밑에 깔려 한 줄이 끊긴 것처럼 보였다.
 * 🔴 **색은 판정 색, 판정 전이면 노란 점선** — «아직 내 콜이 아니다»는 점선이 지킨다.
 * 🔴 **영역에는 안 쓴다** — 잡지도 않은 콜이 원달앱 상차·하차 목록을 흔들면 안 된다.
 * @param on 🧅 «후보» 레이어 — 확정 경로를 덮으므로 견주려면 걷을 수 있어야 한다
 */
export function candidateStrokeOf(o: { on: boolean; candidateHolder: SecuredOrder | null | undefined }): Stroke | null {
    const { candidateHolder } = o;
    const candLine = (candidateHolder?.routePolyline ?? [])
        .filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
    if (!(o.on && candidateHolder && candLine.length > 1)) return null;
    const cColor = candidateHolder.judgment?.color ? SOAK[candidateHolder.judgment.color].bar : null;
    return { pts: candLine, color: cColor ?? '#e6b422', widthScale: cColor ? 1.6 : 1, dash: cColor ? undefined : [10, 8] };
}

/**
 * ② 위 — 내가 «실제로 간 길». 얇고 밝다. 파란 길 밖으로 나가면 그게 이탈이다.
 * 🔴 구간마다 **따로** 긋는다 — 구간을 이으면 GPS 가 끊긴 자리가 지도를 가로지르는 직선으로 남는다.
 * 🔴 **콜이 늘면 동선도 함께 얇아진다** (기사님 지시) — 흰 줄이 색 줄을 덮어 «어느 콜의 길인가»가 안 읽힌다.
 * @param on 🧅 «동선» 레이어
 */
export function trailStrokesOf(o: { on: boolean; segs: XY[][]; callCount: number; color: string }): Stroke[] {
    if (!o.on) return [];
    const trailWidth = 0.55 * (bandStrokeOf(o.callCount, 0).widthScale / 0.9);
    return o.segs.map(seg => ({ pts: seg, color: o.color, widthScale: trailWidth }));
}

/** 선 목록을 차례대로 긋는다 — 굵기는 배율이 정한 기본 굵기(`routeLineWidth`) × 배수 */
export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], getScreenPt: Project, baseWidth: number) {
    for (const s of strokes) {
        ctx.strokeStyle = s.color;
        if (s.pts.length < 2) continue;
        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = baseWidth * s.widthScale;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        if (s.dash) ctx.setLineDash(s.dash);
        const screen = offsetScreenPath(s.pts.map(getScreenPt), s.offsetPx ?? 0);
        screen.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.cx, p.cy); else ctx.lineTo(p.cx, p.cy);
        });
        ctx.stroke();
        ctx.restore();
    }
}

// ─────────────────────────── 정거장 마커 ───────────────────────────
/** 정거장 원 하나 — 채움 · 테두리 · 번호 */
export interface StopMark {
    at: XY; orderId?: string; r: number; fill: string; lineWidth: number; stroke: string;
    label: string; labelColor: string; font: string;
}

/**
 * 1.7. 👣 **지나온 발자취** — 번호는 방문 순서로 동결 (①).
 * 🩶 **색표를 켜면 다녀온 곳은 회색 원 · 진한 회색 번호 · 테두리 투명** — 색은 아직 안 간 콜만 쓴다.
 *    색이 넷이라 다녀온 콜이 색을 들고 있으면 5번째 콜과 같은 색으로 보인다.
 */
export function visitedMarksOf(o: {
    trail: Array<XY & { orderId: string; no: number; callNo?: number }>;
    rainbowNodes: boolean; callColors?: Map<string, string>; mapColors: MapColors;
}): StopMark[] {
    const { rainbowNodes, callColors, mapColors } = o;
    return o.trail.map(p => {
        const fill = rainbowNodes && p.callNo ? mapColors.textMuted : null;
        return {
            at: p, orderId: p.orderId, r: fill ? 10 : 9,
            fill: fill ?? withAlpha('#35c3a9', 0.4),       // 초록 채움 = 다녀옴 (색표를 안 쓸 때)
            lineWidth: fill ? 1 : 2.5,
            stroke: fill
                ? callNodeStroke(true, fill)                          // 다녀왔으니 «동그라미»를 친다
                : (callColors?.get(p.orderId) ?? '#35c3a9'),
            label: String(p.no),
            labelColor: fill ? '#374151' : '#d7f5ee',   // 🩶 다녀온 곳 번호는 진한 회색 — 흰 글자는 회색 원 위에서 여전히 눈을 끈다
            font: fill ? 'bold 12.5px sans-serif' : 'bold 10px sans-serif',
        };
    });
}

/** 👣 발자취를 그린다 — 마커 탭 판정용 화면 좌표를 돌려준다 */
export function drawVisitedMarks(ctx: CanvasRenderingContext2D, marks: StopMark[], getScreenPt: Project): Array<{ cx: number; cy: number; orderId: string }> {
    const hits: Array<{ cx: number; cy: number; orderId: string }> = [];
    for (const m of marks) {
        const { cx, cy } = getScreenPt(m.at);
        hits.push({ cx, cy, orderId: m.orderId! });
        ctx.beginPath();
        ctx.arc(cx, cy, m.r, 0, 2 * Math.PI);
        ctx.fillStyle = m.fill;
        ctx.fill();
        ctx.lineWidth = m.lineWidth;
        ctx.strokeStyle = m.stroke;
        ctx.stroke();
        ctx.fillStyle = m.labelColor;
        ctx.font = m.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, cx, cy + 0.5);
    }
    return hits;
}

/** 남은 정거장 하나 — 원 · 번호 · 이름표 */
export interface RouteStopMark extends StopMark { name: string; nameBg: string; nameColor: string }

/**
 * 2. **남은 정거장** — 🌈 색상=콜 · 밝기=상차/하차 (색표를 켤 때).
 * 🔍 마커는 **목록 동그라미와 같은 크기**다 — 크면 지도를 가리고, 한 화면에서 같은 것이 두 크기로 보이면 다른 것처럼 읽힌다.
 * 🖊️ 테두리는 `callNodeStroke` 가 정한다 — 다녀온 곳은 투명, 안 간 곳은 채움과 같은 색 · 1px (목록 동그라미와 같은 두께).
 *    색표를 안 쓰면 테두리 = 콜 색 (②) — 어느 콜의 정거장인지 색으로 읽힌다.
 * 🔒 번호는 밖에서 실어 준 사이클 번호(`p.no` · `stopNoOf`) — 캔버스가 «남은 목록의 몇 번째»로 세지 않는다.
 *    🔍 달리면서 먼발치로 읽는 숫자다. 원만 키우지 말고 글자도 키운다.
 */
export function routeStopMarksOf(o: {
    points: Array<XY & { type: string; name: string; isEvaluating: boolean; routeId?: string; no?: number; callNo?: number; visited?: boolean }>;
    rainbowNodes: boolean; callColors?: Map<string, string>; mapColors: MapColors; theme: 'dark' | 'light';
}): RouteStopMark[] {
    const { rainbowNodes, callColors, mapColors, theme } = o;
    return o.points.map(p => {
        const stopKind = p.type === '상차' ? 'pickup' : 'dropoff';
        const rainbowFill = rainbowNodes && p.callNo ? callNodeFill(p.callNo, stopKind, theme) : null;
        const fill = p.isEvaluating ? mapColors.nodeEvaluating
            : rainbowFill ?? (p.type === '상차' ? mapColors.nodePickup : mapColors.nodeDropoff);
        const lineWidth = p.isEvaluating ? 2.5 : rainbowFill ? 1 : 2.5;
        const stroke = p.isEvaluating ? mapColors.nodeStrokeEvaluating
            : rainbowFill ? callNodeStroke(!!p.visited, rainbowFill)
                : (p.routeId && callColors?.get(p.routeId)) || mapColors.nodeStrokeRegular;
        return {
            at: p, orderId: p.routeId, r: 10, fill, lineWidth, stroke,
            label: String(p.no ?? ''),   // 번호는 stopNoOf 하나에서 온다
            labelColor: rainbowNodes && p.callNo ? callNodeText(stopKind, theme) : mapColors.textBody,
            font: rainbowNodes ? 'bold 12.5px sans-serif' : 'bold 11px sans-serif',
            name: p.name,
            nameBg: withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, theme === 'light' ? 0.8 : 0.45),
            nameColor: p.isEvaluating ? mapColors.nodeStrokeEvaluating : mapColors.textBody,
        };
    });
}

/** 2. 남은 정거장을 그린다 — 마커 탭 판정용 화면 좌표를 돌려준다(콜이 있는 것만) */
export function drawRouteStopMarks(ctx: CanvasRenderingContext2D, marks: RouteStopMark[], getScreenPt: Project): Array<{ cx: number; cy: number; orderId: string }> {
    const hits: Array<{ cx: number; cy: number; orderId: string }> = [];
    for (const m of marks) {
        const { cx, cy } = getScreenPt(m.at);
        if (m.orderId) hits.push({ cx, cy, orderId: m.orderId });
        ctx.beginPath();
        ctx.arc(cx, cy, m.r, 0, 2 * Math.PI);
        ctx.fillStyle = m.fill;
        ctx.lineWidth = m.lineWidth;
        ctx.strokeStyle = m.stroke;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = m.labelColor;
        ctx.font = m.font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, cx, cy + 1);

        const textWidth = ctx.measureText(m.name).width;
        ctx.fillStyle = m.nameBg;
        ctx.fillRect(cx - (textWidth / 2) - 6, cy + 14, textWidth + 12, 18);

        ctx.fillStyle = m.nameColor;
        ctx.textBaseline = 'top';
        ctx.fillText(m.name, cx, cy + 16);
    }
    return hits;
}

/**
 * 3. 📍 **내 위치(GPS)** — 🔴 **낡은 자리는 흐리게 — 옮기지도 지우지도 않는다** (기사님 확정).
 *    맥박(퍼지는 원)은 «지금 여기 있다»는 말이라 낡았으면 멈춘다 — 숨 쉬는 마커가 몇 분 전 자리에서 뛰면 화면이 거짓말한다 (규칙 ⑤-2).
 *    ⚠️ 그래도 **점은 남긴다** — 마지막 자리는 집보다 비교가 안 되게 가깝다.
 * @param nowSec 맥박의 박자 — 지금 시각(초). 부르는 쪽이 잰다
 */
export function drawMyLocation(ctx: CanvasRenderingContext2D, at: XY, o: { stale: boolean; nowSec: number; mapColors: MapColors; theme: 'dark' | 'light' },
    getScreenPt: Project) {
    const { mapColors, theme } = o;
    const { cx, cy } = getScreenPt(at);
    const pulseRadius = 15 + Math.sin(o.nowSec * 3) * 5;

    if (!o.stale) {
        ctx.beginPath();
        ctx.arc(cx, cy, pulseRadius, 0, 2 * Math.PI);
        ctx.fillStyle = withAlpha(mapColors.myLocationPulse, 0.2);
        ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
    ctx.fillStyle = o.stale
        ? withAlpha(mapColors.myLocationPulse, 0.45)   // 흐리게 — «여기 있었다»
        : mapColors.myLocationPulse;
    ctx.strokeStyle = o.stale
        ? withAlpha(mapColors.myLocationStroke, 0.5) : mapColors.myLocationStroke;
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, 0.45);
    ctx.fillRect(cx - 20, cy + 10, 40, 16);

    ctx.fillStyle = mapColors.myLocationDotText;
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("현위치", cx, cy + 22);
}
