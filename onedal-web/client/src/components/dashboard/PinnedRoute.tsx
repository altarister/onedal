import type { SecuredOrder } from "@onedal/shared";
import { useState, useEffect, useMemo } from 'react';
import { socket } from '../../lib/socket';
import { logRoadmapEvent } from '../../lib/roadmapLogger';
import PinnedRouteCanvas, { type RoutePoint } from './PinnedRouteCanvas';
import PinnedRouteCard from './PinnedRouteCard';
import { getAddressLabel, getDistanceKm } from '../../lib/routeUtils';

interface Props {
    activeRoute: SecuredOrder[];
    onDecision?: (id: string, action: 'KEEP' | 'CANCEL') => void;
    onRecalculate?: (id: string, priority: string) => void;
}

export default function PinnedRoute({ activeRoute, onDecision, onRecalculate }: Props) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [processingId, setProcessingId] = useState<string | null>(null);

    // 서버 통신 완료 시 (상태가 변하거나 삭제될 때) 로딩 상태 즉각 해제
    useEffect(() => {
        setProcessingId(null);
    }, [activeRoute]);

    // [개발/테스트용 목업 GPS] 
    // 브라우저에서 GPS 락이 늦게 잡히는 문제를 방지하고, 서버로 현위치를 보내 반경 필터를 테스트하기 위한 가짜 현위치입니다.
    // ※ 실제 라이브 배포 전에는 초기값을 null로 돌려주세요.
    const [myLocation, setMyLocation] = useState<{ x: number, y: number } | null>({ x: 127.29441569159479, y: 37.376544054495625 });

    // 내 GPS 위치 추적 (백그라운드 지속 관찰)
    useEffect(() => {
        if (!navigator.geolocation) return;

        // 모바일 웹뷰(WebView) 특성상 최초 GPS 락을 잡는 데 오래 걸릴 수 있으므로 
        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const newLoc = { x: pos.coords.longitude, y: pos.coords.latitude };
                console.log("[GPS] 현위치 갱신됨:", newLoc);
                setMyLocation(newLoc);
            },
            (err) => console.warn("GPS 추적 실패:", err),
            { enableHighAccuracy: false, maximumAge: 10000, timeout: 30000 }
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    // 서버로 현위치 동기화
    useEffect(() => {
        if (myLocation) {
            socket.emit("update-my-location", myLocation);
        }
    }, [myLocation]);

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

    // 서버와 동일한 동선 최적화(TSP Nearest Neighbor) 로직 적용
    const rawPickups = safeRoute.map((r) => ({ type: '상차', name: getAddressLabel(r.pickup), isEvaluating: r.status.includes('evaluating'), x: r.pickupX, y: r.pickupY, routeId: r.id }));
    const rawDropoffs = safeRoute.map((r) => ({ type: '하차', name: getAddressLabel(r.dropoff), isEvaluating: r.status.includes('evaluating'), x: r.dropoffX, y: r.dropoffY, routeId: r.id }));

    const sortedPickups: typeof rawPickups = [];
    let currentLoc = myLocation || (rawPickups[0] ? { x: rawPickups[0].x!, y: rawPickups[0].y! } : { x: 0, y: 0 });

    // 상차지 최적화
    const pPool = [...rawPickups].filter(p => typeof p.x === 'number' && typeof p.y === 'number');
    while (pPool.length > 0) {
        let bestIdx = 0; let minD = Infinity;
        pPool.forEach((p, idx) => {
            const d = getDistanceKm(currentLoc.y, currentLoc.x, p.y!, p.x!);
            if (d < minD) { minD = d; bestIdx = idx; }
        });
        const best = pPool.splice(bestIdx, 1)[0];
        sortedPickups.push(best);
        currentLoc = { x: best.x!, y: best.y! };
    }

    // 하차지 최적화
    const sortedDropoffs: typeof rawDropoffs = [];
    const dPool = [...rawDropoffs].filter(d => typeof d.x === 'number' && typeof d.y === 'number');
    while (dPool.length > 0) {
        let bestIdx = 0; let minD = Infinity;
        dPool.forEach((p, idx) => {
            const d = getDistanceKm(currentLoc.y, currentLoc.x, p.y!, p.x!);
            if (d < minD) { minD = d; bestIdx = idx; }
        });
        const best = dPool.splice(bestIdx, 1)[0];
        sortedDropoffs.push(best);
        currentLoc = { x: best.x!, y: best.y! };
    }

    const unifiedRoutePoints: RoutePoint[] = [...sortedPickups, ...sortedDropoffs];

    // 각 콜별 상하차 예상 시간(ETA) 매핑
    const etaMap = useMemo(() => {
        const result = new Map<string, { pickupEta?: string, dropoffEta?: string }>();
        const routeWithEtas = [...safeRoute].reverse().find(r => r.sectionEtas && r.sectionEtas.length > 0);
        if (!routeWithEtas) return result;

        const etas = routeWithEtas.sectionEtas!;
        const offset = myLocation ? 0 : 1;

        unifiedRoutePoints.forEach((pt, index) => {
            // 카카오 네비가 중복된 거점(예: 파주시 파주시 파주시)을 하나로 병합하여 
            // etas 배열 길이가 예상보다 짧을 경우, 가장 마지막에 도착한 ETA를 복사해서 공유합니다.
            const eta = etas[index + offset] || etas[etas.length - 1] || "?";
            if (!pt.routeId) return;
            const existing = result.get(pt.routeId) || {};
            if (pt.type === '상차') result.set(pt.routeId, { ...existing, pickupEta: eta });
            else result.set(pt.routeId, { ...existing, dropoffEta: eta });
        });
        return result;
    }, [unifiedRoutePoints, safeRoute, myLocation]);

    // 지도 상의 방문 순번(1, 2, 3...)을 콜(주문) ID별 상/하차지로 매핑
    const visitOrderMap = useMemo(() => {
        const result = new Map<string, { pickupIdx: number, dropoffIdx: number }>();
        // unifiedRoutePoints는 [현위치(옵션), P1, P2... D1, D2...]로 구성됨
        unifiedRoutePoints.forEach((pt, idx) => {
            if (!pt.routeId) return;
            const existing = result.get(pt.routeId) || { pickupIdx: 0, dropoffIdx: 0 };
            if (pt.type === '상차') {
                existing.pickupIdx = idx + 1;
            } else {
                existing.dropoffIdx = idx + 1;
            }
            result.set(pt.routeId, existing);
        });
        return result;
    }, [unifiedRoutePoints]);

    const chronologicalIds = useMemo(() => {
        return [...safeRoute]
            .sort((a, b) => {
                const timeA = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
                const timeB = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
                return timeA - timeB;
            })
            .map(r => r.id);
    }, [safeRoute]);

    if (!safeRoute || safeRoute.length === 0) return null;

    return (
        <section id="confirmed-route" className="animate-in slide-in-from-top-4 fade-in duration-500">
            <div className={`absolute -top-3 left-4 ${allEvaluating ? 'bg-amber-500' : 'bg-emerald-500'} text-black text-[10px] font-black px-2 py-0.5 rounded-md shadow-lg transition-colors`}>
                {allEvaluating ? "🟡 최적의 경로를 찾습니다..." : "🟢 사냥 (배차) 확정"}
            </div>

            <div id="routing-timeline">
                {/* 캔버스 미니맵 (분리된 컴포넌트) */}
                <PinnedRouteCanvas
                    unifiedRoutePoints={unifiedRoutePoints}
                    safeRoute={safeRoute}
                    myLocation={myLocation}
                />

                {/* 통합 맵 정보 브리핑 */}
                <div className="flex justify-between items-end mb-4 px-1 mt-1">
                    <a
                        href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(unifiedRoutePoints[0]?.name || '')}&destination=${encodeURIComponent(unifiedRoutePoints[unifiedRoutePoints.length - 1]?.name || '')}&waypoints=${encodeURIComponent(unifiedRoutePoints.slice(1, -1).map(p => p.name).join('|'))}&travelmode=driving`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1"
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="text-xs text-slate-500 text-left">
                                통합 경로 정보
                                {activeRoute.length > 0 && <span className="ml-1 text-slate-400 font-bold">(총 {activeRoute.length}개 콜)</span>}
                            </span>
                            <span className="text-sm text-slate-300 hover:text-blue-400 transition-colors">
                                {(() => {
                                    const lastRoute = [...safeRoute].reverse().find(r => r.totalDistanceKm != null);
                                    if (!lastRoute || lastRoute.totalDistanceKm == null) return `카카오 연산 에러 혹은 대기중...`;
                                    return `총 도로 주행거리 ${(Number(lastRoute.totalDistanceKm) || 0).toFixed(1)}km / 예상 소요 ${lastRoute.totalDurationMin || 0}분`;
                                })()}
                            </span>
                        </div>
                    </a>
                    <div className="flex flex-col items-end gap-0.5">

                        <span className={`text-xl md:text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r ${allEvaluating ? 'from-amber-400 to-yellow-200' : 'from-emerald-400 to-cyan-400'}`}>
                            {(() => {
                                const total = activeRoute.reduce((sum, o) => sum + (o.fare || 0), 0);
                                return total > 0 ? `${total.toLocaleString()} 원` : '미상 (테스트콜)';
                            })()}
                        </span>
                    </div>
                </div>

                {/* 글로벌 상시 경로 재탐색 파이프라인 */}
                {activeRoute.length > 0 && onRecalculate && (() => {
                    const lastExt = activeRoute[activeRoute.length - 1].kakaoTimeExt || '';
                    const isRecommend = lastExt.includes('[추천]');
                    const isTime = lastExt.includes('[최단시간]');
                    const isDistance = lastExt.includes('[최단거리]');
                    return (
                        <div className="mb-4 px-1 flex gap-2 justify-center">
                            <button
                                onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute 하단의 네비게이션 옵션(추천/최단/무료) 버튼 클릭"); setProcessingId(`recalc-global`); onRecalculate(activeRoute[activeRoute.length - 1].id, 'RECOMMEND'); }}
                                disabled={processingId !== null}
                                className={`flex-1 text-[11px] font-bold py-2.5 rounded border transition-all shadow-sm ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'} ${isRecommend ? 'bg-blue-600 text-white border-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-blue-900/40 text-blue-300 border-blue-500/30 hover:bg-blue-800/60 hover:border-blue-400'}`}
                            >
                                {processingId === `recalc-global` && !isRecommend ? '검색중...' : '🌟 추천경로'}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute 하단의 네비게이션 옵션(추천/최단/무료) 버튼 클릭"); setProcessingId(`recalc-global`); onRecalculate(activeRoute[activeRoute.length - 1].id, 'TIME'); }}
                                disabled={processingId !== null}
                                className={`flex-1 text-[11px] font-bold py-2.5 rounded border transition-all shadow-sm ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'} ${isTime ? 'bg-indigo-600 text-white border-indigo-400 shadow-[0_0_10px_rgba(79,70,229,0.5)]' : 'bg-indigo-900/40 text-indigo-300 border-indigo-500/30 hover:bg-indigo-800/60 hover:border-indigo-400'}`}
                            >
                                {processingId === `recalc-global` && !isTime ? '검색중...' : '⏳ 최단시간'}
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "PinnedRoute 하단의 네비게이션 옵션(추천/최단/무료) 버튼 클릭"); setProcessingId(`recalc-global`); onRecalculate(activeRoute[activeRoute.length - 1].id, 'DISTANCE'); }}
                                disabled={processingId !== null}
                                className={`flex-1 text-[11px] font-bold py-2.5 rounded border transition-all shadow-sm ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'} ${isDistance ? 'bg-teal-600 text-white border-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.5)]' : 'bg-teal-900/40 text-teal-300 border-teal-500/30 hover:bg-teal-800/60 hover:border-teal-400'}`}
                            >
                                {processingId === `recalc-global` && !isDistance ? '검색중...' : '📏 최단거리'}
                            </button>
                        </div>
                    );
                })()}
            </div>

            {/* 오더 관리 아코디언 리스트 (가장 처음 잡은 본짐이 맨 아래, 최근에 잡은 합짐이 맨 위로 쌓이도록 역순 정렬) */}
            <div className="space-y-2">
                {[...activeRoute]
                    .sort((a, b) => {
                        const aEvaluating = a.status.includes('evaluating');
                        const bEvaluating = b.status.includes('evaluating');
                        // 평가중인 콜은 항상 맨 위에
                        if (aEvaluating && !bEvaluating) return -1;
                        if (!aEvaluating && bEvaluating) return 1;

                        const timeA = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
                        const timeB = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;

                        // 기본적으로 시간 역순 (나중에 잡은게 위로, 먼저 잡은게 아래로)
                        return timeB - timeA;
                    })
                    .map((route) => {
                        const isEvaluating = route.status.includes('evaluating');
                        const isExpanded = isEvaluating || expandedIds.has(route.id);
                        const indexNum = chronologicalIds.indexOf(route.id) + 1;

                        return (
                            <PinnedRouteCard
                                key={route.id}
                                route={route}
                                isExpanded={isExpanded}
                                onToggle={toggleExpand}
                                onDecision={onDecision}
                                processingId={processingId}
                                setProcessingId={setProcessingId}
                                etaMap={etaMap}
                                visitOrderMap={visitOrderMap}
                                indexNum={indexNum}
                            />
                        );
                    })}
            </div>
        </section>
    );
}
