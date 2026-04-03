import { useState, useEffect } from "react";
import { socket } from "../lib/socket";
import type { DeviceSession, DeviceModeType } from "@onedal/shared";

export function useDevices() {
    const [devices, setDevices] = useState<DeviceSession[]>([]);

    useEffect(() => {
        // 웹소켓을 통한 텔레메트리 실시간 수신 (서버 푸시)
        const onTelemetry = (data: DeviceSession[]) => {
            setDevices(data || []);
        };

        socket.on("telemetry-devices", onTelemetry);

        return () => {
            socket.off("telemetry-devices", onTelemetry);
        };
    }, []);

    const changeDeviceMode = async (deviceId: string, mode: DeviceModeType) => {
        try {
            const res = await fetch(`/api/devices/${deviceId}/mode`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode })
            });
            if (res.ok) {
                // 즉각적인 UI 피드백을 위해 로컬 상태 선갱신 (낙관적 업데이트)
                setDevices(prev => prev.map(d => 
                    d.deviceId === deviceId ? { ...d, mode } : d
                ));
            }
        } catch (error) {
            console.error("모드 변경 실패:", error);
        }
    };

    return { devices, changeDeviceMode };
}
