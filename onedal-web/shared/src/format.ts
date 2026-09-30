/**
 * 🕐 **시각 글자 — 한 모양 · 한 곳** (onedal-1f 결정 · 공통 함수 1).
 *    24시간 «HH:MM:SS» · «HH:MM», **늘 한국 시각**(기기 시간대가 달라도 같은 글자 — 날짜 계산과 같은 뿌리).
 *    `toLocaleTimeString('ko-KR', { hour12: false })` 는 «14시 5분 3초», 옵션 없이는 «오후 2:05:03» 이 나와 자리마다 갈렸다.
 *    빈 값 · 0 · 못 읽는 글자는 null — 빈 자리에 보일 글자(«—» · «--:--» 등)는 부르는 쪽이 정한다.
 *
 * 🔴 **`방금` · `3분 전` 같은 상대시각을 쓰지 않는다** (기사님 «멈춰 있는 것 같아 · 보내온 마지막 시간을 쓰는 것이 좋겠다»).
 *    상대시각은 다시 그려져야만 참인 말이라, 폰이 끊겨 화면이 안 그려지면 문구가 숫자와 함께 멈춘다.
 *    절대시각은 안 그려져도 거짓이 되지 않는다.
 * 🔴 **«움직이고 있나»를 묻는 자리는 초까지**(clockText) — 분까지만 적으면 30초 전과 90초 전이 같아 보인다.
 */
const KST_MS = 9 * 3600_000;
type At = number | string | Date | null | undefined;

const pad2 = (n: number) => String(n).padStart(2, '0');

function kstOf(at: At): Date | null {
    if (at == null || at === '' || at === 0) return null;
    const ms = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
    return Number.isFinite(ms) ? new Date(ms + KST_MS) : null;
}

/** «HH:MM:SS» 한국 시각 */
export function clockText(at: At): string | null {
    const d = kstOf(at);
    return d ? `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}` : null;
}

/** «HH:MM» 한국 시각 */
export function hhmmText(at: At): string | null {
    const d = kstOf(at);
    return d ? `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}` : null;
}
