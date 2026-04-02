import { useNavigate } from "react-router-dom";

export default function OrderFilterStatus({ filterStatus }: { filterStatus: '첫짐' | '대기' | '합짐' }) {
    const navigate = useNavigate();
    
    // 상태별 배지 색상 매핑
    const getStatusColor = (status: string) => {
        if (status === '대기') return 'bg-amber-500 text-black px-2 py-0.5 rounded-md border border-amber-400';
        if (status === '합짐') return 'bg-purple-600 text-white px-2 py-0.5 rounded-md border border-purple-400';
        return 'bg-blue-600 text-white px-2 py-0.5 rounded-md border border-blue-400';
    };

    return (
        <section 
            onClick={() => navigate('/settings/filter')}
            className={`flex items-center justify-between cursor-pointer rounded-xl px-4 py-3 border shadow-md transition-all active:scale-95 ${
                filterStatus === '대기' ? 'bg-amber-950/40 border-amber-500/50 hover:bg-amber-900/50' : 
                filterStatus === '합짐' ? 'bg-purple-950/30 border-purple-500/40 hover:bg-purple-900/40' :
                'bg-indigo-950/30 border-indigo-500/30 hover:bg-indigo-900/40'
            }`}
        >
            <div className="flex items-center gap-3 text-sm font-black text-white tracking-tight">
                <span className={getStatusColor(filterStatus)}>
                    {filterStatus === '대기' ? '⏸️ 통신 대기' : `🎯 ${filterStatus} 사냥`}
                </span>
                <span className="text-emerald-400">4만원</span>
                <span className="text-slate-600 font-medium">|</span>
                <span className="text-slate-300">상차 10km</span>
                <span className="text-slate-600 font-medium">|</span>
                <span className="text-indigo-300">용인시(10km)</span>
            </div>
            <div className={`text-lg sm:text-xl ${filterStatus === '대기' ? 'text-amber-400 animate-spin-slow' : 'text-slate-400'}`}>
                ⚙️
            </div>
        </section>
    );
}
