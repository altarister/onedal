import type { SecuredOrder } from "@onedal/shared";
import Header from "../components/layout/Header";
import DeviceControlPanel from "../components/dashboard/DeviceControlPanel";
import OrderFilterStatus from "../components/dashboard/OrderFilterStatus";
import OrderFilterModal from "../components/dashboard/OrderFilterModal";
import VehicleStatusPanel from "../components/dashboard/VehicleStatusPanel";
import PinnedRoute from "../components/dashboard/PinnedRoute";
import DrillDownModal from "../components/dashboard/DrillDownModal";
import { useState, useEffect } from "react";
import { socket } from "../lib/socket";

import { useOrderEngine } from "../hooks/useOrderEngine";
import { useKakaoRouting } from "../hooks/useKakaoRouting";



export default function Dashboard() {
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [isTestMode, setIsTestMode] = useState(false);

    const {
        orders,
        isConnected,
        mainCall,
        subCalls,
        rejectedCallIds,
        selectedOrder,
        setSelectedOrder,
        handleDecision,
        handleRecalculate,
    } = useOrderEngine();

    const activeRoute = [mainCall, ...subCalls].filter(Boolean) as SecuredOrder[];
    const hasHomeReturnActive = activeRoute.some(o => o.receiptStatus === '귀가' || o.id?.startsWith('home-'));

    // 대기열 콜 필터링
    const pendingOrders = orders.filter(
        (o) => o.id && !rejectedCallIds.has(o.id) && o.id !== mainCall?.id && !subCalls.some((s) => s.id === o.id)
    ).reverse();

    // 카카오 자동 시뮬레이션 엔진 훅
    const { simulationResults } = useKakaoRouting(pendingOrders, mainCall);

    // 귀가콜 자동 도착 알림 핸들러
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

    return (
        <main className="min-h-screen font-sans pb-32">

            {/* 📍 공통 헤더 컴포넌트 */}
            <Header isConnected={isConnected} />

            <div className="p-1.5 space-y-1 max-w-2xl mx-auto">

                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 (클릭 시 설정 모달 띄움) */}
                <OrderFilterStatus onOpenFilter={() => setIsFilterModalOpen(true)} />

                {/* 🚚 내 차 정보 및 적재/이동 상태 패널 */}
                <VehicleStatusPanel />

                {/* 🏆 배차 확정 콜 (및 데스밸리 연산 구역) */}
                <PinnedRoute 
                    activeRoute={activeRoute} 
                    isTestMode={isTestMode}
                    onDecision={handleDecision} 
                    onRecalculate={handleRecalculate} 
                />
            </div>

            <DrillDownModal
                selectedOrder={selectedOrder!}
                activeOrderSim={selectedOrder && selectedOrder.id ? simulationResults[selectedOrder.id] : undefined}
                mainCall={mainCall}
                onClose={() => setSelectedOrder(null)}
                onReject={() => setSelectedOrder(null)}
                onAccept={() => alert("웹 관제탑에서는 수동 배차를 지원하지 않습니다 (앱에서 자동 확정 됨)")}
            />

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
