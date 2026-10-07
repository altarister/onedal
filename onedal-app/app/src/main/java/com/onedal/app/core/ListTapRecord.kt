package com.onedal.app.core

import com.onedal.app.core.engine.SessionManager
import com.onedal.app.models.ScreenContext
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📝 **목록에서 누르기에 성공한 뒤의 기록 — 콜 기억 · 알람 경로 · 세션을 바꾼다** (판단 `ListTapPick` 과 섞지 않는다 — 이쪽은 상태를 쓴다).
 * 누르기가 실패하면 부르지 않는다 — 세우면 화면은 목록 그대로라 «목록으로 돌아왔다» 리셋이 안 오고 다음 스캔부터 아무 콜도 못 누른다.
 */
object ListTapRecord {
    fun recordTapped(
        callMemory: CallMemory,
        alarmedRoutes: AlarmedRoutes,
        session: SessionManager,
        order: SimplifiedOfficeOrder,
        orderHash: Int,
        willContract: Boolean,
        nowMs: Long,
        tapAtMs: Long,
        foundAtMs: Long,
        screen: ScreenContext,
        page: String?,
    ) {
        /**
         * 📝 **누른 콜을 기억에 넣는다** — 앱이 들어간 콜만 기억한다(기사님 확정).
         * 누르기는 이 자리에서 바로 끝나고(동기), 목록 이벤트는 같은 줄 뒤에 오므로 그 사이에 끼지 않는다.
         * 넣지 않으면 목록으로 돌아오자마자 처음 보는 콜로 또 눌린다.
         * 🔴 «눌렀다»는 필터 버전이 바뀌어도 안 지워진다 (`CallMemory.markEvaluated`).
         */
        callMemory.markEvaluated(orderHash)
        alarmedRoutes.markOpened(order, nowMs)   // 🔔 요금만 올라도 다시 안 연다
        session.openedByApp = true // 콜 잡기 시작!
        // ✍️ 계약 버튼은 자동 모드 · 오늘 콜에서만 — 위 진입 줄과 같은 값 · 📅 상세에서 한 번 더: `appPressesAccept`
        session.contractedByApp = willContract
        session.setOrderId(order.id)
        session.lastDetailOrder = order // [오파싱 방지] 상세 진입 후 사용할 원본 데이터 쥐어주기
        /**
         * 🎯 **찍는 그 카드를 쥐여 둔다** — 앱이 직접 누르고 들어가는 판이라 어느 콜인지 이미 안다.
         * 픽커 사진 읽기가 이 카드와 엄격히 대조한다 (`detailOpener` 가 «알람이 연 상세»로 가른다).
         */
        session.alarmTappedCard = order
        session.alarmTappedAtMs = tapAtMs
        session.alarmFoundAtMs = foundAtMs
        session.alarmTappedScreen = screen   // 🧾 누른 화면 — «먼저 가져감» 기록의 화면 칸
        session.alarmTappedPage = page
        // 📊 서버 보고는 루프에서 이미 했다 (`markReportedOnce`) — 여기서 다시 보내지 않는다
    }
}
