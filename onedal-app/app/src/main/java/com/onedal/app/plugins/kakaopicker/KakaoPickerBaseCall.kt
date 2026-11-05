package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.engine.AddressForm
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageFieldRead
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

/**
 * 🎯 **픽커 화면 값을 기본 콜 칸에 담는다** (계획서 C2) — 칸 기준은 shared `call-fields.table`.
 * 찾은 칸만 담는다. 합치기는 서버가 한다.
 * 🔴 뜻이 섞인 옛 값(`itemSize` · `tagsText` · 차종 표식)은 지금 글자 그대로 담는다. 읽는 코드를 옮길 때 나눈다.
 * 🔴 사진 거리(직선)는 안 담는다 — 지금 판정의 `deliveryDistance` 값이 달라진다. 숫자 · 시각을 뽑는 칸도 뒤로 둔다.
 */
object KakaoPickerBaseCall {
    /**
     * @param listOrder 이 상세의 목록 콜 — 상세로 덮이지 않는다. 손으로 연 콜은 없을 수 있다
     * @param photo 사진 판독 결과 — 글자로 읽은 상세는 없다
     * @param detailText 상세 글 — 사진 판독 줄까지 모은 글
     */
    fun of(order: SimplifiedOfficeOrder, listOrder: SimplifiedOfficeOrder?, photo: PickerDetailFromImage?, detailText: String?): BaseCall {
        val texts = detailText?.takeIf { it.isNotBlank() }?.let { listOf(it) }
        fun read(field: PageField, part: String = "") = texts?.let { PageFieldRead.fieldOf(KakaoPickerPages.pages, Page.NEW_CALL, field, it, part) }
        val detailOnly = listOrder == null
        return BaseCall(
            id = order.id,
            targetApp = "kakaopicker",
            route = CallRoute(
                listRegion = listOrder?.let { CallRouteListRegion(pickup = it.pickup, dropoff = it.dropoff) },
                pickup = CallStop(addressDetail = order.pickup.takeIf { detailOnly || AddressForm.isFull(it) }, customerName = photo?.pickup?.place),
                dropoff = CallStop(addressDetail = order.dropoff.takeIf { detailOnly || AddressForm.isFull(it) }, customerName = photo?.dropoff?.place),
                pickupDistance = order.pickupDistance ?: listOrder?.pickupDistance,
                deliveryDistance = order.deliveryDistance,
            ),
            money = CallMoney(lines = if (order.fare > 0) listOf(MoneyLine(kind = "income", won = order.fare.toDouble())) else emptyList()),
            load = CallLoad(vehicleType = order.vehicleType, itemSize = order.itemSize, itemDescription = read(PageField.ITEM_SIZE)),
            time = CallTime(pickup = CallPromise(text = order.scheduleText, reserved = order.reserved, day = order.reservedDay?.toDouble(), at = order.reservedAt), dropoff = read(PageField.CLOCK, "dropoff")?.let { CallPromise(text = it) }),
            job = CallJob(tagsText = order.tagsText, detailMemo = read(PageField.MEMO)),
        )
    }
}
