package com.onedal.app.core.engine

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.AppLogger
import com.onedal.app.core.ScreenReader
import com.onedal.app.core.TargetApp
import com.onedal.app.models.ScreenContext
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.insung.handleInsungPreConfirmExecution
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords

private const val TAG = "1DAL_PRE_CONFIRM"

/**
 * 🚪 **상세 화면 공통 관문 (DETAIL_PRE_CONFIRM)**
 *
 * 배차망(인성, 픽커, 24시 등)을 가리지 않고 상세 화면에 진입했을 때의 공통 라이프사이클을 통솔한다:
 * 1. 진입 게이트 검증 (중복 보고 스킵 / 팝업 잔상 대기)
 * 2. 세션 ID 및 원본 오더 매칭 (AUTO 모드 캐시 또는 리스트 오더 역추적 대조)
 * 3. 2차 필터(적요/상세) 적합 여부 판정
 * 4. [적합 시]
 *    - 선점 보고 (sendConfirmOnce)
 *    - 잡기 지원 배차망(인성): 인성 전용 확정/주의동/팝업 수순(handleInsungPreConfirmExecution) 위임
 *    - 잡기 미지원 배차망(픽커): 미리보기 등록, 상세 보고(sendDetail), 자동 복귀 타이머(scheduleDetailBack) 가동
 * 5. [부적합 시]
 *    - 2차 필터 탈락 즉시 회피 기동 (취소 버튼 클릭 또는 뒤로 가기 후 세션 초기화)
 */
fun ScanContext.handlePreConfirmScreen(
    rootNode: AccessibilityNodeInfo,
    screenTexts: List<String>,
    rawScreenStr: String
) {
    // 잔상 방어: 팝업이 아직 닫히지 않았으면 무시
    if (screenDetector.isPopupResidue(rawScreenStr)) {
        AppLogger.roadmap("✋ [Race Condition 방어] 출발지/도착지 팝업 닫힘 애니메이션 잔상 대기", telemetryManager.currentScreenContext.name)
        return
    }

    // 이미 전송/결정함 — 단, 3단계에서 돌아와 확정/취소를 마저 눌러야 하면 계속 간다 (#82)
    if (PreConfirmGate.shouldSkip(session.isDetailScrapSent, session.cautionAction)) return

    ensureSessionId()

    AppLogger.roadmap("[Current Page: DETAIL_PRE_CONFIRM] 진입 완료", telemetryManager.currentScreenContext.name)

    // ⏱️ 누가 열었든(알람·손) · 어느 모드든 — 상세 대기 시간 뒤 리스트로 돌아온다 (#124 · 기사님 확정)
    if (!TargetApp.supportsCatching(currentTargetApp)) {
        scheduleDetailBack()
    }

    // 📸 [카카오픽커 분기] 픽커는 접근성 트리에 배송지가 오지 않으므로, 화면 스냅샷 OCR로 판독한다 (스냅샷 계획 3·7단계)
    if (currentTargetApp == TargetApp.KAKAOPICKER) {
        handlePickerPreConfirmSnapshot(rootNode, screenTexts, rawScreenStr)
        return
    }

    // 최근 LIST 화면에서 파싱된 원본 오더와 대조 매칭 (전표오염 회피)
    val matchedOrder = scrapParser.matchDetailOrder(screenTexts, recentListOrders)

    val finalOrder = if (session.isAutoActive && session.lastDetailOrder != null) {
        // AUTO 모드는 이미 클릭 시점에 order를 가지고 있음
        session.lastDetailOrder!!.copy(
            type = "AUTO_CLICK",
            rawText = rawScreenStr
        )
    } else if (matchedOrder != null) {
        // MANUAL/ALARM 클릭인데 캐시 매칭에 성공한 경우 (원본 데이터 재활용)
        matchedOrder.copy(
            id = session.currentOrderId.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
            type = "MANUAL_CLICK",
            rawText = rawScreenStr
        )
    } else {
        // 캐시 매칭 실패 시 화면에서 파싱 폴백
        val tempOrder = scrapParser.parse(screenTexts)
        tempOrder.copy(
            id = session.currentOrderId.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
            type = "MANUAL_CLICK",
            timestamp = nowTimestamp(),
            rawText = rawScreenStr
        )
    }

    if (session.currentOrderId.isEmpty()) {
        session.setOrderId(finalOrder.id)
    }

    session.lastDetailOrder = finalOrder // 상세 수집/승격용 최종 갱신

    // 잡기 수순이 있는 배차망(인성)의 확정 전 팝업 수순 및 3단계 동명이동 처리
    if (TargetApp.supportsCatching(currentTargetApp)) {
        val handled = handleInsungPreConfirmExecution(rootNode, screenTexts, finalOrder)
        if (handled) return
    }

    AppLogger.roadmap("상세페이지 텍스트 추출 및 2차 필터(적요 등) 통과 확인", telemetryManager.currentScreenContext.name)

    val isTarget = scrapParser.shouldClick(finalOrder)

    if (!session.isAutoActive || isTarget) {
        sendConfirmOnce(finalOrder, rawScreenStr)

        // 수동 클릭이지만 스위치가 AUTO면, 서버가 결재를 보낼 수 있으므로 임시 고속 폴링(1초) 활성화
        if (!session.isAutoActive && telemetryManager.currentMode == "AUTO") {
            AppLogger.d(TAG, "⚡ [Phase 2] 수동 클릭 + AUTO 스위치 감지. 임시 고속 폴링 10초 활성화")
            telemetryManager.isWaitingDecision = true
            mainHandler.postDelayed({
                telemetryManager.isWaitingDecision = false
                AppLogger.d(TAG, "⚡ [Phase 2] 임시 고속 폴링 10초 만료. 해제.")
            }, 10000)
        }

        if (TargetApp.supportsCatching(currentTargetApp)) {
            // 인성 AUTO 모드 확정 버튼 클릭
            if (session.isAutoActive) {
                AppLogger.d(TAG, "🚀 [AUTO] 확정 버튼 즉시 클릭 (배차 시도)")
                AppLogger.roadmap("상세페이지에서 확정 버튼 클릭", telemetryManager.currentScreenContext.name)
                AppLogger.roadmap("[${keywords.appLabel}] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                clickFirstMatchingButton(rootNode, keywords.confirmKeywords)
            }
        } else {
            // 잡기 수순이 없는 배차망(카카오 픽커 등): 기사님 손으로 직접 수락 대기 (미리보기 모드)
            session.isPreview = true
            session.accumulatedDetailText = rawScreenStr
            sendDetail(finalOrder)
            AppLogger.i("1DAL_PICKER", "📄 [상세 실물] ${screenTexts.joinToString(" | ").take(500)}")
        }
    } else {
        // [AUTO 모드이면서 2차 필터 실패] -> 공통 즉시 취소/뒤로가기 회피 기동
        session.isDetailScrapSent = true // 다음 사이클 스킵을 위해 마킹
        val cancelBtnForReject = keywords.cancelKeyword
        AppLogger.d(TAG, "⚠️ [2차 필터 실패] 상세 정보를 확인한 결과 똥콜(블랙리스트 등)로 판명됨. '$cancelBtnForReject' 회피 기동!")

        AppLogger.roadmap("상세페이지에서 '$cancelBtnForReject' 추출 후 클릭", telemetryManager.currentScreenContext.name)
        abortPreConfirm {
            if (!touchManager.findAndClickByText(rootNode, cancelBtnForReject, isStartsWith = true)) {
                touchManager.performBack()
            }
        }
    }
}

/**
 * 🚪 상세 화면 회피 복귀 및 세션 초기화 (콜의 끝).
 * 현재 화면이 여전히 상세 화면일 때만 뒤로가기를 집행하여 리스트 화면 오클릭을 방지한다.
 */
private fun ScanContext.abortPreConfirm(action: (() -> Unit)? = null) {
    session.isVerifyingSnapshot = false
    if (telemetryManager.currentScreenContext == ScreenContext.DETAIL_PRE_CONFIRM) {
        action?.invoke() ?: touchManager.performBack()
    } else {
        AppLogger.i(TAG, "🚪 [회피 복귀 생략] 이미 상세 화면 이탈 (현재: ${telemetryManager.currentScreenContext})")
    }
    AppLogger.roadmap("리스트 페이지 진입 (회피 복귀)", telemetryManager.currentScreenContext.name)
    resetSessionState()
}

/**
 * 📸 **픽커 상세 스냅샷 검증 및 처리** (기획서 3·7단계 및 버그 대장 #119 수호).
 *
 * 1. 150ms 유휴 대기(DETAIL_STABILIZE_IDLE_MS) 후 화면 멈춤 상태에서 스냅샷 캡처 및 OCR 판독.
 * 2. 알람 콜(`alarmTappedCard != null`): 리스트 기억 카드와 동 토막을 엄격 대조하여 일치 시 정상 전송, 불일치 시 이상 징후 보고 후 뒤로가기.
 * 3. 수동 콜(`alarmTappedCard == null`): 리스트 매칭 카드로 요금을 살리고 OCR 결과로 오더를 조립하여 정상 전송 (손으로 연 콜 구제).
 * 4. 판독 실패(null) 시: 이상 징후 보고 후, 탭 카드가 있으면 카드 정보로 폴백 전송하여 콜 증발 방지.
 */
private fun ScanContext.handlePickerPreConfirmSnapshot(
    rootNode: AccessibilityNodeInfo,
    screenTexts: List<String>,
    rawScreenStr: String
) {
    if (session.isVerifyingSnapshot) {
        AppLogger.d(TAG, "📸 [스냅샷 중복 진입 방어] 이미 OCR 판독 진행 중")
        return
    }
    session.isVerifyingSnapshot = true

    val opener = KakaoPickerKeywords.detailOpener(
        session.alarmTappedAtMs,
        android.os.SystemClock.elapsedRealtime()
    )
    val tappedCard = session.alarmTappedCard?.takeIf { opener == KakaoPickerKeywords.OPENER_ALARM }
    val matchedListCard = scrapParser.matchDetailOrder(screenTexts, recentListOrders)

    mainHandler.postDelayed({
        screenReader.readAndVerifyPickerDetail(
            alarmTappedCard = tappedCard,
            matchedListOrder = matchedListCard,
            screenTexts = screenTexts,
            rawScreenStr = rawScreenStr,
            onSuccess = { verifiedOrder, detail ->
                mainHandler.post {
                    session.isVerifyingSnapshot = false
                    if (session.isDetailScrapSent) return@post
                    if (telemetryManager.currentScreenContext != ScreenContext.DETAIL_PRE_CONFIRM) {
                        AppLogger.w(TAG, "📸 [스냅샷 성공 무시] 이미 상세 화면 이탈 (현재: ${telemetryManager.currentScreenContext})")
                        return@post
                    }
                    ensureSessionId()
                    val orderWithId = verifiedOrder.copy(
                        id = session.currentOrderId.ifEmpty { verifiedOrder.id }
                    )
                    session.setOrderId(orderWithId.id)
                    session.lastDetailOrder = orderWithId
                    session.isPreview = true
                    session.accumulatedDetailText = rawScreenStr

                    AppLogger.roadmap("📸 [스냅샷 통과] 픽커 상세 검증 완료: ${orderWithId.pickup} → ${orderWithId.dropoff}", telemetryManager.currentScreenContext.name)
                    sendConfirmOnce(orderWithId, rawScreenStr)
                    sendDetail(orderWithId)
                }
            },
            onMismatch = { reason, detail, lines ->
                mainHandler.post {
                    AppLogger.w(TAG, "🚨 [스냅샷 불일치] $reason -> 리스트로 안전 복귀 회피 기동")
                    apiClient.sendAnomalyReport(
                        targetApp = currentTargetApp,
                        screenName = telemetryManager.currentScreenContext.name,
                        failureReason = "SNAPSHOT_MISMATCH: $reason",
                        listOrderInfo = tappedCard?.let { mapOf("fare" to it.fare, "pickup" to it.pickup, "dropoff" to it.dropoff) },
                        detailParsedText = rawScreenStr.take(500),
                        ocrResult = detail?.let {
                            mapOf("pickup" to it.pickup.admin, "dropoff" to it.dropoff.admin, "straightKm" to it.dropoff.straightKm)
                        }
                    )
                    abortPreConfirm()
                }
            },
            onParseFailed = { reason, lines ->
                mainHandler.post {
                    AppLogger.w(TAG, "⚠️ [스냅샷 판독 실패] $reason -> 카드 정보로 폴백 선행 전송하고 이상 징후 보고")
                    apiClient.sendAnomalyReport(
                        targetApp = currentTargetApp,
                        screenName = telemetryManager.currentScreenContext.name,
                        failureReason = "SNAPSHOT_PARSE_FAILED: $reason",
                        listOrderInfo = tappedCard?.let { mapOf("fare" to it.fare, "pickup" to it.pickup, "dropoff" to it.dropoff) },
                        detailParsedText = rawScreenStr.take(500),
                        ocrResult = mapOf("linesCount" to lines.size)
                    )

                    // 콜 증발 방지: 탭 카드가 있으면 카드 정보로 폴백
                    val fallbackOrder = tappedCard ?: matchedListCard
                    if (fallbackOrder != null) {
                        session.isVerifyingSnapshot = false
                        ensureSessionId()
                        val orderWithId = fallbackOrder.copy(
                            id = session.currentOrderId.ifEmpty { fallbackOrder.id },
                            rawText = rawScreenStr
                        )
                        session.setOrderId(orderWithId.id)
                        session.lastDetailOrder = orderWithId
                        session.isPreview = true
                        session.accumulatedDetailText = rawScreenStr
                        sendConfirmOnce(orderWithId, rawScreenStr)
                        sendDetail(orderWithId)
                    } else {
                        abortPreConfirm()
                    }
                }
            },
            onError = { error ->
                mainHandler.post {
                    AppLogger.e(TAG, "❌ [스냅샷 에러] $error")
                    val fallbackOrder = tappedCard ?: matchedListCard
                    if (fallbackOrder != null) {
                        session.isVerifyingSnapshot = false
                        ensureSessionId()
                        val orderWithId = fallbackOrder.copy(
                            id = session.currentOrderId.ifEmpty { fallbackOrder.id },
                            rawText = rawScreenStr
                        )
                        session.setOrderId(orderWithId.id)
                        session.lastDetailOrder = orderWithId
                        session.isPreview = true
                        session.accumulatedDetailText = rawScreenStr
                        sendConfirmOnce(orderWithId, rawScreenStr)
                        sendDetail(orderWithId)
                    } else {
                        abortPreConfirm()
                    }
                }
            }
        )
    }, ScreenReader.DETAIL_STABILIZE_IDLE_MS)
}

