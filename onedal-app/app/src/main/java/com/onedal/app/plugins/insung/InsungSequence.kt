package com.onedal.app.plugins.insung

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.LogTag
import com.onedal.app.core.AppLogger
import com.onedal.app.core.engine.ScanContext
import com.onedal.app.core.engine.SessionManager
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🔴 **인성 잡기 수순 — 여기가 그 집이다**.
 *
 * 인성 전용 수순(상세·확정·팝업 3종)을 여기 둔다 — **공통 코드가 인성 화면을 알면 안 된다.**
 *
 * `ScanContext` 의 **확장 함수**로 둔다. 본문의 `session`·`collectMachine`·`currentTargetApp` 이
 * **수신자에서 그대로 풀리고**, 부르는 쪽도 `handleMemoPopup(rootNode, texts)` 그대로다
 * (`HijackService` 가 `ScanContext` 를 구현하므로 자기 자신이 수신자다).
 */

/** 로그 태그 — `HijackService` 가 쓰던 것과 같은 값이라 로그가 갈라지지 않는다 */
private const val TAG = "1DAL_MVP"

/** 적요 팝업 — 인성에만 있는 화면이다 */
fun ScanContext.handleMemoPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
    collectMachine.handleMemoPopup(rootNode, session, screenTexts, InsungKeywords.POPUP_FILL)
}

fun ScanContext.handlePickupPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
    collectMachine.handlePickupPopup(rootNode, session, screenTexts, InsungKeywords.POPUP_FILL)
}

fun ScanContext.handleDropoffPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {

    // 도착지 텍스트까지 모으면 채우기 끝 — 보내지 않는다. 팝업이 닫혀 상세로 돌아오면 공통 순서가 보낸다
    // (2차 필터 → 선점 보고 → 확정 또는 미리보기 · 배차망_모드표.md 순서 ⑤~⑦)
    val collectDone = collectMachine.handleDropoffPopup(rootNode, session, screenTexts, InsungKeywords.POPUP_FILL)
    if (!collectDone) return
    val tookMs = android.os.SystemClock.elapsedRealtime() - session.fillStartedAtMs
    AppLogger.i(TAG, LogTag.CALL_STAGE, "📏 [채우기] 팝업 3장 ${tookMs}ms — 상세로 돌아오면 보낸다 (다음 상세 통과를 기다린다)")
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
        SessionManager.CollectState.WAITING_FOR_PICKUP_POPUP -> collectMachine.clickPickup(rootNode, InsungKeywords.POPUP_FILL)
        SessionManager.CollectState.WAITING_FOR_DROPOFF_POPUP -> collectMachine.clickDropoff(rootNode, InsungKeywords.POPUP_FILL)
        else -> {}   // IDLE·WAITING_FOR_MEMO·DONE — 여기서 할 일이 없다
    }
}

/** 팝업 잔상이 화면에 남아있는지 검사 */
fun ScanContext.isPopupResidue(rawScreenStr: String): Boolean {
    val resid = screenDetector.isPopupResidue(rawScreenStr)
    if (resid) AppLogger.roadmap(LogTag.SCREEN, "✋ [Race Condition 방어] 출발지/도착지 팝업 닫힘 애니메이션 잔상 대기", telemetryManager.currentScreenContext.name)
    return resid
}

/** 화면 텍스트에서 SimplifiedOfficeOrder 를 생성하는 공통 로직 */
fun ScanContext.buildOrderFromScreen(screenTexts: List<String>): SimplifiedOfficeOrder {
    val tempOrder = scrapParser.parse(screenTexts)
    /**
     * 🔴 **출신은 스위치가 아니라 «누가 눌렀나» 다** (규칙 ③).
     *
     * 이 길은 **손으로 확정한 콜**의 길이다(앱이 잡았으면 `lastDetailOrder` 가 이미 있다).
     * 스위치(`telemetryManager.currentMode`)를 찍으면 자동 스위치인 채 손으로 확정한 콜이 `"AUTO_CLICK"` 이 되어
     * 서버의 직접콜 보호가 안 걸리고 **리스트 복귀 때 기사님의 콜이 강제 취소**된다.
     */
    return SimplifiedOfficeOrder(
        id = session.currentOrderId,
        type = "${session.clickOrigin}_CLICK",
        /**
         * 🔴 **상세 화면 글자를 리스트 파서 결과 그대로 믿지 않는다**.
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

fun ScanContext.handleConfirmedScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
    // 잔상 방어
    if (isPopupResidue(rawScreenStr)) return

    /**
     * 👀 **미리보기로 보다가 확정을 눌렀다 — 딱지를 벗고 서버에 알린다**
     * (기사님 실측 18:57).
     *
     * 기사님: *"관제엡의 노랑색을 보고 확정을 눌렀어. 그런데 관제엡은 내가 생각한 것과
     * 다르게 움직이고 있어. 싱크가 전혀 안 되는 것 같아."*
     *
     * 🔴 확정 화면에 들어와도 **아무 요청도 안 나갔다.** 아래 상세 수집 분기는 `IDLE` 일 때만
     *    일하는데 미리보기는 이미 `DONE` 이고, `sendConfirmOnce` 는 중복 방지에 막혔다.
     *    그래서 서버는 여전히 "미리보기"로 알고 30초 뒤 정리해 버렸다 — 기사님은 잡았는데.
     *
     * 팝업은 **다시 열지 않는다.** 방금 읽은 텍스트(`accumulatedDetailText`)가 그대로 있다.
     *
     * 🔴 **선점 보고(`confirm`)는 다시 하지 않는다** (기사님 지적 · H안).
     *    `confirm` 은 *"이런 콜을 발견했습니다"* 이고 같은 콜을 두 번 발견할 수는 없다.
     *    확정은 **같은 콜의 상태가 바뀐 것**이라 `detail` 하나로 알린다. 서버의
     *    `evolveOrder` 가 세션의 콜을 이어받고, 없으면 payload 로 만든다 — 콜을 잃지 않는다.
     *    덤으로 확정 구간에 요청이 하나뿐이라 **순서 경쟁 자체가 사라진다.**
     */
    if (session.isPreview) {
        session.isPreview = false
        AppLogger.roadmap(LogTag.CALL_STAGE, "👀 [미리보기 → 확정] 기사님이 확정을 눌렀다 — 딱지를 벗고 서버에 알린다 (상세만)",
            telemetryManager.currentScreenContext.name)
        session.lastDetailOrder?.let { order -> sendDetail(order) }
        return
    }

    // ✋ 보고 보류 콜(손으로 열었고 전체 주소를 못 채움) — 기사님이 확정하셨다. 기사님이 잡은 콜이라 짧은 주소로라도 상세 보고한다 (기사님 «가»)
    if (session.heldUnfilled) {
        session.heldUnfilled = false
        AppLogger.w("1DAL_INSUNG", LogTag.CALL_STAGE, "✋ [보고 보류 → 확정] 전체 주소를 못 채운 콜을 기사님이 확정하셨다 — 그대로 상세 보고")
        session.lastDetailOrder?.let { order -> sendDetail(order) }
        return
    }

    // 이미 보고한 콜(앱이 채우고 확정한 콜) — 확정 화면에서 할 일이 없다
    if (session.isDetailScrapSent) return

    /**
     * 🏄 **드문 경우 — 채우기가 끝나기 전에 기사님이 확정을 눌렀다.** 여기서 마저 채우고 상세 보고만 한다.
     * 선점 보고는 하지 않는다(확정은 같은 콜의 상태가 바뀐 것 — 서버 `evolveOrder` 가 상세 보고로 콜을 만든다).
     * 보낸 뒤 «보고했다»를 직접 켠다 — 상세 보고는 그 표시를 켜지 않아, 안 켜면 확정 화면을 읽을 때마다 다시 보낸다.
     */
    when (session.collectState) {
        SessionManager.CollectState.IDLE -> {
            ensureSessionId()
            if (session.lastDetailOrder == null) session.lastDetailOrder = buildOrderFromScreen(screenTexts)
            session.fillStartedAtMs = android.os.SystemClock.elapsedRealtime()
            collectMachine.startCollect(rootNode, session, screenTexts, InsungKeywords.POPUP_FILL)
        }
        SessionManager.CollectState.DONE -> {
            session.lastDetailOrder?.let { order -> sendDetail(order) }
            session.isDetailScrapSent = true
        }
        else -> advanceCollect(rootNode)
    }
}

/**
 * 🔒 **인성 채우기 — 누가 열었든 · 어느 모드든 팝업 3장으로 채운 뒤에 공통 순서로 넘긴다** (기사님 확정).
 *
 * 인성은 목록에 전체 주소가 없어서 상세의 팝업 3장(적요 → 출발지 → 도착지)으로 콜 값을 채운다.
 * 다 채우면 `false` 를 돌려 공통 순서(2차 필터 → 선점 보고 → 확정 또는 미리보기)가 이어받는다.
 * 이름이 같은 다른 지역 동은 따로 둘 단계가 아니다 — 도착지 팝업에 시·군·구가 있고, 판정은 2차 필터의 동 이름 대조
 * (`RegionMatch` · 동 바로 앞의 다른 시·군·구)에서 한다.
 *
 * @return true 이면 채우는 중이라 공통 순서를 건너뛴다
 */
fun ScanContext.handleInsungPreConfirmExecution(
    rootNode: AccessibilityNodeInfo,
    screenTexts: List<String>,
): Boolean = when (session.collectState) {
    SessionManager.CollectState.IDLE -> {
        session.fillStartedAtMs = android.os.SystemClock.elapsedRealtime()
        AppLogger.roadmap(LogTag.CALL_STAGE, "🏄 [채우기] 팝업 3장을 먼저 읽는다 — 채운 뒤에 보고·확정", telemetryManager.currentScreenContext.name)
        collectMachine.startCollect(rootNode, session, screenTexts, InsungKeywords.POPUP_FILL)
        true
    }
    SessionManager.CollectState.DONE -> false
    else -> {
        // 팝업이 닫혀 상세로 돌아왔다 — 다음 팝업을 연다
        advanceCollect(rootNode)
        true
    }
}
