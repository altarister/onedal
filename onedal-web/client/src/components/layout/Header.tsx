import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import SettingsModal from "../dashboard/SettingsModal";
import { useTheme } from "../../contexts/ThemeContext";
import { useSoundManager } from "../../hooks/useSoundManager";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

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
            <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button onClick={toggleTheme} className="flex items-center gap-1.5 focus:outline-none group">
                            <h1 className="text-xl font-black tracking-tighter bg-gradient-to-r from-emerald-500 to-cyan-500 bg-clip-text text-transparent">
                                1DAL
                            </h1>
                            <span className="text-sm opacity-60 group-hover:opacity-100 transition-opacity">
                                {theme === 'dark' ? '🌙' : '🌞'}
                            </span>
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
                        <Badge variant="outline" className={`gap-1.5 px-2 py-0.5 rounded-full ${isConnected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-rose-500/30 bg-rose-500/10 text-rose-500"}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" : "bg-rose-500"}`} />
                            <span className="font-bold font-mono">
                                {isConnected ? (time.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })) : "연결끊김"}
                            </span>
                        </Badge>

                        {user && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setIsSettingsOpen(true)}
                                    className="focus:outline-none hover:opacity-80 transition-opacity"
                                >
                                    <Avatar className="w-7 h-7 border border-border">
                                        <AvatarImage src={user.avatar || undefined} alt={user.name} />
                                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                                            {user.name.charAt(0)}
                                        </AvatarFallback>
                                    </Avatar>
                                </button>

                                <span className="text-xs font-bold text-muted-foreground hidden sm:inline">{user.name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </>
    );
}

