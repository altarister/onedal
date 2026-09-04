/**
 * 🧭 **지도 투영과 시점(視點)** — 캔버스가 «어디에 그릴까»를 묻는 유일한 곳.
 *
 * 그리는 쪽(`PinnedRouteCanvas`)과 제스처 쪽(확대·축소)이 **같은 기준점**을 봐야 한다.
 * 예전에는 둘이 각자 계산했고, 그리는 쪽은 여백을 넣고 제스처 쪽은 안 넣어서
 * **확대할수록 지도가 옆으로 흘렀다** (규칙 ③: 파생값을 만들었으면 그 입력도 한 곳에서).
 *
 * 여기 있는 것은 전부 **순수 함수**다 — 캔버스도 DOM 도 모른다. 그래서 검사할 수 있다.
 */

/** 지도 타일 한 장의 원본 크기(px) — 표준 슬리피 타일 규격 */
export const TILE_SIZE = 256;
/** OSM 이 제공하는 최대 확대 단계 */
export const TILE_MAX_ZOOM = 19;

export const PADDING_LEFT = 70;    // 좌측 버튼 여백 (추천, 시간, 거리)
export const PADDING_RIGHT = 60;   // 우측 버튼 여백 (+, -, 초기화)
export const PADDING_TOP = 50;
export const PADDING_BOTTOM = 40;

/** 한 점만 있을 때 보여 줄 폭 — 0.01° ≈ 1.1km (주변이 보이는 정도) */
export const SINGLE_POINT_SPAN = 0.01 / 360;
/** 끝점이 가장자리에 딱 붙지 않게 두는 여유 — 마커 반지름과 이름표 자리 */
export const FIT_MARGIN = 0.9;

export interface GeoPoint { x: number; y: number }   // x = 경도, y = 위도

/**
 * 🌍 **웹 메르카토르** — 지도 타일이 쓰는 투영. 결과는 0~1 정규 좌표다.
 *
 * 🔴 옛 캔버스는 경도·위도를 **그대로 평면에** 놓았다(선형 투영). 위도 37도(한국)에서
 *    세로가 약 **1.25배** 어긋나므로, 그 위에 타일을 얹으면 마커가 도로에서 밀린다.
 *    바꿀 곳은 여기 하나였다 — 그리는 코드는 전부 `toScreenPoint` 를 지난다.
 */
export function projectMercator(lng: number, lat: number): { nx: number; ny: number } {
    const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const s = Math.sin(clamped * Math.PI / 180);
    return {
        nx: (lng + 180) / 360,
        ny: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
    };
}

/**
 * 🪟 **시트에 가려도 최소한 이만큼은 지도로 남긴다** (px).
 * 이 아래로 내려가면 경로가 뭉개져 아무것도 못 읽으므로, 가림을 그만 반영한다.
 */
const MIN_VISIBLE_HEIGHT = 140;

/**
 * 📐 **지도가 실제로 보이는 세로 길이** — 위 여백과 **시트가 덮은 아래쪽**을 뺀 것.
 * 🔴 여기 하나가 «보이는 자리»를 정한다. 맞춤(fit)과 중심(anchor)이 같은 답을 봐야 한다.
 */
function visibleHeightOf(height: number, occludedBottom: number): number {
    const free = height - PADDING_TOP - PADDING_BOTTOM - Math.max(0, occludedBottom);
    return Math.max(MIN_VISIBLE_HEIGHT, free);
}

/**
 * 📍 **경로 중심이 놓이는 자리** (팬 이전의 기준점).
 *
 * 🔴 좌우 여백이 달라 **화면 한가운데가 아니다.**
 * 🔴 그리고 **시트가 아래를 덮으면 그만큼 위로 올라온다** (기사님 요청 2026-09-01).
 *    시트를 반쯤 열었을 때 «지도와 시트를 같이 보는» 것이 목적이라, 경로는 남은 위쪽
 *    자리의 한가운데에 와야 한다. 가림을 모르면 경로 아랫부분이 시트 뒤에 숨는다.
 */
export function anchorBaseOf(width: number, height: number, occludedBottom = 0): { x: number; y: number } {
    return {
        x: PADDING_LEFT + (width - PADDING_LEFT - PADDING_RIGHT) / 2,
        y: PADDING_TOP + visibleHeightOf(height, occludedBottom) / 2,
    };
}

export interface Viewport {
    /** 세계 전체를 몇 픽셀로 볼 것인가 — 타일 단계도 이 값에서 나온다 */
    worldSize: number;
    anchorX: number;
    anchorY: number;
    centerNx: number;
    centerNy: number;
}

/**
 * 🔭 **주어진 좌표들이 화면에 들어오는 시점을 구한다.**
 * 좌표가 하나뿐이거나 전부 같으면 약 20km 폭으로 벌려 준다.
 */
export function computeViewport(
    coords: GeoPoint[], width: number, height: number,
    zoom: number, pan: { x: number; y: number },
    /** 🪟 시트가 아래에서 덮은 높이(px) — 맞춤도 중심도 «보이는 자리» 안에서 한다 */
    occludedBottom = 0,
): Viewport {
    const projected = coords.map(p => projectMercator(p.x, p.y));
    const nxs = projected.map(n => n.nx);
    const nys = projected.map(n => n.ny);
    const minNx = Math.min(...nxs), maxNx = Math.max(...nxs);
    const minNy = Math.min(...nys), maxNy = Math.max(...nys);

    const drawWidth = width - (PADDING_LEFT + PADDING_RIGHT);
    const drawHeight = visibleHeightOf(height, occludedBottom);

    const rangeNx = maxNx - minNx;
    const rangeNy = maxNy - minNy;

    /**
     * 🔴 **짧은 축을 «22km»로 갈아치우지 않는다** (기사님 실측 2026-09-04:
     *    *"4~5 가산동은 다른 지점이 보일 만큼 줌 아웃 되어 있어"*).
     *
     *    예전 식은 `범위 < 0.01°(1.1km) 면 0.2°(22km) 로` 였다. 그래서 **세로로 뻗은 구간**은
     *    가로가 짧다는 이유로 22km 짜리 가로 범위를 뒤집어썼고, `min()` 이 그 축을 골라
     *    화면이 통째로 축소됐다. 실측: ④→⑤ 가로 1.0km 가 22.2km 로 부풀었다.
     *
     *    🟢 짧은 축은 **«제약이 없다»** 로 두면 된다 — `min()` 이 알아서 다른 축을 고른다.
     *       두 축이 다 0 일 때(한 점)만 기본 폭을 준다.
     */
    const EPS = 1e-12;
    const byWidth = rangeNx > EPS ? drawWidth / rangeNx : Infinity;
    const byHeight = rangeNy > EPS ? drawHeight / rangeNy : Infinity;
    let fitted = Math.min(byWidth, byHeight);
    if (!Number.isFinite(fitted)) fitted = drawWidth / SINGLE_POINT_SPAN;   // 한 점뿐일 때

    const base = anchorBaseOf(width, height, occludedBottom);
    return {
        /**
         * 🔴 **가장자리에 딱 붙이지 않는다** — 마커는 반지름이 있고 이름표는 그 아래 붙는다.
         *    딱 맞추면 끝점의 이름표가 잘린다 (기사님: *"3석수동이 화면에 보이지 않아"*).
         */
        worldSize: fitted * FIT_MARGIN * zoom,
        anchorX: base.x + pan.x,
        anchorY: base.y + pan.y,
        centerNx: (minNx + maxNx) / 2,
        centerNy: (minNy + maxNy) / 2,
    };
}

/** 위경도 → 화면 픽셀. 마커·경로선·발자취·이름표·탭 판정이 전부 이 한 곳을 지난다 */
export function toScreenPoint(p: GeoPoint, v: Viewport): { cx: number; cy: number } {
    const n = projectMercator(p.x, p.y);
    return {
        cx: (n.nx - v.centerNx) * v.worldSize + v.anchorX,
        cy: (n.ny - v.centerNy) * v.worldSize + v.anchorY,
    };
}

/**
 * 🔍 **누른 자리를 붙잡은 채 배율만 바꿀 때의 새 pan.**
 * 한 축의 값만 다루므로 x·y 각각 부른다.
 */
export function panAfterZoom(screen: number, base: number, pan: number, ratio: number): number {
    return (screen - base) - ((screen - base) - pan) * ratio;
}

/**
 * 🤏 **핀치 한 틱 — 두 손가락의 중간을 붙잡은 채 배율만 바꾼다** (2026-09-04 신설).
 *
 * 🔴 **핀치만 이 계산을 안 하고 있었다.** 휠·버튼은 `zoomAround` 가 기준점을 잡고
 *    팬을 보정했는데, 핀치는 `zoomRef += scaleDiff` 로 **배율만** 바꿨다.
 *    그래서 확대의 중심이 «두 손가락 중간»이 아니라 화면이 원래 잡고 있던 중심이었고,
 *    손가락이 가운데서 벗어날수록 **한쪽으로 쏠렸다**
 *    (기사님 실주행 2026-09-03: *"손가락 중간을 기준점으로 줌인이 될 거라 생각했는데..
 *    한쪽 방향으로 치우쳐서 줌인되었어"*).
 *
 * 🔴 **배율은 거리의 «비»로 잡는다.** 예전 `(dist - last) * 0.01` 은 **더하기**라
 *    화면 크기·손가락 간격에 따라 체감이 달라졌다. 비로 잡으면 «두 배 벌리면 두 배»다.
 *
 * @param prev  직전 두 손가락 거리 (px)
 * @param now   지금 두 손가락 거리 (px)
 * @param mid   지금 두 손가락의 중간점 — **캔버스 안 좌표**
 * @param base  `anchorBaseOf` 가 준 기준점 (그리는 쪽과 같은 값이어야 한다)
 */
export function pinchStep(
    prev: number, now: number,
    mid: { x: number; y: number },
    base: { x: number; y: number },
    zoom: number, pan: { x: number; y: number },
    min = 0.5, max = 10,
): { zoom: number; pan: { x: number; y: number } } {
    // 손가락이 겹치거나 값이 이상하면 아무것도 바꾸지 않는다 (규칙 ④ — 지어내지 않는다)
    if (!(prev > 0) || !(now > 0)) return { zoom, pan };

    const next = Math.max(min, Math.min(max, zoom * (now / prev)));
    const ratio = next / zoom;   // 상한에 걸리면 ratio 가 1 이 되어 팬도 안 움직인다
    return {
        zoom: next,
        pan: {
            x: panAfterZoom(mid.x, base.x, pan.x, ratio),
            y: panAfterZoom(mid.y, base.y, pan.y, ratio),
        },
    };
}

/**
 * 🔍 **확대하면 지도가 제 색을 되찾는다** (기사님 확정 2026-09-04).
 *
 * 기사님(실주행 09-03): *"줌인이 되면 지도의 색이 투명해도 될 것 같아.
 * **지도를 보겠다는 의지가 있었던 거니까.**"*
 *
 * ── 왜 평소엔 흐린가 ──
 * 배경이 시끄러우면 그 위의 **판정 색·마커 색이 안 읽힌다** (규칙 ⑤-3: 색을 틀리는 것이
 * 가장 큰 사고). 그래서 평소에는 회색조로 눌러 둔다.
 *
 * ── 왜 확대하면 풀어도 되나 ──
 * 확대는 **«여기가 어디인지 보겠다»는 손짓**이다. 그 순간에는 지도가 주인공이고,
 * 마커는 이미 화면에서 커져 있어 배경에 안 묻힌다.
 *
 * 🔴 **한 번에 바뀌지 않는다.** `FROM`~`TO` 사이에서 서서히 풀린다 —
 *    계단처럼 튀면 «화면이 깜빡였다»로 읽히고, 그건 운전 중에 시선을 뺏는다.
 * 🔴 **두 값을 함께 움직인다** — 색(회색조)만 돌아오고 연한 채로면 색이 탁해 보이고,
 *    진하기만 돌아오고 회색이면 «흑백을 키운 것»이 된다.
 *
 * @param zoom  지금 배율 (1 = 기본)
 * @param dim   평소의 진하기 (테마마다 다르다 — 어두운 테마 0.5 · 밝은 테마 0.75)
 */
export const TILE_CLEAR_FROM = 2;   // 여기서부터 풀리기 시작한다
export const TILE_CLEAR_TO = 4;     // 여기서 원본 그대로

/**
 * 🔴 **여기 들어오는 `zoom` 은 «손으로 더한 배율»이 아니라 «실제 배율»이다** (2026-09-04 정정).
 *    「현위치」로 크게 당겨 놓아도 `zoomRef` 는 1 이라, 손 배율만 보면 **딤이 안 걷혔다.**
 *    그래서 `effectiveZoom(viewport, baseWorldSize)` 로 **화면에 실제로 얼마나 크게
 *    그려지는가**를 재서 넘긴다 — 어느 길로 확대했든 답이 같아진다 (규칙 ③).
 */
export function mapTileTone(zoom: number, dim: number): { alpha: number; filter: string | null } {
    const span = TILE_CLEAR_TO - TILE_CLEAR_FROM;
    const t = Math.max(0, Math.min(1, (zoom - TILE_CLEAR_FROM) / span));   // 0 = 평소 · 1 = 원본
    if (t >= 1) return { alpha: 1, filter: null };

    const alpha = dim + (1 - dim) * t;
    // 회색조·대비도 같은 비율로 되돌린다 — 1 이면 원본, 0 이면 평소 값
    const gray = 1 - t;
    const bright = 1 + 0.06 * (1 - t);
    const contrast = 0.72 + 0.28 * t;
    return {
        alpha,
        filter: `grayscale(${gray.toFixed(3)}) brightness(${bright.toFixed(3)}) contrast(${contrast.toFixed(3)})`,
    };
}

/**
 * 🖊️ **경로선 두께 — 확대해도 도로를 덮지 않는다** (기사님 지적 2026-09-04).
 *
 * 기사님: *"라인이 너무 두꺼워 길을 잘 간 건지 모르겠어. 줌에 따라 두께가 달라져야 할 것 같아."*
 *
 * 🔴 예전 식은 `3 * zoom` 이었다 — **배율에 그대로 곱했다.** 10배로 확대하면 30px 짜리
 *    띠가 되어 도로를 통째로 덮었고, «계획선과 궤적이 겹쳤나»를 볼 수가 없었다.
 *    확대는 «자세히 보겠다»는 손짓인데 선이 오히려 자세함을 가린 셈이다.
 *
 * 🔴 **화면 픽셀 기준으로 잡는다.** 확대해도 조금만 굵어지고 상한에서 멈춘다 —
 *    지도 앱이 도로를 그리는 방식과 같다. 그래야 확대할수록 «두 선의 틈»이 벌어져 보인다.
 */
export const ROUTE_WIDTH_BASE = 3;
export const ROUTE_WIDTH_MAX = 2;   // 기본의 몇 배까지

export function routeLineWidth(zoom: number): number {
    const grow = Math.min(ROUTE_WIDTH_MAX, Math.sqrt(Math.max(0.1, zoom)));
    return ROUTE_WIDTH_BASE * grow;
}

/**
 * 🔭 **지도가 무엇에 맞춰지나 — 세 가지** (기사님 실주행 09-03 · 만듦 2026-09-04).
 *
 * 기사님: *"네비와 전체 경로가 같이 보이니까 그건 좋았는데. **지금 가고 있는 곳만**
 * 볼 수 있으면 좋겠어. 상황판에 나온 경로만 줌으로 보여주는 거지."*
 * 그리고: *"지도에서 **네비처럼 현위치가 가운데** 있는 옵션도 있어야 할 것 같아."*
 *
 * 🟢 **새 기계가 필요 없다.** 지도는 «주어진 좌표들이 다 보이게» 뷰포트를 잡는다
 *    (`computeViewport`). 그러니 **무엇을 주느냐**만 바꾸면 세 가지가 다 된다.
 *
 * | | 무엇을 주나 | 언제 쓰나 |
 * |---|---|---|
 * | `all` | 정거장·경로·궤적 전부 | 하루를 조망할 때 (지금 기본) |
 * | `leg` | **현위치 + 다음 정거장** | 달리는 중 — 지금 구간만 크게 |
 * | `follow` | 현위치 둘레 상자 | 내비처럼 — 현위치가 가운데 |
 *
 * 🔴 **재료가 없으면 `all` 로 떨어진다.** 현위치를 못 읽거나 다음 정거장이 없을 때
 *    빈 지도를 보여주지 않는다 (규칙 ④ — 없는 것을 지어내지 않되, 아는 만큼은 보여 준다).
 */
export type MapViewMode = 'all' | 'leg' | 'follow';

/**
 * `follow` 에서 현위치 둘레로 잡는 반경 (km).
 * 🔴 «주변을 살펴보려는 의도»라 **골목 이름이 읽히는 배율**이어야 한다
 *    (기사님 2026-09-04: *"지도가 잘 보이는 구간까지 줌이 더 되어야 할 것 같아"*).
 *    처음 1.5km 는 동네가 통째로 들어와 «살펴보기»가 안 됐다.
 */
export const FOLLOW_RADIUS_KM = 0.6;

export function viewCoordsFor(
    mode: MapViewMode,
    allCoords: Array<{ x: number; y: number }>,
    myLocation: { x: number; y: number } | null,
    nextStop: { x: number; y: number } | null,
    /** 👣 직전에 다녀온 정거장 — 구간의 **시작점**이다 (없으면 현위치가 시작점) */
    prevStop?: { x: number; y: number } | null,
): Array<{ x: number; y: number }> {
    if (mode === 'leg' && nextStop) {
        /**
         * 🔴 **구간은 «직전 정거장 → 다음 정거장»이다** (기사님 2026-09-04:
         *    *"구간은 지금 진행하고 있는 구간이 다 보여야 해"*).
         *    처음엔 «현위치 → 다음 정거장»으로 잡았는데 — 그러면 달릴수록 둘이 가까워져
         *    **화면이 계속 확대된다.** 구간은 달리는 동안 **가만히 있어야** 한다.
         * 🔴 현위치도 함께 넣는다 — 길을 벗어났을 때 내가 화면 밖으로 나가면 안 된다.
         * 🟢 배율은 «고정»이 아니라 **구간 길이에서 나온다** — 멀면 축소, 짧으면 확대.
         *    `computeViewport` 가 주어진 좌표를 화면에 맞추므로 저절로 그렇게 된다.
         */
        const leg = [prevStop ?? myLocation, nextStop, myLocation]
            .filter(Boolean) as Array<{ x: number; y: number }>;
        if (leg.length >= 2) return leg;
    }
    if (mode === 'follow' && myLocation) {
        // 위도 1° ≈ 111km · 경도는 위도에 따라 좁아진다
        const dy = FOLLOW_RADIUS_KM / 111;
        const dx = dy / Math.max(0.2, Math.cos(myLocation.y * Math.PI / 180));
        return [
            { x: myLocation.x - dx, y: myLocation.y - dy },
            { x: myLocation.x + dx, y: myLocation.y + dy },
        ];
    }
    return allCoords;
}

/** 🔁 버튼 하나로 돈다 — 운전 중에는 손가락 하나, 자리 하나가 낫다 */
export const MAP_VIEW_ORDER: MapViewMode[] = ['all', 'leg', 'follow'];
export function nextViewMode(m: MapViewMode): MapViewMode {
    return MAP_VIEW_ORDER[(MAP_VIEW_ORDER.indexOf(m) + 1) % MAP_VIEW_ORDER.length];
}

/**
 * 🔭 **실제 배율** — 지금 뷰포트가 «전체 보기»보다 몇 배 크게 그리고 있나.
 *
 * 손으로 확대하든(`zoomRef`), 「구간」·「현위치」로 맞춰 확대되든 **답이 하나여야 한다.**
 * 그래야 «확대하면 지도가 제 색을 되찾는다»가 어느 길로 확대했든 똑같이 작동한다.
 */
export function effectiveZoom(worldSize: number, baseWorldSize: number): number {
    if (!(baseWorldSize > 0)) return 1;
    return worldSize / baseWorldSize;
}
