import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import SettingsModal from "../dashboard/SettingsModal";
import { useTheme } from "../../contexts/ThemeContext";
import { useSoundManager } from "../../hooks/useSoundManager";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";


export default function Header({ isConnected }: { isConnected: boolean }) {
    const [time, setTime] = useState<Date>(new Date());
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { user } = useAuth();
    const { toggleTheme } = useTheme();
    const { isRinging, stopAll } = useSoundManager();

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    /**
     * [Phase 8.5] 헤더 높이를 `--header-h` 로 내보낸다.
     *
     * 헤더가 `sticky top-0` 이라, 아래에 또 sticky 를 붙이면 **헤더 밑으로 파묻힌다.**
     * 콜 탭 바가 `top: var(--header-h)` 로 걸리려면 실제 높이가 필요하다.
     * 하드코딩하면 폰트 크기·세이프에어리어·알림 버튼 유무로 어긋난다.
     */
    const headerRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = headerRef.current;
        if (!el) return;
        const apply = () => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`);
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <>
            <header ref={headerRef} className="sticky top-0 z-20 bg-bg-base/95 backdrop-blur-sm border-b border-border-card px-4 py-2.5">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                    <div className="flex items-center gap-2">
                        <button onClick={toggleTheme} className="focus:outline-none active:scale-95 transition-transform">
                            <h1 className="text-2xl font-black tracking-tighter text-text-primary">
                                1DAL
                            </h1>
                        </button>
                    </div>
                    <div className="flex gap-2 items-center">
                        {isRinging && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={stopAll}
                                className="h-7 px-2 text-[10px] font-black uppercase tracking-tighter animate-pulse"
                                title="알림 소리 끄기"
                            >
                                STOP SOUND
                            </Button>
                        )}
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-soft ${isConnected ? "bg-surface" : "bg-danger/10"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-success animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-danger"}`} />
                            <span className="text-xs font-mono font-bold text-text-muted tracking-wide">
                                {isConnected ? (time.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })) : "연결끊김"}
                            </span>
                        </div>

                        {user && (
                            <button
                                onClick={() => setIsSettingsOpen(true)}
                                className="focus:outline-none hover:opacity-80 transition-opacity active:scale-95"
                            >
                                <Avatar className="w-7 h-7 border border-border-card">
                                    <AvatarImage src={user.avatar || undefined} alt={user.name} />
                                    <AvatarFallback className="bg-info text-white text-xs font-bold">
                                        {user.name.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </>
    );
}

