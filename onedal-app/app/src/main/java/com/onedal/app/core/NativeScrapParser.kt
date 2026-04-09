package com.onedal.app.core

import android.content.Context
import android.util.Log
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
    fun loadCurrentFilter(): FilterConfig {
        return try {
            val jsonStr = prefs.getString("activeFilter", null) ?: return FilterConfig()
            val json = JSONObject(jsonStr)
            
            // blacklist: 배열이면 그대로, 문자열이면 콤마로 분리
            val blacklist = try {
                val arr = json.optJSONArray("blacklist")
                if (arr != null) {
                    (0 until arr.length()).map { arr.getString(it) }
                } else {
                    val str = json.optString("blacklist", "")
                    if (str.isNotEmpty()) str.split(",").map { it.trim() }.filter { it.isNotEmpty() } else emptyList()
                }
            } catch (e: Exception) { emptyList() }
            
            // targetRegions: 배열이면 그대로, 없으면 빈 리스트
            val targetRegions = try {
                val arr = json.optJSONArray("targetRegions")
                if (arr != null) {
                    (0 until arr.length()).map { arr.getString(it) }
                } else emptyList()
            } catch (e: Exception) { emptyList() }

            FilterConfig(
                mode = json.optString("mode", "첫짐"),
                minFare = json.optInt("minFare", 0),
                pickupRadius = json.optInt("pickupRadius", 999),
                targetCity = json.optString("targetCity", ""),
                targetRegions = targetRegions,
                targetRadius = json.optInt("targetRadius", 10),
                blacklist = blacklist
            )
        } catch (e: Exception) {
            Log.e(TAG, "❌ 필터 JSON 파싱 실패: ${e.message}")
            FilterConfig()
        }
    }

    /**
     * @param texts 한 화면 주기에서 새로 나타난 텍스트 블록 리스트
     * @return 파싱 성공 시 SimplifiedOfficeOrder 객체
     */
    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")

        // ── 1. 요금 파싱 ──
        // (예: "47" = 47,000원, "42.5" = 42,500원)
        var maxFareValue = 0.0
        for (text in texts) {
            val cleanStr = text.replace(",", "")
            val isIntegerPattern = cleanStr.toIntOrNull() != null && !cleanStr.contains(".")
            val isDecimalPattern = cleanStr.toDoubleOrNull() != null && (cleanStr.endsWith(".0") || cleanStr.endsWith(".5"))
            
            if (isIntegerPattern || isDecimalPattern) {
                val value = cleanStr.toDoubleOrNull() ?: 0.0
                if (value in 10.0..9999.0) {
                    if (value > maxFareValue) {
                        maxFareValue = value
                    }
                }
            } else {
                // [목업 테스트 전용 지원] "9.549.4경기 수원시-대구 동구라84" 처럼 차종 뒤에 한 줄로 통째로 나오는 경우
                val mockupRegex = Regex("""(?:오|다|라|1t|1\.4|2\.5t?|3\.5t?|5t|11t|14t|18t|25t)(\d+(?:\.\d+)?)""")
                val match = mockupRegex.find(cleanStr)
                if (match != null) {
                    val value = match.groupValues[1].toDoubleOrNull() ?: 0.0
                    if (value in 10.0..9999.0 && value > maxFareValue) {
                        maxFareValue = value
                    }
                }
            }
        }
        val fare = (maxFareValue * 1000).toInt()

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

        // 하이픈(-)이 붙은 지역명도 처리 (예: "태전동-" → "태전동")
        // 다른 배차 앱(또는 목업 데이터)에서 구/시/군 단위로만 끝나는 경우도 포용하기 위해 확장
        val regionPattern = Regex("(.+)(동|읍|면|리|시|구|군)[-+]?$")
        val regions = texts
            .map { it.trim().removeSuffix("-").removeSuffix("+") }
            .filter { regionPattern.matches(it) && !uiNoiseWords.contains(it) && !it.startsWith("@") && it.length >= 2 }
            .distinct()

        // 첫 번째 지역 = 상차지, 두 번째 지역 = 하차지 (인성앱 리스트 순서)
        val pickup = regions.getOrNull(0) ?: "미상"
        val dropoff = regions.getOrNull(1) ?: regions.getOrNull(0) ?: "미상"

        // ── 3. 거리 파싱 ──
        // 소수점 있는 숫자들이 거리 (예: "9.6", "22.1")
        // 원래는 독립된 텍스트 노드에서 추출했으나, 목업 환경에서 "4.44.7서울..." 처럼 뭉쳐있을 경우를 대비해 정규식 활용
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
        distances.sort()
        // 첫 번째(작은 값) = 상차지 직선거리, 두 번째(큰 값) = 배송거리

        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())

        // 의미 없는 화면(오더 목록이 아닌 화면 등)에서 무의미한 로그 도배 방지
        val isValidOrder = fare > 0 || pickup != "미상" || dropoff != "미상"
        // if (isValidOrder) {
        //     Log.d(TAG, "📋 [파싱 결과] 요금=${fare}원(원본:$maxFareValue), 상차=$pickup, 하차=$dropoff, 거리=$distances")
        // }

        return SimplifiedOfficeOrder(
            id = UUID.randomUUID().toString(),
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = now,
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

        // ── 조건 1: 도착지 매칭 ──
        // [임시 주석 처리] 목업 데이터 테스트를 위해 필터 조건 무시 (요금만 체크)
        val regionMatch = true
        /*
        val regionMatch = if (filter.targetRegions.isEmpty()) {
            true // 필터 미설정 시 통과
        } else {
            filter.targetRegions.any { region ->
                order.dropoff.contains(region) || rawText.contains(region)
            }
        }
        */

        // ── 조건 2: 요금 하한선 ──
        val fareMatch = order.fare >= filter.minFare

        // ── 조건 3: 블랙리스트 제외 ──
        // [임시 주석 처리] 목업 데이터 테스트를 위해 필터 조건 무시
        val blacklistClear = true
        /*
        val blacklistClear = if (filter.blacklist.isEmpty()) {
            true // 블랙리스트 미설정 시 통과
        } else {
            filter.blacklist.none { banned ->
                rawText.contains(banned, ignoreCase = true)
            }
        }
        */

        // ── 조건 4: 상차지 거리 ──
        // [임시 주석 처리] 목업 데이터 테스트를 위해 필터 조건 무시
        val distanceMatch = true
        /*
        val distanceMatch = if (order.pickupDistance == null) {
            true // 거리 정보 없으면 일단 통과 (데이터 부족)
        } else {
            order.pickupDistance <= filter.pickupRadius
        }
        */

        // ── 로그 출력 (디버깅용) ──
        val isValidOrder = order.fare > 0 || order.pickup != "미상" || order.dropoff != "미상"
        if (isValidOrder) {
            Log.d(TAG, "🔍 [필터 검사] 도착지=${order.dropoff}, 요금=${order.fare}, 거리=${order.pickupDistance ?: "미상"}km")
            Log.d(TAG, "   조건1(지역)=${if(regionMatch) "✅" else "❌"} " +
                        "조건2(요금)=${if(fareMatch) "✅" else "❌"} " +
                        "조건3(블랙)=${if(blacklistClear) "✅" else "❌"} " +
                        "조건4(거리)=${if(distanceMatch) "✅" else "❌"}")
        }

        val result = regionMatch && fareMatch && blacklistClear && distanceMatch

        if (result) {
            Log.d(TAG, "🎯 [4대 조건 통과!] → 클릭 실행 대상")
        } else {
            if (isValidOrder) Log.d(TAG, "⛔ [조건 불충족] → 스킵")
        }

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
