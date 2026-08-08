import { isEvaluating, isTerminal } from "@onedal/shared";
import type { SecuredOrder } from "@onedal/shared";
import { useState, useEffect, useMemo } from 'react';
// removed socket
import { logRoadmapEvent } from '../../lib/roadmapLogger';
import PinnedRouteCanvas, { type RoutePoint } from './PinnedRouteCanvas';
import PinnedRouteCard from './PinnedRouteCard';
import { getAddressLabel } from '../../lib/routeUtils';
import { optimizeRouteOrder, buildEtaMap, buildVisitOrderMap } from '../../lib/routeOptimizer';
import { useFilterConfig } from '../../hooks/useFilterConfig';
import { useMasterGps } from '../../hooks/useMasterGps';

interface Props {
    activeRoute: SecuredOrder[];
    isTestMode: boolean;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'ORDER_CANCELED' | 'ORDER_RELEASED' | 'ORDER_FORCE_CANCELED') => void;
    onRecalculate?: (id: string, priority: string) => void;
    viewFilter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'ALL';
    setViewFilter: (filter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'ALL') => void;
}

export default function PinnedRoute({ activeRoute, isTestMode, onDecision, onRecalculate, viewFilter, setViewFilter }: Props) {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [processingId, setProcessingId] = useState<string | null>(null);
    const { filter } = useFilterConfig();
    // 서버 통신 완료 시 (상태가 변하거나 삭제될 때) 로딩 상태 즉각 해제
    useEffect(() => {
        setProcessingId(null);
    }, [activeRoute]);

    // 지도 렌더링용: 완료된 콜 제외한 현재 진행 중인 오더만 추출
    const liveRoute = useMemo(() => (activeRoute || []).filter(r => !isTerminal(r.status)), [activeRoute]);

    // 현재 활성 폴리라인 (진행 중인 오더에서만 추출, 완료된 stale 궤적 무시)
    const activePolyline = useMemo(() => {
        if (liveRoute.length === 0) return null;
        for (let i = liveRoute.length - 1; i >= 0; i--) {
            const r = liveRoute[i];
            if (r && r.routePolyline && r.routePolyline.length > 0) {
                return r.routePolyline;
            }
        }
        return null;
    }, [liveRoute]);

    const isDriving = filter?.dispatchPhase === 'DELIVERING';

    // 📡 마스터 GPS 엔진 연결 (Real / Mock 자동 스위칭)
    const { currentGps } = useMasterGps(isTestMode, isDriving, activePolyline || null);

    // 하위 지도 캔버스에 렌더링하기 위한 로컬 상태 (초기 위치는 테스트용 판교 근처)
    const [myLocation, setMyLocation] = useState<{ x: number, y: number } | null>({ x: 127.29441569159479, y: 37.376544054495625 });

    useEffect(() => {
        if (currentGps) {
            setMyLocation({ x: currentGps.lng, y: currentGps.lat });
        }
    }, [currentGps]);

    const safeRoute = activeRoute || [];
    const allEvaluating = safeRoute.some(r => isEvaluating(r.status));

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    // 서버와 동일한 동선 최적화(TSP Nearest Neighbor) 로직 적용 — 완료된 콜은 지도 핀에서 제외
    const rawPickups = liveRoute.map((r) => ({ type: '상차', name: getAddressLabel(r.pickup), isEvaluating: isEvaluating(r.status), x: r.pickupX, y: r.pickupY, routeId: r.id }));
    const rawDropoffs = liveRoute.map((r) => ({ type: '하차', name: getAddressLabel(r.dropoff), isEvaluating: isEvaluating(r.status), x: r.dropoffX, y: r.dropoffY, routeId: r.id }));

    const unifiedRoutePoints: RoutePoint[] = optimizeRouteOrder(rawPickups, rawDropoffs, myLocation);

    // 각 콜별 상하차 예상 시간(ETA) 매핑
    const etaMap = useMemo(() => {
        const routeWithEtas = [...safeRoute].reverse().find(r => r.sectionEtas && r.sectionEtas.length > 0);
        if (!routeWithEtas) return new Map<string, { pickupEta?: string; dropoffEta?: string }>();
        return buildEtaMap(unifiedRoutePoints, routeWithEtas.sectionEtas!, !!myLocation);
    }, [unifiedRoutePoints, safeRoute, myLocation]);

    // 지도 상의 방문 순번(1, 2, 3...)을 콜(주문) ID별 상/하차지로 매핑
    const visitOrderMap = useMemo(() => buildVisitOrderMap(unifiedRoutePoints), [unifiedRoutePoints]);

    const chronologicalIds = useMemo(() => {
        return [...safeRoute]
            .sort((a, b) => {
                const timeA = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
                const timeB = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
                return timeA - timeB;
            })
            .map(r => r.id);
    }, [safeRoute]);

    // if (!safeRoute || safeRoute.length === 0) return null; // 삭제됨: 라우트가 없어도 맵은 항상 표시

    return (
        <section id="confirmed-route" className="flex flex-col">
            {safeRoute.length > 0 && (
                <div className="flex justify-between items-center px-4 py-2 border-b border-border-card">
                    <h2 className="text-[13px] font-bold text-text-primary flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${allEvaluating ? 'bg-warning animate-pulse' : 'bg-success'}`} />
                        {allEvaluating ? "최적 경로 탐색 중" : "진행 중인 경로"}
                    </h2>
                    <span className="text-[11px] font-bold text-text-muted">
                        {activeRoute[0]?.vehicleType || '1t'} 트럭 • 적재 {liveRoute.length}건
                    </span>
                </div>
            )}

            <div id="routing-timeline" className="border-b border-border-card">
                {/* 캔버스 미니맵 (분리된 컴포넌트) */}
                <PinnedRouteCanvas
                    unifiedRoutePoints={unifiedRoutePoints}
                    safeRoute={safeRoute}
                    myLocation={myLocation}
                >
                    {/* 좌측 상단 글로벌 상시 경로 재탐색 파이프라인 (맵 캔버스 내재화 플로팅 컨트롤) */}
                    {activeRoute.length > 0 && onRecalculate && (() => {
                        const lastExt = activeRoute[activeRoute.length - 1].kakaoTimeExt || '';
                        const isTime = lastExt.includes('[최단시간]');
                        const isDistance = lastExt.includes('[최단거리]');
                        const isRecommend = !isTime && !isDistance; // 기본값은 항상 '추천' 상태 점등

                        return (
                            <div className="absolute top-3 left-3 flex flex-col space-y-2 z-10 w-8">
                                <button
                                    onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "맵뷰 버튼(추천) 좌상단 클릭"); setProcessingId(`recalc-global`); onRecalculate(activeRoute[activeRoute.length - 1].id, 'RECOMMEND'); }}
                                    disabled={processingId !== null}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md shadow-lg text-[10px] font-bold backdrop-blur-sm transition-all focus:outline-none ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'opacity-80 hover:opacity-100 active:scale-95'} ${isRecommend ? 'bg-info/90 text-white border border-info' : 'bg-surface-alt/80 hover:bg-surface-hover text-text-primary border border-border'}`}
                                >
                                    추천
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "맵뷰 버튼(최단시간) 좌상단 클릭"); setProcessingId(`recalc-global`); onRecalculate(activeRoute[activeRoute.length - 1].id, 'TIME'); }}
                                    disabled={processingId !== null}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md shadow-lg text-[10px] font-bold backdrop-blur-sm transition-all focus:outline-none ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'opacity-80 hover:opacity-100 active:scale-95'} ${isTime ? 'bg-accent/90 text-white border border-accent' : 'bg-surface-alt/80 hover:bg-surface-hover text-text-primary border border-border'}`}
                                >
                                    시간
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "맵뷰 버튼(최단거리) 좌상단 클릭"); setProcessingId(`recalc-global`); onRecalculate(activeRoute[activeRoute.length - 1].id, 'DISTANCE'); }}
                                    disabled={processingId !== null}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md shadow-lg text-[10px] font-bold backdrop-blur-sm transition-all focus:outline-none ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'opacity-80 hover:opacity-100 active:scale-95'} ${isDistance ? 'bg-success/90 text-white border border-success' : 'bg-surface-alt/80 hover:bg-surface-hover text-text-primary border border-border'}`}
                                >
                                    거리
                                </button>
                            </div>
                        );
                    })()}
                </PinnedRouteCanvas>

                {safeRoute.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 border-b border-border-card">
                        <a
                            href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(unifiedRoutePoints[0]?.name || '')}&destination=${encodeURIComponent(unifiedRoutePoints[unifiedRoutePoints.length - 1]?.name || '')}&waypoints=${encodeURIComponent(unifiedRoutePoints.slice(1, -1).map(p => p.name).join('|'))}&travelmode=driving`}
                            target="_blank"
                            rel="noopener noreferrer"
                            // 진행 중 경로가 없으면 origin/destination이 비어 깨진 구글맵 링크가 되므로 클릭을 막는다
                            className={`flex-1 ${unifiedRoutePoints.length === 0 ? 'pointer-events-none' : ''}`}
                        >
                            <div className="flex flex-col">
                                <span className="text-xs text-text-muted">
                                    {activeRoute.length > 0 && (
                                        <span className="text-text-muted font-bold">
                                            총 {activeRoute.length}개 경로 정보
                                            {/* 종료된 건에는 완료뿐 아니라 취소·방출도 포함되므로 "완료"라 쓰면 부정확하다 */}
                                            {liveRoute.length < activeRoute.length ? ` (${activeRoute.length - liveRoute.length}건 종료)` : ''}
                                        </span>
                                    )}
                                </span>
                                <span className="text-sm text-text-primary hover:text-info transition-colors">
                                    {(() => {
                                        const lastRoute = [...liveRoute].reverse().find(r => r.totalDistanceKm != null);
                                        if (lastRoute?.totalDistanceKm != null) {
                                            return `주행거리 ${(Number(lastRoute.totalDistanceKm) || 0).toFixed(1)}km / 예상 ${lastRoute.totalDurationMin || 0}분`;
                                        }
                                        // 아래 세 가지는 완전히 다른 상황인데 예전에는 모두
                                        // "카카오 연산 에러 혹은 대기중..." 하나로 표시되어
                                        // 정상 상태(진행 중 0건)를 에러로 오인하게 만들었다.
                                        if (liveRoute.length === 0) return `진행 중인 경로 없음 · 새 콜 대기 중`;
                                        const hasFailure = liveRoute.some(r =>
                                            r.kakaoTimeExt?.includes('실패') || r.kakaoTimeExt?.includes('에러')
                                        );
                                        if (hasFailure) return `카카오 경로 연산 실패`;
                                        return `카카오 경로 연산 중...`;
                                    })()}
                                </span>
                            </div>
                        </a>
                        <span className="text-xl font-black text-info tracking-tight">
                            {(() => {
                                const total = activeRoute.reduce((sum, o) => sum + (o.fare || 0), 0);
                                return `${total.toLocaleString()}`;
                            })()}
                            <span className="text-xs font-bold text-text-muted ml-0.5">원</span>
                        </span>
                    </div>
                )}
            </div>

            {/* 뷰 필터 탭 (진행 중 / 완료됨 / 취소됨) */}
            {safeRoute.length > 0 && (
                <div className="flex border-b border-border-card">
                    <button
                        onClick={() => setViewFilter('ACTIVE')}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'ACTIVE' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        진행 중 ({liveRoute.length})
                    </button>
                    <button
                        onClick={() => setViewFilter('COMPLETED')}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'COMPLETED' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        완료됨 ({safeRoute.filter(r => r.status === 'ORDER_COMPLETED').length})
                    </button>
                    <button
                        onClick={() => setViewFilter('CANCELED')}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'CANCELED' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        취소/방출 ({safeRoute.filter(r => r.status === 'ORDER_RELEASED' || r.status === 'ORDER_CANCELED' || r.status === 'ORDER_FORCE_CANCELED').length})
                    </button>
                    <button
                        onClick={() => setViewFilter('ALL')}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'ALL' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        전체 ({safeRoute.length})
                    </button>
                </div>
            )}

            {/* 오더 관리 아코디언 리스트 */}
            {safeRoute.length > 0 && (
                <div className="flex flex-col">
                    {[...activeRoute]
                        .filter(route => {
                            if (viewFilter === 'ACTIVE') {
                                return !isTerminal(route.status);
                            }
                            if (viewFilter === 'COMPLETED') {
                                return route.status === 'ORDER_COMPLETED';
                            }
                            if (viewFilter === 'CANCELED') {
                                return route.status === 'ORDER_RELEASED' || route.status === 'ORDER_CANCELED' || route.status === 'ORDER_FORCE_CANCELED';
                            }
                            return true; // ALL
                        })
                        .sort((a, b) => {
                            const aEval = isEvaluating(a.status);
                            const bEval = isEvaluating(b.status);
                            // 평가중인 콜은 항상 맨 위에
                            if (aEval && !bEval) return -1;
                            if (!aEval && bEval) return 1;

                            const timeA = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
                            const timeB = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;

                            // 기본적으로 시간 역순 (나중에 잡은게 위로, 먼저 잡은게 아래로)
                            return timeB - timeA;
                        })
                        .map((route) => {
                            const routeEval = isEvaluating(route.status);
                            const isExpanded = routeEval || expandedIds.has(route.id);
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
            )}
        </section>
    );
}
