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
        )
        private val ITEM_SIZES = setOf("초소형", "소형", "중형", "대형", "특대형")
        /** 화면 붙박이 UI 낱말 — 카드 띠에 섞여 들어와 지역으로 오인되던 것들 (0830 실수집에서 발견) */
        private val NOISE_WORDS = setOf(
            "카드설정", "수요지도",                       // 하단 메뉴 (맨 아래 카드 띠에 걸침)
            "리스트 설정", "추천순", "높은 가격순", "낮은 가격순", "가까운순",  // 상단 헤더
        )
        /** 카드 띠의 반높이 — 요금 중심에서 태그줄·지역줄까지 실측 ±35, 여유 포함 */
        private const val CARD_BAND_PX = 60
        /** 요금은 화면 오른쪽에 정렬된다 — 왼쪽의 km·거리 숫자와 구분 */
        private const val FARE_MIN_CENTER_X = 600

        /** 요금 닻인가 — 글자꼴과 위치(오른쪽 정렬)를 함께 본다. 순수 함수(검사용 공개) */
        fun isFareAnchor(text: String, centerX: Int): Boolean =
            text.matches(FARE_REGEX) && centerX >= FARE_MIN_CENTER_X

        /** 같은 카드 띠인가 — 요금 중심에서 ±60픽셀 (실측 줄 간격 ±35 · 다음 카드 ±163) */
        fun inCardBand(fareCenterY: Int, nodeCenterY: Int): Boolean =
            kotlin.math.abs(fareCenterY - nodeCenterY) <= CARD_BAND_PX

        /**
         * 🔔 **픽커 알람 판정 — 축은 둘뿐이다** (기사님 확정 2026-08-30 · 픽커_수집.md 3단계).
         *
         *   ① 요금 ≥ 픽커 알람 하한 (원천 DB user_settings.picker_alarm_min_fare · 기본 1만)
         *   ② 픽업거리 ≤ 상차 반경 (기존 국면 값 재사용 — 뜻이 같다)
         *
         * 픽커엔 배송거리가 없어 단가식이 불가능하고(§2), 차종·도착지·경로 축도 없다.
         * 픽업거리를 모르면 **막지 않는다** (규칙 ⑤ — 모르는 값으로 거르지 않는다).
         * 🔴 이 판정은 «알람을 울릴까»만 정한다 — 클릭은 supportsCatching 이 원천 차단한다.
         */
        fun decide(order: SimplifiedOfficeOrder, minFare: Int, pickupRadiusKm: Int, tally: FilterTally? = null): Boolean {
            val fareOk = order.fare >= minFare
            val pickupOk = order.pickupDistance == null || order.pickupDistance <= pickupRadiusKm
            val pass = fareOk && pickupOk
            tally?.let { t ->
                t.seen++
                when {
                    pass -> t.passed++
                    !fareOk -> t.fare++      // 첫 번째로 걸린 축에만 센다 (인성과 같은 규칙)
                    else -> t.pickup++
                }
            }
            return pass
        }
    }

    /** 피기백 필터에서 알람 조건 두 값을 읽는다 — 못 읽으면 기본값 (서버 미응답 안전망) */
    private fun alarmConfig(): Pair<Int, Int> {
        val prefs = context?.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            ?: return Pair(10000, 10)
        return try {
            val json = JSONObject(prefs.getString("activeFilter", null) ?: return Pair(10000, 10))
            Pair(json.optInt("pickerAlarmMinFare", 10000), json.optInt("pickupRadiusKm", 10))
        } catch (e: Exception) {
            Pair(10000, 10)
        }
    }

    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        val sorted = allNodes.sortedWith(compareBy({ it.rect.top }, { it.rect.left }))
        val groups = mutableListOf<Pair<ScreenTextNode, List<String>>>()
        for (fareNode in sorted) {
            if (!isFareAnchor(fareNode.text, (fareNode.rect.left + fareNode.rect.right) / 2)) continue
            val fareY = (fareNode.rect.top + fareNode.rect.bottom) / 2
            val cardTexts = sorted.filter {
                inCardBand(fareY, (it.rect.top + it.rect.bottom) / 2)
            }.map { it.text }
            groups.add(Pair(fareNode, cardTexts))
        }
        return groups
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
        val (minFare, pickupRadiusKm) = alarmConfig()
        return decide(order, minFare, pickupRadiusKm, tally)
    }

    override fun parsePickupDistance(rawText: String): Double? =
        Regex("""(\d+(?:\.\d+)?)km""").find(rawText)?.groupValues?.get(1)?.toDoubleOrNull()
}
