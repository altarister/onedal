/**
 * [Phase 8.4] 화물 성질과 **시간 여유**
 *
 * 기사님: *"식료품인지, 파손되는 건지, 생물인지 등도 있으면 좋겠고.
 * 예상도착시간 대비 빨리 가야 하는지 천천히 가도 되는지 (…) 오후 2시에 콜을 잡았는데
 * 5시까지는 와야 한다든지 하는 정보가 있어야 할 것 같아. **그래야 합짐을 잡을 수 있을 듯.**"*
 *
 * 🔴 정확한 지적이다. 지금 합짐 판정에는 **시간 축이 아예 없다.**
 *    공간(적재 점수)과 경로(회랑)만 보고, 우회 허용치는 `DISPATCH_CONFIG` 의
 *    **고정 상수 30분/60분**이다. 실린 짐이 30분 뒤 마감이든 5시간 뒤 마감이든 똑같이 판정한다.
 *
 *    → 마감이 촉박한 짐을 싣고도 60분 우회를 '보통'이라 하고,
 *      여유가 3시간인데도 40분 우회를 '똥'이라 걸러 **잡을 수 있는 합짐을 놓친다.**
 */

/** 화물 성질. 취급 방법과 시간 민감도를 결정한다 */
export const CARGO_TAGS = [
    '식료품', '냉장', '냉동', '생물', '파손주의', '위험물', '귀중품', '중량물',
] as const;
export type CargoTag = typeof CARGO_TAGS[number];

export interface CargoTagMeta {
    icon: string;
    /** 시간에 민감한가 — 늦으면 상품 가치가 훼손된다 */
    timeSensitive: boolean;
    /** 함께 실으면 안 되는 태그 */
    conflictsWith?: CargoTag[];
    hint?: string;
}

export const CARGO_TAG_META: Record<CargoTag, CargoTagMeta> = {
    '식료품': { icon: '🍱', timeSensitive: true, conflictsWith: ['위험물'] },
    '냉장': { icon: '❄️', timeSensitive: true, conflictsWith: ['위험물'], hint: '지연 시 상품 훼손' },
    '냉동': { icon: '🧊', timeSensitive: true, conflictsWith: ['위험물'], hint: '지연 시 상품 훼손' },
    '생물': { icon: '🐟', timeSensitive: true, conflictsWith: ['위험물'], hint: '살아 있는 화물 — 최우선' },
    '파손주의': { icon: '🥚', timeSensitive: false, hint: '급제동·적재 순서 주의' },
    '위험물': { icon: '☣️', timeSensitive: false, conflictsWith: ['식료품', '냉장', '냉동', '생물'] },
    '귀중품': { icon: '💎', timeSensitive: false, hint: '차량 이탈 금지' },
    '중량물': { icon: '🏋️', timeSensitive: false, hint: '상하차 장비 필요' },
};

/** 함께 실을 수 없는 조합을 찾는다. (예: 위험물 + 식료품) */
export function findTagConflicts(loaded: string[], incoming: string[]): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    for (const a of loaded) {
        const meta = CARGO_TAG_META[a as CargoTag];
        if (!meta?.conflictsWith) continue;
        for (const b of incoming) {
            if (meta.conflictsWith.includes(b as CargoTag)) out.push([a, b]);
        }
    }
    return out;
}

export function isTimeSensitive(tags?: string[] | null): boolean {
    return (tags || []).some(t => CARGO_TAG_META[t as CargoTag]?.timeSensitive);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시간 여유(slack)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 이 짐을 마감까지 배달하고 **남는 시간**(분).
 *
 *   여유 = 마감 시각 − (지금 + 남은 주행 시간)
 *
 * 기사님 예시: 14:00 에 잡았고 마감이 17:00, 남은 주행이 60분이면 → 여유 120분.
 * 그 120분 안에서만 우회할 수 있다.
 *
 * 마감을 모르면 `null` — **모르는 것을 여유가 많다고 가정하면 지각한다.**
 */
export function computeSlackMinutes(
    deadlineAt: string | undefined | null,
    remainingDriveMinutes: number,
    nowMs: number,
): number | null {
    if (!deadlineAt) return null;
    const deadline = new Date(deadlineAt).getTime();
    if (!Number.isFinite(deadline)) return null;
    return Math.round((deadline - nowMs) / 60000) - remainingDriveMinutes;
}

/**
 * 지금 실린 짐들을 고려해 **추가로 허용되는 우회 시간**(분).
 *
 * 하나라도 지각하면 안 되므로 **가장 촉박한 짐 기준**이다.
 * 마감을 아는 짐이 하나도 없으면 `null` → 호출부가 기존 고정 상수로 폴백한다.
 */
export function allowedDetourMinutes(slacks: Array<number | null>): number | null {
    const known = slacks.filter((v): v is number => v !== null);
    if (known.length === 0) return null;
    return Math.max(0, Math.min(...known));
}

/** 여유를 사람이 읽는 말로. 관제탑에 그대로 띄운다 */
export function describeSlack(slack: number | null): { text: string; level: 'none' | 'tight' | 'ok' | 'ample' } {
    if (slack === null) return { text: '마감 미확인', level: 'none' };
    if (slack < 0) return { text: `${-slack}분 지각 예상`, level: 'tight' };
    if (slack < 30) return { text: `여유 ${slack}분 — 촉박`, level: 'tight' };
    if (slack < 90) return { text: `여유 ${slack}분`, level: 'ok' };
    const h = Math.floor(slack / 60);
    return { text: `여유 ${h}시간 ${slack % 60}분 — 합짐 여력 있음`, level: 'ample' };
}
