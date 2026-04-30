import React, { useRef, useCallback, useEffect } from 'react';
import type { SecuredOrder } from "@onedal/shared";
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
    unifiedRoutePoints: RoutePoint[];
    safeRoute: SecuredOrder[];
    myLocation: { x: number, y: number } | null;
    children?: React.ReactNode;
}

export default function PinnedRouteCanvas({ unifiedRoutePoints, safeRoute, myLocation, children }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme } = useTheme();
    const mapColors = MAP_THEME_COLORS[theme];

    // 초경량 성능을 위한 퓨어 줌/팬 상태 (React State 대신 Ref 사용으로 60fps 보장)
    const zoomRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const lastDist = useRef(0);

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

        // 가장 최신의 상태 중 궤적 정보가 계산 완료된 오더 확보
        const lastValidOrderWithPolyline = [...safeRoute].reverse().find(r => r.routePolyline && r.routePolyline.length > 0);
        const currentPolyline = lastValidOrderWithPolyline?.routePolyline || [];
        const hasPolyline = currentPolyline.length > 0;

        const validPolyline = currentPolyline.filter((p: any) => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
        const allCoords = [...validPoints, ...validPolyline] as { x: number, y: number }[];
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

        // 1. 카카오 실제 도로 궤적(폴리라인) 렌더링
        if (hasPolyline && validPolyline.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = mapColors.routeLine;
            ctx.lineWidth = 3 * zoomRef.current;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            validPolyline.forEach((p: any, _i: number) => {
                const { cx, cy } = getScreenPt(p);
                if (_i === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            });
            ctx.stroke();
        }

        // 2. 노드 렌더링
        validPoints.forEach((p, i) => {
            const { cx, cy } = getScreenPt(p);

            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
            ctx.fillStyle = p.type === '상차' ? mapColors.nodePickup : mapColors.nodeDropoff;

            if (p.isEvaluating) {
                ctx.fillStyle = mapColors.nodeEvaluating;
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = mapColors.nodeStrokeEvaluating;
            } else {
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = mapColors.nodeStrokeRegular;
            }
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = mapColors.textBody;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((i + 1).toString(), cx, cy + 1);

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
    }, [unifiedRoutePoints, safeRoute, myLocation, theme, mapColors]);

    useEffect(() => {
        drawMap();
    }, [drawMap]);

    // 제스처 핸들러 (드래그 팬 & 줌)
    const handlePointerDown = (e: any) => {
        isDragging.current = true;
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

        lastPos.current = { x: clientX, y: clientY };
        drawMap();
    };

    const handlePointerUp = () => {
        isDragging.current = false;
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
        <div style={{ backgroundColor: mapColors.fill }} className="relative w-full h-64 cursor-grab active:cursor-grabbing overflow-hidden">
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
                    className="w-8 h-8 flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 rounded-md shadow-lg text-slate-100 border border-slate-500 backdrop-blur-sm font-black opacity-80 hover:opacity-100 transition-all"
                >
                    +
                </button>
                <button
                    onClick={() => handleZoomClick(0.8)}
                    className="w-8 h-8 flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 rounded-md shadow-lg text-slate-100 border border-slate-500 backdrop-blur-sm font-black opacity-80 hover:opacity-100 transition-all"
                >
                    -
                </button>
                <button
                    onClick={() => { zoomRef.current = 1; panRef.current = { x: 0, y: 0 }; drawMap(); }}
                    className="w-8 h-8 flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 rounded-md shadow-lg text-slate-100 border border-slate-500 backdrop-blur-sm text-[10px] font-bold opacity-80 hover:opacity-100 transition-all"
                >
                    초기화
                </button>
            </div>
            {children}
        </div>
    );
}
