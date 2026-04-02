import { useState, useEffect } from "react";

export default function DeviceControlPanel() {
    const [device1Mode, setDevice1Mode] = useState<"AUTO" | "MANUAL">("AUTO");
    const [device2Mode, setDevice2Mode] = useState<"AUTO" | "MANUAL">("MANUAL");
    
    // CPS (토스트 폴링 동기화) 로직 목업 - 1초 단위 카운트다운
    const [timeLeft, setTimeLeft] = useState(3);
    
    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) return Math.floor(2 + Math.random() * 2); // 2~3초 리셋
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <section id="telemetry-panel" className="bg-slate-900 border border-slate-800 rounded-xl p-2 shadow-lg">
            <div className="flex flex-col gap-2">
                {/* 앱폰 1호기 */}
                <div id="device-1" className="flex justify-between items-center bg-black/20 rounded-lg px-3 py-1.5 border border-white/5">
                    <span className="text-sm font-bold text-white w-28 shrink-0 flex items-center gap-1">
                        📱 1호기 <span className="text-[10px] text-fuchsia-400 font-black tracking-tighter w-8 text-center bg-fuchsia-400/10 rounded">[ {timeLeft}s ]</span>
                    </span>
                    <div className="hidden sm:flex gap-3 text-[11px] font-medium tracking-tight whitespace-nowrap">
                        <span className="text-slate-400">수집: 240</span>
                        <span className="text-emerald-400">수락: 3</span>
                        <span className="text-red-400">취소: 0</span>
                    </div>
                    <button 
                        onClick={() => setDevice1Mode(prev => prev === "AUTO" ? "MANUAL" : "AUTO")}
                        className={`text-xs px-3 py-1 rounded-md font-black transition-colors ${
                            device1Mode === "AUTO" 
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]" 
                            : "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                        }`}
                    >
                        {device1Mode === "AUTO" ? "🚀 풀오토" : "✋ 반자동"}
                    </button>
                </div>

                {/* 앱폰 2호기 */}
                <div id="device-2" className="flex justify-between items-center bg-black/20 rounded-lg px-3 py-1.5 border border-white/5 opacity-70">
                    <span className="text-sm font-bold text-white w-28 shrink-0 flex items-center gap-1">
                        📱 2호기 <span className="text-[10px] text-slate-500 font-bold tracking-tighter w-8 text-center bg-slate-800 rounded">[ 대기 ]</span>
                    </span>
                    <div className="hidden sm:flex gap-3 text-[11px] font-medium tracking-tight whitespace-nowrap">
                        <span className="text-slate-400">수집: 18</span>
                        <span className="text-emerald-400">수락: 0</span>
                        <span className="text-red-400">취소: 0</span>
                    </div>
                    <button 
                        onClick={() => setDevice2Mode(prev => prev === "AUTO" ? "MANUAL" : "AUTO")}
                        className={`text-xs px-3 py-1 rounded-md font-black transition-colors ${
                            device2Mode === "AUTO" 
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                            : "bg-slate-800 text-slate-500 border border-slate-700"
                        }`}
                    >
                        {device2Mode === "AUTO" ? "🚀 풀오토" : "✋ 반자동"}
                    </button>
                </div>
            </div>
        </section>
    );
}
