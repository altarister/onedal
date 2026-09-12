import { useState, useEffect, useRef } from 'react';
import { useFilterStore } from '../../stores/filterStore';
import type { SecuredOrder, RouteStopInfo } from '@onedal/shared';
import { hasVisitedStop, effectiveRadii } from '@onedal/shared';
import { useRouteDerivations } from '../../hooks/useRouteDerivations';
import { getAddressLabel } from '../../lib/routeUtils';
import PinnedRouteCanvas from '../dashboard/PinnedRouteCanvas';
import StageSheet, { type SheetSnap } from './StageSheet';
import { stageStep, initialStageMemory, type StageEvent } from './stageRules';
/* 🪟 높이와 «열린 것»을 함께 정하는 규칙 — 한 곳에만 산다 (규칙 ③) */
import { sheetTransition } from './sheetTransition';
/* 🎬 상태바 문구는 여기 한 곳이 정한다 — 화면은 그리기만 한다 (규칙 ③) */
import { sheetStatus } from '../../lib/sheetStatus';
import { callNodeFill, callNodeText } from '../../styles/callPalette';
import { useTheme } from '../../contexts/ThemeContext';
import { PinnedRouteBody } from '../dashboard/PinnedRoute';
import { useDriveMotion } from '../dashboard/VehicleStatusPanel';
import { useGpsFocusStore } from '../../stores/gpsFocusStore';
import { useFilterConfig } from '../../hooks/useFilterConfig';
import { useCallNet } from '../../hooks/useCallNet';
import { logRoadmapEvent, logStateChange } from '../../lib/roadmapLogger';
import { socket } from '../../lib/socket';
/* 🗺️ 지도 아래 두 귀퉁이 — 규칙과 이름은 한 곳에서 온다 (규칙 ③) */
import { ROUTE_PRIORITIES, isPriorityLocked } from '../../lib/routePriority';
import NaviQr from '../dashboard/NaviQr';
import JudgmentSeat from '../dashboard/JudgmentSeat';

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
    /** 🟡 심사 중인 콜의 미리보기 궤적 홀더 (2026-09-06) */
    previewRouteHolderId?: string | null;
    onDecision?: (id: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE') => void;
    onRecalculate?: (id: string, priority: string) => void;
    viewFilter: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL';
    setViewFilter: (f: 'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL') => void;
    /**
     * 🛣️ **노선 ↔ 🔷 동선 — 기사님이 고르는 그물 모양** (명세 §5).
     *
     * 🔴 **부모(`Dashboard`)가 쥔다** — 고르는 버튼은 **필터**에 있고 그리는 것은 **지도**라,
     *    한쪽이 제 상태를 들면 «필터는 동선인데 지도는 노선»이 된다 (규칙 ③).
     *    (기사님 지시 2026-09-11: *"노선 동선 버튼도 지도에서 필터로 이사와야해"*)
     */
    routeMode: boolean;
}

export default function StageView(props: Props) {
    const { activeRoute, routeStops, routeComputedAt, routeHolderId, previewRouteHolderId, routeMode } = props;
    const derived = useRouteDerivations(activeRoute, routeStops, routeComputedAt, routeHolderId, previewRouteHolderId);
    const { liveRoute, cycleDeck, unifiedRoutePoints, myLocation, visitOrderMap } = derived;
    const [snap, setSnap] = useState<SheetSnap>('list');
    /**
     * 🗺️ **시트가 아래를 몇 px 덮고 있나** — 시트가 재서 알려 준다 (2026-09-05).
     *    지도는 «시트»를 모르고 이 숫자만 받는다 — 부품끼리 얽히지 않게 (규칙 ③).
     */
    const [sheetPx, setSheetPx] = useState(0);
    /** 🧭 QR 덮개 — «눌러서 크게» (기사님 확정 2026-09-05 · 작게 늘 띄우면 못 찍힌다) */
    const [qrOpen, setQrOpen] = useState(false);
    /** 🪧 결재 처리 중인 콜 — 두 번 눌리는 것을 막는다 (판정석이 스스로 재우지 않는다) */
    const [seatProcessingId, setSeatProcessingId] = useState<string | null>(null);
    /* 🎨 상태바 동그라미가 지도·목록과 같은 색을 쓴다 */
    const { theme } = useTheme();
    /**
     * 🪗 **열린 줄** — `-1` 은 «전부 닫힘»이다.
     * 🔴 콜이 없으면 열 것도 없다. 있으면 처음엔 «다음 갈 콜»을 연다 (S3).
     */
    /**
     * 🔴 **처음은 «전부 닫힘»(-1)이다** — 「나」의 정의가 그것이다
     *    (*"목록만큼 보일 때는 콜의 아코디언 제목만 보인다"* · L4).
     * ⚠️ `0` 으로 두면 **「나」인데 하나가 열려** 남는 자리가 없어 그 카드가
     *    높이 19px 로 찌부러진다 (2026-09-05 실측). 여는 것은 「다」의 일이다.
     */
    const [openIdx, setOpenIdx] = useState<number>(-1);
    /** 📞 방금 KEEP 한 콜 — 시트가 「다」로 올라갈 때 **그 콜을 연다** (2026-09-06) */
    const keepFocusRef = useRef<string | null>(null);
    const NAVI_KEY = import.meta.env.VITE_KAKAO_JS_KEY as string | undefined;
    const NAVI_ORIGIN = (import.meta.env.VITE_KAKAO_JS_ORIGIN as string | undefined)
        ?? 'https://1dal.altari.com';
    /**
     * 🧭 **이번에 건넬 정거장** — 다음 하나와 그 앞의 경유지들.
     * 🔴 카카오내비가 경유지를 **3개까지** 받는다 — 그래서 넷을 넘겨 자르지 않는다
     *    (`buildKakaoNaviUrl` 이 규격을 안다 · 규칙 ③).
     * ⚠️ 좌표가 없는 정거장은 **빼지 않고 멈춘다** — 지어내면 엉뚱한 데로 안내한다 (규칙 ④).
     */
    const qrSlice = derived.unifiedRoutePoints.slice(0, 4);
    const toNaviStop = (p: { name: string; x?: number; y?: number; type?: string }) =>
        (typeof p?.x === 'number' && typeof p?.y === 'number')
            ? { name: `${p.name}${p.type ? ` ${p.type}` : ''}`, x: p.x, y: p.y } : null;
    const qrStop = qrSlice.length ? toNaviStop(qrSlice[qrSlice.length - 1]) : null;
    const qrVia = qrSlice.slice(0, -1).map(toNaviStop)
        .filter(Boolean) as { name: string; x: number; y: number }[];
    const { filter, updateFilter } = useFilterConfig();
    /**
     * 🕸️ **지금 필터가 무엇을 담고 있나** — 지도에 그물로 그린다 (이식 B3-2).
     *    계산은 실험실과 **같은 함수**(`@onedal/shared` 의 `netForGoal`)다 — 두 화면이
     *    다른 답을 내면 «화면은 든다는데 판정은 탈락»이 된다 (규칙 ③).
     */
    /**
     * 📐 **마름모 모양** — 기사님이 필터에서 고친 값 (이식 C3-2 · 2026-09-11).
     *
     * 🔴 **국면 그릇을 안 본다.** 그물의 모양은 국면과 무관한 **한 벌**이라 평면 필터에
     *    실려 온다 (명세 §3 · DB 자리는 `user_filters`). 아침(C3-1)에는 국면 행에 두고
     *    «첫짐에서 상속»으로 가렸는데, 다섯 행에 값이 계속 써지는 구조가 남아
     *    **합짐 행에는 손 안 댄 110° 가 앉아 있었다** — 화면은 「첫짐에서 120°」라고 적으면서.
     */
    /**
     * 📐 **자동이면 «줄인 값»으로 그린다** (이식 C4-12 · 2026-09-12).
     *
     * 🔴 **곱하는 자리를 만들지 않는다** — `shared` 의 `effectiveRadii` 하나가 답한다.
     *    필터 화면도 같은 함수를 부른다. 2026-09-12 실측에서 **서버는 줄였는데 지도는
     *    안 줄어** 요약줄이 164동 그대로였다 — 곱셈이 두 곳이 되려던 순간이었다 (규칙 ③).
     */
    const radii = effectiveRadii(filter);
    const netShape = { srcAngleDeg: filter?.srcAngleDeg, dstAngleDeg: filter?.dstAngleDeg,
                       quadRadiusKm: radii.quadRadiusKm };
    const callNet = useCallNet({
        shape: netShape,
        routeMode,
        destinationCity: filter?.goalCity ?? filter?.destinationCity,   // 🎯 복귀면 집 시 (조사 ①-1)
        myLocation,
        pickupRadiusKm: radii.pickupRadiusKm,
        destinationRadiusKm: radii.destinationRadiusKm,
        lineRadiusKm: radii.detourRadiusKm,
        /* 🚫 지도도 서버와 **같은 제외 목록**을 본다 — 한쪽만 빼면 화면이 거짓말한다 (이식 C2) */
        excludedRegions: filter?.excludedRegions,
        /* 🏘️ 관내 — 서버가 파생한 값을 그대로 (조사 ①-8) */
        localMode: filter?.localMode,
        routeHolder: derived.drawHolder,
    });


    /**
     * 🧠 **상태 규칙은 `stageRules.stageStep` 한 곳에 있다** (v23 Ⅲ표 · 검사 14건).
     *
     * 여기(화면)는 **신호를 재서 넣고, 결과를 그릴 뿐**이다. 규칙을 화면 안에 두면
     * 검사할 수가 없어서, 2026-08-31 하루에 다섯 번 뒤집는 동안 전부 손으로 확인했다.
     * 규칙을 옮긴 지금은 «짧은 구간에서 안 내려가던 것» 같은 사고가 책상에서 잡힌다.
     */
    const drive = useDriveMotion();
    const mem = useRef(initialStageMemory());
    const judging = derived.judging;

    /**
     * 📡 **시트 전환은 전부 사유와 함께 로그로 남긴다** (기사님 지시 0831 2판).
     *    서버 로그에 중계되므로(관제웹 로그 릴레이) GPS 궤적(gps_tracks)과 시각을
     *    맞대 «언제 내려가고 올라왔어야 했나»를 사후 검증할 수 있다.
     */
    const [ruleTick, setRuleTick] = useState(0);
    const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** 규칙에 한 걸음 먹인다 — 결과(높이·사유·미룸)를 화면에 옮기는 것이 여기 할 일의 전부 */
    const feed = (ev: StageEvent) => {
        const now = Date.now();
        const r = stageStep(mem.current, {
            nowMs: now, calls: liveRoute.length, judging: !!judging, drive,
            /* 🪧 심사가 뜰 때 «올릴까»는 지금 높이에 달렸다 (`snapOnJudging`) */
            snap,
        }, ev);
        mem.current = r.mem;
        if (r.snap) {
            logStateChange("시트", `${r.snap}·${r.reason}`, "무대");
            /**
             * 🔴 **자동 전환도 «높이 규칙» 한 곳을 거친다** (기사님 실물 2026-09-06).
             *
             * 기사님: *"킵하고 나서 전화할 수 있게 시트를 최상단으로 올리고 아코디언에
             * 이번에 킵한 콜 정보를 담아서 열어야 하는데 열려 있지 않았어."*
             *
             * 예전엔 여기가 `setSnap` 만 했다. 아코디언을 여는 계산은 `sheetTransition`
             * 안에 있는데 **손으로 끌 때만 그 길을 탔다** — KEEP·도착으로 자동으로
             * 「다」에 올라가면 **빈 시트가 지도를 덮었다.** S3(「다」는 콜이 있으면 하나
             * 열린 상태)와 S4(가·나로 내려오면 닫는다)가 자동 경로에서만 새고 있었다.
             *
             * `preferIdx` 는 **방금 KEEP 한 콜**이다 — 포커스와 같은 콜을 연다.
             */
            /**
             * 🪜 **사건이 가리킨 콜을 «강한 지시»로 넘긴다** (화면규칙 S13 · 2026-09-12).
             *
             * 🔴 예전엔 **KEEP 만** 실었고 도착은 빈손이었다. 그래서 도착하면 시트는
             *    올라오는데 **열려 있던 딴 콜이 그대로 남았다** — 기사님: *"시트가 올라갔어
             *    근데 그 스텝이 열리지는 않았어"*. v23 Ⅲ-S7 은 **«그 콜의 그 단계»** 다.
             * ⚠️ `preferIdx`(약한 추천)로 넘기면 안 된다 — 열린 것에 밀린다.
             */
            const eventId = ev.type === 'keep' ? keepFocusRef.current
                          : ev.type === 'arrive' ? ev.orderId : null;
            const want = eventId ? cycleDeck.findIndex(o => o.id === eventId) : -1;
            const mv = sheetTransition(r.snap, {
                openIdx, callCount: cycleDeck.length,
                focusIdx: want >= 0 ? want : undefined,
            });
            setSnap(mv.snap);
            setOpenIdx(mv.openIdx);
        }
        /**
         * 🔁 미룬 결정은 **유예가 끝나면 다시 묻는다** — 안 그러면 유예 중에 온 전환이
         *    영영 사라져 시트가 전체에 눌러앉는다 (0831 3판 실측).
         */
        if (r.deferred) {
            if (holdTimer.current) clearTimeout(holdTimer.current);
            holdTimer.current = setTimeout(() => setRuleTick(x => x + 1), (r.mem.userHoldUntil - now) + 200);
        }
        return r;
    };
    /**
     * 🧾 **내가 그린 그물의 수를 요약줄이 읽게 올린다** (이식 C4-11b · 2026-09-12).
     *
     * 기사님 2026-09-12: 요약줄의 «N 읍면동» 을 **지도와 같은 수**로.
     * 🔴 **계산은 여기 한 번뿐이다** — 요약줄이 `useCallNet` 을 또 부르면 `myLocation` 이
     *    달라 다른 답이 나온다 (`filterStore.netCount` 주석 참조 · 규칙 ③).
     * ⚠️ 무대가 사라지면 `null` 로 비운다 — 옛 수가 화면에 남아 거짓말하지 않게.
     */
    const setNetCount = useFilterStore(st => st.setNetCount);
    const setNetUsedLine = useFilterStore(st => st.setNetUsedLine);
    const netCount = callNet?.net.pass.length ?? null;
    const netUsedLine = callNet ? callNet.usedLine : null;
    useEffect(() => {
        setNetCount(netCount);
        setNetUsedLine(netUsedLine);
        return () => { setNetCount(null); setNetUsedLine(null); };
    }, [netCount, netUsedLine, setNetCount, setNetUsedLine]);

    useEffect(() => { logStateChange("주행신호", drive, "무대"); }, [drive]);
    useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current); }, []);

    useEffect(() => { feed({ type: 'signal' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drive, judging ? judging.id : null, liveRoute.length, ruleTick]);

    /**
     * 📞 S5 — KEEP 직후: 시트 전체 + 그 콜 포커스 (킵 직후 바로 통화 원칙).
     * 포커스 전달은 기존 근접 포커스와 같은 그릇(gpsFocusStore) — 덱이 이미 읽는다.
     */
    useEffect(() => {
        const onConfirmed = (orderId: string) => {
            useGpsFocusStore.setState({ gpsFocus: { orderId, tick: Date.now(), kind: 'focus' } });
            keepFocusRef.current = orderId;      // 시트가 열 콜 — feed 가 읽는다
            feed({ type: 'keep' });
        };
        socket.on('order-confirmed', onConfirmed);
        return () => { socket.off('order-confirmed', onConfirmed); };
    }, []);

    /**
     * 🏁 S7 — 정거장 도착: 시트 전체로 마중 (v23 Ⅲ-S7 · 화면규칙 S13).
     *
     * 🔴 **소켓을 여기서 직접 듣지 않는다** (기사님 지시 2026-09-12: *"지금 그걸 각자
     *    하고 있어서 문제 같은데"*). 듣는 곳은 `gpsFocusStore` 하나이고, 이 화면은
     *    그 스토어가 남긴 «방금 도착»(`arrival`)을 **본다.**
     *
     * ⚠️ 2026-08-31 에는 반대로 갔다 — 그때는 포커스 한 칸에 근접·도착이 섞여
     *    **도착이 덮여 사라졌고**(도착 6번 중 시트 2번), 그래서 «소켓을 따로 듣는» 것으로
     *    갈랐다. 그러면 듣는 곳이 둘이 되어 이번엔 «덱이 가리킨 콜»과 «시트가 연 콜»이
     *    갈라졌다. 🟢 **칸을 가르되(`arrival`) 듣는 곳은 하나** — 둘 다 푼다.
     */
    const arrival = useGpsFocusStore(st => st.arrival);
    useEffect(() => {
        if (!arrival) return;
        /* 🪜 «그 콜의 그 단계»를 함께 싣는다 — 시트가 무엇을 열지 알아야 한다 */
        const r = feed({ type: 'arrive', orderId: arrival.orderId, stopType: arrival.stopType });
        if (!r.snap) return;                       // 손 유예 중이면 마중도 미룬다
        /**
         * 🪜 마중은 «그 콜의 지금 단계»를 보여 주는 것까지다 (기사님 수순 ⑥).
         *    단계 블록은 카드 안에서 늘 열려 있으므로 맨 위로 올리면 덱·단계가 함께 보인다.
         */
        requestAnimationFrame(() => {
            const sc = document.querySelector('[data-sheet-scroll]') as HTMLElement | null;
            if (sc) sc.scrollTop = 0;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [arrival?.tick]);

    /**
     * 🚪 **완료 행동이 문을 닫는다** (v23 Ⅳ · 화면규칙 S14 · 기사님 실측 2026-09-12).
     *
     * v23 원문: *"통화 완료·시트 저장 → focus 해제 + **시트 자동 복귀**
     * (뒤로가기를 찾을 일 없음)"*.
     *
     * 🔴 **이 길이 없어서 기사님이 손으로 내리셨다.** 도착 마중으로 시트가 100% 로
     *    올라오는데 닫는 길이 «손»뿐이었고, 그 손이 S11 유예(30초)를 걸어
     *    **다음 도착 마중까지 먹었다** (도착 여섯 중 셋만 마중 · 간격 23초 ↔ 유예 30초).
     *    손은 «내 뜻»이지만 **완료는 일을 마친 것**이라 유예를 걸지 않는다.
     *
     * 🔴 **보내는 곳이 아니라 «받는 곳»에서 잡는다** (규칙 ③) — `report-milestone` 은
     *    스텝 시트 여러 자리에서 나가지만, 서버가 확인해 주는 `milestone-result` 는
     *    한 곳이다. 도착(`auto-arrived`)과 **같은 문법**이다.
     */
    useEffect(() => {
        const onDone = () => { feed({ type: 'done' }); };
        socket.on('milestone-result', onDone);
        return () => { socket.off('milestone-result', onDone); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * 🚀 **국면이 «운행 중»으로 바뀌면 시트를 내린다** (기사님 수순 ④ · 2026-08-31).
     *    버튼을 눌렀을 때는 위에서 이미 내렸고, 이 줄은 **라이브에서 이동이 감지되어
     *    서버가 국면을 바꿨을 때**를 받는다 — 손을 안 대도 같은 수순이 된다.
     */
    const phase = filter?.dispatchPhase;
    useEffect(() => {
        if (phase !== 'DELIVERING') return;
        feed({ type: 'depart' });
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
        /**
         * 🔴 **콜 번호는 색과 같은 것을 센다** (기사님 확정 2026-08-31 · 리뷰에서 잡힘).
         *    예전엔 `liveRoute`(지금 실린 콜)로 셌다. 그런데 콜 색은 `cycleDeck`(이번 사이클,
         *    하차 완료해도 끝까지 남는 목록) 기준이라, **하차를 하나 끝내는 순간 지도의
         *    «N번 콜»만 앞당겨져** 색과 번호가 다른 답을 했다. 색만 보고 1~2초에 누르는
         *    화면에서 그 둘이 어긋나면 안 된다 (규칙 ⑤-3).
         */
        const callNo = cycleDeck.findIndex(r => r.id === st.orderId) + 1;
        return {
            orderId: st.orderId,   // idx·total 은 «N/M 정거장»과 함께 뺐다 (읽는 곳이 없다)
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
    /**
     * 🎬 **시트 상태바** (용어집 확정 2026-09-04) — 읽는 줄. 누르는 부분이 «시트 상태바의 버튼».
     *
     * 🔴 **문구를 여기서 만들지 않는다** (규칙 ③ · 2026-09-05 정정).
     *    `lib/sheetStatus` 가 **요소별로** 돌려준다 — 기호 · 번호 · 지명 · ~분 · 꼬리.
     *    예전엔 이 화면이 자기 문장을 따로 지었고(`⏸️ 정차 중 · 다음 1 초월읍 ~2.3km`),
     *    그 사이 규칙 파일은 **목업과 검사만 쓰고 있었다** — #96·#97 과 같은 병이다.
     * 🔴 거리(km)가 아니라 **주행 분**이다 — 기사님이 읽는 값은 «얼마나 걸리나»다.
     *    직선 km 는 도로를 안 따르므로 이 줄에서 뺐다.
     */
    const bar = sheetStatus({
        idle: liveRoute.length === 0,
        judging: !!judging,
        moving: drive === 'drive',
        next: next ? {
            visitNo: next.visitNo, name: next.name,
            callNo: next.callNo, stop: next.stopLabel as '상차' | '하차',
        } : null,
        driveMinutes: next?.driveMinutes ?? null,
    });

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
        if (Date.now() < mem.current.userHoldUntil) return;   // 손이 이긴다
        useGpsFocusStore.setState({ gpsFocus: { orderId: next.orderId, tick: Date.now(), kind: 'approach' } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drive, next?.orderId]);

    /** 🖐️ 마커 탭 → 그 콜 카드 (S6 문법 — 지나온 곳도 확인·수정) */
    const focusCall = (orderId: string) => {
        useGpsFocusStore.setState({ gpsFocus: { orderId, tick: Date.now(), kind: 'focus' } });
        feed({ type: 'tap' });
    };

    return (
                // 📏 높이는 실측하지 않는다 — 부모(flex 사슬)가 준다. 실측(rect.top)은 페이지 스크롤과
        //    되먹임을 만들어 «로딩 후 상단이 밀려 숨는» 사고를 냈다 (기사님 실측 0831)
        <section id="stage-view" className="relative flex-1 min-h-0">
            {/* 지도 배경 — 캔버스 재사용 (배경 어댑터 자리: 훗날 카카오 타일 실험) */}
            <div className="absolute inset-0">
                <PinnedRouteCanvas
                    fill
                    /* 🪟 시트가 올라온 만큼 지도가 위로 비켜 준다 — 반쯤 열면 둘을 같이 본다 (기사님 0901) */
                    /* 🗺️ 지도는 «시트»를 모른다 — **아래가 얼마나 가려졌나**만 받는다
                       (2026-09-05 · 부품 결합을 끊었다) */
                    occludedPx={sheetPx}
                    unifiedRoutePoints={unifiedRoutePoints}
                    liveRoute={liveRoute}
                    myLocation={myLocation}
                    visitedTrail={derived.visitedTrail}
                    drivenTrail={derived.drivenTrail}
                    routeHolder={derived.drawHolder}
                    callColors={derived.callColors}
                    netOverlay={callNet && {
                        tri: callNet.net.tri, pass: callNet.net.pass, circles: callNet.net.circles,
                        usedLine: callNet.usedLine, lineRadiusKm: radii.detourRadiusKm /* 줄인 값 — 그린 띠와 실제 그물 폭이 같아야 한다 (조사 ①-5) */, goal: callNet.goal,
                    }}
                    onStopTap={focusCall}
                >
                    {/* 🏷️ 다음 정거장 이름표 — «어느 콜의 어떤 단계» (v22 S3 · 탭 동선은 4단계에서) */}
                    {/**
                      * 🗺️ **지도 위 이름표는 뺐다** (기사님 화면 대조 2026-09-05).
                      *
                      * 🔴 이 이름표가 지도 좌상단 `전체·현구간·현위치` 버튼과 **같은 자리**라
                      *    셋을 통째로 덮고 있었다. 화면을 찍어 보고서야 드러났다 —
                      *    코드만 읽으면 «둘 다 있다»로 보인다.
                      * 🔴 게다가 **같은 사실을 두 곳이 말했다** — 시트 상태바가 이미
                      *    «다음 1 초월읍 ~2.3km» 를 말한다 (`lib/sheetStatus` · 규칙 ③).
                      *    목업도 그 한 곳에만 둔다.
                      */}

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
                                feed({ type: 'depart' });
                            }}
                            className="absolute left-3 bottom-20 z-10 rounded-xl px-4 py-2.5 text-[14px] font-black text-white active:scale-95 transition-transform"
                            style={{ background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)', boxShadow: '0 6px 18px rgba(79,141,249,.4)' }}>
                            🚀 지금 출발
                        </button>
                    )}
                    {/**
                      * ⏳ **«고른 것»과 «실제»를 가른다** — 노선을 골라도 경로가 아직 없으면
                      *    마름모로 보고, 화면이 **그렇게 말한다**. 직선으로 지어내지 않는다 (규칙 ④).
                      *
                      * ⚠️ **고르는 버튼은 필터로 이사했다** (기사님 지시 2026-09-11:
                      *    *"노선 동선 버튼도 지도에서 필터로 이사와야해"* — 목업이 그 자리다).
                      *    여기 남은 것은 «지금 지도가 무엇을 그리고 있나»라 지도 자리가 맞다.
                      */}
                    <div className="absolute top-[92px] left-3 z-10 flex flex-col items-start gap-1">
                        {/* 🔴 **노선인데 경로가 아직이면 말한다** — 안 그러면 «노선인데 마름모»가 조용한 거짓말이 된다 */}
                        {routeMode && liveRoute.length > 0 && callNet && !callNet.usedLine && (
                            <span className="px-2 py-1 rounded-md bg-warning/15 text-warning text-[10px] font-bold shadow-lg backdrop-blur-sm">
                                ⏳ 경로를 기다립니다 — 올 때까지 마름모로 봅니다
                            </span>
                        )}
                    </div>

                    {/**
                      * 🗺️ **아래 두 귀퉁이** (기사님 확정 2026-09-05 · 목업 이식):
                      *   **좌하단** 경로 방침 — 내비추천 · 큰길 우선 · 최단거리
                      *   **우하단** 「QR 코드」 — **치수가 왼쪽과 같다.** 두 귀퉁이가 한 짝으로 읽힌다
                      * 🔴 **시트가 잰 높이 위에 뜬다** (`sheetPx`) — 시트가 «내용만큼» 서면
                      *    snap 이 정한 높이와 실제가 갈라져 버튼이 엉뚱한 자리에 뜬다 (규칙 ③).
                      */}
                    {liveRoute.length > 0 && (() => {
                        /* 🔴 **화면에 올라 있는 콜을 센다 — 심사 중인 것도 함께** (기사님 0905).
                           합짐은 «첫짐 경로 위에서 산출된» 콜이라, 심사 중에 경로를 바꾸면
                           «가는 길에 있다»는 산출 근거 자체가 사라진다. */
                        const locked = isPriorityLocked(liveRoute.length);
                        const holder = derived.routeHolder ?? liveRoute[liveRoute.length - 1];
                        /**
                         * 🔴 **지금 방침은 «다시 물은 결과 문구»에서 읽는다** — 콜에 방침 칸이 없다.
                         *    `kakaoTimeExt` 에 `[최단시간]`·`[최단거리]` 가 붙는다 (`PinnedRoute` 와 같은 법).
                         * ⚠️ 둘 다 없으면 기본값 «내비추천»이다.
                         */
                        const ext = holder?.kakaoTimeExt || '';
                        const now = ext.includes('[최단시간]') ? 'TIME'
                                  : ext.includes('[최단거리]') ? 'DISTANCE' : 'RECOMMEND';
                        const shown = ROUTE_PRIORITIES.filter(b => !locked || b.key === now);
                        return (
                            <div className="absolute left-3 z-10 flex flex-col gap-1.5 items-start"
                                 style={{ bottom: sheetPx + 12 }}>
                                {shown.map(b => (
                                    <button key={b.key} type="button"
                                        onClick={() => holder && props.onRecalculate?.(holder.id, b.key)}
                                        disabled={locked}
                                        className={`px-2.5 h-8 rounded-md text-[11.5px] font-black border backdrop-blur-sm
                                                    whitespace-nowrap transition-all ${
                                            now === b.key
                                                ? 'bg-info/90 text-white border-info'
                                                : 'bg-surface-alt/80 text-text-primary border-border hover:bg-surface-hover'}`}>
                                        {b.naviLabel}
                                    </button>
                                ))}
                                {/* 🔴 «잠겼다»는 **버튼 하나만 남은 것으로 이미 보인다** —
                                    글자를 덧붙이지 않는다 (기사님 2026-09-05) */}
                            </div>
                        );
                    })()}

                    {/* 🧭 **「QR 코드」** — 이 버튼이 늘 하는 일은 하나다. 어디로 가는지는
                        **덮개를 열면 그 두 줄이 말한다** (주행 중에도 있는 버튼이라 «출발»이 아니다) */}
                    {qrStop && (
                        <button type="button" onClick={() => setQrOpen(true)}
                            className="absolute right-3 z-10 flex items-center gap-1 rounded-md px-2.5 h-8
                                       text-[11.5px] font-black text-white whitespace-nowrap
                                       active:scale-95 transition-transform"
                            style={{ bottom: sheetPx + 12, background: 'linear-gradient(180deg,#5b8cff,#3f6fe0)',
                                     boxShadow: '0 4px 12px rgba(79,141,249,.35)' }}>
                            🧭 QR 코드
                        </button>
                    )}
                </PinnedRouteCanvas>
            </div>

            {/**
              * 🔳 **QR 덮개 — 세 줄이면 끝난다** (기사님 2026-09-05:
              *    *"그냥 「여수동 상차 / 구로동 하차 / 카메라로 찍어 네비를 켜세요」 이렇게"*).
              * 🔴 **눌러서 크게**를 고르셨다 (2026-09-05) — 작게 늘 띄우면 못 찍힌다.
              */}
            {qrOpen && qrStop && (
                <div onClick={() => setQrOpen(false)}
                     className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm p-6">
                    <div className="text-center">
                        <p className="text-[13px] font-black text-info">다음 정거장</p>
                        <p className="text-[24px] font-black text-white leading-tight">{qrStop.name}</p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                        <NaviQr stop={qrStop} via={qrVia} here={myLocation} kind="navi"
                                size={210} naviKey={NAVI_KEY} naviOrigin={NAVI_ORIGIN} />
                    </div>
                    <p className="text-[14px] font-bold text-white/90">카메라로 찍어 내비를 켜세요</p>
                    <p className="text-[12px] text-white/50">아무 데나 누르면 닫힙니다</p>
                </div>
            )}

            {/* 3단 시트 — 내용물은 기존 콜 화면 그대로 (sheetOnly) */}
            <StageSheet snap={snap} onSnapChange={(s) => feed({ type: 'drag', to: s })}
                        onHeightChange={setSheetPx}
                        /**
                         * 🎬 **요소별로 그린다** — 목업과 같은 모양 (이식 2026-09-05).
                         *    `▶ ①여수동 ~31분        2번 콜 · 상차 ›`
                         * 🔴 번호 동그라미는 **지도·목록과 같은 색표**다 — 색이 «몇 번 콜»을 말한다.
                         * 🔴 누르면 **「다」로 올라가며 그 콜이 열린다** — 이 줄을 누른 것은
                         *    «열어서 보겠다»는 뜻이라, 주행 중(엿보기)에도 올라간다.
                         *    자동으로 안 올리는 것과 다르다 — **손이 시킨 것**이다.
                         */
                        peekBar={
                            <button type="button"
                                onClick={() => {
                                    if (!next) return;
                                    const i = cycleDeck.findIndex(o => o.id === next.orderId);
                                    const mv = sheetTransition('full',
                                        { openIdx: i, callCount: cycleDeck.length, preferIdx: i });
                                    setSnap(mv.snap);
                                    setOpenIdx(mv.openIdx);
                                }}
                                className="w-full flex items-center gap-1.5 text-left min-h-[30px] active:opacity-70 transition-opacity">
                                <span className="shrink-0">{bar.mark}</span>
                                {bar.notice ? (
                                    <span className="text-text-muted font-semibold">· {bar.notice}</span>
                                ) : (
                                    <>
                                        <span className="shrink-0 w-[19px] h-[19px] rounded-full grid place-items-center text-[12px] font-black leading-none"
                                            style={next?.callNo ? {
                                                background: callNodeFill(next.callNo, next.stopLabel === '상차' ? 'pickup' : 'dropoff', theme),
                                                color: callNodeText(next.stopLabel === '상차' ? 'pickup' : 'dropoff', theme),
                                            } : { background: 'var(--color-info)', color: '#fff' }}>
                                            {bar.no}
                                        </span>
                                        <span className="shrink-0">{bar.name}</span>
                                        {bar.lead && <span className="shrink-0 text-text-muted font-semibold">{bar.lead}</span>}
                                        <span className="ml-auto shrink-0 text-text-muted font-semibold truncate">{bar.tail}</span>
                                        <span className="shrink-0 text-text-muted">›</span>
                                    </>
                                )}
                            </button>
                        }
                        /**
                         * 🪧 **판정석은 시트 맨 아래다** (기사님 확정 2026-09-05 · 안 ⓑ).
                         *
                         * 🔴 예전 자리(필터 줄·위쪽)는 늘 보이지만 **엄지에서 멀다.**
                         *    여기는 **콜 목록 바로 밑**이라 KEEP 을 누르면 그 콜이 바로 위
                         *    목록으로 올라간다 — 위에서 아래로 읽는 순서와 손이 맞는다.
                         * 🔴 **맨 아래 붙박이**라 목록이 아무리 길어도 안 밀린다.
                         * ⚠️ 주행 중 시트가 내려가 있어도 **상태바가 한 줄 심사석**이 된다 —
                         *    그러라고 시트가 3단이다 (놓치지 않는다).
                         */
                        bottomBox={derived.judging ? (
                            <JudgmentSeat
                                route={derived.judging}
                                confirmedActive={cycleDeck.filter(o => o.id !== derived.judging!.id).length}
                                onDecision={props.onDecision}
                                processingId={seatProcessingId}
                                setProcessingId={setSeatProcessingId}
                            />
                        ) : undefined}>
                <PinnedRouteBody {...props} sheetOnly d={derived}
                    /* 📏 «내용만큼» 서는 판인가 — 아코디언의 높이 문법이 갈린다 */
                    fit={snap === 'list'}
                    openIdx={openIdx}
                    onOpenIdx={(i) => {
                        /**
                         * 🪟 **여는 것이 곧 「다」, 닫는 것이 곧 「나」다** (기사님 정의 2026-09-05).
                         *
                         * | 다 | 지도 자리까지 다 쓰고 **하나만 열린** 상태 |
                         * | 나 | 상태바 + 타이틀 전부 (+ 판정) |
                         *
                         * 🔴 여기서 높이를 정하는 것은 **곁다리가 아니다** — «열었다»가 곧
                         *    «다 보겠다»는 뜻이라 **높이가 그 행동의 결과다.**
                         * 🔴 같은 줄을 다시 누르면 **닫힌다** — 닫을 길이 없으면 손으로
                         *    「나」로 돌아갈 수가 없다.
                         * ⚠️ 엿보기(가)에 계셨다면 안 올린다 — 주행 중이라 지도를 덮으면 안 된다.
                         * 🔴 높이 규칙은 `sheetTransition` 한 곳이 안다 (규칙 ③).
                         */
                        const next = i === openIdx ? -1 : i;
                        /* 손으로 한 일이므로 규칙에 «탭»으로 먹여 유예까지 함께 얻는다 (S11) */
                        const r = feed({ type: 'tap' });
                        setOpenIdx(next);
                        if (!r.snap) return;                      // 유예 중이면 높이는 그대로
                        if (snap !== 'peek') {
                            const mv = sheetTransition(next >= 0 ? 'full' : 'list',
                                { openIdx: next, callCount: cycleDeck.length, preferIdx: next });
                            setSnap(mv.snap);
                            setOpenIdx(mv.openIdx);
                        }
                    }} />
            </StageSheet>
        </section>
    );
}
