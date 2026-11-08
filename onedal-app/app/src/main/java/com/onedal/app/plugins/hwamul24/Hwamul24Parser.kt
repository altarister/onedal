package com.onedal.app.plugins.hwamul24

import com.onedal.app.core.Prefs
import android.content.Context
import com.onedal.app.core.LogTag
import com.onedal.app.core.AppLogger
import com.onedal.app.core.IScrapParser
import com.onedal.app.plugins.ListJudge
import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.StopText
import com.onedal.app.core.TargetApp
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.core.ScreenWords
import com.onedal.app.core.WordKind
import com.onedal.app.models.withPromises
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import com.onedal.app.models.CallStop

/**
 * 화물24시(전국24시콜화물) 전용 파서
 *
 * 화물24시 앱의 카드형 리스트 화면에서 추출된 텍스트 노드를 파싱하여
 * 구조화된 SimplifiedOfficeOrder 객체로 변환합니다.
 *
 * 핵심 장점: 인성콜과 달리 리스트 화면에서 적요(상세 내용)가 바로 노출되므로,
 * 상세 수집 없이 1차 필터 단계에서 수작업/블랙리스트 등을 100% 걸러낼 수 있습니다.
 *
 * 카드 구조 (스크린샷 분석 결과):
 *   [출발지 지역명]           > [도착지 지역명]
 *   [당상] [지]12Km            06:31 [지] [당착]
 *   2.5톤/윙  당착/쿠팡반품건(부천1센터)/4파렛상하차
 *   [독차] 인수증                     70,000원
 */
class Hwamul24Parser(private val context: Context) : IScrapParser {

    /** 🗳️ 판정 — 눌러도 되나 · 걸린 축 한 낱말(통과면 «pass») */
    data class Verdict(val passed: Boolean, val axis: String)

    companion object {
        private const val TAG = "1DAL_PARSER_24H"

        /** 차종 낱말 꼴 — «N톤» 또는 한글 2~6자. 머리 «성공0건/최대15건» · 화물 글은 낱말로 안 친다 */
        private val VEHICLE_WORD_SHAPE = Regex("""^(\d+(\.\d+)?톤|[가-힣]{2,6})$""")

        /** 🚚 화면 차종 줄(«다마스/전체» · «1톤/전체»)의 첫 «/» 앞 낱말 → 우리 차종(shared 배차망 정의 표 vehicleWords) · 표에 없으면 null */
        /** 상세 칸이 시작하는 낱말 — 실물 캡처 18 «상차지» (픽커 «픽업지»와 같은 꼴) */
        private const val DETAIL_FIRST_WORD = "상차지"

        /** 🧹 상세 글을 «상차지»부터 — 없으면(머리 없는 글 · 시뮬 다른 꼴) 그대로 */
        fun detailTextsOf(texts: List<String>): List<String> {
            val i = texts.indexOfFirst { it.trim() == DETAIL_FIRST_WORD }
            return if (i <= 0) texts else texts.drop(i)
        }

        fun ourVehicleOf(raw: String?): String? = raw?.trim()?.substringBefore('/')?.let { Hwamul24Pages.vehicleWords[it] }

        private val RULES = ListJudge.Rules(vehicleOf = ::ourVehicleOf, blacklistTextOf = { it.rawText ?: "" }, logHead = "24시", netCode = com.onedal.app.core.TargetApp.HWAMUL24,
            rateVehicleOf = { order, _ -> order.vehicleType })   // 💰 단가는 콜 화면 차종으로

        /** 🧪 판정 — 몸통은 배차망 공통 `ListJudge` · 제외어는 적요가 든 원문 전체에서 찾는다 */
        fun judge(order: SimplifiedOfficeOrder, filter: FilterConfig, tally: FilterTally? = null): Verdict =
            ListJudge.judge(order, filter, tally, RULES).let { Verdict(it.passed, it.axis) }

        /** 📅 상차 날 배지(당일 상차 · 내일 상차) · 하차 날 배지(당일 도착 · 내일 도착) — 실물 목록 «[당상] … [당착]» */
        /**
         * 🔇 **서버 낱말 사전을 못 받았을 때의 잡음 낱말** — 오프라인 안전망 (onedal-app/CLAUDE.md).
         * 원천은 서버 `keywords_24.json` 의 `uiNoiseWords` 이고 그 사전이 이 낱말을 다 담는다 (`Hwamul24NoiseWordsTest` 가 문다).
         */
        internal val NOISE_WORDS = setOf(
            "당상", "내상", "당착", "내착", "수", "지", "독차", "왕복",  // 날 배지는 지역이 아니다 — 꼬리표·예약으로는 `badgesOf` 가 읽는다
            "인수증", "선/착불", "전체", "화물정보", "자동새로고침",
            "오더검색", "자동터치", "성공", "최대", "ON", "OFF",
            "홈", "마이페이지", "환경", "환경설정", "배차내역",  // 아래 막대
            "무과세", "계산서",  // 결제 글
            "상차지", "하차지", "톤수", "차종", "적재중량", "운행방법", "운송료", "부가세", "결제방법", "수납금액",  // 잡기 전 상세 칸 이름(캡처 18) — 지역이 아니다(29 X12)
        )

        /**
         * 🔇 **받아 둔 서버 사전(`targetAppKeywords`)의 `uiNoiseWords` + 기본값** — 픽커 `wordsFrom` 과 같은 꼴.
         * 🔴 합쳐서 쓴다 — 서버가 죽거나 목록이 비어도 기본값만큼은 거른다 (규칙 ④ — 비면 «전부 통과»가 아니다).
         */
        fun noiseWordsOf(savedJson: String?): Set<String> {
            if (savedJson == null) return NOISE_WORDS
            return try {
                val arr = org.json.JSONObject(savedJson).optJSONArray("uiNoiseWords") ?: return NOISE_WORDS
                val fromServer = (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotEmpty() }.toSet()
                if (fromServer.isEmpty()) NOISE_WORDS else fromServer + NOISE_WORDS
            } catch (e: Exception) {
                com.onedal.app.core.DictBroken.record("24시", e)   // 📕 깨진 사전 — 기본값으로 거르고 운영센터에 하루 한 번
                NOISE_WORDS
            }
        }

        private val PICKUP_DAY_BADGES = setOf("당상", "내상")
        private val DROPOFF_DAY_BADGES = setOf("당착", "내착")

        /** 🏷️ 날 배지를 꼬리표로 — 잡음으로 버리지 않는다 (지역 후보에서는 빠진다) */
        fun badgesOf(texts: List<String>): String? =
            texts.map { it.trim() }.filter { it in PICKUP_DAY_BADGES || it in DROPOFF_DAY_BADGES }
                .joinToString(" ").ifEmpty { null }

        /**
         * 📅 **정거장 약속 — 상차는 상차 배지 + 화물 글의 상차 쪽 + 상차지 앞글자 · 하차는 하차 배지 + 화물 글의 하차 쪽 + 하차지 앞글자** (`Hwamul24ReservationTest` · `Hwamul24MemoTimesTest`).
         * 상차 · 하차는 같은 읽기 함수 — 하차 날 글자(«당착 · 내착»)가 없으면 상차 날. 화물 글 한 줄의 «10시전하차»를 상차 시각으로 읽지 않게 `Hwamul24MemoTimes` 가 가른다.
         */
        fun promisesOf(texts: List<String>, pickupPromise: String?, dropoffPromise: String?, now: java.time.LocalDateTime, memo: String? = null): Pair<com.onedal.app.core.Reservation, com.onedal.app.core.Reservation> {
            val trimmed = texts.map { it.trim() }
            val memoTimes = Hwamul24MemoTimes.split(memo)
            val pickup = listOfNotNull(trimmed.firstOrNull { it in PICKUP_DAY_BADGES }, memoTimes.pickup.ifEmpty { null }, pickupPromise).joinToString(" ")
            val dropoff = listOfNotNull(trimmed.firstOrNull { it in DROPOFF_DAY_BADGES }, memoTimes.dropoff.ifEmpty { null }, dropoffPromise).joinToString(" ")
            return com.onedal.app.core.ReservationText.readStops(pickup, dropoff, now)
        }
    }

    /** 🔇 잡음 낱말 — 서버에서 받아 둔 사전(`GET /api/config/keywords?app=24시` → `targetAppKeywords`)과 기본값 */
    private fun noiseWords(): Set<String> = noiseWordsOf(
        try { context.getSharedPreferences(Prefs.NAME, Context.MODE_PRIVATE)?.getString(Prefs.TARGET_APP_KEYWORDS, null) } catch (e: Exception) { null }
    )

    /** 🎛️ 지금 저장된 필터 — 읽기 규칙은 `FilterStore` 한 곳(인성과 같은 규칙 · 단가표 ratePerKm 도 여기서 온다) */
    fun loadCurrentFilter(): FilterConfig = com.onedal.app.core.FilterStore.current(context)

    // ════════════════════════════════════════════════════════════════
    //  parse(): 화물24시 카드형 리스트 텍스트 → SimplifiedOfficeOrder
    // ════════════════════════════════════════════════════════════════

    /**
     * 화물24시 카드에서 추출된 텍스트 노드 리스트를 파싱합니다.
     *
     * 화물24시 텍스트 노드 순서 (Row 기반 추출):
     *   "경기 부천 오정구", ">", "인천 서구 오류동",
     *   "당상", "지", "11Km", "06:31", "지", "당착",
     *   "2.5톤/윙", "당착/쿠팡반품건(부천1센터)/4파렛상하차",
     *   "독차", "인수증", "70,000원"
     */
    override fun parse(texts: List<String>): SimplifiedOfficeOrder = parseWith(texts, noiseWords())

    /** 🔇 잡음 낱말을 인자로 받는 본체 — 검사가 서버 사전마다 결과를 맞대 본다 */
    internal fun parseWith(texts: List<String>, noiseWords: Set<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")

        /**
         * ── 1. 요금(Fare) 파싱 ──
         *
         * 🔴 **무엇이 요금인가는 `Hwamul24CardGrouping` 한 곳이 정한다** (규칙 ③).
         *    카드를 묶을 때와 다른 규칙을 여기 적으면 «카드는 묶었는데 요금이 0» 이 되어
         *    콜이 통째로 버려진다 — 한 조각("70,000원")과 두 조각("200,000" + "원")을 둘 다 받는다.
         */
        val fare = Hwamul24CardGrouping.fareOf(texts)

        // ── 3. 지역 칸 고르기 · 칸 앞 토막 (LocationTextAnalyzer) — 아래 ──

        /**
         * ── 2. 차종(VehicleType): 차종 줄 «낱말/…»(«2.5톤/윙» · «1톤/카/윙» · «다마스/전체마대»)의 첫 «/» 앞 낱말 ──
         * 🚚 낱말이 배차망 정의 표(Hwamul24Pages.vehicleWords)에 있으면 차종 줄이다 — 값은 화면 글 그대로(«다마스/전체마대») 올리고 비교 때 우리 차종으로 맞춘다.
         *    노드 하나가 낱말뿐이어도(«1톤») 차종이다. 표에 없는 «낱말/…» 은 차종 모름 → 이상 기록(`VehicleWordMiss`) · 배지(«당착/…»)는 낱말로 안 친다.
         */
        val vehicleLine = Regex("""^([^\s/]+)(?:/([가-힣/]*))?""")
        var vehicleType: String? = null
        var unknownVehicle: Pair<String, String>? = null
        for (text in texts) {
            val m = vehicleLine.find(text.trim()) ?: continue
            val word = m.groupValues[1]
            if (word in Hwamul24Pages.vehicleWords) { vehicleType = m.value; break }
            if (unknownVehicle == null && m.value.contains("/") && word !in noiseWords && VEHICLE_WORD_SHAPE.matches(word))
                unknownVehicle = word to text.trim()
        }
        if (vehicleType == null) unknownVehicle?.let { (word, line) -> com.onedal.app.core.VehicleWordMiss.record("hwamul24", word, line) }

        // 🧹 맞대는 글은 앞의 그림 글자·기호를 뗀 글로 — 아래 막대가 «🚚 배차내역» 꼴로 온다
        val trimmed = texts.map { it.trim().replace(Regex("""^[^가-힣A-Za-z0-9]+"""), "").trim() }
        // 📰 뺀 글자를 버리지 않고 모은다 — 잡음 낱말 · 지역으로 못 알아본 글자 · 셋째 지역부터 (`ScreenWords`)
        trimmed.filter { it in noiseWords }.forEach { ScreenWords.add(it, WordKind.NOISE, rawJoined) }
        val analyzed = trimmed
            .filter { text ->
                !noiseWords.contains(text) &&
                text.length >= 2 &&
                !text.matches(Regex("""^\d+.*""")) && // 숫자로 시작하는 것 제외 (거리, 시간 등)
                !text.contains("원") && // 요금 제외
                !text.contains("톤") && // 차종 제외
                !text.contains("/") && // 🔴 «/» 가 든 글은 주소가 아니다 — 차종 줄(«오토바이/전체서류봉투»)·화물 글(«당착/쿠팡반품건»)
                text != ">" // 화살표 구분자 제외
            }
            .map { it to LocationTextAnalyzer.regionCell(it) }
        analyzed.filter { it.second == null }.forEach { ScreenWords.add(it.first, WordKind.UNKNOWN, rawJoined) }
        val regionCells = analyzed.filter { it.second != null }.distinctBy { it.second }
        regionCells.drop(2).forEach { ScreenWords.add(it.second!!, WordKind.EXTRA, rawJoined) }

        // 첫 지역 칸 = 상차지 · 둘째 = 하차지 — 정거장 글자는 칸 원문, 약속 토막은 제 정거장에
        val pickupCell = regionCells.getOrNull(0)?.first
        val dropoffCell = (regionCells.getOrNull(1) ?: regionCells.getOrNull(0))?.first
        val pickupPieces = pickupCell?.let { LocationTextAnalyzer.split(it, Hwamul24Pages.badgeWords) }
        val dropoffPieces = dropoffCell?.takeIf { it != pickupCell }?.let { LocationTextAnalyzer.split(it, Hwamul24Pages.badgeWords) }

        /**
         * ── 4. 거리(pickupDistance) 파싱 ──
         * 🔴 규칙은 `Hwamul24CardGrouping` 한 곳 — 한 조각("11Km")도 두 조각("14"+"Km")도 읽는다.
         */
        val pickupDistance: Double? = Hwamul24CardGrouping.pickupDistanceOf(texts)

        // ── 5. 시간(postTime) 파싱: "06:31" 등 ──
        var postTime: String? = null
        val timeRegex = Regex("""\b([0-2]?\d:[0-5]\d)\b""")
        val timeMatch = timeRegex.find(rawJoined)
        if (timeMatch != null) {
            postTime = timeMatch.groupValues[1]
        }

        // ── 6. 적요(detailMemo) 직접 추출: 화물24시의 핵심 장점! ──
        // 차종 뒤에 오는 긴 텍스트가 적요에 해당함
        // 예: "당착/쿠팡반품건(부천1센터)/4파렛상하차", "왕복 09시상 당착 주류-A"
        var detailMemo: String? = null
        for (text in texts) {
            val trimmed = text.trim()
            // 적요 후보: 8자 이상, 한글 포함, 요금/차종/순수 뱃지 아님
            if (trimmed.length >= 8 &&
                trimmed.contains(Regex("[가-힣]")) &&
                !trimmed.contains("원") &&
                !trimmed.matches(Regex("""^\d+\.?\d*톤.*""")) &&
                !noiseWords.contains(trimmed) &&
                !trimmed.startsWith("경기") && !trimmed.startsWith("인천") &&
                !trimmed.startsWith("서울") && !trimmed.startsWith("충남") &&
                !trimmed.startsWith("충북") && !trimmed.startsWith("전남") &&
                !trimmed.startsWith("전북") && !trimmed.startsWith("강원") &&
                !trimmed.startsWith("경남") && !trimmed.startsWith("경북") &&
                !trimmed.startsWith("제주") && !trimmed.startsWith("대구") &&
                !trimmed.startsWith("부산") && !trimmed.startsWith("대전") &&
                !trimmed.startsWith("광주") && !trimmed.startsWith("울산") &&
                !trimmed.startsWith("세종")
            ) {
                detailMemo = trimmed
                break
            }
        }

        val now = // 🔴 `'Z'` 는 **글자 Z 를 붙일 뿐**이다 — 한국 시각에 UTC 표식이 달려 서버가 9시간 밀려 읽었다
        //    (실측: "대기 572분"). `XXX` 를 쓰면 `+09:00` 이 붙는다
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.getDefault()).format(Date())

        val isValidOrder = fare > 0 || pickupCell != null || dropoffCell != null
        if (isValidOrder) {
            /* 🔕 목록을 읽을 때마다 돈다 — 같은 콜(상차 · 하차 · 요금)은 글자가 바뀔 때만 (`ParseLogOnceTest`) */
            val line = "📦 [24시 파싱] 상차=${pickupCell ?: "?"}, 하차=${dropoffCell ?: "?"}, 요금=$fare, " +
                    "차종=$vehicleType, 거리=${pickupDistance}km, 적요=${detailMemo?.take(30)}"
            if (com.onedal.app.core.LogOnce.changed("24시 파싱:$pickupCell|$dropoffCell|$fare", line))
                AppLogger.d(TAG, LogTag.FILTER, line)
        }

        return SimplifiedOfficeOrder(
            id = "24H-" + UUID.randomUUID().toString().substring(0, 8),
            type = "NEW_ORDER",
            fare = fare,
            timestamp = now,
            postTime = postTime,
            vehicleType = vehicleType,
            rawText = rawJoined,
            tagsText = badgesOf(texts),
            pickupDetails = listOf(CallStop(listText = pickupCell, region = StopText.regionOf(TargetApp.HWAMUL24, pickupCell),
                promiseText = pickupPieces?.promise, distanceKm = pickupDistance)),
            dropoffDetails = listOf(CallStop(listText = dropoffCell, region = StopText.regionOf(TargetApp.HWAMUL24, dropoffCell),
                promiseText = dropoffPieces?.promise)),
        ).withPromises(promisesOf(texts, pickupPieces?.promise, dropoffPieces?.promise, java.time.LocalDateTime.now(), memo = detailMemo))
    }

    // ════════════════════════════════════════════════════════════════
    //  shouldClick(): 필터 조건 판정 (공통 로직)
    // ════════════════════════════════════════════════════════════════

    /**
     * 파싱된 오더가 필터 조건을 모두 만족하는지 종합 판정합니다.
     *
     * 화물24시에서는 리스트 단계에서 적요까지 파싱 가능하므로,
     * 블랙리스트(수작업 등) 필터도 1차에서 완벽히 걸러냅니다.
     */
    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean =
        judge(order, loadCurrentFilter(), tally).passed

    // ════════════════════════════════════════════════════════════════
    //  groupListNodes(): 화물24시 카드 기반 노드 그룹화
    // ════════════════════════════════════════════════════════════════
    
    /**
     * 화물24시 카드형 리스트를 묶습니다.
     * 요금이 카드의 **끝**에 오므로, 화면 위에서 아래로 정렬한 뒤 «이전 카드의 끝 다음»부터
     * «이번 요금»까지를 한 장으로 묶습니다. 높이를 하드코딩하지 않습니다.
     *
     * 🔴 **요금은 한 조각일 수도, 두 조각일 수도 있다** — 시뮬레이터는 «200,000» 과 «원»을
     *    따로 그린다. 한 조각만 요금으로 보던 때는 카드를 **한 장도 못 묶었다**
     *    (폰 · `콜그룹 0`). 무엇이 요금인지 가르는 규칙은
     *    `Hwamul24CardGrouping` 한 곳에 있다 — 거기는 접근성 노드 없이 검사할 수 있다.
     */
    /** 📐 이 배차망은 겹친 틀을 따로 가르지 않는다 */
    override val lastFrameDiscarded: Boolean = false

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        // 세로로 겹치면 같은 줄, 줄 안은 왼쪽부터 — top 한 값의 1px 어긋남에 좌우가 뒤집히지 않게 (공통 한 벌)
        val sortedNodes = com.onedal.app.core.ScreenReadingOrder.sort(allNodes, { it.rect.top }, { it.rect.bottom }, { it.rect.left })
        val allCells = sortedNodes.map {
            Hwamul24CardGrouping.Cell(it.text, it.rect.top, it.rect.left)
        }
        /**
         * 🔴 **머리 줄을 먼저 뺀다** — 첫 카드는 화면 맨 위부터 시작하므로, 안 빼면
         *    «잔액 : 388,276 원»이 첫 장에 섞여 **요금으로 읽힌다** (실측 `요금=247947`).
         */
        val keep = Hwamul24CardGrouping.bodyIndices(allCells)
        val body = keep.map { sortedNodes[it] }
        val cells = keep.map { allCells[it] }
        val groups = mutableListOf<Pair<ScreenTextNode, List<String>>>()
        var start = 0
        for (card in Hwamul24CardGrouping.cards(cells)) {
            val cardNodes = body.subList(start, card.endIndex + 1)
            // 대표는 요금 **숫자** 노드다 — 진단 로그와 «이 콜이 화면 어디에 있나»가 이것을 읽는다
            groups.add(Pair(body[card.fareIndex], cardNodes.map { it.text }))
            start = card.endIndex + 1
        }
        return groups
    }

    /** 📅 서버 필터의 예약콜 값 — 채운 뒤 필터가 읽는다 (`IScrapParser.reservationMode`) */
    override fun reservationMode(): String? = loadCurrentFilter().reservationMode

    /** 🗳️ 떨어진 까닭을 콜에 싣는다 — 누름과 같은 판정 (막은 내일 콜이 장부에 «reservation» 으로 남는다) */
    override fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally?): SimplifiedOfficeOrder =
        order.copy(verdict = judge(order, loadCurrentFilter(), tally).axis)

    /** 🔎 목록 줄 대조 — 상세의 «운송료» 칸(정의 표)으로 견준다 · 칸이 없으면 읽은 요금(머리 «잔액»에 속지 않게 · 29 X12) */
    override fun matchDetailOrder(screenTexts: List<String>, recentOrders: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? {
        val fare = com.onedal.app.core.PageFieldRead.fareOf(Hwamul24Pages.pages, com.onedal.app.core.Page.NEW_CALL, screenTexts) ?: parse(screenTexts).fare
        return recentOrders.reversed().find { it.fare > 0 && it.fare == fare }
    }
}
