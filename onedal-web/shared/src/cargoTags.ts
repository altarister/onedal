/**
 * [Phase 8.4] 화물 성질과 **시간 여유**
 *
 * 기사님: *"식료품인지, 파손되는 건지, 생물인지 등도 있으면 좋겠고.
 * 예상도착시간 대비 빨리 가야 하는지 천천히 가도 되는지 (…) 오후 2시에 콜을 잡았는데
 * 5시까지는 와야 한다든지 하는 정보가 있어야 할 것 같아. **그래야 합짐을 잡을 수 있을 듯.**"*
 *
 * 🔴 정확한 지적이다. 지금 합짐 판정에는 **시간 축이 아예 없다.**
 *    공간(적재 점수)과 경로(경유)만 보고, 우회 허용치는 `DISPATCH_CONFIG` 의
 *    **고정 상수 30분/60분**이다. 실린 짐이 30분 뒤 마감이든 5시간 뒤 마감이든 똑같이 판정한다.
 *
 *    → 마감이 촉박한 짐을 싣고도 60분 우회를 '보통'이라 하고,
 *      여유가 3시간인데도 40분 우회를 '똥'이라 걸러 **잡을 수 있는 합짐을 놓친다.**
 */

/** 화물 성질. 취급 방법과 시간 민감도를 결정한다 */
// [2026-08-12] 기사님 결정 — `가전` 을 빼고 맨 앞에 `일반화물` 을 넣는다.
// 가전은 부피도 취급도 제각각이라 성질로 묶이지 않는다 (단위로 따로 받는다).
// 대신 **대부분의 화물이 아무 성질도 없다**는 사실을 기본값으로 드러낸다 —
// 아무것도 안 고른 상태와 "특별할 것 없음"을 구분해야 통화가 짧아진다.
export const CARGO_TAGS = [
    '일반화물', '농산물', '수산물', '생물', '파손주의', '위험물', '귀중품', '중량물',
] as const;

/** 아무 성질도 없을 때의 기본값. 통화에서 대부분 이대로 넘어간다 */
export const DEFAULT_CARGO_TAG: CargoTag = '일반화물';
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
    '일반화물': { icon: '📦', timeSensitive: false, hint: '특별히 주의할 성질 없음' },
    '농산물': { icon: '🥬', timeSensitive: true, conflictsWith: ['위험물'], hint: '지연 시 신선도 저하' },
    '수산물': { icon: '🐟', timeSensitive: true, conflictsWith: ['위험물'], hint: '지연 시 신선도 저하 · 누수 주의' },
    '생물': { icon: '🦞', timeSensitive: true, conflictsWith: ['위험물'], hint: '살아 있는 화물 — 최우선' },
    '파손주의': { icon: '🥚', timeSensitive: false, hint: '급제동·적재 순서 주의' },
    '위험물': { icon: '☣️', timeSensitive: false, conflictsWith: ['농산물', '수산물', '생물'] },
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
