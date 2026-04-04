package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * 화면에서 추출된 원시 문자열 데이터를 파싱하여
 * 구조화된 모델(SimplifiedOfficeOrder)로 변환해 주는 로직 전담 클래스.
 * UI나 Network 코드가 없어 Unit Test 가 용이합니다.
 */
class ScrapParser {

    /**
     * @param texts 한 화면 주기에서 새로 나타난 텍스트 블록 리스트
     * @return 파싱 성공 시 SimplifiedOfficeOrder 객체
     */
    fun parse(texts: List<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")

        // 1. 요금 파싱
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
            id = java.util.UUID.randomUUID().toString(),
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = now,
            rawText = rawJoined
        )
    }

    /**
     * 해당 텍스트 블록이 "광클(사냥)" 조건에 부합하는지 판별
     * 지금은 단순 100 이상의 숫자인지 휴리스틱 검사 (추후 확장 가능)
     */
    fun isHighProfit(text: String): Boolean {
        val value = text.toIntOrNull()
        return value != null && value >= 100
    }
}
