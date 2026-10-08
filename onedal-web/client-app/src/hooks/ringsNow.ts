import { bellOf, isEvaluating, type SecuredOrder } from '@onedal/shared';

/**
 * 🔔 **call.mp3 를 반복할 콜인가** (29 사실 ④ · 31 P0 C1) — 관제 대기 중(심사) · 카카오 연산 결과가 왔고 · 서버가 정한 벨(점수 ≥ «🔔 벨»).
 * 모드는 안 본다(지금 답). 소리를 켜고 끄는 것은 `useOrderEngine` 이 한다.
 */
export function ringsNow(order: SecuredOrder): boolean {
    // 1. 관제 대기 중(평가 상태)이 아니면 무시
    if (!isEvaluating(order.status)) return false;
    // 2. 카카오 연산 결과가 없으면(기다리는 중) 무시 (이 구간 동안 약 1~2초 침묵 발생)
    if (!order.kakaoTimeExt) return false;
    /**
     * 3. 🔔 **벨은 색이 아니라 점수로** (기사님 «가» — «색 말고 점수가 50점 이상이면»).
     *    서버가 판정 때 정한 bell(점수 ≥ 판정 기준 «🔔 벨») 한 칸만 읽는다 — 여기서 문턱을 다시 셈하지 않는다 (규칙 ③).
     */
    return bellOf(order);
}
