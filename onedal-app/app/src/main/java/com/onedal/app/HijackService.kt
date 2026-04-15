package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.api.ApiClient
import com.onedal.app.core.AppKeywords
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.TelemetryManager
import com.onedal.app.models.DetailedOfficeOrder
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.DispatchDetailedRequest
import com.onedal.app.models.EmergencyReason
import com.onedal.app.models.EmergencyReport
import com.onedal.app.models.ScreenContext
import com.onedal.app.models.SimplifiedOfficeOrder
import android.os.Handler
import android.os.Looper
import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 1DAL 접근성 서비스 — 메인 관제탑
 *
 * 구현 완료:
 *   기능 1 — 시동 걸기 (4대 엔진 초기화)
 *   기능 2 — 화면 읽기 및 종류 판별 (키워드 사전 기반)
 *   기능 3 — 콜 목록 스캔 및 서버 보고 (LIST)
 *   기능 4 — 확정 화면 자동 팝업 서핑 (출발지/도착지 상세 수집)
 *   기능 6 — 상세 진입(PRE_CONFIRM) 시 /confirm 브리핑 전송
 */
class HijackService : AccessibilityService() {

    companion object {
        private const val TAG = "1DAL_MVP"
        private const val ISO_TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ss'Z'"
        private const val MAX_ORDER_HASH_CACHE = 100
        private const val ORDER_HASH_KEEP_COUNT = 50
        private const val MAX_TEXT_NODE_HEIGHT_PX = 400
        internal const val FARE_RANGE_MIN = 10.0
        internal const val FARE_RANGE_MAX = 9999.0
    }

    // ── 4대 엔진 ──
    private lateinit var apiClient: ApiClient
    private lateinit var telemetryManager: TelemetryManager
    private lateinit var scrapParser: ScrapParser
    private lateinit var touchManager: AutoTouchManager

    // ── 설정 ──
    private var keywords: ScreenKeywords = AppKeywords.INSUNG
    private var lastScreenFingerprint = 0
    private val processedOrderHashes = mutableSetOf<Int>()
    private var isDetailScrapSent = false

    // ── 팝업 자동 서핑 관련 상태 ──
    private enum class SurfingState {
        IDLE,
        WAITING_FOR_PICKUP_POPUP,
        WAITING_FOR_DROPOFF_POPUP,
        DONE
    }
    private var surfingState = SurfingState.IDLE
    private var accumulatedDetailText = ""
    private var lastDetailOrder: SimplifiedOfficeOrder? = null

    // ── 단일 세션 (리스트 -> 상세 -> 확정) 추적용 ID ──
    private var currentSessionOrderId = ""

    // ── AUTO 모드 사냥 및 제어 로직 ──
    private var isAutoSessionActive = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private var deathValleyRunnable: Runnable? = null
    private var isWaitingForServerDecision = false // 서버 판결 대기 중

    // [Safety Mode V3] SharedPreference에서 데스밸리 타이머 값 읽기
    private fun getDeathValleyTimeout(): Long {
        val prefs = getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
        return prefs.getLong("deathValleyTimeout", 30000L)
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 1: 시동 걸기
    // ════════════════════════════════════════════════════════════════

    override fun onServiceConnected() {
        super.onServiceConnected()

        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient) {}
        scrapParser = ScrapParser(this)
        touchManager = AutoTouchManager(this)

        telemetryManager.start()
        apiClient.fetchKeywords()
        updateScreenContext(ScreenContext.LIST)

        Log.i(TAG, "✅ 1DAL Service Connected!")
        Log.i(TAG, "  📡 ApiClient  (기기ID: ${apiClient.getDeviceId()})")
        Log.i(TAG, "  📤 Telemetry  (생존신고 시작)")
        Log.i(TAG, "  🔍 Parser     (${scrapParser.currentParserName()})")
        Log.i(TAG, "  👆 Touch      (준비 완료)")
        Log.i(TAG, "  🎯 Keywords   (인성콜)")
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

    // ════════════════════════════════════════════════════════════════
    //  기능 2: 화면 읽기 및 종류 판별 (이벤트 라우터)
    // ════════════════════════════════════════════════════════════════

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return
        val rootNode = rootInActiveWindow ?: return

        // 핑거프린트 비교 → 화면 변경 없으면 스킵
        val screenTexts = mutableListOf<String>()
        gatherNodeTexts(rootNode, screenTexts)
        val fingerprint = screenTexts.sorted().hashCode()
        if (fingerprint == lastScreenFingerprint) { rootNode.recycle(); return }
        lastScreenFingerprint = fingerprint

        val rawScreenStr = screenTexts.joinToString(" ")

        // 로딩 화면 → 무시
        if (keywords.loadingKeywords.any { rawScreenStr.contains(it) }) { rootNode.recycle(); return }

        // 수동/자동 복귀 감지: 기사님이 수동으로 이전화면(닫기, 취소 등) 이동 시 락 해제
        if (isAutoSessionActive && (rawScreenStr.contains("대기 중인 오더가 없") || 
            (rawScreenStr.contains("신규") && (rawScreenStr.contains("메시지함") || rawScreenStr.contains("거리"))))) {
            Log.d(TAG, "🚀 [복귀 감지] 리스트 화면으로 이탈 감지됨. 세션 락 해제 및 대기 모드 돌입")
            resetSessionState()
        }

        // 서버 판결 대기 중에는 다른 서핑 등 화면 분석 액션 무시
        if (isWaitingForServerDecision) {
            rootNode.recycle()
            return
        }

        // 화면 종류 판별 → 서버 통보
        val detected = detectScreenContext(rawScreenStr)
        updateScreenContext(detected)

        Log.d(TAG, "-------------------------------")
        Log.d(TAG, "📡 화면 변경 감지 | 화면: ${detected.value} | 모드: ${telemetryManager.currentMode}")
        Log.d(TAG, "🔍 [디버그] ${rawScreenStr.take(200)}")

        // 화면별 핸들러 라우팅
        when (detected) {
            ScreenContext.LIST -> handleListScreen(rootNode, screenTexts)
            ScreenContext.DETAIL_PRE_CONFIRM -> handlePreConfirmScreen(rootNode, screenTexts, rawScreenStr)
            ScreenContext.DETAIL_CONFIRMED -> handleConfirmedScreen(rootNode, screenTexts, rawScreenStr)
            ScreenContext.POPUP_PICKUP -> handlePickupPopup(rootNode, screenTexts)
            ScreenContext.POPUP_DROPOFF -> handleDropoffPopup(rootNode, screenTexts)
            else -> {} // UNKNOWN, POPUP_ERROR 등은 현재 별도 처리 없음
        }

        rootNode.recycle()
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 3: 콜 목록 스캔 및 서버 보고 (LIST 화면)
    // ════════════════════════════════════════════════════════════════

    private fun handleListScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        // 세션 초기화: 리스트로 돌아오면 이전 상세/서핑 상태 전부 리셋
        resetSessionState()

        val allNodes = mutableListOf<ScreenTextNode>()
        extractAllTextNodes(rootNode, allNodes)

        // 1) 요금처럼 생긴 숫자를 먼저 찾기
        val fareNodes = allNodes.filter { it.isFareCandidate() }

        // 2) 각 요금 노드의 같은 가로줄(Row) 텍스트를 한 세트로 묶어 파싱
        for (fareNode in fareNodes) {
            val rowNodes = allNodes.filter {
                it.rect.top < fareNode.rect.bottom && it.rect.bottom > fareNode.rect.top
            }
            val rowTexts = rowNodes.map { it.text }
            val order = scrapParser.parse(rowTexts)

            if (order.fare == 0) continue  // 파싱 실패 → 스킵

            val orderHash = (order.pickup + order.dropoff + order.fare.toString()).hashCode()
            if (processedOrderHashes.contains(orderHash)) continue

            // 🌟 [항시 인터셉터] 콜 필터 매칭 검사 (디버그 로그를 위해 MANUAL/AUTO 무관하게 항시 실행)
            val isTarget = scrapParser.shouldClick(order)

            // 🌟 [AUTO 실행] 사냥 중이지 않고 AUTO 모드일 때만 실제 클릭 동작 수행
            if (!isAutoSessionActive && telemetryManager.currentMode == "AUTO") {
                if (isTarget) {
                    Log.d(TAG, "💥 [AUTO] 꿀콜 조건 통과! 대상 콜 강제 터치 진행!")
                    touchManager.performSimulatedTouch(fareNode.node)
                    
                    isAutoSessionActive = true // 사냥 시작!
                    currentSessionOrderId = order.id
                    break // 첫 번째 발각콜 클릭 후 이 루프는 종료 (관제 보고 생략)
                }
            }

            // 4) 신규 콜 → 서버에 텔레메트리 보고
            processedOrderHashes.add(orderHash)
            telemetryManager.enqueue(order)
        }

        // 메모리 관리
        if (processedOrderHashes.size > MAX_ORDER_HASH_CACHE) {
            val keepers = processedOrderHashes.toList().takeLast(ORDER_HASH_KEEP_COUNT)
            processedOrderHashes.clear()
            processedOrderHashes.addAll(keepers)
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 6: 상세 화면(PRE_CONFIRM) → /confirm 브리핑 전송
    // ════════════════════════════════════════════════════════════════

    private fun handlePreConfirmScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
        // 잔상 방어: 팝업이 아직 닫히지 않았으면 무시
        if (isPopupResidue(rawScreenStr)) return

        if (isDetailScrapSent) return // 이미 전송함

        ensureSessionId()
        val order = buildOrderFromScreen(screenTexts)

        val request = DispatchBasicRequest(
            step = "BASIC",
            deviceId = apiClient.getDeviceId(),
            order = order,
            capturedAt = order.timestamp,
            matchType = telemetryManager.currentMode
        )

        apiClient.sendConfirm(request)

        Log.d(TAG, "📤 [post /confirm request] 서버 전송 내용 -> 모드: ${telemetryManager.currentMode} | 텍스트: ${rawScreenStr.take(150)}...")
        isDetailScrapSent = true
        
        // ⚡ AUTO 모드 확정 버튼 광클 (자동 사냥 중일 때만)
        if (isAutoSessionActive) {
            Log.d(TAG, "🚀 [AUTO] 확정 버튼 광클 (배차 시도)")
            touchManager.findAndClickByText(rootNode, "확정", isStartsWith = true)
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4: 확정 화면(CONFIRMED) → 자동 팝업 서핑 구동
    // ════════════════════════════════════════════════════════════════

    private fun handleConfirmedScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
        // 잔상 방어
        if (isPopupResidue(rawScreenStr)) return

        // 확정 화면에 처음 진입했을 때 서핑 시작!
        if (surfingState == SurfingState.IDLE) {
            ensureSessionId()
            lastDetailOrder = buildOrderFromScreen(screenTexts)
            accumulatedDetailText = screenTexts.joinToString("\n") + "\n"

            Log.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 확정 화면 진입 확인! 출발지 정보 확인을 위해 자동 클릭 시도")
            if (touchManager.findAndClickByText(rootNode, "출발지", isStartsWith = true) ||
                touchManager.findAndClickByText(rootNode, "상차", isStartsWith = true)) {
                surfingState = SurfingState.WAITING_FOR_PICKUP_POPUP
            } else {
                Log.e(TAG, "❌ [서핑 실패] 출발지 버튼을 찾을 수 없습니다.")
                surfingState = SurfingState.IDLE
            }
        }

        // 서핑 중: 출발지 팝업에서 돌아온 후 도착지 누르기
        else if (surfingState == SurfingState.WAITING_FOR_DROPOFF_POPUP) {
            Log.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 출발지 확인 완료. 도착지 정보 확인을 위해 자동 클릭 시도")
            touchManager.findAndClickByText(rootNode, "도착지", isStartsWith = true) ||
                touchManager.findAndClickByText(rootNode, "하차", isStartsWith = true)
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 출발지 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    private fun handlePickupPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        if (surfingState != SurfingState.WAITING_FOR_PICKUP_POPUP) return

        val multilineScreenStr = screenTexts.joinToString("\n")

        // 팝업 데이터 로딩 검증: "전화1"이 화면에 뜰 때까지 대기
        if (!multilineScreenStr.contains("전화1") && !multilineScreenStr.contains("도착지 상세")) {
            Log.d(TAG, "거짓 이벤트 무시: 아직 출발지 팝업 데이터 로딩 안됨")
            return
        }

        accumulatedDetailText += "[출발지상세]\n$multilineScreenStr\n"
        Log.d(TAG, "📝 출발지 스크래핑 성공! 닫기 버튼 누름")

        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        surfingState = SurfingState.WAITING_FOR_DROPOFF_POPUP
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 도착지 팝업 스크래핑 + /detail 전송
    // ════════════════════════════════════════════════════════════════

    private fun handleDropoffPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        if (surfingState != SurfingState.WAITING_FOR_DROPOFF_POPUP) return

        val multilineScreenStr = screenTexts.joinToString("\n")

        // 팝업 데이터 로딩 검증
        if (!multilineScreenStr.contains("전화1")) {
            Log.d(TAG, "거짓 이벤트 무시: 아직 도착지 팝업 데이터 로딩 안됨")
            return
        }

        accumulatedDetailText += "[도착지상세]\n$multilineScreenStr\n"
        Log.d(TAG, "📝 도착지 스크래핑 성공! 닫기 누름 및 전체 내용 /detail 로 발송")

        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        surfingState = SurfingState.DONE

        // /detail 서버 전송 (팝업 수집 완료)
        lastDetailOrder?.let { order ->
            val payload = DispatchDetailedRequest(
                step = "DETAILED",
                deviceId = apiClient.getDeviceId(),
                order = DetailedOfficeOrder(
                    id = order.id,
                    type = order.type,
                    pickup = order.pickup,
                    dropoff = order.dropoff,
                    fare = order.fare,
                    timestamp = order.timestamp,
                    rawText = accumulatedDetailText
                ),
                capturedAt = order.timestamp,
                matchType = telemetryManager.currentMode
            )

            // 서버 응답("KEEP", "CANCEL") 대기를 위한 데스밸리 타이머 가동
            startDeathValleyTimer()

            val previewStr = accumulatedDetailText.replace("\n", " ").take(150)
            Log.d(TAG, "🌐 [post /detail request] AUTO 모드 판결 요청 텍스트: $previewStr...")

            apiClient.sendDetail(payload) { serverId, action ->
                Log.d(TAG, "🔄 서버 판결 도착: ID=$serverId, ACTION=$action")
                executeDecisionImmediately(action)
            }
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  화면 판별 엔진 (키워드 사전 기반)
    // ════════════════════════════════════════════════════════════════

    private fun detectScreenContext(text: String): ScreenContext = when {
        keywords.errorKeywords.any { text.contains(it) }    -> ScreenContext.POPUP_ERROR
        keywords.pickupKeywords.any { text.contains(it) }   -> ScreenContext.POPUP_PICKUP
        keywords.dropoffKeywords.any { text.contains(it) }  -> ScreenContext.POPUP_DROPOFF
        keywords.detailKeywords.all { text.contains(it) }   -> if (keywords.confirmKeywords.any { text.contains(it) })
                                                                    ScreenContext.DETAIL_PRE_CONFIRM
                                                                else ScreenContext.DETAIL_CONFIRMED
        keywords.listRequired.all { text.contains(it) }     -> ScreenContext.LIST
        keywords.completedListRequired.all { text.contains(it) } -> ScreenContext.LIST_COMPLETED
        else -> ScreenContext.UNKNOWN
    }

    private fun updateScreenContext(context: ScreenContext) {
        telemetryManager.currentScreenContext = context
    }

    // ════════════════════════════════════════════════════════════════
    //  AUTO 제어 및 비상 복구 유틸리티
    // ════════════════════════════════════════════════════════════════

    /** 서버 응답 대기용 데스밸리 타이머 시작 (응답 없으면 자동 취소) */
    private fun startDeathValleyTimer() {
        if (!isAutoSessionActive) return // MANUAL 이면 서버가 취소권한 없음

        cancelDeathValleyTimer()
        isWaitingForServerDecision = true
        val timeoutMs = getDeathValleyTimeout()
        Log.w(TAG, "⏳ 데스밸리 타이머 시작: ${timeoutMs / 1000}초 대기...")

        deathValleyRunnable = Runnable {
            if (isWaitingForServerDecision) {
                Log.e(TAG, "🚨 데스밸리 타임아웃! 기사님 보호를 위해 강제 배차 취소 집행!")
                executeDecisionImmediately("CANCEL")
                sendEmergencyReport(EmergencyReason.AUTO_CANCEL, "데스밸리 응답 없음 강제취소")
            }
        }
        mainHandler.postDelayed(deathValleyRunnable!!, timeoutMs)
    }

    private fun cancelDeathValleyTimer() {
        deathValleyRunnable?.let { mainHandler.removeCallbacks(it) }
        deathValleyRunnable = null
        isWaitingForServerDecision = false
    }

    /** 서버 판결(KEEP/CANCEL) 결과 행동을 실제 화면 액션으로 쏨 */
    private fun executeDecisionImmediately(decision: String) {
        cancelDeathValleyTimer() // 타이머 해제
        if (!isAutoSessionActive) return // 이미 풀렸으면 스킵

        val rootNode = rootInActiveWindow
        if (rootNode == null) {
            resetSessionState()
            return
        }

        val targetBtnStr = if (decision == "KEEP") "닫기" else "취소"
        Log.d(TAG, "⚡ 판결 집행: 행동=$decision, 누를버튼=$targetBtnStr (버튼클릭을 시작합니다)")

        if (touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)) {
            Log.d(TAG, "🎉 행동 완료! 타겟($targetBtnStr) 명중.")
        } else {
            Log.e(TAG, "❌ 대상 버튼($targetBtnStr)을 찾을 수 없음.")
            sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "판결 $decision 의 대상 $targetBtnStr 버튼 누락")
        }

        // 세션 리셋
        resetSessionState()
        rootNode.recycle()
    }

    private fun sendEmergencyReport(reason: EmergencyReason, extraText: String = "") {
        val orderId = currentSessionOrderId.ifEmpty { "unknown" }
        val report = EmergencyReport(
            deviceId = apiClient.getDeviceId(),
            orderId = orderId,
            reason = reason.value,
            screenContext = telemetryManager.currentScreenContext.value,
            screenText = extraText,
            timestamp = nowTimestamp()
        )
        apiClient.sendEmergency(report)
    }

    // ════════════════════════════════════════════════════════════════
    //  헬퍼 함수
    // ════════════════════════════════════════════════════════════════

    /** 세션 상태 전체 초기화 (리스트 복귀 시 호출) */
    private fun resetSessionState() {
        isDetailScrapSent = false
        surfingState = SurfingState.IDLE
        accumulatedDetailText = ""
        lastDetailOrder = null
        currentSessionOrderId = ""
        isAutoSessionActive = false
        cancelDeathValleyTimer()
    }

    /** 세션 ID가 없으면 새로 생성 */
    private fun ensureSessionId() {
        if (currentSessionOrderId.isEmpty()) {
            val mode = telemetryManager.currentMode
            currentSessionOrderId = "$mode-${System.currentTimeMillis()}"
        }
    }

    /** 팝업 잔상이 화면에 남아있는지 검사 */
    private fun isPopupResidue(rawScreenStr: String): Boolean {
        return rawScreenStr.contains("출발지 상세") || rawScreenStr.contains("도착지 상세")
    }

    /** 현재 ISO 타임스탬프 생성 */
    private fun nowTimestamp(): String {
        return SimpleDateFormat(ISO_TIMESTAMP_FORMAT, Locale.getDefault()).format(Date())
    }

    /** 화면 텍스트에서 SimplifiedOfficeOrder 를 생성하는 공통 로직 */
    private fun buildOrderFromScreen(screenTexts: List<String>): SimplifiedOfficeOrder {
        val tempOrder = scrapParser.parse(screenTexts)
        val mode = telemetryManager.currentMode
        return SimplifiedOfficeOrder(
            id = currentSessionOrderId,
            type = "${mode}_CLICK",
            pickup = tempOrder.pickup.takeIf { it.isNotBlank() && it != "미상" } ?: "상태분석중",
            dropoff = tempOrder.dropoff.takeIf { it.isNotBlank() && it != "미상" } ?: "상태분석중",
            fare = tempOrder.fare,
            timestamp = nowTimestamp(),
            rawText = screenTexts.joinToString(" ")
        )
    }

    // ════════════════════════════════════════════════════════════════
    //  텍스트 수집 유틸리티
    // ════════════════════════════════════════════════════════════════

    /** 핑거프린트용 경량 수집 (텍스트만) */
    private fun gatherNodeTexts(node: AccessibilityNodeInfo?, out: MutableList<String>) {
        if (node == null) return
        node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
        node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
        for (i in 0 until node.childCount) gatherNodeTexts(node.getChild(i), out)
    }

    /** 파싱용 좌표 포함 수집 (거대 컨테이너 제외) */
    private fun extractAllTextNodes(node: AccessibilityNodeInfo?, out: MutableList<ScreenTextNode>) {
        if (node == null) return
        val text = node.text?.toString()?.trim() ?: node.contentDescription?.toString()?.trim()
        if (!text.isNullOrEmpty()) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (rect.height() < MAX_TEXT_NODE_HEIGHT_PX && rect.width() > 0) out.add(ScreenTextNode(text, node, rect))
        }
        for (i in 0 until node.childCount) extractAllTextNodes(node.getChild(i), out)
    }
}

// ════════════════════════════════════════════════════════════════
//  데이터 모델
// ════════════════════════════════════════════════════════════════

/** 화면에서 추출된 텍스트 한 칸 (좌표 + 노드 참조 포함) */
data class ScreenTextNode(
    val text: String,
    val node: AccessibilityNodeInfo,
    val rect: Rect
) {
    /** 이 텍스트가 차종(Row의 기준축)인지 판별 (예: "오", "다", "라", "1t" 등) */
    fun isFareCandidate(): Boolean {
        return text.matches(Regex("^(오|다|라|1t|1\\.4|2\\.5t?|3\\.5t?|5t|11t|14t|18t|25t)$"))
    }
}
