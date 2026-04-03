import { useFilterConfig } from "../../hooks/useFilterConfig";

export default function OrderFilterStatus({ onOpenFilter }: { onOpenFilter: () => void }) {
    const { filter } = useFilterConfig();

    // 상태별 배지 색상 매핑
    const getStatusColor = (status: string) => {
        if (status === '대기') return 'bg-amber-500 text-black px-2 py-0.5 rounded-md border border-amber-400';
        if (status === '합짐') return 'bg-purple-600 text-white px-2 py-0.5 rounded-md border border-purple-400';
        return 'bg-blue-600 text-white px-2 py-0.5 rounded-md border border-blue-400';
    };

    if (!filter) {
        return (
            <section className="flex items-center justify-center rounded-xl px-4 py-3 border shadow-md bg-slate-900 border-slate-800">
                <span className="text-slate-500 text-sm font-bold">오더 필터 동기화 중...</span>
            </section>
        );
    }

    return (
        <section
            onClick={onOpenFilter}
            className={`flex items-center justify-between cursor-pointer rounded-xl px-4 py-3 border shadow-md transition-all active:scale-95 ${filter.mode === '대기' ? 'bg-amber-950/40 border-amber-500/50 hover:bg-amber-900/50' :
                filter.mode === '합짐' ? 'bg-purple-950/30 border-purple-500/40 hover:bg-purple-900/40' :
                    'bg-indigo-950/30 border-indigo-500/30 hover:bg-indigo-900/40'
                }`}
        >
            <div className="flex items-center gap-3 text-sm font-black text-white tracking-tight">
                <span className={getStatusColor(filter.mode)}>
                    {filter.mode === '대기' ? '⏸️ 통신 대기' : `${filter.mode}`}
                </span>
                <span className="text-emerald-400">{(filter.minFare / 10000).toLocaleString()}</span>
                <span className="text-slate-600 font-medium">|</span>
                <span className="text-slate-300">{filter.pickupRadius}km</span>
                <span className="text-slate-600 font-medium">|</span>
                <span className="text-indigo-300">{filter.targetCity}({filter.targetRadius}km)</span>
            </div>
            <div className={`text-lg sm:text-xl ${filter.mode === '대기' ? 'text-amber-400 animate-spin-slow' : 'text-slate-400'}`}>
                ⚙️
            </div>
        </section>
    );
}
