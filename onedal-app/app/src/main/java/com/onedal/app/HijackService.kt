package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import com.onedal.app.core.AppLogger
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.api.ApiClient
import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords
import com.onedal.app.core.AlarmSignaler
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.CallMemory
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.TargetApp
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.core.engine.PreConfirmGate
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.core.engine.SessionManager
import com.onedal.app.core.engine.DetailCollectMachine
import com.onedal.app.core.engine.SafeCancelTimer
import com.onedal.app.core.engine.CautionDongVerifier
import com.onedal.app.core.TelemetryManager
import com.onedal.app.models.DetailedOfficeOrder
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.DispatchDetailedRequest
import com.onedal.app.models.EmergencyReason
import com.onedal.app.models.EmergencyReport
import com.onedal.app.models.ScreenContext
import com.onedal.app.models.FilterTally
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
 *   기능 4 — 확정 화면 자동 상세 수집 (팝업을 넘기며 출발지·도착지·적요를 읽는다)
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
    // 👁️ «본 콜» 장부 — «평가했다»와 «보고했다»를 딴 그릇으로 (#79 · CallMemory 주석 참고)
    private val callMemory = CallMemory(MAX_ORDER_HASH_CACHE, ORDER_HASH_KEEP_COUNT)
    private var currentTargetApp = "insung"

    /**
     * 👁️ 리스트를 떠난 시각 (0 = 지금 리스트를 보고 있다).
     * 상세에 머무는 동안은 배차망 리스트를 못 읽으므로, 그 길이를 재서 복귀할 때 남긴다.
     * **놓친 콜과 걸러낸 콜을 구분하는 유일한 근거다.**
     */
    private var listBlindSinceMs = 0L

    // ── 세션 상태 (SessionManager로 통합) ──
    private val session = SessionManager()

    /** 🔔 알람 모드의 폰 쪽 신호 — 소리·진동·테두리 (`docs/지금/기기_모드.md` 2단계) */
    private val alarmSignaler by lazy { AlarmSignaler(this) }

    /**
     * 🚪 알람 상세 자동 진입의 복귀 타이머 — **ID 를 저장해 취소 가능하게** (좀비 타이머 규칙).
     * 우리가 열어 준 상세에서 기사님이 30초 무응답이면 폰이 스스로 뒤로 나와
     * 리스트 수집을 재개한다. 기사님이 손으로 연 상세는 이 타이머가 안 걸린다.
     */
    private var alarmDetailBackRunnable: Runnable? = null

    private fun scheduleAlarmDetailBack() {
        cancelAlarmDetailBack()
        val r = Runnable {
            alarmDetailBackRunnable = null
            // 아직 그 상세에 있고, 여전히 알람 판(잡기 수순 없는 배차망)일 때만 나온다
            if (telemetryManager.currentScreenContext == ScreenContext.DETAIL_PRE_CONFIRM
                && !TargetApp.supportsCatching(currentTargetApp)
                && telemetryManager.currentMode == "ALARM") {
                AppLogger.i("1DAL_ALARM", "↩️ [알람 상세] 30초 무응답 — 리스트로 자동 복귀")
                performGlobalAction(GLOBAL_ACTION_BACK)
            }
        }
        alarmDetailBackRunnable = r
        mainHandler.postDelayed(r, 30_000L)
    }

    private fun cancelAlarmDetailBack() {
        alarmDetailBackRunnable?.let { mainHandler.removeCallbacks(it) }
        alarmDetailBackRunnable = null
    }
    private lateinit var collectMachine: DetailCollectMachine
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
            /**
             * 💤 **화면 상태는 이벤트로 한 번 알리고 끝내지 않는다** (기사님 확정 2026-08-22).
             *
             * 예전에는 `sendOffline()` 한 번이 전부였다. 그런데 화면이 꺼져도 앱은 60초마다
             * 생존신고를 계속하고, 그 하트비트가 서버에서 `status = "ONLINE"` 으로
             * **되돌려 버린다** — 실측 20:28 에 꺼짐을 보고했는데 20:32 에 관제웹은 녹색이었다.
             *
             * 그래서 **플래그를 세워 매 텔레메트리에 실어 보낸다.** 서버가 추측할 일이 없다.
             * 접근성 스크래핑은 화면이 켜져 있어야 도니, 화면 꺼짐 = **콜을 못 잡는 상태**다.
             */
            if (intent?.action == Intent.ACTION_SCREEN_OFF) {
                telemetryManager.isScreenOn = false
                AppLogger.roadmap("📵 화면 꺼짐 감지 → 서버로 퇴근(OFFLINE) 보고", "OFFLINE")
                AppLogger.w(TAG, "📵 [Screen Off 감지] 기사님 퇴근 또는 화면 꺼짐! 즉시 서버로 오프라인 통보!")
                apiClient.sendOffline()
                /**
                 * 💤 **지금 바로 알린다** (기사님 확정 2026-08-22).
                 *
                 * 화면을 끄는 순간 텔레메트리 주기가 **60초(하트비트 모드)로 떨어진다.**
                 * 그래서 앱은 즉시 알았는데 관제웹은 **최대 1분 뒤에야** 알았다.
                 * 한 번 밀어 보내면 1초 안에 배지가 뜬다.
                 */
                telemetryManager.forceFlushEvent()
            } else if (intent?.action == Intent.ACTION_SCREEN_ON) {
                telemetryManager.isScreenOn = true
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
        currentTargetApp = TargetApp.codeOf(targetApp)   // 매핑은 TargetApp 한 곳뿐

        keywords = when (targetApp) {
            "24시" -> Hwamul24Keywords.TWENTYFOUR
            "픽커" -> KakaoPickerKeywords.PICKER
            else -> InsungKeywords.INSUNG
        }

        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient, this)  // [GPS 텔레메트리] context 전달하여 위치 조회 가능하도록
        scrapParser = ScrapParser(this, targetApp)
        
        AppLogger.i(TAG, "🎯 타겟 앱 설정 완료: $targetApp")

        touchManager = AutoTouchManager(this)
        collectMachine = DetailCollectMachine(touchManager)
        cautionVerifier = CautionDongVerifier(this)

        /**
         * 💤 시작할 때의 화면 상태는 **물어봐서** 세운다 — 기본값(켜짐)으로 두면
         * 화면이 꺼진 채 서비스가 붙었을 때 첫 보고부터 거짓말한다.
         */
        telemetryManager.isScreenOn =
            (getSystemService(Context.POWER_SERVICE) as android.os.PowerManager).isInteractive

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
         *
         * 🔴 **그런데 2026-08-23 에 같은 사고가 다시 났다** — 이 판정은 멀쩡했는데
         *    `handleListScreen` 첫 줄이 **조건 없이** 리셋을 부르고 있어서 무의미했다.
         *    이번엔 `matchType` 이 아니라 **미리보기**가 뒤집혔다: 앱이 자기가 터치한 콜을
         *    "손으로 연 상세"로 읽어 확정을 안 눌렀고, 🔵 100점 판정까지 받고 콜을 놓쳤다.
         *    → 그 자리를 없애고 **리셋은 여기 한 곳에서만** 한다 (`sessionEndsWithCall.test.ts`).
         *
         * ⚠️ 조건(`hasActiveSession()`)도 뗐다. 그건 `isAutoActive`·`isWaitingForDecision`·
         *    `currentOrderId` 만 보므로 `collectState`·`isPreview` 가 더럽게 남으면 그냥
         *    통과한다. **복귀는 그 자체로 콜의 끝**이니 조건 없이 지우는 것이 맞다.
         */
        val isListScreen = detected == ScreenContext.LIST ||
                           detected == ScreenContext.LIST_COMPLETED ||
                           rawScreenStr.contains("대기 중인 오더가 없")
        val wasListScreen = previous == ScreenContext.LIST || previous == ScreenContext.LIST_COMPLETED
        /**
         * 👁️ **리스트를 못 보고 있던 동안을 기록한다** (기사님 요청 2026-08-25).
         *
         * 앱은 한 번에 콜 하나만 평가한다 — 상세로 들어가면 그동안 **리스트를 아예 안 읽는다.**
         * 그 사이 배차망에 뜬 콜은 평가조차 되지 않고 조용히 사라진다.
         *
         * 🔴 2026-08-25 실측: `②` 를 잡는 데 **11.7초** 가 걸렸고, 그동안 `③` 이 화면에
         *    떴다 사라졌다. 로그에 아무 기록이 없어서 *"필터가 걸렀나 / 안 떴나 / 못 봤나"* 를
         *    구분할 수 없었다. **놓친 콜과 걸러낸 콜은 전혀 다른 것**인데 같아 보였다.
         *
         * 그래서 리스트를 떠난 시각을 재 두고, 돌아올 때 얼마나 못 봤는지 남긴다.
         * (배차망 콜 간격보다 이 시간이 길면 문제지가 통째로 지나간다)
         */
        if (!isListScreen && wasListScreen) {
            listBlindSinceMs = System.currentTimeMillis()
        }
        if (isListScreen && !wasListScreen) {
            AppLogger.d(TAG, "[복귀 감지] ${previous.name} → ${detected.name} 복귀. 세션 및 안전취소 락 완전 해제")
            resetSessionState()
            // 👁️ 리셋한 뒤에 «못 본 시간»을 남긴다 — 리셋이 먼저다 (콜의 끝이 우선)
            if (listBlindSinceMs > 0L) {
                val blindSec = (System.currentTimeMillis() - listBlindSinceMs) / 1000.0
                AppLogger.roadmap(
                    "👁️ [리스트 못 봄] ${"%.1f".format(blindSec)}초 동안 상세에 있었습니다 — " +
                    "그사이 뜬 콜은 **평가되지 않았습니다** (놓친 것이지 거른 것이 아닙니다)",
                    "LIST"
                )
                listBlindSinceMs = 0L
            }
        }

        // 서버 판결 대기 중에는 화면 내 버튼 탐색이나 상세 수집(클릭 액션) 무시
        if (session.isWaitingForDecision) {
            rootNode.recycle()
            return
        }

        AppLogger.d(TAG, "-------------------------------")
        AppLogger.roadmap("📡 화면 변경 감지 | 화면: ${detected.value} | 모드: ${telemetryManager.currentMode}", telemetryManager.currentScreenContext.name)

        // 🔔 리스트를 떠났다 — 남의 화면 위에 알람 테두리를 남기지 않는다 (§6-③)
        if (detected != ScreenContext.LIST) alarmSignaler.onLeaveList()
        // 🚪 리스트로 돌아왔다(기사님이 뒤로/수락) — 자동 복귀 타이머는 일이 없어졌다
        if (detected == ScreenContext.LIST) cancelAlarmDetailBack()

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

    /**
     * 👁️ 리스트에서 콜을 한 건도 못 건졌을 때, **왜 그런지 사람 말로** 적는다.
     * 숫자만 남기면 나중에 로그를 보고도 어느 칸인지 다시 헤아려야 한다.
     */
    private fun lastScanReason(nodes: Int, groups: Int, fareFail: Int): String = when {
        nodes == 0 -> "접근성 트리가 안 온다 (권한·서비스 확인)"
        fareFail > 0 && groups == fareFail -> "카드는 잡았는데 요금을 못 읽는다 ($fareFail 건)"
        groups == 0 -> "글자는 읽히는데 콜 카드가 0개 — 리스트가 비었거나 못 뽑는 것"
        else -> "일부만 걸렀다 (그룹 $groups · 요금실패 $fareFail)"
    }
    /**
     * ⚠️ **"빈 리스트"와 "못 뽑는 것"을 여기서 단정하지 않는다.** 가르려면 *"콜이 없을 때
     *    노드가 몇 개인가"* 라는 기준값이 필요한데 **실측이 없다** — 근거 없는 상수를
     *    만들지 않는다(규칙 ⑤-4 ②). 숫자를 정직하게 남기고, 판단은 **지속 시간**으로
     *    서버가 한다. 실측이 쌓이면 그때 기준을 정한다.
     */

    private fun handleListScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        /**
         * 🔚 **여기서 세션을 지우지 않는다** (기사님 확정 2026-08-23).
         *
         * 예전에는 첫 줄이 `resetSessionState()` 였다. *"리스트로 돌아오면 리셋"* 이라고
         * 적혀 있었지만 실제로는 **"리스트를 보고 있으면 리셋"** 이었다 — 이 핸들러는
         * 리스트에 머무는 5초마다 돌기 때문이다.
         *
         * 그래서 자동 터치 직후 화면이 아직 안 바뀐 사이(118ms)에 LIST 이벤트가 한 번 더
         * 오면 **방금 잡은 콜이 통째로 지워졌다.** 리셋은 위쪽 **복귀 판정**이 한다.
         *
         * 🔴 세션을 지우는 자리는 전부 *"이 콜은 끝났다"* 여야 한다 — 복귀 · 동명이동 실패 ·
         *    2차 필터 실패 · 판결 집행. **"지금 무슨 화면이냐"는 콜의 끝이 아니다.**
         */
        val allNodes = mutableListOf<ScreenTextNode>()
        extractAllTextNodes(rootNode, allNodes)

        // 앱별 앵커 노드 감지 및 텍스트 그룹화 로직을 파서(ScrapParser)로 위임
        val groupedNodes = scrapParser.groupListNodes(allNodes)

        /** 그룹은 나왔는데 요금을 못 읽어 버려진 수 — 아래 진단이 읽는다 */
        var fareFail = 0

        /**
         * 👁️ **이번 스캔의 필터 성적표** (기사님 확정 2026-08-23).
         *
         * 기사님: *"관제웹에서는 필터링이 잘되고 있는 건지 알 수가 없어서 답답하다."*
         * **매 스캔마다 새로 만든다** — 누적이 아니다. 질문은 *"어제부터 몇 개"* 가 아니라
         * *"지금 리스트에 뭐가 떠 있고 왜 안 잡나"* 이기 때문이다.
         */
        val tally = FilterTally()

        /**
         * 👁️ **빈 카드를 센다** — 필드 테스트 1회차 ① 의 계측 (2026-08-25 신설).
         *
         * 2026-08-23 실주행: `💸 요금 못 읽음` 12,467회인데 **뒤가 공백**이었다.
         * 요금이 이상한 게 아니라 **같은 줄 글자가 하나도 안 묶였다** — 스캔당 약 30개.
         * 그때 빌드에는 진단 로그가 아예 없어(`👁️` 0줄) 원인을 못 봤다.
         *
         * 🔴 겹침은 «열린 구간»이라 높이 0인 사각형은 **닻 자신과도 안 겹친다**
         *    (`RowGroupingTest` 로 재현). 스크롤 밖 노드의 bounds 가 `(0,0,0,0)` 으로
         *    온다면 정확히 이 모양이다 — **그게 맞는지 좌표로 확인하려고 남긴다.**
         */
        var emptyCard = 0
        var emptyRectAnchor = 0
        val emptySamples = mutableListOf<String>()
        /** 🔔 이번 스캔에 보인 콜 지문 → 요금 닻 위치 — 알람 테두리가 «아직 있나·어디로 갔나»를 이걸로 안다 (#83-③) */
        val scanHashes = mutableMapOf<Int, android.graphics.Rect>()
        /** 🔔 이번 스캔의 알람 통과 콜들 — 루프 뒤에 요금 최고 하나만 울린다 (기사님 확정 0830) */
        val alarmHits = mutableListOf<Triple<SimplifiedOfficeOrder, ScreenTextNode, Int>>()

        // 각 요금 노드 기준으로 텍스트 세트를 묶어 파싱
        for ((fareNode, cardTexts) in groupedNodes) {
            if (cardTexts.isEmpty()) {
                emptyCard++
                val r = fareNode.rect
                if (InsungParser.isEmptyRect(r.top, r.bottom)) emptyRectAnchor++
                if (emptySamples.size < 3) {
                    emptySamples += "\"${fareNode.text}\"@(${r.left},${r.top},${r.right},${r.bottom})"
                }
            }
            val order = scrapParser.parse(cardTexts)

            if (order.fare == 0) {
                fareFail++
                /**
                 * 💸 **요금을 못 읽으면 그 카드의 글자를 남긴다** (기사님 확정 2026-08-23).
                 *
                 * 숫자(`요금실패 1`)만으로는 **차종을 못 읽은 건지 요금 자리에 딴 게 있는
                 * 건지** 알 수가 없어, 재현해도 원인을 못 찾았다.
                 *
                 * 파서는 `차종 노드 → 바로 다음이 요금` 으로 읽는다(`InsungParser`).
                 * 그래서 **텍스트 순서 자체가 진단**이다 — 앞부분만 봐도 어디서 어긋났는지 보인다.
                 * 카드마다 매번 찍히지 않게 **못 읽은 것만** 남긴다.
                 */
                /**
                 * 🔴 **빈 카드는 여기서 안 찍는다** (2026-08-25). 2026-08-23 실주행에서
                 *    이 줄이 **12,467회** 나왔고 뒤가 전부 공백이었다 — 그 소음이 다른
                 *    로그를 통째로 묻었다. 빈 카드는 스캔 요약(`👁️ [리스트 스캔]`)이
                 *    좌표와 함께 한 줄로 말한다. 여기는 **글자는 있는데 요금만 못 읽은**
                 *    진짜 파싱 실패만 남긴다.
                 */
                if (cardTexts.isNotEmpty()) {
                    AppLogger.w(TAG, "💸 [요금 못 읽음] ${cardTexts.joinToString(" | ").take(140)}")
                }
                continue
            }

            val orderHash = (order.pickup + order.dropoff + order.fare.toString()).hashCode()
            scanHashes[orderHash] = fareNode.rect   // 🔔 이미 본 콜도 «아직 화면에 있다 + 지금 여기 있다»는 사실은 남긴다
            /**
             * ⏭️ **건너뛰었다는 사실을 남긴다** (2026-08-25 · 시험 두 판을 여기서 잃었다).
             *
             * 지문은 **상차+하차+요금**이라 차종만 바꾼 콜은 같은 콜로 보인다. 그런데
             * 아무 로그 없이 `continue` 하니, 화면엔 떴는데 판정이 한 줄도 안 남는다 —
             * *"필터가 막았나 / 요금을 못 읽었나 / 서버가 안 보냈나"* 를 가릴 수가 없다.
             *
             * 실측 2026-08-25: 문제지 ⑧⑨ 를 승용차로 바꿔 다시 흘렸는데 세 판 내리
             * 조용히 건너뛰었고, **서버를 고쳤는지조차 확인 못 했다.**
             * (캐시는 접근성 토글로 서비스가 새로 만들어져야 비워진다 — 앱을 밀어내도 안 된다)
             */
            if (callMemory.alreadyEvaluated(orderHash)) {
                AppLogger.d(TAG, "⏭️ [이미 본 콜] ${order.pickup.take(14)} → ${order.dropoff.take(14)} " +
                    "${order.fare}원 (지문 $orderHash · 기억 ${callMemory.evaluatedCount}개)")
                continue
            }

            // 🌟 [항시 인터셉터] 콜 필터 매칭 검사 (디버그 로그를 위해 MANUAL/AUTO 무관하게 항시 실행)
            /**
             * 🔒 **평가가 실제로 돌았는지는 성적표가 답한다** (#79 · 2026-08-30).
             * `decide()` 는 필터가 잠겨 있으면(선점 중·대기) 첫 줄에서 돌아서며
             * `tally.seen` 을 올리지 않는다 — 앞뒤 차이가 «평가했다»의 유일한 원천이다.
             * 여기서 필터를 다시 읽어 판단하면 decide 와 두 벌이 된다 (규칙 ③).
             */
            val seenBefore = tally.seen
            val isTarget = scrapParser.shouldClick(order, tally)
            val wasEvaluated = tally.seen > seenBefore

            /**
             * 🔔 **알람 모드 — 앱은 수락을 안 누르고, 그 콜을 가리킨다** (기사님 확정 2026-08-30 · 2단계).
             *
             * 소리 두 번 + 강한 진동 + 통과한 콜 줄에 테두리. 수락은 기사님이다.
             * 이미 본 콜은 위의 지문 검사(`continue`)가 걸러 주므로 **콜당 한 번만** 운다 —
             * 서버 알람(관제웹 소리)과 같은 원리다. 여기서는 모으기만 하고, 루프 뒤에서
             * **요금 최고 하나만** 울린다 (동시 통과 3건 실측 — 마지막 콜이 이기던 것은 우연).
             */
            if (!session.isAutoActive && telemetryManager.currentMode == "ALARM" && isTarget) {
                alarmHits.add(Triple(order, fareNode, orderHash))
            }

            // 🌟 [AUTO 실행] 콜 잡기 중이지 않고 AUTO 모드일 때만 실제 클릭 동작 수행
            // 🚧 시퀀스 플러그인 경계 — 잡기 수순이 없는 배차망(픽커)에서는 어떤 모드여도 클릭하지 않는다
            if (!session.isAutoActive && telemetryManager.currentMode == "AUTO"
                && TargetApp.supportsCatching(currentTargetApp)) {
                if (isTarget) {
                    AppLogger.roadmap("🎯 [Current Page: LIST] 1차 필터 통과 → AUTO 타겟 발견, 강제 터치 진행", telemetryManager.currentScreenContext.name)
                    AppLogger.d(TAG, "💥 [AUTO] 꿀콜 조건 통과! 대상 콜 강제 터치 진행!")
                    
                    // 🚀 [지뢰 탐지기] 2차 똥콜 판명 후 리스트로 튕겨나왔을 때 또 누르는 것을 방지하기 위해 터치 직전에 지문 선(先)등재!
                    AppLogger.d(TAG, "📝 [AUTO] 2차 검증 반송(취소)에 대비해 해당 콜 지문 선(先)기록 완료 (해시: $orderHash)")
                    callMemory.markEvaluated(orderHash)
                    
                    val appLabel = keywords.appLabel
                    AppLogger.roadmap("리스트에서 바뀐 text 감지 후 text 추출", telemetryManager.currentScreenContext.name)
                    touchManager.performSimulatedTouch(fareNode.node)
                    AppLogger.roadmap("[$appLabel] 선택된 콜 정보 전달 (꿀콜 클릭!)", telemetryManager.currentScreenContext.name)
                    
                    session.isAutoActive = true // 콜 잡기 시작!
                    session.setOrderId(order.id)
                    session.lastDetailOrder = order // [오파싱 방지] 상세 진입 후 사용할 원본 데이터 쥐어주기

                    /**
                     * 📊 **잡은 콜도 수집에 센다** (기사님 확정 2026-08-23).
                     *
                     * 예전에는 여기서 바로 `break` 라, 아래의 `enqueue` 에 못 닿았다.
                     * 그래서 관제웹의 `수집:N` 이 **탈락한 콜만** 센 숫자였다 —
                     * 16콜을 돌렸는데 13 이 뜨는 이유가 이것이었다.
                     *
                     * 기사님: *"실전에서는 리스트에 몇 개가 뜨는지 모르니까,
                     * 필터가 잘 돌고 있는지 알 수가 없어 답답하다."*
                     * **본 콜을 다 세야** 그 숫자가 "필터가 도는가"의 답이 된다.
                     */
                    telemetryManager.enqueue(order)
                    recentListOrders.add(order)
                    break // 첫 번째 발각콜 클릭 후 이 루프는 종료 (관제 보고 생략)
                }
            }

            // 4) 신규 콜 → 서버에 텔레메트리 보고 — **보고는 콜당 한 번** (평가와 딴 그릇 · #79)
            if (callMemory.markReportedOnce(orderHash)) {
                telemetryManager.enqueue(order)
                recentListOrders.add(order)
            }
            /**
             * 🔒 평가가 안 돈 콜(선점 잠금·대기)은 **기억에 남기지 않는다** (#79).
             * 잠금이 풀리는 다음 스캔에서 처음처럼 평가된다 — 콜을 잡는 10~30초 사이에
             * 나타난 콜을 영영 삼키던 사고의 수리 지점이다. 로그를 남기는 이유는 08-25 와
             * 같다: 침묵하면 «필터가 막았나/잠겼나/못 읽었나»를 가릴 수 없다.
             */
            callMemory.onScanned(orderHash, wasEvaluated)
            if (!wasEvaluated) {
                AppLogger.d(TAG, "🔒 [평가 보류] ${order.pickup.take(14)} → ${order.dropoff.take(14)} " +
                    "${order.fare}원 — 필터 잠김(선점 중·대기), 다음 스캔에서 다시 본다")
            }
        }

        /**
         * 👁️ **리스트가 빈 이유를 구분해 남긴다** (기사님 확정 2026-08-22 · 크리티컬).
         *
         * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
         *
         * 접근성이 막혀 콜을 하나도 못 읽는 동안 **관제웹은 파란불이었다.** 텔레메트리는
         * 계속 갔고 화면 판별(`LIST`)도 됐기 때문이다. 그런데 로그는 `resetSessionState`
         * 에서 끊겨 **노드를 몇 개 읽었는지조차 알 수 없었다.**
         *
         * 🔴 실운행이면 콜을 통째로 놓치는데 기사님이 알 방법이 없다. 8/21 은 하루 종일
         *    `LIST` + 0항목이 18,824회였다 — 대부분 진짜 빈 리스트지만 **고장과 구분이 안 된다.**
         *
         * 세 숫자가 그걸 가른다:
         *   노드 많음 + 그룹 0  → 콜은 화면에 있는데 **못 뽑는다**
         *   노드 0    + 그룹 0  → 접근성 트리가 **아예 안 온다**
         *   노드 적음 + 그룹 0  → 리스트가 진짜 비었다 (정상)
         *   그룹 있음 + 요금실패 → 카드는 잡았는데 **요금을 못 읽는다**
         */
        val picked = groupedNodes.size - fareFail
        /**
         * 🔴 **`picked == 0` 일 때만 찍으면 안 된다** (2026-08-25).
         *    2026-08-23 패턴은 «그룹 30 · 통과 1» 이라 `picked = 1` 이었다 —
         *    빈 카드가 29개인데도 **한 줄도 안 남았을 것**이다.
         *    빈 카드가 하나라도 있으면 남긴다.
         */
        if (picked == 0 || emptyCard > 0) {
            val rect = if (emptyCard > 0) " · 빈카드 $emptyCard(닻 rect 0: $emptyRectAnchor)" else ""
            val sample = if (emptySamples.isNotEmpty()) " ⤷ ${emptySamples.joinToString(" · ")}" else ""
            AppLogger.w(TAG, "👁️ [리스트 스캔] 텍스트노드 ${allNodes.size} · 콜그룹 ${groupedNodes.size} · " +
                "통과 $picked · 요금실패 $fareFail$rect — ${lastScanReason(allNodes.size, groupedNodes.size, fareFail)}$sample")
        }
        /**
         * 🔔 알람 — 통과 콜 중 **요금 최고 하나만** 울리고 가리킨다 (기사님 확정 0830).
         * 잡기 수순 없는 배차망(픽커)은 **상세까지 이동**해 준다 — 기사님은 읽고 수락만.
         * 수락(계약) 클릭은 여전히 없다: 상세 화면은 supportsCatching 관문이 무시한다.
         */
        val bestIdx = AlarmSignaler.pickBestIndex(alarmHits.map { it.first.fare })
        if (bestIdx >= 0) {
            val (order, fareNode, orderHash) = alarmHits[bestIdx]
            alarmSignaler.fire(fareNode.rect, scrapParser.alarmBandHalfPx(), orderHash)
            // 🔴 «수락»이 보이는 카드는 손대지 않는다 — 오더카드의 요금 닻은 곧 계약 버튼이다 (clickSafe)
            if (!TargetApp.supportsCatching(currentTargetApp)
                && com.onedal.app.plugins.kakaopicker.KakaoPickerParser.clickSafe(order.rawText)) {
                AppLogger.i("1DAL_ALARM", "🚪 [알람 상세] ${order.fare}원 (${order.pickup.take(10)}→${order.dropoff.take(10)}) " +
                    "상세로 이동 — 수락은 기사님 · 30초 무응답 시 자동 복귀")
                touchManager.performSimulatedTouch(fareNode.node)
                scheduleAlarmDetailBack()
            }
        }
        // 🔔 알람 테두리 — 가리키던 콜이 이번 스캔에 없으면 걷는다 (잡혔거나 남이 가져감 · §6-③)
        alarmSignaler.onScan(scanHashes)

        telemetryManager.screenNodeCount = allNodes.size
        /**
         * 👁️ **성적표를 서버로 넘긴다.** 앱 안에서만 알면 화면은 여전히 모른다 —
         *    기사님이 매번 로그를 여셔야 했던 이유가 그것이다.
         */
        telemetryManager.filterTally = tally

        // 메모리 관리 (지문 장부는 CallMemory 가 스스로 자른다)
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
        // 🚧 시퀀스 플러그인 경계 — 여기부터 detail 전송·복귀 감지까지가 «인성 잡기 수순»이다.
        //    수순 없는 배차망(픽커)이 이 문에 들어오면 엉뚱한 화면을 누르게 된다 — 원천 차단.
        if (!TargetApp.supportsCatching(currentTargetApp)) {
            // 👁️ 다만 «수락 전 상세에 무엇이 보이는가»는 판정 설계의 문제지다 (기사님 질문 0830:
            //    "상세 열었으면 그걸로 판단해 줄 수 있는 거 아냐?") — 클릭 없이 글자만 남긴다.
            AppLogger.i("1DAL_PICKER", "📄 [상세 실물] ${screenTexts.joinToString(" | ").take(500)}")
            return
        }

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

    // ════════════════════════════════════════════════════════════════
    //  기능 4: 확정 화면(CONFIRMED) → 자동 상세 수집 구동
    // ════════════════════════════════════════════════════════════════

    private fun handleConfirmedScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>, rawScreenStr: String) {
        // 🚧 시퀀스 플러그인 경계 — 인성 잡기 수순 (픽커_수집.md §3-확장)
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

    /**
     * 📤 **1차 선점을 보낸다 — 한 콜에 한 번만.**
     *
     * 두 곳에서 부른다. 필터콜은 상세 진입 즉시(선점), **미리보기 콜은 팝업 3장을 읽은 뒤**
     * `/detail` 직전에. 같은 요청을 두 벌로 적으면 한쪽만 고쳐져 갈라지므로 여기 하나만 둔다.
     *
     * 🔴 `isDetailScrapSent` 가 중복 전송을 막는다 — 미리보기 상세 수집이 끝나 상세 화면으로
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
                // 잡은 방식(자동·알람·직접) — 원장 기록 전용, 파생은 SessionManager 한 곳 (#75)
                capturedVia = session.capturedVia(telemetryManager.currentMode),
                isPreview = session.isPreview,
            )
        )
        AppLogger.d(TAG, "📤 [post /confirm request] 서버 전송 내용 -> 모드: $actualMatchType (스위치: ${telemetryManager.currentMode}, 매크로클릭: ${session.isAutoActive}, 미리보기: ${session.isPreview}) | 텍스트: ${rawScreenStr.take(150)}...")
        session.isDetailScrapSent = true
        telemetryManager.isHolding = true  // [Page/Hold 분리] 확정 클릭 → 콜 처리 중
        telemetryManager.forceFlushEvent()  // 즉시 서버에 홀드 상태 알림
    }

    /**
     * 🏄 **상세 수집을 한 칸 진행한다** — 팝업이 닫혀 상세/확정 화면으로 돌아왔을 때.
     *
     * 🔴 확정 화면과 **확정 전 상세**가 같은 규칙을 쓴다. 두 곳에 나눠 적으면 한쪽만
     *    고쳐져 갈라진다 — 이 레포가 반복해서 겪은 「목록을 손으로 나열」이다.
     *    새 팝업 단계가 생기면 **여기에만** 더한다.
     */
    private fun advanceCollect(rootNode: AccessibilityNodeInfo) {
        when (session.collectState) {
            SessionManager.CollectState.WAITING_FOR_PICKUP_POPUP -> collectMachine.clickPickup(rootNode)
            SessionManager.CollectState.WAITING_FOR_DROPOFF_POPUP -> collectMachine.clickDropoff(rootNode)
            else -> {}   // IDLE·WAITING_FOR_MEMO·DONE — 여기서 할 일이 없다
        }
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 적요 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    private fun handleMemoPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        // 🚧 시퀀스 플러그인 경계 — 인성 잡기 수순 (픽커_수집.md §3-확장)
        if (!TargetApp.supportsCatching(currentTargetApp)) return
        collectMachine.handleMemoPopup(rootNode, session, screenTexts)
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 출발지 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    private fun handlePickupPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        // 🚧 시퀀스 플러그인 경계 — 인성 잡기 수순 (픽커_수집.md §3-확장)
        if (!TargetApp.supportsCatching(currentTargetApp)) return
        collectMachine.handlePickupPopup(rootNode, session, screenTexts)
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 도착지 팝업 스크래핑 + /detail 전송
    // ════════════════════════════════════════════════════════════════

    private fun handleDropoffPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        // 🚧 시퀀스 플러그인 경계 — 인성 잡기 수순 (픽커_수집.md §3-확장)
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
     * 🌐 **2차 상세를 보낸다 — 팝업에서 모은 텍스트를 통째로.**
     *
     * 두 곳에서 부른다. 상세 수집이 끝났을 때, 그리고 **미리보기로 본 콜을 기사님이 확정했을 때**
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
            //
            /**
             * 🔴 **전송이 실패하면 기다리지 않고 바로 뱉는다** (기사님 확정 2026-08-29).
             *
             * `ApiClient.sendDetail` 은 실패 시(비2xx · 재시도 소진 · 예외) `CANCEL` 을 준다.
             * 예전에는 이 콜백을 **버리고** 30초 안전취소 타이머에 맡겼다. 실패 경로를 재어
             * 보니 그 대기가 **버는 것 없이 잃기만** 했다:
             * ```
             *   서버 5xx        → 1초 미만 (응답이 왔으니 재시도 안 함)
             *   연결 자체 불가  → 1~2초    (즉시 실패 ×2 + 0.5초)
             *   타임아웃        → 30.5초   (15초 ×2 + 0.5초) ← 타이머(30초)가 먼저 발화한다
             * ```
             * 🔴 **기다려도 결론이 바뀌지 않는다.** 상세가 서버에 닿지 못했으니 판정할 재료가
             *    없고, 타이머가 만료되면 하는 일도 똑같은 `CANCEL` 이다
             *    (`startSafeCancelTimer` → `executeDecisionImmediately("CANCEL")`).
             *    그러므로 **취소 횟수는 늘지 않는다** — 같은 결론에 28초 빨리 닿을 뿐이다.
             *    타임아웃(30.5초)에서는 타이머가 먼저 처리하므로 이 콜백이 늦게 와도 무해하다.
             *
             * ⚠️ 안전취소 타이머는 **그대로 둔다** — 이건 겹쳐 두는 것이지 대체가 아니다
             *    (규칙 ② · 앱의 30초는 최후의 안전장치라 절대 제거하지 않는다).
             */
            apiClient.sendDetail(payload) { failedOrderId, decision ->
                // 👻 고스트 방어 — 정상 판결 경로(`decisionCallback`)와 **같은 규칙**이다.
                //    실패 응답이 늦게 와서 이미 다음 콜로 넘어갔으면 그 콜을 취소하면 안 된다
                //    (판결에 orderId 를 싣고 대조한다 — 규칙 ②).
                if (failedOrderId.isNotEmpty() && failedOrderId != session.currentOrderId) {
                    AppLogger.e(TAG, "👻 [상세 전송 실패·무시] 지난 콜($failedOrderId)의 실패다 — 현재 콜(${session.currentOrderId})은 건드리지 않는다")
                } else {
                    AppLogger.e(TAG, "❌ [상세 전송 실패] 판정 재료가 서버에 없다 — 즉시 $decision (30초 대기 생략)")
                    executeDecisionImmediately(decision)
                }
            }
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

    /** 세션 ID가 없으면 새로 생성 — 접두사는 **출신**이지 기기 모드가 아니다 */
    private fun ensureSessionId() {
        session.ensureOrderId()
    }

    /** 팝업 잔상이 화면에 남아있는지 검사 */
    private fun isPopupResidue(rawScreenStr: String): Boolean {
        val resid = screenDetector.isPopupResidue(rawScreenStr)
        if (resid) AppLogger.roadmap("✋ [Race Condition 방어] 출발지/도착지 팝업 닫힘 애니메이션 잔상 대기", telemetryManager.currentScreenContext.name)
        return resid
    }

    /**
     * 앱별 확정 버튼 텍스트 리스트 중 첫 번째로 발견되는 버튼을 클릭합니다.
     * 목록은 배차망 플러그인의 `confirmKeywords` 가 정한다 — 여기 손으로 적지 않는다.
     * ⚠️ 예전 주석은 *"인성콜: 확정 하나만"* 이라 했는데 실제로는 둘이다("확정"·"배차").
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


