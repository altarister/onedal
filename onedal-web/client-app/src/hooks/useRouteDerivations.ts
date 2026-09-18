import { mockLineOf } from './mockLine';
import { useMemo, useState, useEffect, useRef } from 'react';
import { isEvaluating, isTerminal, hasVisitedStop, judgingCallOf, deriveRouteTimeline, derivationInputsOf, deckOfCycle, minRouteBuffer } from '@onedal/shared';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import { EMPTY_RECORDS } from './records';
import { useStepRecords } from './useStepRecords';
import { useJudgmentStore } from '../stores/judgmentStore';
import { useGpsFocusStore, ensureGpsFocusSubscribed } from '../stores/gpsFocusStore';
import { loadScreenSettings } from '../stores/settingsStore';
import { useDrivenTrailStore, ensureDrivenTrailSubscribed, clearDrivenTrail, restoreDrivenTrail } from '../stores/drivenTrailStore';
/* 📍 서버가 아는 «내 자리» — 화면이 제 손으로 정하지 않는다 (2026-09-12) */
/* 📍 구독은 현황판 쪽에서 건다 — 지도는 이 값을 아직 안 쓴다 (위 🗑️ 주석) */
import { useFilterConfig } from './useFilterConfig';
import { useMasterGps } from './useMasterGps';
import { callLineColor } from '../styles/callPalette';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/apiClient';
import { getAddressLabel } from '../lib/routeUtils';
import { logStateChange } from '../lib/roadmapLogger';
import { visitedSequenceOf } from '../lib/visitedSequence';
import type { RoutePoint } from '../components/dashboard/PinnedRouteCanvas';
import type { EtaCell } from '../components/dashboard/PinnedRouteCard';

/**
 * 🕐 **계측 로그용 «분:초»** — 한 판이 몇 분이라 시각까지 안 적어도 궤적과 맞댈 수 있다.
 *    🔴 화면에 쓰는 값이 아니다. 로그 한 줄이 길어지면 아무도 안 읽는다.
 *    ⚠️ 시각을 모르면 «시각없음» 이라고 적는 것은 부르는 쪽 일이다 — 여기서 0 을 짜내지 않는다.
 */
const mmssOf = (t: number) => (Number.isFinite(t) ? new Date(t).toTimeString().slice(3, 8) : '시각없음');

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
    /**
     * 🟡 **심사 중인 콜의 미리보기 궤적 홀더** (기사님 실물 2026-09-06).
     * KEEP 전 30초 동안은 `routeHolderId` 가 비어 있다(주행분이 아직 없다).
     * 그 사이에도 카카오 궤적은 콜에 실려 있으므로 **그것으로 그린다** —
     * 없으면 화면이 직선 보조선을 그린다 (*"점선으로 궤적이 나와야 하는데 또 직선"*).
     */
    previewRouteHolderId?: string | null,
) {
    /**
     * 🔄 파생 치환 ① (기사님 승인 2026-08-21) — 타임라인·카운트다운의 재료를
     * 새 장부(여섯 단계 행)에서 읽는다. 계산은 그대로, 출처만 바뀐다.
     */
    const stepRecords = useStepRecords(activeRoute.map(o => o.id));
    const { filter } = useFilterConfig();

    // 지도 렌더링용: 완료된 콜 및 심사 중인 후보콜을 제외한 현재 확정 진행 중인 오더만 추출
    const liveRoute = useMemo(
        () => (activeRoute || []).filter(r => !isTerminal(r.status) && !isEvaluating(r.status)),
        [activeRoute]
    );

    /**
     * 🗓️ **오늘의 카드 목록** — 진행 중 + 오늘 하차한 콜 (기사님 2026-08-19 · 2026-09-15 «사이클 = 하루»).
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
    /**
     * 🟡 **KEEP 된 콜이 우선, 없으면 심사 중인 콜의 궤적을 그린다.**
     * 순서를 뒤집지 않는다 — 운행 중에 새 콜이 심사에 들어와도 **가고 있는 길**이 먼저다.
     */
    const previewHolder = useMemo(
        () => (previewRouteHolderId ? (activeRoute || []).find(r => r.id === previewRouteHolderId) ?? null : null),
        [activeRoute, previewRouteHolderId]);
    const drawHolder = routeHolder ?? previewHolder;
    const activePolyline = useMemo(
        () => (drawHolder?.routePolyline?.length ? drawHolder.routePolyline : null),
        [drawHolder]);

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

    /** 🏠 설정의 «내 주소» — GPS 가 없을 때 지도·TSP 의 출발점 (서버와 같은 규칙) */
    const homeLocation = useRef<{ x: number; y: number } | null>(null);
    // 📡 마스터 GPS 엔진 연결 (Real / Mock 자동 스위칭)
    /**
     * 🎭 **모의 주행이 달릴 선은 지도 선과 따로 고른다** (2026-09-15 · `mockLine.ts`) — 심사 중에는 직전 선을 지킨다.
     *    지도는 심사 중 미리보기 선을 그리지만, 모의 주행이 그 선으로 갈아타면 순간 이동해 확정 콜이 가짜로 하차 완료된다.
     */
    const evaluatingNow = liveRoute.some(r => isEvaluating(r.status));
    /* 🔴 ref 를 그리는 중에 읽지 않는다(React 규칙) — 심사 중이 아닐 때의 선을 상태로 들고, 그리는 중엔 그 상태만 읽는다 */
    const [lineBeforeJudging, setLineBeforeJudging] = useState<Array<{ x: number; y: number }> | null>(null);
    useEffect(() => { if (!evaluatingNow) setLineBeforeJudging(activePolyline || null); }, [evaluatingNow, activePolyline]);
    const mockPolyline = mockLineOf(lineBeforeJudging, activePolyline || null, evaluatingNow);
    const { currentGps, gpsSource } = useMasterGps(isDriving, mockPolyline, mockStops);

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
                homeLocation.current = { x, y };
                setMyLocation(prev => prev ?? { x, y });
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);
    /**
     * 🔄 **«모의 주행이 끝나면 화면도 집으로» 를 걷었다** (기사님 지시 2026-09-12).
     *
     * 그 규칙은 **서버가 가상 좌표를 지웠기 때문에** 필요했다 — 화면만 이천에 남으면
     * 두 곳이 다른 말을 하니까. 🔴 **이제 서버는 지우지 않는다.** `originOf` 가 물을
     * 때마다 고르고, **콜을 쥔 동안에는 그 자리를 그대로 기점으로 쓴다.**
     * 그러니 화면도 그대로 두는 것이 «같은 말»이다 (규칙 ③).
     */
    useEffect(() => {
        if (currentGps) setMyLocation({ x: currentGps.lng, y: currentGps.lat });
    }, [currentGps]);

    /**
     * 🗑️ **«서버가 아는 자리를 지도가 따른다»를 껐다** (2026-09-12 · 기사님 지시).
     *
     * ── 무엇이 났나 ──
     * PC 지도가 집을 가리키는 것(서버와 17.6km 어긋남)을 고치려고 `myPosition` 을 따르게
     * 했더니 **모의 주행이 멈췄다.** 위치는 1초마다 바뀌는데 봉투는 «콜이 바뀔 때»만 와서,
     * 봉투가 올 때마다 옛 좌표가 내 점을 뒤로 당겼다. 가벼운 이벤트(`driver-position`)로
     * 옮겨 그건 풀렸지만, 이번엔 **그물 재계산**이 걸렸다 — 이 값은 지도 영역 계산(옛 `useCallNet` · 지금 `StageView` 의 «상차» · «하차» 레이어)도 먹는다.
     *
     * 🔴 **위치 하나를 여섯이 읽는다** (지도·그물·도착 감지·지나온 구간·궤적·경로 기점).
     *    하나를 건드리면 여섯이 흔들린다 — 그런데 고치려던 것(«PC 지도가 집을 가리킨다»)은
     *    **운행에 당장 지장이 없는 일**이었다. 가장 위험한 자리를 가장 안 급한 이유로
     *    건드린 것이라, 잇는 것을 뒤로 미룬다.
     *
     * ── 지금 상태 ──
     * 서버는 **준비된 채 조용하다** — `driver-position` 을 쏘고 봉투에 `routeOrigin` 을
     * 싣지만 **지도·그물은 안 듣는다.** 현황판만 «서버가 아는 내 자리»를 **보여준다**(읽기 전용).
     * 🔴 **다시 이을 때는 화면에서 그 값을 하루 보고 나서** 잇는다 — 오늘 문제는 값이
     *    틀려서가 아니라 **검증 없이 지도에 이어서** 났다.
     */

    /**
     * 🖥️ 다음 정거장에 가까워지면 그 콜 화면으로 (기사님 2026-08-19).
     * 구독은 스토어 모듈에서 한 번 — 훅 호출자가 몇이어도 안 늘어난다 (ghostCard 규칙).
     */
    /* ⚙️ 화면이 쓰는 설정도 여기서 한 번 읽는다 — «주행·정차로 굳는 초» (화면규칙 S16) */
    useEffect(() => { ensureGpsFocusSubscribed(); ensureDrivenTrailSubscribed(); void loadScreenSettings(); }, []);
    const gpsFocus = useGpsFocusStore(st => st.gpsFocus);

    /** 👣 오늘의 주행 자취 — 하루 종일 쌓고, 덱이 비면(자정에 어제분이 빠져) 접는다 (기사님 확정 2026-09-15 · 사이클 = 하루) */
    const drivenSegments = useDrivenTrailStore(st => st.segments);
    /**
     * 🔁 목업과 **같은 함수**(`pushTrail`)가 쌓기 때문에 스토어는 목업 말(`lng`·`lat`)을 쓴다.
     *    관제웹 지도는 `x`·`y` 로 읽으므로 여기서 **한 번만** 옮긴다 (규칙 ③ — 두 벌로 두지 않는다).
     */
    const drivenTrail = useMemo(
        () => drivenSegments.map(seg => seg.map(p => ({ x: p.lng, y: p.lat, atMs: p.atMs }))),
        [drivenSegments]);
    useEffect(() => { if (cycleDeck.length === 0) clearDrivenTrail(); }, [cycleDeck.length]);
    /**
     * 👣 **새로고침 뒤에는 장부에서 자취를 되살린다** (2026-09-12 밤).
     *    스토어가 메모리 전용이라 새로고침하면 0 이 된다 — 그래서 사이클을 처음 알게 된
     *    순간 한 번 물어본다. **한 번만** 읽는 것은 스토어가 지킨다.
     *    ⚠️ 덱이 비면(영업일이 바뀌면) 위 줄이 비우므로, 늦게 온 응답이 죽은 자취를 남기지 않는다.
     */
    useEffect(() => {
        if (cycleDeck.length === 0) return;
        void restoreDrivenTrail(cycleDeck.map(r => r.id));
    }, [cycleDeck]);

    const safeRoute = activeRoute || [];
    const allEvaluating = safeRoute.some(r => isEvaluating(r.status));

    /** 🪧 심사석 대상 — 평가·미리보기 중인 콜 하나 (덱에서는 뺀다) */
    const judging = judgingCallOf(safeRoute);

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

    const routePointsRaw: RoutePoint[] = useMemo(() => {
        const byId = new Map(liveRoute.map(r => [r.id, r]));
        const pts: RoutePoint[] = [];
        const covered = new Set<string>();
        for (const st of routeStops) {
            const r = byId.get(st.orderId);
            if (!r) continue;                          // 좀비 정거장 또는 심사 중 콜 — 그리지 않는다
            covered.add(`${st.orderId}:${st.stopType}`);
            /**
              * 🚏 다녀온 정거장은 여기서도 뺀다 (기사님 실측 0831 — 숫자가 하나씩 밀림).
              *    도착 직후 서버 재계산 전까지 routeStops 에 남아 있어, 발자취(✅번호)와
              *    남은 목록에 **이중으로** 세어졌다. 표시는 발자취가 이어받는다.
              */
            if (hasVisitedStop(r, st.stopType)) continue;
            const isP = st.stopType === 'pickup';
            pts.push({ type: isP ? '상차' : '하차', name: getAddressLabel(isP ? r.pickup : r.dropoff),
                       isEvaluating: false,
                       x: isP ? r.pickupX : r.dropoffX, y: isP ? r.pickupY : r.dropoffY, routeId: r.id });
        }
        for (const r of liveRoute) {
            // 🚏 다녀온 정거장은 폴백에서도 되살리지 않는다 (기사님 실측 2026-08-19) — hasVisitedStop 하나
            if (!covered.has(`${r.id}:pickup`) && !hasVisitedStop(r, 'pickup'))
                pts.push({ type: '상차', name: getAddressLabel(r.pickup), isEvaluating: false,
                           x: r.pickupX, y: r.pickupY, routeId: r.id });
            if (!covered.has(`${r.id}:dropoff`) && !hasVisitedStop(r, 'dropoff'))
                pts.push({ type: '하차', name: getAddressLabel(r.dropoff), isEvaluating: false,
                           x: r.dropoffX, y: r.dropoffY, routeId: r.id });
        }
        // 🟡 심사 중인 후보콜 — 경로선과 함께 상차·하차 마커와 지명도 지도에 그린다
        const candidate = judging ?? previewHolder;
        if (candidate && isEvaluating(candidate.status)) {
            if (candidate.pickupX != null && candidate.pickupY != null) {
                pts.push({
                    type: '상차',
                    name: getAddressLabel(candidate.pickup),
                    isEvaluating: true,
                    x: candidate.pickupX,
                    y: candidate.pickupY,
                    routeId: candidate.id,
                });
            }
            if (candidate.dropoffX != null && candidate.dropoffY != null) {
                pts.push({
                    type: '하차',
                    name: getAddressLabel(candidate.dropoff),
                    isEvaluating: true,
                    x: candidate.dropoffX,
                    y: candidate.dropoffY,
                    routeId: candidate.id,
                });
            }
        }
        return pts;
    }, [liveRoute, routeStops, judging, previewHolder]);

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
     * 👣 **지나온 발자취 — 오늘 하루 남는다** (기사님 2026-08-31 · 2026-09-15 «사이클 = 하루»).
     *    다녀온 정거장은 경로·순번에서 빠지는 게 맞지만(다시 안 간다), 화면에서
     *    통째로 사라지니 «내가 어디를 돌았는지»를 잃었다.
     *    방문 시각(arrivedAt)순으로 ✓1 ✓2 … 를 단다. 취소·방출은 없던 일이라 안 남는다.
     *
     * 🔴 **셈은 `visitedSequenceOf` 한 곳이다** (2026-09-12 밤 · 실측으로 옮겼다).
     *    여기 있던 판단이 **좌표를 요구했고**, 이력만 남아 좌표가 빈 렌더에서 목록이
     *    통째로 비어 **번호 여섯이 하나로 줄었다** (계측 `[번호]`·`[다녀옴]` 이 짚었다).
     *    번호를 세는 데 좌표는 필요 없다 — 좌표가 필요한 것은 **지도 마커**이고,
     *    지도는 제 쪽에서 이미 걸러 낸다 (`PinnedRouteCanvas` 의 `Number.isFinite`).
     */
    const visitedTrail = useMemo(
        () => visitedSequenceOf(cycleDeck, getAddressLabel), [cycleDeck]);

    /**
     * 🔢 **정거장 번호 = 가는 순서다** (기사님 확정 2026-09-01).
     *
     * 번호가 답하는 질문은 하나다 — *"지금 몇 번째로 가는 곳인가."*
     * 그러므로 **다녀온 것 + 남은 것을 시간 순서로 이어 붙인 자리**가 곧 번호다.
     *
     * ── 왜 두 번 고쳤나 ──
     * ① 처음엔 «지금 남은 목록의 몇 번째»로 매번 새로 셌다. 서버가 경로를 다시 세울 때마다
     *    남은 것들의 자리가 바뀌어 번호가 뛰었고(실측: *"신둔면이 6이었다가 3이었다가"*),
     *    다녀온 정거장을 목록에서 빼자 **그 콜의 번호가 통째로 사라졌다.**
     * ② 그래서 «출발하면 얼린다»로 바꿨다. 흔들림은 멎었는데(0901 실측 0회) 이번엔
     *    합짐이 **출발 뒤에** 들어오면 자기 상차·하차를 **끝에 이어 붙였다** —
     *    실제로는 `1 → 3 → 2 → 5 → 4 → 6` 순서로 다니게 됐다.
     *    번호가 안 바뀌는 대신 **순서를 못 말하게 된 것**이라, 값이 자기 질문에 답하지 못했다.
     *
     * ── 지금 규칙 ──
     *   다녀온 것 — 다녀온 시각 순. 한 번 받은 번호가 그대로 남는다 (발자취 ✓ 와 요약줄이 공유)
     *   남은 것   — **지금 갈 순서대로** 이어서 매긴다. 합짐이 중간에 끼면 그 뒤만 한 칸씩 밀린다
     *
     * 🔴 **기억(ref)을 두지 않는다** (규칙 ③). 다녀온 목록과 남은 목록에서 매번 파생시키면
     *    ①의 흔들림은 구조적으로 못 생긴다 — 정거장 하나를 다녀오면 남은 목록에서 빠지는
     *    동시에 다녀온 목록에 들어가므로 **자리 번호가 변하지 않는다.**
     *    번호가 바뀌는 경우는 «갈 순서가 진짜로 바뀌었을 때» 하나뿐이고, 그때는 바뀌는 게 맞다.
     *
     * 🔴 세는 재료는 **화면이 그리는 그 목록**(`routePointsRaw`)이다. 다른 목록으로 세면
     *    이름표와 지도가 어긋난다 — 0901 에 캔버스가 따로 세다 그렇게 갈렸다.
     */
    const stopNoOf = useMemo(() => {
        const m = new Map<string, number>();
        if (cycleDeck.length === 0) return m;
        let next = 1;
        /**
         * 🔴 **다녀온 것을 먼저 매긴다** — 그것이 시간상 앞이다.
         *    남은 것부터 매기면 **이미 지나온 정거장이 더 큰 번호**를 받는다 (✓4 → ①②③).
         */
        for (const v of visitedTrail)
            m.set(`${v.orderId}:${v.type === '상차' ? 'pickup' : 'dropoff'}`, next++);
        for (const p of routePointsRaw) {
            const k = `${p.routeId}:${p.type === '상차' ? 'pickup' : 'dropoff'}`;
            if (!m.has(k)) m.set(k, next++);
        }
        return m;
    }, [routePointsRaw, visitedTrail, cycleDeck.length]);

    /** 👣 발자취 — 번호는 위 지도에서 붙인다 (세는 곳 하나) */
    /**
     * 🔢 **콜 번호 — 세는 곳은 여기 하나다** (기사님 확정 색표 이식 · 2026-09-05).
     *
     * 🔴 **색과 번호가 같은 자리를 센다.** 갈리면 «색 = 번호»가 깨지고, 색만 보고
     *    1~2초에 누르는 화면에서 그것이 가장 큰 사고다 (규칙 ⑤-3).
     * ⚠️ 목록에 없는 콜은 `0` 이 아니라 **`null`** 이다 — 지어내지 않는다 (규칙 ④).
     */
    const { theme } = useTheme();          // 🎨 콜 색은 테마를 탄다 (callPalette 한 벌)
    const callNoOf = useMemo(() => {
        const at = new Map(cycleDeck.map((r, i) => [r.id, i + 1] as const));
        return (orderId: string): number | null => at.get(orderId) ?? null;
    }, [cycleDeck]);

    const visitedTrailNumbered = useMemo(
        () => visitedTrail.map(v => ({
            ...v, no: stopNoOf.get(`${v.orderId}:${v.type === '상차' ? 'pickup' : 'dropoff'}`) ?? 0,
            /* 🌈 다녀온 곳도 **같은 색**이라야 «저게 몇 번 콜이었나»가 이어진다 */
            callNo: callNoOf(v.orderId) ?? undefined,
        })),
        [visitedTrail, stopNoOf, callNoOf]);

    /**
     * 🎨 **콜 색 — 사이클 안에서 콜마다 고유 색 하나** (기사님 확정 ②).
     *    지도 마커 테두리·덱 카드 점이 같은 색을 봐서 «③이 몇 번 콜이었나»가 색으로 읽힌다.
     */
    const callColors = useMemo(() =>
        /**
         * 🔴 **색표는 `callPalette` 한 벌이다** (기사님 확정 2026-09-11).
         *    예전엔 여기 7색 배열이 따로 있어서 **같은 콜이 지도에선 파랑, 목록에선 빨강**이었다.
         *    이제 마커·박스·선이 **같은 콜 번호에서 같은 색상**을 본다 («색 = 콜 번호»).
         * 🔴 **자리(i)가 아니라 «몇 번 콜인가»(callNoOf)로 칠한다** — 목록 자리로 칠하면
         *    콜이 하나 끝나 빠질 때 남은 콜들의 색이 통째로 밀린다 (규칙 ⑤-3).
         */
        // 🔴 덱에 있는 콜이므로 번호는 반드시 있다 — 그래도 없으면 1번 색으로 (지어내지 않되 안 죽는다)
        new Map(cycleDeck.map(r => [r.id, callLineColor(callNoOf(r.id) ?? 1, theme)] as const)),
        [cycleDeck, callNoOf, theme]);

    /**
     * 🗺️ 지도에 그릴 점 — **번호를 실어서** 보낸다. 캔버스가 «남은 목록의 몇 번째»로
     *    스스로 세면 이름표와 다른 답을 한다 (2026-09-01 실측: 이름표 «1. 곤지암읍» ·
     *    마커 «2 곤지암읍»). 세는 곳은 stopNoOf 하나다 (규칙 ③).
     */
    const unifiedRoutePoints: RoutePoint[] = useMemo(
        () => routePointsRaw.map(p => ({
            ...p, no: p.routeId
                ? stopNoOf.get(`${p.routeId}:${p.type === '상차' ? 'pickup' : 'dropoff'}`)
                : undefined,
            /**
             * 🌈 **몇 번 콜인가** — 색상(hue)이 이걸로 정해진다 (09-04 색표).
             * 🔴 정거장 번호(`no`)와 **다른 값**이다 — 콜 하나가 정거장 둘을 갖는다.
             * ⚠️ 안 실으면 캔버스가 조용히 옛 문법(상차 초록·하차 로즈)으로 떨어진다.
             */
            callNo: p.routeId ? callNoOf(p.routeId) ?? undefined : undefined,
            /* 👣 남은 목록에 있으니 «아직»이다 — 다녀온 것은 발자취로 넘어간다 */
            visited: false,
        })),
        [routePointsRaw, stopNoOf, callNoOf]);

    /** 콜별 상·하차 번호 — 화면(요약줄·카드·지도)이 전부 이 하나를 읽는다 (규칙 ③) */
    const visitOrderMap = useMemo(() => {
        const m = new Map<string, { pickupIdx: number; dropoffIdx: number }>();
        for (const [k, no] of stopNoOf) {
            const [orderId, stopType] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)];
            const cur = m.get(orderId) ?? { pickupIdx: 0, dropoffIdx: 0 };
            if (stopType === 'pickup') cur.pickupIdx = no; else cur.dropoffIdx = no;
            m.set(orderId, cur);
        }
        return m;
    }, [stopNoOf]);

    /**
     * 📡 **여유와 번호를 로그로 남긴다** (기사님 지시 2026-09-01 — *"눈으로 확인하지 말고
     *    로그로 확인하자"*). 관제웹 로그는 서버로 중계되므로, 판이 끝난 뒤 GPS 궤적과
     *    맞대 «그때 여유가 얼마였나 · 번호가 흔들렸나»를 사후에 셀 수 있다.
     *    `logStateChange` 는 **값이 바뀔 때만** 찍는다 — 초당 재그림에도 로그가 안 밀린다.
     */
    useEffect(() => {
        const b = minRouteBuffer(routeTimeline);
        if (!b) { logStateChange("여유", "없음", "진행중경로"); return; }
        const o = liveRoute.find(r => r.id === b.orderId);
        const name = o ? getAddressLabel(b.stopType === 'pickup' ? o.pickup : o.dropoff) : b.orderId.slice(-6);
        logStateChange("여유",
            `${b.minutes >= 0 ? '+' : ''}${b.minutes}분 · ${name} ${b.stopType === 'pickup' ? '상차' : '하차'}` +
            `${b.firm ? ' (확정)' : ' (추정)'}`, "진행중경로");
    }, [routeTimeline, liveRoute]);

    /**
     * 🔬 **계측 — 번호가 «어느 목록»에서 왔는지 함께 찍는다** (2026-09-12).
     *
     * ── 왜 ──
     * 번호는 **두 목록을 이어 붙인 것**이다 (다녀온 것 → 남은 것). 그런데 로그가
     * 완성된 문자열 하나만 남겨서, 흔들릴 때 **어느 쪽이 흔들렸는지 못 가렸다.**
     * 오늘 로그에서 두 모양이 나왔는데 둘 다 원인을 못 짚었다:
     *
     *   부팅 직후 0.1초   `사음동상 4↔5 관고동하`  — 둘 다 **다녀온** 정거장이다
     *   후보콜 선점 순간  `초월읍상 1→4`           — **다녀온** 정거장이 번호를 잃었다
     *
     * 🔴 뒤엣것은 **이 코드가 스스로 적어 둔 약속을 깬 것**이다 —
     *    *"다녀온 것: 한 번 받은 번호가 그대로 남는다"* (위 `stopNoOf` 머리).
     *    그러니 «흔들렸다»가 아니라 «어겼다»이고, 어긴 자리를 찍어야 고칠 수 있다.
     *
     * 🟢 **✓ 와 도착 시각을 함께 적는다.** 그러면 한 줄로 셋이 갈린다:
     *    · ✓ 무리의 **순서만** 바뀌었다      → 발자취 정렬(`visitedTrail`)이 흔들렸다
     *    · ✓ 인데 **시각없음** 이 찍혔다     → 도착 시각이 늦게 도착해 맨 뒤로 갔다
     *    · ✓ **가 사라졌다**(`✓1… → 4…`)   → `hasVisitedStop` 이 거짓이 됐다 (아래 `[다녀옴]`)
     *
     * ⚠️ 계측이다. 원인이 확정되면 지우거나 정식 로그로 승격한다 (`logRouteStops` 와 같은 규약).
     */
    useEffect(() => {
        if (stopNoOf.size === 0) return;
        const keyOf = (orderId: string, kind: '상차' | '하차') =>
            `${orderId}:${kind === '상차' ? 'pickup' : 'dropoff'}`;
        /* 🕐 «다녀온 것»의 정렬 열쇠 — 이 값이 `null` 이면 맨 뒤로 간다 (0831 결정) */
        const visitedAt = new Map(visitedTrail.map(v => [keyOf(v.orderId, v.type), v.at] as const));
        const nameOf = (k: string) => {
            const [id, kind] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)];
            const o = cycleDeck.find(r => r.id === id);
            return o ? `${getAddressLabel(kind === 'pickup' ? o.pickup : o.dropoff)}${kind === 'pickup' ? '상' : '하'}` : id.slice(-6);
        };
        logStateChange("번호",
            [...stopNoOf.entries()].sort((a, b) => a[1] - b[1]).map(([k, n]) => {
                if (!visitedAt.has(k)) return `${n}${nameOf(k)}`;
                const at = visitedAt.get(k);
                return `✓${n}${nameOf(k)}(${at == null ? '시각없음' : mmssOf(at)})`;
            }).join(' · '),
            "진행중경로");
    }, [stopNoOf, cycleDeck, visitedTrail]);

    /**
     * 🔬 **계측 — «다녀왔나»의 재료를 그대로 찍는다** (2026-09-12).
     *
     * `hasVisitedStop` 은 둘 중 하나만 참이면 참이다 — `arrivedPickupAt` **또는** 상태.
     * ✓ 가 사라지는 순간 **둘 다 거짓**이 된 것이니, 어느 쪽이 사라졌는지 봐야 한다.
     * 봉투가 둘로 갈라져 오는 판(부팅 직후 두 번 푸시 · 후보콜 선점)에서 한쪽이 늦게
     * 오는 것을 의심하고 있다 — 그 가설을 이 줄이 증명하거나 기각한다.
     *
     *   📡 [다녀옴] 1cd50b PICKED_UP 상05:49 하— · 00d261 SECURED 상— 하—
     *
     * ⚠️ **값이 바뀔 때만** 찍는다 (`logStateChange`) — 초당 재그림에 로그가 안 밀린다.
     */
    /**
     * 🔬 **계측 — 「그릴 재료가 있나」** (기사님 실측 2026-09-12 밤: *"새로고침하고 나면
     *    경로가 사라져 있어"*).
     *
     * 🔴 **홀더를 둘로 갈라 적는다.** 지도가 그리는 값은 `drawHolder = routeHolder ??
     *    previewHolder` 다. 하나만 적으면 **어느 쪽으로 그렸는지 못 가른다** — 그리고 그
     *    둘이 갈라진 이유가 바로 이 사고 계열이다(심사 중 30초 · 서버 재기동 · `helpers.ts`
     *    의 «`sectionDriveMin` 칸이 없다» 주석).
     * 🔴 **자취 점 수를 같은 줄에 적는다** (기사님: *"카카오라인과 내 궤적이 같이 있어야
     *    얼마나 잘못갔는지 확인할 수 있을 것 같아"*). 어느 쪽이 없는지 한 줄로 보인다 —
     *    카카오는 있는데 자취가 0 이면 **새로고침에 자취만 날아간 것**이다(메모리 전용).
     * ⚠️ `routeComputedAt` 은 **안 적는다** — 그리기 판단에 안 쓰인다(캔버스에 그 낱말이
     *    없고, 조건은 레이어·궤적 유무·좌표 성함 셋뿐이다). 적으면 없는 인과를 좇게 된다.
     *    ⚠️ 그 값이 진행 중 콜에 저장되지 않는 것은 **별건으로 진짜 결함**이다(예상 시각이
     *       폴백으로 돈다) — 서버가 고치는 중이다.
     * ⚠️ 계측이다. 원인이 확정되면 지우거나 정식 로그로 승격한다.
     */
    useEffect(() => {
        const kind = routeHolder ? '확정' : previewHolder ? '미리보기' : '없음';
        const pts = drawHolder?.routePolyline?.length ?? 0;
        const trailPts = drivenTrail.reduce((n, seg) => n + seg.length, 0);
        logStateChange("경로재료",
            `홀더 ${kind}${drawHolder ? ` ${drawHolder.id.slice(-6)}` : ''}` +
            ` · 카카오 ${pts}점 · 자취 ${drivenTrail.length}구간 ${trailPts}점` +
            ` · 진행중 ${liveRoute.length}건`,
            "진행중경로");
    }, [drawHolder, routeHolder, previewHolder, drivenTrail, liveRoute.length]);

    useEffect(() => {
        if (cycleDeck.length === 0) return;
        logStateChange("다녀옴",
            cycleDeck.map(r =>
                `${r.id.slice(-6)} ${(r.status ?? '없음').replace('ORDER_', '')} ` +
                `상${r.arrivedPickupAt ? mmssOf(Date.parse(r.arrivedPickupAt)) : '—'} ` +
                `하${r.arrivedDropoffAt ? mmssOf(Date.parse(r.arrivedDropoffAt)) : '—'}`
            ).join(' · '),
            "진행중경로");
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
        stepRecords, liveRoute, cycleDeck, activePolyline, routeHolder,
        /**
         * 🟡 **지도가 그릴 홀더** — KEEP 된 콜이 우선, 없으면 심사 중인 콜 (2026-09-06).
         * `routeHolder`(타임라인용)와 갈라 둔다: 심사 중 30초와 재기동 직후에는
         * 주행분이 없어 `routeHolder` 가 비는데, **그릴 궤적은 있다.**
         * 캔버스는 이 값으로 «미리보기(노란 점선)»인지도 판정한다.
         */
        drawHolder, isDriving, mockStops,
        currentGps, gpsSource, myLocation, safeRoute, allEvaluating, judging, gpsFocus,
        routeTimeline, unifiedRoutePoints, etaMap, visitOrderMap, chronologicalIds, callColors, callNoOf, drivenTrail, stopNoOf,
        visitedTrail: visitedTrailNumbered,
    };
}
