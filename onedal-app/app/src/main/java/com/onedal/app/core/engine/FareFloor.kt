package com.onedal.app.core.engine

/**
 * 💵 **최소 금액 — 세 배차망이 같은 한 식** (기사님 «화물24시·인성·픽커 모두 공통으로»)
 *
 * 값은 관제웹 🔍 필터 «어떤 콜»의 막대(`user_filters.min_fare` → 피기백 `minFare`) 하나다. 0 이면 끈 것이다.
 * 부르는 곳은 각 배차망 파서의 요금 축이다 — 성적표·«떨어진 까닭»은 파서 판정 한 곳이 세야 두 벌이 안 된다.
 * 인성·화물24시는 이 식 **그리고** 단가표(배송거리 × 단가)를 함께 본다.
 */
object FareFloor {
    fun passes(fare: Int, minFare: Int): Boolean = minFare <= 0 || fare >= minFare
}
