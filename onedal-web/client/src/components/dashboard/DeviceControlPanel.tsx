import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession, ScreenContextType } from "@onedal/shared";

/** ScreenContext → 한국어 라벨 + 색상 매핑 */
const SCREEN_LABELS: Record<ScreenContextType, { label: string; color: string }> = {
    LIST: { label: "리스트 스캔 중", color: "text-emerald-400 bg-emerald-500/15" },
    DETAIL_PRE_CONFIRM: { label: "광클 직전!", color: "text-cyan-400 bg-cyan-500/15" },
    DETAIL_CONFIRMED: { label: "확정화면 대기", color: "text-amber-400 bg-amber-500/15" },
    POPUP_PICKUP: { label: "출발지 팝업", color: "text-blue-400 bg-blue-500/15" },
    POPUP_DROPOFF: { label: "도착지 팝업", color: "text-blue-400 bg-blue-500/15" },
    POPUP_MEMO: { label: "적요 팝업", color: "text-blue-400 bg-blue-500/15" },
    POPUP_ERROR: { label: "⚠️ 에러 팝업!", color: "text-red-400 bg-red-500/20 animate-pulse" },
    WAITING_SERVER: { label: "서버 응답 대기", color: "text-yellow-400 bg-yellow-500/15 animate-pulse" },
    UNKNOWN: { label: "알 수 없는 화면", color: "text-red-400 bg-red-500/20 animate-pulse" },
};

function DeviceRow({ device, onModeChange }: { device: DeviceSession; onModeChange: (id: string, mode: "AUTO" | "MANUAL" | "SHUTDOWN") => void }) {
    const isDisconnected = device.status === "DISCONNECTED";
    const isGraceful = device.status === "OFFLINE_GRACEFUL";
    const screenInfo = device.screenContext ? SCREEN_LABELS[device.screenContext] : null;

    return (
        <div className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0 hover:bg-slate-800/20 px-2 transition-colors">
            <div className={`flex flex-col gap-1 ${isDisconnected ? 'opacity-50' : isGraceful ? 'opacity-30' : ''}`}>
                <div className="flex items-center gap-4">
                    <span className="font-bold flex items-center gap-2">
                        <span className={`font-black text-[10px] px-1.5 py-0.5 rounded ${isDisconnected ? 'bg-red-500/20 text-red-500 animate-pulse' : isGraceful ? 'bg-slate-700 text-slate-400' : 'text-emerald-500'}`}>
                            {device.deviceId}
                        </span>
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium">
                        <span>수집: {device.stats.polled}</span>
                        <span className="text-emerald-500">수락: {device.stats.grabbed}</span>
                        <span className="text-red-400">취소: {device.stats.canceled}</span>
                    </div>
                </div>
                {/* [Safety Mode V3] 화면 상태 배지 */}
                {screenInfo && (
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${screenInfo.color}`}>
                        📱 {screenInfo.label}
                    </div>
                )}
            </div>
         <div className="flex flex-col items-end gap-1">
            <button
                onClick={() => onModeChange(device.deviceId, device.mode === "AUTO" ? "MANUAL" : "AUTO")}
                className={`border px-2 py-1 text-xs font-black rounded-md transition-colors ${device.mode === "AUTO"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                    }`}
            >
                {device.mode === "AUTO" ? "풀오토" : "반자동/대기"}
            </button>
            <button
                onClick={() => onModeChange(device.deviceId, "SHUTDOWN")}
                className="px-2 py-0.5 text-[10px] font-black rounded text-red-500 hover:bg-red-500/20 transition-colors"
                title="기기를 원격으로 오프라인으로 만들고 서버와의 통신을 차단합니다."
            >
                세션 끊기 (퇴근)
            </button>
         </div>
     </div>
    );
}

export default function DeviceControlPanel() {
    const { devices, changeDeviceMode } = useDevices();

    return (
        <section id="telemetry-panel" className="bg-[#111522] border border-slate-800/80 rounded-xl p-3 shadow-lg">
            <div className="flex flex-col">
                {devices.length === 0 ? (
                    <div className="text-center text-xs text-slate-500 py-4 opacity-60 font-bold tracking-tight">
                        대기 중인 스크래퍼 앱폰이 없습니다.
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
