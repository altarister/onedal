package com.onedal.app.core

import com.onedal.app.models.CallStop
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🚏 **콜의 정거장을 읽는 한 자리** — 원달앱 보고는 주소 · 약속 · 거리를 정거장 묶음에 싣는다.
 * shared `firstPickupStop` · `lastDropoffStop` · `stopTextOf`(`time/timing.ts` · `network/pageRead.ts`)의 원달앱 짝이다 — 같은 규칙.
 */

/** 🚏 첫 상차 정거장 — 상차 목록의 처음. 없으면 null */
fun firstPickupStop(o: SimplifiedOfficeOrder): CallStop? = o.pickupDetails.firstOrNull()

/** 🚏 마지막 하차 정거장 — 하차 목록의 끝. 없으면 null */
fun lastDropoffStop(o: SimplifiedOfficeOrder): CallStop? = o.dropoffDetails.lastOrNull()

/** ✏️ 첫 상차 정거장을 고친 콜 — 상차 목록이 비어 있으면 한 곳을 만든다 */
fun withFirstPickup(o: SimplifiedOfficeOrder, f: (CallStop) -> CallStop): SimplifiedOfficeOrder =
    o.copy(pickupDetails = listOf(f(o.pickupDetails.firstOrNull() ?: CallStop())) + o.pickupDetails.drop(1))

/** ✏️ 마지막 하차 정거장을 고친 콜 — 하차 목록이 비어 있으면 한 곳을 만든다 */
fun withLastDropoff(o: SimplifiedOfficeOrder, f: (CallStop) -> CallStop): SimplifiedOfficeOrder =
    o.copy(dropoffDetails = o.dropoffDetails.dropLast(1) + f(o.dropoffDetails.lastOrNull() ?: CallStop()))

object StopText {
    /** 🏠 이 정거장 글자 — 상세 주소(앞뒤 빈칸 뗌)가 있으면 그것, 없으면 목록 원문 · 둘 다 없으면 빈 글자 (shared `stopTextOf`) */
    fun of(stop: CallStop?): String =
        stop?.addressDetail?.trim()?.ifEmpty { null } ?: stop?.listText?.ifEmpty { null } ?: ""
}
