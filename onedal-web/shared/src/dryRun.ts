/**
 * 🧮 **우회 한계 비용 · 통과/실패 조건의 규격**
 *
 * 판정은 `judge.ts` 가 기준 다섯을 모아서 낸다 (`criteria.ts`).
 *
 * 🔴 **재료가 없는 기준은 «잴 게 없다»와 «잴 수 없다»로 가른다** — 통째로 빼고 평균을 내면
 *    첫짐이 빨간불이 되거나, 못 쟀는데 꿀이 된다.
 *
 * 남은 것은 둘뿐이다 — 합짐의 **한계** 우회 계산과, 통과/실패 조건이 오가는 **규격**.
 */

export interface DryRunGate {
    key: string;
    name: string;
    pass: boolean;
    /** 실패했을 때 기사님이 읽는 문장 — "잡으면 ~가 깨집니다" */
    why: string | null;
}





export function marginalDetourMin(
    mergedTotalMin: number,
    prevRouteTotalMin: number | null,
    fallbackDiffMin: number,
): number {
    return prevRouteTotalMin != null ? Math.round(mergedTotalMin - prevRouteTotalMin) : fallbackDiffMin;
}

/** 로그 한 줄 — `🧪 [dryRun] 🟢 64점 (우회 시급 2.6만/h · 버퍼 최소 +18분) · 딱지: 통화 필수` */
