import { isManualLineage, isTerminal, modeActsOf } from '@onedal/shared';
import type { SecuredOrder } from '@onedal/shared';

/**
 * 🏷️ **결재석 · 목록 줄이 같은 콜을 같은 말 · 같은 색으로** (29 N7 «어디서나 같게» · 34 P5).
 *    두 화면과 심사석 로그(`useOrderEngine`)가 이 함수들을 읽는다 — 자리마다 따로 세면 한쪽만 바뀌어 화면과 로그가 다른 말을 한다.
 */
type CallFacts = Pick<SecuredOrder, 'type' | 'status' | 'isSimulated' | 'isPreview' | 'capturedVia'> & { capturedMode?: string | null };

/** 🔘 결재(KEEP · 거절) 버튼을 그리나 — 연습 콜은 결재 연습이라 늘 · 직접 갈래 · 미리보기는 안 그린다(결정은 배차망 앱에서) */
export function drawsDecisionButtons(c: CallFacts): boolean {
    return !!c.isSimulated || (!c.isPreview && !isManualLineage(c.type));
}

/** 🐥 연습 배지 — 색은 모드 표의 «자동(계약 안 함)» 색 하나(N7 노랑) */
export function practiceBadgeOf(c: CallFacts): { text: string; tone: string } | null {
    if (!c.isSimulated) return null;
    return { text: isTerminal(c.status) ? '🐥 연습 끝' : '🐥 연습', tone: modeActsOf('SIMULATION').tone };
}

/** 🖱️ 잡은 방식 — 새 칸(그때 도는 모드 · 29 P5-1) 먼저, 새 칸이 없는 옛 줄은 옛 칸(capturedVia)으로 · 알람이면 🔔 알람콜 · 아니면 ✋ 직접콜 */
export function capturedHowOf(c: CallFacts): { icon: string; label: string } {
    return (c.capturedMode ?? c.capturedVia) === 'ALARM' ? { icon: '🔔', label: '🔔 알람콜' } : { icon: '✋', label: '✋ 직접콜' };
}
