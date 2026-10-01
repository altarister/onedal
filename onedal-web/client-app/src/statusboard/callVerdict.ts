import { VERDICT_AXIS_LABEL } from '@onedal/shared';
/**
 * ⚖️ **앱이 내린 판정을 읽는 낱말** — 판정 갈래 기호(MARK_SIGN)와 축 이름표(VERDICT_AXIS_LABEL) · 시나리오 칸(ScenarioCard)이 쓴다.
 *
 * ─────────────────────────────────────────────────────────────
 * 🔴 **이 파일에는 «판정»이 없다.** 축 이름을 한국어로 옮기고 갈래에 기호를 붙일 뿐이다. 판정은 앱이 콜마다 내려 실어 보낸다 — 앱 함수는 여기서 부를 수
 *    없다(Kotlin ↔ TS · 앱은 요청을 받는 문이 없다).
 *
 *    앱 `InsungParser.decide()` 의 축을 **TS 로 옮겨 적어** 다시 재면 사본이 갈라진다 —
 *    앱은 **요율 모델이 서면 `minFare` 를 안 보는데** 사본이 그것만 보면 `5.8km·3만원` 콜을
 *    «통과»라 적는 **가짜 ⭕** 가 나온다. 판정 규칙을 여기 들이지 않는다.
 * ─────────────────────────────────────────────────────────────
 */

export type VerdictMark =
    /** 🟢 지금 쥔 콜에 있다 — 걸러 올린 것이 맞다 */
    | 'kept'
    /** ⭕ 앱이 «통과»라 했는데 안 잡았다 — **이것만 보면 된다** */
    | 'missed'
    /** ❌ 앱이 떨어뜨렸다 — 안 잡은 것이 맞다 */
    | 'dropped'
    /** ❔ 앱이 판정을 안 실었거나(구앱) 잠겨서 안 봤다 */
    | 'unknown';

/** 🔤 축 이름표는 shared `VERDICT_AXIS_LABEL` 한 벌(운영센터 현황판도 같이 쓴다) — 목록에 없는 낱말은 그 낱말을 그대로 적는다 */
export { VERDICT_AXIS_LABEL };

/** 🎨 기호 — 화면과 검사가 같은 표를 본다 */
export const MARK_SIGN: Record<VerdictMark, string> = {
    kept: '🟢',
    missed: '⭕',
    dropped: '❌',
    unknown: '❔',
};
