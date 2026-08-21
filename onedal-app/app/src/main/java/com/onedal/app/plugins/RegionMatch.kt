package com.onedal.app.plugins

/**
 * 🗺️ 지역 키워드 매칭 — 사전 확장으로 부분 문자열 오탐을 막는다 (2026-08-22 · 기사님 확정 ④)
 *
 * 실사고: 복귀행(집=광주) 키워드 "남동"이 "인천 **남동**구"에 contains 로 걸려
 * 인천행 콜이 1차 리스트·2차 상세 필터를 다 통과했다.
 *
 * 규칙 — 서버 shared/src/regionMatch.ts 의 **미러**다. 규칙을 바꾸면 양쪽을 같이 바꾼다:
 *   · 키워드가 텍스트에 있어도, 이어지는 글자를 붙인 것이 트랩(서버가 전국 지명
 *     사전에서 계산해 keywordTraps 로 내려줌)이면 그 자리는 다른 곳이다
 *   · 트랩이 없어도 구·시·군이 바로 이어지면 마찬가지다 (문법적 안전망)
 *   · 같은 텍스트의 다른 자리는 따로 다시 본다 — "남동구청에서 남동 방면" 은 일치
 *
 * 🔴 미탐이 오탐보다 아프다 (규칙 ⑤ — 앱의 목적은 놓치지 않는 것).
 *    번지·공백·조사·도로명이 이어지는 정상 표기는 전부 통과한다.
 *    구서버(트랩 없음)와도 문법 안전망만으로 동작한다 (호환).
 */
object RegionMatch {

    private val ADMIN_SUFFIX = charArrayOf('구', '시', '군')

    fun hit(text: String, keyword: String, traps: List<String>): Boolean {
        if (keyword.isEmpty()) return false
        val tails = traps.filter { it.length > keyword.length && it.startsWith(keyword) }
            .map { it.substring(keyword.length) }
        var i = text.indexOf(keyword)
        while (i != -1) {
            val rest = text.substring(i + keyword.length)
            val trapped = tails.any { rest.startsWith(it) } ||
                (rest.isNotEmpty() && rest[0] in ADMIN_SUFFIX)
            if (!trapped) return true
            i = text.indexOf(keyword, i + 1)
        }
        return false
    }

    /** 키워드 목록 중 하나라도 걸리는가 — 서버 anyRegionHit 와 같은 규약 */
    fun anyHit(text: String, keywords: List<String>, traps: Map<String, List<String>>): Boolean {
        return keywords.any { hit(text, it, traps[it] ?: emptyList()) }
    }
}
