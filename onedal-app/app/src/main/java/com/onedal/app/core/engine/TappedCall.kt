package com.onedal.app.core.engine

import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.core.firstPickupStop
import com.onedal.app.core.lastDropoffStop
import com.onedal.app.core.StopText

/**
 * 🎯 **«누른 그 콜인가» — 세 배차망 같은 한 검증** (기사님 «'누른 그 콜인가' 확인은 공통으로»)
 *
 * ⚠️ **식별과 검증은 다른 일이다.** «앱이 누른 목록 줄은 상세에서 되찾지 않는다»(옛 결정)는 **식별**(어느 콜인가 — 누를 때 쥔 줄 `alarmTappedCard`)이고,
 *    여기는 **검증**(열린 상세가 그 줄이 맞나)이다. 상세에서 얻은 전체 주소에 목록 줄의 동 토막이 들어 있는지 본다.
 * 목록 줄 쪽은 판정 글자(`StopText.query` — 칸 원문에서 약속 · 조건 토막을 뗀 글자)로 본다: 칸 원문 «급송/초월읍»의 마지막 토막은 상세 주소에 없다.
 * 상세 쪽은 정거장 글자(`StopText.of` — 채운 상세 주소가 먼저: 인성 팝업 «위치» · 플렉스 상세 원문 · 픽커 사진 행정동 · 화물24시 상세 칸 주소). 필수 요소 대조가 이 확인보다 앞이라 상세 주소가 빈 콜은 여기까지 오지 않는다.
 * 목록 줄에 하차가 없으면(도보) 하차는 대조하지 않는다. 손으로 연 상세(누른 줄 없음)는 검증할 것이 없다.
 * ⚠️ 한계: 상세 주소가 도로명(«…로 12»)이면 동 토막이 없어 어긋난다고 판정된다(`AddressForm` 은 도로명을 전체 주소로 인정한다 — 두 판정이 다르다).
 *    시뮬레이터 장소에도 도로명 상세가 섞여 있어 그 콜은 자동 모드에서 확정을 누르지 않는다 — 설명서 주의(후보: 동이 없으면 목록 줄의 시·군 토막으로 한 번 더).
 */
object TappedCall {
    /** 어긋나면 그 까닭, 맞으면 null · `app` 은 배차망 코드(판정 글자 다듬기가 정의 표를 읽는다) */
    fun mismatch(app: String, tapped: SimplifiedOfficeOrder, detail: SimplifiedOfficeOrder): String? {
        val tappedPickup = StopText.query(app, firstPickupStop(tapped))
        val tappedDropoff = StopText.query(app, lastDropoffStop(tapped))
        val pickupOk = dongMatch(tappedPickup, StopText.of(firstPickupStop(detail)))
        val dropoffOk = dongMatch(tappedDropoff, StopText.of(lastDropoffStop(detail)))
        return if (pickupOk && dropoffOk) null
        else "주소 불일치 (누른 줄: $tappedPickup→$tappedDropoff / 상세: ${StopText.of(firstPickupStop(detail))}→${StopText.of(lastDropoffStop(detail))})"
    }

    /** 목록 줄 글자의 마지막 토막(동·읍·면·리 접미를 뗀 것)이 상세 주소에 있나. 목록 줄이 비었으면 대조할 것이 없다 */
    fun dongMatch(cardText: String, detailText: String): Boolean {
        val tokens = cardText.split(' ', '·').map { it.trim() }.filter { it.length >= 2 }
        if (tokens.isEmpty()) return true
        val lastToken = tokens.last()
        val cleanDong = lastToken.removeSuffix("동").removeSuffix("읍").removeSuffix("면").removeSuffix("리")
        return if (cleanDong.length >= 2) detailText.contains(cleanDong, ignoreCase = true)
        else detailText.contains(lastToken, ignoreCase = true)
    }
}
