package com.onedal.app.plugins.isflex

import android.content.Context
import com.onedal.app.core.AppLogger
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.LogTag
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageFieldRead
import com.onedal.app.core.Prefs
import com.onedal.app.core.ReservationText
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.core.ScreenWords
import com.onedal.app.core.TargetApp
import com.onedal.app.core.WordKind
import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.models.withPromises
import com.onedal.app.plugins.ListJudge
import java.text.SimpleDateFormat
import java.time.LocalDateTime
import java.util.Date
import java.util.Locale
import java.util.UUID
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.lastDropoffStop
import com.onedal.app.core.StopText
import com.onedal.app.core.withFirstPickup
import com.onedal.app.core.withLastDropoff
import com.onedal.app.models.CallStop

/**
 * 📄 **인성플렉스 파서** — 목록 줄(칸 7개가 노드 7개로 따로 온다) · 상세(제목 글자 사이) → 콜 양식 (`IsflexParserTest` — 실물 기대값).
 *
 * - 목록 줄 묶기는 `IsflexRowGrouping`(순수 함수) · 칸은 원문 그대로 정거장에 싣고 약속 · 조건 토막은 칸 앞 토막 함수(`LocationTextAnalyzer.split`)가 가른다 — 판정 글자는 `StopText.query`
 * - 목록 · 상세는 화면 이름이 아니라 사실로 가른다 — 글에 «총 수입»이 있으면 상세다
 * - 상세 칸은 배차망 정의 표의 읽는 법(`IsflexPages.pages` 상세 칸 정규식)으로 읽는다 — 서버와 같은 한 벌
 * - 판정 몸통은 배차망 공통 `ListJudge` — 다른 것은 인자(`RULES`)뿐
 */
class IsflexParser(private val context: Context? = null) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER_FLEX"

        /** 상세 칸이 시작하는 낱말 — 그 앞(머리 «@… → …» · 지도 설명)은 상세 글에서 뗀다 (실물 08~12) */
        private const val DETAIL_FIRST_WORD = "출발지까지"

        /** 상세에만 있는 글자 — 글에 이것이 있으면 상세로 읽는다 (목록은 칸 머리 «수입» · 상세는 «총 수입») */
        private const val DETAIL_FARE_TITLE = "총 수입"

        /**
         * 🔇 **서버 낱말 사전을 못 받았을 때의 잡음 낱말** — 오프라인 안전망 (onedal-app/CLAUDE.md).
         * 목록 머리 · 탭 · 띠 · 칸 머리 · 칩 «전체» + 상세 제목 · 단추.
         * 🔴 칩 «오토바이» · «승용/소형» · «도보» · «개인이동수단»은 넣지 않는다 — 줄 차종 낱말과 같은 글자다(칩은 자리로 빠진다 · `IsflexRowGrouping`).
         */
        internal val NOISE_WORDS = setOf(
            "퇴근하기", "목록", "지도", "신규", "진행중", "AI 배차 대기중",
            "출발지까지\n(km)", "출발지", "도착지", "수입", "전체",
            "출발지까지", "출발", "도착", "적요상세", "총 수입", "닫기",
        )

        /** 👻 목록에 섞이면 상세 잔상 — «…원 \n수행하기» 단추는 줄바꿈 든 한 글자라 «든다»로 본다 */
        internal val DETAIL_ONLY_WORDS = setOf("총 수입", "적요상세", "수행하기")

        /** 🩹 상세에 섞이면 목록 잔상 */
        internal val LIST_ONLY_WORDS = setOf("AI 배차 대기중", "출발지까지\n(km)", "퇴근하기", "진행중")

        /** 받아 둔 사전이 인성플렉스 것인가 — 서버 사전 `appName` */
        private const val DICT_NAME = "플렉스"

        /**
         * 🔇 **받아 둔 서버 사전(`targetAppKeywords`) 열쇠 하나 + 기본값**.
         * 🔴 원달앱은 부팅 때 저장 라벨 몫 사전 하나만 받는다 — 인성을 골라 둔 채 갈아타면 받아 둔 사전은 인성 것이다.
         *    사전 `appName` 이 «플렉스»일 때만 서버 낱말을 합치고, 아니면 기본값만 쓴다.
         */
        fun wordsOf(savedJson: String?, key: String, defaults: Set<String>): Set<String> {
            if (savedJson == null) return defaults
            return try {
                val json = org.json.JSONObject(savedJson)
                if (json.optString("appName") != DICT_NAME) return defaults
                val arr = json.optJSONArray(key) ?: return defaults
                defaults + (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotEmpty() }
            } catch (e: Exception) {
                com.onedal.app.core.DictBroken.record(DICT_NAME, e)   // 📕 깨진 사전 — 기본값으로 거르고 운영센터에 하루 한 번
                defaults
            }
        }

        /** 🚚 화면 차종 글자(«오토») → 우리 차종(정의 표 `IsflexPages.vehicleWords`) · 표에 없거나 우리 차종이 없으면(«도보») null */
        fun ourVehicleOf(raw: String?): String? = raw?.trim()?.let { IsflexPages.vehicleWords[it] }

        /** 제외어를 볼 글 — 상세의 적요 + 꼬리표만(주소 낱말로 좋은 콜이 떨어지지 않게) · 목록 줄에는 둘 다 없어 늘 빈 글 */
        fun blacklistTextOf(order: SimplifiedOfficeOrder): String {
            val t = listOf(order.rawText ?: "")
            return listOfNotNull(
                PageFieldRead.fieldOf(IsflexPages.pages, Page.NEW_CALL, PageField.MEMO, t),
                PageFieldRead.fieldOf(IsflexPages.pages, Page.NEW_CALL, PageField.TAGS, t),
            ).joinToString(" ")
        }

        private val RULES = ListJudge.Rules(
            vehicleOf = ::ourVehicleOf,
            blacklistTextOf = ::blacklistTextOf,
            logHead = "플렉스",
            netCode = TargetApp.ISFLEX,
            // 💰 단가 바닥은 기사님 차종(설정창) — 못 받았으면 콜 화면 차종으로(null 이면 단가 조건이 통째로 빠진다)
            rateVehicleOf = { order, cfg -> cfg.driverVehicleType ?: order.vehicleType },
        )

        /** 🧪 판정 — 몸통은 배차망 공통 `ListJudge` */
        fun judge(order: SimplifiedOfficeOrder, filter: FilterConfig, tally: FilterTally? = null): ListJudge.Verdict =
            ListJudge.judge(order, filter, tally, RULES)

        /** 🧹 상세 글을 «출발지까지»부터 — 없으면 그대로 */
        fun detailTextsOf(texts: List<String>): List<String> {
            val i = texts.indexOfFirst { it.trim() == DETAIL_FIRST_WORD }
            return if (i <= 0) texts else texts.drop(i)
        }

        fun isDetail(texts: List<String>): Boolean = texts.any { it.trim() == DETAIL_FARE_TITLE }

        private fun nowStamp(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.getDefault()).format(Date())

        private fun newId(): String = "FLX-" + UUID.randomUUID().toString().substring(0, 8)

        private fun tagsOf(vararg parts: String?): String? = parts.filterNotNull().filter { it.isNotBlank() }.joinToString(" ").ifEmpty { null }

        /**
         * 📋 **목록 줄 하나** — 글자 꼴로 칸을 고른다. 차례는 차종(출발지 앞) · 도착지(출발지 뒤)를 가를 때만 쓴다.
         * @param texts 줄 글자 — `IsflexRowGrouping` 차례(거리 · 차종 · 출발지 · 운행 거리 · 도착지 · 수입 · 결제)
         */
        fun parseList(texts: List<String>, noiseWords: Set<String>, now: LocalDateTime): SimplifiedOfficeOrder {
            val raw = texts.joinToString(" ")
            val t = texts.map { it.trim() }
            t.filter { it in noiseWords }.forEach { ScreenWords.add(it, WordKind.NOISE, raw) }
            val fare = t.firstOrNull { IsflexRowGrouping.FARE.matches(it) }?.replace(",", "")?.toIntOrNull() ?: 0
            val pickupDistance = t.firstOrNull { IsflexRowGrouping.PICKUP_DISTANCE.matches(it) }?.toDoubleOrNull()
            val delivery = t.firstNotNullOfOrNull { IsflexRowGrouping.DELIVERY_DISTANCE.matchEntire(it)?.groupValues?.get(1)?.toDoubleOrNull() }
            val payment = t.firstOrNull { it in IsflexRowGrouping.PAYMENTS }
            val pickupAt = t.indexOfFirst { it.startsWith(IsflexRowGrouping.PICKUP_MARK) }
            // 꼴에 안 드는 나머지 — 출발지 앞은 차종(첫 글자) · 꼬리표, 뒤는 도착지(첫 글자) · 남는 토막
            val rest = t.withIndex().filter { (i, s) ->
                i != pickupAt && s !in noiseWords && !IsflexRowGrouping.FARE.matches(s) && !IsflexRowGrouping.PICKUP_DISTANCE.matches(s) &&
                    !IsflexRowGrouping.DELIVERY_DISTANCE.matches(s) && s !in IsflexRowGrouping.PAYMENTS
            }
            val before = rest.filter { pickupAt < 0 || it.index < pickupAt }.map { it.value }
            val after = rest.filter { pickupAt >= 0 && it.index > pickupAt }.map { it.value }
            val vehicle = before.firstOrNull()
            val badges = before.drop(1)
            after.drop(1).forEach { ScreenWords.add(it, WordKind.EXTRA, raw) }
            if (vehicle != null && vehicle !in IsflexPages.vehicleWords) com.onedal.app.core.VehicleWordMiss.record(TargetApp.ISFLEX, vehicle, raw)

            val pickupCell = if (pickupAt >= 0) t[pickupAt] else null
            val dropoffCell = after.firstOrNull()
            val pickup = pickupCell?.let { LocationTextAnalyzer.split(it, IsflexPages.badgeWords) }
            val dropoff = dropoffCell?.let { LocationTextAnalyzer.split(it, IsflexPages.badgeWords) }
            val order = SimplifiedOfficeOrder(
                id = newId(),
                type = "NEW_ORDER",
                fare = fare,
                timestamp = nowStamp(),
                vehicleType = vehicle,
                rawText = raw,
                pickupDetails = listOf(CallStop(listText = pickupCell, region = StopText.regionOf(TargetApp.ISFLEX, pickupCell), promiseText = pickup?.promise, distanceKm = pickupDistance)),
                dropoffDetails = listOf(CallStop(listText = dropoffCell, region = StopText.regionOf(TargetApp.ISFLEX, dropoffCell), promiseText = dropoff?.promise, distanceKm = delivery)),
                tagsText = tagsOf(*badges.toTypedArray(), *conditionsOf(pickup, dropoff), dropoff?.promise, payment),
            ).withPromises(ReservationText.readStops(pickup?.promise, dropoff?.promise, now))   // 🔴 제 칸의 약속 토막만 — 도착 마감 «10:20전»은 하차 정거장
            if (order.fare > 0) {
                /* 🔕 목록을 읽을 때마다 돈다 — 같은 콜은 글자가 바뀔 때만 */
                val line = "📦 [플렉스 파싱] 상차=${StopText.query(TargetApp.ISFLEX, firstPickupStop(order))}, 하차=${StopText.query(TargetApp.ISFLEX, lastDropoffStop(order))}, 요금=${order.fare}, 차종=$vehicle, " +
                    "출발지까지=${pickupDistance}km, 운행=${delivery}km, 예약=${firstPickupStop(order)?.promiseText}, 꼬리표=${order.tagsText}"
                if (com.onedal.app.core.LogOnce.changed("플렉스 파싱:${StopText.of(firstPickupStop(order))}|${StopText.of(lastDropoffStop(order))}|${order.fare}", line))
                    AppLogger.d(TAG, LogTag.FILTER, line)
            }
            return order
        }

        /** 🏷️ 출발 · 도착 칸의 조건 토막(«급송» · «왕복») — 화면 기록에 남긴다 */
        private fun conditionsOf(vararg cells: com.onedal.app.core.CellPieces?): Array<String> = cells.flatMap { it?.conditions.orEmpty() }.toTypedArray()

        /** 상세 칸 하나 — 정의 표 읽는 법 */
        private fun detailField(texts: List<String>, field: PageField): String? = PageFieldRead.fieldOf(IsflexPages.pages, Page.NEW_CALL, field, texts)

        private fun kmOf(s: String?): Double? = s?.toDoubleOrNull()

        /**
         * 🔎 **상세 글 → 콜** — 손으로 연 상세 · 목록 줄 대조 실패 길(`parse`)과 앱이 연 콜 채우기(`fillFromDetail`)가 같이 쓴다.
         * 주소는 칸 원문 · 약속은 칸 앞 토막 · 못 읽은 칸은 null(지어내지 않는다).
         */
        fun parseDetail(texts: List<String>, now: LocalDateTime): SimplifiedOfficeOrder {
            val pickupCell = detailField(texts, PageField.PICKUP)
            val dropoffCell = detailField(texts, PageField.DROPOFF)
            val pickup = pickupCell?.let { LocationTextAnalyzer.split(it, IsflexPages.badgeWords) }
            val dropoff = dropoffCell?.let { LocationTextAnalyzer.split(it, IsflexPages.badgeWords) }
            return SimplifiedOfficeOrder(
                id = newId(),
                type = "NEW_ORDER",
                fare = PageFieldRead.fareOf(IsflexPages.pages, Page.NEW_CALL, texts) ?: 0,
                timestamp = nowStamp(),
                vehicleType = detailField(texts, PageField.VEHICLE_TYPE),
                rawText = texts.joinToString(" "),
                pickupDetails = listOf(CallStop(listText = pickupCell, region = StopText.regionOf(TargetApp.ISFLEX, pickupCell), promiseText = pickup?.promise,
                    distanceKm = kmOf(detailField(texts, PageField.PICKUP_DISTANCE)))),
                dropoffDetails = listOf(CallStop(listText = dropoffCell, region = StopText.regionOf(TargetApp.ISFLEX, dropoffCell), promiseText = dropoff?.promise,
                    distanceKm = kmOf(detailField(texts, PageField.DELIVERY_DISTANCE)))),
                tagsText = tagsOf(detailField(texts, PageField.TAGS), *conditionsOf(pickup, dropoff), dropoff?.promise, detailField(texts, PageField.PAYMENT)),
            ).withPromises(ReservationText.readStops(pickup?.promise, dropoff?.promise, now))
        }

        /**
         * 🏠 **앱이 연 콜을 상세 값으로 채운다** (`IsflexPlugin.fillDetail`) — 읽을 글은 `order.rawText`(공통이 채우기 전에 상세 이은 글로 바꿔 둔다).
         * 주소 · 예약 · 꼬리표는 상세 값으로 덮고 못 읽으면 목록 값 그대로 · 차종 · 거리는 비었을 때만(앱이 연 콜은 목록 출발지까지를 둔다).
         */
        fun fillFromDetail(order: SimplifiedOfficeOrder, now: LocalDateTime): SimplifiedOfficeOrder {
            val d = parseDetail(listOf(order.rawText ?: ""), now)
            val readPickup = firstPickupStop(d)?.listText != null
            val dp = firstPickupStop(d)
            val dd = lastDropoffStop(d)
            val filled = order.copy(
                tagsText = if (readPickup) d.tagsText else order.tagsText,
                vehicleType = order.vehicleType ?: d.vehicleType,
            )
            val withPickup = withFirstPickup(filled) { stop ->
                (if (readPickup) stop.copy(listText = dp?.listText, region = dp?.region ?: stop.region, promiseText = dp?.promiseText, requestedDay = dp?.requestedDay, requestedTime = dp?.requestedTime) else stop)
                    .copy(distanceKm = stop.distanceKm ?: dp?.distanceKm)
            }
            return withLastDropoff(withPickup) { stop ->
                (if (dd?.listText != null) stop.copy(listText = dd.listText, region = dd.region ?: stop.region) else stop)
                    .copy(distanceKm = stop.distanceKm ?: dd?.distanceKm)
            }
        }

        /** 마지막 토막(동) — 판정 글자 목록 «수원 이의동» · 상세 «경기 수원시 영통구 이의동» 모두 «이의동» */
        private fun lastToken(stop: CallStop?): String = StopText.query(TargetApp.ISFLEX, stop).split(Regex("""\s+""")).last()

        /**
         * 🔎 **이 상세가 목록 어느 줄인가** — 요금 + 출발 동 + 도착 동이 같은 줄이 꼭 하나일 때만. 아니면 null(지어내지 않는다).
         * 요금만으로는 못 가른다 — 실물 07 에 21,252 둘 · 10,626 둘. 출발지까지는 시간이 지나면 바뀌어 안 쓴다.
         */
        fun matchDetail(detailTexts: List<String>, recent: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? {
            val d = parseDetail(detailTexts, LocalDateTime.now())
            if (d.fare <= 0 || firstPickupStop(d)?.listText == null || lastDropoffStop(d)?.listText == null) return null
            val hits = recent.reversed().filter {
                it.fare == d.fare && lastToken(firstPickupStop(it)) == lastToken(firstPickupStop(d)) && lastToken(lastDropoffStop(it)) == lastToken(lastDropoffStop(d))
            }
            return hits.firstOrNull()?.takeIf { first -> hits.all { StopText.of(firstPickupStop(it)) == StopText.of(firstPickupStop(first)) && StopText.of(lastDropoffStop(it)) == StopText.of(lastDropoffStop(first)) } }
        }
    }

    private fun savedDict(): String? =
        try { context?.getSharedPreferences(Prefs.NAME, Context.MODE_PRIVATE)?.getString(Prefs.TARGET_APP_KEYWORDS, null) } catch (e: Exception) { null }

    /** 🔇 잡음 낱말 — 받아 둔 인성플렉스 사전(`uiNoiseWords`) + 기본값 */
    private fun noiseWords(): Set<String> = wordsOf(savedDict(), "uiNoiseWords", NOISE_WORDS)

    /** 🎛️ 지금 저장된 필터 — 읽기 규칙은 `FilterStore` 한 곳 */
    fun loadCurrentFilter(): FilterConfig = com.onedal.app.core.FilterStore.current(context)

    override fun parse(texts: List<String>): SimplifiedOfficeOrder =
        if (isDetail(texts)) parseDetail(texts, LocalDateTime.now()) else parseList(texts, noiseWords(), LocalDateTime.now())

    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean =
        judge(order, loadCurrentFilter(), tally).passed

    /** 🗳️ 떨어진 까닭을 콜에 싣는다 — 누름과 같은 판정 */
    override fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally?): SimplifiedOfficeOrder =
        order.copy(verdict = judge(order, loadCurrentFilter(), tally).axis)

    override fun reservationMode(): String? = loadCurrentFilter().reservationMode

    override fun matchDetailOrder(screenTexts: List<String>, recentOrders: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder? =
        matchDetail(screenTexts, recentOrders)

    /** 📐 칸 머리 «수입» 아래 · 기준 요금 줄로 묶는다 — 같은 꼴이 둘인 칸은 남는 토막으로 모은다 */
    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        val cells = allNodes.map { IsflexRowGrouping.Cell(it.text, it.rect.left, it.rect.top, it.rect.right, it.rect.bottom) }
        return IsflexRowGrouping.rows(cells).map { row ->
            row.extras.forEach { ScreenWords.add(cells[it].text, WordKind.EXTRA, row.members.joinToString(" ") { i -> cells[i].text }) }
            allNodes[row.fareIndex] to row.members.map { allNodes[it].text }
        }
    }

    /** 📐 겹친 틀을 따로 가르지 않는다(실물에서 다시 정렬되는 틀을 본 적 없음) */
    override val lastFrameDiscarded: Boolean = false

    override fun isDetailResidue(texts: List<String>): Boolean {
        val words = wordsOf(savedDict(), "detailOnlyWords", DETAIL_ONLY_WORDS)
        return texts.any { t -> words.any { t.contains(it) } }
    }

    override fun isListResidue(texts: List<String>): Boolean = texts.any { it.trim() in LIST_ONLY_WORDS }
}
