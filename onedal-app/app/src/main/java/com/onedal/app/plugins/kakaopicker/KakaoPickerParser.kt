package com.onedal.app.plugins.kakaopicker

import android.content.Context
import org.json.JSONObject
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🌐 카카오T픽커 리스트 파서 — **수집 전용** (기사님 확정 2026-08-30 · 픽커_수집.md).
 *
 * 목적은 하나다: 리스트에 뜬 모든 콜을 읽어 서버(intel)에 표본으로 쌓는다.
 * 잡지 않는다 · 알람도 아직 없다 · 판정하지 않는다 — 그래서 `shouldClick` 은 늘 false 다.
 *
 * ── 카드의 실물 구조 (덤프 08-28 · 08-30 실측) ──
 *
 *   태그줄   퀵 · 단거리 · 준비 29분 · 소형 · [도착 시]     ← y 가 같은 한 줄
 *   요금     6,400                                          ← 오른쪽 정렬, 줄 사이에 낌
 *   지역줄   14.9km · 분당 · 야탑1 · [도착 동]              ← 픽업거리 + 출발 시·동
 *
 * 🔴 요금 노드가 태그줄과 지역줄 **사이 높이**에 있어서, 인성·24시처럼 «요금 나오면
 *    직전까지를 카드로 자르는» 순차 분할을 쓰면 카드가 반 토막 난다.
 *    → 요금 노드를 닻으로 **위아래 ±60픽셀 띠**를 한 카드로 묶는다 (실측 줄 간격 ±35).
 */
// Context 는 알람 조건(프리퍼런스의 피기백 필터)을 읽을 때만 쓴다 — 유닛 테스트는 null (그때 decide 를 직접 부른다)
class KakaoPickerParser(private val context: Context?) : IScrapParser {

    companion object {
        /** 픽커 요금은 «2,529» 꼴 (원 표기 없음 · 쉼표 필수 — 실측 전 카드 일치) */
        private val FARE_REGEX = Regex("""^\d{1,3}(,\d{3})+$""")
        private val KM_REGEX = Regex("""^(\d+(?:\.\d+)?)km$""")
        private val TIME_REGEX = Regex("""^\d{1,2}:\d{2}$""")
        /** 태그줄에 오는 낱말들 — 지역 이름과 구분하는 근거 (덤프 전수에서 수집) */
        private val TAG_WORDS = setOf(
            "퀵", "도보", "한차", "급송", "단거리", "예약", "준비 완료",
            // 0830 실계정 첫 수집에서 발견 — 지역으로 오인됐던 태그들 (덤프 04_리스트_예약카드)
            "반나절",        // 반나절 배송 상품
            "승",            // 배송수단 표시 (승용차)
            "내일", "오늘",  // 예약 콜의 날짜 표식 (시각 노드와 별개)
            "서포트모드",    // 서포트 모드 관련 배지
            "착불",          // 결제 배지 — 실수집에서 도착동으로 오인됐다 («착불 분당»)
        )
        private val ITEM_SIZES = setOf("초소형", "소형", "중형", "대형", "특대형")
        /** 화면 붙박이 UI 낱말 — 카드 띠에 섞여 들어와 지역으로 오인되던 것들 (0830 실수집에서 발견) */
        private val NOISE_WORDS = setOf(
            "카드설정", "수요지도",                       // 하단 메뉴 (맨 아래 카드 띠에 걸침)
            "리스트 설정", "추천순", "높은 가격순", "낮은 가격순", "가까운순",  // 상단 헤더
            "수락",                                       // 오더카드(화면 위 제안 카드)의 초록 버튼 (0830 실물)
        )
        /** 카드 띠의 반높이 — 요금 중심에서 태그줄·지역줄까지 실측 ±35, 여유 포함 (알람 테두리도 같은 값 · #83) */
        const val CARD_BAND_PX = 60
        /** 요금은 화면 오른쪽에 정렬된다 — 왼쪽의 km·거리 숫자와 구분 */
        private const val FARE_MIN_CENTER_X = 600

        /** 요금 닻인가 — 글자꼴과 위치(오른쪽 정렬)를 함께 본다. 순수 함수(검사용 공개) */
        fun isFareAnchor(text: String, centerX: Int): Boolean =
            text.matches(FARE_REGEX) && centerX >= FARE_MIN_CENTER_X

        /** 같은 카드 띠인가 — 요금 중심에서 ±60픽셀 (실측 줄 간격 ±35 · 다음 카드 ±163) */
        fun inCardBand(fareCenterY: Int, nodeCenterY: Int): Boolean =
            kotlin.math.abs(fareCenterY - nodeCenterY) <= CARD_BAND_PX

        /**
         * 🧲 노드가 붙을 닻 인덱스 — **가장 가까운 닻 하나에만** 붙는다 (0830 실사고 · #86).
         * «±60 안이면 전부» 방식은 리스트 갱신 애니메이션으로 닻들이 눌리는 순간 한 노드를
         * **두 카드에 모두** 넣었다 — 위 카드 시 + 아래 카드 동이 합쳐진 «처인 대치2»가
         * 그렇게 태어나 지문·테두리까지 흔들었다. ±60 밖이면 -1 (어디에도 안 붙는다).
         */
        fun nearestAnchorIndex(anchorCentersY: List<Int>, nodeCenterY: Int): Int {
            var best = -1
            var bestDist = Int.MAX_VALUE
            anchorCentersY.forEachIndexed { i, c ->
                val d = kotlin.math.abs(c - nodeCenterY)
                if (d < bestDist) { bestDist = d; best = i }
            }
            return if (bestDist <= CARD_BAND_PX) best else -1
        }

        /**
         * 🔔 **픽커 알람 판정 — 축은 셋이다** (기사님 확정 2026-08-30 · 픽커_수집.md 3단계).
         *
         *   ① 요금 ≥ 픽커 알람 하한 (원천 DB user_settings.picker_alarm_min_fare · 기본 1만)
         *   ② 픽업거리 ≤ 상차 반경 (기존 국면 값 재사용 — 뜻이 같다)
         *   ③ 도착 구·동 ↔ 국면의 도착목표 (destinationKeywords·keywordTraps 재사용 —
         *      노선 국면이면 그 방향만, 도착목표가 비면 제한 없음. RegionMatch 는 인성과 같은 규약)
         *
         * 픽커엔 배송거리가 없어 단가식이 불가능하고(§2), 차종·경로 순서 축도 없다.
         * 픽업거리·도착지를 **모르면 막지 않는다** (규칙 ⑤ — 모르는 값으로 거르지 않는다).
         * 예약·내일 콜도 울린다 (기사님 확정 08-30 — 미리 확보할 가치가 있다).
         * 🔴 이 판정은 «알람을 울릴까»만 정한다 — 클릭은 supportsCatching 이 원천 차단한다.
         */
        /**
         * 🗺️ 픽커 줄임 표기 ↔ 도착목표 정규화 대조 (0830 실사고 — 성남행 전부 탈락).
         * 서버 키워드는 «정자동»·«수정구» 같은 전체 이름인데 픽커 화면은 «정자3»·«수정»으로
         * 줄인다 — 부분 문자열(RegionMatch)로는 영영 안 만난다. 양쪽에서 행정 접미(동·구)와
         * 꼬리 숫자를 벗겨 **토큰 단위로 똑같은지** 본다. 토큰 단위라 «남동구» 류의
         * 부분 문자열 오탐은 없고, 남는 오탐은 동명이동뿐 — 알람은 느슨한 쪽이 맞다 (규칙 ⑤).
         */
        fun normalizeRegion(s: String): String =
            s.removeSuffix("동").removeSuffix("구").trimEnd { it.isDigit() }

        private fun dongTokenMatch(dropoff: String, keys: List<String>): Boolean {
            val normKeys = keys.map(::normalizeRegion).filter { it.length >= 2 }.toSet()
            return dropoff.split(' ').map { normalizeRegion(it.trim()) }
                .any { it.length >= 2 && it in normKeys }
        }

        fun decide(
            order: SimplifiedOfficeOrder,
            minFare: Int,
            pickupRadiusKm: Int,
            destKeywords: List<String> = emptyList(),
            keywordTraps: Map<String, List<String>> = emptyMap(),
            cityAliases: List<String> = emptyList(),
            tally: FilterTally? = null,
        ): Boolean {
            val fareOk = order.fare >= minFare
            val pickupOk = order.pickupDistance == null || order.pickupDistance <= pickupRadiusKm
            val destOk = destKeywords.isEmpty() || order.dropoff.isBlank() ||
                com.onedal.app.plugins.RegionMatch.anyHit(order.dropoff, destKeywords, keywordTraps) ||
                dongTokenMatch(order.dropoff, destKeywords + cityAliases)
            val pass = fareOk && pickupOk && destOk
            tally?.let { t ->
                t.seen++
                when {
                    pass -> t.passed++
                    !fareOk -> t.fare++      // 첫 번째로 걸린 축에만 센다 (인성과 같은 규칙)
                    !pickupOk -> t.pickup++
                    else -> t.region++
                }
            }
            return pass
        }
    }

    /** 알람 조건 묶음 — 피기백 필터에서 읽는다. 기본값은 서버 미응답 시 안전망 */
    private data class AlarmConfig(
        val minFare: Int = 10000,
        val pickupRadiusKm: Int = 10,
        val destKeywords: List<String> = emptyList(),   // 비면 도착지 제한 없음 (관내·구서버)
        val keywordTraps: Map<String, List<String>> = emptyMap(),
        val cityAliases: List<String> = emptyList(),    // 시 별칭(customCityFilters) — «수정»처럼 구만 남는 카드용
    )

    /** 피기백 필터에서 알람 조건을 읽는다 — 못 읽으면 기본값 (서버 미응답 안전망) */
    private fun alarmConfig(): AlarmConfig {
        val prefs = context?.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            ?: return AlarmConfig()
        return try {
            val json = JSONObject(prefs.getString("activeFilter", null) ?: return AlarmConfig())
            val keywords = json.optJSONArray("destinationKeywords")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotEmpty() }
            } ?: emptyList()
            val traps = json.optJSONObject("keywordTraps")?.let { obj ->
                obj.keys().asSequence().associateWith { k ->
                    val arr = obj.optJSONArray(k)
                    if (arr == null) emptyList()
                    else (0 until arr.length()).map { arr.getString(it) }
                }
            } ?: emptyMap()
            val aliases = json.optJSONArray("customCityFilters")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }.filter { it.isNotEmpty() }
            } ?: emptyList()
            AlarmConfig(
                minFare = json.optInt("pickerAlarmMinFare", 10000),
                pickupRadiusKm = json.optInt("pickupRadiusKm", 10),
                destKeywords = keywords,
                keywordTraps = traps,
                cityAliases = aliases,
            )
        } catch (e: Exception) {
            AlarmConfig()
        }
    }

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        val sorted = allNodes.sortedWith(compareBy({ it.rect.top }, { it.rect.left }))
        val anchors = sorted.filter { isFareAnchor(it.text, (it.rect.left + it.rect.right) / 2) }
        if (anchors.isEmpty()) return emptyList()
        val anchorCenters = anchors.map { (it.rect.top + it.rect.bottom) / 2 }
        // 🧲 각 노드를 가장 가까운 닻 하나에만 배정 — 두 카드에 겹쳐 들어가는 것을 막는다 (#86)
        val cardTexts = List(anchors.size) { mutableListOf<String>() }
        for (node in sorted) {
            val i = nearestAnchorIndex(anchorCenters, (node.rect.top + node.rect.bottom) / 2)
            if (i >= 0) cardTexts[i].add(node.text)
        }
        return anchors.mapIndexed { i, fareNode -> Pair(fareNode, cardTexts[i] as List<String>) }
    }

    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        var fare = 0
        var pickupKm: Double? = null
        var itemSize: String? = null
        var scheduleTime: String? = null
        val tags = mutableListOf<String>()
        val locations = mutableListOf<String>()

        for (raw in texts) {
            val t = raw.trim()
            when {
                t.matches(FARE_REGEX) -> fare = t.replace(",", "").toIntOrNull() ?: 0
                KM_REGEX.matches(t) -> pickupKm = KM_REGEX.find(t)?.groupValues?.get(1)?.toDoubleOrNull()
                t in ITEM_SIZES -> itemSize = t
                t in TAG_WORDS -> tags.add(t)
                t.startsWith("준비 ") -> tags.add(t)                 // «준비 29분»
                TIME_REGEX.matches(t) -> { scheduleTime = t; tags.add(t) }   // «예약» 뒤의 «17:00»
                t in NOISE_WORDS -> { /* 화면 UI 낱말 — 콜 정보가 아니다, 버린다 */ }
                // «내일 착불» 처럼 태그 여럿이 한 노드로 붙어 오는 판 — 낱낱이 전부 태그면 태그다
                t.contains(' ') && t.split(' ').all { it in TAG_WORDS } -> tags.addAll(t.split(' '))
                t.endsWith("km") -> { /* «20km» 같은 헤더 반경 — 콜 정보가 아니다 */ }
                t.isNotEmpty() -> locations.add(t)
            }
        }

        /**
         * 지역 토큰의 순서는 좌표 정렬(top→left)에서 나온다 (실측 전 카드 동일):
         *   [도착 시(태그줄 끝), 출발 시, 출발 동, 도착 동]
         * 넷이 안 되면 아는 만큼만 채우고 원문(rawText)으로 남긴다 — 지어내지 않는다 (규칙 ④).
         */
        val pickup: String
        val dropoff: String
        when {
            locations.size >= 4 -> {
                pickup = "${locations[1]} ${locations[2]}"
                dropoff = "${locations[0]} ${locations.last()}"
            }
            locations.size == 2 -> { pickup = locations[0]; dropoff = locations[1] }
            else -> { pickup = locations.joinToString(" "); dropoff = "" }
        }

        return SimplifiedOfficeOrder(
            id = "",                          // 리스트에는 ID 가 없다 — 상세에만 오더번호가 있다 (0830 실측)
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = java.time.OffsetDateTime.now().toString(),
            scheduleText = scheduleTime,
            vehicleType = null,               // 픽커에 차종 축이 없다 — 물품 크기가 대신한다. 섞어 싣지 않는다
            itemSize = itemSize,
            tagsText = tags.joinToString(" ").ifEmpty { null },
            rawText = texts.joinToString(" "),
            pickupDistance = pickupKm,
            deliveryDistance = null,          // 리스트에 배송거리가 없다 (인성과의 결정적 차이)
        )
    }

    /**
     * 🔔 알람 판정 위임 — 조건은 피기백 필터(원천 DB)에서 읽는다.
     * true 여도 **클릭은 일어나지 않는다** (supportsCatching=false 가 입구 6곳에서 차단) —
     * 알람 모드에서 소리·진동·테두리만 울린다. 지문 기억 덕에 콜당 한 번이다 (#79 배선).
     */
    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean {
        val c = alarmConfig()
        val pass = decide(order, c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases, tally)
        // 👁️ 축별 판정을 한 줄 남긴다 — «왜 안 울었나»를 로그로 답하기 위해 (첫 실검증 때 수집 데이터로 역추적했다)
        com.onedal.app.core.AppLogger.d("1DAL_PICKER",
            "🔔 [알람 판정] ${order.fare}원·픽업 ${order.pickupDistance ?: "?"}km·도착 ${order.dropoff.ifEmpty { "?" }} — " +
            "하한 ${c.minFare}·반경 ${c.pickupRadiusKm}km·도착목표 ${c.destKeywords.size}개 → ${if (pass) "통과" else "탈락"}")
        return pass
    }

    /** 알람 테두리는 요금 닻이 아니라 **카드 띠 전체**를 두른다 — 묶기(inCardBand)와 같은 값 (#83) */
    override fun alarmBandHalfPx(): Int = CARD_BAND_PX

    override fun parsePickupDistance(rawText: String): Double? =
        Regex("""(\d+(?:\.\d+)?)km""").find(rawText)?.groupValues?.get(1)?.toDoubleOrNull()
}
