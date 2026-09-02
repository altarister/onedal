package com.onedal.app.plugins.insung

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.AppLogger
import com.onedal.app.core.TargetApp
import com.onedal.app.core.engine.CautionDongVerifier
import com.onedal.app.core.engine.PreConfirmGate
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

fun ScanContext.handleConfirmedScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
    // 🚧 인성 전용 구간 — 인성 잡기 수순 (픽커_수집.md §3-확장)
    // 🚧 인성 전용 구간 — 픽커의 «수락됨» 판정은 여기가 아니라 화면 판별 직후에 있다
    //    (실물 덤프상 픽커 상세 낱말은 전부 «수락 전» 표식이라 분류로는 못 잡는다)
    if (!TargetApp.supportsCatching(currentTargetApp)) return
    // 잔상 방어
    if (isPopupResidue(rawScreenStr)) return

    /**
     * 👀 **미리보기로 보다가 확정을 눌렀다 — 딱지를 벗고 서버에 알린다**
     * (기사님 실측 2026-08-22 18:57 · 용어집 §9).
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
         * 👀 확정을 눌렀으니 **미리보기가 아니다.** 여기서 딱지를 벗는다 (용어집 §9).
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

fun ScanContext.handlePreConfirmScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
    /**
     * 🚧 **잡기 수순이 없는 배차망은 여기 들어오지 않는다** — 부르는 쪽(`HijackService`)이
     * 이미 갈라 보낸다 (2026-09-02 · 이 함수가 인성 폴더로 나오면서 정리됐다).
     *
     * 옮기기 전에는 이 안에 **픽커 분기가 들어 있었다** — 인성 함수가 픽커 함수를 부르고
     * 있었던 것이다. 그게 «공통 자리에 두 배차망이 섞여 있던» 증거이고, 갈라야 했던 이유다.
     */
    if (!TargetApp.supportsCatching(currentTargetApp)) return

    // 잔상 방어: 팝업이 아직 닫히지 않았으면 무시
    if (isPopupResidue(rawScreenStr)) return

    // 이미 전송/결정함 — 단, 3단계에서 돌아와 확정/취소를 마저 눌러야 하면 계속 간다 (#82)
    if (PreConfirmGate.shouldSkip(session.isDetailScrapSent, session.cautionAction)) return

    ensureSessionId()
    
    AppLogger.roadmap("[Current Page: DETAIL_PRE_CONFIRM] 진입 완료", telemetryManager.currentScreenContext.name)
    
    // 화면에서 임시 추출
    val tempOrder = scrapParser.parse(screenTexts)
    
    // 최근 LIST 화면에서 파싱된 원본 오더 중 요금이 일치하는 콜 역추적 매칭 (전표오염 회피)
    val matchedOrder = recentListOrders.reversed().find { it.fare > 0 && it.fare == tempOrder.fare }

    val finalOrder = if (session.isAutoActive && session.lastDetailOrder != null) {
        // AUTO 모드는 이미 클릭 시점에 order를 가지고 있음
        session.lastDetailOrder!!.copy(
            type = "AUTO_CLICK",
            rawText = rawScreenStr
        )
    } else if (matchedOrder != null) {
        // MANUAL 클릭인데 캐시 매칭에 성공한 경우 (원본 데이터 재활용)
        matchedOrder.copy(
            id = session.currentOrderId.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
            type = "MANUAL_CLICK",
            rawText = rawScreenStr
        )
    } else {
        /**
         * 캐시 매칭 모두 실패 시 (임시 폴백 — 오파싱 가능성 있음)
         *
         * 🔴 **주소 꼴이 아니면 주소로 쓰지 않는다** — `looksLikeAddress` (2026-08-29 신설).
         *    라이브 실측(08-28 23:22)에서 상차지·하차지 자리에 **「가전 → 다마스」**,
         *    즉 품목과 차종이 들어왔다. 좌표를 못 만들어 궤적이 1점에서 멈췄다.
         *    가드는 있었는데 `buildOrderFromScreen` 경로에만 걸려 있어서 **정작 사고가
         *    난 이 폴백은 `isNotBlank()` 만 봤다** — 판단이 두 벌이었던 것이다 (규칙 ③).
         *
         *    직접콜(MANUAL)은 서버가 심사하지 않으므로(규칙 ①) 여기가 유일한 문이다.
         *    막히면 «수집중»으로 두고, 뒤이어 오는 상세 수집이 진짜 주소를 채운다
         *    (규칙 ④ — 모르면 모른다고 둔다).
         */
        val safeAddr = { s: String ->
            s.takeIf { it.isNotBlank() && it != "배차값없음" && InsungParser.looksLikeAddress(it) }
                ?: "수집중(상세확인필요)"
        }
        tempOrder.copy(
            id = session.currentOrderId.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
            type = "MANUAL_CLICK",
            pickup = safeAddr(tempOrder.pickup),
            dropoff = safeAddr(tempOrder.dropoff),
            timestamp = nowTimestamp(),
            rawText = rawScreenStr
        )
    }

    if (session.currentOrderId.isEmpty()) {
        session.setOrderId(finalOrder.id)
    }

    session.lastDetailOrder = finalOrder // 상세 수집용으로 최종 갱신

    /**
     * 👀 **손으로 연 상세는 팝업 3장을 먼저 읽는다** (기사님 확정 2026-08-22 · 용어집 §9).
     *
     * 기사님: *"내가 상세 페이지를 보았을 때 팝업 3장을 열어서 정보를 모두 확인하고
     * 그걸 가지고 판단까지 해주면 나는 **페널티 축적 없이** 콜을 판단할 수 있다."*
     *
     * 🔴 왜 여기여야 하나: 확정 전에는 팝업을 못 여니까 지금까지는 *"리스트에서 본 콜 중
     *    요금이 같은 것"* 을 역추적해 주소를 빌려 왔고, 실패하면 화면 요약 파싱값을 그대로
     *    썼다. 2026-08-22 실측에서 **세 번 다 실패**해 적요 조각이 주소로 올라갔다
     *    (`계산서필 → 카톤` · `가전 → 계산서필` · `박스 → 계산서필`).
     *    팝업에서 주소를 직접 읽으면 **그 역추적이 필요 없어진다** — 버그를 고치는 게
     *    아니라 버그가 사는 자리를 없앤다.
     *
     * ⚠️ **필터콜(앱이 누른 것)은 건드리지 않는다.** 거기서 팝업을 먼저 열면 확정 버튼을
     *    누르기까지가 늦어져 선점을 놓친다 — 2026-08-09 에 "잡기 전 미리 계산"을 제거한 그 이유다.
     *
     * 상세 수집이 끝나면(`DONE`) `handleDropoffPopup` 이 confirm + detail 을 함께 보낸다.
     */
    if (!session.isAutoActive && session.collectState == SessionManager.CollectState.IDLE) {
        session.isPreview = true
        AppLogger.roadmap("👀 [미리보기] 손으로 연 상세 — 팝업 3장을 먼저 읽고 판정을 받는다", telemetryManager.currentScreenContext.name)
        collectMachine.startCollect(rootNode, session, screenTexts)
        return   // confirm 은 상세 수집이 끝난 뒤에 detail 과 함께 나간다
    }

    // 상세 수집 중 팝업이 닫혀 상세로 돌아온 경우 — 다음 팝업을 연다 (확정 화면과 같은 규칙)
    if (session.isPreview && session.collectState != SessionManager.CollectState.DONE) {
        advanceCollect(rootNode)
        return
    }

    /**
     * ── [3단계 팝업에서 돌아온 경우] **예약된 클릭만 한다 — 재평가하지 않는다** (#82).
     *
     * 평가는 1차 진입에서 끝났다. 이 시점에는 **자기 /confirm 이 만든 선점 잠금**
     * (피기백 isActive=false)이 이미 폰에 내려와 있어, 2차 필터를 다시 돌리면
     * «탈락»으로 오판해 방금 통과한 콜을 취소해 버린다. 8판 실측(16:54:21 피기백)이
     * 그 증거다. 여기서는 팝업 검증의 결론(확정/취소)을 집행만 한다.
     */
    if (session.isAutoActive) {
        when (session.cautionAction) {
            "ACCEPT" -> {
                session.cautionAction = null
                AppLogger.d(TAG, "✅ [3단계 통과] 진짜 우리 동네! 확정 클릭!")
                AppLogger.roadmap("상세페이지에서 확정 버튼 클릭 (동명이동 3단계 검증 통과)", telemetryManager.currentScreenContext.name)
                AppLogger.roadmap("[${keywords.appLabel}] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                clickFirstMatchingButton(rootNode, keywords.confirmKeywords)
                return
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
                return
            }
        }
    }

    AppLogger.roadmap("상세페이지 텍스트 추출 및 2차 필터(적요 등) 통과 확인", telemetryManager.currentScreenContext.name)

    val isTarget = scrapParser.shouldClick(finalOrder)

    if (!session.isAutoActive || isTarget) {
        sendConfirmOnce(finalOrder, rawScreenStr)

        // ✅ [Phase 2] 수동 클릭이지만 스위치가 AUTO면, 서버가 결재를 보낼 수 있으므로
        // 일시적으로 고속 폴링(1초) 활성화 (10초 후 자동 해제)
        if (!session.isAutoActive && telemetryManager.currentMode == "AUTO") {
            AppLogger.d(TAG, "⚡ [Phase 2] 수동 클릭 + AUTO 스위치 감지. 임시 고속 폴링 10초 활성화")
            telemetryManager.isWaitingDecision = true
            mainHandler.postDelayed({
                telemetryManager.isWaitingDecision = false
                AppLogger.d(TAG, "⚡ [Phase 2] 임시 고속 폴링 10초 만료. 해제.")
            }, 10000)
        }
        
        // ⚡ AUTO 모드 확정 버튼 처리 (자동 콜 잡기 중일 때만)
        if (session.isAutoActive) {
            // 앱별 확정 버튼 텍스트 가져오기 (취소 클릭은 #82 이후 함수 첫머리 CANCEL 집행부에 있다)
            val confirmBtnTexts = keywords.confirmKeywords
            val appLabel = keywords.appLabel

            // ── [최초 진입] 도착지가 동명이동 주의 동네인지 확인 ──
            //    (3단계에서 돌아온 ACCEPT/CANCEL 은 이 함수 첫머리가 재평가 없이 집행한다 · #82)
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
                    AppLogger.roadmap("[$appLabel] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                    clickFirstMatchingButton(rootNode, confirmBtnTexts)
                } else {
                    // 2단계 보류 → 3단계(팝업) 돌입!
                    AppLogger.w(TAG, "⚠️ [3단계 돌입] 화면에 상위 지역 없음! 도착지 팝업 호출!")
                    session.cautionAction = "VERIFY"
                    touchManager.findAndClickByText(rootNode, "도착지", isStartsWith = true)
                    return
                }
            } else {
                // 일반 콜: 기존처럼 확정 버튼을 즉시 누른다 (선점필승)
                AppLogger.d(TAG, "🚀 [AUTO] 확정 버튼 즉시 클릭 (배차 시도)")
                AppLogger.roadmap("상세페이지에서 확정 버튼 클릭", telemetryManager.currentScreenContext.name)
                AppLogger.roadmap("[$appLabel] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                clickFirstMatchingButton(rootNode, confirmBtnTexts)
            }
        }
    } else {
        // [AUTO 모드이면서 2차 필터 실패] -> 서버 보고 생략하고 즉시 취소 버튼 회피 기동
        session.isDetailScrapSent = true // 다음 사이클 스킵을 위해 마킹
        val cancelBtnForReject = keywords.cancelKeyword
        AppLogger.d(TAG, "⚠️ [2차 필터 실패] 상세 정보를 확인한 결과 똥콜(블랙리스트 등)로 판명됨. '$cancelBtnForReject' 회피 기동!")
        
        AppLogger.roadmap("상세페이지에서 '$cancelBtnForReject' 추출 후 클릭", telemetryManager.currentScreenContext.name)
        if (!touchManager.findAndClickByText(rootNode, cancelBtnForReject, isStartsWith = true)) {
            touchManager.performBack()
        }
        
        AppLogger.roadmap("리스트 페이지 진입", telemetryManager.currentScreenContext.name)
        // 세션 초기화를 통해 다음 꿀콜 대기 상태로 복귀
        resetSessionState()
    }
}
