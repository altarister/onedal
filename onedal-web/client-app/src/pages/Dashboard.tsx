import type { SecuredOrder } from "@onedal/shared";
import { isTerminal } from "@onedal/shared";
import Header from "../components/layout/Header";
import DeviceControlPanel from "../components/dashboard/DeviceControlPanel";
import OrderFilterStatus from "../components/dashboard/OrderFilterStatus";
import OrderFilterModal from "../components/dashboard/OrderFilterModal";
import VehicleStatusPanel from "../components/dashboard/VehicleStatusPanel";
import PinnedRoute from "../components/dashboard/PinnedRoute";
import { useState, useEffect } from "react";
import { socket } from "../lib/socket";

import { useOrderEngine } from "../hooks/useOrderEngine";



export default function Dashboard() {
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [isTestMode, setIsTestMode] = useState(false);
    const [viewFilter, setViewFilter] = useState<'ACTIVE' | 'COMPLETED' | 'CANCELED' | 'ALL'>('ACTIVE');
    // [이슈 W] 서버 재시작으로 진행 중 콜이 복구됐을 때 표시할 배너
    const [restoredInfo, setRestoredInfo] = useState<{ restoredCount: number; dispatchPhase: string } | null>(null);

    const {
        orders,
        isConnected,
        mainCall,
        subCalls,
        handleDecision,
        handleRecalculate,
    } = useOrderEngine();

    const dbConfirmedOrCompleted = orders.filter(o => isTerminal((o as any).status) || (o as any).status === 'ORDER_CONFIRMED');
    const memoryActive = [mainCall, ...subCalls].filter(Boolean) as SecuredOrder[];
    
    // ID 기반 병합 (메모리 데이터 우선, 순서 유지)
    const activeRouteMap = new Map();
    dbConfirmedOrCompleted.forEach(o => activeRouteMap.set(o.id, o));
    memoryActive.forEach(o => activeRouteMap.set(o.id, { ...activeRouteMap.get(o.id), ...o })); 
    
    const activeRoute = Array.from(activeRouteMap.values()) as SecuredOrder[];
    // 취소·방출·완료된 귀가콜은 "진행 중"이 아니다.
    // 걸러내지 않으면 한 번 귀가콜을 만들었다 취소한 뒤로 다시 만들 수 없게 된다.
    const hasHomeReturnActive = activeRoute.some(
        o => !isTerminal(o.status) && (o.receiptStatus === '귀가' || o.id?.startsWith('home-'))
    );

    // ※ 대기열 시뮬레이션(useKakaoRouting + DrillDownModal)은 2026-08-09 제거했다.
    //    "잡기 전에 카카오로 미리 계산해 보여주는" 기능이었으나
    //    ① 모달을 여는 코드가 애초에 없었고 ② 입력(pendingOrders)이 구조적으로 항상 비었으며
    //    ③ 적요는 하드코딩 더미, ④ 수락 버튼은 안내 alert 라 한 번도 동작한 적이 없었다.
    //    무엇보다 PRD의 선빵필승(광클 → 데스밸리 30초 검수) 설계와 상충한다.
    //    같은 정보는 order-evaluated 의 꿀/똥 판정이 더 정확하게 제공한다.
    //    서버 라우트 /api/kakao/directions/compare 는 범용이라 남겨두었다.

    // 귀가콜 자동 도착 알림 핸들러
    // 🚨 TODO(미구현) — Phase 4에서 서버 구현 예정
    // 서버에 `auto-arrived` emit이 0건이라 이 핸들러는 현재 절대 호출되지 않습니다.
    // (geoService.processDriverMovement의 도착 감지 자체가 죽어 있음 — getLastDropoffCoord 참조)
    useEffect(() => {
        const onAutoArrived = (data: { message: string }) => {
            if (confirm(data.message + "\n\n배달 완료 처리하시겠습니까?")) {
                console.log("🏁 사용자 도착 확인");
            }
        };
        socket.on("auto-arrived", onAutoArrived);
        return () => {
            socket.off("auto-arrived", onAutoArrived);
        };
    }, []);

    // [이슈 W] 서버 재시작 복구 알림
    // 서버는 DB의 진행 중 콜로부터 배차 상태(합짐/차종/회랑)를 다시 파생시킨다.
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

    return (
        <main className="min-h-screen bg-bg-base font-sans pb-24">

            {/* 📍 공통 헤더 컴포넌트 */}
            <Header isConnected={isConnected} />

            <div className="flex flex-col max-w-2xl mx-auto">

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

                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 (클릭 시 설정 모달 띄움) */}
                <OrderFilterStatus onOpenFilter={() => setIsFilterModalOpen(true)} />

                {/* 🚚 내 차 정보 및 적재/이동 상태 패널 */}
                <VehicleStatusPanel mainCall={mainCall} subCalls={subCalls} />

                {/* 🏆 배차 확정 콜 (및 데스밸리 연산 구역) */}
                <PinnedRoute 
                    activeRoute={activeRoute} 
                    isTestMode={isTestMode}
                    onDecision={handleDecision} 
                    onRecalculate={handleRecalculate} 
                    viewFilter={viewFilter}
                    setViewFilter={setViewFilter}
                />
            </div>

            {/* 필터 설정 모달 */}
            <OrderFilterModal
                isOpen={isFilterModalOpen}
                onClose={() => setIsFilterModalOpen(false)}
                hasHomeReturnActive={hasHomeReturnActive}
                isTestMode={isTestMode}
                setIsTestMode={setIsTestMode}
            />

        </main>
    );
}
