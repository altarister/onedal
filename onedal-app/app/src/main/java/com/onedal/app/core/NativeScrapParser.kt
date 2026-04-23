package com.onedal.app.core

import android.content.Context
import com.onedal.app.core.AppLogger
import com.google.gson.Gson
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
import org.json.JSONObject
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * 화면에서 추출된 원시 문자열 데이터를 파싱하여
 * 구조화된 모델(SimplifiedOfficeOrder)로 변환하고,
 * 서버에서 내려준 4대 필터 조건(도착지/요금/블랙리스트/거리)에
 * 부합하는지 종합 판정하는 두뇌 엔진입니다.
 */
class NativeScrapParser(private val context: Context) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER"
    }

    private val gson = Gson()
    private val prefs by lazy {
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
    }

    /**
     * SharedPreferences에 저장된 최신 필터를 로드합니다.
     * 3초마다 텔레메트리 응답이 갱신해 주므로 항상 최신 상태입니다.
     */
    /**
     * JSON 배열을 List<String>으로 파싱하는 헬퍼
     */
    private fun parseJsonArray(json: JSONObject, key: String): List<String> {
        return try {
            val arr = json.optJSONArray(key)
            if (arr != null) (0 until arr.length()).map { arr.getString(it) } else emptyList()
        } catch (e: Exception) { emptyList() }
    }

    /**
     * 콤마 구분 문자열을 List<String>으로 파싱하는 헬퍼
     */
    private fun parseCommaSeparated(json: JSONObject, key: String): List<String> {
        val str = json.optString(key, "")
        return if (str.isNotEmpty()) str.split(",").map { it.trim() }.filter { it.isNotEmpty() } else emptyList()
    }

    fun loadCurrentFilter(): FilterConfig {
        return try {
            val jsonStr = prefs.getString("activeFilter", null) ?: return FilterConfig()
            val json = JSONObject(jsonStr)

            FilterConfig(
                allowedVehicleTypes = parseJsonArray(json, "allowedVehicleTypes"),
                isActive = json.optBoolean("isActive", true),
                isSharedMode = json.optBoolean("isSharedMode", false),
                pickupRadiusKm = json.optInt("pickupRadiusKm", 10),
                minFare = json.optInt("minFare", 0),
                maxFare = json.optInt("maxFare", 1000000),
                destinationCity = json.optString("destinationCity", ""),
                destinationRadiusKm = json.optInt("destinationRadiusKm", 10),
                excludedKeywords = parseJsonArray(json, "excludedKeywords"),
                destinationKeywords = parseJsonArray(json, "destinationKeywords"),
                customCityFilters = parseJsonArray(json, "customCityFilters"),
                customFilters = parseJsonArray(json, "customFilters")
            )
        } catch (e: Exception) {
            AppLogger.e(TAG, "❌ 필터 JSON 파싱 실패: ${e.message}")
            FilterConfig()
        }
    }

    /**
     * @param texts 한 화면 주기에서 새로 나타난 텍스트 블록 리스트
     * @return 파싱 성공 시 SimplifiedOfficeOrder 객체
     */
    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")

        // ── 1. 차종 앵커링을 통한 요금(Fare) 및 차종(VehicleType) 파싱 ──
        val vehicleRegex = Regex("^(오|다|라|1t|1\\.4|2\\.5t?|3\\.5t?|5t|11t|14t|18t|25t)$")
        var fare = 0
        var vehicleType: String? = null

        for (i in texts.indices) {
            val text = texts[i].trim().replace(",", "")
            
            // 만약 현재 텍스트(예: "라")가 차종이라면
            if (vehicleRegex.matches(text)) {
                vehicleType = text
                // 바로 다음 텍스트 노드가 오더 창 우측 끝의 요금(예: "2.2" -> 22,000원)
                if (i + 1 < texts.size) {
                    val nextText = texts[i + 1].trim().replace(",", "")
                    val nextVal = nextText.toDoubleOrNull()
                    // 요금이 만 단위(0.1만 = 1000원 이상)이면 채택
                    if (nextVal != null && nextVal > 0) {
                        fare = (nextVal * 10000).toInt()
                        break
                    }
                }
            } else {
                // 예외 fallback: 텍스트 노드가 하나로 뭉쳐진 경우 ("라2.2" 등)
                val clumpedMatch = Regex("(오|다|라|1t|1\\.4|2\\.5t?|3\\.5t?|5t|11t|14t|18t|25t)\\s*(\\d+(?:\\.\\d+)?)").find(text)
                if (clumpedMatch != null) {
                    vehicleType = clumpedMatch.groupValues[1]
                    val nextVal = clumpedMatch.groupValues[2].toDoubleOrNull()
                    if (nextVal != null && nextVal > 0) {
                        fare = (nextVal * 10000).toInt()
                        break
                    }
                }
            }
        }

        // ── 2. 지역명 파싱 (동/읍/면/리 로 끝나는 텍스트) ──
        // 서버에서 다운받은 동적 키워드 사전에서 uiNoiseWords 로드, 없으면 기본값
        val uiNoiseWords = try {
            val keywordsJsonStr = prefs.getString("targetAppKeywords", null)
            if (keywordsJsonStr != null) {
                val keywordsObj = JSONObject(keywordsJsonStr)
                val arr = keywordsObj.optJSONArray("uiNoiseWords")
                if (arr != null) {
                    (0 until arr.length()).map { arr.getString(it) }.toSet()
                } else setOf("거리", "출발지", "도착지", "차종", "요금", "설정", "콜상세")
            } else {
                setOf("거리", "출발지", "도착지", "차종", "요금", "설정", "콜상세")
            }
        } catch(e: Exception) {
            setOf("거리", "출발지", "도착지", "차종", "요금", "설정")
        }

        // ── 2. 지역명 및 예약일정 파싱 (LocationTextAnalyzer 활용) ──
        val locationInfos = texts
            .map { it.trim() }
            .filter { text ->
                !uiNoiseWords.any { text.equals(it, ignoreCase = true) } && text.length >= 2
            }
            .mapNotNull { LocationTextAnalyzer.analyze(it) }
            .distinctBy { it.cleanRegion }

        // 첫 번째 유효 지역 = 상차지, 두 번째 유효 지역 = 하차지 (인성앱 리스트 순서)
        val pickupInfo = locationInfos.getOrNull(0)
        val dropoffInfo = locationInfos.getOrNull(1) ?: pickupInfo
        
        val pickup = pickupInfo?.cleanRegion ?: "미상"
        val dropoff = dropoffInfo?.cleanRegion ?: "미상"
        val scheduleText = pickupInfo?.scheduleText ?: dropoffInfo?.scheduleText

        // ── 3. 거리 파싱 ──
        // 소수점 있는 숫자들이 거리 (예: "9.6", "38.5")
        // 화면 최좌측에 상, 하로 두 개가 뜸. 먼저 오는 값이 [접근거리], 다음 오는 값이 [배송거리]
        val distances = mutableListOf<Double>()
        val distanceRegex = Regex("""(\d+\.\d+)""")
        texts.forEach { textNode ->
            val clean = textNode.replace(",", "")
            if (clean.toDoubleOrNull() != null && clean.contains(".")) {
                distances.add(clean.toDouble())
            } else if (clean.contains(".")) {
                distanceRegex.findAll(clean).forEach { match ->
                    match.groupValues[1].toDoubleOrNull()?.let { distances.add(it) }
                }
            }
        }
        
        // 첫 번째 값 = 상차지 직선거리 / 두 번째 값 = 배송거리 (의도적으로 sort() 제외)

        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())
        
        // 시간 포맷 (HH:mm) 추출
        var postTime: String? = null
        val timeRegex = Regex("\\b([0-2]?\\d:[0-5]\\d)\\b")
        val timeMatch = timeRegex.find(rawJoined)
        if (timeMatch != null) {
            postTime = timeMatch.groupValues[1]
        }

        // 의미 없는 화면(오더 목록이 아닌 화면 등)에서 무의미한 로그 도배 방지
        val isValidOrder = fare > 0 || pickup != "미상" || dropoff != "미상"

        return SimplifiedOfficeOrder(
            id = UUID.randomUUID().toString(),
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = now,
            postTime = postTime,
            scheduleText = scheduleText,
            vehicleType = vehicleType,
            rawText = rawJoined,
            pickupDistance = distances.getOrNull(0)
        )
    }

    /**
     * 파싱된 오더가 4대 필터 조건을 모두 만족하는지 종합 판정합니다.
     * 모든 조건이 AND(교집합)로 통과해야만 true를 반환합니다.
     */
    override fun shouldClick(order: SimplifiedOfficeOrder): Boolean {
        val filter = loadCurrentFilter()
        val rawText = order.rawText ?: ""

        // ── 조건 0: 차종 매칭 (빈 배열이면 전체 허용) ──
        val vehicleMatch = if (filter.allowedVehicleTypes.isEmpty()) {
            true
        } else {
            order.vehicleType != null && filter.allowedVehicleTypes.any { allowed ->
                val normAllowed = allowed.lowercase(Locale.getDefault())
                val normParsed = order.vehicleType.lowercase(Locale.getDefault())
                when (normAllowed) {
                    "1t" -> normParsed.contains("1") || normParsed.contains("t") || normParsed.contains("톤")
                    "다마스" -> normParsed.contains("다")
                    "라보" -> normParsed.contains("라")
                    "오토바이" -> normParsed.contains("오") || normParsed.contains("바")
                    else -> normParsed.contains(normAllowed) || normAllowed.contains(normParsed)
                }
            }
        }

        // ── 조건 1: 도착지 매칭 (2단계 필터링 지원) ──
        val isDetailPreConfirmStage = order.type.endsWith("_CLICK", ignoreCase = true)

        val regionMatch = if (isDetailPreConfirmStage && filter.customCityFilters.isNotEmpty()) {
            val dropoffIdx = rawText.indexOf("도착지상세").takeIf { it != -1 } 
                             ?: rawText.indexOf("도착지")
            val pureDropoffText = if (dropoffIdx != -1) rawText.substring(dropoffIdx) else rawText

            val hasCityAlias = filter.customCityFilters.any { alias -> 
                pureDropoffText.contains(alias, ignoreCase = true) 
            }
            
            val matchResult = if (!hasCityAlias) {
                false
            } else {
                filter.destinationKeywords.any { dong -> 
                    pureDropoffText.contains(dong, ignoreCase = true) 
                }
            }
            if (order.fare > 0) AppLogger.d(TAG, "🔍 [2차 상세 필터] 시/도 통과=$hasCityAlias, 최종결과=$matchResult | 대상문자열: ${pureDropoffText.replace('\n', ' ').take(50)}")
            matchResult
        } else {
            // [1차 리스트 필터] 기존 구조 유지 (dropoff만 검사, rawText는 출발지도 포함되므로 사용 금지)
            val matchResult = if (filter.destinationKeywords.isEmpty()) {
                true
            } else {
                filter.destinationKeywords.any { region ->
                    order.dropoff.contains(region, ignoreCase = true)
                }
            }
            if (!isDetailPreConfirmStage && order.fare > 0) AppLogger.d(TAG, "🔍 [1차 리스트 필터] 도착지=${order.dropoff}, 결과=$matchResult")
            matchResult
        }

        // ── 조건 2: 요금 하한선 ──
        val fareMatch = order.fare >= filter.minFare

        // ── 조건 3: 상차지 거리 ──
        // 합짐 모드(isSharedMode)에서는 상차지 반경 제한을 무시합니다.
        // 합짐은 가는 길 위의 콜을 잡는 것이므로 거리가 아닌 경로(회랑) 기준으로 판단됩니다.
        val distanceMatch = if (order.pickupDistance == null) {
            true
        } else if (filter.isSharedMode) {
            true // 합짐 모드: 상차 반경 무시 (회랑 필터가 대신 판단)
        } else {
            order.pickupDistance <= filter.pickupRadiusKm
        }

        // ── 조건 4: 블랙리스트 제외 ──
        val blacklistClear = if (filter.excludedKeywords.isEmpty()) {
            true
        } else {
            filter.excludedKeywords.none { banned ->
                rawText.contains(banned, ignoreCase = true)
            }
        }

        // ── 로그 출력 (디버깅용) ──
        val isValidOrder = order.fare > 0 || order.pickup != "미상" || order.dropoff != "미상"
        if (isValidOrder) {
            // AppLogger.d(TAG, "📋 [필터값] 차종=${filter.allowedVehicleTypes}, 하한요금=${filter.minFare}, 반경=${filter.pickupRadiusKm}km, 블랙=${filter.excludedKeywords}, 지역=${filter.destinationKeywords.size}")
            val scheduleLog = if (order.scheduleText != null) "[수식어:${order.scheduleText}] " else ""
            
            AppLogger.roadmap("🔍 [타겟 콜 필터 결과] 차종(${order.vehicleType ?: "미상"})=${if(vehicleMatch) "✅" else "❌"} " +
                        "도착지(${filter.destinationKeywords.size}중 ${order.dropoff})=${if(regionMatch) "✅" else "❌"} " +
                        "요금(${filter.minFare} <= ${order.fare})=${if(fareMatch) "✅" else "❌"} " +
                        "상차지/거리(${if(filter.isSharedMode) "합짐무시" else "${filter.pickupRadiusKm}km"} >= ${order.pickupDistance ?: "미상"}km)=${if(distanceMatch) "✅" else "❌"} " +
                        "블랙()=${if(blacklistClear) "✅" else "❌"}", "LIST")
        }

        val result = vehicleMatch && regionMatch && fareMatch && distanceMatch && blacklistClear

        return result
    }

    /**
     * rawText에서 상차지 직선거리를 파싱합니다.
     * 인성앱 거리 표시 패턴: "2.3 / 45" (상차직선거리 / 배송거리)
     * 또는 "2.3km" 형태
     * @return 상차지 직선거리 (km), 파싱 불가 시 null
     */
    override fun parsePickupDistance(rawText: String): Double? {
        // 패턴1: "숫자 / 숫자" (슬래시 구분, 첫 번째가 상차 직선거리)
        val slashPattern = Regex("""(\d+\.?\d*)\s*/\s*(\d+\.?\d*)""")
        val slashMatch = slashPattern.find(rawText)
        if (slashMatch != null) {
            return slashMatch.groupValues[1].toDoubleOrNull()
        }

        // 패턴2: "숫자km" 또는 "숫자 km"
        val kmPattern = Regex("""(\d+\.?\d*)\s*km""", RegexOption.IGNORE_CASE)
        val kmMatch = kmPattern.find(rawText)
        if (kmMatch != null) {
            return kmMatch.groupValues[1].toDoubleOrNull()
        }

        return null
    }
}
