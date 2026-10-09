import { isTargetApp, TARGET_APP_LABEL } from '@onedal/shared';
import type { EmergencyAlert } from '@onedal/shared';

/**
 * 🚨 **폰 칸 빨간 줄 — 어느 비상 경보를 띄우고 무슨 글로** (40 S2-2 · 23 · 71 «다»).
 *    소리는 모든 경보에 울린다(alertsStore). 빨간 줄은 기사님이 손쓸 일만 — 보통 «자동 취소» · «버튼 못 찾음»은 루틴이라 뺀다.
 *    다만 KEEP 한 콜을 폰이 결재를 못 받아 배차망에서 취소한 경보(keepLost)는 띄운다 — 기사님이 모르면 전화로 수습할 수 없다.
 */
const EMERGENCY_LABELS: Record<string, string> = {
    AUTO_CANCEL: "⏱️ 자동취소 실행됨",
    CANCEL_EXPIRED: "🔴 취소 불가 팝업! 배차실 직접 취소 요망!",
    UNKNOWN_SCREEN: "🟠 알 수 없는 화면에 진입함",
    POPUP_ORDER_MISSING: "⚠️ 팝업 감지 실패",
    BUTTON_NOT_FOUND: "⚠️ 버튼 감지 실패",
};

type AlertFacts = Pick<EmergencyAlert, 'reason' | 'keepLost' | 'targetApp'>;

/** 빨간 줄에 띄우나 — KEEP 못 감은 늘 · 보통 자동 취소 · 버튼 못 찾음은 안 띄움 */
export function showsInPanel(a: AlertFacts): boolean {
    return !!a.keepLost || (a.reason !== 'AUTO_CANCEL' && a.reason !== 'BUTTON_NOT_FOUND');
}

/** 빨간 줄 글 — KEEP 못 감은 그 배차망 이름(shared TARGET_APP_LABEL · 모르면 «배차망») · 그 밖은 까닭 글 · 모르는 까닭은 글자 그대로 */
export function emergencyLabelOf(a: AlertFacts): string {
    if (a.keepLost) {
        const where = isTargetApp(a.targetApp) ? TARGET_APP_LABEL[a.targetApp] : '배차망';
        return `⏱️ KEEP 이 폰에 못 갔습니다 — ${where}에서 자동 취소됨`;
    }
    return EMERGENCY_LABELS[a.reason] ?? a.reason;
}
