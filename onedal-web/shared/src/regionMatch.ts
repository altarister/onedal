/**
 * 🗺️ **지역 키워드 매칭 — 사전 확장으로 부분 문자열 오탐을 막는다** (2026-08-22 · 기사님 확정 ④)
 *
 * 실사고: 복귀행(집=광주) 키워드 "남동"(광주 인근 동)이 "인천 **남동**구"에
 * `contains` 로 걸려 인천행 콜이 두 겹(1차 리스트·2차 상세)을 다 통과했다.
 * 전국에 중동·목동·삼동 같은 짧은 동이 많아 오탐이 구조적으로 열려 있었다.
 *
 * 규칙:
 *   - 키워드가 텍스트에 있어도, **이어지는 글자를 붙인 것이 사전에 있는 다른
 *     지명(트랩)** 이면 그 자리는 다른 곳이다 — "남동"+"구"="남동구"(트랩) ✗
 *   - 트랩 사전이 비어도 **구·시·군이 바로 이어지면** 마찬가지다 (문법적 안전망)
 *   - 같은 텍스트의 다른 자리는 따로 다시 본다 — "남동구청에서 남동 방면" ✓
 *
 * 🔴 미탐이 오탐보다 아프다 (규칙 ⑤ — 앱의 목적은 놓치지 않는 것).
 *    번지·공백·조사·도로명("중동로")이 이어지는 정상 표기는 전부 통과한다.
 *
 * 트랩의 원천은 서버의 전국 행정구역 사전(geoService)이다 — 키워드를 만들 때
 * 함께 계산해 `keywordTraps` 로 피기백에 실리고, 앱(Kotlin `RegionMatch`)은
 * 같은 규칙을 미러링한다. 규칙을 바꾸면 **양쪽을 같이** 바꾼다.
 */
export function regionKeywordHit(text: string, keyword: string, traps?: string[]): boolean {
    if (!keyword) return false;
    const tails = (traps ?? [])
        .filter(t => t.length > keyword.length && t.startsWith(keyword))
        .map(t => t.slice(keyword.length));
    let i = text.indexOf(keyword);
    while (i !== -1) {
        const rest = text.slice(i + keyword.length);
        const trapped = tails.some(tail => rest.startsWith(tail)) || /^[구시군]/.test(rest);
        if (!trapped) return true;
        i = text.indexOf(keyword, i + 1);
    }
    return false;
}

/** 키워드 목록 중 하나라도 걸리는가 — 트랩 맵과 함께 (호출부 셋: 서버 Stage1 · 앱 1차 · 앱 2차) */
export function anyRegionHit(text: string, keywords: string[], traps?: Record<string, string[]>): boolean {
    return keywords.some(k => regionKeywordHit(text, k, traps?.[k]));
}
