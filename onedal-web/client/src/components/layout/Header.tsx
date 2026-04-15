import { useState, useEffect } from "react";

export default function Header({ isConnected }: { isConnected: boolean }) {
    const [time, setTime] = useState<Date>(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md border-b border-white/10 px-4 py-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                        1DAL
                    </h1>
                </div>
                <div className="flex gap-3">
                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                        <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-red-500"}`} />
                        <span className="text-xs font-bold text-slate-400">접속됨</span>
                    </div>
                    <div className="flex flex-col items-end justify-center px-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase leading-none mb-0.5">서버 시간</span>
                        <span className="text-sm font-black text-slate-200 tabular-nums leading-none tracking-tight">
                            {time.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
}
