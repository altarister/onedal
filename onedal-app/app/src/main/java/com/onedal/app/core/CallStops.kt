package com.onedal.app.core

import com.onedal.app.core.engine.RegionRegister
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallStop
import com.onedal.app.models.MoneyLine
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.DispatchPluginRegistry

/**
 * 🚏 **콜의 정거장을 읽는 한 자리** — 원달앱 보고는 주소 · 약속 · 거리를 정거장 묶음에 싣는다.
 * shared `firstPickupStop` · `lastDropoffStop` · `isReservedCall` · `stopTextOf` · `stopQueryOf` · `incomeOf`(`time/timing.ts` · `network/pageRead.ts` · `call/money.ts`)의 원달앱 짝이다 — 같은 규칙.
 */

/** 🚏 첫 상차 정거장 — 상차 목록의 처음. 없으면 null */
fun firstPickupStop(o: SimplifiedOfficeOrder): CallStop? = o.pickupDetails.firstOrNull()

/** 🚏 마지막 하차 정거장 — 하차 목록의 끝. 없으면 null */
fun lastDropoffStop(o: SimplifiedOfficeOrder): CallStop? = o.dropoffDetails.lastOrNull()

/** 📏 **상차 거리** — 첫 상차 정거장의 정거장 거리(내 자리 → 상차지). 모르면 null (shared `firstStopKm` · 같은 문제지 `stopKmCases`) */
fun firstStopKm(o: SimplifiedOfficeOrder): Double? = firstPickupStop(o)?.distanceKm

/**
 * 📏 **배송 거리** — 첫 상차 뒤 정거장(남은 상차 → 하차 차례)의 정거장 거리를 다 더한 것 (shared `deliveryKmOf` · 같은 문제지 `stopKmCases`).
 *    한 곳이라도 모르면 null — 아는 것만 더하면 짧은 거리를 지어내는 셈이다.
 */
fun deliveryKmOf(o: SimplifiedOfficeOrder): Double? {
    val after = o.pickupDetails.drop(1) + o.dropoffDetails.dropLast(1) + listOf(lastDropoffStop(o))
    var km = 0.0
    for (stop in after) km += stop?.distanceKm ?: return null
    return km
}

/**
 * ✏️ **상세에서 읽은 정거장 거리를 비었을 때만 싣는다** — 네 배차망 같은 순서: 목록 값 먼저 · 없으면 상세 값.
 *    상차는 첫 상차 정거장 · 하차는 마지막 하차 정거장. 상세 값이 null 이면 그 정거장은 그대로.
 */
fun withStopKm(o: SimplifiedOfficeOrder, pickupKm: Double?, dropoffKm: Double?): SimplifiedOfficeOrder {
    val withPickup = if (pickupKm == null || firstPickupStop(o)?.distanceKm != null) o else withFirstPickup(o) { it.copy(distanceKm = pickupKm) }
    return if (dropoffKm == null || lastDropoffStop(withPickup)?.distanceKm != null) withPickup else withLastDropoff(withPickup) { it.copy(distanceKm = dropoffKm) }
}

/**
 * 📅 **예약 콜** — 첫 상차 정거장 약속 원문에 «예약» 글자가 보이거나 첫 상차 날이 1 이상 (shared `isReservedCall` · 같은 문제지 `reservedCallCases`).
 *    «당상»(날 0) · 픽커 «17:04까지 픽업»처럼 날 · 시각만 있는 오늘 콜은 예약 콜이 아니다. 로그 낱말(`ReservationGate.wordOf`)이 읽는다.
 */
fun isReservedCall(o: SimplifiedOfficeOrder): Boolean {
    val stop = firstPickupStop(o)
    return stop?.promiseText?.contains("예약") == true || (stop?.requestedDay ?: 0) >= 1
}

/** 💰 **기사님 몫** — 돈 묶음의 기사님 몫 줄 금액 · 없으면 null (shared `incomeOf` · 원달앱 요금 거르기가 읽는다) */
fun incomeOf(m: CallMoney?): Int? = m?.lines?.firstOrNull { it.kind == MoneyLine.INCOME }?.won

/** 💰 기사님 몫 줄을 이 값으로 — 있으면 바꾸고 없으면 더한다 · 다른 줄 · 결제 · 증빙은 그대로 */
fun withIncome(o: SimplifiedOfficeOrder, won: Int, shown: String): SimplifiedOfficeOrder {
    val m = o.money ?: CallMoney(lines = emptyList())
    return o.copy(money = m.copy(lines = listOf(MoneyLine(MoneyLine.INCOME, won, shown)) + m.lines.filter { it.kind != MoneyLine.INCOME }))
}

/** ✏️ 첫 상차 정거장을 고친 콜 — 상차 목록이 비어 있으면 한 곳을 만든다 */
fun withFirstPickup(o: SimplifiedOfficeOrder, f: (CallStop) -> CallStop): SimplifiedOfficeOrder =
    o.copy(pickupDetails = listOf(f(o.pickupDetails.firstOrNull() ?: CallStop())) + o.pickupDetails.drop(1))

/** ✏️ 마지막 하차 정거장을 고친 콜 — 하차 목록이 비어 있으면 한 곳을 만든다 */
fun withLastDropoff(o: SimplifiedOfficeOrder, f: (CallStop) -> CallStop): SimplifiedOfficeOrder =
    o.copy(dropoffDetails = o.dropoffDetails.dropLast(1) + f(o.dropoffDetails.lastOrNull() ?: CallStop()))

object StopText {
    /** 🏠 이 정거장 글자 — 상세 주소(앞뒤 빈칸 뗌)가 있으면 그것, 없으면 목록 원문 · 둘 다 없으면 빈 글자 (shared `stopTextOf`) */
    fun of(stop: CallStop?): String =
        stop?.addressDetail?.trim()?.ifEmpty { null } ?: stop?.listText?.ifEmpty { null } ?: ""

    internal val SPACES = Regex("""\s+""")
    /** 마지막 토막에서 약속 · 조건 토막과 동을 가르는 표 — 글자에 «(» 가 있으면 «)» 는 인성 끝 괄호라 뺀다 */
    internal val PROMISE_CUT = Regex("""[/),>]""")
    internal val PROMISE_CUT_NO_PAREN = Regex("""[/,>]""")
    /** 상세 주소(`addressDetail`)를 가르는 표 — «,» · «>» 는 목록 원문에만 쓴다(«성남대로 12,상가동» 의 번지를 지우지 않게 · 쉼표 뒤는 정의 표 `addressCut` 몫) */
    private val DETAIL_CUT = Regex("""[/)]""")
    private val DETAIL_CUT_NO_PAREN = Regex("""/""")
    /** 지역 끝말이 붙은 토막 — 숫자+동 · 가 · 동 · 읍 · 면 · 리 · 시 · 구 · 군 */
    internal val REGION_PIECE = Regex("""^[가-힣]{2,}(?:\d{1,2}[동가]|[동읍면리시구군])$""")
    /** 동 꼴 토막 — 한글 둘 이상으로 시작하고 숫자는 동 번호 둘까지 */
    internal val PLACE_PIECE = Regex("""^[가-힣]{2,}\d{0,2}[가-힣]*$""")
    /** 기호 없이 붙은 시각 — «18:30구로동» (뒤가 지역 끝말 토막일 때만 뗀다) */
    internal val GLUED_CLOCK = Regex("""^\d[\d:;.]*([가-힣].*)$""")
    private val JOINED_CITY_GU = Regex("""^([가-힣]+[시군])([가-힣]+구)$""")
    /** 번지 — 숫자만 · 숫자-숫자 토막 */
    private val LOT_NUMBER = Regex("""(?:^|\s)\d+(?:-\d+)?(?=\s|$)""")
    private val CLOSED_PAREN = Regex("""^(.+)\(([^()]+)\)$""")
    internal val UNCLOSED_PAREN = Regex("""^(.*)\(([^()]*)$""")
    private val UNPAIRED_BRACKET = Regex("""^([^\[\]]*)\]([^\[\]]*)$""")
    /** 도로명 덧글 — «폭포로412-18» 꼴 */
    private val ROAD_NOTE = Regex("""^[가-힣\d]+[로길]\d+(?:-\d+)?$""")
    /** 읍 · 면 · 동 · 리 · 가로 끝나는 지역 토막 — 정거장 `region` */
    private val REGION_END = Regex("""[가-힣](?:\d{1,2}[동가]|[동읍면리가])$""")
    private val PROMISE_GLUE_FRONT = setOf('/', '@', '(', ',', '>')
    private val PROMISE_GLUE_BACK = setOf('/', ')', '(', ',', '>')

    /** 명부의 시군구 이름 한 벌(법정동 명부 — 서버 지도와 같은 원천) */
    private val sigunguNames: List<String> by lazy { RegionRegister.bySgg.keys.toList() }
    /** 명부의 동 이름 전부 · 시 · 군 짧은 이름 → 그 시 · 군의 동 전부(명부 차례 — 처음 맞는 시가 이긴다) */
    private val allDongs: Set<String> by lazy { RegionRegister.withAdmin.values.flatten().toSet() }
    private val dongsByCity: Map<String, Set<String>> by lazy {
        val out = LinkedHashMap<String, MutableSet<String>>()
        for ((sgg, dongs) in RegionRegister.withAdmin) {
            val head = sgg.split(' ')[0]
            if (head.length <= 2 || !(head.endsWith("시") || head.endsWith("군"))) continue
            out.getOrPut(head.dropLast(1)) { mutableSetOf() }.addAll(dongs)
        }
        out
    }

    /** 🏙️ 이 글자가 시군구 하나의 짧은 이름인가 — 명부 시군구 이름 토막과 똑같거나 끝 «시 · 군 · 구»를 뗀 것과 똑같고 가리키는 곳이 하나일 때만 (shared `isSigunguShortName`) */
    fun isSigunguShortName(text: String): Boolean {
        val places = mutableSetOf<String>()
        for (s in sigunguNames) {
            val parts = s.split(' ')
            val at = parts.indexOfFirst { it == text || it.replace(Regex("[시군구]$"), "") == text }
            if (at >= 0) places += parts.take(at + 1).joinToString(" ")
        }
        return places.size == 1
    }

    /** 약속 원문 떼기 — 하나만 뗀다 · 붙은 기호가 있는 자리 먼저 · 다음 낱말 머리 · 다음 낱말 끝 · 뗀 자리는 빈칸 (shared `withoutPromise`) */
    private fun withoutPromise(text: String, promise: String): String {
        val at = mutableListOf<Int>()
        var i = text.indexOf(promise)
        while (i >= 0) { at += i; i = text.indexOf(promise, i + 1) }
        val frontGlued = { j: Int -> j > 0 && text[j - 1] in PROMISE_GLUE_FRONT }
        val backGlued = { j: Int -> j + promise.length < text.length && text[j + promise.length] in PROMISE_GLUE_BACK }
        at.firstOrNull { frontGlued(it) || backGlued(it) }?.let { g ->
            val start = if (frontGlued(g)) g - 1 else g
            val end = g + promise.length + (if (backGlued(g)) 1 else 0)
            return "${text.substring(0, start)} ${text.substring(end)}"
        }
        val head = at.firstOrNull { it == 0 || text[it - 1].isWhitespace() }
            ?: at.firstOrNull { it + promise.length == text.length || text[it + promise.length].isWhitespace() }
        return if (head == null) text else "${text.substring(0, head)} ${text.substring(head + promise.length)}"
    }

    /** 덧글을 가른 마지막 토막 — 남길 토막 · 앞에 이을 시 이름 · 뒤에 이을 도로명 · 뗀 약속 토막(«낼6시(구래동» 의 «낼6시») */
    internal data class Note(val base: String, val city: String? = null, val road: String? = null, val lead: String? = null)

    /** 괄호 · 꺾쇠 덧글 가르기 (shared `noteOf`) */
    internal fun noteOf(token: String): Note {
        CLOSED_PAREN.matchEntire(token)?.let { m ->
            val (base, inner) = m.destructured
            return if (isSigunguShortName(inner)) Note(base, city = inner) else Note(token)
        }
        val paren = UNCLOSED_PAREN.matchEntire(token)
        val bracket = if (paren == null) UNPAIRED_BRACKET.matchEntire(token) else null
        val (base, extra) = when {
            paren != null -> paren.groupValues[1] to paren.groupValues[2]
            bracket != null -> bracket.groupValues[2] to bracket.groupValues[1]
            else -> token to ""
        }
        if (base.isEmpty() || extra.isEmpty()) return Note(token)
        if (isSigunguShortName(extra)) return Note(base, city = extra)
        if (paren != null && REGION_PIECE.matches(extra)) {
            if (isSigunguShortName(base)) return Note(extra, city = base)
            if (!PLACE_PIECE.matches(base)) return Note(extra, lead = base)
        }
        return if (ROAD_NOTE.matches(extra)) Note(base, road = extra) else Note(base)
    }

    private fun splitCityGu(token: String): List<String> {
        val m = JOINED_CITY_GU.matchEntire(token) ?: return listOf(token)
        val (city, gu) = m.destructured
        return if ("$city $gu" in RegionRegister.withAdmin) listOf(city, gu) else listOf(token)
    }

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

    /**
     * 📍 **판정 글자** — 원달앱 필터 · 상세 요건 · «누른 그 콜인가» 확인이 읽는 다듬은 글자 (shared `stopQueryOf` 의 글자 몫 — 같은 문제지 `stopQueryCases`).
     *    ① `of` ② 약속 원문을 글자에서 찾아 뗐으면 끝 · 못 찾았으면 마지막 토막에서 약속 · 조건 토막을 떼고 지역 토막을 남긴다(괄호 덧글 · 붙은 시각 포함) · 토막마다 앞 «@» 뗌
     *    ③ 정의 표 `addressCut` ④ 붙은 «…시…구» · «시 이름 + 동»을 명부에 있을 때만 띄운다 ⑤ 번지가 없고 상호가 있으면 뒤에 잇는다.
     *    정거장에는 화면 원문이 남고, 이 글자는 보내지 않는다.
     */
    fun query(app: String, stop: CallStop?): String {
        val promise = stop?.promiseText?.trim()?.ifEmpty { null }
        val shown = of(stop)
        val raw = if (promise != null) withoutPromise(shown, promise) else shown
        val tokens = raw.trim().split(SPACES).map { it.trimStart('@') }.filter { it.isNotEmpty() }.toMutableList()
        val note = if (tokens.isNotEmpty()) noteOf(tokens.removeAt(tokens.lastIndex)) else null
        if (note != null) tokens += note.base
        if (raw == shown && tokens.isNotEmpty()) {
            val last = tokens.removeAt(tokens.lastIndex)
            val paren = tokens.any { it.contains('(') } || last.contains('(')
            val cut = if (stop?.addressDetail?.trim().isNullOrEmpty()) (if (paren) PROMISE_CUT_NO_PAREN else PROMISE_CUT)
                else (if (paren) DETAIL_CUT_NO_PAREN else DETAIL_CUT)
            val pieces = if (cut.containsMatchIn(last)) last.split(cut) else emptyList()
            val place = pieces.lastOrNull { REGION_PIECE.matches(it) } ?: pieces.lastOrNull { PLACE_PIECE.matches(it) } ?: last
            val clock = GLUED_CLOCK.matchEntire(place)
            tokens += if (clock != null && REGION_PIECE.matches(clock.groupValues[1])) clock.groupValues[1] else place
        }
        if (note?.city != null) tokens.add(tokens.lastIndex.coerceAtLeast(0), note.city)
        if (note?.road != null) tokens += note.road
        val joined = tokens.joinToString(" ")
        val addressCut = DispatchPluginRegistry.get(app).addressCut
        val cut = (addressCut?.let { joined.replaceFirst(it, "") } ?: joined).trim().split(SPACES).filter { it.isNotEmpty() }.toMutableList()
        val dong = if (cut.isNotEmpty()) cut.removeAt(cut.lastIndex) else null
        val head = cut.flatMap { splitCityGu(it) }
        var text = (head + listOfNotNull(dong?.let { unglueCity(it, head) })).joinToString(" ")
        val name = stop?.customerName?.trim()?.ifEmpty { null }
        if (text.isNotEmpty() && name != null && !LOT_NUMBER.containsMatchIn(text) && !text.contains(name)) text = "$text $name"
        return text
    }

    /** 🏘️ 정거장 지역 — 판정 글자의 마지막 토막이 읍 · 면 · 동 · 리 · 가로 끝나면 그것(시 · 구 · 군 · 짧은 이름은 null) */
    fun regionOf(app: String, listText: String?): String? =
        listText?.let { query(app, CallStop(listText = it)).split(SPACES).lastOrNull()?.takeIf { t -> REGION_END.containsMatchIn(t) } }
}
