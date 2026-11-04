/**
 * 📍 **단계 사유 — 그때 무슨 일이 있었나** (기사님 확정).
 *
 * 🔴 **단계마다 관심사가 다르다.** 기사님: *"상차지 도착에서는 단위·수량·방법·보호·성질
 *    이것들이 모두 없어야 하는 거 아닌가? 상차지 도착에 관한 것만 있으면 될 것 같은데.
 *    이동 중에 문제가 없었는지, 상차지에 문제(주소 다름·점심시간) 뭐 그런 것들."*
 *
 *   상차지 도착 — 오는 길 + 그 장소            (아직 문을 열기 전이다)
 *   상차 완료   — 화주·짐                      (여기서 비로소 실어 본다)
 *   하차지 도착 — 오는 길 + 그 장소 + **짐 상태** (문을 열면 보인다)
 *   하차 완료   — 인수 단계
 *
 * 🔴 **이 값은 아무것도 판정하지 않는다** — 색·필터·약속과 무관하다. 겪은 일을 적어 두는
 *    칸일 뿐이라 목록이 아직 **가설**이어도 안전하다 (기사님: *"유튜브에서 본 것이 전부야"*).
 *
 * 🔴 **`기타` 를 반드시 둔다.** 목록 밖의 일이 어디에도 안 남으면 **목록을 고칠 근거
 *    자체가 사라진다.** 한 달쯤 뒤 "한 번도 안 쓴 사유"와 "기타로 적힌 것"을 세어 고친다.
 *
 * ⚠️ `수량 다름` 은 넣지 않는다 (기사님 확정: *"3 실측폼"*). 실측 폼에 실제 수량을 적으면
 *    `cargoMismatchRatio` 가 신고와의 차이를 **스스로 센다** — 사유로 또 적으면 같은 사실이
 *    두 곳에 살고 갈라진다 (규칙 ③).
 */
/**
 * 🗂️ **갈래로 묶는다** (기사님 확정).
 *
 * 기사님: *"모든 종류의 트러블이 하나에 모여 있어서 찾기 너무 어렵고 추가하기도 좀
 * 그렇다. 도로문제 / 상차지문제 / 기타 이런 식으로 카테고리로 나누어 표시하는 것이
 * 좋을 것 같은데. 어느 정도 높이가 시트마다 비슷해야 버튼 찾기도 좋으니까."*
 *
 * 한 줄에 쏟아 두면 찾는 데 시간이 걸리고 **늘릴 자리도 없다.** 묶어 두면 눈이 먼저
 * 갈래를 고르고, 사유를 더해도 그 갈래 안에서 자란다 — 목록이 가설이라 늘어날 것을
 * 전제로 짜야 한다.
 */
const ROAD_TROUBLE = ['교통 지연', '사고', '진입 곤란'] as const;   // 오는 길 — 도착 단계에만

const REASON_GROUPS_BY_STEP: Record<string, ReadonlyArray<{ label: string; reasons: readonly string[] }>> = {
    /** 오는 길 + 그 장소. 짐 이야기는 없다 — 아직 문을 못 열었다 */
    ARRIVE_PICKUP: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '상차지 문제', reasons: ['주소 다름', '점심시간', '문 잠김'] },
    ],
    /** 실어 본 뒤에야 아는 것 */
    LOADED: [
        { label: '상차 문제', reasons: ['화주 미준비', '물건 없음', '상차 중 파손'] },
    ],
    /** 오는 길 + 그 장소 + 짐 상태 (문을 열면 보인다 — 하차 완료는 이미 내린 뒤라 늦다) */
    ARRIVE_DROPOFF: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '하차지 문제', reasons: ['주소 다름', '수령인 부재'] },
        { label: '짐 상태', reasons: ['짐 무너짐', '결박 풀림', '파손 발견'] },
    ],
    /** 인수 단계 */
    DELIVERED: [
        { label: '하차 문제', reasons: ['검수 지연', '인수 거부'] },
    ],
};

/** 이것을 고를 때만 메모를 받는다 — 자유 입력 금지 원칙의 유일한 예외 (근거는 위) */
export const REASON_NEEDS_MEMO = '기타';

/** 이 **단계**의 사유 갈래 — `기타` 는 언제나 마지막 갈래로 따로 선다 */
export function arrivalReasonGroupsFor(stepId: string): Array<{ label: string; reasons: string[] }> {
    const own = REASON_GROUPS_BY_STEP[stepId];
    if (!own) return [];
    return [
        ...own.map(g => ({ label: g.label, reasons: [...g.reasons] })),
        { label: '기타', reasons: [REASON_NEEDS_MEMO] },
    ];
}

/** 갈래를 펼친 평면 목록 (검사·저장 검증용) */
export function arrivalReasonsFor(stepId: string): string[] {
    return arrivalReasonGroupsFor(stepId).flatMap(g => g.reasons);
}

export const ARRIVAL_REASONS = Array.from(new Set(
    Object.keys(REASON_GROUPS_BY_STEP).flatMap(arrivalReasonsFor),
));
