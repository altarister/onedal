import type { SecuredOrder } from "@onedal/shared";
import Header from "../components/layout/Header";
import DeviceControlPanel from "../components/dashboard/DeviceControlPanel";
import OrderFilterStatus from "../components/dashboard/OrderFilterStatus";
import PinnedRoute from "../components/dashboard/PinnedRoute";
import PendingOrderList from "../components/dashboard/PendingOrderList";
import DrillDownModal from "../components/dashboard/DrillDownModal";

import { useOrderEngine } from "../hooks/useOrderEngine";
import { useKakaoRouting } from "../hooks/useKakaoRouting";

export default function Dashboard() {
    const {
        orders,
        isConnected,
        filterStatus,
        mainCall,
        subCalls,
        rejectedCallIds,
        selectedOrder,
        setSelectedOrder,
        startMockSequence,
        handleSetMainCall,
        handleConfirmSub,
        handleDecision,
    } = useOrderEngine();

    const activeRoute = [mainCall, ...subCalls].filter(Boolean) as SecuredOrder[];
    
    // 대기열 콜 필터링
    const pendingOrders = orders.filter(
        (o) => o.id && !rejectedCallIds.has(o.id) && o.id !== mainCall?.id && !subCalls.some((s) => s.id === o.id)
    ).reverse();

    // 카카오 자동 시뮬레이션 엔진 훅
    const { simulationResults } = useKakaoRouting(pendingOrders, mainCall);

    return (
        <main className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-32">
            
            {/* 📍 공통 헤더 컴포넌트 */}
            <Header isConnected={isConnected} onTestClick={startMockSequence} />

            <div className="p-2 space-y-2 max-w-2xl mx-auto">
                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 (클릭 시 설정 이동) */}
                <OrderFilterStatus filterStatus={filterStatus} />

                {/* 🏆 배차 확정 콜 (및 데스밸리 연산 구역) */}
                <PinnedRoute activeRoute={activeRoute} onDecision={handleDecision} />

                {/* 📥 수신 대기열 리스트 */}
                <PendingOrderList 
                    pendingOrders={pendingOrders} 
                    simulationResults={simulationResults} 
                    onOpenModal={setSelectedOrder} 
                />
            </div>

            {/* 💎 팝업 드릴다운 모달 */}
            <DrillDownModal 
                selectedOrder={selectedOrder!}
                activeOrderSim={selectedOrder && selectedOrder.id ? simulationResults[selectedOrder.id] : undefined}
                mainCall={mainCall}
                onClose={() => setSelectedOrder(null)}
                onReject={() => setSelectedOrder(null)}
                onAccept={mainCall ? handleConfirmSub : handleSetMainCall}
            />

        </main>
    );
}
