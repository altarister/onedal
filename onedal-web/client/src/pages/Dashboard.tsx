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
    const [homeReturnLoading, setHomeReturnLoading] = useState(false);

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

    // 대기열 콜 필터링
    const pendingOrders = orders.filter(
        (o) => o.id && !rejectedCallIds.has(o.id) && o.id !== mainCall?.id && !subCalls.some((s) => s.id === o.id)
    ).reverse();

    // 카카오 자동 시뮬레이션 엔진 훅
    const { simulationResults } = useKakaoRouting(pendingOrders, mainCall);

    // 귀가콜 응답 핸들러
    useEffect(() => {
        const onAck = () => setHomeReturnLoading(false);
        const onError = (data: { message: string }) => {
            setHomeReturnLoading(false);
            alert(data.message);
        };
        const onAutoArrived = (data: { message: string }) => {
            if (confirm(data.message + "\n\n배달 완료 처리하시겠습니까?")) {
                // 사용자 확인 → 이미 서버에서 ARRIVED로 전환됨
                console.log("🏁 사용자 도착 확인");
            }
        };
        socket.on("home-return-ack", onAck);
        socket.on("home-return-error", onError);
        socket.on("auto-arrived", onAutoArrived);
        return () => {
            socket.off("home-return-ack", onAck);
            socket.off("home-return-error", onError);
            socket.off("auto-arrived", onAutoArrived);
        };
    }, []);

    const handleHomeReturn = () => {
        setHomeReturnLoading(true);
        socket.emit("create-home-return");
    };

    return (
        <main className="min-h-screen font-sans pb-32">

            {/* 📍 공통 헤더 컴포넌트 */}
            <Header isConnected={isConnected} />

            <div className="p-2 space-y-2 max-w-2xl mx-auto">

                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 (클릭 시 설정 모달 띄움) */}
                <OrderFilterStatus onOpenFilter={() => setIsFilterModalOpen(true)} />

                {/* 🚚 내 차 정보 및 적재/이동 상태 패널 */}
                <VehicleStatusPanel />

                {/* 🏆 배차 확정 콜 (및 데스밸리 연산 구역) */}
                <PinnedRoute activeRoute={activeRoute} onDecision={handleDecision} onRecalculate={handleRecalculate} />

                {/* 📡 관제 대기 중 (Empty State) */}
                {activeRoute.length === 0 && (
                    <div className="flex-1 mt-12 py-12 flex flex-col items-center justify-center border-2 border-dashed border-border bg-muted/30 rounded-3xl mx-2 transition-all">
                        <h3 className="text-lg font-black text-foreground mb-2 tracking-wider mt-4">실시간 자동 사냥 중</h3>
                        <p className="text-muted-foreground text-xs text-center leading-relaxed mb-6">
                            연동된 기기들이 인성 서버를 스캔하고 있습니다<br />
                            조건에 맞는 꿀콜을 낚아채면 즉시 보고합니다
                        </p>
                        <button
                            onClick={handleHomeReturn}
                            disabled={homeReturnLoading}
                            className={`px-6 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-400 text-white font-black text-sm tracking-wider shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] transition-all active:scale-[0.98] ${homeReturnLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {homeReturnLoading ? '⏳ 경로 계산 중...' : '🏠 귀가콜 시작'}
                        </button>
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
