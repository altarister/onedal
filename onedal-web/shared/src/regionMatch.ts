/**
 * 🗺️ **지역 키워드 매칭 — 사전 확장으로 부분 문자열 오탐을 막는다** (기사님 확정 ④)
 *
 * 실사고: 복귀행(집=광주) 키워드 "남동"(광주 인근 동)이 "인천 **남동**구"에
 * `contains` 로 걸려 인천행 콜이 두 겹(1차 리스트·2차 상세)을 다 통과했다.
 * 전국에 중동·목동·삼동 같은 짧은 동이 많아 오탐이 구조적으로 열려 있었다.
 *
 * 규칙:
 *   - 키워드가 텍스트에 있어도, **이어지는 글자를 붙인 것이 사전에 있는 다른
 *     지명(트랩)** 이면 그 자리는 다른 곳이다 — "남동"+"구"="남동구"(트랩) ✗
 *   - 트랩 사전이 비어도 **구·시·군이 바로 이어지면** 마찬가지다 (문법적 안전망)
 *   - **앞에 한글이 붙어도** 다른 곳이다 — "신도림동" 안의 "도림동" ✗
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
    /* 🔴 앞에 붙는 것도 사전에서 본다 — 「도림동」 앞의 「신」(=「신도림동」) */
    const heads = (traps ?? [])
        .filter(t => t.length > keyword.length && t.endsWith(keyword))
        .map(t => t.slice(0, t.length - keyword.length));
    let i = text.indexOf(keyword);
    while (i !== -1) {
        const rest = text.slice(i + keyword.length);
        /**
         * 🔴 **앞에 붙은 것이 사전에 있는 더 긴 지명이면 다른 곳이다** (기사님 확정).
         *    실사고: 서울 전체를 빼 두었는데 «문정동 → 신도림동» 콜이 올라왔다. 하차 목록에
         *    서울은 없고 **「도림동」**이 있었는데, 「신도림동」 안에 그 글자가 그대로 있어
         *    통과했다. 뒤만 보면 한 글자 붙은 동 이름이 전부 샌다 —
         *    신도림동/도림동 · 신대방동/대방동 · 상도동/도동.
         * 🔴 **가르는 것은 사전이지 글자 종류가 아니다.** 「앞이 한글이면 막는다」로 재면
         *    칸 사이 공백이 사라진 채 올라온 정상 주소가 전부 막힌다 — 「인천남동구논현동」의
         *    「논현동」(앞이 '구')처럼. 이 함수는 **좋은 콜을 통과시키는** 자리가 쓴다
         *    (규칙 ⑤ — 미탐이 오탐보다 아프다).
         *    「앞이 시·군·구·읍·면이면 통과」로 재도 안 된다 — 「면목동」의 「목동」과
         *    「읍내동」의 「내동」이 그리로 샌다.
         */
        const before = text.slice(0, i);
        const glued = heads.some(h => before.endsWith(h));
        const trapped = glued || tails.some(tail => rest.startsWith(tail)) || /^[구시군]/.test(rest);
        if (!trapped) return true;
        i = text.indexOf(keyword, i + 1);
    }
    return false;
}

/** 키워드 목록 중 하나라도 걸리는가 — 트랩 맵과 함께 (호출부 셋: 서버 Stage1 · 앱 1차 · 앱 2차) */
export function anyRegionHit(text: string, keywords: string[], traps?: Record<string, string[]>): boolean {
    return keywords.some(k => regionKeywordHit(text, k, traps?.[k]));
}
