package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📋 **콜 요건 — 모든 배차망이 같은 한 줄** (기사님 «요건은 공통» · 배차망_모드표.md)
 *
 * 서버가 판단하려면 상차 · 하차 · 요금이 있어야 한다(서버도 같은 셋을 «판정 불가»로 본다 — `detail.ts`).
 * 목록에서는 «이 줄을 콜로 알아볼 수 있나»(덜 읽힌 줄은 그 스캔에서 뺀다), 상세에서는 채운 뒤 «보낼 수 있나»를 이 한 줄로 본다.
 * 배차망마다 다른 것은 «하차가 없어도 되는 콜 종류»(`IDispatchAppPlugin.allowsEmptyDropoff` — 픽커 도보) 하나다.
 */
object OrderRequirement {
    /** 파서가 값을 못 읽었을 때 넣는 표시 — 빈 값과 같다 */
    const val MISSING = "배차값없음"

    fun meets(order: SimplifiedOfficeOrder, allowsEmptyDropoff: Boolean): Boolean =
        order.fare > 0 && filled(order.pickup) && (allowsEmptyDropoff || filled(order.dropoff))

    /**
     * 📋 **목록 완독** — 요건에 **상차지거리**를 더한다(기사님 «상차지 거리를 찾는 건 공통»). 목록 줄에만 쓴다.
     * 거르는 게 아니라 **미루는 것**이다 — 덜 읽힌 줄은 그 스캔만 빼고 다음 스캔에 다시 본다.
     * 상세에서는 거리를 요구하지 않는다(손으로 연 상세·사진으로 만든 콜에는 거리가 없다) — 상세는 `meets`.
     */
    fun listComplete(order: SimplifiedOfficeOrder, allowsEmptyDropoff: Boolean): Boolean =
        meets(order, allowsEmptyDropoff) && order.pickupDistance != null

    private fun filled(value: String): Boolean = value.isNotBlank() && value != MISSING
}
