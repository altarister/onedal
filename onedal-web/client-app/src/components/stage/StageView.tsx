import { useState, useEffect, useRef } from 'react';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import { hasVisitedStop } from '@onedal/shared';
import { useRouteDerivations } from '../../hooks/useRouteDerivations';
import { getAddressLabel, getDistanceKm } from '../../lib/routeUtils';
import PinnedRouteCanvas from '../dashboard/PinnedRouteCanvas';
import StageSheet, { type SheetSnap } from './StageSheet';
import { PinnedRouteBody } from '../dashboard/PinnedRoute';
import { MovingBadge, useDriveMotion } from '../dashboard/VehicleStatusPanel';
import { useGpsFocusStore } from '../../stores/gpsFocusStore';
import { useFilterConfig } from '../../hooks/useFilterConfig';
import { logRoadmapEvent, logStateChange } from '../../lib/roadmapLogger';
import { socket } from '../../lib/socket';

/**
 * 🎭 **무대 — 지도 배경 + 3단 시트** (화면개편 2단계 · v23/v24 · 기사님 확정 2026-08-31).
 *
 * «새 화면 미리보기» 토글이 켜졌을 때만 그려진다 — 꺼진 동안 옛 화면(PinnedRoute 단독)이
 * 그대로다. 파생은 여기서 제조소를 **한 번만** 부르고, 시트 내용물(PinnedRoute sheetOnly)
 * 에 넘긴다 — 훅 두 번 = 구독·상태 두 벌이라 금지.
 *
 * 3단계(useStageRules)에서 snap 이 자동으로 움직이고, 4단계에서 S4~S7 이 연결된다.
 */
interface Props {
    activeRoute: SecuredOrder[];
    routeStops: RouteStopInfo[];
    routeComputedAt: string | null;
    /** 🧭 경로를 든 콜 — 서버가 고른 답 (0831) */
    routeHolderId?: string | null;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    onRecalculate?: (id: string, priority: string) => void;
    viewFilter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL';
    setViewFilter: (f: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL') => void;
}

export default function StageView(props: Props) {
    const { activeRoute, routeStops, routeComputedAt, routeHolderId } = props;
    const derived = useRouteDerivations(activeRoute, routeStops, routeComputedAt, routeHolderId);
    const { liveRoute, unifiedRoutePoints, myLocation, visitOrderMap } = derived;
    const [snap, setSnap] = useState<SheetSnap>('half');
    const { filter, updateFilter } = useFilterConfig();


    /**
     * 🧠 상태 규칙 (v23 Ⅲ표 · 3단계) — 자동은 시트 높이만 바꾼다 (표시 전용이라 안전).
     * 손(드래그)이 이긴다 — 터치 후 30초 유예 (v23 Ⅳ).
     */
    const drive = useDriveMotion();
    /** 🖐️ 손(드래그)이 이기는 유예 — 모든 자동 전환을 30초 막는다 (v23 Ⅳ) */
    const userHoldUntil = useRef(0);
    /**
     * 🪜 **자동으로 올린 시트(KEEP·도착)는 «정차»에는 이기고 «주행»에는 진다**
     *    (기사님 실측 2026-08-31 3판).
     *
     * 예전엔 KEEP·도착도 손과 같은 30초 유예를 썼다. 그런데 정거장이 가까우면 구간이
     * 30초보다 짧아 **유예가 다음 구간을 통째로 덮었다** — 로그 그대로다:
     *   17:56:29 KEEP(full) · 17:56:31 주행 감지 · **17:56:59 에야 내려감**(유예 만료)
     * 기사님이 *"너무 가까워서 이동 중이라도 시트가 올라와 있었다"* 고 보신 게 이것이다.
     *
     * 유예로 막으려던 것은 **10초 뒤 오는 «정차» 전환**이지 주행이 아니었다. 그래서
     * 시간이 아니라 **무엇에 지는가**로 가른다 — 달리기 시작하면 즉시 내려간다.
     */
    const autoRaised = useRef(false);
    const judging = derived.judging;

    /**
     * 📡 **시트 전환은 전부 사유와 함께 로그로 남긴다** (기사님 지시 0831 2판).
     *    서버 로그에 중계되므로(관제웹 로그 릴레이) GPS 궤적(gps_tracks)과 시각을
     *    맞대 «언제 내려가고 올라왔어야 했나»를 사후 검증할 수 있다.
     */
    const snapTo = (next: SheetSnap, reason: string) => {
        logStateChange("시트", `${next}·${reason}`, "무대");
        setSnap(next);
    };
    useEffect(() => { logStateChange("주행신호", drive, "무대"); }, [drive]);

    /**
     * 🔁 유예 중 온 전환은 버리지 않고 **유예가 끝나면 다시 평가한다** (0831 3판).
     *    예전엔 유예에 걸린 전환이 그냥 사라져서 — 도착 유예 중 출발(주행 신호)이
     *    오면 시트가 전체에 눌러앉았다. 열었다 닫혔다가 «작동»하려면 이 되새김이 필요하다.
     */
    const [ruleTick, setRuleTick] = useState(0);
    useEffect(() => {
        const wait = userHoldUntil.current - Date.now();
        if (wait > 0) {
            const t = setTimeout(() => setRuleTick(x => x + 1), wait + 200);
            return () => clearTimeout(t);
        }
        if (judging) { autoRaised.current = false; snapTo('peek', '판정중'); return; }   // S4
        if (drive === 'drive') {                                    // S3 — 주행: 지도 주인공
            autoRaised.current = false;                             //   달리면 마중은 끝난다
            snapTo('peek', '주행');
            return;
        }
        if (autoRaised.current) return;              // 🪜 KEEP·도착으로 올라간 시트 — 정차가 못 끌어내린다
        if (liveRoute.length > 0) snapTo('half', '정차');           // S2 — 정차: 콜 목록
        else snapTo('peek', '콜없음');                              // S1
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drive, judging ? judging.id : null, liveRoute.length, ruleTick]);

    /**
     * 📞 S5 — KEEP 직후: 시트 전체 + 그 콜 포커스 (킵 직후 바로 통화 원칙).
     * 포커스 전달은 기존 근접 포커스와 같은 그릇(gpsFocusStore) — 덱이 이미 읽는다.
     */
    useEffect(() => {
        const onConfirmed = (orderId: string) => {
            useGpsFocusStore.setState({ gpsFocus: { orderId, tick: Date.now(), kind: 'arrive' } });
            autoRaised.current = true;   // 통화하는 동안 정차 전환이 못 끌어내린다 (주행에는 진다)
            snapTo('full', 'KEEP');
        };
        socket.on('order-confirmed', onConfirmed);
        return () => { socket.off('order-confirmed', onConfirmed); };
    }, []);

    /**
     * 🏁 S7 — 정거장 도착: 시트 전체로 마중 (v23 Ⅲ · 신고 시트가 기다린다).
     * 예고(approach)는 덱 카드만 따라간다 — 주행 중 시트가 지도를 가리면 안 된다 (S3).
     */
    const gpsFocus = derived.gpsFocus;
    useEffect(() => {
        if (!gpsFocus || gpsFocus.kind !== 'arrive') return;
        if (Date.now() < userHoldUntil.current) return;   // 손이 이긴다
        autoRaised.current = true;   // 신고하는 동안 정차 전환이 못 끌어내린다 (달리면 내려간다)
        snapTo('full', '도착');
        /**
         * 🪜 **마중은 «그 콜의 지금 단계»를 보여 주는 것까지다** (기사님 수순 ⑥ · 2026-08-31).
         *    덱은 이미 그 콜로 옮겨 간다(gpsFocus). 남은 것은 시트 안 스크롤 — 지난 판에서
         *    시트만 올라오고 내용이 아래에 남아 있으면 결국 손으로 찾아야 했다.
         *    단계 블록은 카드 안에서 늘 열려 있으므로 맨 위로 올리면 덱·단계가 함께 보인다.
         */
        requestAnimationFrame(() => {
            const sc = document.querySelector('[data-sheet-scroll]') as HTMLElement | null;
            if (sc) sc.scrollTop = 0;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gpsFocus?.tick]);

    /**
     * 🚀 **국면이 «운행 중»으로 바뀌면 시트를 내린다** (기사님 수순 ④ · 2026-08-31).
     *    버튼을 눌렀을 때는 위에서 이미 내렸고, 이 줄은 **라이브에서 이동이 감지되어
     *    서버가 국면을 바꿨을 때**를 받는다 — 손을 안 대도 같은 수순이 된다.
     */
    const phase = filter?.dispatchPhase;
    useEffect(() => {
        if (phase !== 'DELIVERING') return;
        if (Date.now() < userHoldUntil.current) return;
        autoRaised.current = false;
        snapTo('peek', '운행 시작');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    /* 🗺️ 다음 정거장 이름표 재료 — 서버 경로 순서(routeStops)에서 첫 미방문 (v22 S3) */
    const next = (() => {
        const idx = routeStops.findIndex(st => {
            const o = liveRoute.find(r => r.id === st.orderId);
            return !!o && !hasVisitedStop(o, st.stopType);
        });
        if (idx < 0) return null;
        const st = routeStops[idx];
        const o = liveRoute.find(r => r.id === st.orderId)!;
        const callNo = liveRoute.findIndex(r => r.id === st.orderId) + 1;
        return {
            idx, total: routeStops.length, orderId: st.orderId,
            x: st.stopType === 'pickup' ? o.pickupX : o.dropoffX,
            y: st.stopType === 'pickup' ? o.pickupY : o.dropoffY,
            name: getAddressLabel(st.stopType === 'pickup' ? o.pickup : o.dropoff),
            stopLabel: st.stopType === 'pickup' ? '상차' : '하차',
            callNo, driveMinutes: st.driveMinutes,
            visitNo: (() => { const vo = visitOrderMap.get(st.orderId) as { pickupIdx?: number; dropoffIdx?: number } | number | undefined;
                if (typeof vo === 'number') return vo;
                return (st.stopType === 'pickup' ? vo?.pickupIdx : vo?.dropoffIdx) ?? idx + 1; })(),
        };
    })();

    /**
     * 🎬 자막 줄 (v23 엿보기 줄 · 기사님 확정 ③) — «✅2 초월 → 3 곤지암 이동 중 · ~20km 남음».
     *    거리는 GPS→다음 정거장 직선이라 ~ 를 붙인다 (규칙 ⑤-2 — 추정은 추정이라 말한다).
     */
    const lastVisited = derived.visitedTrail.length > 0
        ? derived.visitedTrail[derived.visitedTrail.length - 1] : null;
    const peekBar = (() => {
        if (liveRoute.length === 0) return '진행 중인 경로 없음 · 새 콜 대기';
        if (!next) return '이번 사이클 정거장을 모두 지났습니다';
        const from = lastVisited ? `✅${lastVisited.no} ${lastVisited.name}` : '출발지';
        const dist = (myLocation && next.x != null && next.y != null)
            ? getDistanceKm(myLocation.y, myLocation.x, next.y, next.x) : null;
        return `${from} → ${next.visitNo} ${next.name} ${drive === 'drive' ? '이동 중' : '대기 중'}`
            + (dist != null ? ` · ~${dist < 10 ? dist.toFixed(1) : Math.round(dist)}km 남음` : '');
    })();

    /**
     * 🧭 **달리는 중에는 덱도 «향해가는 콜»을 본다** (기사님 실측 2026-08-31 4판).
     *
     * 기사님: *"신둔면에서 사음동 간다고 되어 있는데 펼쳐져 있는 건 초월-신둔면이야."*
     * 자막 줄·지도 이름표는 다음 정거장(사음동)을 가리키는데 **덱만 방금 끝낸 콜**을
     * 들고 있었다 — 도착 마중이 잡아 둔 포커스가 그대로 남아서다.
     *
     * 서버의 근접 예고(3km)가 오면 옮겨 가긴 한다. 그런데 **다음 정거장이 3km 밖이면
     * 그 구간 내내** 끝난 콜을 보게 된다 (이번 판은 2.9km 라 4초 뒤에 옮겨 갔다).
     * 정차 중엔 방금 도착한 콜이 맞고, **달리기 시작하면 향해가는 콜**이 맞다.
     *
     * 🔴 시트는 건드리지 않는다 — `kind: 'approach'` 는 덱만 옮긴다 (주행 중 지도가 주인공).
     */
    useEffect(() => {
        if (drive !== 'drive' || !next) return;
        if (Date.now() < userHoldUntil.current) return;   // 손이 이긴다
        useGpsFocusStore.setState({ gpsFocus: { orderId: next.orderId, tick: Date.now(), kind: 'approach' } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drive, next?.orderId]);

    /** 🖐️ 마커 탭 → 그 콜 카드 (S6 문법 — 지나온 곳도 확인·수정) */
    const focusCall = (orderId: string) => {
        useGpsFocusStore.setState({ gpsFocus: { orderId, tick: Date.now(), kind: 'arrive' } });
        userHoldUntil.current = Date.now() + 30_000;   // 손짓이다 — 30초는 아무것도 못 바꾼다
        snapTo('full', '탭');
    };

    return (
                // 📏 높이는 실측하지 않는다 — 부모(flex 사슬)가 준다. 실측(rect.top)은 페이지 스크롤과
        //    되먹임을 만들어 «로딩 후 상단이 밀려 숨는» 사고를 냈다 (기사님 실측 0831)
        <section id="stage-view" className="relative flex-1 min-h-0">
            {/* 지도 배경 — 캔버스 재사용 (배경 어댑터 자리: 훗날 카카오 타일 실험) */}
            <div className="absolute inset-0">
                <PinnedRouteCanvas
                    fill
                    unifiedRoutePoints={unifiedRoutePoints}
                    liveRoute={liveRoute}
                    myLocation={myLocation}
                    visitedTrail={derived.visitedTrail}
                    drivenTrail={derived.drivenTrail}
                    routeHolder={derived.routeHolder}
                    callColors={derived.callColors}
                    onStopTap={focusCall}
                >
                    {/* 🏷️ 다음 정거장 이름표 — «어느 콜의 어떤 단계» (v22 S3 · 탭 동선은 4단계에서) */}
                    {next && (
                        <div className="absolute left-3 top-3 z-10 rounded-xl border px-3 py-2 tabular-nums cursor-pointer active:scale-95 transition-transform"
                             onClick={() => focusCall(next.orderId) /* S6 — 그 콜·그 단계로 */}
                             style={{ background: 'color-mix(in srgb, var(--color-surface) 92%, transparent)', borderColor: '#4f8df9', backdropFilter: 'blur(3px)' }}>
                            <div className="text-[14px] font-black" style={{ color: '#9db9ff' }}>
                                {next.visitNo}. {next.name}{next.driveMinutes != null ? ` · ~${next.driveMinutes}분` : ''}
                            </div>
                            <div className="text-[11px] font-bold text-text-muted flex items-center gap-2">
                                {next.callNo}번 콜 · {next.stopLabel} · {next.idx + 1}/{next.total} 정거장 <MovingBadge />
                            </div>
                        </div>
                    )}
                    {/* 🚀 지금 출발 — 옛 지도와 같은 자리·같은 동작 (짐 있고 출발 전일 때만) */}
                    {filter && filter.dispatchPhase !== 'DELIVERING' && liveRoute.length > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                logRoadmapEvent("웹", "무대 지도 🚀 지금 출발 클릭 → 운행 중 국면");
                                updateFilter({ driverAction: 'DRIVING' });
                                /**
                                 * 🚀 **출발을 누르면 시트가 내려간다** (기사님 수순 확정 2026-08-31).
                                 *    누르는 순간이 «이제 달린다»는 의사 표현이다 — 주행 감지(10초)를
                                 *    기다리면 그 사이 시트가 지도를 가린다. 손이 이긴다(유예 30초)는
                                 *    규칙 위에서, 이 손짓만은 내리는 쪽으로 쓴다.
                                 */
                                autoRaised.current = false;   // 달릴 참이다 — 마중은 끝난다
                                snapTo('peek', '출발');
                            }}
                            className="absolute left-3 bottom-20 z-10 rounded-xl px-4 py-2.5 text-[14px] font-black text-white active:scale-95 transition-transform"
                            style={{ background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)', boxShadow: '0 6px 18px rgba(79,141,249,.4)' }}>
                            🚀 지금 출발
                        </button>
                    )}
                </PinnedRouteCanvas>
            </div>

            {/* 3단 시트 — 내용물은 기존 콜 화면 그대로 (sheetOnly) */}
            <StageSheet snap={snap} onSnapChange={(s) => snapTo(s, '손')} peekBar={peekBar} onUserDrag={() => { userHoldUntil.current = Date.now() + 30_000; autoRaised.current = false; }}>
                <PinnedRouteBody {...props} sheetOnly d={derived} />
            </StageSheet>
        </section>
    );
}
