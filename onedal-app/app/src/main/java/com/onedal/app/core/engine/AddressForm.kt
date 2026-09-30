package com.onedal.app.core.engine

/**
 * 🏠 **전체 주소인가 — 세 배차망이 같은 한 판정** (기사님 «상세의 필수 요소는 전체 주소 · 배차망에 따라 달라질 수 없다»)
 *
 * 목적은 «서버가 좌표를 찍을 수 있는가»다. 그래서 서버가 좌표를 찍는 지도와 같은 명부(`RegionRegister`)로 본다.
 *   전체 주소 = 명부의 시군구가 주소에 있고, 그 뒤에 (그 시군구의 읍면동 **또는** 도로명 «…로/…길 + 번지»)가 있다.
 * - 시군구 키는 두 모양이다 — 광역시는 «서울 강남구»(시도 포함), 도 아래는 «성남시 분당구»·«광주시»(시도 없음).
 *   주소 앞의 시도(«경기 …»)는 있어도 없어도 된다 — 키의 토막이 주소에 연달아 있는지만 본다.
 * - 명부는 **법정동**이고 픽커 사진 주소는 **행정동**이다. 그래서 숫자와 «본동»을 접어 대조한다 — «삼성1동»·«반포본동»은 «삼성동»·«반포동»과 같게 본다.
 *   ⚠️ 한계: 이름 자체가 다른 행정동(«여의동»·«을지로동»·«위례동» 등)은 명부에 없어 전체 주소가 아니라고 판정된다(상세에서 탈락) — 명부에 행정동이 들어오면 풀린다.
 * - 구가 있는 시(«성남시 분당구»·«부천시 원미구»)는 **구 없이 «시 + 동»**도 된다 — 그 동이 그 시의 어느 구엔가 있으면.
 *   부천처럼 구가 없어진 시는 실제 주소에 구가 없다(«경기 부천시 중동»). 광역시(«서울 …»)는 인정하지 않는다 — 같은 이름 동이 여러 구에 있다.
 * - 명부 밖 지역(지도에 없는 곳)은 전체 주소가 아니다 → 상세에서 탈락한다(기사님이 받아들인 한계 · 전국 확대는 지도 확장과 함께).
 */
object AddressForm {
    /** 주소가 긴 시도 이름을 쓰면 명부의 짧은 이름으로 — 명부 키는 «서울 강남구» 꼴이다 */
    private val SIDO_SHORT = mapOf(
        "서울특별시" to "서울", "서울시" to "서울", "인천광역시" to "인천", "인천시" to "인천",
        "대전광역시" to "대전", "대전시" to "대전", "세종시" to "세종특별자치시", "세종" to "세종특별자치시",
    )
    private val ROAD = Regex("""\S+(로|길)\s*\d""")
    /** 시·구 바로 뒤 행정 토막 — 한글로 시작(«101동»은 아니다) · 끝에 숫자 둘까지(«역삼1동») · 동/읍/면/가로 끝 */
    private val ADMIN_UNIT = Regex("""^[가-힣]{1,6}\d{0,2}(동|읍|면|가)$""")
    private val DIGITS = Regex("""\d""")

    /** 🗂️ 명부 + «구 없는 시» — 부를 때마다 다시 합치지 않는다(상세 한 번에 여러 번 불린다 · 명부는 굳힌 상수) */
    private val defaultMerged: Map<String, Set<String>> by lazy { RegionRegister.bySgg + citiesWithoutGu(RegionRegister.bySgg) }

    /**
     * «죽전 1동» → «죽전1동» · «을지로 3가» → «을지로3가» — 사진 판독이 동 이름과 번호 사이를 띄운다.
     * 🏢 앞 토막이 명부의 읍면동이고(«죽전»+동 · «을지로») 번호가 1~2자리일 때만 — «푸르지오 2동»(아파트 동)을 붙이면 행정동 없는 주소가 전체로 통과했다.
     */
    private val SPACED_UNIT = Regex("""(?<=^|\s)([가-힣]+)\s+(\d{1,2}(?:동|가))(?=\s|$)""")
    /** 명부의 읍면동 이름 전부 — 번호 없는 이름이다(«죽전동» · «을지로») */
    private val registeredDongs: Set<String> by lazy { RegionRegister.bySgg.values.flatten().toSet() }

    /**
     * 🏘️ **띄어 읽힌 동 번호를 붙인다** (`AddressSpacedDongTest` · 라이브 10-01 00:32:02 «경기 용인시 수지구 죽전 1동 순창떡»이 «하차 주소 짧음»).
     * 요건 검사 · 사진 행정동 · 목록 줄 대조 열쇠가 같이 쓴다.
     */
    fun joinSpacedUnit(text: String): String = SPACED_UNIT.replace(text) {
        val base = it.groupValues[1]
        if ("${base}동" in registeredDongs || base in registeredDongs) "$base${it.groupValues[2]}" else it.value
    }

    fun isFull(text: String, register: Map<String, Set<String>> = RegionRegister.bySgg): Boolean {
        val tokens = joinSpacedUnit(text).trim().split(Regex("""\s+""")).filter { it.isNotEmpty() }.map { SIDO_SHORT[it] ?: it }
        if (tokens.isEmpty()) return false
        val merged = if (register === RegionRegister.bySgg) defaultMerged else register + citiesWithoutGu(register)
        for ((sgg, dongs) in merged) {
            val key = sgg.split(' ')
            val at = indexOfRun(tokens, key)
            if (at < 0) continue
            val rest = tokens.drop(at + key.size)
            val folded = dongs.mapTo(HashSet()) { fold(it) }
            if (rest.any { fold(it) in folded }) return true
            // 🔄 행정동은 명부(법정동)에 없다 — 시·구가 정확히 맞은 바로 뒤 한글 «…동/읍/면/가» 토막이면 전체다 (실물 «서울 송파구 위례동» · «역삼1동»)
            if (rest.firstOrNull()?.let { ADMIN_UNIT.matches(it) } == true) return true
            if (ROAD.containsMatchIn(rest.joinToString(" "))) return true
        }
        return false
    }

    /**
     * 📍 **이 주소의 시·군·구에 그 동이 명부에 있나** — 두 줄로 꺾인 행정동을 이을지 가른다(`PickerScreenOcr.readStop`).
     * «경기 성남시 중원구» + «상대원1동» → 참 · «상가동»·«관리동»(건물 동) → 거짓. 숫자·«본동»은 접어 대조한다.
     */
    fun knownDong(address: String, dong: String, register: Map<String, Set<String>> = RegionRegister.bySgg): Boolean {
        val tokens = address.trim().split(Regex("""\s+""")).filter { it.isNotEmpty() }.map { SIDO_SHORT[it] ?: it }
        val merged = if (register === RegionRegister.bySgg) defaultMerged else register + citiesWithoutGu(register)
        val want = fold(dong)
        return merged.any { (sgg, dongs) -> indexOfRun(tokens, sgg.split(' ')) >= 0 && dongs.any { fold(it) == want } }
    }

    private fun fold(s: String) = s.replace(DIGITS, "").replace("본동", "동")

    /** «성남시 분당구»·«성남시 수정구» → «성남시» = 두 구의 동을 합친 것. 첫 토막이 «…시»인 두 토막 키만 (광역시 «서울 강남구»는 제외) */
    private fun citiesWithoutGu(register: Map<String, Set<String>>): Map<String, Set<String>> =
        register.entries.filter { (sgg, _) -> sgg.split(' ').let { it.size == 2 && it[0].endsWith("시") } }
            .groupBy({ it.key.split(' ')[0] }, { it.value })
            .mapValues { (_, sets) -> sets.flatten().toSet() }

    private fun indexOfRun(tokens: List<String>, key: List<String>): Int {
        for (i in 0..tokens.size - key.size) {
            if (key.indices.all { tokens[i + it] == key[it] }) return i
        }
        return -1
    }
}
