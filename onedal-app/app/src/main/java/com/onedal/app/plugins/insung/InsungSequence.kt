package com.onedal.app.plugins.insung

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.AppLogger
import com.onedal.app.core.TargetApp
import com.onedal.app.core.engine.ScanContext
import com.onedal.app.core.engine.SessionManager
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🔴 **인성 잡기 수순 — 여기가 그 집이다** (2026-09-02 신설 · 기획/배차망_통합.md §4).
 *
 * 인성 전용 수순(상세·확정·팝업 3종 · 약 636줄)이 오랫동안 `HijackService` 안에 있었다.
 * 배차망을 계속 붙이려면 그게 나와야 한다 — **공통 코드가 인성 화면을 알면 안 된다.**
 *
 * ── 어떻게 옮기나 ──
 * `ScanContext` 의 **확장 함수**로 둔다. 그러면 본문의 `session`·`collectMachine`·
 * `currentTargetApp` 이 **수신자에서 그대로 풀려서**, 본문을 한 줄도 안 고치고 옮겨진다.
 * 부르는 쪽도 `handleMemoPopup(rootNode, texts)` 그대로다 (`HijackService` 가 `ScanContext`
 * 를 구현하므로 자기 자신이 수신자다).
 *
 * ── 지금 여기 있는 것 ──
 * 팝업 하나만 먼저 옮겼다. **묶음(`ScanContext`)이 실제로 도는지 증명하려는 것**이고,
 * 나머지(상세·확정·팝업 둘·약 630줄)는 이 증명이 게이트를 통과한 뒤에 따라온다.
 *
 * 🔴 **본문은 옮기기 전과 한 글자도 다르지 않다.** 다른 것은 «어디에 사는가»뿐이다.
 */

/** 로그 태그 — `HijackService` 가 쓰던 것과 같은 값이라 로그가 갈라지지 않는다 */
private const val TAG = "1DAL_MVP"

/** 적요 팝업 — 인성에만 있는 화면이다 */
fun ScanContext.handleMemoPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
    // 🚧 인성 전용 구간 — 인성 잡기 수순 (픽커_수집.md §3-확장)
    if (!TargetApp.supportsCatching(currentTargetApp)) return
    collectMachine.handleMemoPopup(rootNode, session, screenTexts)
}

fun ScanContext.handlePickupPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
    // 🚧 인성 전용 구간 — 인성 잡기 수순 (픽커_수집.md §3-확장)
    if (!TargetApp.supportsCatching(currentTargetApp)) return
    collectMachine.handlePickupPopup(rootNode, session, screenTexts)
}

fun ScanContext.handleDropoffPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
    // 🚧 인성 전용 구간 — 인성 잡기 수순 (픽커_수집.md §3-확장)
    if (!TargetApp.supportsCatching(currentTargetApp)) return
    val multilineScreenStr = screenTexts.joinToString("\n")

    // ═══════════════════════════════════════════════════════════
    // 🚨 [확정 전 3단계 검증] 도착지 팝업에서 상위 지역 대조
    // ═══════════════════════════════════════════════════════════
    if (session.cautionAction == "VERIFY") {
        if (!multilineScreenStr.contains("전화1")) {
            AppLogger.d(TAG, "거짓 이벤트 무시: 아직 도착지 팝업 데이터 로딩 안됨")
            return
        }
        AppLogger.w(TAG, "⚠️ [3단계 검증] 확정 전 도착지 팝업에서 상위 지역 대조 시작!")
        val cityFilters = cautionVerifier.loadCityFilters()
        val isCityMatch = cautionVerifier.verifyCityMatch(multilineScreenStr, cityFilters)

        if (isCityMatch) {
            AppLogger.d(TAG, "✅ [3단계 통과] 진짜 우리 동네 확인!")
            session.cautionAction = "ACCEPT"
        } else {
            AppLogger.w(TAG, "❌ [3단계 적발] 동명이동!")
            session.cautionAction = "CANCEL"
        }
        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        return  // 서버 전송 안 함. 상세 화면 복귀 대기.
    }
    // ═══════════════════════════════════════════════════════════

    // 상세 수집 모드: 도착지 텍스트 수집 → /detail 전송
    val collectDone = collectMachine.handleDropoffPopup(rootNode, session, screenTexts)
    if (!collectDone) return

    // /detail 서버 전송 (팝업 수집 완료)
    session.lastDetailOrder?.let { order ->
        /**
         * 👀 **미리보기는 선점을 여기서 처음 보낸다** (기사님 확정 2026-08-22).
         *
         * 손으로 연 상세는 confirm 을 미뤄 두고 팝업 3장을 먼저 읽었다. 서버는 confirm
         * 으로 콜을 만들고 detail 로 승급하므로 **순서가 뒤집히면 안 된다** — 여기서
         * 먼저 보낸다. 이미 보냈으면(`isDetailScrapSent`) 아무 일도 하지 않는다.
         */
        sendConfirmOnce(order, session.accumulatedDetailText)
        sendDetail(order)
    }
}

/**
 * 🏄 **상세 수집을 한 칸 진행한다** — 팝업이 닫혀 상세/확정 화면으로 돌아왔을 때.
 *
 * 🔴 확정 화면과 **확정 전 상세**가 같은 규칙을 쓴다. 두 곳에 나눠 적으면 한쪽만
 *    고쳐져 갈라진다 — 이 레포가 반복해서 겪은 「목록을 손으로 나열」이다.
 *    새 팝업 단계가 생기면 **여기에만** 더한다.
 */
fun ScanContext.advanceCollect(rootNode: AccessibilityNodeInfo) {
    when (session.collectState) {
        SessionManager.CollectState.WAITING_FOR_PICKUP_POPUP -> collectMachine.clickPickup(rootNode)
        SessionManager.CollectState.WAITING_FOR_DROPOFF_POPUP -> collectMachine.clickDropoff(rootNode)
        else -> {}   // IDLE·WAITING_FOR_MEMO·DONE — 여기서 할 일이 없다
    }
}

/** 팝업 잔상이 화면에 남아있는지 검사 */
fun ScanContext.isPopupResidue(rawScreenStr: String): Boolean {
    val resid = screenDetector.isPopupResidue(rawScreenStr)
    if (resid) AppLogger.roadmap("✋ [Race Condition 방어] 출발지/도착지 팝업 닫힘 애니메이션 잔상 대기", telemetryManager.currentScreenContext.name)
    return resid
}

/** 화면 텍스트에서 SimplifiedOfficeOrder 를 생성하는 공통 로직 */
fun ScanContext.buildOrderFromScreen(screenTexts: List<String>): SimplifiedOfficeOrder {
    val tempOrder = scrapParser.parse(screenTexts)
    /**
     * 🔴 **출신은 스위치가 아니라 «누가 눌렀나» 다** (2026-08-30 · 규칙 ③).
     *
     * 예전엔 여기서 `telemetryManager.currentMode` 를 썼다. 이 길은 **손으로 확정한
     * 콜**의 길인데(앱이 잡았으면 `lastDetailOrder` 가 이미 있다) 스위치를 찍는 바람에,
     * 자동 스위치인 채 손으로 확정하면 `"AUTO_CLICK"` 이 됐다 —
     * 서버의 직접콜 보호가 안 걸려 **리스트 복귀 때 기사님의 콜이 강제 취소**됐다.
     * 알람 모드에서는 서버가 모르는 `"ALARM_CLICK"` 까지 태어났다.
     */
    return SimplifiedOfficeOrder(
        id = session.currentOrderId,
        type = "${session.clickOrigin}_CLICK",
        /**
         * 🔴 **상세 화면 글자를 리스트 파서 결과 그대로 믿지 않는다** (2026-08-25 실측).
         *
         * `parse()` 는 *"첫 번째 유효 지역 = 상차지, 두 번째 = 하차지"* 로 읽는데
         * 그건 **리스트에서만 참**이다. 손으로 연 상세에서는 배치가 달라
         * 상차지 **«다마스»** · 하차지 **«계산서필»** 이 장부에 남았다.
         *
         * 직접콜은 서버가 심사하지 않으므로(규칙 ①) 그 값이 **경로의 기점**이 된다.
         * 주소 꼴이 아니면 «배차값없음» 으로 둔다 — 뒤따르는 상세 수집이 진짜 주소를
         * 채운다. 모르면 모른다고 두는 것이 지어내는 것보다 낫다 (규칙 ④).
         */
        pickup = tempOrder.pickup.takeIf {
            it.isNotBlank() && it != "배차값없음" && InsungParser.looksLikeAddress(it)
        } ?: "배차값없음",
        dropoff = tempOrder.dropoff.takeIf {
            it.isNotBlank() && it != "배차값없음" && InsungParser.looksLikeAddress(it)
        } ?: "배차값없음",
        fare = tempOrder.fare,
        timestamp = nowTimestamp(),
        rawText = screenTexts.joinToString(" ")
    )
}
