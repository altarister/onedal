import type { SecuredOrder } from "@onedal/shared";
import Header from "../components/layout/Header";
import DeviceControlPanel from "../components/dashboard/DeviceControlPanel";
import OrderFilterStatus from "../components/dashboard/OrderFilterStatus";
import OrderFilterModal from "../components/dashboard/OrderFilterModal";
import PinnedRoute from "../components/dashboard/PinnedRoute";
import DrillDownModal from "../components/dashboard/DrillDownModal";
import { useState } from "react";

import { useOrderEngine } from "../hooks/useOrderEngine";
import { useKakaoRouting } from "../hooks/useKakaoRouting";

export default function Dashboard() {
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

    const {
        orders,
        isConnected,
        mainCall,
        subCalls,
        rejectedCallIds,
        selectedOrder,
        setSelectedOrder,
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
            <Header isConnected={isConnected} />

            <div className="p-2 space-y-2 max-w-2xl mx-auto">
                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 (클릭 시 설정 모달 띄움) */}
                <OrderFilterStatus onOpenFilter={() => setIsFilterModalOpen(true)} />

                {/* 🏆 배차 확정 콜 (및 데스밸리 연산 구역) */}
                <PinnedRoute activeRoute={activeRoute} onDecision={handleDecision} />

                {/* 📡 관제 대기 중 (Empty State) */}
                {activeRoute.length === 0 && (
                    <div className="flex-1 mt-12 py-16 flex flex-col items-center justify-center border-2 border-dashed border-slate-800/60 bg-slate-900/20 rounded-3xl mx-2 transition-all">
                        <div className="relative">
                            <div className="text-5xl mb-4 relative z-10 animate-bounce transition-transform">🤖</div>
                            <div className="absolute inset-0 bg-fuchsia-500/20 blur-xl rounded-full"></div>
                        </div>
                        <h3 className="text-lg font-black text-slate-400 mb-2 tracking-wider mt-4">실시간 자동 사냥 중</h3>
                        <p className="text-slate-500 text-xs text-center leading-relaxed">
                            연동된 기기들이 인성 서버를 스캔하고 있습니다<br/>
                            조건에 맞는 꿀콜을 낚아채면 즉시 보고합니다
                        </p>
                    </div>
                )}
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
            />

        </main>
    );
}
