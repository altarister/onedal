import type { JudgmentSnapshot } from '@onedal/shared';

/**
 * 🧾 **심사석의 결론 — 이 후보를 받으면 기존 콜이 어떻게 되나** (목업 «④ 후보콜에 대한 심사 결론»).
 *
 * 재료는 서버 합짐 심사가 스냅샷에 실은 정거장 줄(`judgment.stops`)과 모르는 까닭(`judgment.unknownWhy`)이다.
 * 여기는 **말만 고른다** — 늦음(분)은 서버가 후보를 넣은 경로의 타임라인에서 이미 셌다 (규칙 ③).
 *
 * 🔴 **모르면 «안 밀린다»고 하지 않는다** (기사님: *"'기존 콜은 안 밀린다'가 아니고 모른다,
 *    카카오가 값을 잘못 줬다 … 이렇게 표시하던가 해야 하는 거지"*). 기사님은 색만 보고 1~2초에 누르신다 —
 *    모르는 것을 초록으로 칠하는 것이 이 시스템의 가장 큰 사고다 (규칙 ⑤-3). 한 정거장이라도 예정을 모르면 모른다.
 * 🔴 지난 정거장은 안 센다 — 이미 지났으면 밀릴 것이 없다.
 * 첫짐 심사(기존 콜 없음)는 `null` — 말할 것이 없으면 줄을 안 만든다.
 */
export type SeatStop = NonNullable<JudgmentSnapshot['stops']>[number];

export interface SeatConclusion {
    kind: 'unknown' | 'late' | 'ok';
    text: string;
    /** 가장 늦어지는 기존 정거장 — `late` 일 때만 */
    worst: SeatStop | null;
}

export function seatConclusion(j: Pick<JudgmentSnapshot, 'stops' | 'unknownWhy'> | undefined | null): SeatConclusion | null {
    if (!j) return null;
    if (j.unknownWhy) return { kind: 'unknown', text: `❓ 모른다 — ${j.unknownWhy}`, worst: null };
    const ahead = (j.stops ?? []).filter(s => !s.arrived);
    if (ahead.length === 0) return null;
    if (ahead.some(s => s.etaAt == null)) return { kind: 'unknown', text: '❓ 모른다 — 예정을 못 잰 정거장이 있다', worst: null };
    /* 약속이 없는 정거장은 늦음을 셀 수 없다 — «못 잼»이 아니라 견줄 것이 없는 것이라 결론에서만 뺀다 */
    const judged = ahead.filter(s => s.lateMin != null);
    if (judged.length === 0) return null;
    const worst = judged.reduce((w, s) => ((s.lateMin as number) > (w.lateMin as number) ? s : w));
    return (worst.lateMin as number) > 0
        /* ☎️ 가장 늦는 정거장이 곧 «전화할 곳»이다 — 동 이름이 있으면 함께 (목업 시트 심사 카드) */
        ? { kind: 'late', text: `⚠️ ${worst.name}${worst.place ? ` (${worst.place})` : ''}가 ${worst.lateMin}분 늦어진다 · ☎️ 전화`, worst }
        : { kind: 'ok', text: '✅ 기존 콜은 안 밀린다', worst: null };
}
