import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession, ScreenContextType } from "@onedal/shared";
import { useSystemAlerts } from "../../hooks/useSystemAlerts";
import type { EmergencyAlert, DeathValleyWarning } from "../../hooks/useSystemAlerts";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import type { AutoDispatchFilter } from "@onedal/shared";

import { Card, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const EMERGENCY_LABELS: Record<string, string> = {
    AUTO_CANCEL: "⏱️ 자동취소 실행됨",
    CANCEL_EXPIRED: "🔴 취소 불가 팝업! 배차실 직접 취소 요망!",
    UNKNOWN_SCREEN: "🟠 알 수 없는 화면에 진입함",
    BUTTON_NOT_FOUND: "🟡 버튼을 찾을 수 없음",
    APP_CRASH: "💀 앱 비정상 종료 후 재시작",
};

/** ScreenContext → 한국어 라벨 + 색상 매핑 (물리적 화면 상태만 표시, 홀드는 isHolding으로 분리) */
const SCREEN_LABELS: Record<ScreenContextType, { label: string; color: string }> = {
    LIST: { label: "콜 리스트", color: "text-emerald-500 bg-emerald-500/15 border-emerald-500/20" },
    DETAIL_PRE_CONFIRM: { label: "상세페이지", color: "text-blue-400 bg-blue-400/15 border-blue-400/20" },
    DETAIL_CONFIRMED: { label: "확정페이지", color: "text-amber-500 bg-amber-500/15 border-amber-500/20" },
    POPUP_PICKUP: { label: "출발지 팝업", color: "text-blue-500 bg-blue-500/15 border-blue-500/20" },
    POPUP_DROPOFF: { label: "도착지 팝업", color: "text-blue-500 bg-blue-500/15 border-blue-500/20" },
    POPUP_MEMO: { label: "적요 팝업", color: "text-purple-500 bg-purple-500/15 border-purple-500/20" },
    POPUP_ERROR: { label: "취소 불가 팝업", color: "text-rose-500 bg-rose-500/20 animate-pulse border-rose-500/30" },
    UNKNOWN: { label: "알 수 없는 화면", color: "text-rose-500 bg-rose-500/20 animate-pulse border-rose-500/30" },
};

function DeviceRow({
    device,
    onModeChange,
    deviceAlerts,
    deviceWarnings,
    onDismissAlert,
    onDismissWarning,
    currentFilter
}: {
    device: DeviceSession;
    onModeChange: (id: string, mode: "AUTO" | "MANUAL") => void;
    deviceAlerts: EmergencyAlert[];
    deviceWarnings: DeathValleyWarning[];
    onDismissAlert: (timestamp: string) => void;
    onDismissWarning: (orderId: string) => void;
    currentFilter: AutoDispatchFilter | null;
}) {
    const isDisconnected = device.status === "OFFLINE";
    const screenInfo = device.screenContext ? SCREEN_LABELS[device.screenContext] : null;

    let filterLabel = '일시정지';
    let filterColor = 'bg-muted text-muted-foreground border-border';
    if (currentFilter) {
        if (!currentFilter.isActive) {
            filterLabel = '스캔 정지';
            filterColor = 'bg-amber-500/20 text-amber-500 border-amber-500/30';
        } else {
            const state = currentFilter.loadState || 'EMPTY';
            if (state === 'LOADING') {
                filterLabel = '합짐 탐색';
                filterColor = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
            } else if (state === 'DRIVING') {
                filterLabel = '경로 탐색';
                filterColor = 'bg-purple-500/20 text-purple-400 border-purple-500/30';
            } else if (state === 'ARRIVED') {
                filterLabel = '도착 대기';
                filterColor = 'bg-muted text-muted-foreground border-border';
            } else {
                filterLabel = '첫짐 탐색';
                filterColor = 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30';
            }
        }
    }

    // 알아서 잘 취소된 루틴 알림은 무시하고 오직 배차실 개입 등 치명적 알림만 선별
    const criticalAlerts = deviceAlerts.filter(a => a.reason !== 'AUTO_CANCEL' && a.reason !== 'BUTTON_NOT_FOUND');

    return (
        <div className="flex flex-col border-b border-border last:border-0 py-2 px-1">
            <div className="flex items-center justify-between hover:bg-muted/30 transition-colors rounded p-1">
                <div className={`flex flex-col gap-1 ${isDisconnected ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-3">
                        <span className="font-bold flex items-center gap-2">
                            <span className={`font-black text-[10px] px-1.5 rounded ${isDisconnected ? 'bg-rose-500/20 text-rose-500 animate-pulse' : 'text-emerald-500'}`}>
                                {device.deviceName || device.deviceId.slice(0, 8)}
                            </span>
                            {screenInfo && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${screenInfo.color}`}>
                                    {screenInfo.label}
                                </Badge>
                            )}
                        </span>
                        {/* [추가] 현재 적용된 필터 상태 표시 (온라인일 때만 최신 동기화로 간주) */}
                        {!isDisconnected && currentFilter && (
                            <Badge variant="outline" className={`text-[10px] font-extrabold px-1.5 py-0 rounded shadow-sm flex items-center gap-1 border ${filterColor}`}>
                                {filterLabel}
                            </Badge>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium ml-auto">
                            <span>수집: {device.stats.polled}</span>
                            <span>수락: {device.stats.grabbed}</span>
                            <span>취소: {device.stats.canceled}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onModeChange(device.deviceId, device.mode === "AUTO" ? "MANUAL" : "AUTO")}
                        className={`h-7 px-2 text-xs font-black transition-colors ${device.mode === "AUTO"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/20"
                            : "bg-amber-500/10 text-amber-500 border-amber-500/30 hover:bg-amber-500/20"
                            }`}
                    >
                        {device.mode}
                        {/* [Page/Hold 분리] 콜 처리 중 홀드 배지 (화면 배지와 나란히 표시) */}
                        {device.isHolding && (
                            <span className="ml-1">처리 중</span>
                        )}
                    </Button>
                </div>
            </div>

            {/* 🚨 개별 폰 비상/경고 알림 렌더링 (사람 개입 필요한 경우만 노출) */}
            {(criticalAlerts.length > 0 || deviceWarnings.length > 0) && (
                <div className="px-2 pt-2 pb-1 flex flex-col gap-1.5">
                    {criticalAlerts.map(alert => (
                        <div key={alert.timestamp} className="bg-rose-500/10 border border-rose-500/30 rounded flex items-center justify-between px-2 py-1.5 animate-pulse">
                            <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                <span className="text-rose-500 font-extrabold text-[11px] tracking-tight truncate">
                                    🚨 {EMERGENCY_LABELS[alert.reason] || alert.reason}
                                </span>
                                {alert.screenText && (
                                    <span className="text-rose-400/70 truncate text-[10px] font-medium min-w-0 tracking-tight">
                                        화면텍스트: {alert.screenText}
                                    </span>
                                )}
                            </div>
                            <Button size="sm" variant="destructive" onClick={() => onDismissAlert(alert.timestamp)} className="h-6 text-xs px-2 shadow-sm">
                                확인
                            </Button>
                        </div>
                    ))}
                    {deviceWarnings.map(w => (
                        <div key={w.orderId} className="bg-amber-500/10 border border-amber-500/30 rounded flex items-center justify-between px-2 py-1.5">
                            <span className="text-amber-500 font-extrabold text-[11px] tracking-tight truncate flex-1 pr-2">
                                ⚠️ {w.message}
                            </span>
                            <Button size="sm" variant="outline" onClick={() => onDismissWarning(w.orderId)} className="h-6 text-xs px-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/20 shadow-sm">
                                확인
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function DeviceControlPanel() {
    const { alerts, warnings, dismissAlert, dismissWarning } = useSystemAlerts();
    const { devices, changeDeviceMode } = useDevices();
    const { filter } = useFilterConfig();

    return (
        <Card className="mb-2 shadow-sm border-border">
            <CardContent className="p-2">
                <div className="flex flex-col">
                    {devices.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-4 opacity-80 font-bold tracking-tight">
                            <span className="font-semibold mb-1 block opacity-60">연결된 안드로이드 폰이 없습니다.</span>
                            우측 상단의 계정 버튼을 클릭하고 폰을 먼저 등록해 주세요.
                        </div>
                    ) : (
                        devices.map(device => (
                            <DeviceRow
                                key={device.deviceId}
                                device={device}
                                onModeChange={changeDeviceMode}
                                deviceAlerts={alerts.filter(a => a.deviceId === device.deviceId)}
                                deviceWarnings={warnings.filter(w => w.deviceId === device.deviceId)}
                                onDismissAlert={dismissAlert}
                                onDismissWarning={dismissWarning}
                                currentFilter={filter}
                            />
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
