import { useState, useEffect, useCallback } from "react";
import { socket } from "../lib/socket";
import { soundManager } from "../lib/soundManager";
import { orderIdOf } from "../lib/socketPayload";

export interface EmergencyAlert {
    deviceId: string;
    orderId: string;
    reason: string;
    screenContext: string;
    screenText: string;
    timestamp: string;
}

export interface SafeCancelWarning {
    orderId: string;
    deviceId: string;
    pickup: string;
    dropoff: string;
    message: string;
    timestamp: string;
}

/**
 * 🔔 **알람 모드 — 필터를 통과한 콜이 리스트에 떴다** (기사님 확정 2026-08-30).
 * 앱은 누르지 않는다. 기사님이 인성 리스트에서 직접 누르신다 (`docs/지금/기기_모드.md`).
 */
export interface FilterPassAlarm {
    deviceId: string;
    deviceName?: string;
    /** 이번 스캔에서 새로 통과한 콜 수 */
    passed: number;
    /** 이번 스캔에서 판정한 콜 수 */
    seen: number;
    at: number;
}

/**
 * 🔇 **알람은 «먼저 오는 것»으로 그친다** (기사님 확정 2026-08-30).
 * 그 콜이 리스트에서 사라지거나 10초 — 오래 남지도, 헛되지도 않게.
 * 리스트에서 사라진 것은 **다음 스캔의 성적표**가 알려 준다(통과 0).
 */
export const FILTER_ALARM_HOLD_MS = 10_000;

/**
 * Safety Mode V3: 비상 알림 & 안전취소 경고 수신 훅
 * 
 * emergency-alert: 앱폰이 POST /emergency로 보고한 비상 상황
 * safecancel-warning: 서버 30초 타임아웃 시 관제탑 경고 (안전취소 만료 임박)
 */
export function useSystemAlerts() {
    const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
    const [warnings, setWarnings] = useState<SafeCancelWarning[]>([]);
    const [filterAlarm, setFilterAlarm] = useState<FilterPassAlarm | null>(null);

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
            soundManager.playEmergencyAlarm();
        };

        const handleSafeCancel = (warning: SafeCancelWarning) => {
            console.log("⚠️ [SafeCancel Warning]", warning);
            setWarnings(prev => {
                // 같은 orderId면 교체
                const filtered = prev.filter(w => w.orderId !== warning.orderId);
                return [warning, ...filtered].slice(0, 5);
            });
        };

        /**
         * 오더가 취소/확정되면 해당 경고 자동 제거.
         *
         * 🔴 두 이벤트의 **모양이 다르다** — 확정은 문자열, 취소는 `{ id, status }`.
         *    예전에는 문자열로만 받아 취소 쪽이 **한 번도 안 지워졌다** (2026-08-29 정정).
         *    푸는 법은 `orderIdOf` 한 곳에 있다 (규칙 ③).
         */
        const handleOrderCleared = (payload: unknown) => {
            const orderId = orderIdOf(payload);
            if (!orderId) return;
            setWarnings(prev => prev.filter(w => w.orderId !== orderId));
        };

        /**
         * 🔔 **소리는 짧게 두 번 + 강한 진동** (기사님 확정 2026-08-30).
         * 운전 중이라 소리가 유일한 통로인데, 무한 반복은 이미 남에게 간 콜에도 계속 운다.
         */
        const handleFilterAlarm = (alarm: FilterPassAlarm) => {
            console.log("🔔 [필터 통과 알람]", alarm);
            setFilterAlarm(alarm);
            soundManager.playFilterAlarm();
        };

        socket.on("emergency-alert", handleEmergency);
        socket.on("safecancel-warning", handleSafeCancel);
        socket.on("order-canceled", handleOrderCleared);
        socket.on("order-confirmed", handleOrderCleared);
        socket.on("filter-pass-alarm", handleFilterAlarm);

        return () => {
            socket.off("emergency-alert", handleEmergency);
            socket.off("safecancel-warning", handleSafeCancel);
            socket.off("order-canceled", handleOrderCleared);
            socket.off("order-confirmed", handleOrderCleared);
            socket.off("filter-pass-alarm", handleFilterAlarm);
        };
    }, []);

    /**
     * 🔇 10초가 지나면 스스로 사라진다 — 손으로 끄게 하지 않는다.
     *    (운전 중에는 입력을 못 한다. 무입력에도 일이 되어야 한다)
     */
    useEffect(() => {
        if (!filterAlarm) return;
        const t = setTimeout(() => setFilterAlarm(null), FILTER_ALARM_HOLD_MS);
        return () => clearTimeout(t);
    }, [filterAlarm]);

    return { alerts, warnings, filterAlarm, dismissAlert, dismissWarning };
}
