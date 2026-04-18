import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";

export default function Header({ isConnected }: { isConnected: boolean }) {
    const [time, setTime] = useState<Date>(new Date());
    const { user, logout } = useAuth();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <header className="sticky top-0 z-10 bg-slate-950/80 backdrop-blur-md border-b border-white/10 px-4 py-2">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                        1DAL
                    </h1>
                </div>
                <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                        <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-red-500"}`} />
                        <span className="text-xs font-bold text-slate-400">
                            {time.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                    </div>

                    {user && (
                        <div className="flex items-center gap-3 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800">
                            {user.avatar ? (
                                <img src={user.avatar} alt="Avatar" className="w-5 h-5 rounded-full" />
                            ) : (
                                <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-[10px] text-white font-bold">
                                    {user.name.charAt(0)}
                                </div>
                            )}
                            <span className="text-xs font-bold text-slate-300 hidden sm:inline">{user.name}</span>
                            <button 
                                onClick={logout}
                                className="text-xs text-red-500 hover:text-red-400 font-semibold"
                            >
                                로그아웃
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}

