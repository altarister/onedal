import { useFilterConfig } from "../../hooks/useFilterConfig";

export default function OrderFilterStatus({ onOpenFilter }: { onOpenFilter: () => void }) {
    const { filter } = useFilterConfig();

    if (!filter) {
        return (
            <section className="flex items-center justify-center rounded-xl px-4 py-3 border shadow-md bg-slate-900 border-slate-800">
                <span className="text-slate-500 text-sm font-bold">오더 필터 동기화 중...</span>
            </section>
        );
    }

    let label = '대기';
    if (filter.isActive) {
        label = filter.isSharedMode ? '합짐' : '단독';
    }

    const getStatusStyles = (active: boolean, shared: boolean) => {
        if (!active) return { badge: 'bg-amber-500 text-black px-2 py-0.5 rounded-md border border-amber-400', border: 'bg-amber-950/40 border-amber-500/50 hover:bg-amber-900/50' };
        if (shared) return { badge: 'bg-purple-600 text-white px-2 py-0.5 rounded-md border border-purple-400', border: 'bg-purple-950/30 border-purple-500/40 hover:bg-purple-900/40' };
        return { badge: 'bg-blue-600 text-white px-2 py-0.5 rounded-md border border-blue-400', border: 'bg-indigo-950/30 border-indigo-500/30 hover:bg-indigo-900/40' };
    };

    const styles = getStatusStyles(filter.isActive, filter.isSharedMode);

    return (
        <section
            onClick={onOpenFilter}
            className={`flex items-center justify-between cursor-pointer rounded-xl px-4 py-3 border shadow-md transition-all active:scale-95 ${styles.border}`}
        >
            <div className="flex items-center gap-3 text-sm font-black text-white tracking-tight">
                <span className={styles.badge}>
                    {label}
                </span>
                <span className="text-emerald-400">{(filter.minFare / 10000).toFixed(1)}</span>
                <span className="text-slate-600 font-medium">|</span>
                <span className="text-slate-300">{filter.pickupRadiusKm}km</span>
                <span className="text-slate-600 font-medium">|</span>
                <span className="text-indigo-300">{filter.destinationCity}({filter.destinationRadiusKm}km)</span>
                {filter.model && (
                    <>
                        <span className="text-slate-600 font-medium">|</span>
                        <span className="text-orange-300">{filter.model}</span>
                    </>
                )}
            </div>
            <div className={`text-lg sm:text-xl`}>
                ⚙️
            </div>
        </section>
    );
}
