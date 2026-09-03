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

    // 0.2도 ≈ 정규 좌표 0.2/360 (등방이라 가로·세로 어느 쪽이든 같은 폭이다)
    let rangeNx = maxNx - minNx;
    let rangeNy = maxNy - minNy;
    if (rangeNx < 0.01 / 360) rangeNx = 0.2 / 360;
    if (rangeNy < 0.01 / 360) rangeNy = 0.2 / 360;

    const base = anchorBaseOf(width, height, occludedBottom);
    return {
        worldSize: Math.min(drawWidth / rangeNx, drawHeight / rangeNy) * zoom,
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
