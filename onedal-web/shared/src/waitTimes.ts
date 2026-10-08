import { isTargetApp, DEFAULT_TARGET_APP } from './targetApps';

/**
 * ⏱️ **«주행·정차»로 굳는 데 걸리는 초 — 기본값** (기사님 확정 · 화면규칙 S16).
 *
 * 20km/h↑ 가 이 시간만큼 이어지면 «주행», 5km/h↓ 면 «정차»로 본다.
 * 기사님이 ⚙️ 설정 → 「화면 설정」에서 고칠 수 있다 (`user_settings.motion_hold_sec`).
 *
 * 🔴 **모의 주행에서는 줄여야 한다** — 배속이 빠르면 정거장 사이를 2~7초에 지나가
 *    10초를 채울 수가 없다. 그래서 «주행이면 시트가 내려간다»가 발화 못 했다
 *    (기사님 실측: 빠름 40배로 한 판을 다 돌았는데 하루 종일 `idle`).
 *    기사님: *"모의주행할 때는 그걸 줄이고 시험하고 **진짜 때는 10으로**"*
 */
export const MOTION_HOLD_SEC_DEFAULT = 10;

/**
 * ⏱️ **배차망별 대기 시간** (기사님 확정).
 *
 * 원천은 DB `user_settings` 세 칸이다 — 여기는 **값이 없을 때의 기본값**(DB DEFAULT 와 같다)과
 * «그 배차망은 몇 초인가»를 가르는 한 곳이다. 서버 타이머 · 관제웹 표시가 같은 함수를 부른다.
 *
 * 🔴 **뜻이 다른 둘이다** (규칙 ⑤-4 ⑤):
 *   · 인성·화물24시 — 잡은 뒤 위약금 없이 취소할 수 있는 시간(안전취소).
 *     인성의 취소 가능 시간은 1분이고, 30초는 기사님이 둔 안전 여유다
 *   · 픽커 — 수락하기가 곧 계약이라 안전취소가 **없다.** 확정 전 상세를(누가 열었든) 띄워 두는 시간만 있다
 */
export const SAFE_CANCEL_SEC_DEFAULT = 30;
export const PICKER_ALARM_DETAIL_SEC_DEFAULT = 30;
/** 서버는 원달앱이 취소한 **뒤에** 메모리를 치운다 — 그 간격 (옛 30초 경고 · 35초 해제의 차이) */
export const SERVER_CLEANUP_EXTRA_SEC = 5;

/**
 * ⏳ **«알 수 없는 화면»이 이만큼 이어지면 상세를 떠난 것으로 본다**.
 *
 * 카드를 여는 순간 `UNKNOWN` 이 **0.05~0.18초** 끼는 일이 있다(실제 픽커 68건 중 3건). 그것을 이탈로
 * 읽으면 카드가 깜빡인다. 반대로 영영 무시하면 배차망 앱 밖으로 나갔을 때를 못 잡는다 — 그때도
 * 하트비트는 계속 오기 때문이다. 앱은 **화면이 바뀌면 즉시** 보고하므로, 몇 초를 넘겨 모름이
 * 이어진다는 것은 스침이 아니라 실제로 다른 곳에 있다는 뜻이다.
 *
 * 🔴 이것은 콜의 수명을 재는 타이머가 아니다 — «이탈»의 정의에 든 시간이다 (기사님: 타이머로 미리보기를 켜고 끄지 않는다).
 */
export const UNKNOWN_LEAVE_SEC = 5;

export interface WaitTimes {
    safeCancelSecInsung: number;
    safeCancelSecHwamul24: number;
    pickerAlarmDetailSec: number;
}

export const DEFAULT_WAIT_TIMES: WaitTimes = {
    safeCancelSecInsung: SAFE_CANCEL_SEC_DEFAULT,
    safeCancelSecHwamul24: SAFE_CANCEL_SEC_DEFAULT,
    pickerAlarmDetailSec: PICKER_ALARM_DETAIL_SEC_DEFAULT,
};

/**
 * ⏱️ **대기 시간 입력 — 1 이상 정수만 값이다** · 아니면 `null` (리뷰).
 * 관제웹 칸을 비우고 저장하면 0초가 저장됐다 — 인성 안전취소 0초면 원달앱이 잡자마자 스스로 취소한다.
 * 🔴 1초 미만은 값이 아니라 고장이다 · 상한은 걸지 않는다(기사님 확정). `null` 이면 설정 경로가 옛 값을 그대로 둔다.
 */
export function waitSecOrNull(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n)) return null;
    const sec = Math.floor(n);
    return sec >= 1 ? sec : null;
}

/** 그 배차망의 안전취소 초 — 픽커는 안전취소가 없어 `null` · 모르는 배차망은 기본 배차망(인성) */
export function safeCancelSecOf(w: WaitTimes, targetApp: string | null | undefined): number | null {
    const app = isTargetApp(targetApp) ? targetApp : DEFAULT_TARGET_APP;
    if (app === 'kakaopicker') return null;
    return app === 'hwamul24' ? w.safeCancelSecHwamul24 : w.safeCancelSecInsung;
}
