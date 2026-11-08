/**
 * 단계 사유 표
 * 누가: 관제웹 단계 시트(`StepSheetMock` 의 사유 칩 줄)가 읽는다. 서버 · 원달앱 · 운영센터는 이 표를 읽지 않는다
 * 언제: 기사님이 잡은 콜의 단계 고치기 팝업을 열었을 때 — 상차지 도착 · 상차 완료 · 하차지 도착 · 하차 완료 넷. 카드의 단계 요약은 칩 없이 고른 사유를 보내기만 한다
 * 어디서: 사유 칩 줄 — 갈래마다 한 줄, 맨 끝 줄은 언제나 «기타»
 * 무엇을: 그 단계에서 겪은 일(교통 지연 · 주소 다름 · 짐 무너짐 …)을 갈래로 묶은 목록
 * 어떻게: `arrivalReasonGroupsFor(단계)` 가 그 단계의 갈래에 «기타» 갈래를 붙여 준다. 관제웹은 고른 사유를 배열로 보내고(«기타»는 `기타: 메모` 꼴), 서버는 이 표와 대조하지 않고 JSON 글자로 단계 기록의 `reasons` 칸에 저장한다
 * 왜: 겪은 일을 남겨 두어야 나중에 목록을 고칠 수 있다. 판정 · 필터 · 약속과는 관계없다
 *
 * 단계마다 고를 것이 다르다 — 문을 열기 전과 뒤가 다르기 때문이다
 *   상차지 도착 — 오는 길 + 그 장소
 *   상차 완료   — 화주 · 짐 (실어 본 뒤에야 안다)
 *   하차지 도착 — 오는 길 + 그 장소 + 짐 상태 (문을 열면 보인다 · 하차 완료는 이미 내린 뒤라 늦다)
 *   하차 완료   — 인수
 *
 * - «기타»는 늘 둔다 — 목록 밖의 일이 어디에도 안 남으면 목록을 고칠 근거가 사라진다. «기타»만 메모를 받는다(`REASON_NEEDS_MEMO`)
 * - «수량 다름»은 넣지 않는다 — 실측 짐 칸에 수량을 적으면 신고와의 차이를 따로 센다(`cargoMismatchRatio`). 사유로 또 적으면 같은 사실이 두 곳에 산다
 * - 갈래로 묶는다 — 목록은 아직 가설이라 늘어날 것을 전제로 짠다. 한 줄에 모으면 찾기 어렵고 더할 자리가 없다. 사유를 더하면 그 갈래 안에서 자란다
 */
const ROAD_TROUBLE = ['교통 지연', '사고', '진입 곤란'] as const;   // 오는 길 — 도착 단계에만

const REASON_GROUPS_BY_STEP: Record<string, ReadonlyArray<{ label: string; reasons: readonly string[] }>> = {
    ARRIVE_PICKUP: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '상차지 문제', reasons: ['주소 다름', '점심시간', '문 잠김'] },
    ],
    LOADED: [
        { label: '상차 문제', reasons: ['화주 미준비', '물건 없음', '상차 중 파손'] },
    ],
    ARRIVE_DROPOFF: [
        { label: '도로 문제', reasons: ROAD_TROUBLE },
        { label: '하차지 문제', reasons: ['주소 다름', '수령인 부재'] },
        { label: '짐 상태', reasons: ['짐 무너짐', '결박 풀림', '파손 발견'] },
    ],
    DELIVERED: [
        { label: '하차 문제', reasons: ['검수 지연', '인수 거부'] },
    ],
};

/** 메모 칸이 열리는 사유 — 자유 입력 금지 원칙의 유일한 예외 */
export const REASON_NEEDS_MEMO = '기타';

/** 이 단계의 사유 갈래 — 단계 사유 표가 없는 단계는 빈 목록 */
export function arrivalReasonGroupsFor(stepId: string): Array<{ label: string; reasons: string[] }> {
    const own = REASON_GROUPS_BY_STEP[stepId];
    if (!own) return [];
    return [
        ...own.map(g => ({ label: g.label, reasons: [...g.reasons] })),
        { label: '기타', reasons: [REASON_NEEDS_MEMO] },
    ];
}

/** 갈래를 펼친 목록 — 검사만 쓴다 */
export function arrivalReasonsFor(stepId: string): string[] {
    return arrivalReasonGroupsFor(stepId).flatMap(g => g.reasons);
}

/** 모든 단계의 사유를 겹침 없이 — 검사만 쓴다 */
export const ARRIVAL_REASONS = Array.from(new Set(
    Object.keys(REASON_GROUPS_BY_STEP).flatMap(arrivalReasonsFor),
));
