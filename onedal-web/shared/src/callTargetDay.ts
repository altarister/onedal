/**
 * 🧭 **복귀 켬 — «바꾼 일»에서 지금 상태를 계산한다** (기사님 확정 2026-09-15).
 *
 * 기사님: *"방향 전환은 기사님이 정한다 — 활성 콜 수에서 파생될 수 없다"* (2026-08-13 · 2026-09-15 재확인).
 * 짐의 수명(콜 0건이면 끝)과 **방향의 수명**(복귀를 켜서 복귀콜을 집 가까이 내릴 때까지)은 다른 값이다.
 * 예전엔 복귀 켬이 메모리 필터에만 있었고 «복귀콜을 잡았나»를 이번 운행(`deckOfCycle` — 0건이면 빈 목록)으로 셌다.
 *
 * 🔴 **저장하는 것은 사건뿐이다** — 서버 `call_target_events` 표(`core/callTargetEvents.ts`). 지금 상태는 여기서 계산한다 (규칙 ③).
 */
import { businessDayKey } from './timing';

export interface CallTargetEvent {
    target: 'DEST' | 'HOME';
    /** 바꾼 시각 ISO */
    at: string;
    /** 기사님이 누름 · 자동 순환 */
    by: 'driver' | 'auto';
}

/**
 * 지금 복귀인가 — **오늘 영업일 줄의 마지막**. 줄이 없으면 복귀 끔(지어낸 기본값이 아니라 «오늘 안 켰다»).
 * 🔴 어제 줄은 안 본다 — 자정을 넘기면 꺼진다 (오늘 필터와 같은 수명 · 기사님 확정 2026-09-15).
 */
export function callTargetOfDay(events: CallTargetEvent[], nowMs: number): { target: 'DEST' | 'HOME'; homeOnAt: string | null } {
    const today = businessDayKey(nowMs);
    const last = events
        .filter(e => Number.isFinite(Date.parse(e.at)) && businessDayKey(Date.parse(e.at)) === today)
        .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        .at(-1);
    return last?.target === 'HOME' ? { target: 'HOME', homeOnAt: last.at } : { target: 'DEST', homeOnAt: null };
}

/** 없던 일이 된 콜 — 취소·방출. 하차를 마친 콜은 «한 일»이라 센다 */
const UNDONE_STATUSES: readonly string[] = ['SAFE_CANCEL', 'ORDER_RELEASED_BY_ME', 'ORDER_RELEASED_BY_OFFICE'];

/**
 * 복귀콜인가 — **복귀를 켠 뒤에 잡았고, 판(`board` — 콜이 통과한 목적지 시)이 집**이며, 취소·방출하지 않은 콜.
 * 🔴 켜기 전에 잡은 콜은 판이 집이어도 안 센다 — 복귀 켬 전의 운행과 섞지 않는다.
 */
export function isHomeCallSince(
    call: { status?: string | null; capturedAt?: string | null; board?: string | null },
    homeOnAt: string | null,
    home: string | null,
): boolean {
    if (!homeOnAt || !home || !call.capturedAt) return false;
    if (UNDONE_STATUSES.includes(call.status ?? '')) return false;
    if (call.board !== home) return false;
    return Date.parse(call.capturedAt) >= Date.parse(homeOnAt);
}
