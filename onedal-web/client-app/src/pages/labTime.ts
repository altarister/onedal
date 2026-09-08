/**
 * ⏱️ **시간과 정거장 이름 — 한 곳에서 만든다** (2026-09-09 구조 리뷰).
 *
 * 🔴 **왜 뽑았나** — 같은 누적 계산이 `MapMockup.tsx` 안에 **다섯 벌**로 흩어져 있었다
 *    (919·945·1094·1254·1404). 그중 셋에서 「분끼리 빼는」 같은 버그가 났고,
 *    한 곳만 고쳤다가 나머지를 놓쳤다. 이 레포가 같은 병으로 세 번 당했다고
 *    루트 CLAUDE.md 가 적어 두고 있다 (경유 4벌 · 상태목록 3벌 · 시별칭).
 *
 * 읽기 전용이다 — 실물 코드는 이 파일을 import 하지 않는다 (`labFilterOutput` 와 같은 규약).
 */

/** 구간 하나에서 이 파일이 보는 것만 — 전체 `ChainLeg` 를 안 끌어온다 */
export type LegLike = { to: string | null; durMin: number | null };
/** 전체 경로에서 이 파일이 보는 것만. `measuredAt` = **그 경로를 잰 시각** */
export type ChainLike = { legs: readonly LegLike[]; measuredAt?: number };

/** ① ② ③ … 20까지. 넘으면 `(21)` — 화면에 그대로 나가는 표기다 */
export const circled = (n: number) => n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`;

/**
 * 정거장 이름 — `①상차` 처럼 **번호 + 역할**이다.
 * 🔴 지금은 «표시용 번호»가 열쇠라, 콜이 취소되면 번호가 당겨져 남의 정거장을 가리킨다.
 *    나중에 `callId` 로 바꿀 때 **고칠 자리가 여기 하나**이도록 모아 둔다.
 */
export const stopLabel = (callNo: number, kind: '상차' | '하차') => `${circled(callNo)}${kind}`;

/** 시각을 «시:분»으로. 없으면 `--:--` — 0 이나 지금 시각으로 대신 채우지 않는다 (규칙 ④) */
export const hhmm = (t: number | null | undefined) =>
    t == null ? '--:--' : new Date(t).toTimeString().slice(0, 5);

/**
 * 구간을 순서대로 걸으며 **정거장까지의 누적 분**을 낸다.
 *
 * 🔴 **못 잰 구간을 만나면 거기서 멈춘다** — 그 뒤 정거장은 «모른다»가 맞다.
 *    0 으로 치고 계속 더하면 뒤가 전부 이르게 나온다 (규칙 ④).
 * 🔴 이름 없는 정거장은 안 넣는다 — 열쇠가 없으면 나중에 못 찾는다.
 */
export function cumMinutes(legs: readonly LegLike[] | undefined): Map<string, number> {
    const out = new Map<string, number>();
    let acc = 0;
    for (const lg of legs ?? []) {
        if (lg.durMin == null) break;
        acc += lg.durMin;
        if (lg.to) out.set(lg.to, acc);
    }
    return out;
}

/**
 * 그 경로가 말하는 **도착 «시각»**. 잰 시각 + 누적 분.
 *
 * 🔴 **분이 아니라 시각으로 낸다.** 두 경로를 견줄 때 각자의 «0분»이 다른 자리라,
 *    분끼리 빼면 그 사이 주행 시간이 통째로 섞인다 (2026-09-09 실측으로 잡은 버그).
 * 🔴 잰 시각을 모르면 `null` — «지금»으로 대신 채우지 않는다.
 */
export function arrivalAt(chain: ChainLike | null | undefined, label: string): number | null {
    if (chain?.measuredAt == null) return null;
    const min = cumMinutes(chain.legs).get(label);
    return min == null ? null : chain.measuredAt + min * 60000;
}
