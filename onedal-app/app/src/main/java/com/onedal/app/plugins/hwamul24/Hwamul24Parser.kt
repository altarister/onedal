package com.onedal.app.plugins.hwamul24

import android.content.Context
import com.onedal.app.core.IScrapParser
import com.onedal.app.models.SimplifiedOfficeOrder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

class Hwamul24Parser(private val context: Context) : IScrapParser {
    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        // TODO: 24시콜 앱의 텍스트 노드 구조에 맞게 파싱 로직 구현
        val now = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(Date())
        
        return SimplifiedOfficeOrder(
            id = "24H-" + UUID.randomUUID().toString().substring(0, 8),
            type = "24시콜_미구현",
            pickup = "미상",
            dropoff = "미상",
            fare = 0,
            timestamp = now,
            vehicleType = null,
            pickupDistance = null,
            scheduleText = null,
            postTime = null,
            rawText = texts.joinToString(" ")
        )
    }

    override fun shouldClick(order: SimplifiedOfficeOrder): Boolean {
        // TODO: 24시콜 전용 클릭 조건 구현
        return false
    }

    override fun parsePickupDistance(rawText: String): Double? {
        // TODO: 24시콜 거리 추출 로직 구현
        return null
    }
}
