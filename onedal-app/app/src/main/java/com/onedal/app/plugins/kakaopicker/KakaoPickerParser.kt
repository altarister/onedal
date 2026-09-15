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
        /** 1km 미만 픽업거리는 «581m» 로 온다 (0831 실측) — km 만 알면 거리가 도착지로 샌다 */
        private val M_REGEX = Regex("""^(\d+)m$""")
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
        /**
         * 🔴 **알람 상태에서** 이 카드를 자동 클릭해도 되는가 — 오더카드와 상세 잔상은 금지 (0830 실물).
         * 오더카드(제안 카드)는 요금 숫자가 **수락 버튼 안에** 있어서, 요금 닻을 탭하는
         * 자동 진입이 그대로 **계약 클릭**이 된다. 상세 화면 잔상을 리스트로 오인한 유령
         * 카드(«수락하기» 포함)도 같다. «수락»이 띠 안에 보이면 알람은 울리되 **손은 대지 않는다**.
         * ⚠️ 범위는 알람 경로다 (기사님 교정 0830) — 훗날 픽커 잡기 판(자동 선점)에서는
         *    수락 클릭이 곧 목적이므로, 이 검사를 그 경로에 끌어다 쓰지 말 것.
         */
        fun clickSafe(rawText: String?): Boolean = rawText?.contains("수락") != true

        /** 리스트 머리줄의 낱말 — 오더카드(위)와 리스트 카드(아래)를 가르는 경계 (NOISE_WORDS 에도 있다) */
        private const val LIST_HEADER_WORD = "리스트 설정"

        /**
         * 📏 「리스트 설정」 머리줄의 중심 Y — 없으면 **null** (0 이 아니다 · 규칙 ④).
         * 입력은 `(글자, 중심Y)` 짝이다 — 순수 함수라 JVM 검사에서 그대로 돈다.
         */
        fun listHeaderCenterY(nodes: List<Pair<String, Int>>): Int? =
            nodes.firstOrNull { it.first.contains(LIST_HEADER_WORD) }?.second

        /**
         * 🔴 **이 요금 닻을 눌러도 되는가** (2026-09-13 · 라이브 오배차 조사에서 신설).
         *
         * 09-13 새벽, 기사님이 주무시는 사이 앱이 픽커 카드를 눌러 두 건이 배차됐다.
         * 앱은 낱말을 안 보고 **«쉼표 든 숫자 + 화면 오른쪽»** 만 보고 그 **정중앙**을 찍는다
         * (`isFareAnchor` → `performSimulatedTouch`). 그런데 **오더카드**(리스트 맨 위
         * 제안 띠)는 **요금 숫자가 「수락」 버튼 안에 있어서**, 그 요금을 찍으면 상세로
         * 가는 게 아니라 **그 자리에서 계약이 성립한다.**
         *
         * 종전 방어는 `clickSafe` 하나였고 그것은 요금 중심 **±60픽셀**(`CARD_BAND_PX`)
         * 안의 글자만 본다. 실물에서 「수락」은 요금 **약 70픽셀 아래**라 **띠 밖이고
         * 그대로 통과한다** — 계약이 문자열 한 개에 걸려 있었다.
         *
         * 🟢 그래서 **구조로 가른다.** 「리스트 설정」 머리줄 **위면 오더카드, 아래면 리스트
         *    카드**다. 실물 덤프 8장에서 요금 닻은 전부 머리줄보다 **166픽셀 아래**였고
         *    (`log/카카오픽커/화면덤프` 8장), 오더카드 요금은 머리줄 **위**였다
         *    (`ex_images/카카오픽커/실물_2026/04_오더카드_리스트상단띠_픽업배송km.jpeg`).
         *
         * ⚠️ **머리줄을 못 찾으면 false** — 리스트인지 아닌지 모르는 판이다. 규칙 ④
         *    (*"빈 필터는 «제한 없음»이 아니라 «고장»이다"*)를 그대로 따른다.
         * ⚠️ 같은 높이도 false — 경계는 닫아 둔다. 계약 쪽으로 기울지 않는다.
         */
        fun isListCardAnchor(fareCenterY: Int, listHeaderCenterY: Int?): Boolean =
            listHeaderCenterY != null && fareCenterY > listHeaderCenterY

        /**
         * 👻 이 리스트 스캔이 **상세 화면 잔상**인가 (0830 23:04 실측 — 복귀 직후 첫 스캔에
         * 상세 글자가 남아 카드 도착지에 «픽업지 경기 성남시…»가 섞였다).
         * 판별자는 «수락하기» — 상세에만 있는 버튼이다 (리스트·오더카드의 버튼은 «수락»,
         * 노드 단위 completeness 로 구분). 잔상이면 그 판은 통째로 버린다 — 인성 팝업
         * 잔상 방어(isPopupResidue)와 같은 계열이다.
         */
        fun isDetailResidue(texts: List<String>): Boolean = texts.any { it.contains("수락하기") }

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

        /** 👀 상세 화면 ↔ 리스트 카드 대조 결과 — 못 고르면 `card = null` 과 그 까닭 (#119) */
        data class ListCardMatch(val card: SimplifiedOfficeOrder?, val why: String)

        private val DETAIL_FARE_REGEX = Regex("""최종 수익\s*([\d,]+)""")
        /** 상세의 «픽업 7.2km» — 이 앞은 픽업지 칸, 뒤는 배송지 칸이다 */
        private val DETAIL_PICKUP_KM_REGEX = Regex("""픽업\s*[\d.]+\s*k?m""")

        /** 지역 한 토막의 대조 열쇠 — «광주시»→«광주» · «중원구»→«중원» · «금광2동»→«금광» (리스트 줄임 표기와 만나게) */
        private fun regionKey(s: String): String = normalizeRegion(s.trim().removeSuffix("시").removeSuffix("군"))

        private fun regionKeys(text: String): Set<String> =
            text.split(Regex("""\s+""")).map(::regionKey).filter { it.isNotEmpty() }.toSet()

        private fun cardKeys(region: String): List<String> =
            region.split(' ').map(::regionKey).filter { it.isNotEmpty() }

        /**
         * 👀 **이 상세가 리스트의 어느 카드인가 — 누가 열었든 여기 한 곳** (2026-09-14 폰 시험 · 버그 대장 #119).
         *
         * 예전엔 알람이 누를 때만 카드를 쥐여 줘서, 기사님이 **손으로 연 상세**는 «리스트 원본이 없다»로
         * 서버에 아무것도 안 갔다 (클래스 «판단이 한쪽 경로에만 있다» — #75 · #77 과 같은 뿌리).
         *
         * 고르는 법 — **최종 수익이 같고, 카드의 픽업 구·동이 상세 픽업지 칸에 다 있는** 카드.
         *   · 🔴 요금만으로는 안 된다 — 7지점 문제지에 1만 원 카드가 넷이다
         *   · 🔴 실물 픽커는 배송지를 원달앱이 읽는 글자에 안 올린다 (09-13 `83af36b`) — 그래서 픽업지가 먼저다
         *   · 여럿이면 배송지로 한 번 더 가르고(시뮬레이터 상세에는 있다), 그래도 못 가르면 **고르지 않는다** (규칙 ④)
         */
        fun matchListCard(detailTexts: List<String>, recent: List<SimplifiedOfficeOrder>): ListCardMatch {
            val joined = detailTexts.joinToString(" ")
            /**
             * 🔴 **실물 픽커 상세는 «최종 수익»을 읽는 글자에 안 올린다** (09-16 04:49 라이브) — 요금은 리스트 카드에 있다.
             *    요금이 없으면 픽업지(+물품 크기)로 찾고 요금은 카드 것을 쓴다. 못 찾은 콜은 보내지 않는다 (기사님: «못 찾은 콜은 내 콜이 아닌 거지»).
             */
            val fare = DETAIL_FARE_REGEX.find(joined)?.groupValues?.get(1)?.replace(",", "")?.toIntOrNull()
            val size = DETAIL_SIZE_REGEX.find(joined)?.groupValues?.get(1)
            val how = if (fare != null) "요금 ${fare}원 · 픽업지" else "요금 없이 픽업지${if (size != null) " · 크기 $size" else ""}"
            val marker = DETAIL_PICKUP_KM_REGEX.find(joined)
            val pickupPart = regionKeys(if (marker != null) joined.substring(0, marker.range.first) else joined)
            val dropoffPart = regionKeys(if (marker != null) joined.substring(marker.range.last + 1) else "")
            val byPickup = recent
                .filter { fare == null || it.fare == fare }
                .filter { c -> cardKeys(c.pickup).let { k -> k.isNotEmpty() && k.all { it in pickupPart } } }
                // 요금이 없을 때만 크기로 거른다 — 크기를 모르는 카드는 빼지 않는다 (규칙 ⑤-2 · 모르는 값으로 거르지 않는다)
                .filter { c -> fare != null || size == null || c.itemSize == null || c.itemSize == size }
                .distinctBy { Triple(it.pickup, it.dropoff, it.fare) }
            val picked = if (byPickup.size <= 1) byPickup
                else byPickup.filter { c -> cardKeys(c.dropoff).let { k -> k.isNotEmpty() && k.all { it in dropoffPart } } }
            return when {
                picked.size == 1 -> ListCardMatch(picked[0], "$how 이 맞는 카드 하나")
                byPickup.isEmpty() -> ListCardMatch(null, "리스트 카드 중 $how 이 맞는 것이 없다")
                picked.isEmpty() -> ListCardMatch(null, "$how 이 맞는 카드 ${byPickup.size}장 — 배송지로도 못 가른다")
                else -> ListCardMatch(null, "$how · 배송지가 맞는 카드 ${picked.size}장 — 어느 것인지 모른다")
            }
        }

        /** 상세의 «물품 정보 소형 …» — 🔴 «초소형»을 «소형»보다 먼저 본다 */
        private val DETAIL_SIZE_REGEX = Regex("""물품\s*정보\s*(초소형|소형|중형|대형|특대형)""")

        /**
         * 🔔 **축별 판정 결과** (2026-09-14 · 카카오픽커_시뮬레이터.md 3단계 3-2).
         * 시뮬레이터 채점기(`onedal-sim/scripts/pickerAlarmGrade.mjs`)가 판정 순간의 필터로 정답을 다시 계산해 맞춰 본다 —
         * 어긋나면 «요금·상차·도착 중 어디서» 갈렸는지가 고칠 곳(앱 판정 vs 서버 필터)을 가른다.
         */
        data class AlarmAxes(val fare: Boolean, val pickup: Boolean, val destination: Boolean) {
            val pass: Boolean get() = fare && pickup && destination
        }

        /** 🔴 계산은 여기 한 벌이다 — `decide` 는 이것의 `pass` 를 돌려준다 (채점기의 사본은 «일부러 두 벌» · 그 파일 머리 주석) */
        fun decideAxes(
            order: SimplifiedOfficeOrder,
            minFare: Int,
            pickupRadiusKm: Double,
            destKeywords: List<String> = emptyList(),
            keywordTraps: Map<String, List<String>> = emptyMap(),
            cityAliases: List<String> = emptyList(),
        ): AlarmAxes {
            val fareOk = order.fare >= minFare
            val pickupOk = order.pickupDistance == null || order.pickupDistance <= pickupRadiusKm
            val destOk = destKeywords.isEmpty() || order.dropoff.isBlank() ||
                com.onedal.app.plugins.RegionMatch.anyHit(order.dropoff, destKeywords, keywordTraps) ||
                dongTokenMatch(order.dropoff, destKeywords + cityAliases)
            return AlarmAxes(fareOk, pickupOk, destOk)
        }

        fun decide(
            order: SimplifiedOfficeOrder,
            minFare: Int,
            pickupRadiusKm: Double,
            destKeywords: List<String> = emptyList(),
            keywordTraps: Map<String, List<String>> = emptyMap(),
            cityAliases: List<String> = emptyList(),
            tally: FilterTally? = null,
        ): Boolean {
            val a = decideAxes(order, minFare, pickupRadiusKm, destKeywords, keywordTraps, cityAliases)
            tally?.let { t ->
                t.seen++
                when {
                    a.pass -> t.passed++
                    !a.fare -> t.fare++      // 첫 번째로 걸린 축에만 센다 (인성과 같은 규칙)
                    !a.pickup -> t.pickup++
                    else -> t.region++
                }
            }
            return a.pass
        }

        /**
         * 🧾 **알람 필터 한 줄** — 채점기가 «그 순간 폰이 가진 필터»로 읽는 JSON (2026-09-14 · 3단계 3-2).
         * 서버 필터는 콜을 잡고 위치가 움직일 때마다 바뀌므로, 판정 줄과 같은 로그 파일에 **바뀔 때마다** 남긴다.
         * ⚠️ `org.json` 은 JVM 검사에서 비어 있어 Gson 으로 만든다.
         */
        fun alarmFilterJson(
            minFare: Int,
            pickupRadiusKm: Double,
            destKeywords: List<String>,
            keywordTraps: Map<String, List<String>>,
            cityAliases: List<String>,
        ): String = com.google.gson.Gson().toJson(linkedMapOf(
            "minFare" to minFare,
            "pickupRadiusKm" to pickupRadiusKm,
            "destKeywords" to destKeywords,
            "keywordTraps" to keywordTraps,
            "cityAliases" to cityAliases,
        ))

        /** 마지막으로 남긴 알람 필터 — 같으면 다시 안 적는다 (판정은 스캔마다 돈다 · 로그가 그 줄로 덮이지 않게) */
        @Volatile private var lastAlarmFilterJson: String? = null
    }

    /** 알람 조건 묶음 — 피기백 필터에서 읽는다. 기본값은 서버 미응답 시 안전망 */
    private data class AlarmConfig(
        val minFare: Int = 10000,
        val pickupRadiusKm: Double = 10.0,   // 🔴 소수로 받는다 — 자동 반경이면 서버가 4.55 처럼 보낸다
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
                pickupRadiusKm = json.optDouble("pickupRadiusKm", 10.0),
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
                M_REGEX.matches(t) -> pickupKm = M_REGEX.find(t)?.groupValues?.get(1)?.toDoubleOrNull()?.div(1000)
                t in ITEM_SIZES -> itemSize = t
                t in TAG_WORDS -> tags.add(t)
                t.startsWith("준비 ") -> tags.add(t)                 // «준비 29분»
                TIME_REGEX.matches(t) -> { scheduleTime = t; tags.add(t) }   // «예약» 뒤의 «17:00»
                t in NOISE_WORDS -> { /* 화면 UI 낱말 — 콜 정보가 아니다, 버린다 */ }
                // 🚫 배정 완료 토스트가 카드 띠에 섞였다 — 지역이 아니다 (09-02 실주행 가짜 콜 3건 · `AssignedToastTest`)
                t.contains(KakaoPickerKeywords.ASSIGNED_TOAST_WORD) -> { }
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
     * true 면 소리·진동·테두리 + **상세까지 이동** (기사님 확정 0830 — 요금 최고 콜 하나,
     * 30초 무응답 시 자동 복귀). **수락(계약) 클릭은 없다** — 상세 화면의 잡기 수순은
     * supportsCatching=false 가 입구에서 차단한다. 지문 기억 덕에 콜당 한 번이다 (#79 배선).
     */
    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean {
        val c = alarmConfig()
        // 🧾 판정에 쓴 필터가 바뀌었으면 먼저 한 줄 — 채점기가 이 판정의 정답을 이 필터로 다시 계산한다 (3단계 3-2)
        val filterJson = alarmFilterJson(c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases)
        if (filterJson != lastAlarmFilterJson) {
            lastAlarmFilterJson = filterJson
            com.onedal.app.core.AppLogger.i("1DAL_PICKER", "🧾 [알람 필터] $filterJson")
        }
        val pass = decide(order, c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases, tally)
        val a = decideAxes(order, c.minFare, c.pickupRadiusKm, c.destKeywords, c.keywordTraps, c.cityAliases)
        val mark = { ok: Boolean -> if (ok) "✅" else "❌" }
        // 👁️ 축별 판정을 한 줄 남긴다 — «왜 안 울었나»를 로그로 답하기 위해 (첫 실검증 때 수집 데이터로 역추적했다)
        //    🔴 채점기(`pickerAlarmGrade.mjs`)가 이 줄의 모양을 읽는다 — 바꾸면 그 정규식도 같이 바꾼다
        com.onedal.app.core.AppLogger.d("1DAL_PICKER",
            "🔔 [알람 판정] ${order.fare}원·픽업 ${order.pickupDistance ?: "?"}km·도착 ${order.dropoff.ifEmpty { "?" }} — " +
            "하한 ${c.minFare}·반경 ${c.pickupRadiusKm}km·도착목표 ${c.destKeywords.size}개 → ${if (pass) "통과" else "탈락"}" +
            " · 축 요금${mark(a.fare)} 상차${mark(a.pickup)} 도착${mark(a.destination)}")
        return pass
    }

    /** 알람 테두리는 요금 닻이 아니라 **카드 띠 전체**를 두른다 — 묶기(inCardBand)와 같은 값 (#83) */
    override fun alarmBandHalfPx(): Int = CARD_BAND_PX

    override fun parsePickupDistance(rawText: String): Double? =
        Regex("""(\d+(?:\.\d+)?)km""").find(rawText)?.groupValues?.get(1)?.toDoubleOrNull()

    /**
     * 🗳️ **판정을 안 싣는다 — 픽커는 수집 전용이라 잡기 판정이 없다** (2026-09-12).
     *    🔴 **«안 함»도 제 손으로 적는다** — 인터페이스에 기본값을 두었더니 위임 누락을
     *       컴파일러가 못 잡아 `verdict` 가 내리 `null` 이었다 (#84 와 같은 병).
     *    실으려면 `InsungParser.withVerdict` 처럼 **판정 함수가 고른 축**을 그대로 넣는다 —
     *    성적표와 같은 분기를 써야 «성적표는 요금, 화면은 지역»으로 갈라지지 않는다.
     */
    override fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally?): SimplifiedOfficeOrder = order
}
