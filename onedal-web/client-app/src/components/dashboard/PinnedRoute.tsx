import { isEvaluating, isTerminal, hasVisitedStop, deriveRouteTimeline, derivationInputsOf, deckOfCycle, isDeliveredCall } from "@onedal/shared";
import type { SecuredOrder } from "@onedal/shared";
import { useState, useEffect, useMemo, useRef } from 'react';
import { socket } from '../../lib/socket';
import { logRoadmapEvent , logStateChange } from '../../lib/roadmapLogger';
import PinnedRouteCanvas, { type RoutePoint } from './PinnedRouteCanvas';
import PinnedRouteCard from './PinnedRouteCard';
import type { EtaCell } from './PinnedRouteCard';
import CallDeck from './CallDeck';
import DepartureCountdown from './DepartureCountdown';
import { EMPTY_RECORDS } from '../../hooks/records';
import { useStepRecords } from '../../hooks/useStepRecords';
import { useJudgmentStore } from '../../stores/judgmentStore';
import { deckOrder } from '../../lib/deckFocus';
import { apiClient } from '../../api/apiClient';
import { getAddressLabel } from '../../lib/routeUtils';
import { buildVisitOrderMap } from '../../lib/routeOptimizer';
import type { RouteStopInfo } from '@onedal/shared';
import { useFilterConfig } from '../../hooks/useFilterConfig';
import { useMasterGps } from '../../hooks/useMasterGps';

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
}

export default function PinnedRoute({ activeRoute, routeStops, routeComputedAt, onDecision, onRecalculate, viewFilter, setViewFilter }: Props) {
    // [2026-08-12] 콜별 기록을 **여기서 한 번에** 받는다.
    // 카드가 각자 불러오면 화면 밖 카드의 진행 상황을 알 수 없어
    // 덱 위에 요약 줄을 띄울 수가 없었다 (기사님 지적).
    /**
     * 🔄 파생 치환 완주 (2026-08-21) — 덱·카드·타임라인·카운트다운 전부 새 장부
     * (여섯 단계 행) 하나를 읽는다. 옛 장부 훅(useCallProgress)은 소비자가 없어져
     * 철거 대기 — 옛 테이블(stop_cargo_reports·order_milestones)과 함께 걷는다 (확인 후).
     */
    /**
     * 🔄 **파생 치환 ①** (기사님 승인 2026-08-21) — 타임라인·카운트다운의 재료를
     * 새 장부(여섯 단계 행)에서 읽는다. 계산은 그대로, 출처만 바뀐다.
     * `callRecords`(옛 장부)는 판정 근거의 이력 표시 등 남은 독자용으로 아직 둔다 —
     * 옛 테이블 철거 때 함께 걷는다.
     */
    const stepRecords = useStepRecords(activeRoute.map(o => o.id));
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    /** 콜을 다루기 시작하면 탭 바를 화면 맨 위로 끌어올린다 */
    const tabBarRef = useRef<HTMLDivElement>(null);
    const scrollToCalls = () => tabBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const [processingId, setProcessingId] = useState<string | null>(null);
    const { filter, updateFilter } = useFilterConfig();
    // 서버 통신 완료 시 (상태가 변하거나 삭제될 때) 로딩 상태 즉각 해제
    useEffect(() => {
        setProcessingId(null);
    }, [activeRoute]);

    // 지도 렌더링용: 완료된 콜 제외한 현재 진행 중인 오더만 추출
    const liveRoute = useMemo(() => (activeRoute || []).filter(r => !isTerminal(r.status)), [activeRoute]);

    /**
     * 🔄 **이번 운행의 카드 목록** — 하차해도 사이클이 끝날 때까지 남는다 (기사님 2026-08-19).
     *
     * 🔴 `liveRoute`(진행 중)와 **엄격히 갈라 둔다.** 이 목록은 **덱 화면 전용**이고,
     *    경로·적재·운임·카운트다운·타임라인은 전부 `liveRoute` 를 쓴다 —
     *    완료분이 섞이면 하차한 짐이 계속 실려 있는 것으로 세어진다.
     */
    const cycleDeck = useMemo(() => deckOfCycle(activeRoute || []), [activeRoute]);

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

    /**
     * 🏁 **모의 주행이 들러야 할 정거장** (2026-08-25).
     *
     * 폴리라인은 도로 위만 지나는데 물류센터는 떨어져 있다 — 실측 곤지암 601m ·
     * 부발 525m. 도착 반경 500m 라 모의 주행이 **영영 못 닿았고**, 하차가 안 된 콜이
     * 남아 경로가 나중에 되돌아갔다. 실제 기사님은 시설 안까지 들어가므로 좌표를 준다.
     *
     * ⚠️ 다녀온 곳은 뺀다 — 판단은 서버와 같은 `hasVisitedStop` 하나다.
     */
    const mockStops = useMemo(() => {
        const out: Array<{ x: number; y: number }> = [];
        for (const r of liveRoute) {
            if (r.pickupX != null && r.pickupY != null && !hasVisitedStop(r, 'pickup'))
                out.push({ x: r.pickupX, y: r.pickupY });
            if (r.dropoffX != null && r.dropoffY != null && !hasVisitedStop(r, 'dropoff'))
                out.push({ x: r.dropoffX, y: r.dropoffY });
        }
        return out;
    }, [liveRoute]);

    // 📡 마스터 GPS 엔진 연결 (Real / Mock 자동 스위칭)
    const { currentGps, gpsSource } = useMasterGps(isDriving, activePolyline || null, mockStops);

    /**
     * 📡 **화면이 무엇을 그리고 있었나** — 주행 뒤에 돌아볼 수 있게 남긴다
     *    (필드테스트 ④ · 2026-08-25). 어제 문서 §4-2 가 모른다고 적어 둔 둘 중 하나다.
     *
     * ⚠️ **바뀔 때만** 남긴다. 관제앱 웹뷰가 초당 5.5회 다시 그리는데 그걸 다 남기면
     *    정작 사건이 묻힌다 (`logStateChange` 가 직전 값과 같으면 버린다).
     */
    useEffect(() => {
        logStateChange("국면", filter?.dispatchPhase ?? "없음", "진행중경로");
    }, [filter?.dispatchPhase]);
    useEffect(() => {
        logStateChange("진행중 콜", `${liveRoute.length}건`, "진행중경로");
    }, [liveRoute.length]);
    useEffect(() => {
        logStateChange("GPS 출처", gpsSource, "진행중경로");
    }, [gpsSource]);

    /**
     * 지도와 TSP 의 출발점. GPS 가 잡히면 아래 useEffect 가 곧바로 덮어쓴다.
     *
     * [2026-08-12] GPS 가 안 잡히는 동안에는 **사용자 설정의 '내 주소'** 를 쓴다.
     * 예전에는 좌표를 여기 박아 뒀는데(주석엔 "판교"라 적혀 있었지만 실은 집 주소였다),
     * 기사님이 이미 설정에 넣어 둔 값이 있으므로 그것을 읽는다. 이사하면 설정만 바꾸면 된다.
     * 서버도 같은 값을 쓴다 (`SettingsRepository.getHomeLocation`).
     */
    const [myLocation, setMyLocation] = useState<{ x: number, y: number } | null>(null);

    useEffect(() => {
        let alive = true;
        apiClient.get('/settings')
            .then(({ data }: { data: { homeX?: number; homeY?: number } }) => {
                const x = data?.homeX, y = data?.homeY;
                if (!alive || x == null || y == null) return;
                // GPS 가 이미 들어왔으면 건드리지 않는다 — 진짜 위치가 언제나 이긴다
                setMyLocation(prev => prev ?? { x, y });
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

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

    /**
     * 🧭 **방문 순서는 서버가 내려준 routeStops 하나다** (기사님 동의 2026-08-19).
     *
     * 예전에는 여기서 자기 TSP(`optimizeRouteOrder`)를 돌렸다 — 서버도 `optimizeWaypoints`
     * 로 순서를 만드는데 관제웹이 **한 벌 더** 만들어 인덱스로 끼워 맞추고 있었다.
     * 두 순서가 어긋나면 ETA 가 엉뚱한 정거장에 붙는다 ("파생값 두 벌" 사고 클래스).
     *
     * routeStops 에 없는 활성 콜(심사 중 후보 · 경로 연산 전/실패)은 **번호 순서 뒤에
     * 덧붙인다** — 지도에서 사라지면 안 되지만, 아직 경로가 아닌 것도 사실이기 때문이다.
     */
    /**
     * 🖥️ **다음 정거장에 가까워지면 그 콜 화면으로** (기사님 2026-08-19).
     * 근접 예고·도착 이벤트에 orderId 가 실려 온다 — 덱이 그 카드로 넘어간다.
     * 운행 중에는 지금 다가가는 정거장의 카드가 "지금 필요한 화면"이다.
     */
    const [gpsFocus, setGpsFocus] = useState<{ orderId: string; tick: number } | null>(null);
    useEffect(() => {
        const focus = (d: { orderId?: string }) => {
            if (d?.orderId) setGpsFocus({ orderId: d.orderId, tick: Date.now() });
        };
        socket.on('next-stop-approaching', focus);
        socket.on('auto-arrived', focus);
        return () => {
            socket.off('next-stop-approaching', focus);
            socket.off('auto-arrived', focus);
        };
    }, []);

    /**
     * 🗺️ 타임라인도 **여기서 한 번** 만든다 (규칙 ③) — 카운트다운·덱과 같은 값을
     * 카드(통화 시트)도 봐야 한다. 실측: 덱은 합짐 하차 ~05:56 을 아는데 시트는
     * "주행 시간을 모릅니다"라며 03:28 을 추천했다 — 한 화면이 두 세상을 보고 있었다.
     */
    // 🎛️ 판정 기준 탭의 시간 4칸이 화면 파생까지 — 조립은 derivationInputsOf 한 곳 (서버와 같은 함수)
    const judgmentCfg = useJudgmentStore(st => st.judgment);
    const routeTimeline = useMemo(() => {
        const { rules, unk } = derivationInputsOf(judgmentCfg);
        const dwellLedgerOf = (id: string) => (stepRecords.get(id) ?? EMPTY_RECORDS).dwell;
        return deriveRouteTimeline(
            routeStops, liveRoute,
            (id) => (stepRecords.get(id) ?? EMPTY_RECORDS).reports,
            (id) => (stepRecords.get(id) ?? EMPTY_RECORDS).milestones,
            Date.now(), routeComputedAt, rules, unk, dwellLedgerOf,
        );
    }, [routeStops, liveRoute, stepRecords, routeComputedAt, judgmentCfg]);

    const unifiedRoutePoints: RoutePoint[] = useMemo(() => {
        const byId = new Map(liveRoute.map(r => [r.id, r]));
        const pts: RoutePoint[] = [];
        const covered = new Set<string>();
        for (const st of routeStops) {
            const r = byId.get(st.orderId);
            if (!r) continue;                          // 좀비 정거장 (취소 후 재계산 전) — 그리지 않는다
            covered.add(`${st.orderId}:${st.stopType}`);
            const isP = st.stopType === 'pickup';
            pts.push({ type: isP ? '상차' : '하차', name: getAddressLabel(isP ? r.pickup : r.dropoff),
                       isEvaluating: isEvaluating(r.status),
                       x: isP ? r.pickupX : r.dropoffX, y: isP ? r.pickupY : r.dropoffY, routeId: r.id });
        }
        for (const r of liveRoute) {
            /**
             * 🚏 **다녀온 정거장은 폴백에서도 되살리지 않는다** (기사님 실측 2026-08-19).
             *    서버가 ①로 뺀 상차지를 여기서 `isAlreadyLoaded`(상차 완료 버튼)로 판단해
             *    **도로 넣고 있었다.** 그것도 콜 순서대로라 `⑴상차 ⑵하차 ⑶상차…` 로
             *    번갈아 매겨져 번호가 뒤죽박죽이 됐다.
             *    판단은 서버와 같은 `hasVisitedStop` 하나여야 한다.
             */
            if (!covered.has(`${r.id}:pickup`) && !hasVisitedStop(r, 'pickup'))
                pts.push({ type: '상차', name: getAddressLabel(r.pickup), isEvaluating: isEvaluating(r.status),
                           x: r.pickupX, y: r.pickupY, routeId: r.id });
            if (!covered.has(`${r.id}:dropoff`) && !hasVisitedStop(r, 'dropoff'))
                pts.push({ type: '하차', name: getAddressLabel(r.dropoff), isEvaluating: isEvaluating(r.status),
                           x: r.dropoffX, y: r.dropoffY, routeId: r.id });
        }
        return pts;
    }, [liveRoute, routeStops]);

    /**
     * 🕐 **콜별 상하차 예상 시각 — 재료는 타임라인 하나다** (기사님 질문 2026-08-30).
     *
     * 기사님: *"여기에 표시되고 있는 시간이 어떻게 산출되었는지 알면 좋겠어."*
     *
     * 🔴 예전엔 카카오의 `sectionEtas`(= 경로 계산 시각 + 구간 주행 누적)를 그대로 썼다.
     *    그래서 **정차가 한 번도 안 들어갔다** — 칩은 `~21:48` 이라 적는데 같은 화면의
     *    시트는 상차 14분을 세어 `~22:02` 를 말했다. **한 화면이 두 시각을 말한 것**이다
     *    (이 레포가 네 번 겪은 「두 목소리」 클래스).
     *
     * 지금은 `routeTimeline` 에서 받는다 — 정차·확정 약속·실측 밀림이 전부 들어간
     * 그 값이다. 시각을 만드는 곳이 하나가 됐다 (규칙 ③).
     */
    const etaMap = useMemo(() => {
        const m = new Map<string, EtaCell>();
        for (const e of routeTimeline) {
            if (e.etaMs == null) continue;          // 주행을 모르면 안 적는다 (규칙 ④)
            const hhmm = new Date(e.etaMs).toTimeString().substring(0, 5);
            const cur = m.get(e.orderId) ?? {};
            // ⏱️ 앞 정거장 실측이 밀어낸 분 — 화면의 「+5분」 (0 이면 안 그린다)
            m.set(e.orderId, e.stopType === 'pickup'
                ? { ...cur, pickupEta: hhmm, pickupShift: e.dwellShiftMinutes }
                : { ...cur, dropoffEta: hhmm, dropoffShift: e.dwellShiftMinutes });
        }
        return m;
    }, [routeTimeline]);

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
                    orders={deckOrder(cycleDeck)}
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
