import React, { useRef, useCallback, useEffect } from 'react';
import type { SecuredOrder } from "@onedal/shared";
import { isEvaluating } from "@onedal/shared";
import sidoDataRaw from '../../mapData/sidoData.json';
import { getDistanceKm } from '../../lib/routeUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_THEME_COLORS, withAlpha } from '../../styles/themes';
import {
    TILE_SIZE, TILE_MAX_ZOOM, anchorBaseOf, computeViewport, toScreenPoint, panAfterZoom,
    type Viewport,
} from '../../lib/mapProjection';
import { sheetOccludedPx, type SheetSnap } from '../stage/StageSheet';

const sidoData = sidoDataRaw as any; // GeoJSON FeatureCollection

/**
 * 🗺️ **배경 타일 — 회색조로 연하게** (기사님 확정 2026-09-01 · 세 안 비교 후 C 채택).
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

/** `ctx.filter` 는 옛 사파리에 없다 — 없으면 색 그대로 깔리되 투명도로만 눌린다 */
const supportsCanvasFilter = (ctx: CanvasRenderingContext2D) => typeof ctx.filter === 'string';

/**
 * 🖼️ **지금 화면에 걸치는 타일을 모아 준다** — 아직 안 온 것은 요청만 하고 빼놓는다.
 *
 * 🔴 «없으면 안 그린다»가 맞다. 반쯤 온 배경 위에 시·도 외곽선을 겹쳐 그리면
 *    두 배경이 비쳐 지저분해진다 — 하나라도 오면 타일, 아니면 외곽선(부르는 쪽에서 가른다).
 */
function collectTiles(
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
                img.src = `https://tile.openstreetmap.org/${z}/${tx}/${ty}.png`;
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

export interface RoutePoint {
    type: string;
    name: string;
    isEvaluating: boolean;
    x?: number;
    y?: number;
    routeId?: string;
    /**
     * 🔢 이 정거장의 사이클 번호 — **밖에서 실어 준다**(`stopNoOf`).
     * 🔴 캔버스가 «남은 목록의 몇 번째»로 세면 안 된다 — 2026-09-01 실측:
     *    이름표는 «1. 곤지암읍», 지도 마커는 «2 곤지암읍» 이라 한 화면이 두 답을 했다.
     */
    no?: number;
}

interface Props {
    /** 👣 지나온 발자취 — 표시 전용. no = 방문 순서로 동결된 사이클 번호표 (①) */
    visitedTrail?: Array<{ x: number; y: number; type: '상차' | '하차'; orderId: string; name: string; no: number }>;
    /** 🎨 콜 ID → 고유 색 — 마커 테두리와 덱 카드 점이 같은 색을 본다 (②) */
    callColors?: Map<string, string>;
    /** 🖐️ 마커 탭 — 그 콜 카드로 (S6 문법: 지나온 곳은 확인·수정) */
    onStopTap?: (orderId: string) => void;
    /** 👣 이번 사이클에 실제로 달린 자취 — 연한 선으로 남는다 (표시 전용) */
    drivenTrail?: Array<{ x: number; y: number }>;
    /** 🧭 경로를 든 콜 — 서버가 고른 답. 여기서 다시 찾지 않는다 (0831 잔상 수리) */
    routeHolder?: SecuredOrder | null;
    unifiedRoutePoints: RoutePoint[];
    /** **진행 중인 콜만** 넘긴다. 종료된 콜을 여기서 거르지 않는다 —
     *  계약을 좁히면 거르기를 잊을 자리가 없어진다 (2026-08-10 전수조사) */
    liveRoute: SecuredOrder[];
    myLocation: { x: number, y: number } | null;
    children?: React.ReactNode;
    /** 🎭 무대 배경일 때 — 부모를 가득 채운다 (기본 h-64는 옛 화면용) */
    fill?: boolean;
    /**
     * 🪟 **지금 시트가 어디까지 올라와 있나** — 그만큼 지도가 위로 비켜 준다
     * (기사님 요청 2026-09-01: *"반쯤 열리면 같이 볼 수 있을 것 같은데"*).
     * 옛 화면은 시트가 없으므로 넘기지 않는다 — 그때는 화면 전체가 지도다.
     */
    sheetSnap?: SheetSnap;
}

export default function PinnedRouteCanvas({ unifiedRoutePoints, liveRoute, myLocation, children, fill, visitedTrail, callColors, onStopTap, drivenTrail, routeHolder, sheetSnap }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const mapColors = MAP_THEME_COLORS[theme];

    // 초경량 성능을 위한 퓨어 줌/팬 상태 (React State 대신 Ref 사용으로 60fps 보장)
    const zoomRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const lastDist = useRef(0);
    /** 마지막으로 그린 마커의 화면 좌표 — 탭 히트 판정용 (그릴 때마다 갱신) */
    const markerHits = useRef<Array<{ cx: number; cy: number; orderId: string }>>([]);
    const movedPx = useRef(0);   // 팬과 탭을 가른다
    /**
     * 🖼️ 타일이 늦게 도착하면 **그때 다시 그린다** — 이미지 `onload` 가 부를 최신 `drawMap`.
     *    `drawMap` 은 매번 새 함수라 `onload` 에 직접 걸면 옛 함수가 박힌다.
     */
    const drawRef = useRef<() => void>(() => { });
    /**
     * 🪟 **시트를 따라 «미끄러져» 간다** — 지금 반영 중인 가림 높이(px).
     *
     * 시트는 `height .25s ease` 로 움직인다. 지도가 목표값으로 **한 번에 튀면** 시트가
     * 아직 오는 중인데 경로만 먼저 뛰어 두 개가 따로 논다. 매 프레임 남은 거리의 일부만
     * 좁혀 같은 시간에 함께 도착하게 한다. `null` 은 «아직 한 번도 안 그렸다» —
     * 첫 그림은 애니메이션 없이 제자리에서 시작한다.
     */
    const occludedNow = useRef<number | null>(null);

    // 캔버스 미니맵 렌더링 (단독 함수로 분리하여 제스처 시 즉각 호출)
    const drawMap = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 고해상도(DPI) 디스플레이 대응
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        ctx.clearRect(0, 0, width, height);

        const validPoints = unifiedRoutePoints.filter(p => typeof p.x === 'number' && typeof p.y === 'number') as (RoutePoint & { x: number, y: number })[];

        // 🧭 경로선의 주인은 서버가 정한다 — 여기서 추측하면 판정이 세 벌이 된다 (0831)
        const currentPolyline = routeHolder?.routePolyline || [];
        // 🟡 S4 — 평가 중 후보를 붙인 경로는 «미리보기»다. 확정 경로인 척하면 안 된다 (#64)
        const isPreviewRoute = !!routeHolder && isEvaluating(routeHolder.status);
        const hasPolyline = currentPolyline.length > 0;

        const validPolyline = currentPolyline.filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
        const trail = (visitedTrail ?? []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const driven = (drivenTrail ?? []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
        const allCoords = [...validPoints, ...validPolyline, ...trail, ...driven] as { x: number, y: number }[];
        if (myLocation) allCoords.push(myLocation);

        if (allCoords.length === 0) {
            ctx.fillStyle = mapColors.textMuted;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '12px sans-serif';
            ctx.fillText("위치 데이터를 기다리는 중...", width / 2, height / 2);
            return;
        }

        // 🪟 시트가 덮은 높이 — 목표를 향해 매 프레임 조금씩 좁힌다 (한 번에 튀면 시트와 따로 논다)
        const occludedTarget = sheetSnap ? sheetOccludedPx(sheetSnap, height) : 0;
        if (occludedNow.current == null) occludedNow.current = occludedTarget;   // 첫 그림은 제자리에서
        const gap = occludedTarget - occludedNow.current;
        if (Math.abs(gap) > 0.5) {
            occludedNow.current += gap * 0.22;                                   // ≈ 시트의 .25s 와 맞는 속도
            requestAnimationFrame(() => drawRef.current());
        } else {
            occludedNow.current = occludedTarget;
        }

        // 🔭 시점(視點)은 한 곳에서 — 제스처도 같은 `anchorBaseOf` 를 본다 (규칙 ③)
        const viewport = computeViewport(allCoords, width, height, zoomRef.current, panRef.current, occludedNow.current);
        const getScreenPt = (p: { x: number, y: number }) => toScreenPoint(p, viewport);

        // 0. 🗺️ 배경 — 타일이 왔으면 타일, 아직 없으면 시·도 외곽선 (터널·음영에서도 빈 화면이 안 된다)
        const readyTiles = collectTiles(viewport, width, height, () => drawRef.current());
        if (readyTiles.length > 0) {
            ctx.save();
            // 🎨 회색조·연하게 — 배경이 시끄러우면 색이 안 읽힌다 (규칙 ⑤-3: 색을 틀리는 것이 가장 큰 사고)
            if (supportsCanvasFilter(ctx)) ctx.filter = 'grayscale(1) brightness(1.06) contrast(0.72)';
            ctx.globalAlpha = theme === 'dark' ? 0.5 : 0.75;
            readyTiles.forEach(t => ctx.drawImage(t.img, t.cx, t.cy, t.size + 1, t.size + 1));
            ctx.restore();
            if (theme === 'dark') {
                ctx.fillStyle = 'rgba(10, 14, 22, 0.35)';   // 어두운 테마에서 한 겹 더 눌러 준다
                ctx.fillRect(0, 0, width, height);
            }
        } else if (sidoData.features) {
            const sortedFeatures = [...sidoData.features].sort((a: any, b: any) =>
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

        // 1.5. 기초 연결선 렌더링 (노드들을 잇는 보조 점선 및 직선거리)
        ctx.beginPath();
        ctx.strokeStyle = withAlpha(mapColors.sidoStroke, 0.4);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);

        let pathStarted = false;

        if (myLocation) {
            const { cx, cy } = getScreenPt(myLocation);
            ctx.moveTo(cx, cy);
            pathStarted = true;
        }

        validPoints.forEach((p) => {
            const { cx, cy } = getScreenPt(p);
            if (!pathStarted) {
                ctx.moveTo(cx, cy);
                pathStarted = true;
            } else {
                ctx.lineTo(cx, cy);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // 현위치 - 첫 상차지 간 회색 점선 지점에 직선거리(km) 표기
        if (myLocation && validPoints.length > 0) {
            const startPt = getScreenPt(myLocation);
            const endPt = getScreenPt(validPoints[0]);
            const distKm = getDistanceKm(myLocation.y, myLocation.x, validPoints[0].y, validPoints[0].x);

            const midX = Math.round((startPt.cx + endPt.cx) / 2);
            const midY = Math.round((startPt.cy + endPt.cy) / 2);

            const text = `직선 ${distKm.toFixed(1)}km`;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            const tWidth = ctx.measureText(text).width;

            ctx.fillStyle = withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, theme === 'light' ? 0.8 : 0.7);
            ctx.fillRect(midX - (tWidth / 2) - 4, midY - 14, tWidth + 8, 18);

            ctx.fillStyle = mapColors.stroke; // '#94a3b8' 
            ctx.fillText(text, midX, midY - 1);
        }

        // 0.9. 👣 달린 자취 — 연한 선. 파란 경로선(앞길)이 잘려나가도 이건 사이클 끝까지 남는다
        if (driven.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = withAlpha(mapColors.routeLine, 0.55);
            ctx.lineWidth = 2.5 * zoomRef.current;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            driven.forEach((p, i) => {
                const { cx, cy } = getScreenPt(p);
                if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
            });
            ctx.stroke();
        }

        // 1. 카카오 실제 도로 궤적(폴리라인) 렌더링
        if (hasPolyline && validPolyline.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = isPreviewRoute ? '#e6b422' : mapColors.routeLine;
            if (isPreviewRoute) ctx.setLineDash([10, 8]);   // 노란 점선 = 아직 결재 전 (v23 Ⅱ)
            ctx.lineWidth = 3 * zoomRef.current;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            validPolyline.forEach((p: any, _i: number) => {
                const { cx, cy } = getScreenPt(p);
                if (_i === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 1.7. 👣 지나온 발자취 — 번호는 방문 순서로 동결, 테두리 색 = 콜 색 (①·②)
        markerHits.current = [];
        trail.forEach((p) => {
            const { cx, cy } = getScreenPt(p);
            markerHits.current.push({ cx, cy, orderId: p.orderId });
            ctx.beginPath();
            ctx.arc(cx, cy, 9, 0, 2 * Math.PI);
            ctx.fillStyle = withAlpha('#35c3a9', 0.4);       // 초록 채움 = 다녀옴
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = callColors?.get(p.orderId) ?? '#35c3a9';   // 테두리 = 콜 색
            ctx.stroke();
            ctx.fillStyle = '#d7f5ee';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(p.no), cx, cy + 0.5);
        });

        // 2. 노드 렌더링
        validPoints.forEach((p) => {
            const { cx, cy } = getScreenPt(p);

            if (p.routeId) markerHits.current.push({ cx, cy, orderId: p.routeId });
            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
            ctx.fillStyle = p.type === '상차' ? mapColors.nodePickup : mapColors.nodeDropoff;

            if (p.isEvaluating) {
                ctx.fillStyle = mapColors.nodeEvaluating;
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = mapColors.nodeStrokeEvaluating;
            } else {
                ctx.lineWidth = 2.5;
                // 🎨 테두리 = 콜 색 (②) — 어느 콜의 정거장인지 색으로 읽힌다
                ctx.strokeStyle = (p.routeId && callColors?.get(p.routeId)) || mapColors.nodeStrokeRegular;
            }
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = mapColors.textBody;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // 🔒 번호는 방문한 개수 다음부터 — 지나간 번호를 재사용하지 않는다 (①)
            ctx.fillText(String(p.no ?? ''), cx, cy + 1);   // 번호는 stopNoOf 하나에서 온다

            const textWidth = ctx.measureText(p.name).width;
            ctx.fillStyle = withAlpha(theme === 'light' ? mapColors.textBgLight : mapColors.textBgDark, theme === 'light' ? 0.8 : 0.45);
            ctx.fillRect(cx - (textWidth / 2) - 6, cy + 14, textWidth + 12, 18);

            ctx.fillStyle = p.isEvaluating ? mapColors.nodeStrokeEvaluating : mapColors.textBody;
            ctx.textBaseline = 'top';
            ctx.fillText(p.name, cx, cy + 16);
        });

        // 3. 내 위치(GPS) 렌더링
        if (myLocation) {
            const { cx, cy } = getScreenPt(myLocation);

            const time = Date.now() / 1000;
            const pulseRadius = 15 + Math.sin(time * 3) * 5;

            ctx.beginPath();
            ctx.arc(cx, cy, pulseRadius, 0, 2 * Math.PI);
            ctx.fillStyle = withAlpha(mapColors.myLocationPulse, 0.2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.fillStyle = mapColors.myLocationPulse;
            ctx.strokeStyle = mapColors.myLocationStroke;
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

        // 4. © 표기 — 타일을 쓴 화면에만. 빌린 것은 빌렸다고 적는다 (OSM 라이선스)
        if (readyTiles.length > 0) {
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = withAlpha(mapColors.textMuted, 0.7);
            ctx.fillText('© OpenStreetMap', width - 4, height - 3);
        }
    }, [unifiedRoutePoints, liveRoute, myLocation, visitedTrail, drivenTrail, routeHolder, theme, mapColors, sheetSnap]);

    useEffect(() => {
        drawRef.current = drawMap;   // 늦게 온 타일이 부를 최신 그리기
        drawMap();
    }, [drawMap]);

    // 제스처 핸들러 (드래그 팬 & 줌)
    const handlePointerDown = (e: any) => {
        isDragging.current = true;
        movedPx.current = 0;
        if (e.touches && e.touches.length === 1) {
            lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.clientX !== undefined) {
            lastPos.current = { x: e.clientX, y: e.clientY };
        } else if ('touches' in e && e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastDist.current = Math.hypot(dx, dy);
        }
    };

    const handlePointerMove = (e: any) => {
        if (!isDragging.current) return;

        let clientX = 0; let clientY = 0;

        if (e.touches) {
            if (e.touches.length === 1) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const scaleDiff = (dist - lastDist.current) * 0.01;
                zoomRef.current = Math.max(0.5, Math.min(10, zoomRef.current + scaleDiff));
                lastDist.current = dist;
                drawMap();
                return;
            }
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        if (clientX === 0 && clientY === 0) return;

        const deltaX = clientX - lastPos.current.x;
        const deltaY = clientY - lastPos.current.y;

        panRef.current.x += deltaX;
        panRef.current.y += deltaY;
        movedPx.current += Math.abs(deltaX) + Math.abs(deltaY);

        lastPos.current = { x: clientX, y: clientY };
        drawMap();
    };

    const handlePointerUp = (e?: any) => {
        isDragging.current = false;
        if (!onStopTap || movedPx.current > 8) return;   // 팬이었다 — 탭 아님
        const canvas = canvasRef.current;
        const pt = e?.changedTouches?.[0] ?? e;
        if (!canvas || pt?.clientX == null) return;
        const rect = canvas.getBoundingClientRect();
        const x = pt.clientX - rect.left, y = pt.clientY - rect.top;
        const hit = markerHits.current.find(h => Math.hypot(h.cx - x, h.cy - y) <= 20);
        if (hit) onStopTap(hit.orderId);
    };

    /**
     * 🔍 **누른 자리를 붙잡은 채 배율만 바꾼다.**
     *
     * 🔴 기준점은 `anchorBaseOf` 다 — 예전 공식은 화면 원점(0,0)을 기준으로 삼았는데,
     *    실제 원점은 버튼 여백만큼 밀려 있어 **확대할수록 지도가 옆으로 흘렀다.**
     */
    const zoomAround = (screenX: number, screenY: number, zoomDelta: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const newZoom = Math.max(0.5, Math.min(10, zoomRef.current * zoomDelta));
        const ratio = newZoom / zoomRef.current;
        // 🪟 그리는 쪽이 지금 쓰고 있는 가림 높이를 그대로 본다 — 두 벌이면 확대점이 어긋난다
        const base = anchorBaseOf(rect.width, rect.height, occludedNow.current ?? 0);

        panRef.current.x = panAfterZoom(screenX, base.x, panRef.current.x, ratio);
        panRef.current.y = panAfterZoom(screenY, base.y, panRef.current.y, ratio);

        zoomRef.current = newZoom;
        drawMap();
    };

    const handleZoomClick = (zoomDelta: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        zoomAround(rect.width / 2, rect.height / 2, zoomDelta);
    };

    const handleWheel = (e: any) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        zoomAround(e.clientX - rect.left, e.clientY - rect.top, e.deltaY > 0 ? 0.9 : 1.1);
    };

    return (
        <div style={{ backgroundColor: mapColors.fill }} className={`relative w-full ${fill ? "h-full" : "h-64"} cursor-grab active:cursor-grabbing overflow-hidden`}>
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full touch-none"
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                onWheel={handleWheel}
            />

            <div className="absolute top-3 right-3 flex flex-col space-y-2 z-10">
                <button
                    onClick={() => handleZoomClick(1.2)}
                    className="w-8 h-8 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg text-text-primary border border-border backdrop-blur-sm font-black opacity-80 hover:opacity-100 transition-all"
                >
                    +
                </button>
                <button
                    onClick={() => handleZoomClick(0.8)}
                    className="w-8 h-8 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg text-text-primary border border-border backdrop-blur-sm font-black opacity-80 hover:opacity-100 transition-all"
                >
                    -
                </button>
                <button
                    onClick={() => { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; drawMap(); }}
                    className="w-8 h-8 flex items-center justify-center bg-surface-alt/80 hover:bg-surface-hover rounded-md shadow-lg text-text-primary border border-border backdrop-blur-sm text-[10px] font-bold opacity-80 hover:opacity-100 transition-all"
                >
                    초기화
                </button>
            </div>
            {children}
        </div>
    );
}
