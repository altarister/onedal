import { useMemo, useState, useEffect, useRef } from 'react';
import { isEvaluating, isTerminal, hasVisitedStop, isDeliveredCall, deriveRouteTimeline, derivationInputsOf, deckOfCycle } from '@onedal/shared';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import { EMPTY_RECORDS } from './records';
import { useStepRecords } from './useStepRecords';
import { useJudgmentStore } from '../stores/judgmentStore';
import { useGpsFocusStore, ensureGpsFocusSubscribed } from '../stores/gpsFocusStore';
import { useDrivenTrailStore, ensureDrivenTrailSubscribed, clearDrivenTrail } from '../stores/drivenTrailStore';
import { useFilterConfig } from './useFilterConfig';
import { useMasterGps } from './useMasterGps';
import { apiClient } from '../api/apiClient';
import { getAddressLabel } from '../lib/routeUtils';
import { buildVisitOrderMap } from '../lib/routeOptimizer';
import { logStateChange } from '../lib/roadmapLogger';
import type { RoutePoint } from '../components/dashboard/PinnedRouteCanvas';
import type { EtaCell } from '../components/dashboard/PinnedRouteCard';

/**
 * 🏭 **경로 파생 제조소** (기사님 확정 2026-08-31 · 화면개편 1단계 · v24).
 *
 * PinnedRoute 안에 살던 파생 전부를 한 곳으로 — 지도·덱·카드·카운트다운·(개편 후) 시트가
 * **같은 계산 한 벌**을 먹는다 (규칙 ③ — 파생을 만들었으면 그 입력도 한 곳에서).
 * 옛 화면과 새 무대가 병행하는 동안에도 계산이 두 벌이 되지 않는 근거가 이 훅이다.
 *
 * ⚠️ 로직은 PinnedRoute 에서 **그대로 이사**했다 — 값·주석·사고 이력 포함. 바꾸지 않았다.
 */
export function useRouteDerivations(
    activeRoute: SecuredOrder[],
    routeStops: RouteStopInfo[],
    routeComputedAt: string | null,
    /** 🧭 경로를 든 콜 — 서버가 고른 답 (0831 잔상 수리). 없으면 그릴 선이 없다 */
    routeHolderId?: string | null,
) {
    /**
     * 🔄 파생 치환 ① (기사님 승인 2026-08-21) — 타임라인·카운트다운의 재료를
     * 새 장부(여섯 단계 행)에서 읽는다. 계산은 그대로, 출처만 바뀐다.
     */
    const stepRecords = useStepRecords(activeRoute.map(o => o.id));
    const { filter } = useFilterConfig();

    // 지도 렌더링용: 완료된 콜 제외한 현재 진행 중인 오더만 추출
    const liveRoute = useMemo(() => (activeRoute || []).filter(r => !isTerminal(r.status)), [activeRoute]);

    /**
     * 🔄 **이번 운행의 카드 목록** — 하차해도 사이클이 끝날 때까지 남는다 (기사님 2026-08-19).
     * 🔴 `liveRoute`(진행 중)와 **엄격히 갈라 둔다.** 이 목록은 덱 화면 전용이고,
     *    경로·적재·운임·카운트다운·타임라인은 전부 `liveRoute` 를 쓴다.
     */
    const cycleDeck = useMemo(() => deckOfCycle(activeRoute || []), [activeRoute]);

    /**
     * 🧭 **경로를 든 콜 — 추측하지 않는다** (기사님 확정 2026-08-31 · 잔상 수리).
     *
     * 예전엔 «진행 중 콜 중 폴리라인 가진 마지막 것»으로 **추측**했다. 서버의 판정
     * (`buildOrderSync` 의 holder)과 규칙이 달라, KEEP 직후처럼 둘이 갈리는 순간에
     * **직전 콜의 옛 선**을 그렸다 — 잔상의 뿌리. 이제 서버가 이름을 준다 (규칙 ③).
     * 🔴 홀더가 없으면 **아무 선도 안 그린다** — 낡은 선을 그리는 것보다 낫다 (규칙 ④).
     */
    const routeHolder = useMemo(
        () => (routeHolderId ? liveRoute.find(r => r.id === routeHolderId) ?? null : null),
        [liveRoute, routeHolderId]);
    const activePolyline = useMemo(
        () => (routeHolder?.routePolyline?.length ? routeHolder.routePolyline : null),
        [routeHolder]);

    const isDriving = filter?.dispatchPhase === 'DELIVERING';

    /**
     * 🏁 모의 주행이 들러야 할 정거장 (2026-08-25) — 폴리라인은 도로 위만 지나는데
     * 물류센터는 떨어져 있다 (실측 곤지암 601m). 다녀온 곳은 뺀다 — 판단은 hasVisitedStop 하나.
     */
    const mockStops = useMemo(() => {
        /**
         * 🔴 **목록에서 빼지 않고 «방문»을 표시한다** (2026-08-31 실측 — 감속 중 증발).
         *    예전엔 다녀온 정거장을 목록에서 뺐는데, 시뮬이 감속하며 다가가는 사이
         *    서버 도착 감지(500m)가 먼저 찍혀 **목표가 눈앞에서 사라졌다** — 정차 연기가
         *    영영 안 밟힌 이유. 다녀온 곳을 안 가는 것은 시뮬 내부 장부(simStep.visited,
         *    가동 시 이 표시를 이식)가 지킨다 — 판단은 여전히 hasVisitedStop 하나다.
         */
        const out: Array<{ x: number; y: number; visited: boolean }> = [];
        for (const r of liveRoute) {
            if (r.pickupX != null && r.pickupY != null)
                out.push({ x: r.pickupX, y: r.pickupY, visited: hasVisitedStop(r, 'pickup') });
            if (r.dropoffX != null && r.dropoffY != null)
                out.push({ x: r.dropoffX, y: r.dropoffY, visited: hasVisitedStop(r, 'dropoff') });
        }
        return out;
    }, [liveRoute]);

    // 📡 마스터 GPS 엔진 연결 (Real / Mock 자동 스위칭)
    const { currentGps, gpsSource } = useMasterGps(isDriving, activePolyline || null, mockStops);

    // 📡 화면이 무엇을 그리고 있었나 — 바뀔 때만 남긴다 (관제앱 웹뷰 초당 5.5회 재그림)
    useEffect(() => { logStateChange("국면", filter?.dispatchPhase ?? "없음", "진행중경로"); }, [filter?.dispatchPhase]);
    useEffect(() => { logStateChange("진행중 콜", `${liveRoute.length}건`, "진행중경로"); }, [liveRoute.length]);
    useEffect(() => { logStateChange("GPS 출처", gpsSource, "진행중경로"); }, [gpsSource]);

    /**
     * 지도와 TSP 의 출발점 — GPS 가 안 잡히는 동안에는 설정의 '내 주소' (2026-08-12).
     * 진짜 위치(GPS)가 언제나 이긴다. 서버도 같은 값을 쓴다 (SettingsRepository.getHomeLocation).
     */
    const [myLocation, setMyLocation] = useState<{ x: number, y: number } | null>(null);
    /** 🏠 설정의 «내 주소» — 모의 주행이 끝나면 여기로 돌아온다 (서버와 같은 규칙) */
    const homeLocation = useRef<{ x: number; y: number } | null>(null);
    useEffect(() => {
        let alive = true;
        apiClient.get('/settings')
            .then(({ data }: { data: { homeX?: number; homeY?: number } }) => {
                const x = data?.homeX, y = data?.homeY;
                if (!alive || x == null || y == null) return;
                homeLocation.current = { x, y };
                setMyLocation(prev => prev ?? { x, y });
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    /**
     * 🧹 **모의 주행이 끝나면 화면의 현위치도 집으로** (기사님 실측 2026-08-31).
     *    서버는 이미 가상 위치를 걷어내고 내 주소로 돌아간다(`clearMockLocation`).
     *    화면만 마지막 모의 좌표를 들고 있으면 **같은 사실을 두 곳이 다르게 말한다** —
     *    다음 판의 기점이 이천으로 보이고, 시뮬 문제지도 그 좌표로 출제된다.
     */
    useEffect(() => {
        const onMockEnd = () => { if (homeLocation.current) setMyLocation(homeLocation.current); };
        window.addEventListener('mock-driving-ended', onMockEnd);
        return () => window.removeEventListener('mock-driving-ended', onMockEnd);
    }, []);
    useEffect(() => {
        if (currentGps) setMyLocation({ x: currentGps.lng, y: currentGps.lat });
    }, [currentGps]);

    /**
     * 🖥️ 다음 정거장에 가까워지면 그 콜 화면으로 (기사님 2026-08-19).
     * 구독은 스토어 모듈에서 한 번 — 훅 호출자가 몇이어도 안 늘어난다 (ghostCard 규칙).
     */
    useEffect(() => { ensureGpsFocusSubscribed(); ensureDrivenTrailSubscribed(); }, []);
    const gpsFocus = useGpsFocusStore(st => st.gpsFocus);

    /** 👣 이번 사이클의 주행 자취 — 사이클이 끝나면(덱이 비면) 접는다 */
    const drivenTrail = useDrivenTrailStore(st => st.points);
    useEffect(() => { if (cycleDeck.length === 0) clearDrivenTrail(); }, [cycleDeck.length]);

    const safeRoute = activeRoute || [];
    const allEvaluating = safeRoute.some(r => isEvaluating(r.status));

    /** 🪧 심사석 대상 — 평가·미리보기 중인 콜 하나 (덱에서는 뺀다) */
    const judging = safeRoute.find(r => !isTerminal(r.status) && (isEvaluating(r.status) || r.isPreview));

    /**
     * 🗺️ 타임라인도 **여기서 한 번** 만든다 (규칙 ③) — 카운트다운·덱과 같은 값을
     * 카드(통화 시트)도 봐야 한다 (실측: 덱 ~05:56 vs 시트 03:28 — 한 화면 두 세상).
     */
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
            /**
             * 🚏 다녀온 정거장은 여기서도 뺀다 (기사님 실측 0831 — 숫자가 하나씩 밀림).
             *    도착 직후 서버 재계산 전까지 routeStops 에 남아 있어, 발자취(✅번호)와
             *    남은 목록에 **이중으로** 세어졌다. 표시는 발자취가 이어받는다.
             */
            if (hasVisitedStop(r, st.stopType)) continue;
            const isP = st.stopType === 'pickup';
            pts.push({ type: isP ? '상차' : '하차', name: getAddressLabel(isP ? r.pickup : r.dropoff),
                       isEvaluating: isEvaluating(r.status),
                       x: isP ? r.pickupX : r.dropoffX, y: isP ? r.pickupY : r.dropoffY, routeId: r.id });
        }
        for (const r of liveRoute) {
            // 🚏 다녀온 정거장은 폴백에서도 되살리지 않는다 (기사님 실측 2026-08-19) — hasVisitedStop 하나
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
     * 🕐 콜별 상하차 예상 시각 — 재료는 타임라인 하나다 (기사님 질문 2026-08-30).
     * 옛 sectionEtas 직접 사용은 정차가 빠져 «한 화면 두 시각» 사고를 냈다.
     */
    const etaMap = useMemo(() => {
        const m = new Map<string, EtaCell>();
        for (const e of routeTimeline) {
            if (e.etaMs == null) continue;          // 주행을 모르면 안 적는다 (규칙 ④)
            const hhmm = new Date(e.etaMs).toTimeString().substring(0, 5);
            const cur = m.get(e.orderId) ?? {};
            m.set(e.orderId, e.stopType === 'pickup'
                ? { ...cur, pickupEta: hhmm, pickupShift: e.dwellShiftMinutes }
                : { ...cur, dropoffEta: hhmm, dropoffShift: e.dwellShiftMinutes });
        }
        return m;
    }, [routeTimeline]);

    /**
     * 👣 **지나온 발자취 — 사이클이 끝날 때까지 지도에 남는다** (기사님 2026-08-31).
     *    다녀온 정거장은 경로·순번에서 빠지는 게 맞지만(다시 안 간다), 화면에서
     *    통째로 사라지니 «내가 어디를 돌았는지»를 잃었다. 경로 재료가 아니라
     *    **표시 전용** 목록이다 — 방문 시각(arrivedAt)순으로 ✓1 ✓2 … 를 단다.
     *    취소·방출은 없던 일이라 안 남는다 (deckOfCycle 과 같은 기준).
     */
    const visitedTrail = useMemo(() => {
        const out: Array<{ x: number; y: number; type: '상차' | '하차'; at: number;
                           orderId: string; name: string; no: number }> = [];
        for (const r of cycleDeck) {
            if (isTerminal(r.status) && !isDeliveredCall(r)) continue;
            if (hasVisitedStop(r, 'pickup') && r.pickupX != null && r.pickupY != null)
                out.push({ x: r.pickupX, y: r.pickupY, type: '상차', orderId: r.id, no: 0,
                           name: getAddressLabel(r.pickup),
                           at: r.arrivedPickupAt ? Date.parse(r.arrivedPickupAt) : 0 });
            if (hasVisitedStop(r, 'dropoff') && r.dropoffX != null && r.dropoffY != null)
                out.push({ x: r.dropoffX, y: r.dropoffY, type: '하차', orderId: r.id, no: 0,
                           name: getAddressLabel(r.dropoff),
                           at: r.arrivedDropoffAt ? Date.parse(r.arrivedDropoffAt) : 0 });
        }
        out.sort((a, b) => a.at - b.at);
        // 🔒 번호 동결 — 방문 순서가 곧 그 정거장의 영원한 번호다 (기사님 확정 2026-08-31)
        out.forEach((v, i) => { v.no = i + 1; });
        return out;
    }, [cycleDeck]);

    // 지도 상의 방문 순번을 콜 ID별 상/하차지로 매핑.
    // 🔒 남은 정거장은 «방문한 개수 + 1» 부터 — 지나간 번호는 동결이라 재사용하지 않는다 (①)
    const visitOrderMap = useMemo(() => {
        const m = buildVisitOrderMap(unifiedRoutePoints);
        const k = visitedTrail.length;
        if (k > 0) for (const v of m.values()) {
            if (v.pickupIdx > 0) v.pickupIdx += k;
            if (v.dropoffIdx > 0) v.dropoffIdx += k;
        }
        return m;
    }, [unifiedRoutePoints, visitedTrail.length]);


    /**
     * 🎨 **콜 색 — 사이클 안에서 콜마다 고유 색 하나** (기사님 확정 2026-08-31 ②).
     *    지도 마커 테두리·덱 카드 점이 같은 색을 봐서 «③이 몇 번 콜이었나»가 색으로 읽힌다.
     *    기준은 덱 순서(cycleDeck) — 하차해도 사이클 끝까지 색이 안 바뀐다.
     */
    const callColors = useMemo(() => {
        const PALETTE = ['#4f8df9', '#f59e0b', '#a78bfa', '#ef4444', '#22d3ee', '#ec4899', '#a3e635'];
        return new Map(cycleDeck.map((r, i) => [r.id, PALETTE[i % PALETTE.length]] as const));
    }, [cycleDeck]);

    const chronologicalIds = useMemo(() => {
        return [...safeRoute]
            .sort((a, b) => {
                const timeA = a.capturedAt ? new Date(a.capturedAt).getTime() : 0;
                const timeB = b.capturedAt ? new Date(b.capturedAt).getTime() : 0;
                return timeA - timeB;
            })
            .map(r => r.id);
    }, [safeRoute]);

    return {
        stepRecords, liveRoute, cycleDeck, activePolyline, routeHolder, isDriving, mockStops,
        currentGps, gpsSource, myLocation, safeRoute, allEvaluating, judging, gpsFocus,
        routeTimeline, unifiedRoutePoints, etaMap, visitOrderMap, chronologicalIds, visitedTrail, callColors, drivenTrail,
    };
}
