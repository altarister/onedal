package com.onedal.app.backup

import android.accessibilityservice.AccessibilityService
import android.content.Context
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
import com.onedal.app.models.EmergencyReport
import com.onedal.app.models.EmergencyReason
import com.onedal.app.models.ScreenContext
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
    EXECUTING_DECISION,  // 결과(KEEP/CANCEL) 수신 후 '닫기'/'취소' 버튼 누르기
    MANUAL_STANDBY       // 수동 배차 스크랩 완료 후 기사님의 수동 조작 대기 상태
}

/**
 * 접근성 서비스 메인 관제탑 (Orchestrator)
 *
 * ★ 핵심 아키텍처: Scan → Judge → Shoot ★
 * Safety Mode V3: Smart Server, Dumb Client
 */
class HijackService : AccessibilityService() {

    companion object {
        private const val TAG = "1DAL_MVP"
        private const val DEFAULT_DEATHVALLEY_MS = 30000L  // 기본 데스밸리 타이머 (30초)
        private const val SCRAPING_TIMEOUT_MS = 15000L     // 스크래핑 단계 타임아웃 (15초)
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
    private var lastManualScrapeTime = 0L

    // [Safety Mode V3] 데스밸리 자동취소 타이머
    private val mainHandler = Handler(Looper.getMainLooper())
    private var deathValleyRunnable: Runnable? = null

    // [Safety Mode V3] SharedPreference에서 데스밸리 타이머 값 읽기
    private fun getDeathValleyTimeout(): Long {
        val prefs = getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
        return prefs.getLong("deathValleyTimeout", DEFAULT_DEATHVALLEY_MS)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "1DAL Service Connected! [Safety Mode V3 — Smart Server, Dumb Client]")

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
        apiClient.fetchKeywords()
        updateScreenContext(ScreenContext.LIST) // 시작 시 리스트 상태
    }

    override fun onInterrupt() {
        telemetryManager.stop()
        cancelDeathValleyTimer()
    }

    override fun onDestroy() {
        super.onDestroy()
        telemetryManager.stop()
        cancelDeathValleyTimer()
        apiClient.shutdown()
    }

    /**
     * [Safety Mode V3] 화면 상태를 TelemetryManager에 동기화하고 즉시 서버로 발송
     */
    private fun updateScreenContext(context: ScreenContext) {
        val changed = telemetryManager.currentScreenContext != context
        telemetryManager.currentScreenContext = context
        Log.d(TAG, "📱 ScreenContext → ${context.value}")
        
        // 화면 상태가 바뀌었다면 1초 대기 없이 즉시 서버에 텔레메트리를 쏘도록 강제
        if (changed) {
            telemetryManager.forceFlushEvent()
        }
    }

    private fun transitionTo(newState: DispatchState) {
        currentState = newState
        stateTimestamp = System.currentTimeMillis()
        lastScreenFingerprint = 0  // 핑거프린트 리셋 → 새 상태에서 첫 화면 변경을 감지하도록
        Log.d(TAG, "🔄 State Changed: $newState")

        // [Safety Mode V3] 상태 전이 시 ScreenContext 자동 매핑
        when (newState) {
            DispatchState.SEARCHING -> {
                updateScreenContext(ScreenContext.LIST)
                cancelDeathValleyTimer() // 검색 모드에서는 타이머 불필요
            }
            DispatchState.CLICKED_LIST -> updateScreenContext(ScreenContext.DETAIL_PRE_CONFIRM)
            DispatchState.CLICKED_CONFIRM -> updateScreenContext(ScreenContext.DETAIL_CONFIRMED)
            DispatchState.SCRAPING_PICKUP -> updateScreenContext(ScreenContext.POPUP_PICKUP)
            DispatchState.PICKUP_DONE -> updateScreenContext(ScreenContext.DETAIL_CONFIRMED)
            DispatchState.SCRAPING_DROPOFF -> updateScreenContext(ScreenContext.POPUP_DROPOFF)
            DispatchState.WAITING_DECISION -> {
                updateScreenContext(ScreenContext.WAITING_SERVER)
                startDeathValleyTimer() // 데스밸리 카운트다운 시작!
            }
            DispatchState.EXECUTING_DECISION -> {
                updateScreenContext(ScreenContext.DETAIL_CONFIRMED)
                cancelDeathValleyTimer()
            }
            else -> {}
        }
    }

    /**
     * [Safety Mode V3] 데스밸리 자동취소 타이머 시작
     * 서버 응답이 없으면 설정된 시간(기본 30초) 후 스스로 취소 실행
     */
    private fun startDeathValleyTimer() {
        cancelDeathValleyTimer()
        val timeoutMs = getDeathValleyTimeout()
        Log.w(TAG, "⏳ 데스밸리 타이머 시작: ${timeoutMs / 1000}초")

        deathValleyRunnable = Runnable {
            if (currentState == DispatchState.WAITING_DECISION) {
                Log.e(TAG, "🚨🚨🚨 데스밸리 ${timeoutMs / 1000}초 만료! 자동취소 집행!")
                // 서버 응답 콜백 대신 직접 CANCEL 실행
                serverDecision = "CANCEL"
                transitionTo(DispatchState.EXECUTING_DECISION)
                executeDecisionImmediately("CANCEL")
                // 자동취소 실행 후 서버에 비상 보고
                sendEmergencyReport(EmergencyReason.AUTO_CANCEL, "데스밸리 타임아웃 자동취소")
            }
        }
        mainHandler.postDelayed(deathValleyRunnable!!, timeoutMs)
    }

    /**
     * [Safety Mode V3] 서버 판결이나 데스밸리 타임아웃 직후 
     * AccessibilityEvent(화면 변경)를 기다리지 않고 즉시 클릭을 시도합니다.
     */
    private fun executeDecisionImmediately(decision: String) {
        val rootNode = rootInActiveWindow ?: return
        val targetBtnStr = if (decision == "KEEP") "닫기" else "취소"
        Log.d(TAG, "⚡ 즉시 판결 집행 시도: 행동=$decision, 누를버튼=$targetBtnStr")
        
        val clicked = touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)
        if (clicked) {
            Log.d(TAG, "🎉 사이클 완료! 타겟($targetBtnStr) 명중.")
            transitionTo(DispatchState.SEARCHING)
            currentOrder = null
        }
        rootNode.recycle()
    }

    private fun cancelDeathValleyTimer() {
        deathValleyRunnable?.let { mainHandler.removeCallbacks(it) }
        deathValleyRunnable = null
    }

    /**
     * [Safety Mode V3] 서버에 비상 보고 전송
     */
    private fun sendEmergencyReport(reason: EmergencyReason, extraText: String = "") {
        val orderId = currentOrder?.id ?: "unknown"
        val screenText = extraText.ifEmpty { "state=$currentState" }
        val report = EmergencyReport(
            deviceId = apiClient.getDeviceId(),
            orderId = orderId,
            reason = reason.value,
            screenContext = telemetryManager.currentScreenContext.value,
            screenText = screenText,
            timestamp = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).format(java.util.Date())
        )
        apiClient.sendEmergency(report)
    }

    /**
     * [Safety Mode V3] 스크래핑 단계(CLICKED_LIST ~ SCRAPING_DROPOFF) 전용 타임아웃
     * WAITING_DECISION과 SEARCHING은 제외
     */
    private fun checkScrapingTimeout() {
        val scrapingStates = setOf(
            DispatchState.CLICKED_LIST,
            DispatchState.CLICKED_CONFIRM,
            DispatchState.SCRAPING_MEMO,
            DispatchState.MEMO_DONE,
            DispatchState.SCRAPING_PICKUP,
            DispatchState.PICKUP_DONE,
            DispatchState.SCRAPING_DROPOFF
        )
        if (currentState in scrapingStates) {
            if (System.currentTimeMillis() - stateTimestamp > SCRAPING_TIMEOUT_MS) {
                Log.w(TAG, "⏰ 스크래핑 15초 타임아웃! 비상 복구 시작")
                updateScreenContext(ScreenContext.UNKNOWN)
                sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "스크래핑 타임아웃 state=$currentState")
                transitionTo(DispatchState.SEARCHING)
                currentOrder = null
            }
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (isKickedOut) return
        if (event == null) return

        // ═══ 수동 배차 조작 감지 (MANUAL_STANDBY 상태 한정) ═══
        // 기사님이 앱에서 최종적으로 "닫기"(확정)나 "취소"를 누르는 시점을 포착하여 서버로 직통 통보
        if (currentState == DispatchState.MANUAL_STANDBY && event.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            val texts = mutableListOf<String>()
            event.text?.forEach { texts.add(it.toString()) }
            event.contentDescription?.let { texts.add(it.toString()) }
            
            // event.text가 비어있을 수 있으므로 (레이아웃 클릭 등), 클릭된 source 노드 하위 텍스트도 긁어옵니다.
            event.source?.let { sourceNode ->
                gatherNodeTexts(sourceNode, texts)
                sourceNode.recycle()
            }
            
            val clickedText = texts.joinToString("").lowercase()
            Log.d(TAG, "👆 [디버그] 클릭된 영역 텍스트 추출 결과: '$clickedText'")

            if (clickedText.contains("닫기") || clickedText.contains("확인") || clickedText.contains("close") || clickedText.contains("ok") || clickedText.contains("confirm")) {
                Log.d(TAG, "👆 [버튼 감지] 앱에서 수동배차 후 리스트 복귀(닫기/확인) 버튼 터치됨")
                currentOrder?.let {
                    apiClient.sendDecision(it.id, "KEEP")
                }
                transitionTo(DispatchState.SEARCHING)
                currentOrder = null
                return
            } else if (clickedText.contains("취소") || clickedText.contains("cancel")) {
                Log.d(TAG, "👆 [버튼 감지] 앱에서 수동배차 후 [취소] 버튼 터치됨")
                currentOrder?.let {
                    apiClient.sendDecision(it.id, "CANCEL")
                }
                transitionTo(DispatchState.SEARCHING)
                currentOrder = null
                return
            }
        }

        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return
        val rootNode = rootInActiveWindow ?: return

        checkScrapingTimeout()

        // ═══ 화면 변경 감지 (핑거프린트 비교) ═══
        if (currentState != DispatchState.WAITING_DECISION) {
            val screenTexts = mutableListOf<String>()
            gatherNodeTexts(rootNode, screenTexts)
            val currentFingerprint = screenTexts.sorted().hashCode()
            
            if (currentFingerprint == lastScreenFingerprint) {
                // 화면이 아직 안 바뀜 → 이번 이벤트는 건너뜀
                rootNode.recycle()
                return
            }
            lastScreenFingerprint = currentFingerprint
            
            // [동적 화면 감지기] State Machine에만 의존하지 않고 실제 화면의 글자를 보고 상태를 강제 보정합니다.
            // 기사님이 수동으로 팝업을 열거나 닫을 때 서로 엇갈리는 현상을 원천 방지합니다.
            val rawScreenStr = screenTexts.joinToString(" ")
            if (rawScreenStr.contains("오더 조회") || rawScreenStr.contains("기다려 주십")) {
                // [수정] 기사님 피드백 반영: 로딩 화면은 일시적인 노이즈일 뿐이므로 완전히 무시합니다! 
                // 향후 화면 분할(인성1, 2) 시 로딩 팝업이 서로의 상태를 덮어씌우는 것을 방지하고 서버 폭격을 원천 차단합니다.
                rootNode.recycle()
                return
            } else if (rawScreenStr.contains("취소할 수 없") || rawScreenStr.contains("시간이 지나") || rawScreenStr.contains("실패")) {
                updateScreenContext(ScreenContext.POPUP_ERROR)
            } else if (rawScreenStr.contains("출발지 상세") || rawScreenStr.contains("상차지 상세")) {
                updateScreenContext(ScreenContext.POPUP_PICKUP)
            } else if (rawScreenStr.contains("도착지 상세") || rawScreenStr.contains("하차지 상세")) {
                updateScreenContext(ScreenContext.POPUP_DROPOFF)
            } else if (rawScreenStr.contains("적요상세") && rawScreenStr.contains("요금")) {
                // 버튼 라벨을 통해 확정(배차) 전/후 상태를 정밀하게 구분
                // 주의: 두 팝업 모두 '닫기' 버튼이 있을 수 있으므로, '확정/배차' 버튼 유무로 구분합니다.
                if (rawScreenStr.contains("확정") || rawScreenStr.contains("배차")) {
                    updateScreenContext(ScreenContext.DETAIL_PRE_CONFIRM)
                } else {
                    updateScreenContext(ScreenContext.DETAIL_CONFIRMED)
                    
                    // [번개치기 자동 스크래핑 로직] 수동 배차(확정) 감지 시
                    if (currentState == DispatchState.SEARCHING) {
                        val currentTime = System.currentTimeMillis()
                        if (currentTime - lastManualScrapeTime > 5000) { // 5초 쿨타임 (중복 방지)
                            Log.d(TAG, "⚡ 수동 확정 감지! 0.3초 번개치기 주소 스크래핑 체인 발동!")
                            lastManualScrapeTime = currentTime
                            
                            // 화면 텍스트를 임시 파싱하여 요금과 ID 등 기초 정보 추출
                            val tempOrder = scrapParser.parse(screenTexts)
                        
                        currentOrder = DetailedOfficeOrder(
                            id = tempOrder.id.takeIf { it.isNotEmpty() } ?: "MANUAL_${System.currentTimeMillis()}",
                            type = "MANUAL",
                            pickup = tempOrder.pickup,
                            dropoff = tempOrder.dropoff,
                            fare = tempOrder.fare,
                            timestamp = tempOrder.timestamp,
                            rawText = rawScreenStr
                        )
                        // 상하차지 스크래핑을 강제 트리거하기 위해 상태 이동
                        transitionTo(DispatchState.CLICKED_CONFIRM)
                        }
                    }
                }
            } else if (rawScreenStr.contains("신규") && (rawScreenStr.contains("메시지함") || rawScreenStr.contains("GPS") || rawScreenStr.contains("거리"))) {
                // 완전히 명확한 리스트 화면일 때만 리스트로 확정
                updateScreenContext(ScreenContext.LIST)
                if (currentState == DispatchState.MANUAL_STANDBY) {
                    Log.d(TAG, "🚀 [수동 모드 폴백] 기사님이 리스트로 복귀했습니다. 무조건 KEEP 전송 (취소 감지 로직 제거됨).")
                    currentOrder?.let { apiClient.sendDecision(it.id, "KEEP") }
                    transitionTo(DispatchState.SEARCHING)
                    currentOrder = null
                }
            } else if (currentState == DispatchState.SEARCHING) {
                // 혹시 모를 상황 대비 (기존 fallback 보존)
                updateScreenContext(ScreenContext.LIST)
            }

            // 화면이 바뀔 때마다 구분선 + 현재 상태 로깅
            Log.d(TAG, "-------------------------------")
            Log.d(TAG, "📡 화면 변경 감지 | 상태: $currentState | 화면: ${telemetryManager.currentScreenContext.value} | 모드: ${telemetryManager.currentMode}")
            if (telemetryManager.currentScreenContext == ScreenContext.LIST) {
                Log.d(TAG, "🔍 [디버그] 추출된 화면 텍스트 샘플: ${rawScreenStr.take(100)}")
            }
            if (currentState == DispatchState.MANUAL_STANDBY) {
                Log.d(TAG, "📸 [수동모드 화면 찰칵] 현재 화면의 모든 텍스트: ${rawScreenStr.replace('\n', ' ')}")
            }
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
                    
                    if (shouldClick && telemetryManager.currentMode == "AUTO") {
                        Log.d(TAG, "💥 [AUTO 모드] 4대 조건 통과! 타겟 자동 클릭 실행!")
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
                        // MANUAL 모드이거나 조건을 만족하지 못하면 클릭하지 않고 텔레메트리 관제탑 보고만 수행
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
                // 확정페이지(메인) 로딩 이벤트 진입 시: 적요 즉시 스크랩 후 "출발지" 광클!
                val texts = mutableListOf<String>()
                gatherNodeTexts(rootNode, texts)
                currentOrder = currentOrder?.copy(itemDescription = texts.joinToString("\n"))
                Log.d(TAG, "📝 메인 적요내용 즉시 0초 스크래핑 완료 (클릭 생략)")
                
                if (touchManager.findAndClickByText(rootNode, "출발지", isStartsWith = true) || touchManager.findAndClickByText(rootNode, "상차", isStartsWith = true)) {
                    transitionTo(DispatchState.SCRAPING_PICKUP)
                } else {
                    // 비상 복구: 출발지 버튼 못 찾으면 알 수 없는 화면
                    updateScreenContext(ScreenContext.UNKNOWN)
                }
            }

            DispatchState.SCRAPING_MEMO -> { } // 사용 안함
            DispatchState.MEMO_DONE -> { } // 사용 안함

            DispatchState.SCRAPING_PICKUP -> {
                // 출발지 팝업 화면 이벤트 진입 시: 진짜 팝업인지 검증
                val pickupTexts = mutableListOf<String>()
                gatherNodeTexts(rootNode, pickupTexts)
                val pickupRaw = pickupTexts.joinToString("\n")
                
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
                gatherNodeTexts(rootNode, checkTexts)
                if (checkTexts.joinToString("\n").contains("출발지 상세")) {
                    Log.d(TAG, "거짓 이벤트 무시: 아직 출발지 팝업이 안 닫힘! 대기 중..")
                    return
                }

                // "도착지" 광클!
                if (touchManager.findAndClickByText(rootNode, "도착지", isStartsWith = true) || 
                    touchManager.findAndClickByText(rootNode, "하차", isStartsWith = true)) {
                    transitionTo(DispatchState.SCRAPING_DROPOFF)
                } else {
                    Log.d(TAG, "거짓 이벤트 무시: 도착지 버튼 활성화 안됨")
                }
            }

            DispatchState.SCRAPING_DROPOFF -> {
                // 도착지 팝업 화면 이벤트 진입 시: 진짜 팝업인지 검증
                val dropTexts = mutableListOf<String>()
                gatherNodeTexts(rootNode, dropTexts)
                val dropoffRaw = dropTexts.joinToString("\n")
                
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
                        if (action == "ACK" || currentOrder?.type == "MANUAL") {
                            // 사후 동기화 (Post-Dispatch Sync) - 서버가 찾아낸 원래 ID로 즉시 덮어씌움
                            currentOrder?.let {
                                if (it.id != orderId) {
                                    Log.d(TAG, "🔄 [사후 동기화] 통신 완료. 현재 콜 ID 갱신: ${it.id} -> $orderId")
                                    currentOrder = it.copy(id = orderId)
                                }
                            }
                        } else if (currentState == DispatchState.WAITING_DECISION && currentOrder?.id == orderId) {
                            serverDecision = action
                            cancelDeathValleyTimer() // 서버 응답 수신! 타이머 해제
                            transitionTo(DispatchState.EXECUTING_DECISION)
                            executeDecisionImmediately(action)
                        }
                    }
                }
                
                if (currentOrder!!.type == "MANUAL") {
                    Log.d(TAG, "😎 [번개치기 완료] 수동 배차 스크래핑 통신 완료. 기사님의 조작을 대기하는 스탠바이 모드(MANUAL_STANDBY)로 진입합니다!")
                    transitionTo(DispatchState.MANUAL_STANDBY)
                    // 지금 currentOrder를 지우면 안됩니다. (LIST 복귀 시 지워짐)
                } else {
                    // 자동 모드일 때만 서버의 결재(KEEP/CANCEL)를 기다리는 데스밸리 진입
                    transitionTo(DispatchState.WAITING_DECISION)
                }
            }

            DispatchState.WAITING_DECISION -> {
                // 서버 응답 또는 데스밸리 타이머 만료까지 대기
                // (데스밸리 타이머가 만료되면 자동으로 EXECUTING_DECISION으로 전이됨)
            }

            DispatchState.EXECUTING_DECISION -> {
                // KEEP 이면 "닫기" 버튼, CANCEL 이면 "취소" 버튼
                val targetBtnStr = if (serverDecision == "KEEP") "닫기" else "취소"
                Log.d(TAG, "⚔️ [최종 판결 집행] 행동=$serverDecision, 누를버튼=$targetBtnStr")
                
                val clicked = touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)
                if (clicked) {
                    Log.d(TAG, "🎉 사이클 완료! 타겟($targetBtnStr) 명중.")
                    transitionTo(DispatchState.SEARCHING)
                    currentOrder = null
                } else {
                    // [Safety Mode V3] 화면 텍스트를 검사하여 이상 팝업 감지
                    val currentTexts = mutableListOf<String>()
                    gatherNodeTexts(rootNode, currentTexts)
                    val screenText = currentTexts.joinToString("\n")

                    // "취소할 수 없습니다" / "시간이 지나" 등 취소 불가 팝업 감지
                    if (screenText.contains("취소할 수 없") || screenText.contains("시간이 지나")) {
                        Log.e(TAG, "🚨 취소 불가 팝업 감지! 서버에 비상 보고!")
                        updateScreenContext(ScreenContext.POPUP_ERROR)
                        sendEmergencyReport(EmergencyReason.CANCEL_EXPIRED, screenText.take(300))
                        // 팝업 닫기 시도 후 SEARCHING 복귀
                        touchManager.findAndClickByText(rootNode, "확인", isStartsWith = false)
                        transitionTo(DispatchState.SEARCHING)
                        currentOrder = null
                    } else if (telemetryManager.currentScreenContext == ScreenContext.LIST) {
                        Log.e(TAG, "🚨 [Safety] 팝업이 닫혀서 이미 리스트 화면으로 이탈했습니다! 버튼(${targetBtnStr}) 찾기 포기 후 비상 보고.")
                        sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "EXECUTING_DECISION 상태에서 버튼(${targetBtnStr})을 찾을 수 없고 이미 리스트 화면임.")
                        transitionTo(DispatchState.SEARCHING)
                        currentOrder = null
                    }
                    // 그 외: 화면 지연을 대비하여 다음 AccessibilityEvent 까지 대기
                }
            }
            
            DispatchState.MANUAL_STANDBY -> {
                // 기사님이 수동으로 배차를 완료하고 화면을 응시 중이거나 조작 중인 상태입니다.
                // 이 상태에서는 아무것도 하지 않고 대기합니다.
                // (기사님이 리스트로 복귀하면 onAccessibilityEvent 최상단 LIST 감지 로직에 의해 SEARCHING 으로 돌아갑니다)
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
            // 웹뷰는 부모 컨테이너가 텍스트를 전부 짬뽕해서 들고 있는 경우가 잦음. 세로가 400px 이상이면 단일 줄이 아니므로 무시.
            if (rect.height() < 400 && rect.width() > 0) {
                list.add(ScreenTextNode(text, node, rect))
            }
        }
        for (i in 0 until node.childCount) {
            extractAllTextNodes(node.getChild(i), list)
        }
    }

    /**
     * 화면 핑거프린트 생성을 위한 경량 텍스트 수집기.
     * 요금 후보 감지 없이 텍스트만 빠르게 모읍니다.
     */
    private fun gatherNodeTexts(node: AccessibilityNodeInfo?, texts: MutableList<String>) {
        if (node == null) return
        val nodeText = node.text?.toString()?.trim()
        if (!nodeText.isNullOrEmpty()) texts.add(nodeText)
        val contentDesc = node.contentDescription?.toString()?.trim()
        if (!contentDesc.isNullOrEmpty()) texts.add(contentDesc)
        for (i in 0 until node.childCount) {
            gatherNodeTexts(node.getChild(i), texts)
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
        
        // [목업 테스트 전용 지원] 웹앱 렌더링 시 띄어쓰기 없이 "거리출발지도착지차종요금" 이 하나로 뭉쳐 나오는 경우
        // 예: "9.549.4경기 수원시-대구 동구라84" 처럼 차종(오|다|라|1t 등) 바로 뒤에 요금이 찰싹 붙어있는 경우
        val mockupRegex = Regex("""(?:오|다|라|1t|1\.4|2\.5t?|3\.5t?|5t|11t|14t|18t|25t)(\d+(?:\.\d+)?)""")
        val match = mockupRegex.find(text)
        if (match != null) {
            val value = match.groupValues[1].toDoubleOrNull() ?: 0.0
            return value in 10.0..9999.0
        }
        return false
    }
}
