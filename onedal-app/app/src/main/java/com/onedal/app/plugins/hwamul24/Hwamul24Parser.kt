package com.onedal.app.plugins.hwamul24

import android.content.Context
import com.onedal.app.core.AppLogger
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * 화물24시(전국24시콜화물) 전용 파서
 *
 * 화물24시 앱의 카드형 리스트 화면에서 추출된 텍스트 노드를 파싱하여
 * 구조화된 SimplifiedOfficeOrder 객체로 변환합니다.
 *
 * 핵심 장점: 인성콜과 달리 리스트 화면에서 적요(상세 내용)가 바로 노출되므로,
 * 팝업 서핑 없이 1차 필터 단계에서 수작업/블랙리스트 등을 100% 걸러낼 수 있습니다.
 *
 * 카드 구조 (스크린샷 분석 결과):
 *   [출발지 지역명]           > [도착지 지역명]
 *   [당상] [지]12Km            06:31 [지] [당착]
 *   2.5톤/윙  당착/쿠팡반품건(부천1센터)/4파렛상하차
 *   [독차] 인수증                     70,000원
 */
class Hwamul24Parser(private val context: Context) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER_24H"
    }

    private val prefs by lazy {
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
    }

    // ── 필터 로드 (InsungParser와 동일한 공통 로직) ──

    private fun parseJsonArray(json: JSONObject, key: String): List<String> {
        return try {
            val arr = json.optJSONArray(key)
            if (arr != null) (0 until arr.length()).map { arr.getString(it) } else emptyList()
        } catch (e: Exception) { emptyList() }
    }

    fun loadCurrentFilter(): FilterConfig {
        return try {
            val jsonStr = prefs.getString("activeFilter", null) ?: return FilterConfig()
            val json = JSONObject(jsonStr)

            FilterConfig(
                allowedVehicleTypes = parseJsonArray(json, "allowedVehicleTypes"),
                isActive = json.optBoolean("isActive", false),   // 키가 없으면 멈춘다 (안전 방향)
                isSharedMode = json.optBoolean("isSharedMode", false),
                pickupRadiusKm = json.optInt("pickupRadiusKm", 10),
                minFare = json.optInt("minFare", 30000),         // 서버 기본값과 동일
                maxFare = json.optInt("maxFare", 1000000),
                destinationCity = json.optString("destinationCity", ""),
                destinationRadiusKm = json.optInt("destinationRadiusKm", 10),
                excludedKeywords = parseJsonArray(json, "excludedKeywords"),
                destinationKeywords = parseJsonArray(json, "destinationKeywords"),
                customCityFilters = parseJsonArray(json, "customCityFilters")
            )
        } catch (e: Exception) {
            AppLogger.e(TAG, "❌ 필터 JSON 파싱 실패: ${e.message}")
            FilterConfig()
        }
    }

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
    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")

        // ── 1. 요금(Fare) 파싱: "70,000원" 또는 "300,000원" 패턴 ──
        var fare = 0
        val fareRegex = Regex("""(\d{1,3}(?:,\d{3})*)원""")
        for (text in texts) {
            val match = fareRegex.find(text.trim())
            if (match != null) {
                val fareStr = match.groupValues[1].replace(",", "")
                val parsedFare = fareStr.toIntOrNull() ?: 0
                if (parsedFare > fare) fare = parsedFare // 가장 큰 값을 운송료로 채택
            }
        }

        // ── 2. 차종(VehicleType) 파싱: "2.5톤/윙", "3.5톤/전체", "1톤/카/윙" 등 ──
        var vehicleType: String? = null
        val vehicleRegex = Regex("""(\d+\.?\d*톤)(?:/([가-힣/]+))?""")
        for (text in texts) {
            val match = vehicleRegex.find(text.trim())
            if (match != null) {
                vehicleType = match.groupValues[0] // 전체 매칭 문자열 (예: "2.5톤/윙")
                break
            }
        }

        // ── 3. 지역명 파싱 (LocationTextAnalyzer 활용) ──
        // 화물24시 노이즈 단어 (뱃지, 숫자, UI 요소)
        val noiseWords = setOf(
            "당상", "당착", "내착", "수", "지", "독차", "왕복",
            "인수증", "선/착불", "전체", "화물정보", "자동새로고침",
            "오더검색", "자동터치", "성공", "최대", "ON", "OFF",
            "홈", "화물정보", "마이페이지", "환경"
        )

        val locationInfos = texts
            .map { it.trim() }
            .filter { text ->
                !noiseWords.contains(text) &&
                text.length >= 2 &&
                !text.matches(Regex("""^\d+.*""")) && // 숫자로 시작하는 것 제외 (거리, 시간 등)
                !text.contains("원") && // 요금 제외
                !text.contains("톤") && // 차종 제외
                text != ">" // 화살표 구분자 제외
            }
            .mapNotNull { LocationTextAnalyzer.analyze(it) }
            .distinctBy { it.cleanRegion }

        val pickupInfo = locationInfos.getOrNull(0)
        val dropoffInfo = locationInfos.getOrNull(1) ?: pickupInfo

        val pickup = pickupInfo?.cleanRegion ?: "미상"
        val dropoff = dropoffInfo?.cleanRegion ?: "미상"
        val scheduleText = pickupInfo?.scheduleText ?: dropoffInfo?.scheduleText

        // ── 4. 거리(pickupDistance) 파싱: "11Km", "15Km" 등 ──
        var pickupDistance: Double? = null
        val distRegex = Regex("""(\d+)Km""", RegexOption.IGNORE_CASE)
        for (text in texts) {
            val match = distRegex.find(text.trim())
            if (match != null) {
                pickupDistance = match.groupValues[1].toDoubleOrNull()
                break
            }
        }

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
            // 적요 후보: 10자 이상, 한글 포함, 요금/차종/순수 뱃지 아님
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

        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())

        val isValidOrder = fare > 0 || pickup != "미상" || dropoff != "미상"
        if (isValidOrder) {
            AppLogger.d(TAG, "📦 [24시 파싱] 상차=$pickup, 하차=$dropoff, 요금=$fare, " +
                    "차종=$vehicleType, 거리=${pickupDistance}km, 적요=${detailMemo?.take(30)}")
        }

        return SimplifiedOfficeOrder(
            id = "24H-" + UUID.randomUUID().toString().substring(0, 8),
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = now,
            postTime = postTime,
            scheduleText = scheduleText,
            vehicleType = vehicleType,
            rawText = rawJoined,
            pickupDistance = pickupDistance
        )
    }

    // ════════════════════════════════════════════════════════════════
    //  shouldClick(): 4대 필터 조건 판정 (공통 로직)
    // ════════════════════════════════════════════════════════════════

    /**
     * 파싱된 오더가 4대 필터 조건을 모두 만족하는지 종합 판정합니다.
     *
     * 화물24시에서는 리스트 단계에서 적요까지 파싱 가능하므로,
     * 블랙리스트(수작업 등) 필터도 1차에서 완벽히 걸러냅니다.
     */
    override fun shouldClick(order: SimplifiedOfficeOrder): Boolean {
        val filter = loadCurrentFilter()

        // ── 조건 0: 전체 필터 활성화 여부 ──
        if (!filter.isActive) {
            return false
        }

        val rawText = order.rawText ?: ""

        // ── 조건 1: 차종 매칭 (빈 배열이면 전체 허용) ──
        val vehicleMatch = if (filter.allowedVehicleTypes.isEmpty()) {
            true
        } else {
            order.vehicleType != null && filter.allowedVehicleTypes.any { allowed ->
                val normAllowed = allowed.lowercase(Locale.getDefault())
                val normParsed = order.vehicleType.lowercase(Locale.getDefault())
                // 화물24시는 "2.5톤/윙" 형태이므로 톤수 포함 검사
                normParsed.contains(normAllowed) || normAllowed.contains(normParsed) ||
                // 크로스 매칭: 서버 "1t" ↔ 파싱 "1톤"
                (normAllowed == "1t" && normParsed.contains("1톤")) ||
                (normAllowed == "2.5t" && normParsed.contains("2.5톤")) ||
                (normAllowed == "3.5t" && normParsed.contains("3.5톤")) ||
                (normAllowed == "5t" && normParsed.contains("5톤"))
            }
        }

        // ── 조건 2: 도착지 매칭 ──
        //
        // 🔴 2026-08-12 — 예전에는 키워드가 비면 `true`(전부 통과)였다.
        //    도착지 조건이 없는 상태는 "아무 데나 좋다"가 아니라
        //    **"필터가 아직 안 만들어졌다"** 는 뜻이다. 서버가 회랑을 못 구했거나
        //    목적지 도시가 비었을 때 그렇게 된다.
        //
        //    그대로 통과시키면 `isActive` 는 켜진 채 **도착지 제한만 사라진다.**
        //    필터가 느슨해지는 게 아니라 없어지는 것이다.
        //    서버도 같은 방향으로 열려 있어서 두 겹이 동시에 무력화됐다.
        //    (서버: `filterHuntBlocker` · `OrderEvaluator` 5번 항목)
        val regionMatch = if (filter.destinationKeywords.isEmpty()) {
            AppLogger.d(TAG, "🚦 [사냥 보류] 도착지 키워드가 비어 있습니다 — 서버가 필터를 아직 못 만들었습니다")
            false
        } else {
            filter.destinationKeywords.any { region ->
                order.dropoff.contains(region, ignoreCase = true)
            }
        }

        // ── 조건 3: 요금 하한선 ──
        // ── 조건 2: 요금 하한선 + 상한선 ──
        //
        // 🔴 2026-08-12 — 상한(maxFare)을 **서버만** 보고 있었다.
        //    앱은 파싱만 하고 판정에 안 써서, 상한을 50만으로 잡아도 100만짜리를 잡았다.
        //    서버가 데스밸리에서 "똥콜"이라 걸러내지만 그때는 **이미 패널티 구간**이다.
        //    안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다.
        //
        // 규칙은 서버(OrderEvaluator)와 **똑같이** 맞춘다:
        //   0 < maxFare < 1,000,000 일 때만 적용한다. 100만은 "상한 없음"의 뜻이다.
        val hasFareCeiling = filter.maxFare in 1..999_999
        val fareMatch = order.fare >= filter.minFare &&
                        (!hasFareCeiling || order.fare <= filter.maxFare)

        // ── 조건 4: 상차지 거리 (합짐 모드이면 무시) ──
        val distanceMatch = if (order.pickupDistance == null) {
            true
        } else if (filter.isSharedMode) {
            true
        } else {
            order.pickupDistance <= filter.pickupRadiusKm
        }

        // ── 조건 5: 블랙리스트 제외 (화물24시 핵심: 적요가 rawText에 포함!) ──
        val blacklistClear = if (filter.excludedKeywords.isEmpty()) {
            true
        } else {
            filter.excludedKeywords.none { banned ->
                rawText.contains(banned, ignoreCase = true)
            }
        }

        // ── 로그 출력 ──
        val isValidOrder = order.fare > 0 || order.pickup != "미상" || order.dropoff != "미상"
        if (isValidOrder) {
            AppLogger.roadmap("🔍 [24시 필터] 차종(${order.vehicleType ?: "미상"})=${if(vehicleMatch) "✅" else "❌"} " +
                    "도착지(${order.dropoff})=${if(regionMatch) "✅" else "❌"} " +
                    "요금(${filter.minFare} <= ${order.fare}${if (hasFareCeiling) " <= ${filter.maxFare}" else ""})=${if(fareMatch) "✅" else "❌"} " +
                    "거리(${if(filter.isSharedMode) "합짐무시" else "${filter.pickupRadiusKm}km"} >= ${order.pickupDistance ?: "미상"})=${if(distanceMatch) "✅" else "❌"} " +
                    "블랙=${if(blacklistClear) "✅" else "❌"}", "LIST")
        }

        return vehicleMatch && regionMatch && fareMatch && distanceMatch && blacklistClear
    }

    // ════════════════════════════════════════════════════════════════
    //  parsePickupDistance(): 화물24시 거리 패턴 파싱
    // ════════════════════════════════════════════════════════════════

    /**
     * rawText에서 상차지 직선거리를 파싱합니다.
     * 화물24시 거리 표시 패턴: "11Km", "15Km", "20Km" (정수 + Km)
     */
    override fun parsePickupDistance(rawText: String): Double? {
        // 패턴1: "숫자Km" 또는 "숫자 Km"
        val kmPattern = Regex("""(\d+\.?\d*)\s*[Kk]m""")
        val kmMatch = kmPattern.find(rawText)
        if (kmMatch != null) {
            return kmMatch.groupValues[1].toDoubleOrNull()
        }

        // 패턴2: "숫자km" (소문자)
        val kmLowerPattern = Regex("""(\d+\.?\d*)\s*km""", RegexOption.IGNORE_CASE)
        val kmLowerMatch = kmLowerPattern.find(rawText)
        if (kmLowerMatch != null) {
            return kmLowerMatch.groupValues[1].toDoubleOrNull()
        }

        return null
    }

    // ════════════════════════════════════════════════════════════════
    //  groupListNodes(): 화물24시 카드 기반 노드 그룹화
    // ════════════════════════════════════════════════════════════════
    
    /**
     * 화물24시 카드형 리스트를 묶습니다.
     * 요금 노드("70,000원")가 카드의 끝부분에 위치하므로, 
     * 화면 상단부터 Y축 기준으로 정렬한 뒤 이전 요금 노드 다음부터 
     * 현재 요금 노드까지의 모든 노드를 하나의 카드로 묶습니다.
     * 이 방식을 통해 특정 높이를 하드코딩하지 않고 동적으로 대응합니다.
     */
    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        // Y축(top)을 최우선으로, X축(left)을 차순위로 정렬
        val sortedNodes = allNodes.sortedWith(compareBy({ it.rect.top }, { it.rect.left }))
        val groups = mutableListOf<Pair<ScreenTextNode, List<String>>>()
        var lastFareIndex = -1
        
        val fareRegex = Regex("""^\d{1,3}(,\d{3})*원$""")
        
        for ((index, node) in sortedNodes.withIndex()) {
            if (node.text.matches(fareRegex)) {
                // 이전 요금 노드 다음 노드부터 현재 요금 노드까지 하나의 카드로 묶음
                val cardNodes = sortedNodes.subList(lastFareIndex + 1, index + 1)
                groups.add(Pair(node, cardNodes.map { it.text }))
                lastFareIndex = index
            }
        }
        return groups
    }
}
