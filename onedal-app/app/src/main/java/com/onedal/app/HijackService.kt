package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import com.onedal.app.core.AppLogger
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
    private val recentListOrders = mutableListOf<SimplifiedOfficeOrder>()
    private enum class SurfingState {
        IDLE,
        WAITING_FOR_MEMO_POPUP,
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

        AppLogger.roadmap("[0초] 인성앱 실행 후 1DAL앱 접근성 권한 on", telemetryManager.currentScreenContext.name)
        AppLogger.i(TAG, "✅ 1DAL Service Connected!")
        AppLogger.i(TAG, "  📡 ApiClient  (기기ID: ${apiClient.getDeviceId()})")
        AppLogger.i(TAG, "  📤 Telemetry  (생존신고 시작)")
        AppLogger.i(TAG, "  🔍 Parser     (${scrapParser.currentParserName()})")
        AppLogger.i(TAG, "  👆 Touch      (준비 완료)")
        AppLogger.i(TAG, "  🎯 Keywords   (인성콜)")
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
            AppLogger.d(TAG, "[복귀 감지] 리스트 화면으로 이탈 감지됨. 세션 락 해제 및 대기 모드 돌입")
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

        

        AppLogger.d(TAG, "-------------------------------")
        AppLogger.roadmap("📡 화면 변경 감지 | 모드: ${telemetryManager.currentMode}", telemetryManager.currentScreenContext.name)
        // AppLogger.roadmap("새로운 화면 진입 판별: ${detected.value}", telemetryManager.currentScreenContext.name)
        // AppLogger.d(TAG, "📡 화면 변경 감지 | 화면: ${detected.value} | 모드: ${telemetryManager.currentMode}")
        // AppLogger.d(TAG, "🔍 [디버그] ${rawScreenStr.take(200)}")

        // 화면별 핸들러 라우팅
        when (detected) {
            ScreenContext.LIST -> handleListScreen(rootNode, screenTexts)
            ScreenContext.DETAIL_PRE_CONFIRM -> handlePreConfirmScreen(rootNode, screenTexts, rawScreenStr)
            ScreenContext.DETAIL_CONFIRMED -> handleConfirmedScreen(rootNode, screenTexts, rawScreenStr)
            ScreenContext.POPUP_MEMO -> handleMemoPopup(rootNode, screenTexts)
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
                    AppLogger.roadmap("AccessibilityService로 바뀐 리스트 감지 후 text 추출", telemetryManager.currentScreenContext.name)
                    AppLogger.d(TAG, "💥 [AUTO] 꿀콜 조건 통과! 대상 콜 강제 터치 진행!")
                    
                    // 🚀 [지뢰 탐지기] 2차 똥콜 판명 후 리스트로 튕겨나왔을 때 또 누르는 것을 방지하기 위해 터치 직전에 지문 선(先)등재!
                    AppLogger.d(TAG, "📝 [AUTO] 2차 검증 반송(취소)에 대비해 해당 콜 지문 선(先)기록 완료 (해시: $orderHash)")
                    processedOrderHashes.add(orderHash)
                    
                    AppLogger.roadmap("리스트에서 바뀐 text 감지 후 text 추출", telemetryManager.currentScreenContext.name)
                    touchManager.performSimulatedTouch(fareNode.node)
                    AppLogger.roadmap("[인성 Socket] 인성콜에 선택된 콜 정보 전달 (꿀콜 클릭!)", telemetryManager.currentScreenContext.name)
                    
                    isAutoSessionActive = true // 사냥 시작!
                    currentSessionOrderId = order.id
                    lastDetailOrder = order // [오파싱 방지] 상세 진입 후 사용할 원본 데이터 쥐어주기
                    break // 첫 번째 발각콜 클릭 후 이 루프는 종료 (관제 보고 생략)
                }
            }

            // 4) 신규 콜 → 서버에 텔레메트리 보고
            processedOrderHashes.add(orderHash)
            telemetryManager.enqueue(order)
            recentListOrders.add(order)
        }

        // 메모리 관리
        if (processedOrderHashes.size > MAX_ORDER_HASH_CACHE) {
            val keepers = processedOrderHashes.toList().takeLast(ORDER_HASH_KEEP_COUNT)
            processedOrderHashes.clear()
            processedOrderHashes.addAll(keepers)
        }
        if (recentListOrders.size > MAX_ORDER_HASH_CACHE) {
            val keepers = recentListOrders.takeLast(ORDER_HASH_KEEP_COUNT)
            recentListOrders.clear()
            recentListOrders.addAll(keepers)
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 6: 상세 화면(PRE_CONFIRM) → /confirm 브리핑 전송
    // ════════════════════════════════════════════════════════════════

    private fun handlePreConfirmScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
        // 잔상 방어: 팝업이 아직 닫히지 않았으면 무시
        if (isPopupResidue(rawScreenStr)) return

        if (isDetailScrapSent) return // 이미 전송/결정함

        ensureSessionId()
        
        AppLogger.roadmap("상세페이지 진입", telemetryManager.currentScreenContext.name)
        
        // 화면에서 임시 추출
        val tempOrder = scrapParser.parse(screenTexts)
        
        // 최근 LIST 화면에서 파싱된 원본 오더 중 요금이 일치하는 콜 역추적 매칭 (전표오염 회피)
        val matchedOrder = recentListOrders.reversed().find { it.fare > 0 && it.fare == tempOrder.fare }

        val finalOrder = if (isAutoSessionActive && lastDetailOrder != null) {
            // AUTO 모드는 이미 클릭 시점에 order를 가지고 있음
            lastDetailOrder!!.copy(
                type = "AUTO_CLICK",
                rawText = rawScreenStr
            )
        } else if (matchedOrder != null) {
            // MANUAL 클릭인데 캐시 매칭에 성공한 경우 (원본 데이터 재활용)
            matchedOrder.copy(
                id = currentSessionOrderId.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
                type = "${telemetryManager.currentMode}_CLICK",
                rawText = rawScreenStr
            )
        } else {
            // 캐시 매칭 모두 실패 시 (임시 폴백 - 오파싱 가능성 있음)
            tempOrder.copy(
                id = currentSessionOrderId.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
                type = "${telemetryManager.currentMode}_CLICK",
                pickup = tempOrder.pickup.takeIf { it.isNotBlank() && it != "미상" } ?: "수집중(상세확인필요)",
                dropoff = tempOrder.dropoff.takeIf { it.isNotBlank() && it != "미상" } ?: "수집중(상세확인필요)",
                timestamp = nowTimestamp(),
                rawText = rawScreenStr
            )
        }

        if (currentSessionOrderId.isEmpty()) {
            currentSessionOrderId = finalOrder.id
        }
        
        lastDetailOrder = finalOrder // 팝업 서핑용으로 최종 갱신
        
        AppLogger.roadmap("상세페이지 데이터(확정,적요상세,출발지,도착지) 추출", telemetryManager.currentScreenContext.name)
        AppLogger.roadmap("추출된 데이터로 한번더 필터링", telemetryManager.currentScreenContext.name)
        
        val isTarget = scrapParser.shouldClick(finalOrder)

        if (!isAutoSessionActive || isTarget) {
            // [수동 클릭] 이거나 [AUTO이면서 2차 필터 통과] -> 서버 보고
            val request = DispatchBasicRequest(
                step = "BASIC",
                deviceId = apiClient.getDeviceId(),
                order = finalOrder,
                capturedAt = finalOrder.timestamp,
                matchType = telemetryManager.currentMode
            )

            apiClient.sendConfirm(request)
            AppLogger.d(TAG, "📤 [post /confirm request] 서버 전송 내용 -> 모드: ${telemetryManager.currentMode} | 텍스트: ${rawScreenStr.take(150)}...")
            isDetailScrapSent = true
            
            // ⚡ AUTO 모드 확정 버튼 광클 (자동 사냥 중일 때만)
            if (isAutoSessionActive) {
                AppLogger.d(TAG, "🚀 [AUTO] 확정 버튼 광클 (배차 시도)")
                AppLogger.roadmap("상세페이지에서 '확정' 추출 후 클릭", telemetryManager.currentScreenContext.name)
                AppLogger.roadmap("[인성 Socket] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                touchManager.findAndClickByText(rootNode, "확정", isStartsWith = true)
            }
        } else {
            // [AUTO 모드이면서 2차 필터 실패] -> 서버 보고 생략하고 즉시 취소 버튼 회피 기동
            isDetailScrapSent = true // 다음 사이클 스킵을 위해 마킹
            AppLogger.d(TAG, "⚠️ [2차 필터 실패] 상세 정보를 확인한 결과 똥콜(블랙리스트 등)로 판명됨. '취소' 회피 기동!")
            
            AppLogger.roadmap("상세페이지에서 '취소' 추출 후 클릭", telemetryManager.currentScreenContext.name)
            if (!touchManager.findAndClickByText(rootNode, "취소", isStartsWith = true)) {
                touchManager.performBack()
            }
            
            AppLogger.roadmap("리스트 페이지 진입", telemetryManager.currentScreenContext.name)
            // 세션 초기화를 통해 다음 꿀콜 대기 상태로 복귀
            resetSessionState()
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4: 확정 화면(CONFIRMED) → 자동 팝업 서핑 구동
    // ════════════════════════════════════════════════════════════════

    private fun handleConfirmedScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
        // 잔상 방어
        if (isPopupResidue(rawScreenStr)) return

        // 확정 화면에 처음 진입했을 때 서핑 시작! (적요상세 → 출발지 → 도착지 순서)
        if (surfingState == SurfingState.IDLE) {
            AppLogger.roadmap("확정페이지 진입", telemetryManager.currentScreenContext.name)
            ensureSessionId()
            
            // lastDetailOrder는 PRE_CONFIRM에서 안전하게 매칭/세팅되었으므로 재파싱하지 않음
            if (lastDetailOrder == null) {
                lastDetailOrder = buildOrderFromScreen(screenTexts)
            }
            
            accumulatedDetailText = screenTexts.joinToString("\n") + "\n"

            AppLogger.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 확정 화면 진입 확인! 적요상세 팝업 호출 시도")
            if (touchManager.findAndClickByText(rootNode, "적요상세", isStartsWith = true)) {
                AppLogger.roadmap("확정페이지에서 '적요상세' 추출 후 클릭", telemetryManager.currentScreenContext.name)
                AppLogger.i(TAG, "📋 [SEQ 81] 적요상세 버튼 클릭 → 적요 정보 요청")
                surfingState = SurfingState.WAITING_FOR_MEMO_POPUP
            } else if (touchManager.findAndClickByText(rootNode, "출발지", isStartsWith = true) ||
                       touchManager.findAndClickByText(rootNode, "상차", isStartsWith = true)) {
                AppLogger.w(TAG, "⚠️ 적요상세 버튼을 찾을 수 없습니다. 곧바로 출발지 서핑으로 넘어갑니다.")
                AppLogger.i(TAG, "📋 [SEQ 82] 출발지/상차 클릭 → 출발지 정보 요청")
                surfingState = SurfingState.WAITING_FOR_PICKUP_POPUP
            } else {
                AppLogger.w(TAG, "⚠️ [서핑 대기] 팝업 호출 버튼(적요상세/출발지)을 찾지 못했습니다. (대기)")
                return // 다음 UI 업데이트 이벤트를 기다림
            }
        }
        
        // 서핑 중: 적요상세 팝업에서 돌아온 후 출발지 누르기
        else if (surfingState == SurfingState.WAITING_FOR_PICKUP_POPUP) {
            AppLogger.roadmap("확정페이지 진입", telemetryManager.currentScreenContext.name)
            AppLogger.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 적요 정보 확인 완료. 출발지 정보 확인을 위해 자동 클릭 시도")
            AppLogger.roadmap("확정페이지에서 '출발지' 추출 후 클릭", telemetryManager.currentScreenContext.name)
            if (touchManager.findAndClickByText(rootNode, "출발지", isStartsWith = true) ||
                touchManager.findAndClickByText(rootNode, "상차", isStartsWith = true)) {
                // 클릭 성공 시
            } else {
                AppLogger.w(TAG, "⚠️ [서핑 대기] 출발지/상차 버튼을 찾지 못했습니다.")
                return
            }
        }

        // 서핑 중: 출발지 팝업에서 돌아온 후 도착지 누르기
        else if (surfingState == SurfingState.WAITING_FOR_DROPOFF_POPUP) {
            AppLogger.roadmap("확정페이지 진입", telemetryManager.currentScreenContext.name)
            AppLogger.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 출발지 확인 완료. 도착지 정보 확인을 위해 자동 클릭 시도")
            AppLogger.roadmap("확정페이지에서 '도착지' 추출 후 클릭", telemetryManager.currentScreenContext.name)
            if (touchManager.findAndClickByText(rootNode, "도착지", isStartsWith = true) ||
                touchManager.findAndClickByText(rootNode, "하차", isStartsWith = true)) {
                // 클릭 성공 시 별도 처리 없음 (다음 팝업 이벤트를 기다림)
            } else {
                AppLogger.w(TAG, "⚠️ [서핑 대기] 팝업은 닫혔으나 도착지/하차 버튼을 찾지 못했습니다. (대기)")
                return
            }
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 적요 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    private fun handleMemoPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        if (surfingState != SurfingState.WAITING_FOR_MEMO_POPUP) return

        val multilineScreenStr = screenTexts.joinToString("\n")

        // 팝업 데이터 로딩 검증: "적요 내용" 헤더가 보여야 로딩 완료
        if (!multilineScreenStr.contains("적요 내용")) {
            AppLogger.d(TAG, "거짓 이벤트 무시: 아직 적요상세 팝업 데이터 로딩 안됨")
            return
        }

        accumulatedDetailText += "[적요상세/정보]\n$multilineScreenStr\n"
        AppLogger.d(TAG, "📝 적요 스크래핑 성공! 닫기 버튼 누름")
        AppLogger.i(TAG, "📋 [SEQ 81-82] 적요상세 추출 완료 → 닫기")

        AppLogger.roadmap("적요상세페이지에서 '젹요 내용' 추출 및 저장 후 닫기 클릭", telemetryManager.currentScreenContext.name)
        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        surfingState = SurfingState.WAITING_FOR_PICKUP_POPUP
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 출발지 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    private fun handlePickupPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        if (surfingState != SurfingState.WAITING_FOR_PICKUP_POPUP) return

        val multilineScreenStr = screenTexts.joinToString("\n")

        // 팝업 데이터 로딩 검증: "전화1"이 화면에 뜰 때까지 대기
        if (!multilineScreenStr.contains("전화1") && !multilineScreenStr.contains("도착지 상세")) {
            AppLogger.d(TAG, "거짓 이벤트 무시: 아직 출발지 팝업 데이터 로딩 안됨")
            return
        }

        accumulatedDetailText += "[출발지상세]\n$multilineScreenStr\n"
        AppLogger.d(TAG, "📝 출발지 스크래핑 성공! 닫기 버튼 누름")

        AppLogger.roadmap("출발지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭", telemetryManager.currentScreenContext.name)
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
            AppLogger.d(TAG, "거짓 이벤트 무시: 아직 도착지 팝업 데이터 로딩 안됨")
            return
        }

        accumulatedDetailText += "[도착지상세]\n$multilineScreenStr\n"
        AppLogger.d(TAG, "📝 도착지 스크래핑 성공! 닫기 누름 및 전체 내용 /detail 로 발송")

        AppLogger.roadmap("도착지페이지 text중 '전화, 위치' 추출 및 저장 후 닫기 클릭", telemetryManager.currentScreenContext.name)
        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        surfingState = SurfingState.DONE
        AppLogger.roadmap("확정페이지 진입", telemetryManager.currentScreenContext.name)

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
            AppLogger.d(TAG, "🌐 [post /detail request] AUTO 모드 판결 요청 텍스트: $previewStr...")

            apiClient.sendDetail(payload) { serverId, action ->
                AppLogger.d(TAG, "🔄 서버 판결 도착: ID=$serverId, ACTION=$action")
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
        // 적요 팝업: "적요 상세"(띄어쓰기) + "적요 내용" → 확정화면("적요상세" 붙여쓰기)과 구분
        keywords.memoKeywords.all { text.contains(it) }     -> ScreenContext.POPUP_MEMO
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
        AppLogger.w(TAG, "⏳ 데스밸리 타이머 시작: ${timeoutMs / 1000}초 대기...")

        deathValleyRunnable = Runnable {
            if (isWaitingForServerDecision) {
                AppLogger.e(TAG, "🚨 데스밸리 타임아웃! 기사님 보호를 위해 강제 배차 취소 집행!")
                sendEmergencyReport(EmergencyReason.AUTO_CANCEL, "데스밸리 응답 없음 강제취소")
                executeDecisionImmediately("CANCEL")
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

        val targetBtnStr = if (decision == "KEEP") "닫기" else "취소"
        AppLogger.d(TAG, "⚡ 판결 집행: 행동=$decision, 누를버튼=$targetBtnStr (버튼클릭을 시작합니다), 500ms 지연")
        
        mainHandler.postDelayed({
            val rootNode = rootInActiveWindow
            if (rootNode == null) {
                resetSessionState()
                return@postDelayed
            }
            if (touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)) {
                if (decision == "KEEP") AppLogger.roadmap("'닫기' 클릭 후 리스트 페이지 복귀 (유지)", telemetryManager.currentScreenContext.name)
                else AppLogger.roadmap("'취소' 클릭 후 인성 Socket 취소 지시", telemetryManager.currentScreenContext.name)
                AppLogger.d(TAG, "🎉 행동 완료! 타겟(\$targetBtnStr) 명중.")
            } else {
                AppLogger.e(TAG, "❌ 대상 버튼($targetBtnStr)을 찾을 수 없음.")
                sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "판결 $decision 의 대상 $targetBtnStr 버튼 누락")
            }
            rootNode.recycle()
        }, 500)

        // 세션 리셋
        resetSessionState()
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
        val resid = rawScreenStr.contains("출발지 상세") || rawScreenStr.contains("도착지 상세")
        if (resid) AppLogger.roadmap("✋ [Race Condition 방어] 출발지/도착지 팝업 닫힘 애니메이션 잔상 대기", telemetryManager.currentScreenContext.name)
        return resid
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
