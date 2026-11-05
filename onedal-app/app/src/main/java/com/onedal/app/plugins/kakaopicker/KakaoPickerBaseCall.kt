package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.BaseCallFill
import com.onedal.app.core.PageField
import com.onedal.app.models.BaseCall
import com.onedal.app.models.CallJob
import com.onedal.app.models.CallLoad
import com.onedal.app.models.CallMoney
import com.onedal.app.models.CallPromise
import com.onedal.app.models.CallRoute
import com.onedal.app.models.CallStop
import com.onedal.app.models.CallTime
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🎯 **픽커 화면 값을 기본 콜 칸에 담는다** (계획서 C2) — 칸 기준은 shared `call-fields.table`.
 * 찾은 칸만 담는다. 합치기는 서버가 한다.
 * 🔴 뜻이 섞인 옛 값(`itemSize` · `tagsText` · 차종 표식)은 지금 글자 그대로 담는다. 읽는 코드를 옮길 때 나눈다.
 * 🔴 사진 배송 거리는 안 담는다 — 지금 판정의 `deliveryDistance` 값이 달라진다. 사진 픽업 거리는 목록 줄이 없을 때만 담는다. 페이지 표에 읽는 법이 없는 숫자 · 시각도 뒤로 둔다.
 */
object KakaoPickerBaseCall {
    /**
     * @param listOrder 이 상세의 목록 콜 — 상세로 덮이지 않는다. 손으로 연 콜은 없을 수 있다
     * @param photo 사진 판독 결과 — 글자로 읽은 상세는 없다
     * @param detailText 상세 글 — 사진 판독 줄까지 모은 글
     */
    fun of(order: SimplifiedOfficeOrder, listOrder: SimplifiedOfficeOrder?, photo: PickerDetailFromImage?, detailText: String?): BaseCall {
        val fill = BaseCallFill(KakaoPickerPages.pages, order, listOrder, detailText)
        return BaseCall(
            id = order.id,
            targetApp = "kakaopicker",
            route = CallRoute(
                listRegion = fill.listRegion,
                pickup = CallStop(addressDetail = fill.address(order.pickup), customerName = photo?.pickup?.place),
                dropoff = CallStop(addressDetail = fill.address(order.dropoff), customerName = photo?.dropoff?.place),
                pickupDistance = order.pickupDistance ?: listOrder?.pickupDistance ?: photo?.pickup?.straightKm,
                deliveryDistance = order.deliveryDistance,
            ),
            money = CallMoney(lines = listOfNotNull(fill.fareLine("income"))),
            load = CallLoad(vehicleType = order.vehicleType, itemSize = order.itemSize, itemDescription = fill.read(PageField.ITEM_SIZE)),
            time = CallTime(pickup = fill.pickupPromise(by = fill.read(PageField.CLOCK, "pickup")), dropoff = fill.read(PageField.CLOCK, "dropoff")?.let { CallPromise(by = it) }),
            job = CallJob(tagsText = order.tagsText, detailMemo = fill.read(PageField.MEMO)),
        )
    }
}
