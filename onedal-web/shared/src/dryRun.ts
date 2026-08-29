/**
 * 🧮 **우회 한계 비용 · 통과/실패 조건의 규격**
 *
 * 🪦 **채점기(`scoreDryRun`)는 2026-08-29 에 철거됐다.** 판정은 `judge.ts` 가
 *    기준 다섯을 모아서 낸다 (`criteria.ts`). 갈아타기 전 84건을 나란히 대조해
 *    **어긋남 0** 을 확인했고, 그 대조 검사도 «갈아탄 뒤에는 지운다» 는 자기 약속대로 지웠다.
 *
 * 🔴 **되살리지 말 것** — 옛 채점기는 재료가 없으면 그 기준을 통째로 빼고 **평균을 올렸다**.
 *    「잴 게 없다」와 「잴 수 없다」를 못 갈라서 첫짐이 빨간불이 되거나, 못 쟀는데 꿀이 됐다.
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
