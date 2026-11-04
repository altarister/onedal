/**
 * 🌍 **지도 타일 일반식 — 한 벌** (관제웹 지도 `client-app/lib/mapProjection` · 운영센터 지도가 같이 쓴다 · 순수 · import 0).
 *    배경은 OpenStreetMap 표준 타일(256px · 키 없음)이고, 그 위의 점 · 이름표는 각 화면이 직접 그린다.
 *    여기는 «경위도 → 타일 좌표계»와, 운영센터처럼 «점 몇 개를 한 화면에 담아 보이는» 가벼운 보기 계산만 둔다.
 *    관제웹의 시점 · 여백 · 보기 모드 · 손짓은 관제웹 `mapProjection` 에 남는다(그 화면만의 것).
 */

/** 지도 타일 한 장의 원본 크기(px) — 표준 슬리피 타일 규격 */
export const TILE_SIZE = 256;
/** OSM 이 제공하는 최대 확대 단계 */
export const TILE_MAX_ZOOM = 19;

/**
 * 🌍 **웹 메르카토르** — 지도 타일이 쓰는 투영. 결과는 0~1 정규 좌표다.
 *
 * 🔴 경도·위도를 **그대로 평면에** 놓으면(선형 투영) 위도 37도(한국)에서
 *    세로가 약 **1.25배** 어긋나, 그 위에 타일을 얹으면 마커가 도로에서 밀린다.
 */
export function projectMercator(lng: number, lat: number): { nx: number; ny: number } {
    const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
    const s = Math.sin(clamped * Math.PI / 180);
    return {
        nx: (lng + 180) / 360,
        ny: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI),
    };
}

/** 한 화면의 보기 — 줌(정수 · 타일 단계)과 화면 가운데의 정규 좌표 */
export interface TileView { zoom: number; centerNx: number; centerNy: number }

/** 점이 하나뿐일 때의 줌 — 동네가 보이는 정도 */
export const SINGLE_POINT_ZOOM = 13;

/**
 * 점들을 한 화면에 다 담는 보기 — 가장 크게 볼 수 있는 정수 줌(가장자리 여유 `margin` 을 남긴다).
 * 점이 없으면 null(지어낸 자리로 지도를 펴지 않는다) · 하나면 `SINGLE_POINT_ZOOM`.
 */
export function fitViewOf(points: Array<{ lat: number; lng: number }>, width: number, height: number, margin = 0.8): TileView | null {
    if (points.length === 0 || width <= 0 || height <= 0) return null;
    const ps = points.map(p => projectMercator(p.lng, p.lat));
    const minX = Math.min(...ps.map(p => p.nx)), maxX = Math.max(...ps.map(p => p.nx));
    const minY = Math.min(...ps.map(p => p.ny)), maxY = Math.max(...ps.map(p => p.ny));
    const centerNx = (minX + maxX) / 2, centerNy = (minY + maxY) / 2;
    const spanX = maxX - minX, spanY = maxY - minY;
    if (spanX === 0 && spanY === 0) return { zoom: SINGLE_POINT_ZOOM, centerNx, centerNy };
    /* 줌 z 에서 세계 폭은 256·2^z px — 점들의 폭이 화면의 margin 안에 들어오는 가장 큰 z */
    const fit = (span: number, px: number) => span > 0 ? Math.log2((px * margin) / (span * TILE_SIZE)) : Infinity;
    const zoom = Math.max(0, Math.min(TILE_MAX_ZOOM, Math.floor(Math.min(fit(spanX, width), fit(spanY, height)))));
    return { zoom, centerNx, centerNy };
}

/** 점 하나의 화면 좌표(px) — 그 보기에서 */
export function screenOf(p: { lat: number; lng: number }, view: TileView, width: number, height: number): { x: number; y: number } {
    const world = TILE_SIZE * Math.pow(2, view.zoom);
    const { nx, ny } = projectMercator(p.lng, p.lat);
    return { x: width / 2 + (nx - view.centerNx) * world, y: height / 2 + (ny - view.centerNy) * world };
}

/** 그 보기에서 화면에 걸치는 타일들 — 화면을 빈틈없이 덮는다(세로로 세계 밖인 줄은 뺀다 · 가로는 한 바퀴 돈다) */
export function tilesIn(view: TileView, width: number, height: number): Array<{ z: number; tx: number; ty: number; left: number; top: number; size: number }> {
    const count = Math.pow(2, view.zoom);
    const world = TILE_SIZE * count;
    const originX = width / 2 - view.centerNx * world, originY = height / 2 - view.centerNy * world;   // 세계 (0,0) 의 화면 자리
    const out: Array<{ z: number; tx: number; ty: number; left: number; top: number; size: number }> = [];
    const txFrom = Math.floor(-originX / TILE_SIZE), txTo = Math.floor((width - originX) / TILE_SIZE);
    const tyFrom = Math.floor(-originY / TILE_SIZE), tyTo = Math.floor((height - originY) / TILE_SIZE);
    for (let ty = tyFrom; ty <= tyTo; ty++) {
        if (ty < 0 || ty >= count) continue;
        for (let tx = txFrom; tx <= txTo; tx++) {
            out.push({ z: view.zoom, tx: ((tx % count) + count) % count, ty, left: originX + tx * TILE_SIZE, top: originY + ty * TILE_SIZE, size: TILE_SIZE });
        }
    }
    return out;
}
