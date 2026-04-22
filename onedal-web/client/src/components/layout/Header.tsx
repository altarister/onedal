import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import SettingsModal from "../dashboard/SettingsModal";
import { useTheme } from "../../contexts/ThemeContext";
import { useSoundManager } from "../../hooks/useSoundManager";

export default function Header({ isConnected }: { isConnected: boolean }) {
    const [time, setTime] = useState<Date>(new Date());
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { isRinging, stopAll } = useSoundManager();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <>
            <header className="sticky top-0 z-10 bg-bg-base/80 backdrop-blur-md border-b border-border-card px-4 py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={toggleTheme} className="flex items-center gap-1.5 focus:outline-none group">
                            <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-success to-info-alt bg-clip-text text-transparent">
                                1DAL
                            </h1>
                            <span className="text-sm opacity-60 group-hover:opacity-100 transition-opacity">
                                {theme === 'dark' ? '🌙' : '🌞'}
                            </span>
                        </button>
                    </div>
                    <div className="flex gap-2 items-center">
                        {isRinging && (
                            <button
                                onClick={stopAll}
                                className="flex items-center gap-1.5 px-2 py-0.5 bg-danger/20 hover:bg-danger/30 text-danger rounded-md border border-danger/30 transition-all animate-pulse"
                                title="알림 소리 끄기"
                            >
                                <span className="text-[10px] font-black uppercase tracking-tighter">STOP SOUND</span>
                            </button>
                        )}
                        <div className="flex items-center gap-2 bg-surface px-2 py-1 rounded-full border border-border-card">
                            <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-success shadow-lg" : "bg-danger"}`} />
                            <span className="text-xs font-bold text-slate-400">
                                {isConnected ? (time.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })) : "연결끊김"}
                                {/* {time.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })} */}
                            </span>
                        </div>

                        {user && (
                            <div className="flex items-center">
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="text-xs text-slate-400 hover:text-white font-semibold transition-colors"
                                >
                                    {user.avatar ? (
                                        <img src={user.avatar} alt="Avatar" className="w-5 h-5 rounded-full" />
                                    ) : (
                                        <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center text-[10px] text-white font-bold">
                                            {user.name.charAt(0)}
                                        </div>
                                    )}
                                </button>

                                <span className="text-xs font-bold text-slate-300 hidden sm:inline">{user.name}</span>

                            </div>
                        )}
                    </div>
                </div>
            </header>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </>
    );
}

