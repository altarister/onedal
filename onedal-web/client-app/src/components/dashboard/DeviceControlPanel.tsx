import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession, ScreenContextType } from "@onedal/shared";
import { useSystemAlerts } from "../../hooks/useSystemAlerts";
import type { EmergencyAlert, SafeCancelWarning } from "../../hooks/useSystemAlerts";
import { useFilterConfig } from "../../hooks/useFilterConfig";
import type { AutoDispatchFilter } from "@onedal/shared";


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
    LIST: { label: "콜 리스트", color: "text-success bg-success/15 border-success/20" },
    // 완료 리스트도 "콜에서 손을 뗀" 화면이다 — 앱이 여기로 빠져나가면 서버가 콜을 놓는다.
    // 예전에는 이 값이 shared 타입에 없어서, 앱만 보내고 아무도 못 읽었다 (유령 카드 사고)
    LIST_COMPLETED: { label: "완료 리스트", color: "text-success bg-success/15 border-success/20" },
    DETAIL_PRE_CONFIRM: { label: "상세페이지", color: "text-info bg-info/15 border-info/20" },
    DETAIL_CONFIRMED: { label: "확정페이지", color: "text-warning bg-warning/15 border-warning/20" },
    POPUP_PICKUP: { label: "출발지 팝업", color: "text-info bg-info/15 border-info/20" },
    POPUP_DROPOFF: { label: "도착지 팝업", color: "text-info bg-info/15 border-info/20" },
    POPUP_MEMO: { label: "적요 팝업", color: "text-accent-alt bg-accent-alt/15 border-accent-alt/20" },
    POPUP_ERROR: { label: "취소 불가 팝업", color: "text-danger bg-danger/20 animate-pulse border-danger/30" },
    UNKNOWN: { label: "알 수 없는 화면", color: "text-danger bg-danger/20 animate-pulse border-danger/30" },
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
    deviceWarnings: SafeCancelWarning[];
    onDismissAlert: (timestamp: string) => void;
    onDismissWarning: (orderId: string) => void;
    currentFilter: AutoDispatchFilter | null;
}) {
    const isDisconnected = device.status === "OFFLINE";
    const screenInfo = device.screenContext ? SCREEN_LABELS[device.screenContext] : null;

    let filterLabel = '동기화 중';
    let filterColor = 'bg-surface-alt text-text-muted border-border';
    if (currentFilter) {
        // 🚨 전역 isActive가 아닌, 이 기기 자체의 mode를 1순위로 검사합니다!
        // isActive = "작전 활성화" (유저별), device.mode = "사격 허가" (폰별)
        if (device.mode === "MANUAL") {
            filterLabel = '수동 대기';
            filterColor = 'bg-surface-alt text-text-muted border-border';
        } else {
            // 기기가 AUTO 모드일 때만 전역 콜 잡기 페이즈를 따라갑니다.
            const phase = currentFilter.dispatchPhase || 'STANDBY';
            const action = currentFilter.driverAction || 'WAITING';

            if (action === 'UNLOADING') {
                filterLabel = '하차 대기';
                filterColor = 'bg-surface-alt text-text-muted border-border';
            } else if (phase === 'GATHERING') {
                filterLabel = '합짐 탐색';
                filterColor = 'bg-info-alt/20 text-info-alt border-info-alt/30';
            } else if (phase === 'DELIVERING') {
                filterLabel = '경로 탐색';
                filterColor = 'bg-accent-alt/20 text-accent-alt border-accent-alt/30';
            } else {
                filterLabel = '첫짐 탐색';
                filterColor = 'bg-success/20 text-success border-success/30';
            }
        }
    }

    // 알아서 잘 취소된 루틴 알림은 무시하고 오직 배차실 개입 등 치명적 알림만 선별
    const criticalAlerts = deviceAlerts.filter(a => a.reason !== 'AUTO_CANCEL' && a.reason !== 'BUTTON_NOT_FOUND');

    return (
        <div className="flex flex-col border-b border-border last:border-0 py-1 px-1">
            <div className="flex items-center justify-between hover:bg-surface-alt/30 transition-colors rounded px-1">
                <div className={`flex items-center gap-2 flex-1 min-w-0`}>
                    <span className={`font-black text-[10px] px-1.5 rounded truncate shrink-0 ${isDisconnected ? 'bg-danger/20 text-danger animate-pulse' : 'text-success'}`}>
                        {device.deviceName || device.deviceId.slice(0, 8)}
                    </span>
                    {screenInfo && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${screenInfo.color}`}>
                            {screenInfo.label}
                        </Badge>
                    )}
                    {!isDisconnected && currentFilter && (
                        <Badge variant="outline" className={`text-[10px] font-extrabold px-1.5 py-0 rounded shadow-sm shrink-0 border ${filterColor}`}>
                            {filterLabel}
                        </Badge>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-medium ml-1 truncate">
                        <span>수집:{device.stats.polled}</span>
                        <span>수락:{device.stats.grabbed}</span>
                        <span>취소:{device.stats.canceled}</span>
                    </div>
                </div>
                <div className="shrink-0 ml-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onModeChange(device.deviceId, device.mode === "AUTO" ? "MANUAL" : "AUTO")}
                        className={`h-6 px-2 text-[10px] font-black transition-colors ${device.mode === "AUTO"
                            ? "bg-success/10 text-success border-success/30 hover:bg-success/20"
                            : "bg-warning/10 text-warning border-warning/30 hover:bg-warning/20"
                            }`}
                    >
                        {device.mode}
                        {device.isHolding && <span className="ml-1">처리중</span>}
                    </Button>
                </div>
            </div>

            {/* 🚨 개별 폰 비상/경고 알림 렌더링 (사람 개입 필요한 경우만 노출) */}
            {(criticalAlerts.length > 0 || deviceWarnings.length > 0) && (
                <div className="px-2 pt-2 pb-1 flex flex-col gap-1.5">
                    {criticalAlerts.map(alert => (
                        <div key={alert.timestamp} className="bg-danger/10 border border-danger/30 rounded flex items-center justify-between px-2 py-1.5 animate-pulse">
                            <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                <span className="text-danger font-extrabold text-[11px] tracking-tight truncate">
                                    🚨 {EMERGENCY_LABELS[alert.reason] || alert.reason}
                                </span>
                                {alert.screenText && (
                                    <span className="text-danger/70 truncate text-[10px] font-medium min-w-0 tracking-tight">
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
                        <div key={w.orderId} className="bg-warning/10 border border-warning/30 rounded flex items-center justify-between px-2 py-1.5">
                            <span className="text-warning font-extrabold text-[11px] tracking-tight truncate flex-1 pr-2">
                                ⚠️ {w.message}
                            </span>
                            <Button size="sm" variant="outline" onClick={() => onDismissWarning(w.orderId)} className="h-6 text-xs px-2 border-warning/30 text-warning hover:bg-warning/20 shadow-sm">
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
        <div className="border-b border-border-card">
            <div className="px-4 py-2">
                <div className="flex flex-col">
                    {devices.length === 0 ? (
                        <div className="text-center text-xs text-text-muted py-4 opacity-80 font-bold tracking-tight">
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
            </div>
        </div>
    );
}
