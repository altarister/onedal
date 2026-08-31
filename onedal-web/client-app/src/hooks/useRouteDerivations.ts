import { useMemo, useState, useEffect } from 'react';
import { isEvaluating, isTerminal, hasVisitedStop, deriveRouteTimeline, derivationInputsOf, deckOfCycle } from '@onedal/shared';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import { EMPTY_RECORDS } from './records';
import { useStepRecords } from './useStepRecords';
import { useJudgmentStore } from '../stores/judgmentStore';
import { useGpsFocusStore, ensureGpsFocusSubscribed } from '../stores/gpsFocusStore';
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

    // 현재 활성 폴리라인 (진행 중인 오더에서만 추출, 완료된 stale 궤적 무시)
    const activePolyline = useMemo(() => {
        if (liveRoute.length === 0) return null;
        for (let i = liveRoute.length - 1; i >= 0; i--) {
            const r = liveRoute[i];
            if (r && r.routePolyline && r.routePolyline.length > 0) return r.routePolyline;
        }
        return null;
    }, [liveRoute]);

    const isDriving = filter?.dispatchPhase === 'DELIVERING';

    /**
     * 🏁 모의 주행이 들러야 할 정거장 (2026-08-25) — 폴리라인은 도로 위만 지나는데
     * 물류센터는 떨어져 있다 (실측 곤지암 601m). 다녀온 곳은 뺀다 — 판단은 hasVisitedStop 하나.
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

    // 📡 화면이 무엇을 그리고 있었나 — 바뀔 때만 남긴다 (관제앱 웹뷰 초당 5.5회 재그림)
    useEffect(() => { logStateChange("국면", filter?.dispatchPhase ?? "없음", "진행중경로"); }, [filter?.dispatchPhase]);
    useEffect(() => { logStateChange("진행중 콜", `${liveRoute.length}건`, "진행중경로"); }, [liveRoute.length]);
    useEffect(() => { logStateChange("GPS 출처", gpsSource, "진행중경로"); }, [gpsSource]);

    /**
     * 지도와 TSP 의 출발점 — GPS 가 안 잡히는 동안에는 설정의 '내 주소' (2026-08-12).
     * 진짜 위치(GPS)가 언제나 이긴다. 서버도 같은 값을 쓴다 (SettingsRepository.getHomeLocation).
     */
    const [myLocation, setMyLocation] = useState<{ x: number, y: number } | null>(null);
    useEffect(() => {
        let alive = true;
        apiClient.get('/settings')
            .then(({ data }: { data: { homeX?: number; homeY?: number } }) => {
                const x = data?.homeX, y = data?.homeY;
                if (!alive || x == null || y == null) return;
                setMyLocation(prev => prev ?? { x, y });
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    useEffect(() => {
        if (currentGps) setMyLocation({ x: currentGps.lng, y: currentGps.lat });
    }, [currentGps]);

    /**
     * 🖥️ 다음 정거장에 가까워지면 그 콜 화면으로 (기사님 2026-08-19).
     * 구독은 스토어 모듈에서 한 번 — 훅 호출자가 몇이어도 안 늘어난다 (ghostCard 규칙).
     */
    useEffect(() => { ensureGpsFocusSubscribed(); }, []);
    const gpsFocus = useGpsFocusStore(st => st.gpsFocus);

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

    return {
        stepRecords, liveRoute, cycleDeck, activePolyline, isDriving, mockStops,
        currentGps, gpsSource, myLocation, safeRoute, allEvaluating, judging, gpsFocus,
        routeTimeline, unifiedRoutePoints, etaMap, visitOrderMap, chronologicalIds,
    };
}
