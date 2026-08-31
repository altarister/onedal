import React, { useRef, useCallback, useEffect } from 'react';
import type { SecuredOrder } from "@onedal/shared";
import { isEvaluating } from "@onedal/shared";
import sidoDataRaw from '../../mapData/sidoData.json';
import { getDistanceKm } from '../../lib/routeUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_THEME_COLORS, withAlpha } from '../../styles/themes';

const sidoData = sidoDataRaw as any; // GeoJSON FeatureCollection

export interface RoutePoint {
    type: string;
    name: string;
    isEvaluating: boolean;
    x?: number;
    y?: number;
    routeId?: string;
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
}

export default function PinnedRouteCanvas({ unifiedRoutePoints, liveRoute, myLocation, children, fill, visitedTrail, callColors, onStopTap, drivenTrail, routeHolder }: Props) {
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

        const xs = allCoords.map(p => p.x);
        const ys = allCoords.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const paddingLeft = 70; // 좌측 버튼 여백 (추천, 시간, 거리)
        const paddingRight = 60; // 우측 버튼 여백 (+, -, 초기화)
        const paddingTop = 50; 
        const paddingBottom = 40; 

        const drawWidth = width - (paddingLeft + paddingRight);
        const drawHeight = height - (paddingTop + paddingBottom);

        let rangeX = maxX - minX;
        let rangeY = maxY - minY;

        // 좌표가 1개뿐이거나 모든 좌표가 동일한 경우 기본 줌 레벨 (약 20km 반경)
        if (rangeX < 0.01) rangeX = 0.2;
        if (rangeY < 0.01) rangeY = 0.2;

        // 비율 잠금 (Isotropic Scaling)
        const scale = Math.min(drawWidth / rangeX, drawHeight / rangeY);

        const contentWidth = rangeX * scale;
        const contentHeight = rangeY * scale;

        const offsetX = paddingLeft + (drawWidth - contentWidth) / 2;
        const offsetY = paddingTop + (drawHeight - contentHeight) / 2;

        const getScreenPt = (p: { x: number, y: number }) => ({
            cx: (offsetX + (p.x - minX) * scale) * zoomRef.current + panRef.current.x,
            cy: (offsetY + (maxY - p.y) * scale) * zoomRef.current + panRef.current.y
        });

        // 0. 시도/배경 그리기 (GeoJSON 연동)
        if (sidoData.features) {
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
        validPoints.forEach((p, i) => {
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
            ctx.fillText((trail.length + i + 1).toString(), cx, cy + 1);

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
    }, [unifiedRoutePoints, liveRoute, myLocation, visitedTrail, drivenTrail, routeHolder, theme, mapColors]);

    useEffect(() => {
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

    const handleZoomClick = (zoomDelta: number) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = rect.width / 2;
        const y = rect.height / 2;

        const newZoom = Math.max(0.5, Math.min(10, zoomRef.current * zoomDelta));
        panRef.current.x = x - (x - panRef.current.x) * (newZoom / zoomRef.current);
        panRef.current.y = y - (y - panRef.current.y) * (newZoom / zoomRef.current);

        zoomRef.current = newZoom;
        drawMap();
    };

    const handleWheel = (e: any) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.5, Math.min(10, zoomRef.current * zoomDelta));

        panRef.current.x = x - (x - panRef.current.x) * (newZoom / zoomRef.current);
        panRef.current.y = y - (y - panRef.current.y) * (newZoom / zoomRef.current);

        zoomRef.current = newZoom;
        drawMap();
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
