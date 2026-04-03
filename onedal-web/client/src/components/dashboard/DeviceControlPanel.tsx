import { useDevices } from "../../hooks/useDevices";
import type { DeviceSession } from "@onedal/shared";

function DeviceRow({ device, onModeChange }: { device: DeviceSession; onModeChange: (id: string, mode: "AUTO" | "MANUAL") => void }) {
    const isDisconnected = device.status === "DISCONNECTED";
    const isGraceful = device.status === "OFFLINE_GRACEFUL";

    return (
        <div className="flex items-center justify-between py-1 border-b border-slate-800 last:border-0 hover:bg-slate-800/20 px-2 transition-colors">
            <div className={`flex items-center gap-4 ${isDisconnected ? 'opacity-50' : isGraceful ? 'opacity-30' : ''}`}>
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
            <button
                onClick={() => onModeChange(device.deviceId, device.mode === "AUTO" ? "MANUAL" : "AUTO")}
                className={`border px-2 py-1 text-xs font-black rounded-md transition-colors ${device.mode === "AUTO"
                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/10 text-amber-500 border-amber-500/30"
                    }`}
            >
                {device.mode === "AUTO" ? "풀오토" : "반자동/대기"}
            </button>
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
