package com.onedal.app.core

import com.onedal.app.models.BaseCall
import com.onedal.app.models.CallJob
import com.onedal.app.models.CallLoad
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallPromise
import com.onedal.app.models.CallRoute
import com.onedal.app.models.CallRouteListRegion
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallTime
import com.onedal.app.models.MoneyLine
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.models.CallEvidence
import com.onedal.app.models.EvidenceLine

/**
 * 🎯 **보고에 실을 기본 콜 조각을 만든다** (계획서 C1 · F2-b).
 * 값은 플러그인이 채우고 합치기는 서버(`mergeBaseCall`) 한 곳에서 한다 — 앱은 보고마다 찾은 값만 보낸다.
 * 🔴 보고에는 늘 기본 콜이 실린다(order 를 안 보낸다). 플러그인이 못 채우거나 조립이 터지면 앱 안 평평 콜로 최소 기본 콜을 만든다 —
 *    보고가 빈 콜이 되면 서버가 «못 읽음»으로 처리하고 픽커 알람이 빈다.
 * 🔴 화면 기록은 조립과 따로 만든다 — 조립이 터져도 «이 콜을 읽었다»는 기록은 간다.
 */
object BaseCallReport {
    data class Part(val baseCall: BaseCall, val evidence: CallEvidence? = null)

    /** 종류를 모르는 요금 줄의 이름 — 서버 `fareOf` · `fareWonOf` 가 마지막 대체로 읽는다(shared OLD_FARE_LABEL 과 같은 글자) */
    const val OLD_FARE_LABEL = "옛 요금"

    /**
     * @param order 보낼 콜 — 번호는 이미 붙어 있다(`SessionManager.withOrderId`)
     * @param seenText 이 보고가 읽은 화면 글자 — 첫 보고는 누른 콜의 목록 줄, 상세 보고는 상세 글. 기록에는 이 한 줄만 간다
     * @param screen 그 글자가 나온 화면
     * @param read 읽은 방법 — 글자(text) · 사진(photo)
     */
    fun partOf(order: SimplifiedOfficeOrder, targetApp: String, seenText: String?, screen: String = "newList", read: String = "text", fill: () -> BaseCall?): Part {
        val evidence = seenText?.takeIf { it.isNotBlank() }?.let { CallEvidence(seen = listOf(EvidenceLine(at = order.timestamp, screen = screen, read = read, rawText = it))) }
        val filled = try {
            fill()?.copy(id = order.id)   // 번호는 보내기 직전에 정해진다
        } catch (e: Throwable) {   // TODO() · 재귀 넘침 · 초기화 실패는 Exception 이 아니다
            if (LogOnce.changed("baseCall-failed", e.javaClass.name)) AppLogger.w("BaseCallReport", "🎯 [기본 콜 조립 실패] 평평 콜로 최소 기본 콜을 보낸다 — ${e.message}")
            null
        }
        val call = filled ?: minimalOf(order, targetApp)
        if (LogOnce.changed("baseCall-part", "${call.id}/$screen")) {
            AppLogger.d("BaseCallReport", LogTag.CALL_STAGE, "🎯 [기본 콜] ${call.targetApp} ${call.id.take(8)} $screen — ${if (filled == null) "최소 기본 콜(평평 콜에서)" else "플러그인"} · 요금 줄 ${call.money.lines.size} · 상세 주소 ${!call.route.pickup.addressDetail.isNullOrBlank()}")
        }
        return Part(call, evidence)
    }

    /**
     * 🧯 **최소 기본 콜** — 플러그인이 못 채울 때 앱 안 평평 콜에서. 상차 · 하차 · 요금 · 차종 · 예약 · 거리 · 꼬리표만.
     * 요금 종류는 모른다 — «옛 요금» 한 줄. 배차망 이름으로 가르지 않는다.
     */
    fun minimalOf(order: SimplifiedOfficeOrder, targetApp: String): BaseCall {
        fun full(text: String) = text.takeIf { com.onedal.app.core.engine.AddressForm.isFull(it) }
        fun short(text: String) = text.takeIf { it.isNotBlank() && full(it) == null }
        val region = CallRouteListRegion(pickup = short(order.pickup), dropoff = short(order.dropoff)).takeIf { it.pickup != null || it.dropoff != null }
        return BaseCall(
            id = order.id,
            targetApp = targetApp,
            route = CallRoute(listRegion = region, pickup = CallStop(addressDetail = full(order.pickup)), dropoff = CallStop(addressDetail = full(order.dropoff)),
                pickupDistance = order.pickupDistance, deliveryDistance = order.deliveryDistance),
            money = CallMoney(lines = listOfNotNull(order.fare.takeIf { it > 0 }?.let { MoneyLine(kind = "unknown", won = it.toDouble(), label = OLD_FARE_LABEL) })),
            load = CallLoad(vehicleType = order.vehicleType),
            time = CallTime(pickup = CallPromise(text = order.scheduleText, reserved = order.reserved, day = order.reservedDay?.toDouble(), at = order.reservedAt)),
            job = CallJob(tagsText = order.tagsText),
        )
    }
}
