package com.onedal.app.core

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.SimplifiedOfficeOrder
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
class ScrapParser(private val context: Context) {

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
            val json = prefs.getString("activeFilter", null)
            if (json != null) {
                gson.fromJson(json, FilterConfig::class.java)
            } else {
                FilterConfig() // 기본값 (아직 서버 응답이 없는 경우)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ 필터 JSON 파싱 실패: ${e.message}")
            FilterConfig()
        }
    }

    /**
     * @param texts 한 화면 주기에서 새로 나타난 텍스트 블록 리스트
     * @return 파싱 성공 시 SimplifiedOfficeOrder 객체
     */
    fun parse(texts: List<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")

        // 1. 요금 파싱 (숫자만 추출, 만 단위 이상인 것)
        val fareText = texts.find { it.contains("요금") }
        val fare = fareText?.replace(Regex("[^0-9]"), "")?.toIntOrNull() ?: 0

        // 2. 상차지 파싱
        val pickupText = texts.find { it.contains("@") } ?: "미상"
        val pickup = pickupText.substringAfter("@").split("/").firstOrNull()?.trim()?.replace("()", "") ?: pickupText

        // 3. 하차지 파싱
        val dropoffText = texts.find { it.split("/").size >= 3 && !it.contains("@") } ?: "미상"
        val dropoff = dropoffText.split("/").take(3).joinToString(" ").trim()

        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())

        return SimplifiedOfficeOrder(
            id = UUID.randomUUID().toString(),
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = now,
            rawText = rawJoined
        )
    }

    /**
     * 파싱된 오더가 4대 필터 조건을 모두 만족하는지 종합 판정합니다.
     * 모든 조건이 AND(교집합)로 통과해야만 true를 반환합니다.
     *
     * 조건1: 도착지(dropoff)에 targetRegions 중 하나라도 포함
     * 조건2: 요금(fare) >= minFare
     * 조건3: rawText에 blacklist 단어가 단 하나도 없음
     * 조건4: 상차지 직선거리 <= pickupRadius
     */
    fun shouldClick(order: SimplifiedOfficeOrder): Boolean {
        val filter = loadCurrentFilter()
        val rawText = order.rawText ?: ""

        // ── 조건 1: 도착지 매칭 ──
        val regionMatch = if (filter.targetRegions.isEmpty()) {
            true // 필터 미설정 시 통과
        } else {
            filter.targetRegions.any { region ->
                order.dropoff.contains(region) || rawText.contains(region)
            }
        }

        // ── 조건 2: 요금 하한선 ──
        val fareMatch = order.fare >= filter.minFare

        // ── 조건 3: 블랙리스트 제외 ──
        val blacklistClear = if (filter.blacklist.isEmpty()) {
            true // 블랙리스트 미설정 시 통과
        } else {
            filter.blacklist.none { banned ->
                rawText.contains(banned, ignoreCase = true)
            }
        }

        // ── 조건 4: 상차지 거리 ──
        val pickupDistance = parsePickupDistance(rawText)
        val distanceMatch = if (pickupDistance == null) {
            true // 거리 정보 없으면 일단 통과 (데이터 부족)
        } else {
            pickupDistance <= filter.pickupRadius
        }

        // ── 로그 출력 (디버깅용) ──
        Log.d(TAG, "🔍 [필터 검사] 도착지=${order.dropoff}, 요금=${order.fare}, 거리=${pickupDistance ?: "미상"}km")
        Log.d(TAG, "   조건1(지역)=${if(regionMatch) "✅" else "❌"} " +
                    "조건2(요금)=${if(fareMatch) "✅" else "❌"} " +
                    "조건3(블랙)=${if(blacklistClear) "✅" else "❌"} " +
                    "조건4(거리)=${if(distanceMatch) "✅" else "❌"}")

        val result = regionMatch && fareMatch && blacklistClear && distanceMatch

        if (result) {
            Log.d(TAG, "🎯 [4대 조건 통과!] → 클릭 실행 대상")
        } else {
            Log.d(TAG, "⛔ [조건 불충족] → 스킵")
        }

        return result
    }

    /**
     * rawText에서 상차지 직선거리를 파싱합니다.
     * 인성앱 거리 표시 패턴: "2.3 / 45" (상차직선거리 / 배송거리)
     * 또는 "2.3km" 형태
     * @return 상차지 직선거리 (km), 파싱 불가 시 null
     */
    fun parsePickupDistance(rawText: String): Double? {
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
