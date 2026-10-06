import { useState, useEffect, useCallback } from "react";
import { socket } from "../lib/socket";
import { soundManager } from "../lib/soundManager";
import { orderIdOf } from "../lib/socketPayload";
import type { EmergencyAlert, SafeCancelWarning, FilterPassAlarm } from '@onedal/shared';   // 소켓 알림 모양은 shared 한 곳(공통 함수 6)



/**
 * 🔔 **알람 모드 — 필터를 통과한 콜이 리스트에 떴다** (기사님 확정).
 * 원달앱은 상세까지 열고 확정·수락은 누르지 않는다. 기사님이 상세에서 누르신다.
 */


/**
 * Safety Mode V3: 비상 알림 & 안전취소 경고 수신 훅
 * 
 * emergency-alert: 앱폰이 POST /emergency로 보고한 비상 상황
 * safecancel-warning: 서버의 안전취소 시간(배차망별 DB 값)이 다 됐을 때 관제탑 경고 (안전취소 만료 임박)
 */
export function useSystemAlerts() {
    const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
    const [warnings, setWarnings] = useState<SafeCancelWarning[]>([]);

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
         *    문자열로만 받으면 취소 쪽이 **한 번도 안 지워진다**.
         *    푸는 법은 `orderIdOf` 한 곳에 있다 (규칙 ③).
         */
        const handleOrderCleared = (payload: unknown) => {
            const orderId = orderIdOf(payload);
            if (!orderId) return;
            setWarnings(prev => prev.filter(w => w.orderId !== orderId));
        };

        /**
         * 🔔 **소리는 «삑» 한 번 + 강한 진동** (기사님 «한 번으로» — 선점 수신 · 판정 도착은 조용).
         * 운전 중이라 소리가 유일한 통로인데, 무한 반복은 이미 남에게 간 콜에도 계속 운다.
         */
        const handleFilterAlarm = (alarm: FilterPassAlarm) => {
            console.log("🔔 [필터 통과 알람]", alarm);
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


    return { alerts, warnings, dismissAlert, dismissWarning };
}
