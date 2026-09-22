import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../contexts/AuthContext";
import SettingsModal from "../dashboard/SettingsModal";
import { VehicleLogoSummary } from "../dashboard/VehicleStatusPanel";
import type { SecuredOrder } from "@onedal/shared";
import { useServerClock } from "../../hooks/useServerClock";
import { serverNow, isSynced, isDrifting } from "../../lib/serverClock";
import { formatClock } from "../../lib/clock";
import { useSoundManager } from "../../hooks/useSoundManager";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";


export default function Header({ isConnected, liveCalls, onMenu }: {
    isConnected: boolean;
    liveCalls?: SecuredOrder[];
    /** ☰ 를 누르면 왼쪽 서랍이 열린다 — 안 주면 버튼을 안 그린다(로그인 등 서랍 없는 화면) */
    onMenu?: () => void;
}) {
    /**
     * 🕐 **서버 시계다 — 폰 시계가 아니다** (기사님:
     *    *"폰 시계가 아니고 서버 시계로 만들어야 해.. 그래야 서버 시간으로 우리가 계산하지."*)
     *
     * 🔴 여기는 **서버 연결 점 바로 옆**이라 «서버가 말한 시각»으로 읽힌다. 상차 마감·안전취소 30초는
     *    서버 시각으로 재므로, 폰 시계(`new Date()`)를 쓰면 폰 시계가 틀어졌을 때
     *    화면과 판정이 **아무 신호 없이** 갈라진다.
     */
    const clock = useServerClock();
    const [tick, setTick] = useState(() => Date.now());
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { user } = useAuth();
    const { isRinging, stopAll } = useSoundManager();

    useEffect(() => {
        const timer = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    /**
     * 헤더 높이를 `--header-h` 로 내보낸다.
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
            <header ref={headerRef} className="sticky top-0 z-20 bg-bg-base/95 backdrop-blur-sm border-b border-border-card px-3 py-2.5">
                <div className="flex items-center justify-between max-w-2xl mx-auto">
                    <div className="flex items-center gap-3">
                        {/* ☰ **왼쪽 서랍을 연다** — 끝난 콜(완료됨·취소·방출)이 사는 자리.
                            🔴 로고와 떼어 놓는다(gap-3). 붙이면 운전 중 잘못 눌러 엉뚱한 것이 열린다 */}
                        {onMenu && (
                            <button onClick={onMenu} aria-label="메뉴 열기"
                                className="shrink-0 w-9 h-9 -ml-1 flex items-center justify-center rounded-lg
                                           text-text-primary focus:outline-none active:scale-95 transition-transform">
                                <span className="text-xl leading-none">☰</span>
                            </button>
                        )}
                        {/* 🚚 로고 자리 = 내 차 상황 (기사님: "영역을 아끼자").
                            🔴 테마 전환은 **서랍 발**에 둔다 — 여기 두면 운행 중 오탭으로 화면이 뒤집힌다.
                            liveCalls 없는 화면(로그인 등)은 1DAL 그대로 */}
                        <div className="text-left">
                            {liveCalls ? <VehicleLogoSummary liveCalls={liveCalls} /> : (
                                <h1 className="text-2xl font-black tracking-tighter text-text-primary">1DAL</h1>
                            )}
                        </div>
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
                            {/**
                              * 🔴 **맞췄는지를 화면이 말한다.** 못 맞췄으면 지금 보이는 것은
                              *    **폰 시계**이고, 30초 넘게 틀어졌으면 폰 시계가 그만큼 어긋나 있다.
                              *    말 안 하면 화면이 조용히 거짓말한다.
                              */}
                            {isConnected && !isSynced(clock) && (
                                <span className="text-[10px] font-black text-warning" title="서버 시계를 못 맞췄습니다 — 지금은 폰 시계입니다">📵</span>
                            )}
                            {isConnected && isDrifting(clock) && (
                                <span className="text-[10px] font-black text-warning"
                                      title={`폰 시계가 서버와 ${Math.round((clock?.offsetMs ?? 0) / 1000)}초 어긋나 있습니다`}>⚠️</span>
                            )}
                            <span className="text-xs font-mono font-bold text-text-muted tracking-wide">
                                {/* ⚠️ 포맷은 `lib/clock` 하나에 있다 — 여기서 또 만들면 같은 화면에 두 모양이 뜬다 */}
                                {isConnected ? formatClock(serverNow(clock, tick)) : "☁️ 서버 끊김"}
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

