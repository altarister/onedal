import { isTerminal, isEvaluating, judgingCallOf } from "@onedal/shared";
import { mergeOrderViews } from "../lib/orderMerge";
import Header from "../components/layout/Header";
import DeviceControlPanel from "../components/dashboard/DeviceControlPanel";
import OrderFilterStatus from "../components/dashboard/OrderFilterStatus";
import { useFilterConfig } from "../hooks/useFilterConfig";
import JudgmentSeat from "../components/dashboard/JudgmentSeat";
import StageView from "../components/stage/StageView";
/* 🔬 곁 패널 — 지울 때 이 줄과 아래 호출 한 줄만 지운다 (2026-09-11) */
import StatusBoard from "../statusboard/StatusBoard";
import OrderFilterModal from "../components/dashboard/OrderFilterModal";
import PinnedRoute from "../components/dashboard/PinnedRoute";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { ensureJudgmentSocketSubscribed } from "../stores/judgmentStore";
import CargoMismatchBanner from "../components/dashboard/CargoMismatchBanner";
import { useServerErrors } from "../hooks/useServerErrors";
import { mountAutoKeepBadge } from "../lib/autoKeep";
import { useState, useEffect } from "react";
import { socket } from "../lib/socket";

import { useOrderEngine } from "../hooks/useOrderEngine";



/**
 * ⏱️ **배너는 10초 뒤 스스로 사라진다** (기사님 지시 2026-09-03: *"토스트 팝업이 10초후
 * 닫히도록 해야 할꺼 같아 화면을 다 가려"*).
 *
 * 예전에는 10·15·20초가 섞여 있었고 **서버 재시작 복구 알림은 아예 안 닫혔다** —
 * 손으로 닫기 전까지 남아 폰 화면을 덮었다. 운전 중에는 그 닫기 버튼을 못 누른다
 * (「운전 중에는 입력을 못 한다」 — 무입력에도 일이 되어야 한다).
 *
 * 🔴 **한 값으로 묶는다** — 배너마다 다른 숫자를 손으로 적으면 또 갈라진다 (규칙 ③).
 */
const NOTICE_MS = 10_000;

export default function Dashboard() {
    /**
     * 🪗 **필터가 제자리에서 열린다** (이식 C4-3 · 기사님 2026-09-09:
     *    *"팝업을 삭제하고 한 줄과 열림만 있으면 될 것 같아."*).
     *    전에는 전면 팝업(`Dialog`)이라 이름이 `isFilterModalOpen` 이었다.
     */
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    /**
     * 🛣️ **노선 ↔ 🔷 동선 — 그물을 어떤 모양으로 볼까** (기사님 지시 2026-09-11:
     *    *"노선 동선 버튼도 지도에서 필터로 이사와야해"*).
     *
     * 🔴 **여기서 쥔다** — 고르는 버튼은 **필터**에, 그리는 것은 **지도**에 있다.
     *    한쪽이 제 상태를 들면 «필터는 동선인데 지도는 노선»이 된다 (규칙 ③).
     * 🔴 **기억하지 않는다** — 레이어(🧅)는 «보기»라 localStorage 에 남기지만 이것은
     *    **판정을 바꾸는 값**이다. 어제 상태가 오늘 되살아나면 안 된다.
     *    기본은 «노선» (기사님 확정 2026-09-09).
     */
    /**
     * 🛣️🔷 **노선/동선은 필터 값이다** (전수 조사 ①-9 · 2026-09-12).
     *    예전엔 여기 `useState(true)` 하나였다 — **서버가 몰라** «동선»을 골라도 판정·앱 목록은
     *    계속 노선이었고, 새로고침하면 노선으로 돌아갔다. 이제 `filter.routeMode` 를 읽고
     *    `updateFilter` 로 바꾼다 — 지도·서버·💾 가 같은 값을 본다 (규칙 ③).
     */
    const { filter, updateFilter } = useFilterConfig();
    const routeMode = filter?.routeMode ?? true;
    const setRouteMode = (v: boolean) => updateFilter({ routeMode: v });
    // 🪧 심사석 결재 버튼의 처리 중 표시 (자동콜 갈래)
    const [seatProcessingId, setSeatProcessingId] = useState<string | null>(null);
    // 🎭 새 화면 미리보기 토글 (화면개편 · 기사님 확정 0831) — 표시만 바뀐다, 상태는 공용
    const [stagePreview, setStagePreview] = useState(() => localStorage.getItem('stagePreview') === '1');
    /**
     * 🔬 **곁 패널 자리가 되나** — 무대는 `max-w-2xl`(672px) 가운데 고정이라 창이 넓으면
     *    **왼쪽 여백**이 남는다. 그 여백이 한 칸(330px)을 담을 만큼일 때만 만든다.
     *
     * 🔴 **폰에서는 아예 안 만든다** (기사님 지시 2026-09-11: *"모바일일때는 컨포넌트 호출을
     *    안하고"*). 숨기는 것(`hidden`)과 안 만드는 것은 다르다 — 숨기면 훅이 돌고 구독이
     *    붙는다. 운행 중 화면에 무게를 얹지 않는다.
     * 🔴 이 패널은 **언젠가 통째로 지운다** — 지우는 법은 `SidePanel.tsx` 머리에 적었다.
     */
    const [sidePanelRoom, setSidePanelRoom] = useState(() => window.innerWidth - 672 >= 346);
    useEffect(() => {
        const onResize = () => setSidePanelRoom(window.innerWidth - 672 >= 346);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => {
        const on = () => setStagePreview(localStorage.getItem('stagePreview') === '1');
        window.addEventListener('stage-preview-changed', on);
        return () => window.removeEventListener('stage-preview-changed', on);
    }, []);
    /**
     * 🎭 무대 모드 — **문서 스크롤을 잠근다** (기사님 0831: 헤더 빼고 다 같이 움직여 들썩).
     * 고정부(헤더·폰영역·슬롯)는 붙박이, 스크롤은 시트 안(overflow-y)에서만 일어난다.
     */
    useEffect(() => {
        if (!stagePreview) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [stagePreview]);
    /**
     * 🎯 판정 기준을 **탭이 아니라 여기서** 구독한다 (2026-08-16).
     *    탭에서만 구독하면 서버의 첫 `judgment-init` 을 놓쳐 폼이 잠긴다.
     *    구독 자체는 스토어가 한 번만 건다 — 여기서 불러도 중복되지 않는다.
     */
    // 🤖 자동 결재가 켜져 있으면 화면에 못박는다 (모르고 쓰는 것을 막는다)
    useEffect(() => { mountAutoKeepBadge(); }, []);

    useEffect(() => { ensureJudgmentSocketSubscribed(); }, []);

    const [viewFilter, setViewFilter] = useState<'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'RELEASED' | 'ALL'>('ACTIVE');
    // [이슈 W] 서버 재시작으로 진행 중 콜이 복구됐을 때 표시할 배너
    const [restoredInfo, setRestoredInfo] = useState<{ restoredCount: number; dispatchPhase: string } | null>(null);
    // ⏱️ 복구 알림도 스스로 닫힌다 — 예전에는 손으로 닫기 전까지 남아 화면을 덮었다
    useEffect(() => {
        if (!restoredInfo) return;
        const t = setTimeout(() => setRestoredInfo(null), NOTICE_MS);
        return () => clearTimeout(t);
    }, [restoredInfo]);
    // [T5] 3일이 지나 복구에서 빠진 미완료 콜 — **조용히 사라지게 두지 않는다**
    const [staleDropped, setStaleDropped] = useState<{
        count: number; days: number;
        orders: { id: string; status: string; pickup: string; dropoff: string; daysAgo: number }[];
    } | null>(null);

    // 서버가 보내는 오류를 화면에 띄운다 — 조용한 실패를 없앤다
    const { errors: serverErrors, dismiss: dismissError } = useServerErrors();

    const {
        orders,
        isConnected,
        liveCalls,
        terminatedOrders,
        handleDecision,
        handleRecalculate,
        routeStops,
        routeComputedAt,
        routeHolderId,
        previewRouteHolderId,
        cancelCounts,
        cancelRounds,
    } = useOrderEngine();


    // [2026-08-10] 서버가 진행/종료를 **나눠서** 보낸다. 예전에는 한 배열로 와서
    // 받는 쪽마다 isTerminal 을 기억해야 했고, 잊으면 조용히 틀렸다 (AA·BB·DD).
    //
    // PinnedRoute 는 탭(진행중/완료/취소) 때문에 둘 다 필요하므로 여기서만 합친다.
    // 합치는 곳이 한 곳뿐이면 "어느 배열을 써야 하지?"를 고민할 자리가 없어진다.
    //
    // 🔴 2026-08-11 — 여기 인라인으로 있던 이력 필터가
    //    `isTerminal(s) || s === 'ORDER_CONFIRMED'` 라 **ORDER_PICKED_UP 을 버렸다.**
    //    서버의 복구 쿼리 두 곳과 합쳐 같은 목록이 세 군데 손으로 적혀 있었다.
    //    `mergeOrderViews` 로 뽑아 한 곳에서 정하고, 렌더 없이 테스트한다.
    const activeRoute = mergeOrderViews(orders, terminatedOrders, liveCalls);
    /** 🪧 심사 중인 콜 — 술어는 shared 한 곳에서 (규칙 ③) */
    const judgingCall = judgingCallOf(activeRoute);
    // 취소·방출·완료된 귀가콜은 "진행 중"이 아니다.
    // 걸러내지 않으면 한 번 귀가콜을 만들었다 취소한 뒤로 다시 만들 수 없게 된다.
    const hasHomeReturnActive = activeRoute.some(
        o => !isTerminal(o.status) && (o.receiptStatus === '귀가' || o.id?.startsWith('home-'))
    );

    // ※ 대기열 시뮬레이션(useKakaoRouting + DrillDownModal)은 2026-08-09 제거했다.
    //    "잡기 전에 카카오로 미리 계산해 보여주는" 기능이었으나
    //    ① 모달을 여는 코드가 애초에 없었고 ② 입력(pendingOrders)이 구조적으로 항상 비었으며
    //    ③ 적요는 하드코딩 더미, ④ 수락 버튼은 안내 alert 라 한 번도 동작한 적이 없었다.
    //    무엇보다 PRD의 선점필승(선점 → 안전취소 30초 검수) 설계와 상충한다.
    //    같은 정보는 order-evaluated 의 꿀/똥 판정이 더 정확하게 제공한다.
    //    서버 라우트 /api/kakao/directions/compare 는 범용이라 남겨두었다.

    /**
     * 📢 **서버가 «대신 한 일»만 잠깐 알린다.**
     * 🔴 도착 감지(`auto-arrived`)·근접 예고(`next-stop-approaching`)는 여기서 토스트를 안 띄운다 (기사님 2026-09-15 —
     *    *"시트가 올라오면 불필요"* · *"시인성이 떨어지고 완전 불필요"*). 도착은 시트가 마중하고 근접은 카드가 따라간다 —
     *    둘 다 `gpsFocusStore` 가 듣는다. 같은 사건을 토스트로 한 번 더 말하면 소음이고, 하나뿐인 배너 줄을 덮어 3·4번 알림을 가린다.
     */
    const [gpsNotice, setGpsNotice] = useState<string | null>(null);
    useEffect(() => {
        /**
         * 🚚 **떠남 → 하차 완료** (기사님 확정 2026-08-25).
         *
         * 기사님: *"곤지암과 부발에서 멀어진 거면 하차를 했는데 버튼을 못 누른 걸로 봐야
         * 하지 않을까… 운행 중에 클릭 못 할 거라 말이지."*
         *
         * 자동으로 찍었다는 **사실을 반드시 알린다** — 조용히 넘어가면 기사님이 모른 채
         * 장부가 바뀐다. 틀렸으면 그 단계에서 고칠 수 있다 (단계 표는 덮어쓰기다).
         */
        const onAutoDelivered = (data: { orderId: string, message: string }) => {
            setGpsNotice(`🚚 ${data.message}`);
            setTimeout(() => setGpsNotice(null), NOTICE_MS);
        };
        /**
         * 🚚 **지나침 — 도착·완료를 대신 찍었다** (기사님 확정 2026-09-03).
         * 운전 중에는 못 누르므로 서버가 대신 찍는다. 화면은 **무엇을 했는지 알리기만** 한다 —
         * 틀렸으면 단계에서 되돌린다 (단계 표는 그 자리에서 고칠 수 있다).
         */
        const onAutoPassed = (data: { orderId: string, stopType: 'pickup' | 'dropoff', message: string }) => {
            setGpsNotice(`🚚 ${data.message}`);
            setTimeout(() => setGpsNotice(null), NOTICE_MS);
        };
        // 타겟 자동 순환 — 미리 눌러 둔 것이니 스와이프로 언제든 뒤집을 수 있다
        const onTargetSwitched = (d: { from: string, to: string }) => {
            setGpsNotice(d.to === 'HOME'
                ? '🏠 복귀행으로 바꿔 뒀습니다 — 시간이 남으면 관내로 스와이프'
                : '🎯 집에 도착했습니다 — 노선행으로 돌아갑니다');
            setTimeout(() => setGpsNotice(null), NOTICE_MS);
        };
        /**
         * 🔔 **새 콜이 뜨면 보이는 탭으로 데려온다** (기사님 실측 2026-08-19).
         *
         * 기사님: *"콜이 하나뿐이라 완료로 넘어가서 완료된 콜을 보고 있었는데,
         * 다시 콜을 잡았을 때 **보고 있는 탭이 완료 탭이어서 콜이 왔는지도 모르고
         * 지나갔어.**"*
         *
         * 🔴 화면 불편이 아니라 **콜을 잃는 사고**다 — 안전취소 30초 안에 결재해야 하는데
         *    화면에 없으면 아무것도 못 한다.
         *
         * ⚠️ 아무 때나 탭을 뺏지는 않는다. **평가 중으로 들어오는 새 콜**에만 —
         *    화면을 뺏는 것은 결재를 위해서만 정당하다 (규칙 ①).
         */
        const onNewCall = () => setViewFilter('ACTIVE');

        socket.on("auto-delivered", onAutoDelivered);
        socket.on("auto-passed", onAutoPassed);
        socket.on("target-auto-switched", onTargetSwitched);
        socket.on("order-evaluating", onNewCall);
        return () => {
            socket.off("auto-delivered", onAutoDelivered);
            socket.off("auto-passed", onAutoPassed);
            socket.off("target-auto-switched", onTargetSwitched);
            socket.off("order-evaluating", onNewCall);
        };
    }, []);

    // [이슈 W] 서버 재시작 복구 알림
    // 서버는 DB의 진행 중 콜로부터 배차 상태(합짐/차종/경유)를 다시 파생시킨다.
    // 다만 이미 배달했는데 완료 처리를 안 한 건이 있으면 서버는 계속 "적재 중"으로 믿고
    // 합짐 필터를 좁게 유지하므로, 기사님이 완료 처리를 하도록 알려야 한다.
    useEffect(() => {
        const onSessionRestored = (data: { restoredCount: number; dispatchPhase: string }) => {
            setRestoredInfo(data);
        };
        socket.on("session-restored", onSessionRestored);
        return () => {
            socket.off("session-restored", onSessionRestored);
        };
    }, []);

    // [T5] 상한을 넘겨 화면에서 빠진 미완료 콜을 알린다.
    // 기사님이 **모르는 채로 콜을 잃는 것**이 2026-08-11 사고의 본질이었다.
    // 상한을 두면서 같은 실패 방식을 새로 만들 수는 없다.
    useEffect(() => {
        const onStale = (d: typeof staleDropped) => setStaleDropped(d);
        socket.on("stale-orders-dropped", onStale);
        return () => { socket.off("stale-orders-dropped", onStale); };
    }, []);

    /**
     * 🔬 **곁 패널은 원본 «바깥»에 선다** (기사님 지시 2026-09-11:
     *    *"원본에는 어떤 영향도 없어야해.. div 로 완벽하게 분리해줘"*).
     *
     * 🔴 **전에는 무대만 왼쪽으로 밀었다가 헤더가 어긋났다** — 헤더는 전체 폭을 쓰는데
     *    무대만 `mr-auto` 로 당기니 둘이 따로 놀았다. 원본 **안쪽**을 건드린 탓이다.
     *    이제 원본(`<main>`)을 통째로 왼쪽 칸에 담고 패널은 오른쪽 칸에 둔다 —
     *    원본은 제 폭 안에서 **예전과 한 픽셀도 다르지 않게** 동작한다.
     *
     * 🔴 **지울 때는 이 감싸개와 패널 한 줄만** 걷어내면 된다. `body` 는 안 건드린다.
     */
    const withPanel = stagePreview && sidePanelRoom;
    const body = (
        <main className={stagePreview
            ? "h-dvh overflow-hidden flex flex-col bg-bg-base font-sans"      /* 🎭 무대: 화면 = 상자, 스크롤은 시트 안 */
            : "min-h-screen bg-bg-base font-sans pb-24"}
            /* 🛡️ overflow-hidden 이어도 프로그램 스크롤(scrollIntoView·포커스)은 민다 —
               무대에서 어떤 경로로든 밀리면 즉시 0 으로 (상단 날아감 재발 방지) */
            onScroll={stagePreview ? (e) => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; } : undefined}>

            {/* 📍 공통 헤더 컴포넌트 */}
            <Header isConnected={isConnected} liveCalls={liveCalls} />

            <div className={`relative flex flex-col max-w-2xl mx-auto w-full ${stagePreview ? "flex-1 min-h-0" : ""}`}>


                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 ↔ 🪧 심사석 — **같은 슬롯 1:1 치환** (기사님 확정 0831).
                    둘 다 158px 고정이라 아래 내용이 한 픽셀도 안 밀린다. 차량 패널은 늘 그 자리 —
                    예전엔 심사 때 차량 패널까지 숨겨서 전환마다 아래가 출렁였다. */}
                {(() => {
                    // 🔴 술어를 여기서 다시 쓰지 않는다 — «심사석에 뜬 콜»과 «덱에서 빠진 콜»이 갈린다 (0831 리뷰)
                    const judging = judgingCall;
                    /**
                     * 🪧 **무대에서는 판정석이 시트 맨 아래다** (기사님 확정 2026-09-05 · 안 ⓑ).
                     *    그래서 이 자리는 **늘 필터**다 — 둘이 같은 슬롯을 다투지 않는다.
                     * ⚠️ 옛 화면(무대 아님)은 그대로 1:1 치환이다 (0831 확정) — 거기는 시트가 없다.
                     */
                    if (judging && !stagePreview) return (
                        <JudgmentSeat
                            route={judging}
                            /* 🔢 «합짐N»은 지금 쥔 콜 수 — 하루 덱(오늘 하차분 포함)으로 세면 N 이 하루 종일 커진다 (사이클 = 하루 · 2026-09-15) */
                            confirmedActive={activeRoute.filter(o => !isTerminal(o.status) && !isEvaluating(o.status) && o.id !== judging.id).length}
                            onDecision={handleDecision}
                            processingId={seatProcessingId}
                            setProcessingId={setSeatProcessingId}
                        />
                    );
                    return <OrderFilterStatus
                        onOpenFilter={() => setIsFilterOpen(o => !o)}
                        cancelCounts={cancelCounts} cancelRounds={cancelRounds} />;
                })()}

                {/**
                  * 🪗 **필터 — 요약줄 바로 아래, 제자리에서 열린다** (이식 C4-3).
                  *    팝업이 아니라 **형제**라 덮지 않는다. 층이 셋(접힘 → 펼침 → 팝업)이던 것이
                  *    둘(한 줄 → 열림)이 됐다 — 기사님 2026-09-09:
                  *    *"열려 있을 때 또 팝업이 뜬다. 그 UI 가 별로다."*
                  * 🔴 닫혀 있으면 **만들지 않는다** — 훅과 구독이 도는 것을 막는다
                  *    (`OrderFilterModal` 안의 `if (!isOpen) return null`).
                  */}
                <OrderFilterModal
                    isOpen={isFilterOpen}
                    onClose={() => setIsFilterOpen(false)}
                    hasHomeReturnActive={hasHomeReturnActive}
                    routeMode={routeMode}
                    setRouteMode={setRouteMode}
                />

                {/* 📢 배너 층 (v24) — 무대에서는 흐름 밖으로 띄운다. 🔴 바탕은 불투명(bg-surface) — 10% 바탕이면 뒤 지도가 비친다 (#146). 흐름 안에 두면 뜰 때마다
                    아래 전부(슬롯·지도)가 밀려 화면이 들썩인다 (기사님 실측 0831) */}
                {/* 🗺️ 필터 줄(과 열리는 필터) 아래 · 지도 위 — 헤더·필터 줄을 가리지 않는다 · 높이 0 그릇이라 지도를 밀지 않는다 (기사님 2026-09-15 «지도 위로 하자» · #146) */}
                <div className={stagePreview ? "relative h-0 z-30" : "contents"}>
                <div className={stagePreview ? "absolute left-0 right-0 top-0 flex flex-col" : "contents"}>
                {/* 🚚 서버가 대신 찍은 하차 완료·지나침 · 🏠 목적지 자동 전환 — 잠깐 떴다 사라진다 */}
                {gpsNotice && (
                    <div className="mx-3 mt-3 rounded-xl border border-primary/40 border-l-4 border-l-primary bg-surface shadow-lg px-4 py-2.5 flex items-center gap-2 text-sm">
                        <span className="flex-1 font-bold text-text-primary">{gpsNotice}</span>
                        <button
                            onClick={() => setGpsNotice(null)}
                            className="text-text-muted hover:text-text-primary text-xs font-bold px-2 py-1"
                            aria-label="알림 닫기"
                        >닫기</button>
                    </div>
                )}

                {/* 🔄 서버 재시작 복구 알림 */}
                {restoredInfo && (
                    <div className="mx-3 mt-3 rounded-xl border border-warning/40 border-l-4 border-l-warning bg-surface shadow-lg px-4 py-3 flex items-start gap-3">
                        <span className="text-lg leading-none mt-0.5">🔄</span>
                        <div className="flex-1 text-sm">
                            <p className="font-bold text-text-primary">
                                서버 재시작으로 진행 중이던 콜 {restoredInfo.restoredCount}건을 복구했습니다.
                            </p>
                            <p className="text-text-muted mt-0.5">
                                적재 상태({restoredInfo.dispatchPhase}) 기준으로 합짐 필터를 다시 계산했습니다.
                                이미 완료하신 건이 있다면 <b>완료 처리</b>해 주세요. 그래야 남은 적재 공간이 정확해집니다.
                            </p>
                        </div>
                        <button
                            onClick={() => setRestoredInfo(null)}
                            className="text-text-muted hover:text-text-primary text-xs font-bold px-2 py-1"
                            aria-label="알림 닫기"
                        >
                            닫기
                        </button>
                    </div>
                )}

                {/* ⏳ [T5] 상한을 넘겨 화면에서 빠진 미완료 콜 — 조용한 소실을 만들지 않는다 */}
                {staleDropped && staleDropped.count > 0 && (
                    <div className="mx-3 mt-3 rounded-xl border border-warning/45 border-l-4 border-l-warning bg-surface shadow-lg px-4 py-3 flex items-start gap-3">
                        <span className="text-lg leading-none mt-0.5">⏳</span>
                        <div className="flex-1 min-w-0 text-sm">
                            <p className="font-bold text-text-primary">
                                {staleDropped.days}일이 지난 미완료 콜 {staleDropped.count}건이 화면에서 빠졌습니다
                            </p>
                            <p className="text-text-muted text-xs mt-0.5">
                                끝내지 않은 콜이 남아 있다면 사무실에 확인해 주세요. 적재·합짐 계산에는 반영되지 않습니다.
                            </p>
                            <ul className="mt-1.5 flex flex-col gap-0.5">
                                {staleDropped.orders.slice(0, 5).map(o => (
                                    <li key={o.id} className="text-[11px] text-text-muted break-keep">
                                        · {o.pickup} → {o.dropoff}
                                        <span className="opacity-70"> ({o.daysAgo}일 전 · {o.status === 'ORDER_PICKED_UP' ? '상차 완료' : '확정'})</span>
                                    </li>
                                ))}
                                {staleDropped.orders.length > 5 && (
                                    <li className="text-[11px] text-text-muted">· 외 {staleDropped.orders.length - 5}건</li>
                                )}
                            </ul>
                        </div>
                        <button onClick={() => setStaleDropped(null)}
                            className="text-text-muted hover:text-text-primary text-xs font-bold px-2 py-1">닫기</button>
                    </div>
                )}

                {/* 🚨 서버 오류 — 예전에는 서버만 알고 기사님은 몰랐다 */}
                {serverErrors.map(e => (
                    <div key={e.at} className="mx-3 mt-3 rounded-xl border border-danger/45 border-l-4 border-l-danger bg-surface shadow-lg px-4 py-3 flex items-start gap-3">
                        <span className="text-lg leading-none mt-0.5">🚨</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-text-primary">처리에 실패했습니다</p>
                            <p className="text-xs text-text-muted mt-0.5 break-all">{e.event} — {e.message}</p>
                        </div>
                        <button onClick={() => dismissError(e.at)}
                            className="text-text-muted hover:text-text-primary text-xs font-bold px-2 py-1">닫기</button>
                    </div>
                ))}

                {/* 🚨 신고 불일치 — 경고에서 사무실 전화·수행 판단까지 한 카드에서 */}
                <CargoMismatchBanner orders={activeRoute} />
                </div>
                </div>

                {/* 🚚 내 차 요약은 헤더 로고 자리로 이사 (기사님 0831 — 영역 절약). 패널 줄은 뺐다 */}

                {/* 🏆 배차 확정 콜 (및 안전취소 연산 구역)
                    🔴 결재 카드가 터져도 관제탑 전체가 죽지 않게 경계를 둔다 —
                       운행 중이면 여기가 KEEP/CANCEL 을 하는 유일한 창구다 */}
                <ErrorBoundary label="결재 카드">
                    {stagePreview ? <StageView
                        routeMode={routeMode}
                        routeStops={routeStops}
                        routeComputedAt={routeComputedAt}
                        routeHolderId={routeHolderId}
                        previewRouteHolderId={previewRouteHolderId}
                        activeRoute={activeRoute}
                        onDecision={handleDecision}
                        onRecalculate={handleRecalculate}
                        viewFilter={viewFilter}
                        setViewFilter={setViewFilter}
                    /> : <PinnedRoute 
                        routeStops={routeStops}
                        routeComputedAt={routeComputedAt}
                        routeHolderId={routeHolderId}
                        previewRouteHolderId={previewRouteHolderId}
                        activeRoute={activeRoute} 
                        onDecision={handleDecision} 
                        onRecalculate={handleRecalculate} 
                        viewFilter={viewFilter}
                        setViewFilter={setViewFilter}
                    />}
                </ErrorBoundary>
            </div>

        </main>
    );

    /* 🔴 **패널이 없으면 예전 그대로 내보낸다** — 감싸개조차 만들지 않는다 */
    if (!withPanel) return body;

    return (
        <div className="flex h-dvh overflow-hidden">
            {/**
              * 🪪 **두 영역에 이름표를 붙였다** (기사님 지시 2026-09-11:
              *    *"그 div에 프로젝트와, 현황판 뭐 이런 영어 이름으로 아이디 하나씩 만들어줘"*).
              *
              * 🔴 **여럿이 함께 일하기 때문이다.** 화면에서 «여기가 누구 영역인가»가 보여야
              *    셋이 나눠 일할 때 헷갈리지 않는다. 다만 **id 는 표시일 뿐이고, 충돌을
              *    실제로 막는 것은 «폴더»다** — 현황판은 `src/statusboard/` 한 폴더에 산다.
              */}
            {/* 🖥️ 왼쪽 — **원본 붙박이.** 폭만 정해 주고 안쪽은 손대지 않는다 */}
            <div id="project" className="shrink-0 w-[42rem] h-full overflow-hidden border-r border-border">{body}</div>
            {/* 🔬 오른쪽 — 현황판. 원본과 형제라 서로 밀지 않는다 */}
            <div id="statusboard" className="flex-1 min-w-0 h-full"><StatusBoard activeRoute={activeRoute} /></div>
        </div>
    );
}
