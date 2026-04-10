import type { SecuredOrder } from "@onedal/shared";

interface Props {
    activeRoute: SecuredOrder[];
    onDecision?: (id: string, action: 'KEEP' | 'CANCEL') => void;
}

import { useState, useEffect, useRef, useCallback } from 'react';
import sidoDataRaw from '../../mapData/sidoData.json';

const sidoData = sidoDataRaw as any; // GeoJSON FeatureCollection

export default function PinnedRoute({ activeRoute, onDecision }: Props) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [myLocation, setMyLocation] = useState<{ x: number, y: number } | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);

    // 초경량 성능을 위한 퓨어 줌/팬 상태 (React State 대신 Ref 사용으로 60fps 보장)
    const zoomRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const lastDist = useRef(0);

    // 내 GPS 위치 추적 (백그라운드 지속 관찰)
    useEffect(() => {
        if (!navigator.geolocation) return;

        // 모바일 웹뷰(WebView) 특성상 최초 GPS 락을 잡는 데 오래 걸릴 수 있으므로 
        // timeout을 30초(30000ms)로 넉넉하게 잡고, getCurrentPosition 대신 watchPosition 사용
        const watchId = navigator.geolocation.watchPosition(
            (pos) => setMyLocation({ x: pos.coords.longitude, y: pos.coords.latitude }),
            (err) => console.warn("GPS 추적 실패:", err),
            { enableHighAccuracy: false, maximumAge: 10000, timeout: 30000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const safeRoute = activeRoute || [];
    const allEvaluating = safeRoute.some(r => r.status === 'evaluating_basic' || r.status === 'evaluating_detailed');

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    // 가상의 통합 노선도(타임라인) 생성: 상차는 순방향, 하차는 역방향(간단한 LIFO 모의)
    const pickups = safeRoute.map((r) => ({ type: '상차', name: r.pickup.split(' ')[1] || r.pickup, isEvaluating: r.status.includes('evaluating'), x: r.pickupX, y: r.pickupY }));
    const dropoffs = [...safeRoute].reverse().map((r) => ({ type: '하차', name: r.dropoff.split(' ')[1] || r.dropoff, isEvaluating: r.status.includes('evaluating'), x: r.dropoffX, y: r.dropoffY }));
    const unifiedRoutePoints = [...pickups, ...dropoffs];




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

        const validPoints = unifiedRoutePoints.filter(p => typeof p.x === 'number' && typeof p.y === 'number') as (typeof unifiedRoutePoints[0] & { x: number, y: number })[];

        // 가장 최신의 상태 중 궤적 정보가 계산 완료된 오더 확보 (배차 직후 연산 중깜빡임으로 인한 직선화 방지)
        const lastValidOrderWithPolyline = [...safeRoute].reverse().find(r => r.routePolyline && r.routePolyline.length > 0);
        const currentPolyline = lastValidOrderWithPolyline?.routePolyline || [];
        const hasPolyline = currentPolyline.length > 0;

        console.log(`[Canvas Map] 노드(상/하차지) 갯수: ${validPoints.length}`);
        validPoints.forEach((vp, idx) => {
            console.log(`   - 노드 ${idx + 1} [${vp.type}] ${vp.name} : X=${vp.x}, Y=${vp.y}`);
        });

        console.log(`[Canvas Map] 적용된 폴리라인(도로궤적) 갯수: ${currentPolyline.length}`);
        if (currentPolyline.length > 0) {
            const firstPt = currentPolyline[0];
            const lastPt = currentPolyline[currentPolyline.length - 1];
            console.log(`   - 폴리라인 출발점: X=${firstPt.x}, Y=${firstPt.y}`);
            console.log(`   - 폴리라인 도착점: X=${lastPt.x}, Y=${lastPt.y}`);
            console.log(`[Canvas Map] 합짐 여부: ${safeRoute.length > 1 ? 'Yes' : 'No'} | 마지막 궤적 오더 ID: ${lastValidOrderWithPolyline?.id?.substring(0, 8)}`);
        }

        // Bounding Box 기준 설정 (노드와 주행 궤적, 내 위치 모두 포함해야 잘림 현상 없음)
        const validPolyline = currentPolyline.filter(p => typeof p.x === 'number' && typeof p.y === 'number' && !isNaN(p.x) && !isNaN(p.y));
        const allCoords = [...validPoints, ...validPolyline];
        if (myLocation) allCoords.push(myLocation);

        if (allCoords.length < 2) {
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = '12px sans-serif';
            ctx.fillText("좌표 데이터가 부족하여 지도를 그릴 수 없습니다.", width / 2, height / 2);
            return;
        }

        const xs = allCoords.map(p => p.x);
        const ys = allCoords.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const paddingX = 40;
        const paddingY = 40;
        const drawWidth = width - paddingX * 2;
        const drawHeight = height - paddingY * 2;

        const rangeX = (maxX - minX) === 0 ? 0.001 : (maxX - minX);
        const rangeY = (maxY - minY) === 0 ? 0.001 : (maxY - minY);

        // 위도(Y, 우리나라 37도 부근)는 경도(X)에 비해 동일 각도당 실제 거리가 약 1.25배 깁니다. 
        // 찌그러짐을 방지하기 위한 비율 보정 및 통합 스케일 계산
        const latScaleCorrection = 1.25;
        const scale = Math.min(drawWidth / rangeX, drawHeight / (rangeY * latScaleCorrection));

        const contentWidth = rangeX * scale;
        const contentHeight = rangeY * latScaleCorrection * scale;

        // 정중앙 배치를 위한 오프셋
        const offsetX = paddingX + (drawWidth - contentWidth) / 2;
        const offsetY = paddingY + (drawHeight - contentHeight) / 2;

        // 카카오 지도(타일) 형식에 맞춰 X는 경도(순방향), Y는 위도(역방향 처리) + 줌/팬 적용
        // 도로 등 모든 스케일 객체는 zoomRef.current를 곱해 크기를 증폭/축소시킵니다.
        const getScreenPt = (p: { x: number, y: number }) => ({
            cx: (offsetX + (p.x - minX) * scale) * zoomRef.current + panRef.current.x,
            cy: (offsetY + (maxY - p.y) * latScaleCorrection * scale) * zoomRef.current + panRef.current.y
        });

        // 0. 시도/배경 그리기 (GeoJSON 연동)
        if (sidoData.features) {
            // 시/도 경계를 먼저 그리고, 시군구 경계를 나중에 그리도록 정렬
            const sortedFeatures = [...sidoData.features].sort((a: any, b: any) => 
                (a.properties?.isGyeonggiSigungu ? 1 : 0) - (b.properties?.isGyeonggiSigungu ? 1 : 0)
            );

            sortedFeatures.forEach((feature: any) => {
                const isGyeonggiSigungu = feature.properties?.isGyeonggiSigungu;
                
                ctx.fillStyle = 'rgba(100, 116, 139, 0.15)'; // 동일한 반투명 배경색
                // 경기도 시/군/구는 테두리를 얇고 조금 더 또렷하게, 시도 경계선은 기존 유지
                ctx.strokeStyle = isGyeonggiSigungu ? 'rgba(100, 116, 139, 0.4)' : 'rgba(100, 116, 139, 0.3)'; 
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

        // 1.5. 기초 연결선 렌더링 (노드들을 잇는 보조 점선 - 폴리라인 유무 무관하게 기반 레이어로 그림)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.4)'; // 매우 연한 회색 점선
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 6]);

        let pathStarted = false;

        // 내 위치가 존재하면 내 위치에서부터 첫 번째 상차지까지 연결
        if (myLocation) {
            const { cx, cy } = getScreenPt(myLocation);
            ctx.moveTo(cx, cy);
            pathStarted = true;
        }

        validPoints.forEach((p, _i) => {
            const { cx, cy } = getScreenPt(p);
            if (!pathStarted) {
                ctx.moveTo(cx, cy);
                pathStarted = true;
            } else {
                ctx.lineTo(cx, cy);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]); // 원래대로 점선 해제

        // 1. 카카오 실제 도로 궤적(폴리라인) 렌더링
        if (hasPolyline && validPolyline.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 3 * zoomRef.current; // 선 두께 스케일 반영
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            validPolyline.forEach((p, _i) => {
                const { cx, cy } = getScreenPt(p);
                // 카카오 노드들의 미세 오차로 인한 끊김 방지
                if (_i === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            });
            ctx.stroke();
        }

        // 2. 노드 렌더링
        validPoints.forEach((p, i) => {
            const { cx, cy } = getScreenPt(p);

            ctx.beginPath();
            ctx.arc(cx, cy, 10, 0, 2 * Math.PI); // 반경 7 -> 10으로 업그레이드
            ctx.fillStyle = p.type === '상차' ? '#10b981' : '#f43f5e';

            if (p.isEvaluating) {
                ctx.fillStyle = '#f59e0b'; // amber
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#fde68a';
            } else {
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#0f1423';
            }
            ctx.fill();
            ctx.stroke();

            // 순번 (동그라미 안)
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText((i + 1).toString(), cx, cy + 1); // 세로정렬 미세조정

            // 라벨 텍스트 배경
            // 텍스트 길이 측정 후 반투명 배경 상자 렌더링 (지도 가림 방지)
            const textWidth = ctx.measureText(p.name).width;
            ctx.fillStyle = 'rgba(15, 20, 35, 0.45)';
            ctx.fillRect(cx - (textWidth / 2) - 6, cy + 14, textWidth + 12, 18);

            // 라벨 텍스트
            ctx.fillStyle = p.isEvaluating ? '#fde68a' : '#ffffff';
            ctx.textBaseline = 'top';
            ctx.fillText(p.name, cx, cy + 16);
        });

        // 3. 내 위치(GPS) 렌더링 (그라데이션 및 펄스 효과)
        if (myLocation) {
            const { cx, cy } = getScreenPt(myLocation);

            // 레이더 펄스(외곽 반투명 원)
            const time = Date.now() / 1000;
            const pulseRadius = 15 + Math.sin(time * 3) * 5;

            ctx.beginPath();
            ctx.arc(cx, cy, pulseRadius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.2)'; // sky-400 반투명
            ctx.fill();

            // 중심 내 위치 원
            ctx.beginPath();
            ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#38bdf8'; // sky-400
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();

            // 내 위치 라벨 반투명 배경 상자
            ctx.fillStyle = 'rgba(15, 20, 35, 0.45)';
            ctx.fillRect(cx - 20, cy + 10, 40, 16);

            ctx.fillStyle = '#e0f2fe';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("현위치", cx, cy + 22);
        }
    }, [unifiedRoutePoints, safeRoute, myLocation]);

    // 데이터가 바뀔 때마다 다시 그리기
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
            // 두 손가락 핀치 줌 초기화
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
                // 핀치 줌 로직
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
        drawMap(); // GPU 가속 없는 직접 Redraw 이지만 3000개 정도는 60fps 통과
    };

    const handlePointerUp = () => {
        isDragging.current = false;
    };

    const handleWheel = (e: any) => {
        // 기존 pan + 확대 비율에 따른 포인터 위치 가중치 계산 (마우스 포인트 중심 줌 기능)
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1; // 10% 줌인/아웃
        const newZoom = Math.max(0.5, Math.min(10, zoomRef.current * zoomDelta));

        // 마우스 커서 위치를 중심으로 확대/축소되도록 Pan Offset 보정 로직
        panRef.current.x = x - (x - panRef.current.x) * (newZoom / zoomRef.current);
        panRef.current.y = y - (y - panRef.current.y) * (newZoom / zoomRef.current);

        zoomRef.current = newZoom;
        drawMap();
    };

    if (!safeRoute || safeRoute.length === 0) return null;

    return (
        <section id="confirmed-route" className="animate-in slide-in-from-top-4 fade-in duration-500">

            <div className={`absolute -top-3 left-4 ${allEvaluating ? 'bg-amber-500' : 'bg-emerald-500'} text-black text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg transition-colors`}>
                {allEvaluating ? "🟡 최적의 경로를 찾습니다..." : "🟢 사냥 (배차) 확정"}
            </div>

            {/* 통합 라우팅 타임라인 (상단) */}
            <div id="routing-timeline">
                {/* 데스크탑에서 다중 경유지가 완벽하게 지원되는 구글맵 링크 */}

                {/* 캔버스 미니맵 영역 - 직접 제스처 핸들러 연결 */}
                <div className="relative w-full h-64 bg-slate-100/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700/50 cursor-grab active:cursor-grabbing overflow-hidden">
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

                    {/* 줌인/줌아웃 컨트롤 버튼셋 */}
                    <div className="absolute top-3 right-3 flex flex-col space-y-2 z-10">
                        <button
                            onClick={() => { zoomRef.current *= 1.2; drawMap(); }}
                            className="w-8 h-8 flex items-center justify-center bg-slate-700/80 hover:bg-slate-600 rounded-md shadow-lg text-slate-100 border border-slate-500 backdrop-blur-sm font-black opacity-80 hover:opacity-100 transition-all"
                        >
                            +
                        </button>
                        <button
                            onClick={() => { zoomRef.current *= 0.8; drawMap(); }}
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
                </div>



                {/* 통합 맵 정보 브리핑 (하단에서 맵 바로 아래로 이동됨) */}
                <div className="flex justify-between items-end mb-4 px-1 pb-4 border-b border-slate-700/50">
                    <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(unifiedRoutePoints[0]?.name || '')}&destination=${encodeURIComponent(unifiedRoutePoints[unifiedRoutePoints.length - 1]?.name || '')}&waypoints=${encodeURIComponent(unifiedRoutePoints.slice(1, -1).map(p => p.name).join('|'))}&travelmode=driving`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >

                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-bold text-slate-500 text-left">통합 경로 정보</span>
                            <span className="text-[13px] font-black text-slate-300">
                                {(() => {
                                    const lastRoute = [...safeRoute].reverse().find(r => r.totalDistanceKm !== undefined);
                                    if (!lastRoute) return "카카오 연산 대기중...";
                                    return `총 도로 주행거리 ${(lastRoute.totalDistanceKm!).toFixed(1)}km / 예상 소요 ${lastRoute.totalDurationMin}분`;
                                })()}
                            </span>
                        </div>
                    </a>
                    <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs font-bold text-slate-500">총 합계 운임</span>
                        <span className={`text-xl md:text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r ${allEvaluating ? 'from-amber-400 to-yellow-200' : 'from-emerald-400 to-cyan-400'}`}>
                            {(() => {
                                const total = activeRoute.reduce((sum, o) => sum + (o.fare || 0), 0);
                                return total > 0 ? `${total.toLocaleString()} 원` : '미상 (테스트콜)';
                            })()}
                        </span>
                    </div>
                </div>
                {/* <div className="flex items-start min-w-max">
                    {unifiedRoutePoints.map((point, idx) => (
                        <React.Fragment key={idx}>
                            <div className="flex flex-col items-center flex-shrink-0 w-16">
                                <div className={`w-8 h-8 flex items-center justify-center rounded-full shadow-lg border-2 z-10 transition-colors
                                            ${point.type === '상차'
                                        ? (point.isEvaluating ? 'bg-amber-500 border-amber-300 animate-pulse' : 'bg-emerald-600 border-emerald-400')
                                        : (point.isEvaluating ? 'bg-rose-500 border-rose-300 animate-pulse' : 'bg-rose-700 border-rose-400')}`}
                                >
                                    <span className="text-white text-xs font-black">{idx + 1}</span>
                                </div>
                                <div className="flex flex-col items-center mt-2 text-center">
                                    <span className="text-[10px] text-slate-400 font-bold leading-tight">{point.type}</span>
                                    <span className={`text-sm font-black mt-0.5 leading-tight ${point.isEvaluating ? 'text-amber-200' : 'text-slate-100'}`}>
                                        {point.name}
                                    </span>
                                </div>
                            </div>

                            
                            {idx < unifiedRoutePoints.length - 1 && (
                                <div className="flex-1 w-12 h-[2px] bg-slate-700 mt-4 mx-1 relative overflow-hidden flex-shrink-0">
                                    {point.isEvaluating && <div className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-transparent via-amber-500/80 to-transparent animate-[shimmer_1s_infinite]" />}
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div> */}

                {/* 🌟 다중 경유지 포함 웹 지도 링크 버튼 🌟 */}
                {/* <div className="">

                    <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(unifiedRoutePoints[0]?.name || '')}&destination=${encodeURIComponent(unifiedRoutePoints[unifiedRoutePoints.length - 1]?.name || '')}&waypoints=${encodeURIComponent(unifiedRoutePoints.slice(1, -1).map(p => p.name).join('|'))}&travelmode=driving`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors active:scale-95 border border-slate-600"
                    >
                        <span>🗺️</span> 브라우저 통합 경로표 보기 (다중 경유지 테스트용)
                    </a>
                </div> */}
            </div>

            {/* 오더 관리 아코디언 리스트 (하단: 최신순 정렬 - 스크롤 방지용) */}
            <div className="space-y-2">
                {[...activeRoute].reverse().map((route, reversedIdx) => {
                    const originalIdx = activeRoute.length - 1 - reversedIdx;
                    const isEvaluating = route.status.includes('evaluating');
                    const isExpanded = isEvaluating || expandedIds.has(route.id);

                    return (
                        <div key={route.id} className={`flex flex-col bg-[#111522] rounded-xl border border-slate-700/60 relative overflow-hidden transition-all duration-300 shadow-md ${isEvaluating ? 'ring-1 ring-amber-500/50' : 'hover:border-slate-500/50'}`}>
                            {route.status === 'evaluating_detailed' && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-500/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] pointer-events-none" />
                            )}

                            {/* 1. 카드 헤더 구역 (최대한 얇고 타이트하게 하나의 Flex Row로 통합) */}
                            <div
                                onClick={() => !isEvaluating && toggleExpand(route.id)}
                                className={`p-2.5 flex justify-between items-center w-full text-sm font-bold tracking-tight ${!isEvaluating && 'cursor-pointer group hover:bg-white/5'}`}
                            >
                                <div className="flex items-center gap-1.5 truncate text-slate-300 flex-1">
                                    <span className={`${isEvaluating ? 'text-amber-400' : 'text-emerald-400'} flex-shrink-0`}>
                                        {originalIdx + 1}. {route.pickup.split(' ')[1] || route.pickup}
                                    </span>
                                    <span className="text-slate-600 flex-shrink-0">-</span>
                                    <span className={`${isEvaluating ? 'text-amber-400' : 'text-rose-400'} flex-shrink-0`}>
                                        {activeRoute.length + (activeRoute.length - 1 - originalIdx) + 1}. {route.dropoff.split(' ')[1] || route.dropoff}
                                    </span>
                                    <span className="ml-3 text-slate-400 font-medium text-[11px] truncate mt-0.5 flex items-center gap-1.5 flex-[2]">
                                        <span>{route.fare > 0 ? `금액 ${(route.fare / 10000).toFixed(1)}만` : '금액미상'}</span>
                                        <span className="text-slate-600">,</span>
                                        <span>{route.status.includes('evaluating') ? '계산중' : route.distanceKm ? `${route.distanceKm}Km` : '거리미상'}</span>
                                        <span className="text-slate-600">,</span>
                                        <span>{route.vehicleType || '차량미상'}</span>
                                        <span className="text-slate-600">,</span>
                                        <span>[{route.companyName?.split('-')[0] || '퀵사무실'}]</span>
                                    </span>
                                </div>

                                {isEvaluating && (
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-sm animate-pulse flex-shrink-0 ml-2 ${route.status === 'evaluating_basic' ? 'bg-rose-950 text-rose-400' : 'bg-amber-950 text-amber-400'}`}>평가중</span>
                                )}
                                {!isEvaluating && route.type === 'MANUAL' && (
                                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-sm bg-blue-900 border border-blue-500/30 text-blue-200 flex-shrink-0 ml-2 shadow-[0_0_10px_rgba(59,130,246,0.2)]">수동 배차</span>
                                )}
                            </div>

                            {/* 2. 카드 콘텐츠 (아코디언 펼침 시에만 노출 / 평가중일 땐 강제 노출) */}
                            {isExpanded && (
                                <div id="" className="px-4 pb-4 pt-1 text-sm border-t border-slate-700/50 bg-[#111522] mt-1">
                                    {/* 상세 데이터 영역 */}
                                    <div className="flex flex-col text-slate-400 text-[13px] leading-tight bg-black/20 p-4 rounded-lg border border-white/5 font-medium tracking-tight">
                                        {(() => {
                                            const quickName = route.companyName || '-';
                                            const phoneMatch = quickName.match(/\d{2,3}-\d{3,4}-\d{4}/);
                                            const quickPhone = phoneMatch ? phoneMatch[0] : '-';
                                            const quickClean = quickName.replace(phoneMatch ? phoneMatch[0] : '', '').trim() || '-';

                                            const pDetail = route.pickupDetails?.[0];
                                            const pPhone = pDetail?.phone1 || pDetail?.phone2 || '-';
                                            const pAddr = pDetail?.addressDetail || route.pickup;

                                            const dDetail = route.dropoffDetails?.[0];
                                            const dPhone = dDetail?.phone1 || dDetail?.phone2 || '-';
                                            const dAddr = dDetail?.addressDetail || route.dropoff;

                                            return (
                                                <>
                                                    <div className="mb-2">
                                                        <div>퀵사무실 : {quickPhone}</div>
                                                        <div className="ml-[76px]">{quickClean}</div>
                                                    </div>
                                                    {/* <div className="mb-2">
                                                        <div>의뢰지 : {pPhone}</div>
                                                        <div className="ml-[63px]">{pAddr}</div>
                                                    </div> */}
                                                    <div className="mb-2">
                                                        <div>상차지 : {pPhone}</div>
                                                        <div className="ml-[63px]">{pAddr}</div>
                                                    </div>
                                                    <div className="mb-3">
                                                        <div>하차지 : {dPhone}</div>
                                                        <div className="ml-[63px]">{dAddr}</div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <span className="flex-shrink-0">적요 / 물품 :</span>
                                                        <span className="text-slate-300 font-bold">{route.itemDescription || "상세 정보 없음"}</span>
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                    {/* 2차 상세 수신 시뮬레이션 결과 표기 (데스밸리 카카오결과) */}
                                    {route.kakaoTimeExt && (
                                        <div className="mt-3 text-[11px] font-bold text-amber-200 bg-amber-950/40 px-3 py-1.5 rounded flex items-center justify-between border border-amber-500/20">
                                            <span>카카오 분석 결과</span>
                                            <span>
                                                {route.kakaoTimeExt.replace(/['꿀똥콜🚙💩🍯]/g, "").trim()}
                                                {route.kakaoTimeExt.includes("'꿀'") ? " (꿀)" : route.kakaoTimeExt.includes("'똥'") ? " (패널티 주의)" : " (양호)"}
                                            </span>
                                        </div>
                                    )}



                                    {/* 평가 상태(데스밸리) 액션 버튼 */}
                                    {route.status === 'confirmed' && onDecision && (
                                        <div className="mt-4 flex gap-3">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'CANCEL'); }}
                                                className="w-full bg-rose-950/40 text-rose-400 text-sm font-bold py-4 rounded-lg border border-rose-500/20 hover:bg-rose-900/60 transition-all shadow-sm active:scale-[0.98]"
                                            >
                                                🚨 확정 배차 취소 (해당 오더 방출)
                                            </button>
                                        </div>
                                    )}

                                    {route.type !== 'MANUAL' && route.status === 'evaluating_basic' && onDecision && (
                                        <div className="mt-4 flex flex-col gap-2">
                                            <div className="text-xs text-amber-300/70 text-center animate-pulse font-medium">
                                                ⏳ 앱폰이 상세 정보를 긁고 있습니다... 잠시 기다려주세요
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'CANCEL'); }} className="flex-1 bg-slate-800 text-rose-400 text-sm font-bold py-3.5 rounded-lg border border-rose-500/20 hover:bg-rose-950 transition-all shadow-sm active:scale-95">
                                                    즉시 포기
                                                </button>
                                                <button disabled className="flex-1 bg-slate-800 text-slate-500 text-sm font-bold py-3.5 rounded-lg border border-slate-700 cursor-not-allowed">
                                                    상세 대기중...
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {route.type !== 'MANUAL' && route.status === 'evaluating_detailed' && onDecision && (
                                        <div className="mt-4 flex gap-3">
                                            <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'CANCEL'); }} className="flex-1 bg-[#2a131b] text-rose-400 text-sm font-bold py-4 rounded-lg border border-rose-500/30 hover:bg-[#3d1a25] transition-all shadow-sm active:scale-95">
                                                방출
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); onDecision(route.id, 'KEEP'); }} className="flex-[2] bg-emerald-500 text-emerald-950 text-base font-black py-4 rounded-lg shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-400 hover:scale-[1.02] active:scale-95 transition-all">
                                                유지 확정
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* 하단 통합 정보 바는 상단(맵 아래)으로 이동되었습니다. */}

        </section>
    );
}
