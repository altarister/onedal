import type { SecuredOrder, SimplifiedOfficeOrder } from "@onedal/shared";
import type { SimResult } from "../../hooks/useKakaoRouting";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";

export default function DrillDownModal({ 
    selectedOrder, 
    activeOrderSim, 
    mainCall, 
    onClose, 
    onReject, 
    onAccept 
}: { 
    selectedOrder: SecuredOrder | SimplifiedOfficeOrder | null, 
    activeOrderSim: SimResult | undefined,
    mainCall: SecuredOrder | SimplifiedOfficeOrder | null,
    onClose: () => void,
    onReject: (id: string) => void,
    onAccept: (order: SecuredOrder | SimplifiedOfficeOrder) => void
}) {
    // selectedOrder가 넘길 때만 모달을 표시
    const isOpen = !!selectedOrder;
    if (!selectedOrder) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md bg-surface border-border-card text-text-primary">
                <DialogHeader>
                    <DialogTitle>{mainCall ? "합짐 우회율 검수" : "단독 배차 검수"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mb-6">
                    <div>
                        <p className="text-xs font-bold text-text-muted mb-1">상차지</p>
                        <p className="text-lg font-black">{selectedOrder.pickup}</p>
                    </div>
                    <div>
                        <p className="text-xs font-bold text-text-muted mb-1">하차지</p>
                        <p className="text-lg font-black">{selectedOrder.dropoff}</p>
                    </div>
                    <div>
                        <p className="text-xl font-black text-success">{selectedOrder.fare.toLocaleString()}원</p>
                    </div>
                </div>
                
                {/* 카카오 연동 시뮬레이션 결과창 */}
                <div className={`bg-surface-alt/40 rounded-2xl p-4 border mb-4 transition-all ${activeOrderSim?.isGood ? 'border-success/30 bg-success/10' : 'border-border'}`}>
                    <div className="text-sm font-medium">
                        {!activeOrderSim || activeOrderSim.isLoading ? (
                            <p className="animate-pulse flex items-center gap-2 text-text-muted">
                                <span className="w-4 h-4 border-2 border-success border-t-transparent rounded-full animate-spin"></span>
                                {mainCall ? "카카오 우회 경로 분석 중..." : "단독 동선 계산 중..."}
                            </p>
                        ) : (
                            <div className="space-y-1">
                                <p className={activeOrderSim.isGood ? "text-success font-bold" : "text-warning font-bold"}>
                                    {activeOrderSim.timeExt}
                                </p>
                                <p className="text-text-muted text-xs mt-1">{activeOrderSim.distExt}</p>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="bg-warning/10 text-warning/80 text-xs p-3 rounded-xl border border-warning/30">
                    적요: 박스 두 개, 기사님 도착 20분 전 연락 필, 지게차 상차
                </div>

                <DialogFooter className="flex flex-row gap-2 w-full pt-4 sm:justify-start">
                    <Button 
                        variant="secondary" 
                        size="lg" 
                        className="flex-1 text-lg" 
                        onClick={() => onReject(selectedOrder.id as string)}
                    >
                        ❌ 뱉기
                    </Button>
                    <Button 
                        size="lg" 
                        className="flex-[2] text-lg font-black bg-success hover:bg-success/80 text-white shadow-[0_0_15px_var(--theme-glow-primary)]" 
                        disabled={activeOrderSim?.isLoading}
                        onClick={() => onAccept(selectedOrder)}
                    >
                        ✅ {mainCall ? "합짐 수락" : "단독 배차 확정"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
