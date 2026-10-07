import { create } from 'zustand';
import { socket } from '../lib/socket';
import { soundManager } from '../lib/soundManager';
import { orderIdOf } from '../lib/socketPayload';
import type { EmergencyAlert, SafeCancelWarning, FilterPassAlarm } from '@onedal/shared';   // 소켓 알림 모양은 shared 한 곳(공통 함수 6)

/**
 * 🚨 **비상 알림 · 안전취소 경고 · 필터 통과 «삑» — 듣기는 화면이 아니라 여기서 산다** (D3 P6-01).
 *
 * emergency-alert: 앱폰이 POST /emergency로 보고한 비상 상황
 * safecancel-warning: 서버의 안전취소 시간(배차망별 DB 값)이 다 됐을 때 관제탑 경고 (안전취소 만료 임박)
 *
 * 🔴 필터를 펼치면 폰 칸이 접히며 화면에서 빠진다(`ui/collapse`) — 듣기가 그 부품 안에 있으면 그동안 사이렌 · 경고 · 삑을 놓친다.
 *    구독은 앱 전체에서 단 한 번(`judgmentStore` 와 같은 꼴) · 폰 칸은 받은 목록을 읽기만 한다.
 */
interface AlertsState {
    alerts: EmergencyAlert[];
    warnings: SafeCancelWarning[];
    dismissAlert: (timestamp: string) => void;
    dismissWarning: (orderId: string) => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
    alerts: [],
    warnings: [],
    dismissAlert: (timestamp) => set(s => ({ alerts: s.alerts.filter(a => a.timestamp !== timestamp) })),
    dismissWarning: (orderId) => set(s => ({ warnings: s.warnings.filter(w => w.orderId !== orderId) })),
}));

let subscribed = false;

export function ensureAlertsSocketSubscribed(): void {
    if (subscribed) return;
    subscribed = true;

    const handleEmergency = (alert: EmergencyAlert) => {
        console.log("🚨 [Emergency Alert]", alert);
        useAlertsStore.setState(s => ({ alerts: [alert, ...s.alerts].slice(0, 10) })); // 최대 10개 유지
        soundManager.playEmergencyAlarm();
    };

    const handleSafeCancel = (warning: SafeCancelWarning) => {
        console.log("⚠️ [SafeCancel Warning]", warning);
        // 같은 orderId면 교체
        useAlertsStore.setState(s => ({ warnings: [warning, ...s.warnings.filter(w => w.orderId !== warning.orderId)].slice(0, 5) }));
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
        useAlertsStore.setState(s => ({ warnings: s.warnings.filter(w => w.orderId !== orderId) }));
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
}
