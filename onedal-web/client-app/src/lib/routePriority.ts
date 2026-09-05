/**
 * 🛣️ **경로 방침 — 무엇을 고를 수 있고, 언제 잠기나** (2026-09-05 신설)
 *
 * ── 왜 뽑았나 ──
 * 「추천 / 시간 / 거리」 버튼과 그 잠금 규칙이 `PinnedRoute` 안에 인라인으로만 있었다.
 * 목업이 «경로를 바꿔 본다» 장면을 그리려니 **같은 규칙을 한 벌 더 적어야 했다** —
 * 그러면 실물이 바뀔 때 목업이 조용히 옛 규칙을 그린다 (규칙 ③).
 * 그래서 **규칙만** 여기로 뽑았다. 그리는 것은 각자 한다.
 */

export type RoutePriority = 'RECOMMEND' | 'TIME' | 'DISTANCE';

/**
 * 🔴 **이름은 카카오내비 화면에서 그대로 가져온다** (기사님 2026-09-05:
 *    *"내비에서 보던 것과 같은 text로 해야 할 것 같아"*).
 *
 * 카카오내비 하단에 「내비추천 · 큰길 우선 · 최단거리 …」로 적혀 있다 (2026-09-04 실물 확인).
 * 🔴 **기사님이 개인폰에서 보는 말과 관제폰에서 보는 말이 달라선 안 된다** — 폰 둘을
 *    오가며 쓰는 제품이라, 같은 것을 다르게 부르면 그 자리에서 헷갈린다.
 * ⚠️ 우리가 보내는 값은 여전히 `TIME` 이다 — 「큰길 우선」에 딱 맞는 값이 없어
 *    근사한 것이다 (경로.md §2-2). **이름만 맞추고 근사라는 사실은 안 감춘다.**
 */
export const ROUTE_PRIORITIES: Array<{
    key: RoutePriority;
    /** 지금 실물 지도가 쓰는 짧은 이름 (32px 정사각 버튼) */
    label: string;
    /** 🔴 카카오내비 화면의 이름 — 목업이 쓰는 것. 확정되면 실물도 이것으로 간다 */
    naviLabel: string;
    long: string;
}> = [
    { key: 'RECOMMEND', label: '추천', naviLabel: '내비추천', long: '내비추천' },
    { key: 'TIME', label: '시간', naviLabel: '큰길 우선', long: '큰길 우선 (우리는 TIME 으로 근사한다)' },
    { key: 'DISTANCE', label: '거리', naviLabel: '최단거리', long: '최단거리' },
];

/**
 * 🔒 **합짐 중에는 경로 방침을 바꿀 수 없다** (기사님 확정 2026-08-19 · 2026-09-05 정정).
 *
 * *"2건 이상이면 선택되지 못한 버튼을 숨긴다 — 어떤 것이 선택돼 있는지는 보이고,
 *   경로는 바꿀 수 없게."* · *"합짐 잡기 전까지 바꿀 수 있어야 해."*
 *
 * 방침은 도로 선택을 바꾼다 — 순서는 안 바뀌지만 주행 시간이 변해 **이미 잡은 약속들과
 * 어긋날 수 있다.** 그래서 **확정된 콜이 둘이 되는 순간 잠근다.**
 *
 * 🔓 **심사 중인 콜은 세지 않는다** — 아직 확정이 아니다. 그래야
 *    *"이 콜을 붙이면 어떤 경로가 되나"* 를 바꿔 보는 자리가 남는다 (기사님 0819).
 *
 * 🔴 **2026-09-05 정정** (기사님: *"주행 중 합짐2 심사 여기서는 경로 변경을 할 수
 *    없어야 한다"*). 예전 식은 `활성 ≥ 2 && !심사중` 이라 **심사 중이면 무조건 열렸다** —
 *    이미 둘을 잡고 셋째를 심사할 때도 열려서, 그때 방침을 바꾸면 **이미 잡은 두 콜의
 *    약속이 흔들렸다.** 잠그는 이유를 심사가 뚫고 있었다.
 *    ⚠️ 이것은 실물(`PinnedRoute`)에도 있던 결함이다 — 함께 고쳐진다.
 *
 * @param confirmedCount **확정된** 콜 수 (심사 중인 것은 빼고 센다)
 * @param anyEvaluating 심사 중(안전취소)인 콜이 있나 — 지금은 세지 않지만,
 *   부르는 쪽이 «무엇을 빼고 세야 하는지»를 잊지 않도록 남겨 둔다
 */
export function isPriorityLocked(confirmedCount: number, _anyEvaluating?: boolean): boolean {
    return confirmedCount >= 2;
}

/**
 * 🛣️ **방침을 바꾸면 실제로 무엇이 달라지나** — 09-03 실측 (경로.md §2-1 · `car_type=1`).
 *    집(초월읍) → 가산동. 🔴 **지어낸 값이 아니다.**
 *
 * 🔴 **추천과 시간이 같다.** 09-03 여덟 구간을 전부 재서 **7/8 에서 같았다**
 *    (경로.md §2-2). 우리 길찾기 API 에 「고속도로 우선」에 딱 맞는 값이 없어
 *    `TIME` 으로 근사하기 때문이다 — 갈리는 구간에서만 달라진다.
 */
export const PRIORITY_SAMPLE: Record<RoutePriority, { km: number; min: number; toll: number }> = {
    RECOMMEND: { km: 47.5, min: 104, toll: 1900 },
    TIME:      { km: 47.5, min: 104, toll: 1900 },
    DISTANCE:  { km: 44.8, min: 111, toll: 1900 },
};

/** 지금 실물 지도가 쓰는 짧은 이름 — 한 곳에서 온다 (규칙 ③) */
export const PRIORITY_LABEL: Record<RoutePriority, string> =
    Object.fromEntries(ROUTE_PRIORITIES.map(p => [p.key, p.label])) as Record<RoutePriority, string>;
