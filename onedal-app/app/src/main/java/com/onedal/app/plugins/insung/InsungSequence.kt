package com.onedal.app.plugins.insung

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.AppLogger
import com.onedal.app.core.TargetApp
import com.onedal.app.core.engine.CautionDongVerifier
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
         * 👀 **미리보기는 선점을 여기서 처음 보낸다** (기사님 확정).
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
    // 🚧 인성 전용 구간 — 인성 잡기 수순 (픽커_수집.md §3-확장)
    // 🚧 인성 전용 구간 — 픽커의 «수락됨» 판정은 여기가 아니라 화면 판별 직후에 있다
    //    (실물 덤프상 픽커 상세 낱말은 전부 «수락 전» 표식이라 분류로는 못 잡는다)
    if (!TargetApp.supportsCatching(currentTargetApp)) return
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
        AppLogger.roadmap("👀 [미리보기 → 확정] 기사님이 확정을 눌렀다 — 딱지를 벗고 서버에 알린다 (상세만)",
            telemetryManager.currentScreenContext.name)
        session.lastDetailOrder?.let { order -> sendDetail(order) }
        return
    }

    // 확정 화면에 처음 진입했을 때 상세 수집 시작! (적요상세 → 출발지 → 도착지 순서)
    if (session.collectState == SessionManager.CollectState.IDLE) {
        AppLogger.roadmap("🔒 [Current Page: DETAIL_CONFIRMED] 진입, isHolding=true 설정", telemetryManager.currentScreenContext.name)
        AppLogger.roadmap("🏄‍♂️ 상세 수집 가동 (State Machine: IDLE → 팝업버튼 트리거 대기)", telemetryManager.currentScreenContext.name)
        ensureSessionId()
        
        if (session.lastDetailOrder == null) {
            session.lastDetailOrder = buildOrderFromScreen(screenTexts)
        }

        /**
         * 👀 확정을 눌렀으니 **미리보기가 아니다.** 여기서 딱지를 벗는다.
         *    손으로 연 상세에서 미리보기로 판정을 받아 본 뒤 확정을 누른 경우가 이 길이다.
         *    🔴 딱지는 **벗겨지기만 한다** — 잡은 콜을 안 잡은 것으로 되돌리면 취소
         *    카운트가 새고, 그건 배차망 10회 패널티와 어긋난다.
         */
        session.isPreview = false

        collectMachine.startCollect(rootNode, session, screenTexts)
    }
    // 상세 수집 중: 팝업이 닫혀 확정 화면으로 돌아왔다 — 다음 팝업을 연다
    else {
        advanceCollect(rootNode)
    }
}

/**
 * 🔒 **인성 전용 확정 전 수순 집행부**
 *
 * 상세 공통 관문(`handlePreConfirmScreen`)에서 호출되며,
 * 인성 고유의 팝업 3장 수집(손으로 연 상세) 및 동명이동 검증(3단계 팝업)을 집행한다.
 * @return true 이면 팝업/확정 클릭 등 인성 전용 분기가 처리되었으므로 공통 2차 필터 판정 및 확정 과정을 건너뛴다.
 */
fun ScanContext.handleInsungPreConfirmExecution(
    rootNode: AccessibilityNodeInfo,
    screenTexts: List<String>,
    finalOrder: SimplifiedOfficeOrder
): Boolean {
    // 1. 손으로 연 상세는 팝업 3장을 먼저 읽는다 (기사님 확정)
    if (!session.isAutoActive && session.collectState == SessionManager.CollectState.IDLE) {
        session.isPreview = true
        AppLogger.roadmap("👀 [미리보기] 손으로 연 상세 — 팝업 3장을 먼저 읽고 판정을 받는다", telemetryManager.currentScreenContext.name)
        collectMachine.startCollect(rootNode, session, screenTexts)
        return true   // confirm 은 상세 수집이 끝난 뒤에 detail 과 함께 나간다
    }

    // 상세 수집 중 팝업이 닫혀 상세로 돌아온 경우 — 다음 팝업을 연다
    if (session.isPreview && session.collectState != SessionManager.CollectState.DONE) {
        advanceCollect(rootNode)
        return true
    }

    // 2. 3단계 팝업에서 돌아온 경우 (동명이동 검증 결론 집행 · #82)
    if (session.isAutoActive) {
        when (session.cautionAction) {
            "ACCEPT" -> {
                session.cautionAction = null
                AppLogger.d(TAG, "✅ [3단계 통과] 진짜 우리 동네! 확정 클릭!")
                AppLogger.roadmap("상세페이지에서 확정 버튼 클릭 (동명이동 3단계 검증 통과)", telemetryManager.currentScreenContext.name)
                AppLogger.roadmap("[${keywords.appLabel}] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                clickFirstMatchingButton(rootNode, keywords.confirmKeywords)
                return true
            }
            "CANCEL" -> {
                session.cautionAction = null
                AppLogger.w(TAG, "❌ [3단계 적발] 동명이동! 패널티 없이 취소!")
                AppLogger.roadmap("상세페이지에서 '${keywords.cancelKeyword}' 클릭 (동명이동 3단계 적발)", telemetryManager.currentScreenContext.name)
                if (!touchManager.findAndClickByText(rootNode, keywords.cancelKeyword, isStartsWith = true)) {
                    touchManager.performBack()
                }
                AppLogger.roadmap("리스트 페이지 진입 (동명이동 회피 성공)", telemetryManager.currentScreenContext.name)
                resetSessionState()
                return true
            }
        }
    }

    // 3. AUTO 모드 최초 진입 시 도착지가 동명이동 주의 동네인지 확인
    if (session.isAutoActive) {
        val dropoffWords = finalOrder.dropoff.split("\\s+".toRegex())
        val isCautionDong = CautionDongVerifier.CAUTION_DONGS.any { dong -> dropoffWords.any { it == dong } }

        if (isCautionDong) {
            // [2단계] 화면에 상위 지역이 이미 보이는지 확인
            val cityFilters = cautionVerifier.loadCityFilters()
            val screenStr = screenTexts.joinToString(" ")
            val hasCityOnScreen = cityFilters.any { screenStr.contains(it, ignoreCase = true) }

            if (hasCityOnScreen) {
                // 2단계 통과! 화면에 상위 지역이 이미 적혀있음 → 즉시 확정
                AppLogger.d(TAG, "✅ [2단계 통과] 화면에서 상위 지역 확인! 즉시 확정!")
                AppLogger.roadmap("상세페이지에서 확정 버튼 클릭 (동명이동 2단계 통과)", telemetryManager.currentScreenContext.name)
                AppLogger.roadmap("[${keywords.appLabel}] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                clickFirstMatchingButton(rootNode, keywords.confirmKeywords)
                return true
            } else {
                // 2단계 보류 → 3단계(팝업) 돌입!
                AppLogger.w(TAG, "⚠️ [3단계 돌입] 화면에 상위 지역 없음! 도착지 팝업 호출!")
                session.cautionAction = "VERIFY"
                touchManager.findAndClickByText(rootNode, "도착지", isStartsWith = true)
                return true
            }
        }
    }

    return false
}

