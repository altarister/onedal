package com.onedal.app.core.engine

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.LogTag
import com.onedal.app.core.AppLogger
import com.onedal.app.core.ScreenReader
import com.onedal.app.models.ScreenContext
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.DispatchPluginRegistry
import com.onedal.app.plugins.IDispatchAppPlugin
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
 *    - 채우기(plugin.executePreConfirmSpecial — 인성 팝업 3장)가 끝난 뒤 2차 필터를 지난 콜만
 *    - 앱이 계약하는 콜(자동 · 수락 칸 있음): 확정 클릭 → 성공하면 상세 보고
 *    - 그 밖: 미리보기로 상세 보고. 돌아오는 타이머(scheduleDetailBack)는 상세에 들어올 때 이미 걸었다
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
        AppLogger.roadmap(LogTag.SCREEN, "✋ [Race Condition 방어] 출발지/도착지 팝업 닫힘 애니메이션 잔상 대기", telemetryManager.currentScreenContext.name)
        return
    }

    // 이미 선점 보고를 했다 — 이 화면에서 할 일이 끝났다
    if (PreConfirmGate.shouldSkip(session.isDetailScrapSent)) return

    ensureSessionId()

    val plugin = DispatchPluginRegistry.get(currentTargetApp)

    // 🔕 같은 콜의 상세 진입은 한 번 (화면 알림마다 되풀이하지 않는다)
    if (com.onedal.app.core.LogOnce.changed("detailEnter", session.currentOrderId))
        AppLogger.roadmap(LogTag.SCREEN, "[Current Page: DETAIL_PRE_CONFIRM] 진입 완료 (${plugin.label})", telemetryManager.currentScreenContext.name)

    // ⏱️ 누가 열었든(알람·손) · 어느 모드든 — 상세 대기 시간 뒤 리스트로 돌아온다 (#124 · 기사님 확정)
    //    앱이 열었지만 계약하지 않는 콜(체험)도 — 결재가 안 오면 여기서 돌아온다
    if (returnsFromDetailWhoeverOpened() || (session.openedByApp && !session.contractedByApp)) {
        scheduleDetailBack()
    }

    // 📸 사진 판독이 도는 중이면 기다린다 — 사진은 따로 돌고, 같은 상세가 다시 들어와도 두 번 찍지 않는다
    if (session.isVerifyingSnapshot) return

    // 최근 LIST 화면에서 파싱된 원본 오더와 대조 매칭 (전표오염 회피)
    val matchedOrder = scrapParser.matchDetailOrder(screenTexts, recentListOrders)

    val finalOrder = if (session.openedByApp && session.lastDetailOrder != null) {
        // 앱이 눌러 연 상세는 이미 클릭 시점에 order를 가지고 있음 — 종류는 «누가 계약했나»에서 (`clickOrigin`)
        session.lastDetailOrder!!.copy(
            type = "${session.clickOrigin}_CLICK",
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

    // 채우기 — 인성은 팝업 3장을 다 읽을 때까지 여기서 돌아간다 (배차망_모드표.md 순서 ③)
    if (plugin.executePreConfirmSpecial(this, rootNode, screenTexts, finalOrder)) {
        return
    }

    // 🏠 채운 값을 콜에 싣는다 — 인성은 팝업 «위치»를 전체 주소로 (서버가 꺼내지 않는다)
    val order = plugin.fillDetail(this, finalOrder)
    session.lastDetailOrder = order

    // 📸 그래도 필수 요소(전체 주소·요금)가 모자라면 사진 — 사진 판독기가 있는 배차망만. 배차망 이름이 아니라 «모자란가»가 방아쇠다
    if (!OrderRequirement.meetsDetail(order) && plugin.ocrParser != null) {
        handlePreConfirmSnapshot(plugin, rootNode, screenTexts, rawScreenStr)
        return
    }

    // 📋 필수 요소 최종 대조 — 세 배차망 같다. 못 채웠으면 서버에 보내지 않고 버린다
    val missing = OrderRequirement.missingDetail(order)
    if (missing.isNotEmpty()) {
        apiClient.sendAnomalyReport(
            targetApp = currentTargetApp,
            screenName = telemetryManager.currentScreenContext.name,
            failureReason = "REQUIREMENT_UNMET: ${missing.joinToString(" · ")}",
            listOrderInfo = mapOf("fare" to order.fare, "pickup" to order.pickup, "dropoff" to order.dropoff),
            detailParsedText = rawScreenStr.take(500),
            ocrResult = null,
        )
        dropUnfilledCall("요건 미달 — ${missing.joinToString(" · ")}")
        return
    }

    // 🎯 «누른 그 콜인가» — 세 배차망 같은 검증
    if (dropIfNotTappedCall(order, rawScreenStr)) return

    AppLogger.roadmap(LogTag.FILTER, "상세페이지 텍스트 추출 및 2차 필터(적요 등) 통과 확인", telemetryManager.currentScreenContext.name)

    val isTarget = passesFilterAfterFill(order)

    if (!session.openedByApp || isTarget) {
        // ✍️ 앱이 계약 버튼을 누르는 콜 — 자동 모드이고 이 배차망에 수락 칸이 있을 때만 (수락 칸이 비었는지 읽는 곳은 여기 한 곳)
        val acceptButtons = plugin.acceptButtons
        /**
         * 📅 **확정 직전 상세 값으로 한 번 더** — 목록이 오늘이라 앱이 계약하려던 콜도 상세가 내일이면 기사님께 넘긴다.
         * «앱이 계약한다»를 내려 둬야 결재가 와도 앱이 닫기·취소를 누르지 않고, 안전취소도 돌지 않는다.
         */
        if (session.contractedByApp && !ReservationGate.isToday(order)) {
            session.contractedByApp = false
            AppLogger.i(TAG, LogTag.DECISION, "📅 [확정 안 누름] 상세가 오늘 콜이 아니다 — 예약 ${ReservationGate.wordOf(order)} ${order.reservedAt ?: ""} · 미리보기로 올리고 기사님이 확정")
        }
        val appContracts = appPressesAccept(session.contractedByApp, acceptButtons, order)
        // 👀 계약하지 않는 콜은 미리보기 — 선점 보고 **전에** 켠다. 서버는 이 표시가 있어야 심사한다
        if (!appContracts) session.isPreview = true
        sendConfirmOnce(order, rawScreenStr)

        // 수동 클릭이지만 스위치가 AUTO면, 서버가 결재를 보낼 수 있으므로 임시 고속 폴링(1초) 활성화
        if (!session.contractedByApp && effectiveMode == "AUTO") {
            AppLogger.d(TAG, LogTag.NETWORK, "⚡ [Phase 2] 수동 클릭 + AUTO 스위치 감지. 임시 고속 폴링 10초 활성화")
            telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.HAND_AUTO, true)
            mainHandler.postDelayed({
                telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.HAND_AUTO, false)
                AppLogger.d(TAG, LogTag.NETWORK, "⚡ [Phase 2] 임시 고속 폴링 10초 만료. 해제.")
            }, 10000)
        }

        if (appContracts && acceptButtons != null) {
            /**
             * ✍️ **앱이 계약하는 콜 — 확정을 누르고, 누르기에 성공한 뒤에 상세 보고** (안전취소 시간이 계약 뒤부터 흐른다).
             * 누르기에 실패하면 상세 보고를 보내지 않는다 — 보내면 서버는 앱이 계약한 줄 알고 안전취소가 «취소»를 찾는다.
             */
            AppLogger.d(TAG, LogTag.TAP, "🚀 [AUTO] 확정 버튼 클릭 (채운 뒤)")
            AppLogger.roadmap(LogTag.TAP, "상세페이지에서 확정 버튼 클릭", telemetryManager.currentScreenContext.name)
            if (clickFirstMatchingButton(rootNode, acceptButtons)) {
                AppLogger.roadmap(LogTag.CALL_STAGE, "[${keywords.appLabel}] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                sendDetail(order)
            } else {
                AppLogger.w(TAG, "🛑 [확정 실패] 확정 버튼을 못 눌렀다 — 상세 보고를 보내지 않고 빠져나온다")
                apiClient.sendAnomalyReport(
                    targetApp = currentTargetApp,
                    screenName = telemetryManager.currentScreenContext.name,
                    failureReason = "CONFIRM_BUTTON_NOT_FOUND",
                    listOrderInfo = mapOf("fare" to order.fare, "pickup" to order.pickup, "dropoff" to order.dropoff),
                    detailParsedText = rawScreenStr.take(500),
                    ocrResult = null,
                )
                abortPreConfirm()
            }
        } else {
            // 👀 계약하지 않는 콜(기사님이 연 상세 · 체험 · 알람) — 채운 글자 그대로 상세 보고, 판정을 기다린다
            sendDetail(order)
        }
    } else {
        // [AUTO 모드이면서 2차 필터 실패] -> 공통 즉시 취소/뒤로가기 회피 기동
        session.isDetailScrapSent = true // 다음 사이클 스킵을 위해 마킹
        val cancelBtnForReject = keywords.cancelKeyword
        AppLogger.d(TAG, LogTag.FILTER, "⚠️ [2차 필터 실패] 상세 정보를 확인한 결과 똥콜(블랙리스트 등)로 판명됨. '$cancelBtnForReject' 회피 기동!")

        AppLogger.roadmap(LogTag.TAP, "상세페이지에서 '$cancelBtnForReject' 추출 후 클릭", telemetryManager.currentScreenContext.name)
        abortPreConfirm {
            if (!touchManager.findAndClickByText(rootNode, cancelBtnForReject, isStartsWith = true)) {
                touchManager.performBack()
            }
        }
    }
}

/**
 * 🧾 **값을 못 채운 콜을 버린다** (기사님 확정 — 값이 모두 있는 콜을 버리는 것은 기사님만, 못 채운 콜은 앱이 버린다).
 * 서버에 보내지 않는다 — 서버가 판단할 수 없다. 이상 징후 보고는 부르는 쪽이 이미 남겼다(유일한 흔적).
 * · 앱이 연 콜: «막았다»로 내리고(필터가 바뀌면 다시 본다) **곧바로 목록으로** — 상세에 머물면 기사님이 수락하셔도 앱이 알아보지 못한다.
 *   🔴 내리기가 목록으로 돌아가기보다 **앞**이다 — 처리를 비우면 누를 때 쥔 줄이 지워진다(`UnfilledCallDropTest`).
 * · 기사님이 연 상세: 앱이 뒤로 가지 않는다. 이 상세에서 다시 보내지 않게만 한다.
 */
fun ScanContext.dropUnfilledCall(reason: String) {
    AppLogger.w(TAG, LogTag.CALL_STAGE, "🧾 [값 못 채움] $reason — 서버에 보내지 않고 버린다")
    if (session.openedByApp) {
        demoteTappedCall(reason)
        abortPreConfirm()
    } else {
        // ✋ 기사님이 손으로 연 콜 — 버리지 않고 보류한다. 기사님이 확정(픽커는 수락)하시면 그때 보고한다 (기사님 «가»)
        session.isVerifyingSnapshot = false
        session.isDetailScrapSent = true
        session.heldUnfilled = true
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
        AppLogger.i(TAG, LogTag.SCREEN, "🚪 [회피 복귀 생략] 이미 상세 화면 이탈 (현재: ${telemetryManager.currentScreenContext})")
    }
    AppLogger.roadmap(LogTag.SCREEN, "리스트 페이지 진입 (회피 복귀)", telemetryManager.currentScreenContext.name)
    resetSessionState()
}

/**
 * 📸 **상세 스냅샷 검증 및 처리**.
 *
 * 1. 150ms 유휴 대기(DETAIL_STABILIZE_IDLE_MS) 후 화면 멈춤 상태에서 스냅샷 캡처 및 OCR 판독.
 * 2. 알람 콜(`alarmTappedCard != null`): 리스트 기억 카드와 동 토막을 엄격 대조하여 일치 시 정상 전송, 불일치 시 이상 징후 보고 후 뒤로가기.
 * 3. 수동 콜(`alarmTappedCard == null`): 리스트 매칭 카드로 요금을 살리고 OCR 결과로 오더를 조립하여 정상 전송 (손으로 연 콜 구제).
 * 4. 판독 실패(null) 시: 이상 징후 보고 후, 탭 카드가 있으면 카드 정보로 폴백 전송하여 콜 증발 방지.
 */
private fun ScanContext.handlePreConfirmSnapshot(
    plugin: IDispatchAppPlugin,
    rootNode: AccessibilityNodeInfo,
    screenTexts: List<String>,
    rawScreenStr: String
) {
    if (session.isVerifyingSnapshot) {
        AppLogger.d(TAG, LogTag.CALL_STAGE, "📸 [스냅샷 중복 진입 방어] 이미 OCR 판독 진행 중")
        return
    }
    session.isVerifyingSnapshot = true

    val opener = settleOpener()
    // «앱이 눌렀나»는 한 사실로 읽는다 — `dropIfNotTappedCall` 과 같은 `openedByApp` (시간 창 `opener` 는 로그용)
    val tappedCard = session.alarmTappedCard?.takeIf { session.openedByApp }
    AppLogger.d(TAG, LogTag.CALL_STAGE, "📸 [사진 판독 시작] 연 쪽: ${if (session.openedByApp) "앱" else "손"} · 누른 뒤 시간 창: $opener")
    val matchedListCard = scrapParser.matchDetailOrder(screenTexts, recentListOrders)

    val pickerParser = plugin.ocrParser as? com.onedal.app.plugins.kakaopicker.PickerDetailOcrParser
    if (pickerParser == null) {
        AppLogger.w(TAG, "📸 [스냅샷 파서 불일치] ${plugin.code}의 ocrParser가 PickerDetailOcrParser가 아님 — 지어내지 않고 즉시 중단")
        session.isVerifyingSnapshot = false
        abortPreConfirm()
        return
    }

    screenReader.scheduleReadAndVerifyDetail(
        delayMs = ScreenReader.DETAIL_STABILIZE_IDLE_MS,
        parser = pickerParser,
        onSuccess = { detail, lines ->
            // ⏱️ 걸어 둔 때 — main 줄 서기가 얼마나 막혔나(«대기»)를 잰다 (상세 속도 · 라이브 09-30 12:57 1.3초 빈 시간)
            val postedAt = android.os.SystemClock.elapsedRealtime()
            mainHandler.post {
                val clock = com.onedal.app.core.StepClock(postedAt) { android.os.SystemClock.elapsedRealtime() }
                clock.mark("대기")
                try {
                val verifyResult = pickerParser.verify(detail, tappedCard, matchedListCard, screenTexts, rawScreenStr, recentListOrders)
                // 🎯 누른 줄과 달라 손 상세로 돌렸으면(`DetailOwner.KEEP_AS_HAND`) 누른 줄 값을 버리고 손 상세 길로 다시 대조한다
                fun asHand(): SimplifiedOfficeOrder = when (val r = pickerParser.verify(detail, null, matchedListCard, screenTexts, rawScreenStr, recentListOrders)) {
                    is com.onedal.app.plugins.kakaopicker.PickerDetailOcrParser.VerifyResult.Success -> r.order
                }
                clock.mark("대조")
                when (verifyResult) {
                    is com.onedal.app.plugins.kakaopicker.PickerDetailOcrParser.VerifyResult.Success -> {
                        var verifiedOrder = verifyResult.order
                        session.isVerifyingSnapshot = false
                        if (session.isDetailScrapSent) return@post
                        if (telemetryManager.currentScreenContext != ScreenContext.DETAIL_PRE_CONFIRM) {
                            AppLogger.w(TAG, "📸 [스냅샷 성공 무시] 이미 상세 화면 이탈 (현재: ${telemetryManager.currentScreenContext})")
                            return@post
                        }
                        // 📋 필수 요소 최종 대조 — 사진으로 채운 값으로 (세 배차망 같다)
                        val missing = OrderRequirement.missingDetail(verifiedOrder)
                        clock.mark("요건")
                        if (missing.isNotEmpty()) {
                            apiClient.sendAnomalyReport(
                                targetApp = currentTargetApp,
                                screenName = telemetryManager.currentScreenContext.name,
                                failureReason = "REQUIREMENT_UNMET: ${missing.joinToString(" · ")}",
                                listOrderInfo = mapOf("fare" to verifiedOrder.fare, "pickup" to verifiedOrder.pickup, "dropoff" to verifiedOrder.dropoff),
                                detailParsedText = rawScreenStr.take(500),
                                // 📸 사진 줄을 싣는다 — «무엇을 읽었길래 모자랐나»를 가른다 (판독 실패와 같은 모양)
                                ocrResult = mapOf(
                                    "linesCount" to lines.size,
                                    "lines" to lines.take(60).map { mapOf("y" to it.y, "text" to it.text) },
                                ),
                            )
                            dropUnfilledCall("사진으로 채운 값이 요건 미달 — ${missing.joinToString(" · ")}")
                            return@post
                        }
                        // 🎯 «누른 그 콜인가» — 세 배차망 같은 검증
                        val notTapped = dropIfNotTappedCall(verifiedOrder, rawScreenStr)
                        clock.mark("누른 콜")
                        if (notTapped) return@post
                        if (tappedCard != null && !session.openedByApp) {
                            verifiedOrder = asHand()
                            val stillMissing = OrderRequirement.missingDetail(verifiedOrder)
                            if (stillMissing.isNotEmpty()) {
                                dropUnfilledCall("손 상세로 다시 대조 — 요건 미달 ${stillMissing.joinToString(" · ")}")
                                return@post
                            }
                        }
                        // 🔎 채운 뒤 필터 한 번 — 같은 함수 (앱이 연 콜만 거른다 · 기사님이 연 상세는 그대로 보낸다)
                        val filteredOut = session.openedByApp && !passesFilterAfterFill(verifiedOrder)
                        clock.mark("필터")
                        if (filteredOut) {
                            AppLogger.w(TAG, LogTag.CALL_STAGE, "🔎 [채운 뒤 탈락] ${verifiedOrder.pickup.take(14)} → ${verifiedOrder.dropoff.take(14)} ${verifiedOrder.fare}원 — 서버에 보내지 않고 목록으로")
                            session.isDetailScrapSent = true
                            abortPreConfirm()
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

                        AppLogger.roadmap(LogTag.CALL_STAGE, "📸 [스냅샷 통과] 픽커 상세 검증 완료: ${orderWithId.pickup} → ${orderWithId.dropoff}", telemetryManager.currentScreenContext.name)
                        sendConfirmOnce(orderWithId, rawScreenStr)
                        sendDetail(orderWithId)
                    }
                }
                } finally {
                    // ⏱️ 상세 진입마다 한 줄(사건) — 빠져나간 자리까지의 단계만 찍힌다
                    AppLogger.d(TAG, LogTag.CALL_STAGE, "⏱️ [상세 뒤 시간] ${clock.line()}")
                }
            }
        },
        onParseFailed = { reason, lines ->
            mainHandler.post {
                AppLogger.w(TAG, "⚠️ [스냅샷 판독 실패] $reason -> 이상 징후 보고 뒤 버린다(요건 못 채움)")
                apiClient.sendAnomalyReport(
                    targetApp = currentTargetApp,
                    screenName = telemetryManager.currentScreenContext.name,
                    failureReason = "SNAPSHOT_PARSE_FAILED: $reason",
                    listOrderInfo = tappedCard?.let { mapOf("fare" to it.fare, "pickup" to it.pickup, "dropoff" to it.dropoff) },
                    detailParsedText = rawScreenStr.take(500),
                    /**
                     * 👀 **읽은 줄을 그대로 싣는다** — 개수만 세면 «무엇을 읽었길래 실패했나»가 사라진다.
                     *    그러면 «화면에 없었나»와 «파서가 못 읽었나»를 못 가른다 — 원인이 아주 다르다.
                     *    y 좌표까지 담는다: 파서가 줄 순서로 덩어리를 가르므로 그 값이 곧 단서다.
                     */
                    ocrResult = mapOf(
                        "linesCount" to lines.size,
                        "lines" to lines.take(60).map { mapOf("y" to it.y, "text" to it.text) },
                    )
                )

                // 📋 사진으로 요건을 못 채웠다 — 목록 줄 값으로 대신 보내지 않고 버린다 (서버가 판단할 수 없다)
                dropUnfilledCall("사진 판독 실패 — $reason")
            }
        },
        onError = { error ->
            mainHandler.post {
                AppLogger.e(TAG, "❌ [스냅샷 에러] $error")
                // 📋 사진을 못 찍거나 못 읽었다 — 요건을 못 채운 것이다. 목록 줄 값으로 대신 보내지 않고 버린다
                dropUnfilledCall("사진 에러 — $error")
            }
        }
    )
}

/**
 * 🎯 **«누른 그 콜인가» — 어긋나면 버린다** (공통 · `TappedCall`). 앱이 누른 줄이 있을 때만 — 손으로 연 상세는 검증할 것이 없다.
 * 어긋나면 이상 징후(DETAIL_MISMATCH)를 남기고, 그 콜을 «막았다»로 내리고 목록으로. 돌려주는 값: 버렸나.
 */
fun ScanContext.dropIfNotTappedCall(order: SimplifiedOfficeOrder, rawScreenStr: String): Boolean {
    settleOpener()
    val tapped = session.alarmTappedCard?.takeIf { session.openedByApp } ?: return false
    val reason = TappedCall.mismatch(tapped, order) ?: return false
    if (DetailOwner.onMismatch(session.contractedByApp) == DetailOwner.OnMismatch.KEEP_AS_HAND) {
        // 👆 앱이 판정만 할 상세 — 닫으면 기사님 손과 부딪힌다. 손 상세로 보고 판정만 보낸다(이상 징후는 남긴다)
        AppLogger.w(TAG, LogTag.CALL_STAGE, "🎯 [누른 콜 아님] $reason — 판정만 할 상세라 닫지 않는다 · 손 상세로 판정만")
        apiClient.sendAnomalyReport(
            targetApp = currentTargetApp,
            screenName = telemetryManager.currentScreenContext.name,
            failureReason = "DETAIL_MISMATCH: $reason · 손 상세로 봄",
            listOrderInfo = mapOf("fare" to tapped.fare, "pickup" to tapped.pickup, "dropoff" to tapped.dropoff),
            detailParsedText = rawScreenStr.take(500),
            ocrResult = null,
        )
        demoteTappedCall(reason)
        releaseAppOpened("누른 콜 아님 — $reason")
        return false
    }
    AppLogger.w(TAG, LogTag.CALL_STAGE, "🎯 [누른 콜 아님] $reason — 계약할 상세라 서버에 보내지 않고 목록으로")
    apiClient.sendAnomalyReport(
        targetApp = currentTargetApp,
        screenName = telemetryManager.currentScreenContext.name,
        failureReason = "DETAIL_MISMATCH: $reason",
        listOrderInfo = mapOf("fare" to tapped.fare, "pickup" to tapped.pickup, "dropoff" to tapped.dropoff),
        detailParsedText = rawScreenStr.take(500),
        ocrResult = null,
    )
    session.isDetailScrapSent = true
    demoteTappedCall(reason)
    abortPreConfirm()
    return true
}

/**
 * 👆 **연 쪽을 한 곳으로** — 판정만 할 상세에서 앱이 누른 지 시간 창 밖에 열렸으면 손 상세로 본다(`DetailOwner.releaseToHand`).
 * 사진 판독과 «누른 그 콜인가»가 같은 사실을 읽게 한다. 돌려주는 값: 시간 창의 연 쪽(로그용).
 */
fun ScanContext.settleOpener(): String {
    val opener = KakaoPickerKeywords.detailOpener(session.alarmTappedAtMs, android.os.SystemClock.elapsedRealtime())
    if (DetailOwner.releaseToHand(session.openedByApp, session.contractedByApp, opener))
        releaseAppOpened("앱이 누른 지 ${KakaoPickerKeywords.ALARM_OPEN_WINDOW_MS / 1000}초 밖에 열린 상세")
    return opener
}

/** 👆 «앱이 연 콜»을 풀어 손 상세로 — 앱이 누른 줄과 대조하지 않는다 */
fun ScanContext.releaseAppOpened(reason: String) {
    AppLogger.i(TAG, LogTag.CALL_STAGE, "👆 [손 상세로 봄] $reason — 앱이 누른 줄(${session.alarmTappedCard?.let { "${it.pickup}→${it.dropoff} ${it.fare}원" } ?: "없음"})과 대조하지 않는다")
    session.openedByApp = false
    session.alarmTappedCard = null
    session.alarmTappedAtMs = 0L
}

/**
 * 🔎 **채운 뒤 필터 한 번 — 읽기 → 채우기 → 모자라면 사진 뒤, 어느 배차망이든 같은 함수** (기사님 «같은 순서»).
 * 목록에서 모르던 값(하차 등)을 채운 뒤 같은 필터를 다시 건다. 성적표는 목록에서 이미 셌으므로 다시 세지 않는다(tally 없음).
 */
fun ScanContext.passesFilterAfterFill(order: SimplifiedOfficeOrder): Boolean {
    /**
     * 📅 **예약 — 채운 뒤에는 날 모름도 막는다** (`ReservationGate.passesAfterFill`).
     * 목록은 확실한 다른 날만 막고 날 모름을 들였다 — 상세에서 채워도 날을 모르면 여기서 막는다(«내일 걸 오늘 잡으면 사고다»).
     */
    val reservationOk = ReservationGate.passesAfterFill(order, scrapParser.reservationMode())
    if (!reservationOk && com.onedal.app.core.LogOnce.changed("reservation-after-fill:${order.id}", "${order.reserved}${order.reservedDay}"))
        AppLogger.i(TAG, LogTag.FILTER, "📅 [예약 막음] 채운 뒤 — $currentTargetApp · 예약 ${ReservationGate.wordOf(order)} ${order.reservedAt ?: ""} · ${order.pickup}→${order.dropoff}")
    return reservationOk && scrapParser.shouldClick(order)
}

/**
 * ✍️ **앱이 확정을 누르나** — 앱이 계약하는 콜(자동 모드) · 수락 칸이 있는 배차망 · **오늘 콜** (`AppPressesAcceptTest`).
 * 📅 내일 콜·날 모름은 자동이어도 누르지 않는다 — 미리보기로 올리고 기사님이 확정한다 (기사님 «가»).
 */
fun appPressesAccept(contractedByApp: Boolean, acceptButtons: List<String>?, order: SimplifiedOfficeOrder): Boolean =
    contractedByApp && acceptButtons != null && ReservationGate.isToday(order)
