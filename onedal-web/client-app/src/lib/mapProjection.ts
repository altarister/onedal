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
 * 📍 **경로 중심이 놓이는 자리** (팬 이전의 기준점).
 * 🔴 좌우 여백이 달라 **화면 한가운데가 아니다.**
 */
export function anchorBaseOf(width: number, height: number): { x: number; y: number } {
    return {
        x: PADDING_LEFT + (width - PADDING_LEFT - PADDING_RIGHT) / 2,
        y: PADDING_TOP + (height - PADDING_TOP - PADDING_BOTTOM) / 2,
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
): Viewport {
    const projected = coords.map(p => projectMercator(p.x, p.y));
    const nxs = projected.map(n => n.nx);
    const nys = projected.map(n => n.ny);
    const minNx = Math.min(...nxs), maxNx = Math.max(...nxs);
    const minNy = Math.min(...nys), maxNy = Math.max(...nys);

    const drawWidth = width - (PADDING_LEFT + PADDING_RIGHT);
    const drawHeight = height - (PADDING_TOP + PADDING_BOTTOM);

    // 0.2도 ≈ 정규 좌표 0.2/360 (등방이라 가로·세로 어느 쪽이든 같은 폭이다)
    let rangeNx = maxNx - minNx;
    let rangeNy = maxNy - minNy;
    if (rangeNx < 0.01 / 360) rangeNx = 0.2 / 360;
    if (rangeNy < 0.01 / 360) rangeNy = 0.2 / 360;

    const base = anchorBaseOf(width, height);
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
