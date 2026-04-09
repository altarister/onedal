package com.onedal.app.core

import android.content.Context
import android.util.Log
import com.onedal.app.models.SimplifiedOfficeOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * 웹뷰(크롬) 가짜 콜 테스트 전용 파서.
 *
 * 크롬 브라우저가 텍스트를 뭉개서 전달하는 환경("6.730.9서울 종로구경기 부천시다59")에서도
 * 의미론적 정규식으로 요금/주소/거리를 핀셋 추출하는 '사금 채취식(Pan-for-Gold)' 파서입니다.
 *
 * TODO: 사금 채취식 정규식 로직 구현 예정
 */
class MockWebScrapParser(private val context: Context) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER_MOCK"
    }

    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")
        val now = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.getDefault()).format(Date())

        // TODO: 사금 채취식 정규식으로 뭉쳐진 텍스트에서 요금/주소/거리를 추출
        Log.d(TAG, "🧪 [MockWebParser] 텍스트 수신: ${rawJoined.take(200)}")

        return SimplifiedOfficeOrder(
            id = UUID.randomUUID().toString(),
            type = "NEW_ORDER",
            pickup = "미상",
            dropoff = "미상",
            fare = 0,
            timestamp = now,
            rawText = rawJoined,
            pickupDistance = null
        )
    }

    override fun shouldClick(order: SimplifiedOfficeOrder): Boolean {
        // TODO: NativeScrapParser와 동일한 필터 로직 적용 예정
        Log.d(TAG, "🧪 [MockWebParser] shouldClick 호출됨 (미구현)")
        return false
    }

    override fun parsePickupDistance(rawText: String): Double? {
        // TODO: 사금 채취식 정규식으로 거리 추출 예정
        return null
    }
}
