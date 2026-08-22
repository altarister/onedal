package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import com.onedal.app.core.AppLogger
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.api.ApiClient
import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.core.engine.SessionManager
import com.onedal.app.core.engine.PopupSurfingMachine
import com.onedal.app.core.engine.SafeCancelTimer
import com.onedal.app.core.engine.CautionDongVerifier
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
import android.content.BroadcastReceiver
import android.content.Intent
import android.content.IntentFilter
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
        /**
         * 🔴 **시각에는 시간대를 함께 실어 보낸다** (2026-08-16).
         *
         * 예전 형식은 `yyyy-MM-dd'T'HH:mm:ss'Z'` 였다 — **한국 시각을 찍고 뒤에 글자 `Z`(=UTC)를
         * 붙인** 것이다. 서버는 그걸 UTC 로 읽으니 **9시간이 밀렸다.**
         *
         * 실측(2026-08-16): 09:10 KST 에 잡은 콜이 `2026-08-16T09:10:12Z` 로 저장돼
         * 서버가 18:10 KST 로 읽었고, 상차 마감이 19:10 이 되어
         * 화면에 **"대기 572분"** (맞게는 32분)이 떴다.
         *
         * `Z` 대신 `XXX` 를 쓰면 `+09:00` 이 붙어 어느 시간대에서 찍었는지가 값에 남는다.
         */
        private const val ISO_TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"
        private const val MAX_ORDER_HASH_CACHE = 100
        private const val ORDER_HASH_KEEP_COUNT = 50
        private const val MAX_TEXT_NODE_HEIGHT_PX = 400
        internal const val FARE_RANGE_MIN = 10.0
        internal const val FARE_RANGE_MAX = 9999.0

        // 🚨 [동명이동 방어] CAUTION_DONGS는 CautionDongVerifier.CAUTION_DONGS로 이동
    }

    // ── 4대 엔진 ──
    private lateinit var apiClient: ApiClient
    private lateinit var telemetryManager: TelemetryManager
    private lateinit var scrapParser: ScrapParser
    private lateinit var touchManager: AutoTouchManager

    // ── 설정 ──
    private lateinit var keywords: ScreenKeywords
    private val screenDetector = ScreenDetector()
    private var lastScreenFingerprint = 0
    private val processedOrderHashes = mutableSetOf<Int>()
    private var currentTargetApp = "insung"

    // ── 세션 상태 (SessionManager로 통합) ──
    private val session = SessionManager()
    private lateinit var surfingMachine: PopupSurfingMachine
    private val recentListOrders = mutableListOf<SimplifiedOfficeOrder>()

    // ── AUTO 모드 타이머 ──
    private val mainHandler = Handler(Looper.getMainLooper())
    private val safeCancelTimer = SafeCancelTimer()
    private lateinit var cautionVerifier: CautionDongVerifier

    // [Safety Mode V3] SharedPreference에서 안전취소 타이머 값 읽기
    private fun getSafeCancelTimeout(): Long {
        val prefs = getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
        return prefs.getLong("safeCancelTimeout", 30000L)
    }

    // 화면 꺼짐/켜짐 감지용 리시버 (퇴근 시 즉시 오프라인 통보 / 출근 시 즉시 생존 신고)
    private val screenOffReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Intent.ACTION_SCREEN_OFF) {
                AppLogger.roadmap("📵 화면 꺼짐 감지 → 서버로 퇴근(OFFLINE) 보고", "OFFLINE")
                AppLogger.w(TAG, "📵 [Screen Off 감지] 기사님 퇴근 또는 화면 꺼짐! 즉시 서버로 오프라인 통보!")
                apiClient.sendOffline()
            } else if (intent?.action == Intent.ACTION_SCREEN_ON) {
                AppLogger.roadmap("💡 화면 켜짐 감지 → 서버로 출근(ONLINE) 보고", "ONLINE")
                AppLogger.w(TAG, "💡 [Screen On 감지] 화면 켜짐! 즉시 서버로 생존 신고(ONLINE)!")
                telemetryManager.forceHeartbeat()
            }
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 1: 시동 걸기
    // ════════════════════════════════════════════════════════════════

    override fun onServiceConnected() {
        super.onServiceConnected()

        val prefs = getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
        val targetApp = prefs.getString("targetApp", "인성콜") ?: "인성콜"
        currentTargetApp = if (targetApp == "24시") "hwamul24" else "insung"

        keywords = if (targetApp == "24시") {
            Hwamul24Keywords.TWENTYFOUR
        } else {
            InsungKeywords.INSUNG
        }

        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient, this)  // [GPS 텔레메트리] context 전달하여 위치 조회 가능하도록
        scrapParser = ScrapParser(this, targetApp)
        
        AppLogger.i(TAG, "🎯 타겟 앱 설정 완료: $targetApp")

        touchManager = AutoTouchManager(this)
        surfingMachine = PopupSurfingMachine(touchManager)
        cautionVerifier = CautionDongVerifier(this)

        telemetryManager.start()
        apiClient.fetchKeywords()
        updateScreenContext(ScreenContext.LIST)

        // [Piggyback V2] 서버(관제탑) 결재 수신 콜백 연결 및 고스트 응답 방어(Ghost Defense)
        telemetryManager.decisionCallback = { receivedOrderId, action ->
            if (receivedOrderId.isNotEmpty() && receivedOrderId != session.currentOrderId) {
                AppLogger.e(TAG, "👻 [Ghost Defense 발동!] 수신된 ID($receivedOrderId)가 현재 폰에 열려있는 오더 ID($session.currentOrderId)와 다릅니다! 과거 허깨비 응답을 폐기합니다.")
            } else {
                AppLogger.w(TAG, "🛡️ [정상 결재 수신] ID 일치($receivedOrderId). 즉각 폐기/유지 액션을 집행합니다. (Action: $action)")
                executeDecisionImmediately(action)
            }
        }

        // 화면 켜짐/꺼짐 이벤트 수신 등록
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        }
        registerReceiver(screenOffReceiver, filter)

        AppLogger.roadmap("🟢 1DAL 서비스 가동 완료 (접근성 권한 승인, Telemetry·GPS 엔진 가동)", "STARTUP")
        AppLogger.i(TAG, "✅ 1DAL Service Connected!")
        // 어떤 빌드가 실제로 돌고 있는지 로그로 못박아 둔다 (설치 버전 혼동 방지)
        AppLogger.i(TAG, "  📦 BUILD      ${com.onedal.app.core.AppInfo.versionLabel(this)}")
        AppLogger.i(TAG, "  📡 ApiClient  (기기ID: ${apiClient.getDeviceId()})")
        AppLogger.i(TAG, "  📤 Telemetry  (생존신고 시작)")
        AppLogger.i(TAG, "  🔍 Parser     (${scrapParser.currentParserName()})")
        AppLogger.i(TAG, "  👆 Touch      (준비 완료)")
        AppLogger.i(TAG, "  🎯 Keywords   (인성콜)")
    }

    override fun onInterrupt() {
        telemetryManager.stop()
        cancelSafeCancelTimer()
        apiClient.sendOffline() // 접근성 권한 해제 시 오프라인 통보
        AppLogger.roadmap("⚠️ 1DAL 서비스 일시 중지 (접근성 권한 해제)", "INTERRUPT")
        AppLogger.w(TAG, "⚠️ 1DAL Service Interrupted! (접근성 권한 일시 중지)")
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(screenOffReceiver)
        telemetryManager.stop()
        cancelSafeCancelTimer()
        apiClient.sendOffline() // 앱 종료 시 오프라인 통보
        apiClient.shutdown()
        AppLogger.roadmap("🛑 1DAL 서비스 완전 종료 (앱 파괴)", "SHUTDOWN")
        AppLogger.w(TAG, "🛑 1DAL Service Destroyed! (완전 종료)")
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
        if (screenDetector.isLoading(rawScreenStr, keywords)) { rootNode.recycle(); return }

        // 화면 종류 판별 및 서버(텔레메트리) 즉각 동기화
        val detected = detectScreenContext(rawScreenStr)
        if (detected == ScreenContext.UNKNOWN) {
            AppLogger.w(TAG, "🔎 [UNKNOWN 화면 진단] 읽힌 텍스트(${rawScreenStr.length}자): ${rawScreenStr.take(300)}")
        }
        // ⚠️ 아래 복귀 판정이 **직전 화면**을 봐야 하므로 갱신 전에 붙잡아 둔다
        val previous = telemetryManager.currentScreenContext
        updateScreenContext(detected)

        /**
         * 수동/자동 복귀 감지: 기사님이 닫기·취소·뒤로가기로 리스트에 돌아오면 락을 푼다.
         *
         * 🔴 2026-08-13 — 예전에는 **"지금 화면이 LIST 냐"** 만 봤다. 그래서
         *    자동 터치 **직후**(상세가 아직 안 그려져 화면이 여전히 LIST)에도 걸려
         *    `resetSessionState()` 가 `isAutoActive` 를 꺼 버렸다.
         *
         *    실측 (05:16:18, 0.3초 사이):
         *      .397  💥 [AUTO] 꿀콜 조건 통과! 강제 터치 진행!     ← isAutoActive = true
         *      .704  [복귀 감지] LIST 화면으로 이탈 감지됨          ← 아직 LIST · 오탐
         *      .705  🔄 세션 상태 완전 초기화                      ← isAutoActive = false
         *      19.06 모드: MANUAL (매크로클릭: false)              ← AUTO 인데 MANUAL 로 보고
         *
         *    그 한 글자가 서버의 배차 흐름을 통째로 바꾼다. MANUAL 은 안전취소 없이
         *    즉시 확정되고, 앱이 리스트로 이탈해도 서버가 안 치운다(일부러 그렇게 설계됐다 —
         *    기사님이 손으로 잡은 콜을 서버가 버리면 안 되므로). 그래서 유령이 남았다.
         *
         * 문서(`SCREEN_STATE_MACHINE.md`)의 상태 기계가 정답을 갖고 있었다.
         *      LIST               --> DETAIL_PRE_CONFIRM : 콜 클릭
         *      DETAIL_PRE_CONFIRM --> LIST               : 취소 · 뒤로가기
         * 리셋이 필요한 건 **두 번째 전이**다. 즉 "지금 LIST" 가 아니라 **"LIST 로 돌아왔다"**.
         * 그래서 직전 화면이 리스트가 아니었을 때만 복귀로 친다.
         *
         * (타이머로 유예를 주는 방법도 있지만, 몇 밀리초를 줘야 하는지에 근거가 없다.
         *  화면 전이는 이미 상태로 표현돼 있으므로 그걸 쓴다)
         */
        val isListScreen = detected == ScreenContext.LIST ||
                           detected == ScreenContext.LIST_COMPLETED ||
                           rawScreenStr.contains("대기 중인 오더가 없")
        val wasListScreen = previous == ScreenContext.LIST || previous == ScreenContext.LIST_COMPLETED
        if (isListScreen && !wasListScreen) {
            if (session.hasActiveSession()) {
                AppLogger.d(TAG, "[복귀 감지] ${previous.name} → ${detected.name} 복귀. 세션 및 안전취소 락 완전 해제")
                resetSessionState()
            }
        }

        // 서버 판결 대기 중에는 화면 내 버튼 탐색이나 서핑(클릭 액션) 무시
        if (session.isWaitingForDecision) {
            rootNode.recycle()
            return
        }

        AppLogger.d(TAG, "-------------------------------")
        AppLogger.roadmap("📡 화면 변경 감지 | 화면: ${detected.value} | 모드: ${telemetryManager.currentMode}", telemetryManager.currentScreenContext.name)

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

        // 앱별 앵커 노드 감지 및 텍스트 그룹화 로직을 파서(ScrapParser)로 위임
        val groupedNodes = scrapParser.groupListNodes(allNodes)

        // 각 요금 노드 기준으로 텍스트 세트를 묶어 파싱
        for ((fareNode, cardTexts) in groupedNodes) {
            val order = scrapParser.parse(cardTexts)

            if (order.fare == 0) continue  // 파싱 실패 → 스킵

            val orderHash = (order.pickup + order.dropoff + order.fare.toString()).hashCode()
            if (processedOrderHashes.contains(orderHash)) continue

            // 🌟 [항시 인터셉터] 콜 필터 매칭 검사 (디버그 로그를 위해 MANUAL/AUTO 무관하게 항시 실행)
            val isTarget = scrapParser.shouldClick(order)

            // 🌟 [AUTO 실행] 콜 잡기 중이지 않고 AUTO 모드일 때만 실제 클릭 동작 수행
            if (!session.isAutoActive && telemetryManager.currentMode == "AUTO") {
                if (isTarget) {
                    AppLogger.roadmap("🎯 [Current Page: LIST] 1차 필터 통과 → AUTO 타겟 발견, 강제 터치 진행", telemetryManager.currentScreenContext.name)
                    AppLogger.d(TAG, "💥 [AUTO] 꿀콜 조건 통과! 대상 콜 강제 터치 진행!")
                    
                    // 🚀 [지뢰 탐지기] 2차 똥콜 판명 후 리스트로 튕겨나왔을 때 또 누르는 것을 방지하기 위해 터치 직전에 지문 선(先)등재!
                    AppLogger.d(TAG, "📝 [AUTO] 2차 검증 반송(취소)에 대비해 해당 콜 지문 선(先)기록 완료 (해시: $orderHash)")
                    processedOrderHashes.add(orderHash)
                    
                    val appLabel = keywords.appLabel
                    AppLogger.roadmap("리스트에서 바뀐 text 감지 후 text 추출", telemetryManager.currentScreenContext.name)
                    touchManager.performSimulatedTouch(fareNode.node)
                    AppLogger.roadmap("[$appLabel] 선택된 콜 정보 전달 (꿀콜 클릭!)", telemetryManager.currentScreenContext.name)
                    
                    session.isAutoActive = true // 콜 잡기 시작!
                    session.setOrderId(order.id)
                    session.lastDetailOrder = order // [오파싱 방지] 상세 진입 후 사용할 원본 데이터 쥐어주기
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

        if (session.isDetailScrapSent) return // 이미 전송/결정함

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
            // 캐시 매칭 모두 실패 시 (임시 폴백 - 오파싱 가능성 있음)
            tempOrder.copy(
                id = session.currentOrderId.ifEmpty { "MANUAL-${System.currentTimeMillis()}" },
                type = "MANUAL_CLICK",
                pickup = tempOrder.pickup.takeIf { it.isNotBlank() && it != "배차값없음" } ?: "수집중(상세확인필요)",
                dropoff = tempOrder.dropoff.takeIf { it.isNotBlank() && it != "배차값없음" } ?: "수집중(상세확인필요)",
                timestamp = nowTimestamp(),
                rawText = rawScreenStr
            )
        }

        if (session.currentOrderId.isEmpty()) {
            session.setOrderId(finalOrder.id)
        }

        session.lastDetailOrder = finalOrder // 팝업 서핑용으로 최종 갱신

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
         * ⚠️ **필터콜(앱이 누른 것)은 건드리지 않는다.** 거기서 팝업을 먼저 열면 광클이
         *    늦어져 선점을 놓친다 — 2026-08-09 에 "잡기 전 미리 계산"을 제거한 그 이유다.
         *
         * 서핑이 끝나면(`DONE`) `handleDropoffPopup` 이 confirm + detail 을 함께 보낸다.
         */
        if (!session.isAutoActive && session.surfingState == SessionManager.SurfingState.IDLE) {
            session.isPreview = true
            AppLogger.roadmap("👀 [미리보기] 손으로 연 상세 — 팝업 3장을 먼저 읽고 판정을 받는다", telemetryManager.currentScreenContext.name)
            surfingMachine.startSurfing(rootNode, session, screenTexts)
            return   // confirm 은 서핑이 끝난 뒤에 detail 과 함께 나간다
        }

        // 서핑 중 팝업이 닫혀 상세로 돌아온 경우 — 다음 팝업을 연다 (확정 화면과 같은 규칙)
        if (session.isPreview && session.surfingState != SessionManager.SurfingState.DONE) {
            advanceSurfing(rootNode)
            return
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
                // 앱별 확정/취소 버튼 텍스트 가져오기
                val confirmBtnTexts = keywords.confirmKeywords
                val cancelBtnText = keywords.cancelKeyword
                val appLabel = keywords.appLabel

                // ── [3단계 팝업에서 돌아온 경우] ──
                when (session.cautionAction) {
                    "ACCEPT" -> {
                        session.cautionAction = null
                        AppLogger.d(TAG, "✅ [3단계 통과] 진짜 우리 동네! 확정 클릭!")
                        AppLogger.roadmap("상세페이지에서 확정 버튼 클릭 (동명이동 3단계 검증 통과)", telemetryManager.currentScreenContext.name)
                        AppLogger.roadmap("[$appLabel] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                        clickFirstMatchingButton(rootNode, confirmBtnTexts)
                    }
                    "CANCEL" -> {
                        session.cautionAction = null
                        AppLogger.w(TAG, "❌ [3단계 적발] 동명이동! 패널티 없이 취소!")
                        AppLogger.roadmap("상세페이지에서 '$cancelBtnText' 클릭 (동명이동 3단계 적발)", telemetryManager.currentScreenContext.name)
                        if (!touchManager.findAndClickByText(rootNode, cancelBtnText, isStartsWith = true)) {
                            touchManager.performBack()
                        }
                        AppLogger.roadmap("리스트 페이지 진입 (동명이동 회피 성공)", telemetryManager.currentScreenContext.name)
                        resetSessionState()
                        return
                    }
                    else -> {
                        // ── [최초 진입] 도착지가 동명이동 주의 동네인지 확인 ──
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
                            // 일반 콜: 기존처럼 즉시 광클 (선점필승)
                            AppLogger.d(TAG, "🚀 [AUTO] 확정 버튼 광클 (배차 시도)")
                            AppLogger.roadmap("상세페이지에서 확정 버튼 클릭", telemetryManager.currentScreenContext.name)
                            AppLogger.roadmap("[$appLabel] 콜 확정 완료", telemetryManager.currentScreenContext.name)
                            clickFirstMatchingButton(rootNode, confirmBtnTexts)
                        }
                    }
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

    // ════════════════════════════════════════════════════════════════
    //  기능 4: 확정 화면(CONFIRMED) → 자동 팝업 서핑 구동
    // ════════════════════════════════════════════════════════════════

    private fun handleConfirmedScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
        // 잔상 방어
        if (isPopupResidue(rawScreenStr)) return

        /**
         * 👀 **미리보기로 보다가 확정을 눌렀다 — 딱지를 벗고 서버에 알린다**
         * (기사님 실측 2026-08-22 18:57 · 용어집 §9).
         *
         * 기사님: *"관제엡의 노랑색을 보고 확정을 눌렀어. 그런데 관제엡은 내가 생각한 것과
         * 다르게 움직이고 있어. 싱크가 전혀 안 되는 것 같아."*
         *
         * 🔴 확정 화면에 들어와도 **아무 요청도 안 나갔다.** 아래 서핑 분기는 `IDLE` 일 때만
         *    일하는데 미리보기는 이미 `DONE` 이고, `sendConfirmOnce` 는 중복 방지에 막혔다.
         *    그래서 서버는 여전히 "미리보기"로 알고 30초 뒤 정리해 버렸다 — 기사님은 잡았는데.
         *
         * 팝업은 **다시 열지 않는다.** 방금 읽은 텍스트(`accumulatedDetailText`)가 그대로 있다.
         * 딱지만 벗겨 confirm·detail 을 다시 보내면 서버가 보통 콜로 받아 KEEP 한다.
         */
        if (session.isPreview) {
            session.isPreview = false
            session.isDetailScrapSent = false      // 같은 콜을 한 번 더 보내야 한다
            AppLogger.roadmap("👀 [미리보기 → 확정] 기사님이 확정을 눌렀다 — 딱지를 벗고 서버에 다시 알린다",
                telemetryManager.currentScreenContext.name)
            session.lastDetailOrder?.let { order ->
                sendConfirmOnce(order, rawScreenStr)
                sendDetail(order)
            }
            return
        }

        // 확정 화면에 처음 진입했을 때 서핑 시작! (적요상세 → 출발지 → 도착지 순서)
        if (session.surfingState == SessionManager.SurfingState.IDLE) {
            AppLogger.roadmap("🔒 [Current Page: DETAIL_CONFIRMED] 진입, isHolding=true 설정", telemetryManager.currentScreenContext.name)
            AppLogger.roadmap("🏄‍♂️ 무인 서핑 가동 (State Machine: IDLE → 팝업버튼 트리거 대기)", telemetryManager.currentScreenContext.name)
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

            surfingMachine.startSurfing(rootNode, session, screenTexts)
        }
        // 서핑 중: 팝업이 닫혀 확정 화면으로 돌아왔다 — 다음 팝업을 연다
        else {
            advanceSurfing(rootNode)
        }
    }

    /**
     * 📤 **1차 선점을 보낸다 — 한 콜에 한 번만.**
     *
     * 두 곳에서 부른다. 필터콜은 상세 진입 즉시(광클), **미리보기 콜은 팝업 3장을 읽은 뒤**
     * `/detail` 직전에. 같은 요청을 두 벌로 적으면 한쪽만 고쳐져 갈라지므로 여기 하나만 둔다.
     *
     * 🔴 `isDetailScrapSent` 가 중복 전송을 막는다 — 미리보기 서핑이 끝나 상세 화면으로
     *    돌아왔을 때 이 함수가 다시 불리지 않게 하는 자물쇠이기도 하다.
     */
    private fun sendConfirmOnce(order: SimplifiedOfficeOrder, rawScreenStr: String) {
        if (session.isDetailScrapSent) return

        // ✅ [Phase 2] 매크로가 실제로 클릭한 경우만 AUTO, 나머지는 전부 MANUAL
        val actualMatchType = if (session.isAutoActive) "AUTO" else "MANUAL"
        apiClient.sendConfirm(
            DispatchBasicRequest(
                step = "BASIC",
                deviceId = apiClient.getDeviceId(),
                order = order,
                capturedAt = order.timestamp,
                matchType = actualMatchType,
                targetApp = currentTargetApp,
                isPreview = session.isPreview,
            )
        )
        AppLogger.d(TAG, "📤 [post /confirm request] 서버 전송 내용 -> 모드: $actualMatchType (스위치: ${telemetryManager.currentMode}, 매크로클릭: ${session.isAutoActive}, 미리보기: ${session.isPreview}) | 텍스트: ${rawScreenStr.take(150)}...")
        session.isDetailScrapSent = true
        telemetryManager.isHolding = true  // [Page/Hold 분리] 확정 클릭 → 콜 처리 중
        telemetryManager.forceFlushEvent()  // 즉시 서버에 홀드 상태 알림
    }

    /**
     * 🏄 **서핑을 한 칸 진행한다** — 팝업이 닫혀 상세/확정 화면으로 돌아왔을 때.
     *
     * 🔴 확정 화면과 **확정 전 상세**가 같은 규칙을 쓴다. 두 곳에 나눠 적으면 한쪽만
     *    고쳐져 갈라진다 — 이 레포가 반복해서 겪은 「목록을 손으로 나열」이다.
     *    새 팝업 단계가 생기면 **여기에만** 더한다.
     */
    private fun advanceSurfing(rootNode: AccessibilityNodeInfo) {
        when (session.surfingState) {
            SessionManager.SurfingState.WAITING_FOR_PICKUP_POPUP -> surfingMachine.clickPickup(rootNode)
            SessionManager.SurfingState.WAITING_FOR_DROPOFF_POPUP -> surfingMachine.clickDropoff(rootNode)
            else -> {}   // IDLE·WAITING_FOR_MEMO·DONE — 여기서 할 일이 없다
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 적요 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    private fun handleMemoPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        surfingMachine.handleMemoPopup(rootNode, session, screenTexts)
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 출발지 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    private fun handlePickupPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        surfingMachine.handlePickupPopup(rootNode, session, screenTexts)
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 도착지 팝업 스크래핑 + /detail 전송
    // ════════════════════════════════════════════════════════════════

    private fun handleDropoffPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
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

        // 서핑 모드: 도착지 텍스트 수집 → /detail 전송
        val surfingDone = surfingMachine.handleDropoffPopup(rootNode, session, screenTexts)
        if (!surfingDone) return

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
     * 🌐 **2차 상세를 보낸다 — 팝업에서 모은 텍스트를 통째로.**
     *
     * 두 곳에서 부른다. 서핑이 끝났을 때, 그리고 **미리보기로 본 콜을 기사님이 확정했을 때**
     * (그때는 팝업을 다시 열지 않고 모아 둔 텍스트를 그대로 다시 보낸다).
     * 같은 요청을 두 벌로 적으면 한쪽만 고쳐져 갈라지므로 여기 하나만 둔다.
     */
    private fun sendDetail(order: SimplifiedOfficeOrder) {
        run {
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
                    rawText = session.accumulatedDetailText
                ),
                capturedAt = order.timestamp,
                matchType = if (session.isAutoActive) "AUTO" else "MANUAL",
                targetApp = currentTargetApp,
                isPreview = session.isPreview,
            )

            // 서버 응답("KEEP", "CANCEL") 대기를 위한 안전취소 타이머 가동
            startSafeCancelTimer()

            val actualMatchType = if (session.isAutoActive) "AUTO" else "MANUAL"
            val previewStr = session.accumulatedDetailText.replace("\n", " ").take(150)
            AppLogger.d(TAG, "🌐 [post /detail request] $actualMatchType 모드 판결 요청 텍스트: $previewStr...")

            // Option B (Piggyback V2): sendDetail은 202 응답만 확인하고 곧바로 리턴됨. 
            // 실제 판결은 Telemetry 1.0초 폴링을 통해 decisionCallback으로 들어오게 됨.
            apiClient.sendDetail(payload) { _, _ -> /* 구형 롱폴링 콜백 미사용 */ }
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  화면 판별 엔진 (키워드 사전 기반)
    // ════════════════════════════════════════════════════════════════

    private fun detectScreenContext(text: String): ScreenContext =
        screenDetector.detect(text, keywords)

    private fun updateScreenContext(context: ScreenContext) {
        if (telemetryManager.currentScreenContext != context) {
            telemetryManager.currentScreenContext = context
            // 화면 상태가 변경되면 즉각적으로 상태를 서버에 보고 (카톡 켰을 때 UNKNOWN 등 즉각 반영)
            telemetryManager.forceFlushEvent()
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  AUTO 제어 및 비상 복구 유틸리티
    // ════════════════════════════════════════════════════════════════

    /** 서버 응답 대기용 안전취소 타이머 시작 (응답 없으면 자동 취소) */
    private fun startSafeCancelTimer() {
        telemetryManager.isWaitingDecision = true  // [Piggyback V2] 1.0초 단위 강제 무전 타격 시작!
        safeCancelTimer.start(getSafeCancelTimeout(), session) {
            sendEmergencyReport(EmergencyReason.AUTO_CANCEL, "안전취소 응답 없음 강제취소")
            executeDecisionImmediately("CANCEL")
        }
    }

    private fun cancelSafeCancelTimer() {
        safeCancelTimer.cancel(session)
        telemetryManager.isWaitingDecision = false // [Piggyback V2] 짧은 무전 해제
    }

    /** 서버 판결(KEEP/CANCEL) 결과 행동을 실제 화면 액션으로 쏨 */
    private fun executeDecisionImmediately(decision: String) {
        cancelSafeCancelTimer() // 타이머 해제
        if (!session.isAutoActive) return // 이미 풀렸으면 스킵

        val targetBtnStr = if (decision == "KEEP") "닫기" else "취소"
        AppLogger.roadmap("🛡️ 관제탑 판결 수신 (Action: $decision) → '$targetBtnStr' 버튼 클릭 집행 개시", telemetryManager.currentScreenContext.name)
        AppLogger.d(TAG, "⚡ 판결 집행: 행동=$decision, 누를버튼=$targetBtnStr (버튼클릭을 시작합니다), 500ms 지연")
        
        mainHandler.postDelayed({
            val rootNode = rootInActiveWindow
            if (rootNode == null) {
                resetSessionState()
                return@postDelayed
            }
            if (touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false)) {
                if (decision == "KEEP") {
                    AppLogger.roadmap("✅ 판결 KEEP 집행 완료 → [Current Page: LIST] 복귀, 락 해제, 합짐 콜 잡기 루프 회귀", telemetryManager.currentScreenContext.name)
                } else {
                    AppLogger.roadmap("❌ 판결 CANCEL 집행 완료 → [Current Page: LIST] 복귀, 락 해제, 기존 모드 루프 회귀", telemetryManager.currentScreenContext.name)
                }
                AppLogger.d(TAG, "🎉 행동 완료! 타겟($targetBtnStr) 명중.")
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
        val orderId = session.currentOrderId.ifEmpty { "unknown" }
        val report = EmergencyReport(
            deviceId = apiClient.getDeviceId(),
            orderId = orderId,
            reason = reason.value,
            screenContext = telemetryManager.currentScreenContext.value,
            screenText = extraText,
            timestamp = nowTimestamp(),
            targetApp = currentTargetApp
        )
        apiClient.sendEmergency(report)
    }

    // ════════════════════════════════════════════════════════════════
    //  헬퍼 함수
    // ════════════════════════════════════════════════════════════════

    /** 세션 상태 전체 초기화 (리스트 복귀 시 호출) */
    private fun resetSessionState() {
        session.reset {
            cancelSafeCancelTimer()
            telemetryManager.isHolding = false  // [Page/Hold 분리] 리스트 복귀 → 콜 잡기 모드
            AppLogger.i(TAG, "🛡️ [앱폰] 콜 잡기 복귀 직후: 앱 메모리 상의 scrapBuffer 배열을 비우고 강제 플러시(Flush)하여 잔상 데이터를 제거함")
            telemetryManager.forceFlushEvent()  // 즉시 서버에 홀드 해제 알림
        }
    }

    /** 세션 ID가 없으면 새로 생성 */
    private fun ensureSessionId() {
        session.ensureOrderId(telemetryManager.currentMode)
    }

    /** 팝업 잔상이 화면에 남아있는지 검사 */
    private fun isPopupResidue(rawScreenStr: String): Boolean {
        val resid = screenDetector.isPopupResidue(rawScreenStr)
        if (resid) AppLogger.roadmap("✋ [Race Condition 방어] 출발지/도착지 팝업 닫힘 애니메이션 잔상 대기", telemetryManager.currentScreenContext.name)
        return resid
    }

    /**
     * 앱별 확정 버튼 텍스트 리스트 중 첫 번째로 발견되는 버튼을 클릭합니다.
     * 화물24시: "배차신청" → "전화걸기" 순으로 시도
     * 인성콜: "확정" 하나만 시도
     */
    private fun clickFirstMatchingButton(rootNode: AccessibilityNodeInfo, buttonTexts: List<String>): Boolean {
        for (btnText in buttonTexts) {
            if (touchManager.findAndClickByText(rootNode, btnText, isStartsWith = true)) {
                AppLogger.d(TAG, "✅ 버튼 '$btnText' 클릭 성공!")
                return true
            }
        }
        AppLogger.e(TAG, "❌ 확정 버튼을 찾을 수 없음: ${buttonTexts.joinToString(", ")}")
        return false
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
            id = session.currentOrderId,
            type = "${mode}_CLICK",
            pickup = tempOrder.pickup.takeIf { it.isNotBlank() && it != "배차값없음" } ?: "상태분석중",
            dropoff = tempOrder.dropoff.takeIf { it.isNotBlank() && it != "배차값없음" } ?: "상태분석중",
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
        // 🚨 자기 자신의 앱(오버레이 UI) 텍스트 수집 원천 차단 (텍스트 오염/무한루프 주범)
        if (node.packageName?.toString() == "com.onedal.app") return

        node.text?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
        node.contentDescription?.toString()?.trim()?.takeIf { it.isNotEmpty() }?.let { out.add(it) }
        for (i in 0 until node.childCount) gatherNodeTexts(node.getChild(i), out)
    }

    /** 파싱용 좌표 포함 수집 (거대 컨테이너 제외) */
    private fun extractAllTextNodes(node: AccessibilityNodeInfo?, out: MutableList<ScreenTextNode>) {
        if (node == null) return
        // 🚨 자기 자신의 앱(오버레이 UI) 텍스트 수집 원천 차단
        if (node.packageName?.toString() == "com.onedal.app") return

        val text = node.text?.toString()?.trim() ?: node.contentDescription?.toString()?.trim()
        if (!text.isNullOrEmpty()) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (rect.height() < MAX_TEXT_NODE_HEIGHT_PX && rect.width() > 0) out.add(ScreenTextNode(text, node, rect))
        }
        for (i in 0 until node.childCount) extractAllTextNodes(node.getChild(i), out)
    }
}


