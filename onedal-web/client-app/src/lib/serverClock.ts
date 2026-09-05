/**
 * 🕐 **서버 시계** — 화면이 말하는 시각을 **서버 것**으로 맞춘다.
 *
 * 기사님(2026-09-05): *"폰 시계가 아니고 **서버 시계**로 만들어야 해..
 * 그래야 **서버 시간으로 우리가 계산**하지."*
 *
 * 🔴 **왜 갈라지면 안 되나** — 상차 마감·안전취소 30초·판정 버퍼는 전부 **서버 시각**으로
 *    잰다. 그런데 헤더 시계는 `new Date()`(폰 시계)였고, 바로 옆에 **서버 연결 점**이
 *    붙어 있어 «서버가 말한 시각»으로 읽혔다. 폰 시계가 틀어져 있으면
 *    *"왜 벌써 끝났지"* 가 되는데 **아무 신호가 없었다.**
 *
 * 🔴 **오프셋 하나만 둔다** (규칙 ③). 여러 자리가 각자 «서버 시각»을 구하면
 *    같은 화면에 두 시각이 뜬다. 여기서 재고, 읽는 곳은 `serverNow()` 만 부른다.
 */

/** 한 번 잰 결과 */
export interface ClockSync {
    /** 서버 − 우리 (ms). 양수면 **서버가 앞선다** */
    offsetMs: number;
    /** 왕복 시간 — 클수록 오프셋이 덜 정확하다 */
    rttMs: number;
    /** 언제 쟀나 (우리 시계) */
    measuredAt: number;
}

/**
 * 📏 **왕복으로 오프셋을 구한다.**
 *
 * ```
 * sentAt ────────▶ 서버(serverMs) ────────▶ receivedAt
 *        └── 가는 데 rtt/2 ──┘└── 오는 데 rtt/2 ──┘
 * ```
 * 서버가 답한 순간의 **우리 시계**를 `sentAt + rtt/2` 로 어림한다.
 * 🔴 **가는 길과 오는 길이 같다고 가정한다** — 참이 아닐 수 있으므로 `rttMs` 를 함께
 *    남긴다. 왕복이 길면 그만큼 못 믿는다는 뜻이다 (없는 정밀도를 지어내지 않는다).
 */
export function measureOffset(sentAt: number, receivedAt: number, serverMs: number): ClockSync {
    const rttMs = Math.max(0, receivedAt - sentAt);
    return {
        offsetMs: serverMs - (sentAt + rttMs / 2),
        rttMs,
        measuredAt: receivedAt,
    };
}

/**
 * 🕐 **지금 서버 시각** (ms).
 * 🔴 **아직 못 쟀으면 우리 시계 그대로다** — 그때는 «맞췄다»고 말하지 않는다
 *    (`isSynced` 로 갈라 본다). 없는 것을 지어내지 않는다 (규칙 ④).
 */
export function serverNow(sync: ClockSync | null, now: number = Date.now()): number {
    return now + (sync?.offsetMs ?? 0);
}

/** 맞춰졌나 — 재지 못했으면 화면이 «폰 시계»라고 말해야 한다 */
export function isSynced(sync: ClockSync | null): boolean {
    return sync !== null;
}

/**
 * ⚠️ **폰 시계가 얼마나 틀어졌나** — 이만큼 벌어지면 화면에 알린다.
 *
 * 🔴 값 **30초** (안전취소가 30초다). 그보다 적게 틀어진 것은 기사님이 할 일이 없고,
 *    그보다 크면 **한 콜을 통째로 오해할 수 있는 크기**다.
 */
export const CLOCK_DRIFT_WARN_MS = 30_000;

export function isDrifting(sync: ClockSync | null): boolean {
    return sync !== null && Math.abs(sync.offsetMs) >= CLOCK_DRIFT_WARN_MS;
}

/**
 * 🔁 **다시 재는 간격** — 5분.
 * 🔴 폰 시계는 천천히 흐른다(수정 진동자 오차). 한 번 재고 끝내면 하루 뒤엔 다시 틀어진다.
 *    소켓이 다시 붙을 때도 잰다 — 그동안 폰이 잤을 수 있다.
 */
export const CLOCK_RESYNC_MS = 5 * 60_000;
