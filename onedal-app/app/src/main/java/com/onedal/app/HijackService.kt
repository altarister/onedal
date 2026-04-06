package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.api.ApiClient
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.TelemetryManager
import com.onedal.app.models.DetailedOfficeOrder
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.DispatchDetailedRequest
import com.onedal.app.models.SimplifiedOfficeOrder

enum class DispatchState {
    SEARCHING,           // 리스트 감시 중
    CLICKED_LIST,        // 리스트 클릭 후 상세페이지 대기 (확정 버튼 클릭 대기)
    CLICKED_CONFIRM,     // 확정 클릭 후 확정페이지 로딩 대기 (적요상세 버튼 대기)
    SCRAPING_MEMO,       // 적요상세 페이지 열림 대기 및 스크래핑
    MEMO_DONE,           // 적요상세 닫은 후 메인 복귀 대기 (출발지 버튼 대기)
    SCRAPING_PICKUP,     // 출발지 페이지 열림 대기 및 스크래핑
    PICKUP_DONE,         // 출발지 닫은 후 메인 복귀 대기 (도착지 버튼 대기)
    SCRAPING_DROPOFF,    // 도착지 페이지 열림 대기 및 스크래핑
    WAITING_DECISION,    // /detail 전송 후 롱폴링 응답 대기
    EXECUTING_DECISION   // 결과(KEEP/CANCEL) 수신 후 '닫기'/'취소' 버튼 누르기
}

/**
 * 접근성 서비스 메인 관제탑 (Orchestrator)
 *
 * ★ 핵심 아키텍처: Scan → Judge → Shoot ★
 * 2-Step 아키텍처 구현체
 */
class HijackService : AccessibilityService() {

    companion object {
        private const val TAG = "1DAL_MVP"
    }

    private lateinit var apiClient: ApiClient
    private lateinit var telemetryManager: TelemetryManager
    private lateinit var scrapParser: ScrapParser
    private lateinit var touchManager: AutoTouchManager

    private var lastSeenTextCounts = mapOf<String, Int>()
    private var isKickedOut = false

    // State Machine 변수
    private var currentState = DispatchState.SEARCHING
    private var stateTimestamp = 0L
    private var currentOrder: DetailedOfficeOrder? = null
    private var serverDecision: String? = null // "KEEP" or "CANCEL"

    // 화면 변경 감지용 핑거프린트 (화면 텍스트의 해시)
    private var lastScreenFingerprint = 0
    private val processedOrderHashes = mutableSetOf<Int>()

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "1DAL Service Connected! [Scan→Judge→Shoot 2-Step Architecture]")

        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient) {
            isKickedOut = true
            Log.w(TAG, "🔴 원격 서버 명령에 의해 접근성 권한 스위치를 스스로 해제합니다")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                disableSelf()
            }
        }
        scrapParser = ScrapParser(this)
        touchManager = AutoTouchManager(this)

        telemetryManager.start()
    }

    override fun onInterrupt() {
        telemetryManager.stop()
    }

    override fun onDestroy() {
        super.onDestroy()
        telemetryManager.stop()
        apiClient.shutdown()
    }

    private fun transitionTo(newState: DispatchState) {
        currentState = newState
        stateTimestamp = System.currentTimeMillis()
        lastScreenFingerprint = 0  // 핑거프린트 리셋 → 새 상태에서 첫 화면 변경을 감지하도록
        Log.d(TAG, "🔄 State Changed: $newState")
    }

    private fun checkTimeout() {
        if (currentState != DispatchState.SEARCHING && currentState != DispatchState.WAITING_DECISION) {
            if (System.currentTimeMillis() - stateTimestamp > 12000) {
                Log.w(TAG, "⏰ 12초 타임아웃 발생! 화면 꼬임 방지를 위해 SEARCHING 상태로 강제 롤백합니다.")
                transitionTo(DispatchState.SEARCHING)
                currentOrder = null
            }
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (isKickedOut) return
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return
        val rootNode = rootInActiveWindow ?: return

        checkTimeout()

        // ═══ 화면 변경 감지 (핑거프린트 비교) ═══
        if (currentState != DispatchState.WAITING_DECISION) {
            val screenTexts = mutableListOf<String>()
            collectTextsOnly(rootNode, screenTexts)
            val currentFingerprint = screenTexts.sorted().hashCode()
            
            if (currentFingerprint == lastScreenFingerprint) {
                // 화면이 아직 안 바뀜 → 이번 이벤트는 건너뜀
                rootNode.recycle()
                return
            }
            lastScreenFingerprint = currentFingerprint
            
            // 화면이 바뀔 때마다 구분선 + 현재 상태 로깅
            Log.d(TAG, "-------------------------------")
            Log.d(TAG, "📡 화면 변경 감지 | 상태: $currentState")
        }

        // ════════════════════════════════════════
        // State Machine 로직
        // ════════════════════════════════════════
        when (currentState) {
            DispatchState.SEARCHING -> {
                val allNodes = mutableListOf<ScreenTextNode>()
                extractAllTextNodes(rootNode, allNodes)
                
                // 1) 요금 후보(Fare)만 먼저 추출합니다.
                val fareNodes = allNodes.filter { it.isFareCandidate() }
                
                // 2) 각 요금 노드별로 동일한 가로줄(Row)에 속하는 텍스트들을 모아 파싱합니다.
                var clickedSomething = false
                
                for (fareNode in fareNodes) {
                    // 수평 밴드 검사: Y센터가 fareNode의 Y 영역과 겹치거나 인접한 노드들을 한 줄로 간주
                    val rowNodes = allNodes.filter { 
                        it.rect.top < fareNode.rect.bottom && it.rect.bottom > fareNode.rect.top 
                    }
                    
                    val rowTexts = rowNodes.map { it.text }
                    val order = scrapParser.parse(rowTexts)
                    
                    if (order.fare == 0) continue // 파싱 실패 시 스킵
                    
                    // 주문 해시 (동일한 콜을 중복 클릭하지 않기 위함)
                    val orderHash = (order.pickup + order.dropoff + order.fare.toString() + (order.rawText?.hashCode() ?: 0)).hashCode()
                    if (processedOrderHashes.contains(orderHash)) continue
                    
                    // 신규 콜이면 필터 검사
                    val shouldClick = scrapParser.shouldClick(order)
                    if (shouldClick) {
                        Log.d(TAG, "💥 [1단계] 4대 조건 통과! Y좌표 그룹핑 명중! 타겟 클릭 실행!")
                        touchManager.performSimulatedTouch(fareNode.node)
                        
                        currentOrder = DetailedOfficeOrder(
                            id = order.id, type = order.type, pickup = order.pickup,
                            dropoff = order.dropoff, fare = order.fare, timestamp = order.timestamp,
                            rawText = order.rawText
                        )
                        processedOrderHashes.add(orderHash)
                        transitionTo(DispatchState.CLICKED_LIST)
                        clickedSomething = true
                        break // 하나만 선점하고 즉시 탈출
                    } else if (order.fare > 0 || rowTexts.size >= 4) {
                        processedOrderHashes.add(orderHash)
                        telemetryManager.enqueue(order)
                    }
                }
                
                // 불필요 메모리가 쌓이지 않도록 최대 100개 제한
                if (processedOrderHashes.size > 100) {
                    val keepers = processedOrderHashes.toList().takeLast(50)
                    processedOrderHashes.clear()
                    processedOrderHashes.addAll(keepers)
                }
            }

            DispatchState.CLICKED_LIST -> {
                // "확정" 텍스트가 포함된 버튼을 찾아 누름 (예: "확정(10)")
                if (touchManager.findAndClickByText(rootNode, "확정", isStartsWith = true)) {
                    Log.d(TAG, "🚀 [1차 BASIC] 확정 클릭! 서버에 Confirm 전송")
                    val payload = DispatchBasicRequest(
                        step = "BASIC",
                        deviceId = apiClient.getDeviceId(),
                        order = SimplifiedOfficeOrder(
                            id = currentOrder!!.id, pickup = currentOrder!!.pickup,
                            dropoff = currentOrder!!.dropoff, fare = currentOrder!!.fare,
                            timestamp = currentOrder!!.timestamp, rawText = currentOrder!!.rawText
                        ),
                        capturedAt = currentOrder!!.timestamp
                    )
                    apiClient.sendConfirm(payload)
                    transitionTo(DispatchState.CLICKED_CONFIRM)
                }
            }

            DispatchState.CLICKED_CONFIRM -> {
                /*
                 * [적요상세 클릭 보류] 나중에 필요시 복구
                 * if (touchManager.findAndClickByText(rootNode, "적요상세", isStartsWith = false)) {
                 *     transitionTo(DispatchState.SCRAPING_MEMO)
                 * }
                 */
                 
                // 확정페이지(메인) 로딩 이벤트 진입 시: 적요 즉시 스크랩 후 "출발지" 광클!
                val texts = mutableListOf<String>()
                collectTextsOnly(rootNode, texts)
                currentOrder = currentOrder?.copy(itemDescription = texts.joinToString("\n"))
                Log.d(TAG, "📝 메인 적요내용 즉시 0초 스크래핑 완료 (클릭 생략)")
                
                if (touchManager.findAndClickByText(rootNode, "출발지", isStartsWith = true) || touchManager.findAndClickByText(rootNode, "상차", isStartsWith = true)) {
                    transitionTo(DispatchState.SCRAPING_PICKUP)
                } else {
                    transitionTo(DispatchState.SEARCHING) // 비상 복구
                }
            }

            DispatchState.SCRAPING_MEMO -> { } // 사용 안함
            DispatchState.MEMO_DONE -> { } // 사용 안함

            DispatchState.SCRAPING_PICKUP -> {
                // 출발지 팝업 화면 이벤트 진입 시: 진짜 팝업인지 검증
                val pickupTexts = mutableListOf<String>()
                collectTextsOnly(rootNode, pickupTexts)
                val pickupRaw = pickupTexts.joinToString("\n")
                
                // 가짜 잔상 이벤트 필터링: "출발" 또는 "출발지" 타이틀이 없으면 패스 (도착지랑 혼동 방지를 위해 단순화)
                // 보통 팝업 맨 위에 "출발지 상세"가 뜹니다.
                if (!pickupRaw.contains("출발지 상세") && !pickupRaw.contains("전화1")) {
                    Log.d(TAG, "거짓 이벤트 무시: 아직 출발지 팝업 안 뜸")
                    return
                }

                currentOrder = currentOrder?.copy(rawText = currentOrder!!.rawText + "\n[출발지상세]\n" + pickupRaw)
                Log.d(TAG, "📝 출발지 즉시 0초 스크래핑 완료! 닫기 누름")
                
                touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
                transitionTo(DispatchState.PICKUP_DONE)
            }

            DispatchState.PICKUP_DONE -> {
                // 출발지 팝업 닫히고 다시 메인 복귀 이벤트 진입 시: 잔상 방어
                val checkTexts = mutableListOf<String>()
                collectTextsOnly(rootNode, checkTexts)
                if (checkTexts.joinToString("\n").contains("출발지 상세")) {
                    Log.d(TAG, "거짓 이벤트 무시: 아직 출발지 팝업이 안 닫힘! 대기 중..")
                    return
                }

                // "도착지" 광클!
                if (touchManager.findAndClickByText(rootNode, "도착지", isStartsWith = true) || touchManager.findAndClickByText(rootNode, "하차", isStartsWith = true)) {
                    transitionTo(DispatchState.SCRAPING_DROPOFF)
                } else {
                    // 도착지를 못 찾으면 아직 메인 화면으로 완전히 안 돌아온 것이므로 이벤트 무시 (대기)
                    Log.d(TAG, "거짓 이벤트 무시: 도착지 버튼 활성화 안됨")
                }
            }

            DispatchState.SCRAPING_DROPOFF -> {
                // 도착지 팝업 화면 이벤트 진입 시: 진짜 팝업인지 검증
                val dropTexts = mutableListOf<String>()
                collectTextsOnly(rootNode, dropTexts)
                val dropoffRaw = dropTexts.joinToString("\n")
                
                // 가짜 잔상 이벤트 필터링
                if (!dropoffRaw.contains("도착지 상세") && !dropoffRaw.contains("전화1")) {
                    Log.d(TAG, "거짓 이벤트 무시: 아직 도착지 팝업 안 뜸")
                    return
                }

                currentOrder = currentOrder?.copy(rawText = currentOrder!!.rawText + "\n[도착지상세]\n" + dropoffRaw)
                Log.d(TAG, "📝 도착지 즉시 0초 스크래핑 완료! 닫기 및 2차 서버 보고 시작")
                
                touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
                
                val payload = DispatchDetailedRequest(
                    step = "DETAILED",
                    deviceId = apiClient.getDeviceId(),
                    order = currentOrder!!,
                    capturedAt = currentOrder!!.timestamp
                )
                apiClient.sendDetail(payload) { orderId, action ->
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        if (currentState == DispatchState.WAITING_DECISION && currentOrder?.id == orderId) {
                            serverDecision = action
                            transitionTo(DispatchState.EXECUTING_DECISION)
                        }
                    }
                }
                transitionTo(DispatchState.WAITING_DECISION)
            }

            DispatchState.WAITING_DECISION -> {
                // API 응답 올 때까지 무한 대기 (타임아웃 로직 대상 제외)
            }

            DispatchState.EXECUTING_DECISION -> {
                // KEEP 이면 "닫기" 버튼, CANCEL 이면 "취소" 버튼
                val targetBtnStr = if (serverDecision == "KEEP") "닫기" else "취소"
                Log.d(TAG, "⚔️ [최종 판결 집행] 행동=$serverDecision, 누를버튼=$targetBtnStr")
                
                val clicked = touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)
                if (clicked) {
                    Log.d(TAG, "🎉 사이클 완료! 타겟($targetBtnStr) 명중.")
                    transitionTo(DispatchState.SEARCHING)
                } else {
                    // 화면 로딩 지연 대응: 아직 버튼이 안 떴을 수 있음 (타임아웃 12초 내 계속 재시도)
                }
            }
        }

        rootNode.recycle()
    }

    private fun extractAllTextNodes(node: AccessibilityNodeInfo?, list: MutableList<ScreenTextNode>) {
        if (node == null) return
        val text = node.text?.toString()?.trim() ?: node.contentDescription?.toString()?.trim()
        if (!text.isNullOrEmpty()) {
            val rect = android.graphics.Rect()
            node.getBoundsInScreen(rect)
            list.add(ScreenTextNode(text, node, rect))
        }
        for (i in 0 until node.childCount) {
            extractAllTextNodes(node.getChild(i), list)
        }
    }

    /**
     * 화면 핑거프린트 생성을 위한 경량 텍스트 수집기.
     * 요금 후보 감지 없이 텍스트만 빠르게 모읍니다.
     */
    private fun collectTextsOnly(node: AccessibilityNodeInfo?, texts: MutableList<String>) {
        if (node == null) return
        val nodeText = node.text?.toString()?.trim()
        if (!nodeText.isNullOrEmpty()) texts.add(nodeText)
        val contentDesc = node.contentDescription?.toString()?.trim()
        if (!contentDesc.isNullOrEmpty()) texts.add(contentDesc)
        for (i in 0 until node.childCount) {
            collectTextsOnly(node.getChild(i), texts)
        }
    }
}

data class ScreenTextNode(val text: String, val node: AccessibilityNodeInfo, val rect: android.graphics.Rect) {
    fun isFareCandidate(): Boolean {
        val numValueStr = text.replace(",", "")
        val isIntegerPattern = numValueStr.toIntOrNull() != null && !numValueStr.contains(".")
        val isDecimalPattern = numValueStr.toDoubleOrNull() != null && (numValueStr.endsWith(".0") || numValueStr.endsWith(".5"))
        if (isIntegerPattern || isDecimalPattern) {
            val value = numValueStr.toDoubleOrNull() ?: 0.0
            return value in 10.0..9999.0
        }
        return false
    }
}
