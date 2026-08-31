import { isEvaluating, isDeliveredCall } from "@onedal/shared";
import type { SecuredOrder } from "@onedal/shared";
import { useState, useEffect, useRef } from 'react';
import { useRouteDerivations } from '../../hooks/useRouteDerivations';
import { logRoadmapEvent } from '../../lib/roadmapLogger';
import PinnedRouteCanvas from './PinnedRouteCanvas';
import PinnedRouteCard from './PinnedRouteCard';
import CallDeck from './CallDeck';
import DepartureCountdown from './DepartureCountdown';
import { EMPTY_RECORDS } from '../../hooks/records';
import { MovingBadge } from './VehicleStatusPanel';
import { deckOrder } from '../../lib/deckFocus';
import type { RouteStopInfo } from '@onedal/shared';
import { useFilterConfig } from '../../hooks/useFilterConfig';

interface Props {
    activeRoute: SecuredOrder[];
    /** 🧭 서버가 내려준 경로 순서 — 방문 순서의 유일한 원천 (기사님 동의 2026-08-19) */
    routeStops: RouteStopInfo[];
    /** 경로를 계산한 시점 — 타임라인 추정 약속의 닻 */
    routeComputedAt: string | null;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    onRecalculate?: (id: string, priority: string) => void;
    viewFilter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL';
    setViewFilter: (filter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL') => void;
    /** 🎭 무대의 시트 내용물로 쓰일 때 — 제목줄·지도·요약줄은 무대가 그리므로 뺀다 (개편 2단계) */
    sheetOnly?: boolean;
}

/** 몸통 — 파생은 밖(기본 내보내기 또는 무대)에서 받아온다. 훅을 안 부르므로 어디에도 담길 수 있다 */
export function PinnedRouteBody({ activeRoute, routeStops, routeComputedAt, onDecision, onRecalculate, viewFilter, setViewFilter, sheetOnly, d }: Props & { d: ReturnType<typeof useRouteDerivations> }) {
    /**
     * 🏭 파생은 전부 **제조소 훅** 한 곳에서 (화면개편 1단계 · 2026-08-31).
     * 이 컴포넌트에는 화면 상태(펼침·탭·처리중)만 남는다.
     */
    const {
        stepRecords, liveRoute, cycleDeck, myLocation, safeRoute, allEvaluating, judging,
        routeTimeline, unifiedRoutePoints, etaMap, visitOrderMap, chronologicalIds, gpsFocus,
    } = d;

    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    /** 콜을 다루기 시작하면 탭 바를 화면 맨 위로 끌어올린다 */
    const tabBarRef = useRef<HTMLDivElement>(null);
    // 시트 안(sheetOnly)에서는 부드러운 스크롤이 매 탭 클릭마다 출렁임이 된다 — 즉시 정렬 (기사님 0831)
    const scrollToCalls = () => tabBarRef.current?.scrollIntoView({ behavior: sheetOnly ? 'auto' : 'smooth', block: 'start' });
    const [processingId, setProcessingId] = useState<string | null>(null);
    const { filter, updateFilter } = useFilterConfig();
    // 서버 통신 완료 시 (상태가 변하거나 삭제될 때) 로딩 상태 즉각 해제
    useEffect(() => {
        setProcessingId(null);
    }, [activeRoute]);

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    // if (!safeRoute || safeRoute.length === 0) return null; // 삭제됨: 라우트가 없어도 맵은 항상 표시

    return (
        <section id="confirmed-route" className="flex flex-col">
            {!sheetOnly && safeRoute.length > 0 && (
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

            {!sheetOnly && (
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

                        /**
                         * 🔒 **합짐 중에는 경로 우선순위를 바꿀 수 없다** (기사님 확정 2026-08-19).
                         *    "2건 이상이면 선택되지 못한 버튼을 숨긴다 — 어떤 것이 선택돼 있는지는
                         *    보이고, 경로는 바꿀 수 없게."
                         *    우선순위는 도로 선택을 바꾼다 — 순서는 안 바뀌지만 주행 시간이 변해
                         *    이미 잡은 약속들과 어긋날 수 있다. 콜 하나일 때만 고른다.
                         */
                        // 🔓 심사 중(안전취소 30초)에는 열어 둔다 (기사님 보완 2026-08-19) —
                        //    "이 콜을 붙이면 어떤 경로가 되나"를 바꿔 보는 것이 결재의 재료다.
                        //    결재가 끝나 확정 2건 이상만 남으면 그때 잠근다.
                        const priorityLocked = liveRoute.length >= 2 && !liveRoute.some(o => isEvaluating(o.status));
                        const buttons = [
                            { key: 'RECOMMEND', label: '추천', on: isRecommend, onCls: 'bg-info/90 text-white border border-info' },
                            { key: 'TIME', label: '시간', on: isTime, onCls: 'bg-accent/90 text-white border border-accent' },
                            { key: 'DISTANCE', label: '거리', on: isDistance, onCls: 'bg-success/90 text-white border border-success' },
                        ].filter(b => !priorityLocked || b.on);

                        return (
                            <div className="absolute top-3 left-3 flex flex-col space-y-2 z-10 w-8">
                                {buttons.map(b => (
                                    <button key={b.key}
                                        onClick={(e) => { e.stopPropagation(); logRoadmapEvent("웹", `맵뷰 버튼(${b.label}) 좌상단 클릭`); setProcessingId(`recalc-global`); onRecalculate(recalcTarget.id, b.key); }}
                                        disabled={processingId !== null || priorityLocked}
                                        title={priorityLocked ? '합짐 중에는 경로 기준을 바꿀 수 없습니다' : undefined}
                                        className={`w-8 h-8 flex items-center justify-center rounded-md shadow-lg text-[10px] font-bold backdrop-blur-sm transition-all focus:outline-none ${
                                            priorityLocked ? 'cursor-default'
                                            : processingId !== null ? 'opacity-50 cursor-not-allowed'
                                            : 'opacity-80 hover:opacity-100 active:scale-95'
                                        } ${b.on ? b.onCls : 'bg-surface-alt/80 hover:bg-surface-hover text-text-primary border border-border'}`}
                                    >
                                        {b.label}
                                    </button>
                                ))}
                            </div>
                        );
                    })()}

                    {/* ── 🚀 지금 출발 — 지도 좌하단 플로팅 (docs/지금/필터.md §3) ──
                        기사님: *"지금 출발 버튼은 관제웹 지도 영역 좌하단에 버튼으로 들어가면 될 듯하다."*

                        설정이 아니라 **운행 조작**이라 필터 팝업이 아니라 여기 있어야 한다 —
                        팝업을 열어야 누를 수 있으면 안 된다. "출발하셨나요?" 알림에 답하는 자리와 같은 곳.

                        짐을 잡았고 아직 출발 전일 때만 보인다. 누르면 운행 중 국면으로 넘어가고,
                        그 국면의 저장값(경유 0)이 서버에서 펼쳐진다.

                        🔴 2026-08-14 — 조건이 `driverAction !== 'DRIVING'` 이었다. 그 값은
                           **정류장마다 바뀌므로**, 하차지에 도착할 때마다 버튼이 다시 나타났다.
                           짐이 2건이면 정류장이 4곳이라 출발을 네 번 눌러야 했다.
                           "출발했는가"는 국면(`dispatchPhase`)이 답한다.

                        🔴 `detourRadiusKm: 0` 도 뺐다. 운행중 국면 설정이 이미 그 값을 갖고 있다 —
                           여기서 또 보내면 같은 값을 두 곳에서 정하게 되고, 기사님이 운행중 탭에서
                           경유를 3km 로 바꿔 둬도 이 버튼이 0으로 덮어썼다. */}
                    {filter && filter.dispatchPhase !== 'DELIVERING' && liveRoute.length > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                logRoadmapEvent("웹", "지도 좌하단 🚀 지금 출발 클릭 → 운행 중 국면으로 전환");
                                updateFilter({ driverAction: 'DRIVING' });
                            }}
                            className="absolute bottom-3 left-3 z-10 px-3.5 py-2 rounded-xl bg-gradient-to-r from-info to-info-alt text-white font-black text-[12px] shadow-[0_0_15px_var(--theme-glow-primary)] hover:shadow-[0_0_20px_var(--theme-glow-primary)] active:scale-95 transition-all"
                        >
                            🚀 지금 출발
                        </button>
                    )}
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
                                    {' '}<MovingBadge />
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
            )}

            {/* [Phase 8.5] 뷰 필터 탭 — **화면 맨 위에 붙는다**
                기사님: "콜을 선택하면 자동으로 스크롤하여 진행중·완료·취소/방출·전체가
                스크롤 탑으로 이동하면 훨씬 수월할 듯하다."

                ⚠️ Header 가 이미 `sticky top-0` 이므로 `top-0` 으로 두면 **헤더 밑에 파묻힌다.**
                   Header 가 내보내는 `--header-h` 만큼 내려 붙인다 (하드코딩하면 폰트·세이프에어리어에서 깨짐).
                   scroll-margin-top 도 같은 값이어야 자동 스크롤이 헤더에 가리지 않는다. */}
            {safeRoute.length > 0 && (
                <div
                    ref={tabBarRef}
                    className={`flex border-b border-border-card bg-bg-base/95 backdrop-blur-sm ${sheetOnly ? "" : "sticky z-[9]"}`}
                    style={{ top: 'var(--header-h, 0px)', scrollMarginTop: 'var(--header-h, 0px)' }}
                >
                    <button
                        onClick={() => { setViewFilter('ACTIVE'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'ACTIVE' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        진행 중 ({cycleDeck.length})
                    </button>
                    <button
                        onClick={() => { setViewFilter('COMPLETED'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'COMPLETED' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        {/* 🔄 사이클이 도는 동안 하차한 콜은 진행 중 탭에 있다 — 두 곳에서 세지 않는다 */}
                        완료됨 ({safeRoute.filter(r => isDeliveredCall(r) && !cycleDeck.some(c => c.id === r.id)).length})
                    </button>
                    {/* 취소와 방출을 따로 센다 (기사님 2026-08-18) */}
                    <button
                        onClick={() => { setViewFilter('CANCELED'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'CANCELED' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        취소 ({safeRoute.filter(r => r.status === 'SAFE_CANCEL').length})
                    </button>
                    <button
                        onClick={() => { setViewFilter('RELEASED'); scrollToCalls(); }}
                        className={`flex-1 py-2 text-xs font-bold transition-colors ${viewFilter === 'RELEASED' ? 'text-text-primary border-b-2 border-info' : 'text-text-muted hover:text-text-primary'}`}
                    >
                        방출 ({safeRoute.filter(r => r.status === 'ORDER_RELEASED_BY_ME' || r.status === 'ORDER_RELEASED_BY_OFFICE').length})
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
                <DepartureCountdown orders={liveRoute} records={stepRecords}
                    routeStops={routeStops} routeComputedAt={routeComputedAt} />
            )}

            {viewFilter === 'ACTIVE' && cycleDeck.length > 0 && (
                <CallDeck
                    records={stepRecords}
                    /* 🗺️ 타임라인은 여기서 만든 것 하나 (새 장부 stepRecords 기반) — 덱이
                       옛 장부로 한 벌 더 파생하면 정차가 갈라져 두 데드라인이 된다 (2026-08-21) */
                    timeline={routeTimeline}
                    gpsFocus={gpsFocus}
                    /* 경유번호는 여기서 한 번 만든 것을 지도·요약 줄이 함께 쓴다.
                       시각은 ETA 가 아니라 약속이라 CallDeck 이 deriveCallTiming 에서 직접 꺼낸다 */
                    visitOrderMap={visitOrderMap}
                    /* 순서는 잡은 시간순으로 고정한다 — 새 콜은 뒤에 붙기만 해서
                       기존 위치가 안 밀린다. 근거는 deckOrder() 주석 참고.
                       🔄 하차한 콜도 사이클이 끝날 때까지 함께 있다 (deckOfCycle) */
                    orders={deckOrder(cycleDeck).filter(o => o.id !== judging?.id)}
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
                            records={stepRecords.get(route.id) ?? EMPTY_RECORDS}
                            timeline={routeTimeline}
                            routeStops={routeStops}
                            routeComputedAt={routeComputedAt}
                            variant="deck"
                        />
                    )}
                />
            )}
            {viewFilter === 'ACTIVE' && cycleDeck.length === 0 && safeRoute.length > 0 && (
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
                                // 🔄 다만 사이클이 도는 동안에는 진행 중 탭에 남아 있다 —
                                //    같은 콜이 두 탭에 동시에 보이지 않게 여기서 뺀다
                                return isDeliveredCall(route) && !cycleDeck.some(c => c.id === route.id);
                            }
                            if (viewFilter === 'CANCELED') {
                                return route.status === 'SAFE_CANCEL';
                            }
                            if (viewFilter === 'RELEASED') {
                                return route.status === 'ORDER_RELEASED_BY_ME' || route.status === 'ORDER_RELEASED_BY_OFFICE';
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
                                    records={stepRecords.get(route.id) ?? EMPTY_RECORDS}
                                    timeline={routeTimeline}
                                    routeStops={routeStops}
                                    routeComputedAt={routeComputedAt}
                                />
                            );
                        })}
                </div>
            )}
        </section>
    );
}


/** 기본 내보내기 — 파생 제조소를 부르고 몸통에 준다 (옛 화면 경로 · 토글 꺼짐일 때) */
export default function PinnedRoute(props: Props) {
    const d = useRouteDerivations(props.activeRoute, props.routeStops, props.routeComputedAt);
    return <PinnedRouteBody {...props} d={d} />;
}
