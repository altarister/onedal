import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession, ScreenContextType } from "@onedal/shared";

/** ScreenContext → 한국어 라벨 + 색상 매핑 (물리적 화면 상태만 표시, 홀드는 isHolding으로 분리) */
const SCREEN_LABELS: Record<ScreenContextType, { label: string; color: string }> = {
    LIST: { label: "신규 콜 리스트", color: "text-success bg-success/15" },
    DETAIL_PRE_CONFIRM: { label: "상세페이지", color: "text-info-alt bg-info-alt/15" },
    DETAIL_CONFIRMED: { label: "확정페이지", color: "text-warning bg-warning/15" },
    POPUP_PICKUP: { label: "출발지 팝업", color: "text-info bg-info/15" },
    POPUP_DROPOFF: { label: "도착지 팝업", color: "text-info bg-info/15" },
    POPUP_MEMO: { label: "적요 팝업", color: "text-accent bg-accent/15" },
    POPUP_ERROR: { label: "취소 불가 팝업", color: "text-danger bg-danger/20 animate-pulse" },
    UNKNOWN: { label: "알 수 없는 화면", color: "text-danger bg-danger/20 animate-pulse" },
};

function DeviceRow({ device, onModeChange }: { device: DeviceSession; onModeChange: (id: string, mode: "AUTO" | "MANUAL") => void }) {
    const isDisconnected = device.status === "OFFLINE";
    const screenInfo = device.screenContext ? SCREEN_LABELS[device.screenContext] : null;

    return (
        <div className="flex items-center justify-between hover:bg-slate-800/20 px-2 transition-colors">
            <div className={`flex flex-col gap-1 ${isDisconnected ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-4">
                    <span className="font-bold flex items-center gap-2">
                        <span className={`font-black text-[10px] px-1.5 rounded ${isDisconnected ? 'bg-danger/20 text-danger animate-pulse' : 'text-success'}`}>
                            {device.deviceName || device.deviceId.slice(0, 8)}
                        </span>
                        {/* {device.deviceName && (
                            <span className="text-[9px] text-slate-600 font-mono">{device.deviceId.slice(0, 8)}…</span>
                        )} */}
                        {screenInfo && (
                            <div className={`text-[10px]  ${screenInfo.color}`}>
                                {screenInfo.label}
                            </div>
                        )}
                        {/* [Page/Hold 분리] 콜 처리 중 홀드 배지 (화면 배지와 나란히 표시) */}
                        {device.isHolding && (
                            <div className="text-[10px] text-warning bg-warning/15 animate-pulse">
                                🔒 콜 처리 중
                            </div>
                        )}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                        <span>수집: {device.stats.polled}</span>
                        <span>수락: {device.stats.grabbed}</span>
                        <span>취소: {device.stats.canceled}</span>
                    </div>
                </div>
                {/* [Safety Mode V3] 화면 상태 배지 */}

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
                </button>
            </div>
        </div>
    );
}

export default function DeviceControlPanel() {
    const { devices, changeDeviceMode } = useDevices();

    return (
        <section id="telemetry-panel" className="bg-surface border border-border-card rounded-xl p-3 shadow-lg">
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
                        />
                    ))
                )}
            </div>
        </section>
    );
}
