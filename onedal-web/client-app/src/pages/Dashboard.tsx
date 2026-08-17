import { isTerminal } from "@onedal/shared";
import { mergeOrderViews } from "../lib/orderMerge";
import Header from "../components/layout/Header";
import DeviceControlPanel from "../components/dashboard/DeviceControlPanel";
import OrderFilterStatus from "../components/dashboard/OrderFilterStatus";
import OrderFilterModal from "../components/dashboard/OrderFilterModal";
import VehicleStatusPanel from "../components/dashboard/VehicleStatusPanel";
import PinnedRoute from "../components/dashboard/PinnedRoute";
import { ErrorBoundary } from "../components/common/ErrorBoundary";
import { ensureJudgmentSocketSubscribed } from "../stores/judgmentStore";
import CargoMismatchBanner from "../components/dashboard/CargoMismatchBanner";
import { useServerErrors } from "../hooks/useServerErrors";
import { useState, useEffect } from "react";
import { socket } from "../lib/socket";

import { useOrderEngine } from "../hooks/useOrderEngine";



export default function Dashboard() {
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    /**
     * 🎯 판정 기준을 **탭이 아니라 여기서** 구독한다 (2026-08-16).
     *    탭에서만 구독하면 서버의 첫 `judgment-init` 을 놓쳐 폼이 잠긴다.
     *    구독 자체는 스토어가 한 번만 건다 — 여기서 불러도 중복되지 않는다.
     */
    useEffect(() => { ensureJudgmentSocketSubscribed(); }, []);

    const [viewFilter, setViewFilter] = useState<'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'ALL'>('ACTIVE');
    // [이슈 W] 서버 재시작으로 진행 중 콜이 복구됐을 때 표시할 배너
    const [restoredInfo, setRestoredInfo] = useState<{ restoredCount: number; dispatchPhase: string } | null>(null);
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
    const activeRoute = mergeOrderViews(orders as any, terminatedOrders, liveCalls);
    // 취소·방출·완료된 귀가콜은 "진행 중"이 아니다.
    // 걸러내지 않으면 한 번 귀가콜을 만들었다 취소한 뒤로 다시 만들 수 없게 된다.
    const hasHomeReturnActive = activeRoute.some(
        o => !isTerminal(o.status) && (o.receiptStatus === '귀가' || o.id?.startsWith('home-'))
    );

    // ※ 대기열 시뮬레이션(useKakaoRouting + DrillDownModal)은 2026-08-09 제거했다.
    //    "잡기 전에 카카오로 미리 계산해 보여주는" 기능이었으나
    //    ① 모달을 여는 코드가 애초에 없었고 ② 입력(pendingOrders)이 구조적으로 항상 비었으며
    //    ③ 적요는 하드코딩 더미, ④ 수락 버튼은 안내 alert 라 한 번도 동작한 적이 없었다.
    //    무엇보다 PRD의 선점필승(광클 → 안전취소 30초 검수) 설계와 상충한다.
    //    같은 정보는 order-evaluated 의 꿀/똥 판정이 더 정확하게 제공한다.
    //    서버 라우트 /api/kakao/directions/compare 는 범용이라 남겨두었다.

    // 귀가콜 자동 도착 알림 핸들러
    /**
     * 도착 감지 (2026-08-17 소생 — 죽은 문이었다).
     * 🔴 confirm() 으로 "배달 완료 처리?"를 묻던 옛 코드는 지웠다 — 하차 완료는 물리 행위라
     *    GPS 도, 확인창도 대신 못 찍는다 (자동은 ARRIVED_* 뿐). 진행 바 전진은 milestone-log 가
     *    이미 하므로 여기는 잠깐 알림만 띄운다.
     */
    const [gpsNotice, setGpsNotice] = useState<string | null>(null);
    useEffect(() => {
        const onAutoArrived = (data: { stopType: 'pickup' | 'dropoff', message: string }) => {
            setGpsNotice(`🏁 ${data.message}`);
            setTimeout(() => setGpsNotice(null), 10_000);
        };
        const onApproaching = (data: { stopType: 'pickup' | 'dropoff', distanceKm: number }) => {
            const label = data.stopType === 'pickup' ? '상차지' : '하차지';
            setGpsNotice(`📣 다음 정거장(${label}) ${data.distanceKm}km 앞 — 도착전 통화를 걸어 주세요`);
            setTimeout(() => setGpsNotice(null), 20_000);
        };
        // 타겟 자동 순환 — 미리 눌러 둔 것이니 스와이프로 언제든 뒤집을 수 있다
        const onTargetSwitched = (d: { from: string, to: string }) => {
            setGpsNotice(d.to === 'HOME'
                ? '🏠 복귀행으로 바꿔 뒀습니다 — 시간이 남으면 관내로 스와이프'
                : '🎯 집에 도착했습니다 — 노선행으로 돌아갑니다');
            setTimeout(() => setGpsNotice(null), 20_000);
        };
        socket.on("auto-arrived", onAutoArrived);
        socket.on("next-stop-approaching", onApproaching);
        socket.on("target-auto-switched", onTargetSwitched);
        return () => {
            socket.off("auto-arrived", onAutoArrived);
            socket.off("next-stop-approaching", onApproaching);
            socket.off("target-auto-switched", onTargetSwitched);
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

    return (
        <main className="min-h-screen bg-bg-base font-sans pb-24">

            {/* 📍 공통 헤더 컴포넌트 */}
            <Header isConnected={isConnected} />

            <div className="flex flex-col max-w-2xl mx-auto">

                {/* 🏁 도착 감지 · 📣 근접 예고 (도착전 통화) — 잠깐 떴다 사라진다 */}
                {gpsNotice && (
                    <div className="mx-3 mt-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 flex items-center gap-2 text-sm">
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
                    <div className="mx-3 mt-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 flex items-start gap-3">
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
                    <div className="mx-3 mt-3 rounded-xl border border-warning/45 bg-warning/10 px-4 py-3 flex items-start gap-3">
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
                    <div key={e.at} className="mx-3 mt-3 rounded-xl border border-danger/45 bg-danger/10 px-4 py-3 flex items-start gap-3">
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

                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 (클릭 시 설정 모달 띄움) */}
                <OrderFilterStatus onOpenFilter={() => setIsFilterModalOpen(true)} />

                {/* 🚚 내 차 정보 및 적재/이동 상태 패널 */}
                <VehicleStatusPanel liveCalls={liveCalls} />

                {/* 🏆 배차 확정 콜 (및 안전취소 연산 구역)
                    🔴 결재 카드가 터져도 관제탑 전체가 죽지 않게 경계를 둔다 —
                       운행 중이면 여기가 KEEP/CANCEL 을 하는 유일한 창구다 */}
                <ErrorBoundary label="결재 카드">
                    <PinnedRoute 
                        activeRoute={activeRoute} 
                        onDecision={handleDecision} 
                        onRecalculate={handleRecalculate} 
                        viewFilter={viewFilter}
                        setViewFilter={setViewFilter}
                    />
                </ErrorBoundary>
            </div>

            {/* 필터 설정 모달 */}
            <OrderFilterModal
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                hasHomeReturnActive={hasHomeReturnActive}
            />

        </main>
    );
}
