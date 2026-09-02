package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import com.onedal.app.core.AppLogger
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.api.ApiClient
import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import com.onedal.app.plugins.insung.handleConfirmedScreen
import com.onedal.app.plugins.kakaopicker.reportPickerAccepted
import com.onedal.app.plugins.kakaopicker.sendPickerPreview
import com.onedal.app.plugins.insung.handleMemoPopup
import com.onedal.app.plugins.insung.handlePreConfirmScreen
import com.onedal.app.plugins.insung.buildOrderFromScreen
import com.onedal.app.plugins.insung.isPopupResidue
import com.onedal.app.plugins.insung.advanceCollect
import com.onedal.app.plugins.insung.handleDropoffPopup
import com.onedal.app.plugins.insung.handlePickupPopup
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords
import com.onedal.app.core.AlarmSignaler
import com.onedal.app.core.NetworkSwitchGate
import com.onedal.app.core.WorkStage
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.CallMemory
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.TargetApp
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.core.engine.PreConfirmGate
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.core.engine.ScanContext
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
class HijackService : AccessibilityService(), ScanContext {

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
    override lateinit var telemetryManager: TelemetryManager
    override lateinit var scrapParser: ScrapParser
    override lateinit var touchManager: AutoTouchManager

    // ── 설정 ──
    override lateinit var keywords: ScreenKeywords
    override val screenDetector = ScreenDetector()
    private var lastScreenFingerprint = 0
    // 👁️ «본 콜» 장부 — «평가했다»와 «보고했다»를 딴 그릇으로 (#79 · CallMemory 주석 참고)
    private val callMemory = CallMemory(MAX_ORDER_HASH_CACHE, ORDER_HASH_KEEP_COUNT)
    override var currentTargetApp = "insung"

    /**
     * 🎯 배차망 적용 — 라디오(부팅)와 자동 전환(2단계)이 **같은 길**을 탄다.
     * 파서·키워드·코드가 한 번에 갈아타고, 전환이면 지문·세션도 새로 시작한다
     * (남의 배차망 지문이 남으면 «이미 본 콜»로 삼킨다).
     */
    private fun applyTargetApp(label: String, isSwitch: Boolean = false) {
        currentTargetApp = TargetApp.codeOf(label)
        keywords = when (label) {
            "24시" -> Hwamul24Keywords.TWENTYFOUR
            "픽커" -> KakaoPickerKeywords.PICKER
            else -> InsungKeywords.INSUNG
        }
        scrapParser = ScrapParser(this, label)
        if (isSwitch) {
            callMemory.clear()
            resetSessionState()
        }
        AppLogger.i(TAG, "🎯 타겟 앱 ${if (isSwitch) "자동 전환" else "설정"} 완료: $label")
    }

    /**
     * 🔄 **화면을 따라 판을 갈아탄다** — 이벤트로 왔든 타이머로 왔든 **길은 하나다.**
     * (두 갈래로 적으면 한쪽만 고쳐진다 — 이 레포가 여러 번 당한 모양이다)
     */
    private fun switchNetworkTo(network: String) {
        val label = TargetApp.labelOf(network)
        getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE).edit().putString("targetApp", label).apply()
        applyTargetApp(label, isSwitch = true)
        /**
         * 🔴 **지문을 비운다.** 화면 글자는 그대로인데 **읽는 파서만** 바뀌었으므로,
         * 지문을 그대로 두면 «같은 화면»이라며 다음 이벤트를 통째로 건너뛴다
         * (`onAccessibilityEvent` 첫머리의 지문 비교) — 갈아타고도 영영 안 읽는다.
         */
        lastScreenFingerprint = 0
        AppLogger.i(TAG, "🔄 [배차망 자동 전환] 화면을 따라 $label 판으로 — 라디오는 표시만 따라온다")
        refreshScreenContextAfterSwitch()
    }

    /**
     * 🔄 **갈아탄 직후 «지금 무슨 화면인가»만 다시 매긴다** — 읽기만 한다(터치·수집 없음).
     *
     * 정지 화면(픽커 홈 등)에서는 갈아탄 뒤 **다음 이벤트가 영영 안 올 수 있다.** 그러면
     * 판은 픽커인데 화면 이름은 «알 수 없는 화면»으로 굳은 채 60초 생존신고만 나간다.
     *
     * ⚠️ 이것은 2026-09-02 에 실패한 «몇 박자 뒤 다시 읽기»와 **다르다.** 그때는 화면이
     *    바뀌기를 기대하며 다시 읽었고, 접근성 캐시가 아까 화면을 돌려줘 실패했다.
     *    여기서 필요한 것은 **바뀐 화면이 아니라 바뀐 파서**다 — 캐시가 주는 그 화면이
     *    바로 지금 화면이고, 그것을 새 파서로 읽으면 된다.
     */
    private fun refreshScreenContextAfterSwitch() {
        val node = rootInActiveWindow ?: return
        val texts = mutableListOf<String>()
        gatherNodeTexts(node, texts)
        node.recycle()
        updateScreenContext(detectScreenContext(texts.joinToString(" ")))
    }

    /**
     * 👁️ 리스트를 떠난 시각 (0 = 지금 리스트를 보고 있다).
     * 상세에 머무는 동안은 배차망 리스트를 못 읽으므로, 그 길이를 재서 복귀할 때 남긴다.
     * **놓친 콜과 걸러낸 콜을 구분하는 유일한 근거다.**
     */
    private var listBlindSinceMs = 0L

    // ── 세션 상태 (SessionManager로 통합) ──
    override val session = SessionManager()

    /** 🔔 알람 모드의 폰 쪽 신호 — 소리·진동·테두리 (`docs/지금/기기_모드.md` 2단계) */
    private val alarmSignaler by lazy { AlarmSignaler(this) }

    /**
     * 🚪 알람 상세 자동 진입의 복귀 타이머 — **ID 를 저장해 취소 가능하게** (좀비 타이머 규칙).
     * 우리가 열어 준 상세에서 기사님이 30초 무응답이면 폰이 스스로 뒤로 나와
     * 리스트 수집을 재개한다. 기사님이 손으로 연 상세는 이 타이머가 안 걸린다.
     */
    private var alarmDetailBackRunnable: Runnable? = null

    /**
     * 🚚 마지막으로 알아본 픽커 운행 단계 — **바뀔 때만 로그를 남기려고** 들고 있다.
     * 매 스캔(1초)마다 찍으면 로그가 그 줄로 덮여 다른 줄을 묻는다
     * (`planMergedStops` 가 08-29 에 당한 것과 같은 계열).
     */
    private var lastPickerStage: com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords.Stage? = null

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
    override lateinit var collectMachine: DetailCollectMachine
    override val recentListOrders = mutableListOf<SimplifiedOfficeOrder>()

    // ── AUTO 모드 타이머 ──
    override val mainHandler = Handler(Looper.getMainLooper())
    private val safeCancelTimer = SafeCancelTimer()
    override lateinit var cautionVerifier: CautionDongVerifier

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
        applyTargetApp(targetApp)

        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient, this)  // [GPS 텔레메트리] context 전달하여 위치 조회 가능하도록

        touchManager = AutoTouchManager(this)
        collectMachine = DetailCollectMachine(touchManager)
        cautionVerifier = CautionDongVerifier(this)

        /**
         * 💤 시작할 때의 화면 상태는 **물어봐서** 세운다 — 기본값(켜짐)으로 두면
         * 화면이 꺼진 채 서비스가 붙었을 때 첫 보고부터 거짓말한다.
         */
        telemetryManager.isScreenOn =
            (getSystemService(Context.POWER_SERVICE) as android.os.PowerManager).isInteractive

        /**
         * 🚦📦 **폰 상태 바가 쓸 것 둘을 꽂는다** (2026-09-02 · `docs/기획/폰_상태바.md` 2단계).
         * 단계는 **보낼 때마다 여기서 새로 계산**한다 — 복사본을 두면 갱신을 빠뜨린 자리가
         * 옛 단계를 계속 말한다.
         */
        telemetryManager.appVersion = com.onedal.app.core.AppInfo.versionLabel(this)
        telemetryManager.workStageProvider = {
            WorkStage.of(
                isAutoActive = session.isAutoActive,
                isWaitingForDecision = session.isWaitingForDecision,
                safeCancelRemainSec = safeCancelTimer.remainSec,
                collectState = session.collectState,
                isDetailScrapSent = session.isDetailScrapSent,
            )
        }
        telemetryManager.start()
        /**
         * 🟢 **붙자마자 한 번 쏜다** (기사님 실측 2026-09-02: *"폰이랑 서버랑 연결이 안 되는데?"*).
         *
         * `start()` 는 **60초 생존신고 시계만** 건다. 그래서 앱이 떠도 첫 보고가 1분 뒤였고,
         * 그동안 관제웹에서는 이 폰이 **아예 없는 것처럼** 보였다. 접근성을 껐다 켜면 그
         * 시계가 처음부터 다시 시작하므로, 실측에서는 세 번 토글하는 사이 1분 넘게 조용했다.
         */
        telemetryManager.forceHeartbeat()
        apiClient.fetchKeywords()

        /**
         * 🖥️ **첫 보고는 «본 것»이어야 한다** (2026-09-02 · 기사님 실측 제보로 수리).
         *
         * 기사님: *"픽커는 지금 홈에 있는데. 콜 리스트로 나오고 있어."*
         *
         * 예전에는 여기서 `updateScreenContext(ScreenContext.LIST)` 로 **화면을 읽지도 않고**
         * «콜 리스트»라고 세웠다. 인성에서는 우연히 맞았다 — 스캐너를 켜는 자리가 대개
         * 리스트니까. 픽커 홈에서 그 우연이 깨졌고, 관제웹이 계속 거짓말을 했다.
         *
         * 🔴 **왜 스스로 안 고쳐지나** — 홈 화면은 움직이지 않아
         * `TYPE_WINDOW_CONTENT_CHANGED` 가 **안 온다.** 이벤트가 없으면 판별도 없고,
         * 처음 세운 값이 그대로 굳는다. 그래서 «첫 값»이 곧 «오래 가는 값»이다.
         *
         * 규칙 ④(*"없는 숫자를 지어내지 않는다"*)의 화면판이다 — `0` 이 아니라 `null` 이듯,
         * **안 본 화면은 «리스트»가 아니라 «모름»** 이다. 지금은 읽어서 답하고,
         * 아직 화면이 없으면(`null`) 그때만 «모름»이라 한다 (규칙 ③ — 파생).
         */
        val firstScreen = rootInActiveWindow?.let { node ->
            val texts = mutableListOf<String>()
            gatherNodeTexts(node, texts)
            node.recycle()
            detectScreenContext(texts.joinToString(" "))
        } ?: ScreenContext.UNKNOWN
        AppLogger.i(TAG, "🖥️ 붙는 순간 화면: $firstScreen")
        updateScreenContext(firstScreen)

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
        /**
         * 🔴 **읽어서 답한다 — 지어내지 않는다** (2026-09-02 수리).
         *
         * 예전엔 `"(인성콜)"` 이 박혀 있었다. 바로 윗줄 Parser 는 파생인데 이 줄만
         * 리터럴이라, **픽커로 돌 때도 「인성콜」이라 찍혔다.** 그날 홈 화면 오보를
         * 진단하다 이 로그를 믿고 한 번 헛짚었다.
         *
         * 같은 자리의 «붙는 순간 화면»(위 `firstScreen`)과 **같은 클래스**다 —
         * 읽지 않고 단언하는 것. 인스턴스를 하나씩 고치는 대신 규칙으로 잠갔다
         * (`tests/rules/screenTruth.test.ts`).
         */
        AppLogger.i(TAG, "  🎯 Keywords   (${keywords.appLabel})")
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
        /**
         * 📵 **왜 내려가는지 지금 알 수 있다** (기사님 지적 2026-09-02).
         * 접근성 스위치를 끄면 안드로이드가 이 서비스를 죽인다. 그 순간 «켜진 접근성
         * 목록»에 우리가 **없으면** 그건 추측이 아니라 사실이다 — 기사님이 끄신 것이다.
         * 목록에 아직 있으면 앱·시스템 사정으로 내려가는 것이라 «앱 꺼짐»이다.
         */
        val enabled = android.provider.Settings.Secure.getString(
            contentResolver, android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        val reason = if (enabled.contains(packageName)) "APP_SHUTDOWN" else "ACCESSIBILITY_OFF"
        AppLogger.w(TAG, "📵 [오프라인 통보] 까닭: $reason")
        apiClient.sendOffline(reason) // 앱 종료 시 오프라인 통보 — 까닭을 함께
        apiClient.shutdown()
        AppLogger.roadmap("🛑 1DAL 서비스 완전 종료 (앱 파괴)", "SHUTDOWN")
        AppLogger.w(TAG, "🛑 1DAL Service Destroyed! (완전 종료)")
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 2: 화면 읽기 및 종류 판별 (이벤트 라우터)
    // ════════════════════════════════════════════════════════════════

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        /**
         * 🪟 **«내용이 바뀜»과 «창이 바뀜» 둘 다 화면이 바뀐 것이다** (2026-09-02 수리).
         *
         * 기사님: *"「나가시겠습니까」 알럿창에 「네」 하고 홈으로 왔는데 알 수 없는 화면으로
         * 계속 남아 있어."*
         *
         * 예전엔 `TYPE_WINDOW_CONTENT_CHANGED` 하나만 봤다. 다이얼로그가 닫히고 홈으로
         * 돌아가는 것은 **창이 바뀌는 사건**이라 그 이름으로 오지 않는다 — 그래서 판별이
         * 아예 안 돌았고, 알럿 화면이던 `UNKNOWN` 이 1분 넘게 굳었다.
         *
         * 🔴 앞의 «붙는 순간 화면»과 뿌리가 같다 — *화면이 안 움직이면 아무도 다시 안 본다.*
         *    그때는 **첫 값**이 굳었고 이번엔 **마지막 값**이 굳었다.
         *
         * ⚠️ 인성은 안 흔들린다 — 스캔이 늘어도 아래 **지문 비교**가 같은 화면을 거른다.
         *    오히려 팝업이 닫히는 순간을 더 정확히 본다.
         */
        val watched = event?.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ||
                event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
        if (!watched) return

        /**
         * ⏱️ **창이 바뀌면 한 번으로 안 믿는다** (2026-09-02 · 기사님 실측:
         * *"바뀌고 나서 1분 가까이 기다려야 하는 것 같아"*).
         *
         * 전환 이벤트가 오는 **그 순간의 창은 아직 옛 내용**이다. 그래서 아래 지문 비교에
         * 걸려 건너뛰고, 새 화면이 정지 화면이면 **아무도 다시 안 본다.**
         * 실측 19초 — 그것도 프로모션 배너가 저절로 움직여 준 덕이었다.
         *
         * 그려질 시간을 주고 몇 박자 뒤 다시 본다. 헛읽기가 늘어도 **지문이 막아** 전송은
         * 안 는다. 재확인은 **읽기만** 한다 — 터치하면 2026-08-12 「LIST 오탐 → 세션 리셋」
         * 이 되살아난다.
         */
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
            /**
             * 🔴 **여기서 «조금 뒤 다시 보기»를 하지 않는다 — 해 봤고, 안 된다** (2026-09-02).
             *
             * 화면이 넘어가는 도중에는 글자가 어중간해서(「close dialog」 · 빈 화면 0자)
             * 어느 화면인지 알 수 없다. 그래서 0.3·0.9·2초 뒤에 `rootInActiveWindow` 를
             * 다시 읽어 보는 코드를 넣었다가 **되돌렸다.**
             *
             * ── 왜 안 되나 ──
             * 안드로이드 접근성은 화면 내용을 **캐시**하고, 그 캐시는 **이벤트가 와야**
             * 버려진다. 이벤트 없이 «지금 화면 줘»라고 하면 **아까 그 화면을 그대로 준다.**
             * 실측: 세 번 다시 읽었는데 값이 **한 번도 안 바뀌었다**(`🔁 [다시 보기]` 로그가
             * 한 줄도 안 찍혔다). 18.3초 → 18.3초, 전혀 나아지지 않았다.
             *
             * 🔴 **«내가 원할 때 다시 본다»는 것은 안드로이드가 보장하지 않는다.**
             *    폰이 알려줄 때만 볼 수 있다. 늘리려면 **받는 이벤트 종류**를 늘리거나
             *    (`res/xml/accessibility_service_config.xml`), 캐시를 끄는 수밖에 없다
             *    (`setCacheEnabled(false)` · Android 12+ — 인성 전체의 배터리를 건다).
             *
             * ⚠️ 그리고 **실제로 늦는 것은 정지 화면뿐이다.** 리스트·상세·팝업은 계속
             *    움직여 이벤트가 쏟아지므로 즉시 반영된다(실측). 늦는 곳은 픽커 홈이고,
             *    거기는 일을 안 하고 있는 시간이다.
             */
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
        // 🚪 상세에서 리스트로 **돌아왔다**(기사님이 뒤로/수락) — 자동 복귀 타이머는 일이 없어졌다.
        //    🔴 «지금 LIST냐»가 아니라 «상세에서 돌아왔느냐»다 (직전 화면을 본다 — 2026-08-12 규칙).
        //    클릭 직후 화면이 넘어가기 전의 LIST 이벤트(실측 23:02:12.961)가 타이머를 죽이던 자리.
        if (detected == ScreenContext.LIST && previous == ScreenContext.DETAIL_PRE_CONFIRM) cancelAlarmDetailBack()

        /**
         * ✅ **픽커에서 기사님이 「수락하기」를 누르셨나** — 화면 분류가 아니라 **직접 확인**한다
         * (2026-09-02 실사고 수리 · 기사님 지시 *"페이지를 정확히 인지하는 것이 중요하겠다"*).
         *
         * 🔴 **왜 화면 분류에 얹지 않는가** — 실물 덤프 12종을 훑어 보니 픽커 상세를 가르는
         *    낱말은 「넘기기」·「수락하기」 **둘뿐**인데, 그 둘 다 **수락 «전»의 표식**이다.
         *    수락하면 사라지므로, 수락 후 화면은 분류로는 «상세»가 아니게 된다.
         *    그래서 «상세인데 수락하기가 없으면 수락됨»으로 갈랐다가 사고가 났다 —
         *    리스트에 상세 잔상 한 줄(「픽업지 …」)이 남은 판을 «수락됨»으로 읽어
         *    **아무도 안 누른 콜이 잡은 콜로 승격**됐다 (08:37:17 · 관제웹 유령 콜).
         *
         * → 인성이 쓰는 방어 넷을 그대로 옮긴다:
         *   ① 수락 후에만 있는 낱말이 **실제로 보여야** 한다 (`isAcceptedScreen` — 있음을 본다)
         *   ② **잔상이면 그 판을 통째로 버린다** (`isDetailResidue` — 인성 팝업 잔상 방어와 같은 계열)
         *   ③ **직전 화면이 «수락 전 상세»였을 때만** — 한 프레임으로 정하지 않는다
         *   ④ 미리보기를 올린 적이 있어야 한다 (`reportPickerAccepted` 안에서 본다)
         */
        if (!TargetApp.supportsCatching(currentTargetApp)
            && previous == ScreenContext.DETAIL_PRE_CONFIRM
            && !com.onedal.app.plugins.kakaopicker.KakaoPickerParser.isDetailResidue(screenTexts)) {
            reportPickerAccepted(rawScreenStr)
        }


        /**
         * 🌐 **배차망 불일치 관문** (기사님 확정 2026-08-31 · 1단계).
         * 보는 화면(패키지)이 아는 배차망인데 선택(라디오)과 다르면 — 이 판을 통째로 버린다.
         * 안 버리면 남의 화면을 남의 파서로 읽어 쓰레기 콜이 올라간다 (잔상 사고와 같은 계열).
         * 모르는 패키지(카톡 등)는 관문 대상이 아니다 — 어차피 UNKNOWN 화면으로 흐른다.
         */
        val screenNetwork = TargetApp.codeOfPackage(rootNode.packageName?.toString())
        NetworkSwitchGate.switchTargetFor(screenNetwork, currentTargetApp)?.let { target ->
            // 🔄 **기다리지 않는다** (기사님 확정 2026-09-02: "4초 지워").
            //    기다리는 동안 앱은 판을 버려 콜을 한 건도 안 읽는데, 얻는 것이 없었다.
            switchNetworkTo(target)
            // 갈아탄 파서로 이 판을 다시 읽는다 — 다음 이벤트를 기다리지 않는다
            //    (정지 화면이면 그 «다음»이 영영 안 온다 — 2026-09-02 실측 2분)
            rootNode.recycle()
            return
        }

        /**
         * 🚚 **운행 단계를 로그로 남긴다** (기사님 지시 2026-09-02:
         * *"페이지만 만들어 두면 오늘 저녁 들어올 때 훨씬 잘 구분할 거야"*).
         *
         * 낱말이 2023 자료 추정이라 **오늘은 인식과 기록만 한다** — 장부(마일스톤)에는
         * 아직 잇지 않는다. 틀린 낱말로 장부에 쓰면 되돌릴 수 없다 (규칙 ④).
         *
         * 🔴 **못 알아본 화면은 글자를 남긴다.** 저녁에 이 줄들을 모으면 «어느 낱말이
         *    빠졌는지»를 실물로 고를 수 있다 — 그게 오늘 판의 산출물이다.
         */
        /**
         * 🔴 **픽커 화면일 때만 본다** — 패키지로 가른다 (2026-09-02 실측 수리).
         *
         * 처음엔 «픽커 모드이고 리스트가 아니면» 으로 걸었더니 **잠금화면·런처까지**
         * 「모르는 화면」으로 찍혔다(`잠금해제 패턴을 그리세요` · `셀 1 추가됨…`).
         * 저녁에 볼 로그가 그걸로 덮인다 — 「어느 낱말이 빠졌나」를 못 고른다.
         *
         * «지금 보는 화면이 어느 배차망인가»는 이미 한 곳이 안다 (`codeOfPackage` · 규칙 ③).
         */
        if (screenNetwork == TargetApp.KAKAOPICKER && detected != ScreenContext.LIST) {
            val stage = com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords.stageOf(rawScreenStr)
            if (stage != null) {
                if (stage != lastPickerStage) {
                    AppLogger.i("1DAL_PICKER", "🚚 [운행 단계] ${lastPickerStage ?: "없음"} → $stage")
                    lastPickerStage = stage
                }
            } else if (detected == ScreenContext.UNKNOWN) {
                // 못 알아본 픽커 화면 — 낱말을 고르려면 글자가 있어야 한다
                AppLogger.w("1DAL_PICKER", "❓ [모르는 화면] ${rawScreenStr.take(300)}")
            }
        }
        if (detected == ScreenContext.LIST) lastPickerStage = null   // 리스트로 나오면 초기화

        // 화면별 핸들러 라우팅
        when (detected) {
            ScreenContext.LIST -> handleListScreen(rootNode, screenTexts)
            ScreenContext.DETAIL_PRE_CONFIRM -> {
                /**
                 * 🚧 **배차망별로 갈라 보낸다** (2026-09-02 · 인성 수순을 폴더로 뺀 뒤).
                 * 잡기 수순이 있는 배차망은 인성 수순으로, 없는 배차망(픽커)은
                 * «읽고 미리보기만» 하는 길로. 예전에는 인성 함수 **안에** 픽커 분기가
                 * 들어 있었다 — 그게 두 배차망이 한 자리에 섞여 있던 증거다.
                 */
                if (TargetApp.supportsCatching(currentTargetApp)) {
                    handlePreConfirmScreen(rootNode, screenTexts, rawScreenStr)
                } else {
                    AppLogger.i("1DAL_PICKER", "📄 [상세 실물] ${screenTexts.joinToString(" | ").take(500)}")
                    sendPickerPreview(rawScreenStr)
                }
            }
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
        // 👻 상세→리스트 복귀 직후 잔상 방어 (0830 23:04 실측) — 상세 글자가 남은 판은 버린다.
        //    다음 스캔(1초 안)은 깨끗하다. 인성 팝업 잔상 방어와 같은 계열, 픽커(잡기 수순 없음)만.
        if (!TargetApp.supportsCatching(currentTargetApp)
            && com.onedal.app.plugins.kakaopicker.KakaoPickerParser.isDetailResidue(screenTexts)) {
            AppLogger.d(TAG, "👻 [상세 잔상] 리스트 스캔에 상세 글자 잔류 — 이 판은 버린다")
            return
        }
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
            // 🚧 인성 전용 구간 — 잡기 수순 없는 배차망(픽커)은 **AUTO 자동 클릭을 안 한다**.
            //    ⚠️ «아무것도 안 누른다»가 아니다 — 알람일 때는 상세까지 들어간다(아래 알람 절).
            //    막는 것은 계약 버튼 하나뿐이고 그건 `KakaoPickerParser.clickSafe` 가 본다 (0902 기사님 교정)
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
         * 수락(계약) 클릭은 여전히 없다: 상세 화면 처리는 잡기 차단 검사가 건너뛴다.
         */
        val bestIdx = AlarmSignaler.pickBestIndex(alarmHits.map { it.first.fare })
        if (bestIdx >= 0) {
            val (order, fareNode, orderHash) = alarmHits[bestIdx]
            alarmSignaler.fire(fareNode.rect, scrapParser.alarmBandHalfPx(), orderHash)
            // 🔴 «수락»이 보이는 카드는 손대지 않는다 — 그 글자가 곧 계약 버튼이다 (clickSafe)
            if (!TargetApp.supportsCatching(currentTargetApp)
                && com.onedal.app.plugins.kakaopicker.KakaoPickerParser.clickSafe(order.rawText)) {
                AppLogger.i("1DAL_ALARM", "🚪 [알람 상세] ${order.fare}원 (${order.pickup.take(10)}→${order.dropoff.take(10)}) " +
                    "상세로 이동 — 수락은 기사님 · 30초 무응답 시 자동 복귀")
                /**
                 * 📎 **리스트에서 읽은 원본을 쥐고 들어간다** (2026-09-02).
                 * AUTO 가 인성에서 하는 것과 **같은 수단**이다(`lastDetailOrder`) — 상세 화면
                 * 글자를 다시 파싱해 역추적하지 않아도 된다. 요금·구·동·물품크기·태그가
                 * 리스트에서 이미 제대로 읽혔고, 상세는 그 위에 원문만 덧댄다.
                 */
                session.lastDetailOrder = order
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

    // ════════════════════════════════════════════════════════════════
    //  기능 4: 확정 화면(CONFIRMED) → 자동 상세 수집 구동
    // ════════════════════════════════════════════════════════════════



    /**
     * 📤 **1차 선점을 보낸다 — 한 콜에 한 번만.**
     *
     * 두 곳에서 부른다. 필터콜은 상세 진입 즉시(선점), **미리보기 콜은 팝업 3장을 읽은 뒤**
     * `/detail` 직전에. 같은 요청을 두 벌로 적으면 한쪽만 고쳐져 갈라지므로 여기 하나만 둔다.
     *
     * 🔴 `isDetailScrapSent` 가 중복 전송을 막는다 — 미리보기 상세 수집이 끝나 상세 화면으로
     *    돌아왔을 때 이 함수가 다시 불리지 않게 하는 자물쇠이기도 하다.
     */
    override fun sendConfirmOnce(order: SimplifiedOfficeOrder, rawScreenStr: String) {
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

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 적요 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════



    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 출발지 팝업 스크래핑
    // ════════════════════════════════════════════════════════════════

    // ════════════════════════════════════════════════════════════════
    //  기능 4 (팝업 핸들링): 도착지 팝업 스크래핑 + /detail 전송
    // ════════════════════════════════════════════════════════════════

    /**
     * 🌐 **2차 상세를 보낸다 — 팝업에서 모은 텍스트를 통째로.**
     *
     * 두 곳에서 부른다. 상세 수집이 끝났을 때, 그리고 **미리보기로 본 콜을 기사님이 확정했을 때**
     * (그때는 팝업을 다시 열지 않고 모아 둔 텍스트를 그대로 다시 보낸다).
     * 같은 요청을 두 벌로 적으면 한쪽만 고쳐져 갈라지므로 여기 하나만 둔다.
     */
    override fun sendDetail(order: SimplifiedOfficeOrder) {
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

    /**
     * 🖥️ **이 화면이 무엇인가 — 한 곳에서 답한다** (규칙 ③).
     *
     * 낱말 판별(`screenDetector`)이 먼저 답하고, **잡기 수순이 없는 배차망**은 그 위에
     * 자기 운행 화면을 얹는다. 픽커의 「픽업 완료해주세요」 같은 화면은 인성 목록에
     * 없어서 `UNKNOWN` 으로 떨어지는데, 그러면 관제웹이 «알 수 없는 화면»(빨간 깜빡임)만
     * 보여 준다 — 기사님이 가장 알고 싶은 순간에 관제가 가장 모르게 된다
     * (기사님 지시 2026-09-02: *"관제에서는 폰의 상황을 잘 알아야 해"*).
     *
     * 🔴 **치환은 배차망 폴더 안에서 한다** — 여기는 «부르기»만 한다. 페이지 이름(`Stage`)은
     *    픽커 폴더 밖으로 안 나오고, 나오는 것은 공통 화면 값 하나뿐이다.
     *
     * ⚠️ 인성·24시는 이 줄을 안 지난다 — `supportsCatching` 이 참이라 예전과 완전히 같다.
     */
    private fun detectScreenContext(text: String): ScreenContext {
        val byKeywords = screenDetector.detect(text, keywords)
        if (TargetApp.supportsCatching(currentTargetApp)) return byKeywords
        val stage = com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords.stageOf(text)
        return com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords.screenContextOf(stage) ?: byKeywords
    }

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
    override fun resetSessionState() {
        session.reset {
            cancelSafeCancelTimer()
            telemetryManager.isHolding = false  // [Page/Hold 분리] 리스트 복귀 → 콜 잡기 모드
            AppLogger.i(TAG, "🛡️ [앱폰] 콜 잡기 복귀 직후: 앱 메모리 상의 scrapBuffer 배열을 비우고 강제 플러시(Flush)하여 잔상 데이터를 제거함")
            telemetryManager.forceFlushEvent()  // 즉시 서버에 홀드 해제 알림
        }
    }

    /** 세션 ID가 없으면 새로 생성 — 접두사는 **출신**이지 기기 모드가 아니다 */
    override fun ensureSessionId() {
        session.ensureOrderId()
    }

    /**
     * 앱별 확정 버튼 텍스트 리스트 중 첫 번째로 발견되는 버튼을 클릭합니다.
     * 목록은 배차망 플러그인의 `confirmKeywords` 가 정한다 — 여기 손으로 적지 않는다.
     * ⚠️ 예전 주석은 *"인성콜: 확정 하나만"* 이라 했는데 실제로는 둘이다("확정"·"배차").
     */
    override fun clickFirstMatchingButton(rootNode: AccessibilityNodeInfo, buttonTexts: List<String>): Boolean {
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
    override fun nowTimestamp(): String {
        return SimpleDateFormat(ISO_TIMESTAMP_FORMAT, Locale.getDefault()).format(Date())
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


