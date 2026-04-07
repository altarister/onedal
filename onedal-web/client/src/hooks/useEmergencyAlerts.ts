import { useState, useEffect, useCallback } from "react";
import { socket } from "../lib/socket";

export interface EmergencyAlert {
    deviceId: string;
    orderId: string;
    reason: string;
    screenContext: string;
    screenText: string;
    timestamp: string;
}

export interface DeathValleyWarning {
    orderId: string;
    deviceId: string;
    pickup: string;
    dropoff: string;
    message: string;
    timestamp: string;
}

/**
 * Safety Mode V3: 비상 알림 & 데스밸리 경고 수신 훅
 * 
 * emergency-alert: 앱폰이 POST /emergency로 보고한 비상 상황
 * deathvalley-warning: 서버 30초 타임아웃 시 관제탑 경고
 */
export function useEmergencyAlerts() {
    const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
    const [warnings, setWarnings] = useState<DeathValleyWarning[]>([]);

    const playAlarmSound = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 440; // 낮은 음 — 위험 알림용
            osc.type = "sawtooth";
            gain.gain.value = 0.4;
            osc.start();
            setTimeout(() => {
                osc.frequency.value = 880;
                setTimeout(() => { osc.stop(); ctx.close(); }, 200);
            }, 200);
        } catch { /* 무음 폴백 */ }
    }, []);

    const dismissAlert = useCallback((timestamp: string) => {
        setAlerts(prev => prev.filter(a => a.timestamp !== timestamp));
    }, []);

    const dismissWarning = useCallback((orderId: string) => {
        setWarnings(prev => prev.filter(w => w.orderId !== orderId));
    }, []);

    useEffect(() => {
        const handleEmergency = (alert: EmergencyAlert) => {
            console.log("🚨 [Emergency Alert]", alert);
            setAlerts(prev => [alert, ...prev].slice(0, 10)); // 최대 10개 유지
            playAlarmSound();
        };

        const handleDeathValley = (warning: DeathValleyWarning) => {
            console.log("⚠️ [DeathValley Warning]", warning);
            setWarnings(prev => {
                // 같은 orderId면 교체
                const filtered = prev.filter(w => w.orderId !== warning.orderId);
                return [warning, ...filtered].slice(0, 5);
            });
        };

        // 오더가 취소/확정되면 해당 경고 자동 제거
        const handleOrderCleared = (orderId: string) => {
            setWarnings(prev => prev.filter(w => w.orderId !== orderId));
        };

        socket.on("emergency-alert", handleEmergency);
        socket.on("deathvalley-warning", handleDeathValley);
        socket.on("order-canceled", handleOrderCleared);
        socket.on("order-confirmed", handleOrderCleared);

        return () => {
            socket.off("emergency-alert", handleEmergency);
            socket.off("deathvalley-warning", handleDeathValley);
            socket.off("order-canceled", handleOrderCleared);
            socket.off("order-confirmed", handleOrderCleared);
        };
    }, [playAlarmSound]);

    return { alerts, warnings, dismissAlert, dismissWarning };
}
