import { useAlertsStore } from "../stores/alertsStore";

/**
 * Safety Mode V3: 비상 알림 & 안전취소 경고 — 받은 목록을 읽는다.
 * 🔴 듣기(소켓 구독)는 여기 없다 — `stores/alertsStore` 가 앱 전체에서 한 번 듣는다(필터를 펼쳐 폰 칸이 접혀도 사이렌 · 경고 · 삑이 난다).
 */
export function useSystemAlerts() {
    const alerts = useAlertsStore(s => s.alerts);
    const warnings = useAlertsStore(s => s.warnings);
    const dismissAlert = useAlertsStore(s => s.dismissAlert);
    const dismissWarning = useAlertsStore(s => s.dismissWarning);
    return { alerts, warnings, dismissAlert, dismissWarning };
}
