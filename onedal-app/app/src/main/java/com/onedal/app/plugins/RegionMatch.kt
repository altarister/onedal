package com.onedal.app.plugins

/**
 * 🗺️ 지역 키워드 매칭 — 사전 확장으로 부분 문자열 오탐을 막는다 (기사님 확정 ④)
 *
 * 실사고: 복귀행(집=광주) 키워드 "남동"이 "인천 **남동**구"에 contains 로 걸려
 * 인천행 콜이 1차 리스트·2차 상세 필터를 다 통과했다.
 *
 * 규칙 — 서버 shared/src/regionMatch.ts 의 **미러**다. 규칙을 바꾸면 양쪽을 같이 바꾼다:
 *   · 키워드가 텍스트에 있어도, 이어지는 글자를 붙인 것이 트랩(서버가 전국 지명
 *     사전에서 계산해 keywordTraps 로 내려줌)이면 그 자리는 다른 곳이다
 *   · 트랩이 없어도 구·시·군이 바로 이어지면 마찬가지다 (문법적 안전망)
 *   · **앞에 붙은 것이 사전에 있는 더 긴 지명이면** 다른 곳이다 — "신도림동" 안의 "도림동"
 *   · 같은 텍스트의 다른 자리는 따로 다시 본다 — "남동구청에서 남동 방면" 은 일치
 *   · 🏘️ **이름이 같은 다른 지역 동** — 동 바로 앞에 다른 시·군·구가 보이면 그 자리는 다른 곳이다
 *     («경기 평택시 고덕동» ≠ 도착목표 고덕동(서울 강동구) · 실물 09-30 14:30:27). 서버가 이름이 겹치는 동에만
 *     `destinationDongSigungu`(그 동이 뜻하는 시군구 꼴들)를 내려준다. **목록 페이지에서 상세 주소가 안 보이면 통과**
 *     (상세 페이지는 요건 확인이 시·군·구 없는 하차 주소를 먼저 막는다). 문제지는 서버와 한 표(`regionMatchCases.json`).
 *
 * 🔴 미탐이 오탐보다 아프다 (규칙 ⑤ — 앱의 목적은 놓치지 않는 것).
 *    번지·공백·조사·도로명이 이어지는 정상 표기는 전부 통과한다.
 *    구서버(트랩 없음)와도 문법 안전망만으로 동작한다 (호환).
 */
object RegionMatch {

    private val ADMIN_SUFFIX = charArrayOf('구', '시', '군')

    /** 명부의 시군구 이름 한 벌 — 서버 shared `sigungu.ts` 의 SIGUNGU_NAMES 와 같은 원천(`RegionRegister` · gen:regions) */
    private val SIGUNGU_NAMES: List<String> by lazy { com.onedal.app.core.engine.RegionRegister.bySgg.keys.toList() }
    private val HINT_SPLIT = Regex("""[\s@/]+""")
    private val SUFFIXED = Regex("""[시군구]$""")

    /** 시군구 글자(«서울 용산구» · «성남시 분당구»)가 실마리(«용산» · «분당»)로 시작하는 토막을 갖나 */
    private fun hintMatches(sigungu: String, hint: String) = sigungu.split(' ').any { it.startsWith(hint) }

    /**
     * 🏘️ **동 키워드 바로 앞에 보이는 시군구** — 대조할 글자(한 토막 «평택시» · 두 토막 «서울 중구») 또는 모름(null).
     * 서버 shared `sigunguHintBefore` 와 한 벌이다(같은 문제지 `regionMatchCases.json` · `RegionMatchTableTest`).
     * - 앞 토막(공백 · @ · / 로 자름)이 명부 시군구의 어떤 토막으로 시작하면 시군구 꼴 — 명부에 없어도 «…시·군·구»로 끝나면 시군구 꼴(«달서구»)
     * - 시도만 보이면(«서울») 모름 — 목록 페이지에서 상세 주소가 안 보이면 통과
     * - 여러 곳의 같은 구 이름(«중구» = 서울 중구 · 대전 중구)이면 앞 토막까지 두 토막으로 — 두 토막이 없으면 모름
     * - 구를 건너뛴 «시 + 동»(«경기 성남시 정자동»)은 한 토막 «성남시» — 가리키는 시가 하나다
     */
    fun sigunguHintBefore(before: String): String? {
        val tokens = before.split(HINT_SPLIT).filter { it.isNotEmpty() }
        val last = tokens.lastOrNull() ?: return null
        val hits = SIGUNGU_NAMES.filter { hintMatches(it, last) }
        val suffixed = SUFFIXED.containsMatchIn(last)
        if (hits.isEmpty()) return if (suffixed) last else null
        if (!suffixed && hits.all { it.contains(' ') && it.split(' ')[0] == last }) return null
        val places = hits.map { s ->
            val parts = s.split(' ')
            parts.subList(0, parts.indexOfFirst { it.startsWith(last) } + 1).joinToString(" ")
        }.toSet()
        if (places.size == 1) return last
        val prev = tokens.getOrNull(tokens.size - 2) ?: return null
        return "$prev $last"
    }

    /** 이 자리 앞에 칸의 시군구가 아닌 시군구가 보이나 — 칸이 없거나 앞이 모름이면 false(통과 쪽) */
    fun otherSigunguBefore(before: String, sigunguForms: List<String>?): Boolean {
        if (sigunguForms.isNullOrEmpty()) return false
        val hint = sigunguHintBefore(before) ?: return false
        return hint !in sigunguForms
    }

    fun hit(text: String, keyword: String, traps: List<String>, sigunguForms: List<String>? = null): Boolean {
        if (keyword.isEmpty()) return false
        val tails = traps.filter { it.length > keyword.length && it.startsWith(keyword) }
            .map { it.substring(keyword.length) }
        /* 🔴 앞에 붙는 것도 사전에서 본다 — "도림동" 앞의 "신"(="신도림동") */
        val heads = traps.filter { it.length > keyword.length && it.endsWith(keyword) }
            .map { it.substring(0, it.length - keyword.length) }
        var i = text.indexOf(keyword)
        while (i != -1) {
            val rest = text.substring(i + keyword.length)
            /* 🔴 앞에 붙은 것이 사전에 있는 더 긴 지명이면 다른 곳이다 — "신도림동" 안의 "도림동".
               🔴 글자 종류로 가르지 않는다 — "앞이 한글이면 막는다" 로 재면 칸 사이 공백이 사라진 채
                  올라온 정상 주소가 전부 막힌다("인천남동구논현동" 의 "논현동").
               (서버 regionMatch.ts 와 한 벌) */
            val before = text.substring(0, i)
            val glued = heads.any { before.endsWith(it) }
            val trapped = glued || tails.any { rest.startsWith(it) } ||
                (rest.isNotEmpty() && rest[0] in ADMIN_SUFFIX)
            if (!trapped && !otherSigunguBefore(before, sigunguForms)) return true
            i = text.indexOf(keyword, i + 1)
        }
        return false
    }

    /** 키워드 목록 중 하나라도 걸리는가 — 서버 anyRegionHit 와 같은 규약 */
    fun anyHit(text: String, keywords: List<String>, traps: Map<String, List<String>>, dongSigungu: Map<String, List<String>> = emptyMap()): Boolean {
        return keywords.any { hit(text, it, traps[it] ?: emptyList(), dongSigungu[it]) }
    }
}
