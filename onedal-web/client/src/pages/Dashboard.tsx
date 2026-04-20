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
import { useEmergencyAlerts } from "../hooks/useEmergencyAlerts";

const EMERGENCY_LABELS: Record<string, string> = {
    AUTO_CANCEL: "⏱️ 자동취소 실행됨",
    CANCEL_EXPIRED: "🔴 취소 불가 팝업! 배차실 직접 취소 요망!",
    UNKNOWN_SCREEN: "🟠 알 수 없는 화면에 진입함",
    BUTTON_NOT_FOUND: "🟡 버튼을 찾을 수 없음",
    APP_CRASH: "💀 앱 비정상 종료 후 재시작",
};

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
        handleRecalculate,
    } = useOrderEngine();

    const { alerts, warnings, dismissAlert, dismissWarning } = useEmergencyAlerts();

    const activeRoute = [mainCall, ...subCalls].filter(Boolean) as SecuredOrder[];

    // 대기열 콜 필터링
    const pendingOrders = orders.filter(
        (o) => o.id && !rejectedCallIds.has(o.id) && o.id !== mainCall?.id && !subCalls.some((s) => s.id === o.id)
    ).reverse();

    // 카카오 자동 시뮬레이션 엔진 훅
    const { simulationResults } = useKakaoRouting(pendingOrders, mainCall);

    return (
        <main className="min-h-screen font-sans pb-32">

            {/* 📍 공통 헤더 컴포넌트 */}
            <Header isConnected={isConnected} />

            <div className="p-2 space-y-2 max-w-2xl mx-auto">

                {/* 🚨 Safety Mode V3: 비상 알림 배너 */}
                {alerts.length > 0 && (
                    <div className="space-y-1">
                        {alerts.map((alert) => (
                            <div
                                key={alert.timestamp}
                                className="bg-red-500/15 border border-red-500/40 rounded-xl p-3 animate-pulse"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-xs font-black text-red-400">
                                            🚨 {alert.deviceId} — {EMERGENCY_LABELS[alert.reason] || alert.reason}
                                        </span>
                                        {alert.screenText && (
                                            <span className="text-[10px] text-red-300/60 truncate max-w-[300px]">
                                                화면: {alert.screenText.substring(0, 80)}...
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => dismissAlert(alert.timestamp)}
                                        className="text-red-400 hover:text-red-300 text-xs font-bold px-2"
                                    >✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ⚠️ Safety Mode V3: 데스밸리 타임아웃 경고 */}
                {warnings.length > 0 && (
                    <div className="space-y-1">
                        {warnings.map((w) => (
                            <div
                                key={w.orderId}
                                className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-black text-amber-400">
                                        ⚠️ {w.deviceId} — {w.message}
                                    </span>
                                    <button
                                        onClick={() => dismissWarning(w.orderId)}
                                        className="text-amber-400 hover:text-amber-300 text-xs font-bold px-2"
                                    >✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 🎛️ 앱폰 제어 패널 */}
                <DeviceControlPanel />

                {/* ⚙️ 오더 필터 한 줄 현황판 (클릭 시 설정 모달 띄움) */}
                <OrderFilterStatus onOpenFilter={() => setIsFilterModalOpen(true)} />

                {/* 🏆 배차 확정 콜 (및 데스밸리 연산 구역) */}
                <PinnedRoute activeRoute={activeRoute} onDecision={handleDecision} onRecalculate={handleRecalculate} />

                {/* 📡 관제 대기 중 (Empty State) */}
                {activeRoute.length === 0 && (
                    <div className="flex-1 mt-12 py-16 flex flex-col items-center justify-center border-2 border-dashed border-border-card bg-surface rounded-3xl mx-2 transition-all">
                        <h3 className="text-lg font-black text-text-primary mb-2 tracking-wider mt-4">실시간 자동 사냥 중</h3>
                        <p className="text-text-muted text-xs text-center leading-relaxed">
                            연동된 기기들이 인성 서버를 스캔하고 있습니다<br />
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
