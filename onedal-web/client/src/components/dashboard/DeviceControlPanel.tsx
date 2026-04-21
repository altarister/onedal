import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession, ScreenContextType } from "@onedal/shared";
import { useSystemAlerts } from "../../hooks/useSystemAlerts";
import type { EmergencyAlert, DeathValleyWarning } from "../../hooks/useSystemAlerts";


const EMERGENCY_LABELS: Record<string, string> = {
    AUTO_CANCEL: "⏱️ 자동취소 실행됨",
    CANCEL_EXPIRED: "🔴 취소 불가 팝업! 배차실 직접 취소 요망!",
    UNKNOWN_SCREEN: "🟠 알 수 없는 화면에 진입함",
    BUTTON_NOT_FOUND: "🟡 버튼을 찾을 수 없음",
    APP_CRASH: "💀 앱 비정상 종료 후 재시작",
};

/** ScreenContext → 한국어 라벨 + 색상 매핑 (물리적 화면 상태만 표시, 홀드는 isHolding으로 분리) */
const SCREEN_LABELS: Record<ScreenContextType, { label: string; color: string }> = {
    LIST: { label: "콜 리스트", color: "text-success bg-success/15" },
    DETAIL_PRE_CONFIRM: { label: "상세페이지", color: "text-info-alt bg-info-alt/15" },
    DETAIL_CONFIRMED: { label: "확정페이지", color: "text-warning bg-warning/15" },
    POPUP_PICKUP: { label: "출발지 팝업", color: "text-info bg-info/15" },
    POPUP_DROPOFF: { label: "도착지 팝업", color: "text-info bg-info/15" },
    POPUP_MEMO: { label: "적요 팝업", color: "text-accent bg-accent/15" },
    POPUP_ERROR: { label: "취소 불가 팝업", color: "text-danger bg-danger/20 animate-pulse" },
    UNKNOWN: { label: "알 수 없는 화면", color: "text-danger bg-danger/20 animate-pulse" },
};

function DeviceRow({
    device,
    onModeChange,
    deviceAlerts,
    deviceWarnings,
    onDismissAlert,
    onDismissWarning
}: {
    device: DeviceSession;
    onModeChange: (id: string, mode: "AUTO" | "MANUAL") => void;
    deviceAlerts: EmergencyAlert[];
    deviceWarnings: DeathValleyWarning[];
    onDismissAlert: (timestamp: string) => void;
    onDismissWarning: (orderId: string) => void;
}) {
    const isDisconnected = device.status === "OFFLINE";
    const screenInfo = device.screenContext ? SCREEN_LABELS[device.screenContext] : null;

    // 알아서 잘 취소된 루틴 알림은 무시하고 오직 배차실 개입 등 치명적 알림만 선별
    const criticalAlerts = deviceAlerts.filter(a => a.reason !== 'AUTO_CANCEL' && a.reason !== 'BUTTON_NOT_FOUND');

    return (
        <div className="flex flex-col border-b border-white/5 last:border-0 py-1">
            <div className="flex items-center justify-between hover:bg-slate-800/20  transition-colors">
                <div className={`flex flex-col gap-1 ${isDisconnected ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-4">
                        <span className="font-bold flex items-center gap-2">
                            <span className={`font-black text-[10px] px-1.5 rounded ${isDisconnected ? 'bg-danger/20 text-danger animate-pulse' : 'text-success'}`}>
                                {device.deviceName || device.deviceId.slice(0, 8)}
                            </span>
                            {screenInfo && (
                                <div className={`text-[10px]  ${screenInfo.color}`}>
                                    {screenInfo.label}
                                </div>
                            )}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                            <span>수집: {device.stats.polled}</span>
                            <span>수락: {device.stats.grabbed}</span>
                            <span>취소: {device.stats.canceled}</span>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <button
                        onClick={() => onModeChange(device.deviceId, device.mode === "AUTO" ? "MANUAL" : "AUTO")}
                        className={`border px-2 py-1 text-xs font-black rounded-md transition-colors ${device.mode === "AUTO"
                            ? "bg-success/20 text-success border-success/30"
                            : "bg-warning/10 text-warning border-warning/30"
                            }`}
                    >
                        {device.mode}
                        {/* [Page/Hold 분리] 콜 처리 중 홀드 배지 (화면 배지와 나란히 표시) */}
                        {device.isHolding && (
                            <span> 처리 중</span>
                        )}
                    </button>
                </div>
            </div>

            {/* 🚨 개별 폰 비상/경고 알림 렌더링 (사람 개입 필요한 경우만 노출) */}
            {(criticalAlerts.length > 0 || deviceWarnings.length > 0) && (
                <div className="px-2 pt-1 pb-1.5 flex flex-col gap-1.5">
                    {criticalAlerts.map(alert => (
                        <div key={alert.timestamp} className="bg-red-500/15 border border-red-500/40 rounded flex items-center justify-between px-2 py-1 animate-pulse">
                            <div className="flex flex-col gap-0.5 overflow-hidden pr-2">
                                <span className="text-red-400 font-extrabold text-[11px] tracking-tight truncate">
                                    🚨 {EMERGENCY_LABELS[alert.reason] || alert.reason}
                                </span>
                                {alert.screenText && (
                                    <span className="text-red-300/70 truncate text-[10px] font-medium min-w-0 tracking-tight">
                                        화면텍스트: {alert.screenText}
                                    </span>
                                )}
                            </div>
                            <button onClick={() => onDismissAlert(alert.timestamp)} className="text-red-400 hover:text-red-200 font-black px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/30 border border-red-500/20 active:scale-95 transition-all text-xs whitespace-nowrap flex-shrink-0 shadow-sm">
                                확인
                            </button>
                        </div>
                    ))}
                    {deviceWarnings.map(w => (
                        <div key={w.orderId} className="bg-amber-500/10 border border-amber-500/30 rounded flex items-center justify-between px-2 py-1">
                            <span className="text-amber-400 font-extrabold text-[11px] tracking-tight truncate flex-1 pr-2">
                                ⚠️ {w.message}
                            </span>
                            <button onClick={() => onDismissWarning(w.orderId)} className="text-amber-400 hover:text-amber-200 font-black px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/30 border border-amber-500/20 active:scale-95 transition-all text-xs whitespace-nowrap flex-shrink-0 shadow-sm">
                                확인
                            </button>
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

    return (
        <section id="telemetry-panel" className="bg-surface border border-border-card rounded-xl p-1 shadow-lg mb-2">
            <div className="flex flex-col">
                {devices.length === 0 ? (
                    <div className="text-center text-xs text-slate-500 py-4 opacity-80 font-bold tracking-tight">
                        <span className="text-text-muted font-semibold mb-1 block opacity-60">연결된 안드로이드 폰이 없습니다.</span>
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
                        />
                    ))
                )}
            </div>
        </section>
    );
}
