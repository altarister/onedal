package com.onedal.app.core.engine

import java.util.Locale

/**
 * 💵 **최소 금액 — 세 배차망이 같은 한 식** (기사님 «화물24시·인성·픽커 모두 공통으로»)
 *
 * 값은 관제웹 🔍 필터 «어떤 콜»의 막대(`user_filters.min_fare` → 블루투스 공급 `minFare`) 하나다. 0 이면 끈 것이다.
 * 부르는 곳은 각 배차망 파서의 요금 축이다 — 성적표·«떨어진 까닭»은 파서 판정 한 곳이 세야 두 벌이 안 된다.
 * 인성·화물24시는 이 식 **그리고** 단가표(배송거리 × 단가 — `rateOf`)를 함께 본다.
 */
object FareFloor {
    fun passes(fare: Int, minFare: Int): Boolean = minFare <= 0 || fare >= minFare

    /**
     * 차종 → 단가(원/km). **배차망 판정이 모두 이 한 곳을 본다** (인성 `InsungParser.judge` · 목록 판정 `ListJudge`).
     * 🔴 복제하지 않는다 (규칙 ③): 차종 별칭 규칙이 두 벌이 되면 배차망마다 다른 값이 나온다.
     * 어떤 차종 글자를 넘길지(콜 화면 차종 · 기사님 차종)는 부른 쪽이 고른다 — 이 함수는 글자 → 단가만.
     */
    fun rateOf(rates: Map<String, Int>, vehicle: String): Int? {
        if (rates.isEmpty()) return null
        val p = vehicle.lowercase(Locale.getDefault())
        for ((key, rate) in rates) {
            val matched = when (key.lowercase(Locale.getDefault())) {
                "1t" -> p.contains("1") || p.contains("t") || p.contains("톤")
                "다마스" -> p.contains("다")
                "라보" -> p.contains("라")
                "오토바이" -> p.contains("오") || p.contains("바")
                "승용차" -> p.contains("승")
                else -> p.contains(key.lowercase(Locale.getDefault())) || key.lowercase(Locale.getDefault()).contains(p)
            }
            if (matched) return rate
        }
        return null
    }
}
