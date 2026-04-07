import { useState, useEffect, useRef } from "react";
import { socket } from "../lib/socket";
import type { DeviceSession, DeviceModeType } from "@onedal/shared";

export function useDevices() {
    const [devices, setDevices] = useState<DeviceSession[]>([]);
    const prevDataRef = useRef<string>("");

    useEffect(() => {
        // 웹소켓을 통한 텔레메트리 실시간 수신 (서버 푸시)
        const onTelemetry = (data: DeviceSession[]) => {
            // 🚀 핵심 최적화: 이전 데이터와 비교해서 실제로 변한 경우에만 setState 호출
            // 1초마다 들어오는 telemetry 이벤트가 같은 내용이면 리렌더링을 완전 차단
            const serialized = JSON.stringify(data);
            if (serialized === prevDataRef.current) return;
            prevDataRef.current = serialized;
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
                if (mode === "SHUTDOWN") {
                    setDevices(prev => prev.filter(d => d.deviceId !== deviceId));
                } else {
                    setDevices(prev => prev.map(d => 
                        d.deviceId === deviceId ? { ...d, mode } : d
                    ));
                }
            }
        } catch (error) {
            console.error("모드 변경 실패:", error);
        }
    };

    return { devices, changeDeviceMode };
}
