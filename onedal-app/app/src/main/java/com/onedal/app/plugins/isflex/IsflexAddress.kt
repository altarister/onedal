package com.onedal.app.plugins.isflex

import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.engine.RegionRegister

/**
 * 🏠 **인성플렉스 주소 다듬기 — 순수 함수** (`IsflexParserTest` · 실물 02 · 07 · 08~12).
 * 원달앱 필터(상차 목록 · 하차 목록 · 상세 전체 주소 요건)는 원달앱이 만든 주소 글자를 보므로 원달앱이 직접 다듬는다 —
 * 서버 주소 자르기는 첫 한 군데만 지워 «@»가 둘인 상세 출발 주소(«@서울 서초구 @낼8:30)방배동»)를 못 다듬는다.
 *
 * 걸음: ① 토막마다 앞 «@»를 뗀다 ② 마지막 토막을 공통 지역 정규식으로 동 + 앞글자(예약 · 마감)로 가른다
 * ③ 앞글자 끝 «/» · «)»를 뗀다 ④ 붙은 «…시…구»를 명부에 그 키가 있을 때만 둘로 ⑤ 동 앞에 붙은 시 이름을 떼되 남는 글자가 그 시의 명부 동일 때만
 * (목록은 «수원 이의동»처럼 띄어 둔다 — 시 이름이 같은 이름 동을 가른다 · 상세는 앞 토막에 그 시가 있으니 동만) ⑥ 한 칸 띄어 잇는다.
 * 🔴 그 글자 자체가 명부 동이면(«성남동») 떼지 않는다 · 명부 밖이면 붙은 채 둔다(지어내지 않는다).
 */
object IsflexAddress {

    /** 다듬은 주소와 떼어 낸 앞글자(출발 = 예약 · 도착 = 마감) — 앞글자가 없으면 null */
    data class Cleaned(val address: String, val prefix: String?)

    private val SPACES = Regex("""\s+""")
    private val JOINED_CITY_GU = Regex("""^([가-힣]+[시군])([가-힣]+구)$""")

    /** 명부의 동 이름 전부 — «그 글자 자체가 동인가» */
    private val allDongs: Set<String> by lazy { RegionRegister.withAdmin.values.flatten().toSet() }

    /** 시 · 군 짧은 이름(«수원» · «가평») → 그 시 · 군의 동 전부(구가 있는 시는 구를 합친다) */
    private val dongsByCity: Map<String, Set<String>> by lazy {
        RegionRegister.withAdmin.entries
            .mapNotNull { (sgg, dongs) ->
                val head = sgg.split(' ')[0]
                if (head.length > 2 && (head.endsWith("시") || head.endsWith("군"))) head.dropLast(1) to dongs else null
            }
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, sets) -> sets.flatten().toSet() }
    }

    fun clean(raw: String): Cleaned {
        val tokens = raw.trim().split(SPACES).map { it.trimStart('@') }.filter { it.isNotEmpty() }
        if (tokens.isEmpty()) return Cleaned(raw.trim(), null)
        val head = tokens.dropLast(1).flatMap { splitCityGu(it) }
        val info = LocationTextAnalyzer.analyze(tokens.last())
        val dong = info?.cleanRegion ?: tokens.last()
        val prefix = info?.scheduleText?.trimEnd('/', ')')?.trim()?.ifEmpty { null }
        return Cleaned((head + unglueCity(dong, head)).joinToString(" "), prefix)
    }

    /** «수원시영통구» → «수원시» «영통구» — 명부에 «수원시 영통구» 키가 있을 때만 */
    private fun splitCityGu(token: String): List<String> {
        val m = JOINED_CITY_GU.matchEntire(token) ?: return listOf(token)
        val (city, gu) = m.destructured
        return if ("$city $gu" in RegionRegister.withAdmin) listOf(city, gu) else listOf(token)
    }

    /** «수원이의동» → 목록 «수원 이의동» · 상세(앞 토막에 «수원시») «이의동» */
    private fun unglueCity(dong: String, head: List<String>): String {
        if (dong in allDongs) return dong
        for ((city, dongs) in dongsByCity) {
            if (!dong.startsWith(city) || dong.length <= city.length) continue
            val rest = dong.substring(city.length)
            if (rest !in dongs) continue
            if (head.isEmpty()) return "$city $rest"
            if (head.any { it == city || it == "${city}시" || it == "${city}군" }) return rest
        }
        return dong
    }
}
