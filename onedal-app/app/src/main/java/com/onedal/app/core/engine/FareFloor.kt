package com.onedal.app.core.engine

import com.onedal.app.core.VehicleMatch
import com.onedal.app.models.CallLoad

/**
 * 💵 **최소 금액 — 세 배차망이 같은 한 식** (기사님 «화물24시·인성·픽커 모두 공통으로»)
 *
 * 값은 관제웹 🔍 필터 «어떤 콜»의 막대(`user_filters.min_fare` → 블루투스 공급 `minFare`) 하나다. 0 이면 끈 것이다.
 * 부르는 곳은 각 배차망 파서의 요금 축이다 — 성적표·«떨어진 까닭»은 파서 판정 한 곳이 세야 두 벌이 안 된다.
 * 인성 · 화물24시 · 인성플렉스는 이 식 **그리고** 단가표(배송거리 × 단가 — `rateOf`)를 함께 본다.
 */
object FareFloor {
    fun passes(fare: Int, minFare: Int): Boolean = minFare <= 0 || fare >= minFare

    /**
     * 차종 → 단가(원/km). **배차망 판정이 모두 이 한 곳을 본다** (인성 `InsungParser.judge` · 목록 판정 `ListJudge`).
     * 콜의 짐 묶음 차종 글자를 차종 맞춤 한 규칙(`VehicleMatch.of` — 서버 `PricingEngine` 과 같은 shared `vehicleMatchOf` 의 짝)으로
     * 우리 차종에 맞춘 뒤 그 차종의 단가다. 수단 상관없음 · 우리 차종에 없음 · 모름이면 null — 단가 바닥을 안 본다(최소 금액은 남는다).
     */
    fun rateOf(rates: Map<String, Int>, load: CallLoad?, app: String): Int? {
        if (rates.isEmpty()) return null
        val match = VehicleMatch.of(load, app)
        return if (match.kind == VehicleMatch.Kind.OURS) rates[match.vehicle] else null
    }
}
