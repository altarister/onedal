import { isEvaluating, isTerminal } from "@onedal/shared";
import type { SecuredOrder } from "@onedal/shared";
import { useState, useEffect, useMemo, useRef } from 'react';
// removed socket
import { logRoadmapEvent } from '../../lib/roadmapLogger';
import PinnedRouteCanvas, { type RoutePoint } from './PinnedRouteCanvas';
import PinnedRouteCard from './PinnedRouteCard';
import CallDeck from './CallDeck';
import DepartureCountdown from './DepartureCountdown';
import { useCallProgress, EMPTY_RECORDS } from '../../hooks/useCallProgress';
import { deckOrder } from '../../lib/deckFocus';
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
    // [2026-08-12] 콜별 기록을 **여기서 한 번에** 받는다.
    // 카드가 각자 불러오면 화면 밖 카드의 진행 상황을 알 수 없어
    // 덱 위에 요약 줄을 띄울 수가 없었다 (기사님 지적).
    const callRecords = useCallProgress(activeRoute.map(o => o.id));
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    /** 콜을 다루기 시작하면 탭 바를 화면 맨 위로 끌어올린다 */
    const tabBarRef = useRef<HTMLDivElement>(null);
    const scrollToCalls = () => tabBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    /**
     * ⚠️ TEMP(gps-fallback) — GPS 가 살아나면 `null` 로 되돌린다
     *
     * 브라우저 GPS 가 안 잡혀 현위치를 모르면 지도도 TSP 순서도 기준점이 없다.
     * 그래서 **서버와 같은 대체 출발지**를 쓴다 (`server/src/services/fallbackOrigin.ts`).
     *   경기 광주시 초월읍 경충대로1127번길 15
     *   → 127.2944428, 37.3766872 (기사님이 구글 지도로 확인, 2026-08-12)
     *
     * 서버는 주소를 지오코딩해서 쓰고 여기는 그 결과를 상수로 둔다 —
     * 관제웹에서 카카오 키를 노출할 수 없기 때문이다. **두 값은 같은 지점이어야 한다.**
     * GPS 가 들어오면 아래 useEffect 가 곧바로 덮어쓴다.
     */
    const [myLocation, setMyLocation] = useState<{ x: number, y: number } | null>(
        { x: 127.2944428, y: 37.3766872 }
    );

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
        return buildEtaMap(unifiedRoutePoints, routeWithEtas.sectionEtas!);
    }, [unifiedRoutePoints, safeRoute]);

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
                    liveRoute={liveRoute}
                    myLocation={myLocation}
                >
                    {/* 좌측 상단 글로벌 상시 경로 재탐색 파이프라인 (맵 캔버스 내재화 플로팅 컨트롤) */}
                    {liveRoute.length > 0 && onRecalculate && (() => {
                        // [재탐색 ①] 대상은 반드시 "종료되지 않은 마지막 콜"이어야 한다.
                        // activeRoute 에는 '취소/방출' 탭 표시용으로 종료된 콜이 포함되어 있어,
                        // 마지막 원소가 취소된 콜이면 취소한 콜의 경로를 재탐색하게 된다.
                        // (카카오 API 비용만 쓰고 화면은 그대로. 버튼 하이라이트도 옛 결과 기준이 됨)
                        const recalcTarget = liveRoute[liveRoute.length - 1];
                        const lastExt = recalcTarget.kakaoTimeExt || '';
                        const isTime = lastExt.includes('[최단시간]');
                        const isDistance = lastExt.includes('[최단거리]');
                        const isRecommend = !isTime && !isDistance; // 기본값은 항상 '추천' 상태 점등

                        return (
                            <div className="absolute top-3 left-3 flex flex-col space-y-2 z-10 w-8">
                                <button
                                    onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "맵뷰 버튼(추천) 좌상단 클릭"); setProcessingId(`recalc-global`); onRecalculate(recalcTarget.id, 'RECOMMEND'); }}
                                    disabled={processingId !== null}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md shadow-lg text-[10px] font-bold backdrop-blur-sm transition-all focus:outline-none ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'opacity-80 hover:opacity-100 active:scale-95'} ${isRecommend ? 'bg-info/90 text-white border border-info' : 'bg-surface-alt/80 hover:bg-surface-hover text-text-primary border border-border'}`}
                                >
                                    추천
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "맵뷰 버튼(최단시간) 좌상단 클릭"); setProcessingId(`recalc-global`); onRecalculate(recalcTarget.id, 'TIME'); }}
                                    disabled={processingId !== null}
                                    className={`w-8 h-8 flex items-center justify-center rounded-md shadow-lg text-[10px] font-bold backdrop-blur-sm transition-all focus:outline-none ${processingId !== null ? 'opacity-50 cursor-not-allowed' : 'opacity-80 hover:opacity-100 active:scale-95'} ${isTime ? 'bg-accent/90 text-white border border-accent' : 'bg-surface-alt/80 hover:bg-surface-hover text-text-primary border border-border'}`}
                                >
                                    시간
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", "맵뷰 버튼(최단거리) 좌상단 클릭"); setProcessingId(`recalc-global`); onRecalculate(recalcTarget.id, 'DISTANCE'); }}
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
                                            {/* 앞자리는 "지금 실려 있는 짐"이어야 한다.
                                                예전에는 `총 7개 경로 정보 (5건 종료)`처럼 종료 건까지 합한 수가
                                                먼저 보여서, 실제로는 2건만 수행 중인데 7건짜리 운행으로 읽혔다. */}
                                            진행 중 {liveRoute.length}건
                                            {/* 종료된 건에는 완료뿐 아니라 취소·방출도 포함되므로 "완료"라 쓰면 부정확하다 */}
                                            {liveRoute.length < activeRoute.length ? ` · 종료 ${activeRoute.length - liveRoute.length}건` : ''}
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
                        {/* 이 요약줄은 바로 옆의 주행거리·예상시간과 한 몸이다.
                            그 둘은 liveRoute(진행 중)만으로 계산하는데 운임만 activeRoute 전체를
                            더하고 있어서, 취소·방출한 콜의 운임까지 합산됐다.
                            실측: 진행 중 2건인데 종료 5건까지 더해 510,000원으로 표시됨.
                            취소한 콜은 한 푼도 받지 못하므로 명백한 과다 표시다. */}
                        <div className="flex flex-col items-end leading-none">
                            <span className="text-xl font-black text-info tracking-tight">
                                {liveRoute.reduce((sum, o) => sum + (o.fare || 0), 0).toLocaleString()}
                                <span className="text-xs font-bold text-text-muted ml-0.5">원</span>
                            </span>
                            <span className="text-[10px] text-text-muted mt-1">진행 중 운임</span>
                        </div>
                    </div>
                )}
            </div>

            {/* [Phase 8.5] 뷰 필터 탭 — **화면 맨 위에 붙는다**
                기사님: "콜을 선택하면 자동으로 스크롤하여 진행중·완료·취소/방출·전체가
                스크롤 탑으로 이동하면 훨씬 수월할 듯하다."

                ⚠️ Header 가 이미 `sticky top-0` 이므로 `top-0` 으로 두면 **헤더 밑에 파묻힌다.**
                   Header 가 내보내는 `--header-h` 만큼 내려 붙인다 (하드코딩하면 폰트·세이프에어리어에서 깨짐).
                   scroll-margin-top 도 같은 값이어야 자동 스크롤이 헤더에 가리지 않는다. */}
            {safeRoute.length > 0 && (
                <div
                    ref={tabBarRef}
                    className="flex border-b border-border-card sticky z-[9] bg-bg-base/95 backdrop-blur-sm"
                    style={{ top: 'var(--header-h, 0px)', scrollMarginTop: 'var(--header-h, 0px)' }}
                >
                    <button
                        onClick={() => { setViewFilter('ACTIVE'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'ACTIVE' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        진행 중 ({liveRoute.length})
                    </button>
                    <button
                        onClick={() => { setViewFilter('COMPLETED'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'COMPLETED' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        완료됨 ({safeRoute.filter(r => r.status === 'ORDER_DELIVERED' || r.status === 'ORDER_COMPLETED').length})
                    </button>
                    <button
                        onClick={() => { setViewFilter('CANCELED'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'CANCELED' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        취소/방출 ({safeRoute.filter(r => r.status === 'ORDER_RELEASED' || r.status === 'ORDER_CANCELED' || r.status === 'ORDER_FORCE_CANCELED').length})
                    </button>
                    <button
                        onClick={() => { setViewFilter('ALL'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'ALL' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        전체 ({safeRoute.length})
                    </button>
                </div>
            )}

            {/* [Phase 8.5] '진행 중' 탭만 덱으로 바꾼다.
                완료됨·취소/방출·전체는 **조작이 아니라 조회**용이므로 기존 리스트를 그대로 둔다.
                분기가 한 군데뿐이라, 문제가 생기면 이 조건 하나만 되돌리면 옛 화면으로 복귀한다. */}
            {/* 최소 출발 시각 카운트다운 — 그 남은 시간이 곧 **대기 예산**이다.
                기사님: *"첫 콜을 잡았다면 최소 출발 시간이 카운트다운하면 좋을 듯하다."* */}
            {viewFilter === 'ACTIVE' && liveRoute.length > 0 && (
                <DepartureCountdown orders={liveRoute} records={callRecords} />
            )}

            {viewFilter === 'ACTIVE' && liveRoute.length > 0 && (
                <CallDeck
                    records={callRecords}
                    /* 순서는 잡은 시간순으로 고정한다 — 새 콜은 뒤에 붙기만 해서
                       기존 위치가 안 밀린다. 근거는 deckOrder() 주석 참고 */
                    orders={deckOrder(liveRoute)}
                    renderCard={(route) => (
                        <PinnedRouteCard
                            route={route}
                            isExpanded
                            onToggle={toggleExpand}
                            onDecision={onDecision}
                            processingId={processingId}
                            setProcessingId={setProcessingId}
                            etaMap={etaMap}
                            visitOrderMap={visitOrderMap}
                            indexNum={chronologicalIds.indexOf(route.id) + 1}
                            records={callRecords.get(route.id) ?? EMPTY_RECORDS}
                            variant="deck"
                        />
                    )}
                />
            )}
            {viewFilter === 'ACTIVE' && liveRoute.length === 0 && safeRoute.length > 0 && (
                <div className="mx-4 my-6 py-8 px-4 text-center border border-dashed border-border rounded-xl text-text-muted text-[13px]">
                    진행 중인 콜이 없습니다
                    <div className="text-[11px] mt-1 opacity-80">첫짐 필터로 돌아가 새 콜을 기다립니다</div>
                </div>
            )}

            {/* 오더 관리 아코디언 리스트 (완료됨 · 취소/방출 · 전체) */}
            {viewFilter !== 'ACTIVE' && safeRoute.length > 0 && (
                <div className="flex flex-col">
                    {[...activeRoute]
                        .filter(route => {
                            // ACTIVE 는 위 덱이 담당하므로 여기 오지 않는다
                            if (viewFilter === 'COMPLETED') {
                                // 하차 보고(ORDER_DELIVERED)가 곧 배송 완료다 (Phase 8.3)
                                return route.status === 'ORDER_DELIVERED' || route.status === 'ORDER_COMPLETED';
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
                                    records={callRecords.get(route.id) ?? EMPTY_RECORDS}
                                />
                            );
                        })}
                </div>
            )}
        </section>
    );
}
