import type { SimplifiedOfficeOrder } from "@onedal/shared";
import type { SimResult } from "../../hooks/useKakaoRouting";

export default function PendingOrderList({ 
    pendingOrders, 
    simulationResults, 
    onOpenModal 
}: { 
    pendingOrders: SimplifiedOfficeOrder[], 
    simulationResults: Record<string, SimResult>, 
    onOpenModal: (order: SimplifiedOfficeOrder) => void 
}) {
    const formatTime = (iso: string) => {
        const d = new Date(iso);
        return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
    };

    return (
        <section id="pending-list" className="pt-2">
            <div className="space-y-2">
                {pendingOrders.map(order => {
                    const sim = order.id ? simulationResults[order.id] : null;
                    const isGoodIndicator = sim && sim.isGood;

                    return (
                        <div 
                            key={order.id} 
                            onClick={() => onOpenModal(order)}
                            className={`bg-slate-900/80 hover:bg-slate-800 border cursor-pointer rounded-xl p-3 transition-all active:scale-95 ${sim && isGoodIndicator ? 'border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'border-slate-800'}`}
                        >
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] text-slate-500 bg-black/50 px-1.5 py-0.5 rounded flex items-center justify-center">
                                    {formatTime(order.timestamp)}
                                </span>
                                <div className="flex items-center gap-2">
                                    {sim && !sim.isLoading && <span className="text-[10px]">{sim.isGood ? '🟢' : '🔴'}</span>}
                                    <span className="text-emerald-400 font-bold tracking-tight">{(order.fare / 10000).toFixed(1)}만</span>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <div>
                                    <div className="text-[10px] text-slate-500 font-bold tracking-widest mb-1">상차지</div>
                                    <div className="text-sm font-black text-rose-400 bg-rose-500/10 px-2 py-1 rounded inline-block">
                                        {order.pickup}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-[10px] text-slate-500 font-bold tracking-widest mb-1">하차지</div>
                                    <div className="text-sm font-black text-sky-400 bg-sky-500/10 px-2 py-1 rounded inline-block">
                                        {order.dropoff}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                
                {pendingOrders.length === 0 && (
                    <div className="py-8 text-center border border-dashed border-slate-800 rounded-2xl">
                        <p className="text-slate-600 text-sm font-medium">새로운 콜 탐색 중...</p>
                    </div>
                )}
            </div>
        </section>
    );
}
