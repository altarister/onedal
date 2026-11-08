package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.lastDropoffStop
import com.onedal.app.core.StopText

/**
 * 📋 **콜 요건 — 모든 배차망이 같은 한 줄** (기사님 «요건은 공통» · 배차망_모드표.md)
 *
 * 서버가 판단하려면 상차 · 하차 · 요금이 있어야 한다(서버도 같은 셋을 «판정 불가»로 본다 — `detail.ts`).
 * 목록에서는 «이 줄을 콜로 알아볼 수 있나»(덜 읽힌 줄은 그 스캔에서 뺀다), 상세에서는 채운 뒤 «보낼 수 있나»를 이 한 줄로 본다.
 * 배차망마다 다른 것은 «하차가 없어도 되는 콜 종류»(`IDispatchAppPlugin.allowsEmptyDropoff` — 픽커 도보) 하나다.
 */
object OrderRequirement {
    fun meets(order: SimplifiedOfficeOrder, allowsEmptyDropoff: Boolean): Boolean =
        order.fare > 0 && filled(StopText.of(firstPickupStop(order))) && (allowsEmptyDropoff || filled(StopText.of(lastDropoffStop(order))))

    /**
     * 🏠 **상세의 필수 요소 — 세 배차망 같다** (기사님 «상세에 들어간 뒤엔 모든 주소를 다 가지고 있어야 한다 · 배차망에 따라 달라질 수 없다»)
     * 요금 · 상차 **전체 주소** · 하차 **전체 주소**(도보도). 전체 주소 판정은 `AddressForm` 한 곳 — 모자라면 서버에 보내지 않고 버린다.
     */
    fun meetsDetail(app: String, order: SimplifiedOfficeOrder): Boolean = missingDetail(app, order).isEmpty()

    /**
     * 📋 **목록 완독** — 요건에 **상차지거리**를 더한다(기사님 «상차지 거리를 찾는 건 공통»). 목록 줄에만 쓴다.
     * 거르는 게 아니라 **미루는 것**이다 — 덜 읽힌 줄은 그 스캔만 빼고 다음 스캔에 다시 본다.
     * 상세에서는 거리를 요구하지 않는다(손으로 연 상세·사진으로 만든 콜에는 거리가 없다) — 상세는 `meets`.
     */
    fun listComplete(order: SimplifiedOfficeOrder, allowsEmptyDropoff: Boolean): Boolean =
        meets(order, allowsEmptyDropoff) && firstPickupStop(order)?.distanceKm != null

    /**
     * 📋 **모자란 요건을 이름으로** — «요건 미달»만으로는 요금인지 주소인지 몰라 사진부터 다시 캐야 했다 (실물).
     * `meetsDetail` 은 이 목록이 비었는가다 — 한 규칙. 로그 «🧾 [값 못 채움]»과 이상 징후 사유에 실린다.
     * 주소는 판정 글자(`StopText.query` — `app` 배차망 정의 표로 다듬은 글자)로 본다.
     */
    fun missingDetail(app: String, order: SimplifiedOfficeOrder): List<String> = buildList {
        if (order.fare <= 0) add("요금 없음")
        val pickup = StopText.query(app, firstPickupStop(order))
        val dropoff = StopText.query(app, lastDropoffStop(order))
        if (!AddressForm.isFull(pickup)) add("상차 주소 짧음(${pickup.take(20)})")
        if (!AddressForm.isFull(dropoff)) add("하차 주소 짧음(${dropoff.take(20)})")
    }

    private fun filled(value: String): Boolean = value.isNotBlank()
}
