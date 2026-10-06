/**
 * 🗂️ **앱 이상 기록 까닭 갈래** — 원달앱이 까닭 글 앞에 붙이는 «KIND:» 로 가른다(운영센터 «앱 이상 기록» 탭).
 *    갈래 이름은 원달앱이 보내는 영문 그대로 두고, 한글 이름만 여기 한 벌 — 모르는 갈래는 영문 그대로 뜬다(지어내지 않는다).
 */
const KIND_LABEL: Record<string, string> = {
    CALL_TAKEN: '먼저 가져감',
    SCREEN_UNKNOWN: '모르는 화면',
    DETAIL_MISMATCH: '목록 · 상세 다름',
    REQUIREMENT_UNMET: '필수 칸 못 읽음',
    TAP_FAILED: '누르기 실패',
    SNAPSHOT_PARSE_FAILED: '사진 판독 실패',
    SNAPSHOT_MISMATCH: '사진 · 글자 다름',
    VEHICLE_UNKNOWN: '모르는 차종',
    OTHER: '기타',
    ALL: '전체',
};

export function anomalyKindOf(reason: string): string {
    return /^([A-Z][A-Z_]*):/.exec(reason)?.[1] ?? 'OTHER';
}

export function anomalyKindLabel(kind: string): string {
    return KIND_LABEL[kind] ?? kind;
}

/** «전체» 다음 많은 순 — 들어온 줄에 있는 갈래만 탭이 된다 */
export function anomalyTabsOf(reasons: string[]): { kind: string; label: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const r of reasons) { const k = anomalyKindOf(r); counts.set(k, (counts.get(k) ?? 0) + 1); }
    const kinds = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return [['ALL', reasons.length] as [string, number], ...kinds].map(([kind, count]) => ({ kind, label: anomalyKindLabel(kind), count }));
}
