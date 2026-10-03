package com.onedal.app

import com.onedal.app.core.KeepCloseWait
import android.accessibilityservice.AccessibilityService
import com.onedal.app.core.LogTag
import android.graphics.Rect
import com.onedal.app.core.AppLogger
import com.onedal.app.core.LogOnce
import com.onedal.app.core.HandFirst
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.api.ApiClient
import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import com.onedal.app.plugins.kakaopicker.reportPickerAccepted
import com.onedal.app.core.engine.handlePreConfirmScreen
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import com.onedal.app.core.AlarmSignaler
import com.onedal.app.core.NetworkSwitchGate
import com.onedal.app.core.WorkStage
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.CallMemory
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.TargetApp
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenTextNode
import com.onedal.app.core.engine.PreConfirmGate
import com.onedal.app.core.engine.ScreenDetector
import com.onedal.app.core.engine.ScanContext
import com.onedal.app.core.engine.SessionManager
import com.onedal.app.core.engine.DetailCollectMachine
import com.onedal.app.core.engine.SafeCancelTimer
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
        /** 🧪 미리 받기 — 깊이 우선(우리 훑기 순서와 같다) · 끊기지 않게 (SDK 33+ · `WalkProbe`) */
        private const val PREFETCH_FLAGS = AccessibilityNodeInfo.FLAG_PREFETCH_DESCENDANTS_DEPTH_FIRST or AccessibilityNodeInfo.FLAG_PREFETCH_UNINTERRUPTIBLE
        private const val TAG = "1DAL_MVP"

        /**
         * 🔴 **시각에는 시간대를 함께 실어 보낸다**.
         *
         * `yyyy-MM-dd'T'HH:mm:ss'Z'` 로 쓰면 **한국 시각을 찍고 뒤에 글자 `Z`(=UTC)를 붙인** 것이 된다.
         * 서버는 그걸 UTC 로 읽으니 **9시간이 밀려**, 상차 마감이 어긋나고 화면에 «대기 572분» 같은 값이 뜬다.
         *
         * `Z` 대신 `XXX` 를 쓰면 `+09:00` 이 붙어 어느 시간대에서 찍었는지가 값에 남는다.
         */
        private const val ISO_TIMESTAMP_FORMAT = "yyyy-MM-dd'T'HH:mm:ssXXX"
        /** 📋 상세가 목록의 어느 줄인가를 찾으려고 들고 있는 최근 목록 콜 — 넘치면 뒤쪽만 남긴다 (같은 콜 기억 크기와 다른 것) */
        private const val RECENT_LIST_ORDERS_MAX = 100
        private const val RECENT_LIST_ORDERS_KEEP = 50
        internal const val FARE_RANGE_MIN = 10.0
        internal const val FARE_RANGE_MAX = 9999.0


        /** 📷 살아 있는 서비스 — 설정 화면의 «화면 찍어 읽기» 시험 버튼이 부른다. 붙으면 채우고 내려가면 비운다 */
        @Volatile var live: HijackService? = null
    }

    /** 📷 화면을 찍어 글자로 읽는다 — 지금은 시험용 (설정 화면 버튼) */
    override lateinit var screenReader: com.onedal.app.core.ScreenReader

    /**
     * 📷 시험: `delayMs` 뒤에 앞 화면을 찍어 읽고 단계별 ms 를 설정 화면과 로그에 적는다.
     * 버튼을 누른 뒤 픽커 상세로 넘어갈 시간을 준다.
     */
    fun benchScreenRead(delayMs: Long) {
        waitBook.schedule("사진 읽기 시험", com.onedal.app.core.WaitBook.SERVICE, delayMs) {
            /* 📷 사진 판독기가 있는 배차망의 것으로 — 지금은 하나뿐이다 */
            val parser = com.onedal.app.plugins.DispatchPluginRegistry.all().firstNotNullOfOrNull { it.ocrParser }
            screenReader.bench(
                parser = parser,
                onDone = { results ->
                    val report = results.joinToString("\n") { r ->
                        "[${r.label}] 합계 ${r.ms.total}ms = 찍기 ${r.ms.capture} + 변환 ${r.ms.convert} + 인식 ${r.ms.ocr} + 나누기 ${r.ms.parse} · ${r.lines.size}줄\n  → ${r.parsedSummary}"
                    }
                    com.onedal.app.core.ScreenReadBench.lastReport = report
                    android.widget.Toast.makeText(this, report.lines().first(), android.widget.Toast.LENGTH_LONG).show()
                },
                onError = { msg ->
                    com.onedal.app.core.ScreenReadBench.lastReport = "실패: $msg"
                    android.widget.Toast.makeText(this, "📷 실패: $msg", android.widget.Toast.LENGTH_LONG).show()
                },
            )
        }
    }

    // ── 4대 엔진 ──
    override lateinit var apiClient: ApiClient
    /** 📱 운행 기록 · 누름 기록 — 공통 그릇(`AppTrace`) · 끄는 버튼은 배차망 칸(`traceEndButton`)이 준다 */
    private val traceEndButtons: Set<String> by lazy { com.onedal.app.plugins.DispatchPluginRegistry.all().mapNotNull { it.traceEndButton }.toSet() }
    private val appTrace by lazy { com.onedal.app.core.AppTrace(endButtons = traceEndButtons) }
    /** 올리는 중인가 — 한 번에 한 묶음만 보낸다 (순서가 뒤섞이지 않게) */
    @Volatile private var appTraceSending = false
    /** 👆 마지막으로 배차망 화면으로 알아본 앱 — 그 앱의 누름을 남긴다 (인성·화물24 앱 이름을 따로 안 적는다: 배차망은 화면 글자로 가린다) */
    @Volatile private var lastNetworkPackage: String? = null
    override lateinit var telemetryManager: TelemetryManager
    override lateinit var scrapParser: ScrapParser
    override lateinit var touchManager: AutoTouchManager

    // ── 설정 ──
    override lateinit var keywords: ScreenKeywords
    override val screenDetector = ScreenDetector()
    private var lastScreenFingerprint = 0
    /** 📄 마지막으로 찍은 «페이지 + 덧칸» — 바뀔 때만 한 줄 */
    private var lastPageKey: String? = null
    /** 🧾 마지막 판별 결과 — 알림(«배정» 토스트)이 왔을 때 «알림 때 화면»으로 쓴다 */
    private var lastScreenRead: com.onedal.app.core.engine.ScreenRead? = null
    /** 🔔 «이 콜로 이미 알람을 냈나» — 상차+하차 열쇠 (`AlarmedRoutes`) */
    private val alarmedRoutes = com.onedal.app.core.AlarmedRoutes()
    /** 🔄 마지막으로 본 필터 버전 · 이미 적은 «버전만 바뀜» 쌍 (목록 스캔 첫머리) */
    private var seenFilterVersion: String? = null
    private val versionOnlyPairs = mutableSetOf<String>()
    // 👁️ «본 콜» 장부 — «평가했다»와 «보고했다»를 딴 그릇으로 (#79 · CallMemory 주석 참고)
    private val callMemory = CallMemory()   // 크기는 CallMemory.kt 한 곳
    override var currentTargetApp = "insung"

    override val effectiveMode: String
        get() = TargetApp.effectiveMode(telemetryManager.currentMode, currentTargetApp)

    /**
     * 🎯 배차망 적용 — 부팅(마지막으로 알아낸 배차망)과 화면을 따른 자동 전환이 **같은 길**을 탄다.
     * 파서·키워드·코드가 한 번에 갈아타고, 전환이면 지문·세션도 새로 시작한다
     * (남의 배차망 지문이 남으면 «이미 본 콜»로 삼킨다).
     */
    private fun applyTargetApp(label: String, isSwitch: Boolean = false) {
        val plugin = com.onedal.app.plugins.DispatchPluginRegistry.findByLabel(label)
        currentTargetApp = plugin.code
        keywords = plugin.keywords
        scrapParser = ScrapParser(this, label)
        if (isSwitch) {
            callMemory.clear()
            resetSessionState()
        }
        AppLogger.i(TAG, LogTag.BOOT, "🎯 타겟 앱 ${if (isSwitch) "자동 전환" else "설정"} 완료: ${plugin.label}")
        // 🖼️ 배차망이 바뀌면 실제 모드도 바뀔 수 있다 (자동인데 픽커 → 알람) — 테두리를 다시 칠한다
        if (isSwitch) modeFrame.show(effectiveMode)
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
        AppLogger.i(TAG, LogTag.SCREEN, "🔄 [배차망 자동 전환] 화면 글자를 따라 $label 로 — 마지막으로 알아낸 배차망으로 저장한다")
        refreshScreenContextAfterSwitch()
    }

    /**
     * 🔄 **갈아탄 직후 «지금 무슨 화면인가»만 다시 매긴다** — 읽기만 한다(터치·수집 없음).
     *
     * 정지 화면(픽커 홈 등)에서는 갈아탄 뒤 **다음 이벤트가 영영 안 올 수 있다.** 그러면
     * 판은 픽커인데 화면 이름은 «알 수 없는 화면»으로 굳은 채 60초 생존신고만 나간다.
     *
     * ⚠️ 이것은 «몇 박자 뒤 다시 읽기»와 **다르다.** 그쪽은 화면이
     *    바뀌기를 기대하며 다시 읽는데, 접근성 캐시가 아까 화면을 돌려줄 수 있다.
     *    여기서 필요한 것은 **바뀐 화면이 아니라 바뀐 파서**다 — 캐시가 주는 그 화면이
     *    바로 지금 화면이고, 그것을 새 파서로 읽으면 된다.
     */
    private fun refreshScreenContextAfterSwitch() {
        val node = rootInActiveWindow ?: return
        val texts = mutableListOf<String>()
        gatherNodeTexts(node, texts)
        node.recycle()
        val read = readScreen(texts.joinToString(" "))
        updateScreenContext(contextOf(read, null), read)
    }

    /**
     * 👁️ 리스트를 떠난 시각 (0 = 지금 리스트를 보고 있다).
     * 상세에 머무는 동안은 배차망 리스트를 못 읽으므로, 그 길이를 재서 복귀할 때 남긴다.
     * **놓친 콜과 걸러낸 콜을 구분하는 유일한 근거다.**
     */
    private var listBlindSinceMs = 0L

    // ── 세션 상태 (SessionManager로 통합) ──
    override val session = SessionManager()

    /** 🔔 알람 모드의 폰 쪽 신호 — 소리·진동·테두리 */
    private val alarmSignaler by lazy { AlarmSignaler(this, waitBook) }
    /** 🖼️ 접근성이 켜져 있는 동안 화면 전체를 모드 색으로 두른다 — 녹색 알람 · 파랑 자동 · 주황 직접 */
    private val modeFrame by lazy { com.onedal.app.core.ModeFrame(this) }

    /**
     * ⏱️ **픽커 상세 대기 타이머** — **ID 를 저장해 취소 가능하게** (좀비 타이머 규칙).
     * 확정 전 상세에 들어오면 **누가 열었든(알람·손) · 어느 모드든** 정해진 시간(서버 DB) 뒤 폰이 스스로 뒤로 나와
     * 리스트 수집을 재개한다 (기사님 확정).
     * 🔴 거는 곳은 상세 화면 처리 한 곳 · 끄는 곳은 `resetSessionState` 한 곳 — 거는 길이나 끄는 길이
     *    한쪽에만 있으면, 중간 화면이 낄 때 안 꺼진 타이머가 기사님이 손으로 연 다음 상세를 닫는다.
     */
    private var detailBackRunnable: Runnable? = null
    /** 🔎 `[상세 대기]` 로그의 «연 쪽» 기록용 — 알람이 카드를 누른 시각(부팅 기준) · 동작은 안 가른다 */
    private var alarmTapAtMs = 0L
    private var detailBackOpener = ""
    private var detailBackArmedAtMs = 0L
    /** ⏩ 상세 대기 마감(부팅 기준) · 판정 뒤 접기로 당겼으면 그 콜 (`DetailFold`) */
    private var detailBackDeadlineMs: Long? = null
    private var detailFoldOrderId: String? = null
    /** ⏩ 상세 대기 원래 마감(빨리 접기 풂에 되돌릴 자리) · 기사님 손으로 빨리 접기를 푼 콜 */
    private var detailBackOrigDeadlineMs: Long? = null
    private var foldReleasedOrderId: String? = null

    /** ⏩ 앱이 연 상세에서 기사님 손(스크롤·누름) — 빨리 접기를 풀어 원래 마감으로 (기사님이 보고 계신 콜을 앱이 닫지 않는다 · 1f «가») */
    private fun releaseFoldOnHand(why: String) {
        if (telemetryManager.currentScreenContext != ScreenContext.DETAIL_PRE_CONFIRM || !session.openedByApp) return
        val orderId = session.currentOrderId.ifEmpty { return }
        if (foldReleasedOrderId == orderId) return
        // ⏩ 빨리 접기가 오기 전이어도 기억한다 — 뒤에 오는 foldAfter 를 받지 않는다(리뷰)
        foldReleasedOrderId = orderId
        val folded = detailFoldOrderId != null
        detailFoldOrderId = null
        val r = detailBackRunnable
        val orig = detailBackOrigDeadlineMs
        val now = android.os.SystemClock.elapsedRealtime()
        if (folded && r != null && orig != null && orig > now) {
            waitBook.schedule("상세 대기", com.onedal.app.core.WaitBook.SESSION, orig - now) { r.run() }
            detailBackDeadlineMs = orig
        }
        AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN,
            if (folded) "⏩ [빨리 접기 풂] 상세에 손($why) — 원래 마감으로 (${maxOf(0L, (orig ?: now) - now) / 1000}초 남음) · 콜 $orderId"
            else "⏩ [빨리 접기 막음] 상세에 손($why) — 뒤에 오는 빨리 접기를 안 받는다 · 콜 $orderId")
    }
    /** 📏 앱이 상세에서 뒤로 가기를 보낸 때(부팅 기준) — 목록 확인까지 ms 를 로그에 남긴다 (0 = 없음) */
    private var lastBackAtMs = 0L
    /** ✋ 기사님 손이 먼저 — 손 흔적 · 멈추면 곧바로 다시 읽기 (`HandFirst`) */
    private val handFirst = com.onedal.app.core.HandFirst()
    private var lastHandWhy = ""

    /** ✋ 손 흔적 — [atMs] 는 알림이 실제로 난 시각(부팅 기준 · 스크롤은 event.eventTime) */
    private fun onHand(why: String, atMs: Long = android.os.SystemClock.elapsedRealtime()) {
        val now = android.os.SystemClock.elapsedRealtime()
        val lastTap = touchManager.lastAppTapAtMs
        // 👆 앱 누름과 손 — 누르기 전에 났는데 늦게 온 손(앱이 놓치고 누름)과 누른 뒤 손을 가른다. 누름 한 번에 한 줄
        com.onedal.app.core.HandFirst.missedBeforeTapMs(atMs, lastTap)?.let {
            if (LogOnce.changed("hand-missed", "$lastTap")) AppLogger.i(TAG, LogTag.TAP, "✋ [손 먼저 놓침] 누르기 ${it}ms 전 손($why) — 목록 읽는 동안 늦게 도착")
        } ?: com.onedal.app.core.HandFirst.afterAppTapMs(atMs, lastTap)?.let {
            if (LogOnce.changed("hand-after-tap", "$lastTap")) AppLogger.i(TAG, LogTag.TAP, "👆 [앱 누름 뒤 손] ${it}ms · $why")
        }
        handFirst.onHand(atMs)
        lastHandWhy = why
        waitBook.schedule("손 멈춤", com.onedal.app.core.WaitBook.LIST, maxOf(0L, handFirst.quietAtMs() + 50 - now)) {
            // 👆 미룬 누르기는 손이 멈춘 뒤 이 다시 읽기에서 푼다 — 그때까지의 ms 만 적는다
            handFirst.releasedMs(android.os.SystemClock.elapsedRealtime())?.let { AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "👆 [미룬 누르기] +${it}ms · 손 먼저") }
            reservedRead("손 멈춤")
        }
    }

    /**
     * 🚚 마지막으로 알아본 픽커 운행 단계 — **바뀔 때만 로그를 남기려고** 들고 있다.
     * 매 스캔(1초)마다 찍으면 로그가 그 줄로 덮여 다른 줄을 묻는다
     * (같은 줄이 로그를 덮는 계열).
     */
    override fun returnsFromDetailWhoeverOpened(): Boolean =
        com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).getDetailBackTimeoutMs(savedFilter()) != null

    override fun startAppTrace(reason: String) = startTrace(reason)

    override fun traceScreen(text: String, context: String) {
        appTrace.onScreen(System.currentTimeMillis(), text, context)?.let {
            AppLogger.i("1DAL_TRACE", LogTag.SCREEN, it)
            flushTrace()
        }
    }
    override fun markRead(name: String) = readSplit.mark(name, android.os.SystemClock.elapsedRealtime())

    /**
     * 🧹 **«눌렀다» 에서 «막았다» 로 내린다** — 취소로 끝났거나 값을 못 채워 버린 콜은 다시 판정받을 자격이 있다.
     * 기억에서 아예 빼지는 않는다 — 빼면 같은 필터로 또 통과해 또 누른다(`CallMemory.demoteActed`).
     * 🔴 지문은 **누를 때 쥔 목록 줄**(`alarmTappedCard`)로 뜬다 — 기억에 넣은 줄과 같은 블록에서 같은 콜로 세워진다.
     *    처리를 비우면(`resetSessionState`) 그 줄이 지워지므로 반드시 비우기 앞에 부른다. 줄이 없으면 앱이 안 누른 콜이라 내릴 것이 없다.
     */
    override fun demoteTappedCall(reason: String) {
        session.alarmTappedCard?.let { card ->
            val hash = CallMemory.fingerprintOf(card)
            if (callMemory.demoteActed(hash)) {
                AppLogger.d(TAG, LogTag.CALL_STAGE, "🧹 [막았다로 내림] ${card.pickup.take(14)} → ${card.dropoff.take(14)} ${card.fare}원 — $reason · 길이 바뀌면 다시 본다 (지문 $hash)")
            } else {
                AppLogger.w(TAG, "🧹 [못 내림] ${card.pickup.take(14)} → ${card.dropoff.take(14)} ${card.fare}원 — $reason · «눌렀다» 기억에 이 지문이 없다 (지문 $hash)")
            }
        }
    }

    override fun scheduleDetailBack() {
        if (detailBackRunnable != null) return            // 이미 걸려 있다 — 상세 글자가 바뀔 때마다 새로 걸지 않는다
        // ⏱️ 몇 초 뒤인가는 서버가 정한다 (DB user_settings.picker_alarm_detail_sec)
        val delayMs = com.onedal.app.core.engine.WaitTimes.detailBackMs(savedFilter(), currentTargetApp)
        // 🔎 누가 열었나 — 기록만 한다 (나중에 `grep "상세 대기"` 로 «손으로 연 상세도 돌아왔나»를 본다)
        val now = android.os.SystemClock.elapsedRealtime()
        val opener = com.onedal.app.core.engine.DetailOwner.detailOpener(alarmTapAtMs, now)
        alarmTapAtMs = 0L
        if (opener == com.onedal.app.core.engine.DetailOwner.OPENER_HAND) onHand("손으로 연 상세")
        detailBackOpener = opener
        detailBackArmedAtMs = now
        detailBackDeadlineMs = now + delayMs
        detailBackOrigDeadlineMs = now + delayMs
        detailFoldOrderId = null
        foldReleasedOrderId = null
        telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.DETAIL_WAIT, true)          // ⏱️ [1초 고속 무전] 상세에 머무는 동안 서버 판결(유지/취소)을 1초마다 물어본다
        AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN, "⏱️ [상세 대기] 걸었다 — ${delayMs / 1000}초 뒤 리스트로 (1초 주기 판결 수신 가동) · 연 쪽: $opener")
        val r = Runnable {
            detailBackRunnable = null
            detailBackDeadlineMs = null
            telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.DETAIL_WAIT, false)
            // ⏩ 판정 뒤 접기로 당긴 마감이면 — 뒤로 가기 직전 아직 그 콜인지 다시 본다(기사님이 이미 나가셨거나 다른 콜이면 안 누른다)
            if (detailFoldOrderId?.let { it != session.currentOrderId } == true) {
                AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN, "⏹️ [상세 대기] 접을 콜($detailFoldOrderId)이 지금 콜이 아니다 — 뒤로 가지 않는다")
                detailFoldOrderId = null
                return@Runnable
            }
            val folded = detailFoldOrderId != null
            detailFoldOrderId = null
            val why = if (folded) "서버 판정 뒤 접기" else "${delayMs / 1000}초 무응답"
            // 아직 확정 전 상세에 있고, 앱이 계약하지 않는 콜일 때만 나온다 — 모드·배차망은 가리지 않는다
            if (telemetryManager.currentScreenContext == ScreenContext.DETAIL_PRE_CONFIRM
                && !session.contractedByApp) {
                AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN, "↩️ [상세 대기] $why — 리스트로 자동 복귀 · 연 쪽: $opener")
                // 🔴 뒤로 가기도 `touchManager` 한 곳으로 — 거기서 자국을 남긴다 (배차망을 가리지 않는다)
                lastBackAtMs = android.os.SystemClock.elapsedRealtime()
                touchManager.performBack(why)
            } else {
                AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN, "⏹️ [상세 대기] ${delayMs / 1000}초가 됐지만 상세가 아니다 — 뒤로 가지 않는다 · 연 쪽: $opener")
            }
        }
        detailBackRunnable = r
        waitBook.schedule("상세 대기", com.onedal.app.core.WaitBook.SESSION, delayMs) { r.run() }
    }

    /** ⏩ 판정 뒤 접기 — 걸린 상세 대기의 마감을 서버가 준 남은 초로 당긴다(더 이를 때만) · 조건은 `DetailFold` */
    private fun onFoldAfter(orderId: String, remainMs: Long) {
        val now = android.os.SystemClock.elapsedRealtime()
        val sameOrder = orderId == session.currentOrderId
        val onDetail = telemetryManager.currentScreenContext == ScreenContext.DETAIL_PRE_CONFIRM
        val why = if (foldReleasedOrderId == orderId) "상세에 손 · 풂"
            else com.onedal.app.core.engine.DetailFold.whyNot(detailBackDeadlineMs, now, remainMs, sameOrder, session.openedByApp, onDetail)
        // 🔎 받은 때와 까닭 — 콜마다 까닭이 바뀔 때만 한 줄 (서버 «⏩ [빨리 접기] 폰에 처음 알림»과 맞댄다)
        if (LogOnce.changed("fold-after:$orderId", why ?: "당김"))
            AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN, "⏩ [foldAfter 받음] 콜 $orderId · 남은 ${"%.1f".format(remainMs / 1000.0)}초 · ${why?.let { "무시 — $it" } ?: "당김"} (지금 콜 ${session.currentOrderId.ifEmpty { "없음" }})")
        if (why != null) return
        val r = detailBackRunnable ?: return
        val deadline = com.onedal.app.core.engine.DetailFold.newDeadlineMs(detailBackDeadlineMs, now, remainMs,
            sameOrder = sameOrder, openedByApp = session.openedByApp, onPreConfirmDetail = onDetail) ?: return
        val leftSec = ((detailBackDeadlineMs ?: now) - now) / 1000
        waitBook.schedule("상세 대기", com.onedal.app.core.WaitBook.SESSION, deadline - now) { r.run() }   // 같은 이름 — 앞의 것을 거두고 당겨 건다
        detailBackDeadlineMs = deadline
        detailFoldOrderId = orderId
        AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN, "⏩ [상세 대기 줄임] 서버 판정 뒤 접기 — ${"%.1f".format(remainMs / 1000.0)}초 뒤 목록으로 (원래 ${leftSec}초 남음) · 콜 $orderId")
    }

    private fun cancelDetailBack() {
        detailBackRunnable?.let {
            waitBook.cancel("상세 대기")
            val stayedSec = (android.os.SystemClock.elapsedRealtime() - detailBackArmedAtMs) / 1000
            AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.SCREEN, "⏹️ [상세 대기] 풀었다 — ${stayedSec}초 머묾 · 연 쪽: $detailBackOpener (콜 끝 · 리스트 복귀)")
        }
        detailBackRunnable = null
        detailBackDeadlineMs = null
        detailFoldOrderId = null
        detailBackOrigDeadlineMs = null
        foldReleasedOrderId = null
        telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.DETAIL_WAIT, false)         // ⏱️ 상세 대기 해제 시 1초 무전 종료
    }
    override lateinit var collectMachine: DetailCollectMachine
    override val recentListOrders = mutableListOf<SimplifiedOfficeOrder>()

    /** 📜 스크롤 알림을 모아 목록을 한 번 읽는다 */
    private val scrollGate = com.onedal.app.core.ScrollGate()
    private val scrollScan = Runnable { scrollGate.onScanned(); listScanTimer.scrollRead(); scanScreen() }

    /** 🚦 «내용 바뀜»을 모아 읽는다 — 첫 알림 즉시 · 250ms 안은 한 번 (`ContentGate`) */
    private val contentGate = com.onedal.app.core.ContentGate()
    private val contentScan = Runnable { contentGate.onScanned(android.os.SystemClock.elapsedRealtime()); scanScreen() }

    /** ⏱️ 상세 대기 중 화면 읽기 시간 요약 (1초마다 한 줄) */
    private val detailScanTimer = com.onedal.app.core.ScanTimer()
    /** 👁️ 목록 화면 읽기 요약 — 알림·읽기가 있던 1초에만 한 줄 (스크롤 뒤 4초 동안 로그 0줄이라 원인을 못 가렸다 · 실물 09-30 16:18) */
    private val listScanTimer = com.onedal.app.core.ScanTimer()

    /** 요약을 셀 곳과 그 줄 이름표 — 목록·상세 둘만 센다 (로그 이름표에만 쓴다) */
    private fun scanTimerOf(ctx: ScreenContext): Pair<com.onedal.app.core.ScanTimer, String>? = when (ctx) {
        ScreenContext.LIST -> listScanTimer to "⏱️ [목록 화면 읽기]"
        ScreenContext.DETAIL_PRE_CONFIRM -> detailScanTimer to "⏱️ [상세 중 화면 읽기]"
        else -> null
    }

    /** 👁️ 상세에서 목록으로 돌아온 5초 — 요약을 1초마다 빠짐없이(0번이어도) · 그 구간이 «스크롤 뒤 상세»가 안 되던 자리다 */
    private var listWatchTicks = 0
    private val listWatch = object : Runnable {
        override fun run() {
            listScanTimer.tick(android.os.SystemClock.elapsedRealtime(), force = true)
                ?.let { AppLogger.d(TAG, LogTag.SCREEN, "⏱️ [목록 화면 읽기] (복귀 ${6 - listWatchTicks}초) $it") }
            if (--listWatchTicks > 0) waitBook.schedule("목록 요약", com.onedal.app.core.WaitBook.SERVICE, 1000) { run() }
        }
    }

    // ── AUTO 모드 타이머 ──
    override val mainHandler = Handler(Looper.getMainLooper())
    override val waitBook = com.onedal.app.core.WaitBook(object : com.onedal.app.core.WaitBook.Poster {
        override fun post(r: Runnable, delayMs: Long) { mainHandler.postDelayed(r, delayMs) }
        override fun remove(r: Runnable) { mainHandler.removeCallbacks(r) }
    }) { android.os.SystemClock.elapsedRealtime() }

    /** 🔁 지금 화면을 새로 읽은 글자 노드 — 누르기 넘김이 묵은 노드 대신 쓴다 */
    private fun freshScreenNodes(): List<ScreenTextNode>? {
        val root = rootInActiveWindow ?: return null
        val raw = mutableListOf<com.onedal.app.core.RawNode>()
        collectNodes(root, raw)
        return com.onedal.app.core.NodeText.textNodesOf(raw).map { (t, n) -> ScreenTextNode(t, n.node!!, n.rect!!) }
    }

    /** ⏳ 상세↔목록이 바뀔 때 지금 걸린 기다림 한 줄 */
    private fun logPendingWaits(where: String) {
        val p = waitBook.pending()
        com.onedal.app.core.WaitBook.pendingLine(p)?.let { AppLogger.d(TAG, LogTag.SCREEN, "⏳ [걸린 기다림] $where — $it") }
    }
    private val safeCancelTimer by lazy { SafeCancelTimer(waitBook) }

    /**
     * ⏱️ **서버가 내려준 필터(저장본)** — 배차망별 대기 시간을 여기서 읽는다 (기사님 확정).
     * 🔴 원천은 서버 DB 다 — 폰 안 저장소 값은 서버가 모르는 값이 된다. 못 읽으면 `FilterConfig` 기본값(서버 DB 기본값과 같다).
     */
    private fun savedFilter(): com.onedal.app.models.FilterConfig = com.onedal.app.core.FilterStore.current(this)

    // 화면 꺼짐/켜짐 감지용 리시버 (퇴근 시 즉시 오프라인 통보 / 출근 시 즉시 생존 신고)
    private val screenOffReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            /**
             * 💤 **화면 상태는 이벤트로 한 번 알리고 끝내지 않는다** (기사님 확정).
             *
             * `sendOffline()` 한 번으로 끝내면, 화면이 꺼져도 앱은 60초마다 생존신고를 계속하고
             * 그 하트비트가 서버에서 `status = "ONLINE"` 으로 **되돌려 버린다** — 관제웹은 녹색이 된다.
             *
             * 그래서 **플래그를 세워 매 텔레메트리에 실어 보낸다.** 서버가 추측할 일이 없다.
             * 접근성 스크래핑은 화면이 켜져 있어야 도니, 화면 꺼짐 = **콜을 못 잡는 상태**다.
             */
            if (intent?.action == Intent.ACTION_SCREEN_OFF) {
                telemetryManager.isScreenOn = false
                AppLogger.roadmap(LogTag.NETWORK, "📵 화면 꺼짐 감지 → 서버로 퇴근(OFFLINE) 보고", "OFFLINE")
                AppLogger.w(TAG, "📵 [Screen Off 감지] 기사님 퇴근 또는 화면 꺼짐! 즉시 서버로 오프라인 통보!")
                apiClient.sendOffline()
                /**
                 * 💤 **지금 바로 알린다** (기사님 확정).
                 *
                 * 화면을 끄는 순간 텔레메트리 주기가 **60초(하트비트 모드)로 떨어진다.**
                 * 그래서 앱은 즉시 알았는데 관제웹은 **최대 1분 뒤에야** 알았다.
                 * 한 번 밀어 보내면 1초 안에 배지가 뜬다.
                 */
                telemetryManager.forceFlushEvent()
            } else if (intent?.action == Intent.ACTION_SCREEN_ON) {
                telemetryManager.isScreenOn = true
                AppLogger.roadmap(LogTag.NETWORK, "💡 화면 켜짐 감지 → 서버로 출근(ONLINE) 보고", "ONLINE")
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
        // 📜 조용한 목록 다시 읽기 — 1초마다 살핀다(`ListWatch`)
        waitBook.schedule("목록 감시", com.onedal.app.core.WaitBook.SERVICE, 1000) { listWatchdog.run() }

        /**
         * 📝 **가장 먼저 로그 파일을 연다** — 이 아래에서 무슨 일이 나든 남게 한다.
         *    logcat 은 우리 로그를 세 시간도 못 지킨다 (몇 시간 전 앱 로그가 0줄로 남는다).
         *    자리: `/sdcard/Android/data/com.onedal.app/files/logs/1dal-YYYY-MM-DD.log`
         */
        AppLogger.attachFile(this)
        AppLogger.i(TAG, LogTag.BOOT, "📝 [로그 파일] 여기에 쌓는다 — ${AppLogger.filePath ?: "열지 못했다"}")
        // 📄 배차망 페이지 정의 — «모름» 칸이 실물 확인 목록 · «버림»·«안 읽음» 칸이 다음에 읽을 재료 (reviews/24)
        for (p in com.onedal.app.plugins.DispatchPluginRegistry.all())
            AppLogger.i(TAG, LogTag.BOOT, "📄 [페이지 정의] ${com.onedal.app.core.PageSpecSummary.line(p.label, p.pages)}")

        com.onedal.app.plugins.DispatchPluginRegistry.init(this)
        val prefs = getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
        val targetApp = prefs.getString("targetApp", "인성콜") ?: "인성콜"
        applyTargetApp(targetApp)

        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient, this, waitBook)  // [GPS 텔레메트리] context 전달하여 위치 조회 가능하도록

        touchManager = AutoTouchManager(this, waitBook)
        /**
         * 🔄 **새 필터가 닿으면 지금 목록을 곧바로 다시 판정한다** (실물 픽커 09-30 02:52 — 목록 글자가 그대로라 옛 필터로 막힌 콜이 안 울렸다).
         * 목록일 때만 — 상세·팝업에서는 목록으로 돌아오는 순간 목록 스캔 첫머리(`onFilterVersion`)가 받는다(채우기 단계를 다시 밟지 않는다).
         * 쓰는 손이 한 곳인 `currentScreenContext` 를 읽는다.
         */
        apiClient.onFilterChanged = { v ->
            mainHandler.post {
                if (telemetryManager.currentScreenContext == ScreenContext.LIST) {
                    AppLogger.i(TAG, LogTag.FILTER, "🔄 [필터 도착] 버전 $v — 지금 화면을 다시 판정한다")
                    lastScreenFingerprint = 0
                    scanScreen()
                } else {
                    AppLogger.i(TAG, LogTag.FILTER, "🔄 [필터 도착] 버전 $v — 목록으로 돌아오면 판정한다 (지금 ${telemetryManager.currentScreenContext})")
                }
            }
        }
        // 🚚 배차망 차종 낱말을 우리 차종에 못 맞췄다 — 이상 기록 «VEHICLE_UNKNOWN: 낱말»(같은 낱말은 하루 한 번 · `VehicleWordMiss`)
        com.onedal.app.core.VehicleWordMiss.sink = { network, word, line ->
            apiClient.sendAnomalyReport(
                targetApp = network,
                screenName = "LIST",
                failureReason = "VEHICLE_UNKNOWN: $word",
                detailParsedText = line.take(200),
            )
        }
        // 🔎 못 알아본 배차망 화면 — 이상 기록 «SCREEN_UNKNOWN: 글 앞부분»(가린 글 · 같은 화면 하루 한 번 · `UnknownScreenReport`)
        // 📷 1초 뒤에도 모르는 화면이고 상세 사진 판독 중이 아니면 그 순간의 사진을 같이 싣는다(가리지 않은 원본 · `UnknownScreenShot`) — 못 찍으면 글만
        com.onedal.app.core.UnknownScreenReport.sink = { network, reason, text ->
            // 이름에 사유 글을 붙인다 — 1초 안에 다른 모르는 화면이 와도 앞의 보고를 거두지 않게 · 콜이 끝나도 거두지 않는 서비스 몫
            waitBook.schedule("모르는 화면 사진 · ${reason.removePrefix("SCREEN_UNKNOWN: ").take(20)}", com.onedal.app.core.WaitBook.SERVICE, com.onedal.app.core.UnknownScreenShot.WAIT_MS) {
                val send = { shot: ByteArray? ->
                    apiClient.sendAnomalyReport(targetApp = network, screenName = "UNKNOWN", failureReason = reason, detailParsedText = text,
                        screenshotBase64 = shot?.let { android.util.Base64.encodeToString(it, android.util.Base64.NO_WRAP) })
                }
                val now = android.os.SystemClock.elapsedRealtime()
                val why = com.onedal.app.core.UnknownScreenShot.whyNot(
                    stillUnknown = telemetryManager.currentScreenContext == ScreenContext.UNKNOWN,
                    verifyingDetail = session.isVerifyingSnapshot,
                    msSinceLastShot = com.onedal.app.core.ShotGap.sinceLastShotMs(now),
                    sdk = android.os.Build.VERSION.SDK_INT,
                ) ?: if (!::screenReader.isInitialized) "사진 판독기 없음" else null
                if (why != null) {
                    AppLogger.i(TAG, LogTag.SCREEN, "📷 [모르는 화면 사진 안 찍음] $why — 글만 보낸다")
                    send(null)
                } else screenReader.captureWhole { bytes, note ->
                    AppLogger.i(TAG, LogTag.SCREEN, if (bytes != null) "📷 [모르는 화면 사진] $note" else "📷 [모르는 화면 사진 못 찍음] $note — 글만 보낸다")
                    send(bytes)
                }
            }
        }
        // 👆 «누르기 안 먹힘»은 이상 징후로 — 어느 배차망 · 어느 화면이든 같은 한 줄 (`TapInFlight`)
        touchManager.onTapFailed = { f ->
            apiClient.sendAnomalyReport(
                targetApp = currentTargetApp,
                screenName = f.screen.name,
                failureReason = "TAP_FAILED: ${f.key.take(30)} · ${f.reason} · ${f.waitedMs}ms · 연속 ${f.streak}",
            )
            // 👆 안 먹힌 누르기가 세운 «앱이 연 콜»을 되돌린다 — 목록 그대로라 목록 리셋이 안 온다 (`DetailOwner.releaseOnTapFailed`)
            mainHandler.post {
                val tappedKey = session.alarmTappedCard?.let { "call:${CallMemory.fingerprintOf(it)}" }
                if (com.onedal.app.core.engine.DetailOwner.releaseOnTapFailed(session.openedByApp, f.key, tappedKey, f.screen == ScreenContext.LIST)) {
                    session.alarmTappedCard?.let { alarmedRoutes.clearOpened(it) }   // 🔔 «열기 함»도 지운다 — 다음 읽기에서 다시 연다
                    if (f.streak >= 2) {
                        // 같은 콜이 연속 두 번 안 먹혔다 — 늘 안 먹히는 자리(탭 막대 등)에서 끝없이 되풀이하지 않게 «막았다»로 내린다
                        AppLogger.i(TAG, LogTag.TAP, "👆 [앱이 연 콜 되돌림] 누르기 연속 ${f.streak}번 안 먹힘 — «막았다»로 내린다 · ${f.key}")
                        demoteTappedCall("누르기 연속 안 먹힘")
                    } else {
                        // 🔁 누르기는 일어나지 않았다 — «판정 안 함»으로 돌려 다음 읽기에서 다시 판정·선택(«막았다»로 내리면 필터가 바뀔 때까지 건너뛴다 · ab 리뷰 높음 1)
                        AppLogger.i(TAG, LogTag.TAP, "👆 [앱이 연 콜 되돌림] 누르기 안 먹힘 — 다음 읽기에서 다시 판정 · ${f.key}")
                        session.alarmTappedCard?.let { callMemory.forgetActed(CallMemory.fingerprintOf(it)) }
                    }
                    resetSessionState()
                }
            }
        }
        collectMachine = DetailCollectMachine(touchManager)
        screenReader = com.onedal.app.core.ScreenReader(this)
        screenReader.warmUp()   // 📷 첫 인식이 느리다 — 붙을 때 모델을 올려 둔다
        live = this

        /**
         * 💤 시작할 때의 화면 상태는 **물어봐서** 세운다 — 기본값(켜짐)으로 두면
         * 화면이 꺼진 채 서비스가 붙었을 때 첫 보고부터 거짓말한다.
         */
        telemetryManager.isScreenOn =
            (getSystemService(Context.POWER_SERVICE) as android.os.PowerManager).isInteractive

        /**
         * 🚦📦 **폰 상태 바가 쓸 것 둘을 꽂는다**.
         * 단계는 **보낼 때마다 여기서 새로 계산**한다 — 복사본을 두면 갱신을 빠뜨린 자리가
         * 옛 단계를 계속 말한다.
         */
        telemetryManager.appVersion = com.onedal.app.core.AppInfo.versionLabel(this)
        telemetryManager.workStageProvider = {
            WorkStage.of(
                openedByApp = session.openedByApp,
                isWaitingForDecision = session.isWaitingForDecision,
                safeCancelRemainSec = safeCancelTimer.remainSec,
                collectState = session.collectState,
                isDetailScrapSent = session.isDetailScrapSent,
            )
        }
        telemetryManager.start()
        /**
         * 🟢 **붙자마자 한 번 쏜다** (기사님 실측: *"폰이랑 서버랑 연결이 안 되는데?"*).
         *
         * `start()` 는 **60초 생존신고 시계만** 건다. 그것만 두면 앱이 떠도 첫 보고가 1분 뒤고,
         * 그동안 관제웹에서는 이 폰이 **아예 없는 것처럼** 보인다. 접근성을 껐다 켜면 그 시계가 처음부터 다시 시작한다.
         */
        telemetryManager.forceHeartbeat()
        apiClient.fetchKeywords()

        /**
         * 🖥️ **첫 보고는 «본 것»이어야 한다** (기사님 실측 제보).
         *
         * 기사님: *"픽커는 지금 홈에 있는데. 콜 리스트로 나오고 있어."*
         *
         * 화면을 읽지 않고 «콜 리스트»라고 세우면 인성에서는 우연히 맞지만(스캐너를 켜는 자리가
         * 대개 리스트다) 픽커 홈에서는 틀리고, 관제웹이 계속 거짓말을 한다.
         *
         * 🔴 **왜 스스로 안 고쳐지나** — 홈 화면은 움직이지 않아
         * `TYPE_WINDOW_CONTENT_CHANGED` 가 **안 온다.** 이벤트가 없으면 판별도 없고,
         * 처음 세운 값이 그대로 굳는다. 그래서 «첫 값»이 곧 «오래 가는 값»이다.
         *
         * 규칙 ④(*"없는 숫자를 지어내지 않는다"*)의 화면판이다 — `0` 이 아니라 `null` 이듯,
         * **안 본 화면은 «리스트»가 아니라 «모름»** 이다. 지금은 읽어서 답하고,
         * 아직 화면이 없으면(`null`) 그때만 «모름»이라 한다 (규칙 ③ — 파생).
         */
        var firstPkg: String? = null
        var firstRead: com.onedal.app.core.engine.ScreenRead? = null
        val firstScreen = rootInActiveWindow?.let { node ->
            val texts = mutableListOf<String>()
            gatherNodeTexts(node, texts)
            val pkg = node.packageName?.toString()
            firstPkg = pkg
            node.recycle()
            readScreen(texts.joinToString(" ")).let { firstRead = it; contextOf(it, pkg) }
        } ?: ScreenContext.UNKNOWN
        AppLogger.i(TAG, LogTag.BOOT, "🖥️ 붙는 순간 화면: $firstScreen")
        // 📱 새로 깔거나 접근성을 다시 켜면 목록에서 바로 붙는다 — 그 화면이 실물 배차망 목록이면 운행 기록을 켠다
        if (TargetApp.startsTraceOnAttach(firstPkg, isList = firstScreen == ScreenContext.LIST)) startTrace("붙는 순간 화면이 실물 배차망 목록")
        updateScreenContext(firstScreen, firstRead)

        // [Piggyback V2] 서버(관제탑) 결재 수신 콜백 연결 및 고스트 응답 방어(Ghost Defense)
        telemetryManager.decisionCallback = { receivedOrderId, action ->
            if (receivedOrderId.isNotEmpty() && receivedOrderId != session.currentOrderId) {
                AppLogger.e(TAG, "👻 [Ghost Defense 발동!] 수신된 ID($receivedOrderId)가 현재 폰에 열려있는 오더 ID($session.currentOrderId)와 다릅니다! 과거 허깨비 응답을 폐기합니다.")
            } else {
                AppLogger.w(TAG, LogTag.DECISION, "🛡️ [정상 결재 수신] ID 일치($receivedOrderId). 즉각 폐기/유지 액션을 집행합니다. (Action: $action)")
                executeDecisionImmediately(action)
            }
        }

        // ⏩ 판정 뒤 접기 — 앱이 연 나쁜 콜 상세를 서버가 준 남은 초에 목록으로 (`DetailFold`) · 스캔과 같은 메인 스레드에서
        telemetryManager.foldAfterCallback = { orderId, remainMs -> mainHandler.post { onFoldAfter(orderId, remainMs) } }

        // 🧹 서버 회차가 바뀌면 «본 콜» 기억을 비운다 — 스캔 루프와 같은 메인 스레드에서 (CallMemory 는 잠금이 없다)
        telemetryManager.callMemoryRoundCallback = { round ->
            mainHandler.post {
                if (callMemory.onRound(round)) {
                    AppLogger.w(TAG, "🧹 [본 콜 기억 비움] 서버 회차 $round — 이전 콜을 리셋했다 (시나리오 다시 시작)")
                }
            }
        }

        /* 🖼️ 모드 테두리 — 붙자마자 지금 모드로 두르고, 서버에서 모드를 받을 때마다 색을 맞춘다. 서비스가 내려가면 걷는다(onDestroy) */
        telemetryManager.modeCallback = { _ -> modeFrame.show(effectiveMode) }   // 관제웹이 보낸 값이 아니라 이 배차망에서 도는 모드로
        modeFrame.show(effectiveMode)

        // 화면 켜짐/꺼짐 이벤트 수신 등록
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        }
        registerReceiver(screenOffReceiver, filter)

        AppLogger.roadmap(LogTag.BOOT, "🟢 1DAL 서비스 가동 완료 (접근성 권한 승인, Telemetry·GPS 엔진 가동)", "STARTUP")
        AppLogger.i(TAG, LogTag.BOOT, "✅ 1DAL Service Connected!")
        // 어떤 빌드가 실제로 돌고 있는지 로그로 못박아 둔다 (설치 버전 혼동 방지)
        AppLogger.i(TAG, LogTag.BOOT, "  📦 BUILD      ${com.onedal.app.core.AppInfo.versionLabel(this)}")
        AppLogger.i(TAG, LogTag.BOOT, "  📡 ApiClient  (기기ID: ${apiClient.getDeviceId()})")
        AppLogger.i(TAG, LogTag.BOOT, "  📤 Telemetry  (생존신고 시작)")
        AppLogger.i(TAG, LogTag.BOOT, "  🔍 Parser     (${scrapParser.currentParserName()})")
        AppLogger.i(TAG, LogTag.BOOT, "  👆 Touch      (준비 완료)")
        /**
         * 🔴 **읽어서 답한다 — 지어내지 않는다**.
         *
         * 배차망 이름을 글자로 박으면 픽커로 돌 때도 «인성콜»이라 찍혀, 로그를 믿고 헛짚는다.
         *
         * 같은 자리의 «붙는 순간 화면»(위 `firstScreen`)과 **같은 클래스**다 —
         * 읽지 않고 단언하는 것. 인스턴스를 하나씩 고치는 대신 규칙으로 잠갔다
         * (`tests/rules/screenTruth.test.ts`).
         */
        AppLogger.i(TAG, LogTag.BOOT, "  🎯 Keywords   (${keywords.appLabel})")
    }

    override fun onInterrupt() {
        telemetryManager.stop()
        cancelSafeCancelTimer()
        apiClient.sendOffline("ACCESSIBILITY_OFF") // 접근성 권한 해제 시 오프라인 통보 — 사유 명시
        AppLogger.roadmap(LogTag.BOOT, "⚠️ 1DAL 서비스 일시 중지 (접근성 권한 해제)", "INTERRUPT")
        AppLogger.w(TAG, "⚠️ 1DAL Service Interrupted! (접근성 권한 일시 중지)")
    }

    override fun onDestroy() {
        // 📜 조용한 목록 다시 읽기 감시를 뗀다 — 서비스가 내려간 뒤 옛 서비스가 읽지 않게
        waitBook.cancelAll()   // 목록 감시 · 겹친 틀 뒤 · 미룬 알람까지 장부 하나로 거둔다
        super.onDestroy()
        live = null
        if (::screenReader.isInitialized) screenReader.close()
        modeFrame.hideNow()   // 🖼️ 테두리가 없으면 접근성 꺼짐 — 내려가는 순간 걷는다
        unregisterReceiver(screenOffReceiver)
        telemetryManager.stop()
        cancelSafeCancelTimer()
        /**
         * 📵 **왜 내려가는지 지금 알 수 있다** (기사님 지적).
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
        AppLogger.roadmap(LogTag.BOOT, "🛑 1DAL 서비스 완전 종료 (앱 파괴)", "SHUTDOWN")
        AppLogger.w(TAG, LogTag.BOOT, "🛑 1DAL Service Destroyed! (완전 종료)")
    }

    // ════════════════════════════════════════════════════════════════
    //  기능 2: 화면 읽기 및 종류 판별 (이벤트 라우터)
    // ════════════════════════════════════════════════════════════════

    /** 📱 운행 기록을 켠다 — 새로 켰을 때만 찍고 올린다 */
    private fun startTrace(reason: String) {
        if (appTrace.start(System.currentTimeMillis(), reason)) {
            AppLogger.i("1DAL_TRACE", LogTag.BOOT, "▶️ [기록 시작] $reason — 최대 5시간 · ${traceEndButtons.joinToString(" · ") { "«$it»" }}에서 끝")
            flushTrace()
        }
    }

    /** 📱 모인 줄을 한 묶음씩 올린다 — 실패하면 앞에 되돌리고 다음 기록 때 다시 보낸다 */
    private fun flushTrace() {
        if (appTraceSending) return
        val batch = appTrace.drain(com.onedal.app.core.AppTrace.SEND_BATCH)
        if (batch.isEmpty()) return
        appTraceSending = true
        apiClient.sendAppTraceLines(batch) { ok ->
            if (!ok) appTrace.requeueFront(batch)
            appTraceSending = false
            if (ok && appTrace.hasPending()) flushTrace()
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        /**
         * 🪟 **«내용이 바뀜»과 «창이 바뀜» 둘 다 화면이 바뀐 것이다**.
         *
         * 기사님: *"「나가시겠습니까」 알럿창에 「네」 하고 홈으로 왔는데 알 수 없는 화면으로
         * 계속 남아 있어."*
         *
         * `TYPE_WINDOW_CONTENT_CHANGED` 하나만 보면, 다이얼로그가 닫히고 홈으로 돌아가는 것은
         * **창이 바뀌는 사건**이라 그 이름으로 오지 않아 판별이 아예 안 돌고, 알럿 화면이던 `UNKNOWN` 이 굳는다.
         *
         * 🔴 앞의 «붙는 순간 화면»과 뿌리가 같다 — *화면이 안 움직이면 아무도 다시 안 본다.*
         *    그쪽은 **첫 값**이, 이쪽은 **마지막 값**이 굳는다.
         *
         * ⚠️ 인성은 안 흔들린다 — 스캔이 늘어도 아래 **지문 비교**가 같은 화면을 거른다.
         *    오히려 팝업이 닫히는 순간을 더 정확히 본다.
         */
        /**
         * 👆 **누른 버튼 — 운행 기록에만 쓴다** (실물 픽커 앱 · 기록이 켜져 있을 때).
         * 화면 판별에는 안 쓴다 — 누름 알림은 화면이 바뀐 사건이 아니다. 여기서 돌아간다.
         */
        if (event?.eventType == AccessibilityEvent.TYPE_VIEW_CLICKED) {
            val pkg = event.packageName?.toString()
            // 👆 픽커 · 시뮬레이터 · 마지막으로 배차망 화면이던 앱(인성·화물24) — 누름은 기록이 꺼져 있어도 늘 남기고 올린다
            if (TargetApp.isNetworkPackage(pkg, lastNetworkPackage)) {
                // ✋ 앱이 쏜 터치의 메아리가 아니면 기사님 손 (인성·24 · 픽커는 목록 줄 누름에 알림을 안 낸다)
                if (com.onedal.app.core.HandFirst.isClickHand(android.os.SystemClock.elapsedRealtime(), touchManager.lastAppTapAtMs)) {
                    onHand("누름")
                    releaseFoldOnHand("상세 누름")
                    if (telemetryManager.currentScreenContext != ScreenContext.LIST) lastDetailHandAtMs = android.os.SystemClock.elapsedRealtime()   // 👆 KEEP «닫기»가 본다
                }
                val nodeTexts = mutableListOf<String>()
                event.source?.let { gatherNodeTexts(it, nodeTexts) }
                val label = com.onedal.app.core.AppTrace.clickLabelOf(event.text, event.contentDescription, nodeTexts)
                /* 📱 이 누름으로 운행 기록을 켜는 배차망이 있나 — 칸이 앱 이름 · 버튼 글자로 정한다 */
                com.onedal.app.plugins.DispatchPluginRegistry.all().firstNotNullOfOrNull { it.traceStartReasonOnClick(pkg, label) }?.let { startTrace(it) }
                AppLogger.i("1DAL_TRACE", LogTag.TAP, appTrace.onClick(System.currentTimeMillis(), label, currentTargetApp))
                flushTrace()
            }
            return
        }

        // 🏁 토스트는 알림 이벤트로 온다 — «방금 배정된 오더입니다»(다른 기사가 먼저)만 본다
        if (event?.eventType == AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) {
            onNotificationEvent(event)
            return
        }
        if (event == null) return
        val eventPkg = event.packageName?.toString()
        val isOwnApp = eventPkg == packageName
        // 📡 조용한 다시 읽기 · «움직이는 중»은 배차망 앱 알림만 센다 — 내비·상태줄 알림은 목록이 움직인 것이 아니다
        if (TargetApp.isNetworkPackage(eventPkg, lastNetworkPackage)) {
            val t = android.os.SystemClock.elapsedRealtime()
            lastTargetEventMs = t; eventSinceRead = true
            // ⏩ 상세 안 스크롤은 기사님 손 — 앱이 연 콜의 빨리 접기를 푼다
            if (event.eventType == AccessibilityEvent.TYPE_VIEW_SCROLLED) {
                releaseFoldOnHand("상세 스크롤")
                if (telemetryManager.currentScreenContext != ScreenContext.LIST) lastDetailHandAtMs = t   // 👆 KEEP «닫기»가 본다
            }
            if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
                recentContentEvents.addLast(t)
                while (recentContentEvents.isNotEmpty() && t - recentContentEvents.first() > com.onedal.app.core.AlarmHold.MOVING_WINDOW_MS) recentContentEvents.removeFirst()
            }
        }
        // ⏱️ 상세 대기 중 알림 출처를 센다 — 1초 요약에 «어디서 몇 번» (`ScanTimer`)
        scanTimerOf(telemetryManager.currentScreenContext)?.let { (timer, label) ->
            timer.countEvent("${eventPkg?.substringAfterLast('.') ?: "?"}/${com.onedal.app.core.ScanTimer.typeWord(event.eventType)}",
                android.os.SystemClock.elapsedRealtime())?.let { AppLogger.d(TAG, LogTag.SCREEN, "$label $it") }
        }
        // 🚦 스크롤은 목록일 때만 모아서(`ScrollGate`) · 내용 바뀜은 250ms 모아서(`ContentGate`) · 창 바뀜은 바로
        val now = android.os.SystemClock.elapsedRealtime()
        when (com.onedal.app.core.EventRoute.of(event.eventType, isOwnApp, telemetryManager.currentScreenContext == ScreenContext.LIST,
                scrollGate.scrolledRecently(now))) {
            com.onedal.app.core.EventRoute.Route.IGNORE -> Unit
            com.onedal.app.core.EventRoute.Route.SCROLL_SCAN -> {
                // ✋ 앱은 스크롤하지 않는다 — 스크롤 알림은 기사님 손이다 · 알림이 실제로 난 시각으로(메인 줄에 밀려 늦게 올 수 있다)
                onHand("스크롤", HandFirst.eventElapsedMs(now, android.os.SystemClock.uptimeMillis(), event.eventTime))
                touchedAtMs = now   // ✋ 목록을 만진다 — 10초 동안 조용한 다시 읽기를 촘촘히
                waitBook.schedule("스크롤 읽기", com.onedal.app.core.WaitBook.SERVICE, (scrollGate.onScroll(now) - now).coerceAtLeast(0)) { scrollScan.run() }
            }
            com.onedal.app.core.EventRoute.Route.SCAN -> {
                if (unreadEventAtMs == 0L) unreadEventAtMs = HandFirst.eventElapsedMs(now, android.os.SystemClock.uptimeMillis(), event.eventTime)
                if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) { contentGate.onScanned(now); scanScreen() }
                else when (val wait = contentGate.onEvent(now, appWaiting = touchManager.awaitingScreen || session.collectState.awaitsPopup)) {
                    0L -> { waitBook.cancel("내용 바뀜 읽기"); contentGate.onScanned(now); scanScreen() }
                    null -> Unit
                    else -> waitBook.schedule("내용 바뀜 읽기", com.onedal.app.core.WaitBook.SERVICE, wait) { contentScan.run() }
                }
            }
        }
    }

    /**
     * 🏁 **다른 기사가 먼저 가져갔다** (실물 09-30 13:08:45 · 발견→누름 141ms 인데도 빼앗겼다).
     * 알림을 믿는 앱(플러그인 `noticeSources` — 픽커 · 시뮬)의 «배정» 토스트만 본다 — 다른 앱 알림은 글자를 남기지 않는다(개인정보).
     * 누르는 중이면 «누르기 안 먹힘» 대신 여기서 끝낸다(누르기 실패 수에 안 센다). 빼앗긴 콜을 셀 수 있게 한 줄 + 이상 징후 CALL_TAKEN.
     */
    private fun onNotificationEvent(event: AccessibilityEvent) {
        val pkg = event.packageName?.toString() ?: return
        /* 🏁 그 알림을 믿는 배차망 — 지금 고른 배차망이 아니어도 알림을 낸 앱으로 찾는다 */
        val source = com.onedal.app.plugins.DispatchPluginRegistry.all().firstOrNull { pkg in it.noticeSources } ?: return
        val text = event.text.joinToString(" ")
        val notice = com.onedal.app.core.CallTakenNote.noticeOf(source.screens, text) ?: return
        val rec = touchManager.resolveTakenByOther()
        val card = session.alarmTappedCard
        val foundToTap = if (session.alarmFoundAtMs > 0 && session.alarmTappedAtMs >= session.alarmFoundAtMs)
            "${session.alarmTappedAtMs - session.alarmFoundAtMs}ms" else "모름"
        val firstSeen = card?.let { c ->
            val fp = CallMemory.fingerprintOf(c)
            recentListOrders.firstOrNull { CallMemory.fingerprintOf(it) == fp }?.timestamp
        } ?: "모름"
        val what = card?.let { "${it.fare}원 ${it.pickup}→${it.dropoff}" } ?: "누른 줄 모름"
        val tappedPage = session.alarmTappedPage
        val notifiedPage = lastScreenRead?.page
        AppLogger.w(TAG, LogTag.TAP, "🏁 [먼저 가져감] 다른 기사가 먼저 — $what · 누른 화면 ${tappedPage ?: "모름"} · 알림 때 화면 ${notifiedPage ?: "표에 없음"} · 발견→누름 $foundToTap · 목록에 처음 보인 때 $firstSeen · 누르는 중 ${if (rec != null) "이었다" else "아니었다"}")
        apiClient.sendAnomalyReport(
            targetApp = currentTargetApp,
            /* 🧾 화면 칸 = 누른 화면(앱이 누른 콜) — 손으로 누른 콜이면 알림 때 화면 */
            screenName = (session.alarmTappedScreen ?: telemetryManager.currentScreenContext).name,
            failureReason = com.onedal.app.core.CallTakenNote.reason(notice, tappedPage, notifiedPage, foundToTap, firstSeen),
            listOrderInfo = card?.let { mapOf("fare" to it.fare, "pickup" to it.pickup, "dropoff" to it.dropoff) },
            detailParsedText = text.take(200),
            ocrResult = null,
        )
    }

    /** ⏱️ 이번 읽기에서 화면을 얻어 글자를 모았나 · 지난번과 같은 글자였나 — `scanScreen` 이 요약에 싣는다 */
    private var scanGathered = false
    private var scanSameText = false
    /** 🌳 이번 읽기에서 훑은 노드 — 🔴 이번 읽기 안에서만 쓰고 끝나면 비운다(다음 읽기가 옛 노드를 잡지 않게 · `scanScreen`) */
    private val scanNodes = mutableListOf<com.onedal.app.core.RawNode>()
    private var scanWalkMs = 0L
    /** ⏱️ 이번 읽기의 화면별 처리 ms · 노드 수 · 마지막으로 캐시를 비운 때 — «읽기 나눔» 계측 (인성 팝업 느림 가리기) */
    private var scanHandleMs = 0L
    private var scanNodeCount = 0
    private var lastCacheClearAtMs = 0L
    private val readSplit = com.onedal.app.core.ReadSplit()
    /** ⏱️ 아직 안 읽은 첫 배차망 알림이 실제로 난 때(부팅 기준) · 0 이면 없음 — «알림→읽기»(메인 줄에서 밀린 몫) */
    private var unreadEventAtMs = 0L
    /** 🧪 이번 읽기의 지문 글자 · 받는 방식 · 알림 뒤 첫 읽기인가 (`WalkProbe`) */
    private var scanTexts: List<String> = emptyList()
    private var scanWay = com.onedal.app.core.WalkProbe.Way.PLAIN
    private var listReadNo = 0L
    /** 배차망 앱(우리 앱 아님)의 마지막 알림 시각 · 그 뒤 아직 안 읽었나 · 마지막 캐시 확인 시각 */
    private var lastTargetEventMs = 0L
    /** ⏳ 최근 배차망 «내용 바뀜» 시각(300ms 만) · 이번 읽기가 움직이는 틀인가 · 미룬 알람 (`AlarmHold`) */
    private val recentContentEvents = ArrayDeque<Long>()
    private var scanMoving = false
    private val alarmHold = com.onedal.app.core.AlarmHold()
    private val heldAlarmRecheck = Runnable { reservedRead("미룬 알람 확인") }
    private var eventSinceRead = false
    /** 📜 조용한 목록 다시 읽기 — 마지막 읽기 시각 · 이번 읽기가 조용한 다시 읽기인가 · 겹친 틀 연달아 버린 수 (`ListWatch`) */
    private var lastReadMs = 0L
    /** ✋ 마지막으로 손이 닿은 때 — 목록 스크롤 알림 · 상세→목록 복귀 · 겹친 틀 버림 (`ListWatch.TOUCH_WINDOW_MS`) */
    private var touchedAtMs = Long.MIN_VALUE / 2
    private var quietReading = false
    private var discardStreak = 0

    /**
     * 📡 **화면 한 번 읽기 — 입구는 여기 하나** (접근성 알림 · «필터 도착»이 같은 길).
     * 화면 글자(지문)가 바로 전과 같으면 스캔을 건너뛴다 — 필터 도착은 지문을 비우고 불러 같은 글자라도 다시 판정한다.
     * ⏱️ 읽기 전체(나무 훑기 · 목록 조립 · 보고)를 재서 1초 요약에 싣는다 — 첫 훑기만 재면 실제 무게가 안 보였다(실물 09-30 18:29).
     */
    private fun scanScreen() {
        val ctx = telemetryManager.currentScreenContext
        val startMs = android.os.SystemClock.elapsedRealtime()
        scanGathered = false
        scanWalkMs = 0L
        scanHandleMs = 0L
        scanNodeCount = 0
        val waiting = touchManager.awaitingScreen || session.collectState.awaitsPopup
        val eventLagMs = if (unreadEventAtMs > 0L) startMs - unreadEventAtMs else null
        unreadEventAtMs = 0L
        readSplit.start(startMs)
        scanNodes.clear()
        scanMoving = com.onedal.app.core.AlarmHold.isMoving(recentContentEvents.toList(), startMs)
        val afterEvent = eventSinceRead
        eventSinceRead = false
        scanWay = if (ctx == ScreenContext.LIST) com.onedal.app.core.WalkProbe.wayFor(android.os.Build.VERSION.SDK_INT, ++listReadNo)
            else com.onedal.app.core.WalkProbe.Way.PLAIN
        try { scanScreenBody() } finally { scanNodes.clear() }
        if (!scanGathered) return
        val nowMs = android.os.SystemClock.elapsedRealtime()
        lastReadMs = nowMs
        scanTimerOf(ctx)?.let { (timer, label) ->
            timer.record(nowMs - startMs, scanSameText, nowMs, walkMs = scanWalkMs,
                way = scanWay.word.takeIf { ctx == ScreenContext.LIST }, afterEvent = afterEvent, quietRead = quietReading)
                ?.let { AppLogger.d(TAG, LogTag.SCREEN, "$label $it") }
        }
        // ⏱️ 상세·팝업 읽기 중 앱이 기다리던 읽기와 화면이 바뀐 읽기만 — 어디서 느린가(훑기·처리·캐시)를 가린다
        val ctxNow = telemetryManager.currentScreenContext
        if (!scanSameText && (ctx != ScreenContext.LIST || ctxNow != ctx) && (waiting || ctxNow != ctx))
            AppLogger.d(TAG, LogTag.SCREEN, "⏱️ [읽기 나눔] ${ctx.name}→${ctxNow.name} · 전체 ${nowMs - startMs}ms · 훑기 ${scanWalkMs}ms · 처리 ${scanHandleMs}ms · 노드 $scanNodeCount" +
                " · 캐시 비운 지 ${if (lastCacheClearAtMs > 0L) "${nowMs - lastCacheClearAtMs}ms" else "없음"} · 앱 기다림 ${if (waiting) "예" else "아니오"}" +
                " · 알림→읽기 ${eventLagMs?.let { "${it}ms" } ?: "없음"} · 나눔 ${readSplit.line()}")
    }

    /**
     * 📜 **조용한 목록 다시 읽기** — 캐시를 비우고 한 번 읽는다(`ListWatch`). 알림이 없으면 캐시가 안 버려져 다시 읽어도 옛 틀이 돌아오기 때문이다.
     * 같은 글자면 지문에서 멈춰 서버로 안 간다. 글자가 달라졌으면 새로 보인 줄 앞 세 개(가림)를 한 줄.
     */
    private fun quietRead(why: String) {
        if (android.os.Build.VERSION.SDK_INT >= com.onedal.app.core.WalkProbe.PREFETCH_MIN_SDK) { clearCache(); lastCacheClearAtMs = android.os.SystemClock.elapsedRealtime() }
        val before = scanTexts
        quietReading = true
        try { scanScreen() } finally { quietReading = false }
        if (scanGathered && !scanSameText)
            AppLogger.i(TAG, LogTag.SCREEN, "📜 [조용한 다시 읽기] ${telemetryManager.currentScreenContext.name} · $why · 글자가 달라졌다 — 새로 보인 줄: " +
                com.onedal.app.core.WalkProbe.newLines(before, scanTexts).joinToString(" · ") { com.onedal.app.core.ScreenWords.mask(it) })
    }

    /** 📜 1초마다 — 지켜보는 화면(목록 · 배차망 앱 안의 목록 밖 화면)에서 읽기도 배차망 알림도 5초 넘게 없으면 조용한 다시 읽기 (`ListWatch.shouldRead`) */
    private val listWatchdog = object : Runnable {
        override fun run() {
            val now = android.os.SystemClock.elapsedRealtime()
            /* 🧭 배차망 앱 안인가 — 실물 배차망 앱이거나 배차망 정의 표의 페이지로 읽혔다(시뮬레이터 자기 화면은 표에 없다) */
            val onNetworkPage = TargetApp.sourceOf(telemetryManager.screenPackage) == "real" || lastScreenRead?.page != null
            if (com.onedal.app.core.ListWatch.shouldRead(now, lastReadMs, lastTargetEventMs,
                    watched = com.onedal.app.core.ListWatch.watches(telemetryManager.currentScreenContext, onNetworkPage),
                    busy = touchManager.tapPending || session.isDetailScrapSent, touchedAtMs = touchedAtMs))
                quietRead(com.onedal.app.core.ListWatch.quietWord(now, lastReadMs, lastTargetEventMs))
            waitBook.schedule("목록 감시", com.onedal.app.core.WaitBook.SERVICE, 1000) { run() }
        }
    }

    /** 📐 겹친 틀을 버렸으면 곧 한 번 더 (`ListWatch.afterDiscard`) */
    private val afterDiscardRead = Runnable { reservedRead("겹친 틀 버린 뒤") }

    /** ⏰ 걸어 둔 다시 읽기 — 그사이 화면이 바뀌었을 수 있어 부르는 때에 다시 본다: 목록인가 · 누르는 중 아닌가 · 상세 보내는 중 아닌가 */
    private fun reservedRead(why: String) {
        if (telemetryManager.currentScreenContext != ScreenContext.LIST || touchManager.tapPending || session.isDetailScrapSent) return
        lastScreenFingerprint = 0   // 걸어 둔 다시 읽기는 같은 글자여도 목록을 다시 본다(손 먼저·흐르는 목록 뒤 «같은 화면»으로 건너뛰어 끝내 안 열었다 · ab 리뷰)
        quietRead(why)
    }

    private fun scanScreenBody() {
        val rootNode = (if (scanWay == com.onedal.app.core.WalkProbe.Way.PREFETCH && android.os.Build.VERSION.SDK_INT >= com.onedal.app.core.WalkProbe.PREFETCH_MIN_SDK)
            getRootInActiveWindow(PREFETCH_FLAGS) else rootInActiveWindow) ?: run {
            // 👁️ 화면을 못 얻었다 — 로그 없이 돌아가던 길을 요약에 센다
            scanTimerOf(telemetryManager.currentScreenContext)?.let { (timer, label) ->
                timer.noRoot(android.os.SystemClock.elapsedRealtime())?.let { AppLogger.d(TAG, LogTag.SCREEN, "$label $it") }
            }
            return
        }

        // 핑거프린트 비교 → 화면 변경 없으면 스킵
        val screenTexts = mutableListOf<String>()
        val walkStartMs = android.os.SystemClock.elapsedRealtime()
        collectNodes(rootNode, scanNodes, prefetch = scanWay == com.onedal.app.core.WalkProbe.Way.PREFETCH)
        screenTexts.addAll(com.onedal.app.core.NodeText.textsOf(scanNodes))
        scanTexts = screenTexts.toList()
        scanWalkMs = android.os.SystemClock.elapsedRealtime() - walkStartMs
        scanNodeCount = scanNodes.size
        markRead("훑기")
        val fingerprint = screenTexts.sorted().hashCode()
        // ⏱️ 요약은 바깥(`scanScreen`)이 읽기 전체로 싣는다
        scanGathered = true
        scanSameText = fingerprint == lastScreenFingerprint
        if (fingerprint == lastScreenFingerprint) {
            touchManager.onScreen(telemetryManager.currentScreenContext, textChanged = false)   // 👆 화면 그대로 — 누른 것이 안 먹혔나 본다
            rootNode.recycle(); return
        }
        lastScreenFingerprint = fingerprint

        val rawScreenStr = screenTexts.joinToString(" ")

        // 🖥️ 배차망 정의 표로 화면을 읽는다 — 로딩 같은 건너뛰는 덧칸이 보이면 이 프레임은 처리하지 않는다
        val screenRead = readScreen(rawScreenStr)
        if (screenRead.skip) { rootNode.recycle(); return }
        lastScreenRead = screenRead

        // 화면 종류 판별 및 서버(텔레메트리) 즉각 동기화
        markRead("지문·로딩")
        telemetryManager.screenPackage = rootNode.packageName?.toString()   // 🏷️ 보고의 실물/시뮬 — 판별과 같은 화면
        val detected = contextOf(screenRead, rootNode.packageName?.toString())
        logPageChange(screenRead, detected)
        markRead("판별")
        // 📰 이 화면에서 뺀 글자는 이 페이지 몫 — 목록 글자가 섞인 판(상세 시트가 올라오는 찰나)은 통째로 모으지 않는다
        com.onedal.app.core.ScreenWords.onScreen(com.onedal.app.core.pageOf(detected),
            if (scrapParser.isListResidue(screenTexts)) emptyList() else screenTexts, rawScreenStr)
        markRead("모은 글자")
        touchManager.onScreen(detected, textChanged = true)   // 👆 화면 처리보다 먼저 — 누른 것이 먹혔나 (종류가 바뀌었나)
        if (detected == ScreenContext.UNKNOWN) {
            // 🔎 운영센터 «이상 기록»에도 — 실물 배차망 앱 화면 · 10자 이상 · 같은 화면 하루 한 번 (`UnknownScreenReport`) — 사진은 1초 뒤에도 모르는 화면이면 같이 싣는다(`UnknownScreenShot`)
            // 🧭 진입 경로 — 마지막으로 알아본 화면(앞 프레임도 모름이면 그 앞) · 원달앱 마지막 누름 · 뒤로 (`UnknownScreenReport.entryOf`)
            val nowMs = android.os.SystemClock.elapsedRealtime()
            val entry = com.onedal.app.core.UnknownScreenReport.entryOf(lastKnownScreen,
                touchManager.lastAppTapAtMs.takeIf { it > 0 }?.let { nowMs - it }, touchManager.lastAppBackAtMs.takeIf { it > 0 }?.let { nowMs - it })
            val toOps = com.onedal.app.core.UnknownScreenReport.record(currentTargetApp, rootNode.packageName?.toString(), rawScreenStr, entry = entry)
            AppLogger.w(TAG, "🔎 [UNKNOWN 화면 진단] 읽힌 텍스트(${rawScreenStr.length}자) · $toOps: ${rawScreenStr.take(300)}")
            /**
             * 🔴 **여기서 «조금 뒤 다시 보기»를 하지 않는다 — 해 봤고, 안 된다**.
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
        } else lastKnownScreen = screenRead.page ?: detected.name   // 🧭 진입 경로 — 알아본 화면만 남긴다
        // ⚠️ 아래 복귀 판정이 **직전 화면**을 봐야 하므로 갱신 전에 붙잡아 둔다
        val previous = telemetryManager.currentScreenContext

        /**
         * 🔄 **화면이 바뀔 때 배차망이 할 일** — 픽커: 기사님이 «수락하기»를 누르셨는지 알아본다(`KakaoPickerPlugin.onScreenChanged`).
         * 🔴 아래 화면 이름 보고보다 **반드시 먼저** 부른다.
         */
        com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp)
            .onScreenChanged(this, previous, detected, screenTexts, rawScreenStr, rootNode.packageName?.toString())

        /**
         * 📡 **화면 이름은 뜻을 정한 뒤에 알린다** (체험 · 로그 분석).
         *
         * 🔴 **위 수락 신고가 이 줄보다 반드시 먼저다.** `updateScreenContext` 는 바뀌는 즉시 서버로 쏘는데,
         *    서버는 그 한 줄만 보고 «상세 이탈»을 확정하고 미리보기를 치운다 (기사님 확정 규칙 · 예외 없음).
         *    그날 앱은 이름을 먼저 쏘고 뜻(수락)을 0.04초 뒤에 알려, 치워진 콜이 되살아나고 판정이 🔴 로 남았다.
         *    서버 규칙은 «**수락 안 한** 미리보기만 치운다»라 — 수락 사실이 먼저 닿기만 하면 안 치운다.
         *    검사: `PickerAcceptOrderTest` 「수락 인지가 화면 보고보다 앞에 있다」
         */
        markRead("배차망 화면 바뀜")
        updateScreenContext(detected, screenRead)
        markRead("화면 바꿈 보고")

        /**
         * 수동/자동 복귀 감지: 기사님이 닫기·취소·뒤로가기로 리스트에 돌아오면 락을 푼다.
         *
         * 🔴 **"지금 화면이 LIST 냐"** 만 보면, 자동 터치 **직후**(상세가 아직 안 그려져 화면이 여전히 LIST)에도
         *    걸려 `resetSessionState()` 가 `openedByApp` 을 꺼 버린다 — 0.3초 사이의 실측:
         *      .397  💥 [AUTO] 꿀콜 조건 통과! 강제 터치 진행!     ← openedByApp = true
         *      .704  [복귀 감지] LIST 화면으로 이탈 감지됨          ← 아직 LIST · 오탐
         *      .705  🔄 세션 상태 완전 초기화                      ← openedByApp = false
         *      19.06 모드: MANUAL (매크로클릭: false)              ← AUTO 인데 MANUAL 로 보고
         * 
         *    그 한 글자가 서버의 배차 흐름을 통째로 바꾼다. MANUAL 은 안전취소 없이 즉시 확정되고,
         *    앱이 리스트로 이탈해도 서버가 안 치운다(기사님이 손으로 잡은 콜을 서버가 버리면 안 되므로).
         *
         * 상태 기계로 보면 이렇다.
         *      LIST               --> DETAIL_PRE_CONFIRM : 콜 클릭
         *      DETAIL_PRE_CONFIRM --> LIST               : 취소 · 뒤로가기
         * 리셋이 필요한 건 **두 번째 전이**다. 즉 "지금 LIST" 가 아니라 **"LIST 로 돌아왔다"**.
         * 그래서 직전 화면이 리스트가 아니었을 때만 복귀로 친다.
         *
         * (타이머로 유예를 주는 방법도 있지만, 몇 밀리초를 줘야 하는지에 근거가 없다.
         *  화면 전이는 이미 상태로 표현돼 있으므로 그걸 쓴다)
         *
         * 🔴 **리셋은 여기 한 곳에서만** 한다 (`sessionEndsWithCall.test.ts`). 리스트 핸들러가 조건 없이 리셋을
         *    부르면 이 판정이 무의미해지고, 앱이 자기가 터치한 콜을 «손으로 연 상세»로 읽어 확정을 안 누른다.
         *
         * ⚠️ 조건(`hasActiveSession()`)을 걸지 않는다. 그건 `openedByApp`·`isWaitingForDecision`·
         *    `currentOrderId` 만 보므로 `collectState`·`isPreview` 가 더럽게 남으면 그냥
         *    통과한다. **복귀는 그 자체로 콜의 끝**이니 조건 없이 지우는 것이 맞다.
         */
        val isListScreen = detected == ScreenContext.LIST ||
                           detected == ScreenContext.LIST_COMPLETED
        val wasListScreen = previous == ScreenContext.LIST || previous == ScreenContext.LIST_COMPLETED
        /**
         * 👁️ **리스트를 못 보고 있던 동안을 기록한다** (기사님 요청).
         *
         * 앱은 한 번에 콜 하나만 평가한다 — 상세로 들어가면 그동안 **리스트를 아예 안 읽는다.**
         * 그 사이 배차망에 뜬 콜은 평가조차 되지 않고 조용히 사라진다.
         *
         * 🔴 콜 하나를 잡는 데 **10초 넘게** 걸리기도 하고, 그동안 다른 콜이 화면에 떴다 사라진다.
         *    기록이 없으면 *"필터가 걸렀나 / 안 떴나 / 못 봤나"* 를 구분할 수 없다 — **놓친 콜과 걸러낸 콜은 전혀 다르다.**
         *
         * 그래서 리스트를 떠난 시각을 재 두고, 돌아올 때 얼마나 못 봤는지 남긴다.
         * (배차망 콜 간격보다 이 시간이 길면 문제지가 통째로 지나간다)
         */
        if (!isListScreen && wasListScreen) {
            listBlindSinceMs = System.currentTimeMillis()
            alarmHold.clear()   // ⏳ 목록을 떠났다 — 미룬 알람을 버린다
            waitBook.cancelOwner(com.onedal.app.core.WaitBook.LIST)   // 미룬 알람 다시 보기 · 겹친 틀 뒤 읽기도 여기서 거둔다
            waitBook.cancel("목록 요약"); listWatchTicks = 0   // 👁️ 복귀 요약은 목록에 있는 동안만 — 떠난 뒤 «복귀 N초»로 찍히지 않게
            touchedAtMs = android.os.SystemClock.elapsedRealtime()   // ✋ 목록을 떠났다 — 손이 닿은 것 · 목록 밖 화면에서 10초 동안 조용한 다시 읽기를 촘촘히(돌아온 것을 곧 알게)
            logPendingWaits("목록 → ${detected.name}")
        }
        if (isListScreen && !wasListScreen) {
            AppLogger.d(TAG, LogTag.SCREEN, "[복귀 감지] ${previous.name} → ${detected.name} 복귀. 세션 및 안전취소 락 완전 해제")
            resetSessionState()
            logPendingWaits("${previous.name} → 목록")
            // 📏 앱이 뒤로 간 복귀면 목록 확인까지 ms — 목록 보고는 화면이 바뀐 순간 곧바로 나간다(`updateScreenContext`)
            // ✋ 앱이 뒤로 가기를 안 보냈는데 목록으로 왔다 — 기사님 손(넘기기·뒤로)
            if (android.os.SystemClock.elapsedRealtime() - touchManager.lastAppBackAtMs > com.onedal.app.core.HandFirst.APP_BACK_ECHO_MS) onHand("상세 → 목록")
            if (lastBackAtMs > 0L) {
                AppLogger.i(TAG, LogTag.SCREEN, "↩️ [목록 확인] 뒤로 간 뒤 ${android.os.SystemClock.elapsedRealtime() - lastBackAtMs}ms — 목록 보고 곧바로 보냄")
                lastBackAtMs = 0L
            }
            touchedAtMs = android.os.SystemClock.elapsedRealtime()   // ✋ 상세→목록 복귀 — 10초 동안 조용한 다시 읽기를 촘촘히
            // 👁️ 돌아온 5초는 목록 요약을 1초마다 빠짐없이 (`listWatch`)
            listWatchTicks = 5
            waitBook.schedule("목록 요약", com.onedal.app.core.WaitBook.SERVICE, 1000) { listWatch.run() }
            // 👁️ 리셋한 뒤에 «못 본 시간»을 남긴다 — 리셋이 먼저다 (콜의 끝이 우선)
            if (listBlindSinceMs > 0L) {
                val blindSec = (System.currentTimeMillis() - listBlindSinceMs) / 1000.0
                AppLogger.roadmap(LogTag.SCREEN,
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

        // 🔕 화면 «종류»가 바뀔 때만 — 글자만 바뀐 알림(1초마다)은 되풀이하지 않는다. 목록으로 바뀔 때도 찍힌다(appLoop.mjs 가 읽는다)
        if (LogOnce.changed("screen", detected.value)) AppLogger.roadmap(LogTag.SCREEN, "📡 화면 변경 감지 | 화면: ${detected.value} | 모드: ${telemetryManager.currentMode}→$effectiveMode", telemetryManager.currentScreenContext.name)

        // 🔔 리스트를 떠났다 — 남의 화면 위에 알람 테두리를 남기지 않는다 (§6-③)
        if (detected != ScreenContext.LIST) alarmSignaler.onLeaveList()
        // ⏱️ 상세 대기 타이머를 여기서 끄지 않는다 (#124) — «상세 → 리스트» 한 경우만 보다가 중간 화면이 끼면 안 꺼졌다.
        //    끄는 곳은 `resetSessionState` 한 곳이다 (콜의 끝 · #44 와 같은 자리).


        /**
         * 🌐 **배차망 불일치 관문** (기사님 확정 · 1단계).
         * 화면이 가리키는 배차망이 지금 읽는 배차망과 다르면 — 이 판을 통째로 버리고 갈아탄다.
         * 안 버리면 남의 화면을 남의 파서로 읽어 쓰레기 콜이 올라간다 (잔상 사고와 같은 계열).
         *
         * 🖥️ **화면이 가리키는 배차망은 화면 글자로 안다** (기사님 확정).
         *    앱 이름(패키지)으로 가르면 시뮬레이터는 세 배차망을 한 앱으로 띄우므로
         *    픽커·24시 화면도 늘 «인성»으로 읽는다. 배차망 글자가 없는 화면(카톡·잠금화면)은
         *    null 이라 관문 대상이 아니다 — 직전 배차망 그대로 흐른다.
         */
        val screenNetworks = TargetApp.networksOnScreen(screenTexts)
        if (screenNetworks.size > 1) {
            AppLogger.w(TAG, "🌐 [망 판별] 두 배차망 글자가 함께 보인다 $screenNetworks — 바꾸지 않는다")
        }
        val screenNetwork = screenNetworks.singleOrNull()
        if (screenNetwork != null) lastNetworkPackage = rootNode.packageName?.toString()
        NetworkSwitchGate.switchTargetFor(screenNetwork, currentTargetApp)?.let { target ->
            // 🔄 **기다리지 않는다** (기사님 확정: "4초 지워").
            //    기다리는 동안 앱은 콜을 한 건도 안 읽는데, 얻는 것이 없다.
            switchNetworkTo(target)
            // 갈아탄 파서로 이 판을 다시 읽는다 — 다음 이벤트를 기다리지 않는다
            //    (정지 화면이면 그 «다음»이 영영 안 온다 — 실측 2분)
            rootNode.recycle()
            return
        }

        /* 🖥️ 화면을 읽은 뒤 배차망이 할 일 — 운행 기록 · 운행 단계 로그(지금 픽커) · 칸이 앱 이름으로 제 화면인지 가린다 */
        val screenPkg = rootNode.packageName?.toString()
        com.onedal.app.plugins.DispatchPluginRegistry.all().forEach { it.afterScreenRead(this, detected, rawScreenStr, screenPkg) }

        // 화면별 핸들러 라우팅
        markRead("바뀜 뒤 처리")
        val handleStartMs = android.os.SystemClock.elapsedRealtime()
        when (detected) {
            ScreenContext.LIST -> handleListScreen(rootNode, screenTexts)
            ScreenContext.DETAIL_PRE_CONFIRM -> {
                // 🧹 상세 처리·서버 글은 배차망이 뗀 글로(픽커: «픽업지» 앞 목록 잔상) — 판별·모은 글자는 원래 글
                val detailTexts = com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).detailTextsOf(screenTexts)
                handlePreConfirmScreen(rootNode, detailTexts, detailTexts.joinToString(" "))
            }
            /* ✅ 확정 뒤 상세 · 상세 위 팝업에서 할 일은 그 배차망 칸이 정한다 — 인성만 있다(화물24시 · 픽커는 아무것도 안 한다) */
            ScreenContext.DETAIL_CONFIRMED -> com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).onConfirmedDetail(this, rootNode, screenTexts, rawScreenStr)
            ScreenContext.POPUP_MEMO, ScreenContext.POPUP_PICKUP, ScreenContext.POPUP_DROPOFF ->
                com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).onPopup(this, detected, rootNode, screenTexts)
            else -> {} // UNKNOWN, POPUP_ERROR 등은 현재 별도 처리 없음
        }
        scanHandleMs = android.os.SystemClock.elapsedRealtime() - handleStartMs
        markRead("화면별 처리")

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

    /** ⛔ 지난 목록 읽기에서 계정이 막혀 있었나 — 바뀔 때만 한 줄 */
    private var wasAccountBlocked = false

    /** 🧾 목록 읽기 번호 — 목록 줄을 본 때를 적는다(`ListSightings`) */
    private var listScanNo = 0L

    private fun handleListScreen(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
        listScanNo++
        val listReadAtMs = android.os.SystemClock.elapsedRealtime()   // 🏁 «발견→누름»의 발견
        // 🎛️ 이 배차망에서 실제로 도는 모드 (자동인데 픽커면 알람) — 검사(deviceMode · appSafeDefaults)가 이 이름의 글자를 읽는다
        val currentMode = effectiveMode
        // 👻 상세→리스트 복귀 직후 잔상 방어 (0830 23:04 실측) — 상세 글자가 남은 판은 버린다.
        //    다음 스캔(1초 안)은 깨끗하다. 무엇이 잔상인가는 배차망 파서가 답한다(기본 «아니다»).
        if (scrapParser.isDetailResidue(screenTexts)) {
            AppLogger.d(TAG, LogTag.SCREEN, "👻 [상세 잔상] 리스트 스캔에 상세 글자 잔류 — 이 판은 버린다")
            return
        }
        /**
         * 🔚 **여기서 세션을 지우지 않는다** (기사님 확정).
         *
         * 이 핸들러는 리스트에 머무는 5초마다 돈다 — 여기서 리셋하면 «리스트로 돌아오면»이 아니라
         * «리스트를 보고 있으면» 리셋이 되어, 자동 터치 직후 화면이 아직 안 바뀐 사이(118ms)에 LIST 이벤트가
         * 한 번 더 오면 **방금 잡은 콜이 통째로 지워진다.** 리셋은 위쪽 **복귀 판정**이 한다.
         *
         * 🔴 세션을 지우는 자리는 전부 *"이 콜은 끝났다"* 여야 한다 — 복귀 · 동명이동 실패 ·
         *    2차 필터 실패 · 판결 집행. **"지금 무슨 화면이냐"는 콜의 끝이 아니다.**
         */
        // 🌳 이번 읽기에서 한 번 훑은 노드로 — 다시 훑지 않는다 (`collectNodes`)
        val allNodes = com.onedal.app.core.NodeText.textNodesOf(scanNodes).map { (t, n) -> ScreenTextNode(t, n.node!!, n.rect!!) }.toMutableList()

        // 앱별 앵커 노드 감지 및 텍스트 그룹화 로직을 파서(ScrapParser)로 위임
        // 📜 목록 머리줄이 보이나 — 사실 한 칸(보고·로그). 바뀔 때만 한 줄
        val headerVisible = com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).listHeaderVisible(allNodes)
        if (headerVisible != null && com.onedal.app.core.LogOnce.changed("list-header", "$headerVisible"))
            AppLogger.i(TAG, LogTag.SCREEN, if (headerVisible) "📜 [목록 맨 위] 머리줄 보임 — 목록 줄을 누를 수 있다"
                else "📜 [목록 내려감] 머리줄 안 보임 — 앱은 «오더카드 대기 중» 띠 아래 줄만 누른다 (오더카드 꼴이 보이면 안 누른다)")
        val groupedNodes = scrapParser.groupListNodes(allNodes)
        if (scrapParser.lastFrameDiscarded) {
            discardStreak++
            lastScreenFingerprint = 0   // 다시 읽은 글자가 버린 틀과 같아도 목록을 다시 본다 (라이브 09-30 20:47:00 · 33.1초 멈춤)
            touchedAtMs = android.os.SystemClock.elapsedRealtime()   // ✋ 목록이 움직였다 — 10초 동안 촘촘히
            waitBook.cancel("겹친 틀 뒤 읽기")
            com.onedal.app.core.ListWatch.afterDiscard(discardStreak)?.let { waitBook.schedule("겹친 틀 뒤 읽기", com.onedal.app.core.WaitBook.LIST, it) { afterDiscardRead.run() } }
                ?: if (discardStreak == com.onedal.app.core.ListWatch.DISCARD_STREAK_MAX)
                    AppLogger.i(TAG, LogTag.SCREEN, "📐 섞인 틀 연속 ${discardStreak}번 — 곧 다시 읽기를 멈추고 5초 주기로") else Unit
        } else discardStreak = 0
        // 🔔 경로 기억에 이번 읽기의 흔들림 — 흔들린 읽기는 «다른 콜» 가르기에 안 쓴다 (`AlarmedRoutes.beginRead`)
        alarmedRoutes.beginRead(steady = !scrapParser.lastFrameDiscarded && !scanMoving)
        // ⛔ 막힌 계정이면 콜을 집지 않는다 — 판정을 안 하니 알람·상세 열기·누르기가 쉬고, «막았다» 기억에도 안 남아 풀리면 처음처럼 판정한다
        val accountBlocked = !com.onedal.app.core.DeviceLink.picksCalls(apiClient.unlinkedWhy())
        if (accountBlocked != wasAccountBlocked) {
            wasAccountBlocked = accountBlocked
            if (accountBlocked) AppLogger.w(TAG, "⛔ [계정 막힘] 서버가 이 계정을 막았다(승인 전 · 정지 · 탈퇴) — 콜을 집지 않는다 · 화면 읽기·보고는 계속")
            else AppLogger.i(TAG, LogTag.FILTER, "✅ [계정 풀림] 서버가 다시 받는다 — 콜을 다시 집는다")
        }

        /** 그룹은 나왔는데 요금을 못 읽어 버려진 수 — 아래 진단이 읽는다 */
        var fareFail = 0
        /** 📋 요건(상차·하차)을 다 못 읽은 줄 — 그 스캔에서 뺐다 (`OrderRequirement`) */
        var unreadRow = 0
        var seenSkipped = 0   // ⏭️ 이 스캔에서 건너뛴 이미 본 콜 수 — 요약 한 줄(바뀔 때만)

        /**
         * 👁️ **이번 스캔의 필터 성적표** (기사님 확정).
         *
         * 기사님: *"관제웹에서는 필터링이 잘되고 있는 건지 알 수가 없어서 답답하다."*
         * **매 스캔마다 새로 만든다** — 누적이 아니다. 질문은 *"어제부터 몇 개"* 가 아니라
         * *"지금 리스트에 뭐가 떠 있고 왜 안 잡나"* 이기 때문이다.
         */
        val tally = FilterTally()

        /**
         * 👁️ **빈 카드를 센다** — 필드 테스트 1회차 ① 의 계측.
         *
         * 실주행에서 `💸 요금 못 읽음` 이 **뒤가 공백**인 채로 무더기로 난다 — 요금이 이상한 게 아니라
         * **같은 줄 글자가 하나도 안 묶인** 것이다(스캔당 약 30개).
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
        /** 🎯 이번 스캔의 통과 콜들 — 루프 뒤에 요금 최고 하나만 누른다 (기사님 확정 · 모든 모드 같은 규칙) */
        val alarmHits = mutableListOf<Triple<SimplifiedOfficeOrder, ScreenTextNode, Int>>()
        /** 🔔 이번 스캔에 보인 콜(건너뛴 콜 포함) — 알람 기억의 «마지막으로 본 때» (`AlarmedRoutes`) */
        val scanOrders = mutableListOf<SimplifiedOfficeOrder>()
        val nowMs = android.os.SystemClock.elapsedRealtime()

        /**
         * 🔄 **필터 버전이 바뀌었으면 «막았다» 기억만 비운다** (#135).
         * 상차 목록은 차가 0.5km 움직일 때마다 바뀐다 — 옛 목록으로 막힌 콜을 새 목록으로 다시 판정해야
         * «가까워지면 올라온다»가 선다. 누른 콜·통과한 콜·보고한 콜은 그대로다 (`CallMemory` 머리).
         */
        val filterVersionNow = getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE).getString("filterVersion", null)
        val prevFilterVersion = seenFilterVersion
        if (!filterVersionNow.isNullOrEmpty()) seenFilterVersion = filterVersionNow
        when (callMemory.onFilter(filterVersionNow, scrapParser.judgmentValuesKey())) {
            com.onedal.app.core.CallMemory.FilterChange.VALUES ->
                AppLogger.d(TAG, LogTag.FILTER, "🔄 [필터 바뀜] 버전 $filterVersionNow — 막았던 콜을 새 필터로 다시 판정한다")
            // 🧾 판정이 읽는 값은 그대로 — 막은 기억을 지킨다(이미 연 콜을 다시 열지 않게). 같은 쌍은 한 번만
            com.onedal.app.core.CallMemory.FilterChange.VERSION_ONLY ->
                if (versionOnlyPairs.add("$prevFilterVersion→$filterVersionNow"))
                    AppLogger.i(TAG, LogTag.FILTER, "🧾 [필터 버전만 바뀜] $prevFilterVersion → $filterVersionNow · 값 같음 — 다시 판정 안 함")
            com.onedal.app.core.CallMemory.FilterChange.NONE -> Unit
        }

        // 각 요금 노드 기준으로 텍스트 세트를 묶어 파싱
        for ((fareNode, cardTexts) in groupedNodes) {
            if (cardTexts.isEmpty()) {
                emptyCard++
                val r = fareNode.rect
                if (com.onedal.app.core.NodeText.isEmptyRect(r.top, r.bottom)) emptyRectAnchor++
                if (emptySamples.size < 3) {
                    emptySamples += "\"${fareNode.text}\"@(${r.left},${r.top},${r.right},${r.bottom})"
                }
            }
            val order = scrapParser.parse(cardTexts)

            if (order.fare == 0) {
                fareFail++
                /**
                 * 💸 **요금을 못 읽으면 그 카드의 글자를 남긴다** (기사님 확정).
                 *
                 * 숫자(`요금실패 1`)만으로는 **차종을 못 읽은 건지 요금 자리에 딴 게 있는
                 * 건지** 알 수가 없어, 재현해도 원인을 못 찾았다.
                 *
                 * 파서는 `차종 노드 → 바로 다음이 요금` 으로 읽는다(`InsungParser`).
                 * 그래서 **텍스트 순서 자체가 진단**이다 — 앞부분만 봐도 어디서 어긋났는지 보인다.
                 * 카드마다 매번 찍히지 않게 **못 읽은 것만** 남긴다.
                 */
                /**
                 * 🔴 **빈 카드는 스캔 요약이 찍는다** — 여기서 찍으면 실주행에서 수만 줄이 나와 다른
                 *    로그를 통째로 묻는다. 빈 카드는 스캔 요약(`👁️ [리스트 스캔]`)이
                 *    좌표와 함께 한 줄로 말한다. 여기는 **글자는 있는데 요금만 못 읽은**
                 *    진짜 파싱 실패만 남긴다.
                 */
                if (cardTexts.isNotEmpty()) {
                    AppLogger.w(TAG, "💸 [요금 못 읽음] ${cardTexts.joinToString(" | ").take(140)}")
                }
                continue
            }

            /**
             * 📋 **줄을 다 읽었나** — 상차·하차·요금·상차지거리를 못 읽은 줄은 같은 콜인지·반경 안인지 알 수 없다(기사님 «같은 콜인지는 모든 값이 들어 있을 때»).
             * 그 스캔에서 통째로 뺀다 — 지문·기억·서버 보고·알람·누르기 전부 안 한다. 다음 스캔에 읽히면 그때 본다.
             */
            if (!com.onedal.app.core.engine.OrderRequirement.listComplete(order,
                    com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).allowsEmptyDropoff(order))) {
                unreadRow++
                continue
            }
            val orderHash = CallMemory.fingerprintOf(order)
            com.onedal.app.core.ListSightings.saw(orderHash, listScanNo)   // 🧾 몇 번째 읽기에서 봤나 — 같은 콜 요금 인상 가르기
            // 📅 예약인데 날을 모른다 — 상세가 가른다. 배차망별로 몇 번인지 세려고 콜당 한 줄
            if (order.reserved == true && order.reservedDay == null && LogOnce.changed("reservation-unknown:$orderHash", "1"))
                AppLogger.i(TAG, LogTag.FILTER, "📅 [예약 날 모름] $currentTargetApp · ${order.pickup}→${order.dropoff} ${order.fare}원 · ${order.tagsText ?: order.scheduleText ?: ""}")
            scanOrders.add(order)
            scanHashes[orderHash] = fareNode.rect   // 🔔 이미 본 콜도 «아직 화면에 있다 + 지금 여기 있다»는 사실은 남긴다
            /**
             * ⏭️ **건너뛰었다는 사실을 남긴다**.
             *
             * 지문은 **상차+하차+요금**이라 차종만 바꾼 콜은 같은 콜로 보인다. 그런데
             * 아무 로그 없이 `continue` 하니, 화면엔 떴는데 판정이 한 줄도 안 남는다 —
             * *"필터가 막았나 / 요금을 못 읽었나 / 서버가 안 보냈나"* 를 가릴 수가 없다.
             *
             * 차종만 바꾼 문제지를 다시 흘리면 조용히 건너뛰어 **서버를 고쳤는지조차 확인 못 한다.**
             * (캐시는 접근성 토글로 서비스가 새로 만들어져야 비워진다 — 앱을 밀어내도 안 된다)
             */
            /**
             * 🔁 **가까워진 콜은 다시 판정한다** (기사님 «가») — 반경 밖이라 막았던 콜이 오늘 반경 안으로 들어오면 막은 기억을 푼다.
             * 소리는 울림 함 규칙(같은 길 한 번)대로다. 내일 이후 콜은 집 기준 목록으로 가르므로 폰 km 로 풀지 않는다.
             */
            if ((order.reservedDay ?: 0) < 1) {
                val scanRadiusKm = scrapParser.todayPickupRadiusKm()
                callMemory.releaseIfCloser(orderHash, order.pickupDistance, scanRadiusKm)?.let { was ->
                    AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔁 [가까워져 다시 판정] ${order.pickup}→${order.dropoff} · $was → ${order.pickupDistance}km (반경 ${scanRadiusKm}km)")
                }
            }
            if (callMemory.alreadyEvaluated(orderHash)) {
                seenSkipped++
                // 🔕 콜마다 첫 한 번만 (차종만 바꾼 문제지 진단용) — 스캔마다 되풀이하지 않는다
                if (LogOnce.changed("seen:$orderHash", "seen")) AppLogger.d(TAG, LogTag.FILTER, "⏭️ [이미 본 콜] ${order.pickup.take(14)} → ${order.dropoff.take(14)} " +
                    "${order.fare}원 (지문 $orderHash · 기억 ${callMemory.evaluatedCount}개)")
                continue
            }

            // 🌟 [항시 인터셉터] 콜 필터 매칭 검사 (디버그 로그를 위해 MANUAL/AUTO 무관하게 항시 실행)
            /**
             * 🔒 **평가가 실제로 돌았는지는 성적표가 답한다** (#79).
             * `decide()` 는 필터가 잠겨 있으면(선점 중·대기) 첫 줄에서 돌아서며
             * `tally.seen` 을 올리지 않는다 — 앞뒤 차이가 «평가했다»의 유일한 원천이다.
             * 여기서 필터를 다시 읽어 판단하면 decide 와 두 벌이 된다 (규칙 ③).
             */
            val seenBefore = tally.seen
            val isTarget = !accountBlocked && scrapParser.shouldClick(order, tally)
            val wasEvaluated = tally.seen > seenBefore

            /**
             * 🗳️ **판정을 콜에 실어 보낸다**.
             *
             * 현황판이 「🗑️ 버린 콜」 목록을 그릴 때 앱 판정식을 **TS 로 옮겨 적은 사본**으로
             * 다시 재고 있었고, 그것이 이미 한 번 갈라졌다 — 앱은 요율 모델이 서면
             * `minFare` 를 안 보는데 사본은 그것만 봐서 **가짜 «통과»** 를 냈다.
             * 값이 함께 가면 그 사본이 통째로 사라진다.
             *
             * 🔴 **성적표는 다시 세지 않는다** — `tally` 를 안 넘긴다. 위에서 이미 셌고,
             *    두 번 세면 «이 축을 풀면 몇 개가 들어오나»가 두 배로 읽힌다 (#79 와 같은 병).
             * ⚠️ 판정 계산 자체는 한 번 더 돈다 — 순수 계산이라 싸고, **같은 함수**라
             *    갈라지지 않는다. 결과를 둘러 나르는 것보다 이쪽이 읽기 쉽다.
             */
            val judged = scrapParser.withVerdict(order)

            /**
             * 🎯 **통과 콜은 모으기만 한다 — 누르는 것은 루프 뒤 한 곳** (기사님 확정 · 배차망_모드표.md).
             * 자동·체험·알람 모두 «목록을 끝까지 보고 요금 최고 하나»를 누른다. 요금이 같으면 먼저 읽힌 콜이다.
             */
            if (isTarget) {
                // 🔔 이 콜로 처음 알람감이 됐나 — 요금만 오른 같은 콜은 passedNew 에 안 센다(판정은 위에서 다시 했다)
                val firstFare = alarmedRoutes.firstFareOf(order)
                if (alarmedRoutes.countIfNew(order, nowMs)) {
                    tally.passedNew++
                    AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔔 [새로 셈] ${order.pickup}→${order.dropoff} ${order.fare}원")
                }
                else if (LogOnce.changed("alarmed-route:${order.pickup}→${order.dropoff}", "${order.fare}"))
                    AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔕 [이미 알람 낸 콜] ${order.pickup}→${order.dropoff} · 요금 ${firstFare ?: "?"} → ${order.fare} — 셈·알람 안 함")
            }
            // 폰이 이미 알람을 내고 연 콜은 요금만 올라도 다시 안 연다 — 셈만 하고 못 연 콜(심사 중·미룸)은 연다
            if (isTarget && !alarmedRoutes.opened(order)) alarmHits.add(Triple(order, fareNode, orderHash))

            // 4) 신규 콜 → 서버에 텔레메트리 보고 — **보고는 콜당 한 번** (평가와 딴 그릇 · #79)
            if (callMemory.markReportedOnce(orderHash)) {
                telemetryManager.enqueue(judged)
                recentListOrders.add(judged)
            }
            /**
             * 🔒 평가가 안 돈 콜(선점 잠금·대기)은 **기억에 남기지 않는다** (#79).
             * 잠금이 풀리는 다음 스캔에서 처음처럼 평가된다 — 콜을 잡는 10~30초 사이에
             * 나타난 콜을 영영 삼키지 않는다. 로그를 남기는 이유는
             * 이렇다: 침묵하면 «필터가 막았나/잠겼나/못 읽었나»를 가릴 수 없다.
             */
            /**
             * #135 — 막혔으면 «막았다»(필터 버전이 바뀌면 다시 판정).
             * 🔴 **통과한 콜은 여기서 기억하지 않는다** — 앱이 누른 콜만 루프 뒤에서 «눌렀다»로 기억한다(기사님 확정).
             *    여기서 «통과했다»로 넣으면 이번 스캔에 안 누른 둘째·셋째 좋은 콜이 다음 스캔에 «이미 본 콜»로 영영 건너뛰어진다.
             */
            if (!isTarget) callMemory.onScanned(orderHash, wasEvaluated, passed = false)
            // 🔁 상차 축으로 막았으면 그때 km 를 적는다 — 가까워지면 위에서 푼다
            if (!isTarget && wasEvaluated) order.pickupDistance?.let { km -> if (judged.verdict == "pickup") callMemory.rememberBlockedKm(orderHash, km) }
            if (!wasEvaluated) {
                AppLogger.d(TAG, LogTag.FILTER, "🔒 [평가 보류] ${order.pickup.take(14)} → ${order.dropoff.take(14)} " +
                    "${order.fare}원 — 필터 잠김(선점 중·대기), 다음 스캔에서 다시 본다")
            }
        }

        /**
         * 👁️ **리스트가 빈 이유를 구분해 남긴다** (기사님 확정 · 크리티컬).
         *
         * 기사님: *"분명 폰 이름 1234에 파란불이 들어와 있었어."*
         *
         * 접근성이 막혀 콜을 하나도 못 읽어도 텔레메트리가 가고 화면 판별(`LIST`)이 되면 **관제웹은 파란불**이다.
         * 노드를 몇 개 읽었는지 남기지 않으면 고장인지 알 수 없다.
         *
         * 🔴 실운행이면 콜을 통째로 놓치는데 기사님이 알 방법이 없다. `LIST` + 0항목은
         *    하루에 수만 번 찍힌다 — 대부분 진짜 빈 리스트지만 **고장과 구분이 안 된다.**
         *
         * 세 숫자가 그걸 가른다:
         *   노드 많음 + 그룹 0  → 콜은 화면에 있는데 **못 뽑는다**
         *   노드 0    + 그룹 0  → 접근성 트리가 **아예 안 온다**
         *   노드 적음 + 그룹 0  → 리스트가 진짜 비었다 (정상)
         *   그룹 있음 + 요금실패 → 카드는 잡았는데 **요금을 못 읽는다**
         */
        val picked = groupedNodes.size - fareFail
        /**
         * 🔴 **`picked == 0` 일 때만 찍으면 안 된다**.
         *    «그룹 30 · 통과 1» 이면 `picked = 1` 이라 빈 카드가 29개인데도 **한 줄도 안 남는다**.
         *    빈 카드가 하나라도 있으면 남긴다.
         */
        if (picked == 0 || emptyCard > 0) {
            val rect = if (emptyCard > 0) " · 빈카드 $emptyCard(닻 rect 0: $emptyRectAnchor)" else ""
            val sample = if (emptySamples.isNotEmpty()) " ⤷ ${emptySamples.joinToString(" · ")}" else ""
            AppLogger.w(TAG, "👁️ [리스트 스캔] 텍스트노드 ${allNodes.size} · 콜그룹 ${groupedNodes.size} · " +
                "통과 $picked · 요금실패 $fareFail · 덜 읽힘 $unreadRow$rect — ${lastScanReason(allNodes.size, groupedNodes.size, fareFail)}$sample")
        }
        /**
         * 🚪 **목록에서 누르는 곳은 여기 한 곳** (기사님 확정 · 배차망_모드표.md 순서 ⑦).
         *
         * 자동·체험·알람이면 통과 콜 가운데 **요금 최고 하나**를 눌러 상세로 들어간다 — 배차망을 가리지 않는다.
         * 직접 모드와 모르는 모드 값은 누르지 않는다(모르면 잡지 않는다 · 규칙 ④).
         * 앱이 계약 버튼을 누르는 것은 자동뿐이다(`contractedByApp`) — 체험·알람은 판정만 받고 확정·수락은 기사님.
         */
        if (LogOnce.changed("seenCount", "$seenSkipped") && seenSkipped > 0) AppLogger.d(TAG, LogTag.FILTER, "⏭️ [이미 본 콜] 이 스캔 ${seenSkipped}개 건너뜀")
        val tapsFromList = currentMode == "AUTO" || currentMode == "SIMULATION" || currentMode == "ALARM"
        val bestIdx = AlarmSignaler.pickBestIndex(alarmHits.map { it.first.fare })
        /**
         * ⏳ **목록이 움직이는 틀이면 통과 콜을 미룬다** (`AlarmHold` · 기사님 «가») — 덜 그려진 카드로 울리지 않게.
         * 다음 읽기에서 같은 조립이면 울리고(미룬 ms), 달라졌으면 버린다. 조용한 목록의 새 콜은 바로.
         */
        /**
         * 🔴 누를 콜은 늘 방금 읽은 화면에서 고른다 — 담아 두지 않는다 (기사님 · onedal-1f).
         * 담아 둔 사이 줄이 움직이면 엉뚱한 줄·오더카드를 누른다(09-13) — 사라짐·요금 바뀜·더 좋은 콜을 대기열은 모른다.
         * ✋ 기사님 손이 먼저 — 소리는 곧바로 울리고(시선이 먼저 옮겨 가야 화면이 바뀐 것을 안다 · 기사님 «가»),
         *    앱의 누르기만 손이 멈춘 뒤 1초 미룬다. 멈추면 곧바로 다시 읽어 그 화면에서 고른다 (`HandFirst`).
         *    소리 → 누름 차례: 같은 읽기면 fire 가 누름 앞이고, 미룬 누름은 뒤 읽기라 늘 소리가 먼저다. 같은 콜 소리는 한 번(`SoundMemory`).
         */
        // 📬 이번 읽기가 누르기로 다시 정하지 않으면 앞 읽기가 걸어 둔 넘김은 거둔다(뒤 스캔의 보류가 이긴다 · 리뷰)
        waitBook.cancel("누르기 넘김")
        val tapNowMs = android.os.SystemClock.elapsedRealtime()
        val handHeld = tapsFromList && !session.openedByApp && bestIdx >= 0 && handFirst.blocks(tapNowMs)
        /** 🚧 통과 콜이 있는데 안 연 까닭 — 목록 보고 openBlocked (`OpenBlocked`) */
        var openBlocked: String? = if (tapsFromList && bestIdx >= 0 && session.openedByApp) com.onedal.app.core.OpenBlocked.BUSY else null
        if (handHeld) {
            openBlocked = com.onedal.app.core.OpenBlocked.HAND_FIRST
            handFirst.hold(tapNowMs)
            if (LogOnce.changed("hand-first", "${handFirst.lastHandAtMs}"))
                AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "✋ [손 먼저] 기사님 손 ${"%.1f".format((tapNowMs - handFirst.lastHandAtMs) / 1000.0)}초 전($lastHandWhy) — 소리는 울림 · 누르기 미룸 · 멈추면 곧바로 다시 읽는다")
        }
        var holdFires = false
        if (tapsFromList && !session.openedByApp) {
            val best = if (bestIdx >= 0) alarmHits[bestIdx] else null
            val label = best?.first?.let { "${it.pickup}→${it.dropoff} ${"%,d".format(it.fare)}원 · 예약 ${com.onedal.app.core.engine.ReservationGate.wordOf(it)}" }
            val d = alarmHold.decide(best?.third, label, scanMoving, android.os.SystemClock.elapsedRealtime())
            d.dropped?.let { AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔕 [알람 미룸 → 탈락] $it") }
            when (d.kind) {
                com.onedal.app.core.AlarmHold.Kind.HOLD -> {
                    if (!handHeld) openBlocked = com.onedal.app.core.OpenBlocked.ALARM_HELD
                    lastScreenFingerprint = 0   // 확인 읽기의 글자가 같아도 목록을 다시 봐야 미룬 알람이 울린다
                    AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "⏳ [알람 미룸] 목록이 움직이는 중(내용 바뀜 ${recentContentEvents.size}개/300ms) — 다음 읽기에서 같은 조립이면 울린다 · $label")
                    waitBook.schedule("미룬 알람 다시 보기", com.onedal.app.core.WaitBook.LIST, com.onedal.app.core.AlarmHold.RECHECK_MS) { heldAlarmRecheck.run() }
                }
                com.onedal.app.core.AlarmHold.Kind.FIRE -> {
                    d.heldMs?.let { AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔔 [미룬 알람 울림] +${it}ms · $label") }
                    holdFires = true
                }
                com.onedal.app.core.AlarmHold.Kind.NONE -> Unit
            }
        }
        if (tapsFromList && !session.openedByApp && bestIdx >= 0 && holdFires) {
            val (order, fareNode, orderHash) = alarmHits[bestIdx]
            /**
             * 🔒 **서버가 앞 콜을 심사 중이면 이번 스캔은 누르지 않는다** (기사님 · 실주행 오송읍 · 한 번에 하나만 평가).
             * 판정은 이미 끝났고 기억에도 안 넣었으니, 앞 콜이 결재되는 즉시 다음 스캔에서 **바로** 누른다.
             */
            val prefs = getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            val evaluatingTop = if (prefs.contains(com.onedal.app.core.EvaluatingNow.PREF_KEY))
                prefs.getBoolean(com.onedal.app.core.EvaluatingNow.PREF_KEY, false) else null
            if (com.onedal.app.core.EvaluatingNow.of(evaluatingTop, savedFilter().evaluatingNow)) {
                openBlocked = com.onedal.app.core.OpenBlocked.EVALUATING
                AppLogger.d(TAG, LogTag.TAP, "⏳ [클릭 미룸] ${order.pickup.take(14)} → ${order.dropoff.take(14)} " +
                    "${order.fare}원 — 서버가 앞 콜을 심사 중입니다. 판정은 끝났으니 다음 스캔에서 바로 누릅니다")
            } else {
                // 🔔 알람이면 소리·진동 — 테두리는 그리지 않는다(앱이 상세까지 들어가 가리킬 줄이 없다 · 기사님 결정 «모든 배차망이 똑같이»)
                if (currentMode == "ALARM") {
                    alarmSignaler.fire(
                        fareNode.rect, scrapParser.alarmBandHalfPx(), orderHash,
                        withBorder = false,
                        withSound = alarmedRoutes.soundIfNew(order, android.os.SystemClock.elapsedRealtime()),   // 🔔 같은 경로 한 번(스크롤로 나갔다 와도)
                    )
                }
                if (!handHeld) {
                // 🌊 방금 스크롤 — 흐르는 목록은 누르지 않고 곧 다시 읽는다(주 판정은 배차망의 누르기 직전 Y 차이 · 이것은 덧)
                val plugin = com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp)
                // 👆 누르기 전 안전 확인과 누를 자리는 배차망이 정한다 (픽커: 오더카드를 피한다)
                val tap = if (scrollGate.scrolledRecently(android.os.SystemClock.elapsedRealtime())) null else plugin.planListTap(allNodes, order, fareNode)
                if (tap == null) {
                    openBlocked = if (scrollGate.scrolledRecently(android.os.SystemClock.elapsedRealtime())) com.onedal.app.core.OpenBlocked.LIST_MOVING
                        else plugin.lastHoldKey ?: com.onedal.app.core.OpenBlocked.HELD
                    if (openBlocked == com.onedal.app.core.OpenBlocked.LIST_MOVING)
                        waitBook.schedule("흐르는 목록 다시 읽기", com.onedal.app.core.WaitBook.LIST, com.onedal.app.core.ScrollGate.QUIET_MS) { reservedRead("흐르는 목록") }
                }
                if (tap != null) {
                    /**
                     * 📬 **누르기로 정했으면 메인 줄 맨 뒤로 한 번 넘긴다** (onedal-1f 대안 · 라이브 10-01 00:31:20).
                     * 접근성 알림은 같은 메인 줄로 온다 — 목록 읽기(~900ms) 동안 쌓인 스크롤 알림이 먼저 처리되어 onHand 가 걸린다.
                     * 넘겨받은 쪽이 목록 화면 · 누르는 중 · 손 먼저(알림 시각) · 흐르는 목록(요금 칸 다시 잼)을 다시 보고 괜찮을 때만 쏜다.
                     * 목록 몫 기다림이라 넘기는 사이 목록을 떠나면 거둬진다.
                     */
                    waitBook.schedule("누르기 넘김", com.onedal.app.core.WaitBook.LIST, 0L) handoff@{
                        val nowTap = android.os.SystemClock.elapsedRealtime()
                        val nowY = fareNode.node?.takeIf { it.refresh() }?.let { n -> android.graphics.Rect().also { n.getBoundsInScreen(it) }.centerY() }
                        val stop: Pair<String, String>? = when {
                            telemetryManager.currentScreenContext != ScreenContext.LIST -> "목록이 아니다" to com.onedal.app.core.OpenBlocked.TAP_RECHECK
                            session.openedByApp || touchManager.tapPending -> "이미 누르는 중" to com.onedal.app.core.OpenBlocked.BUSY
                            handFirst.blocks(nowTap) -> "손 먼저(넘기는 사이 처리된 손 흔적 · $lastHandWhy)" to com.onedal.app.core.OpenBlocked.HAND_FIRST
                            com.onedal.app.core.EvaluatingNow.of(
                                getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE).let { p -> if (p.contains(com.onedal.app.core.EvaluatingNow.PREF_KEY)) p.getBoolean(com.onedal.app.core.EvaluatingNow.PREF_KEY, false) else null },
                                savedFilter().evaluatingNow) -> "앞 콜 심사 중(넘기는 사이 결재 대기)" to com.onedal.app.core.OpenBlocked.EVALUATING
                            nowY == null -> "요금 칸을 다시 못 읽었다" to com.onedal.app.core.OpenBlocked.TAP_RECHECK
                            com.onedal.app.core.TapShift.listMoving(fareNode.rect.centerY(), nowY, scrollGate.scrolledRecently(nowTap)) ->
                                "목록이 움직이는 중(스캔 Y=${fareNode.rect.centerY()} · 지금 Y=$nowY)" to com.onedal.app.core.OpenBlocked.LIST_MOVING
                            else -> null
                        }
                        if (stop != null) {
                            AppLogger.i("1DAL_ALARM", LogTag.TAP, "✋ [누르기 넘김 뒤 멈춤] ${order.fare}원 — ${stop.first}")
                            telemetryManager.openBlocked = stop.second
                            if (stop.second == com.onedal.app.core.OpenBlocked.HAND_FIRST) handFirst.hold(nowTap)
                            if (stop.second == com.onedal.app.core.OpenBlocked.LIST_MOVING)
                                waitBook.schedule("흐르는 목록 다시 읽기", com.onedal.app.core.WaitBook.LIST, com.onedal.app.core.ScrollGate.QUIET_MS) { reservedRead("흐르는 목록") }
                            return@handoff
                        }
                        // 🔁 넘겨받은 쪽이 배차망의 누르기 전 안전 확인을 그대로 다시 거친다(오더카드·머리줄·띠·탭 줄 · 창 재검색) — ab 리뷰
                        // 🔁 넘겨받은 순간 화면을 새로 읽는다(목록 읽기 ~900ms 묵은 노드 대신) — 같은 요금 노드를 지금 Y 로 찾는다
                        val fresh = freshScreenNodes()
                        val freshFare = fresh?.filter { it.text == fareNode.text }?.minByOrNull { kotlin.math.abs(it.rect.centerY() - nowY!!) }
                        if (fresh == null || freshFare == null) {
                            AppLogger.i("1DAL_ALARM", LogTag.TAP, "✋ [누르기 넘김 뒤 멈춤] ${order.fare}원 — 새로 읽은 화면에 그 줄이 없다")
                            telemetryManager.openBlocked = com.onedal.app.core.OpenBlocked.TAP_RECHECK
                            return@handoff
                        }
                        val tap2 = plugin.planListTap(fresh, order, freshFare) ?: run {
                            val key = plugin.lastHoldKey ?: com.onedal.app.core.OpenBlocked.HELD
                            AppLogger.i("1DAL_ALARM", LogTag.TAP, "✋ [누르기 넘김 뒤 멈춤] ${order.fare}원 — 안전 확인 다시($key)")
                            telemetryManager.openBlocked = key
                            if (key == com.onedal.app.core.OpenBlocked.LIST_MOVING)
                                waitBook.schedule("흐르는 목록 다시 읽기", com.onedal.app.core.WaitBook.LIST, com.onedal.app.core.ScrollGate.QUIET_MS) { reservedRead("흐르는 목록") }
                            return@handoff
                        }
                        /* ✍️ 앱이 계약하나 — 진입 줄과 세션 칸이 같은 값 하나를 쓴다(자동이어도 내일 콜이면 기사님 확정 · `appContractsOnOpen`) */
                        val willContract = com.onedal.app.core.engine.appContractsOnOpen(currentMode, order)
                        AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🚪 [상세 진입] ${order.fare}원 (${order.pickup.take(10)}→${order.dropoff.take(10)}) " +
                            "모드 $currentMode — ${com.onedal.app.core.engine.openPlanText(currentMode, willContract)} · 결재가 없으면 돌아오는 시간 뒤 목록으로")
                        AppLogger.d(TAG, LogTag.TAP, "💥 [$currentMode] 꿀콜 조건 통과! 요금 최고 콜 터치 진행!")
                        alarmTapAtMs = android.os.SystemClock.elapsedRealtime()   // 🔎 `[상세 대기]` 로그의 «연 쪽» 기록용
                        val fired = touchManager.performSimulatedTouch(freshFare.node, tapRowLeft = tap2.rowLeft, delayMs = tap2.delayMs, tapDy = tap2.dy,
                            tapKey = "call:${CallMemory.fingerprintOf(order)}")   // 👆 같은 콜을 진행 중에 또 누르지 않는다 — 열쇠는 콜 지문
                        if (!fired) {
                            telemetryManager.openBlocked = com.onedal.app.core.OpenBlocked.TAP_NOT_SENT
                            // 🛑 누르기가 실패했다(노드가 사라짐 · 좌표를 못 구함) — 세션을 세우지도, 기억에 넣지도 않는다.
                            //    세우면 화면은 목록 그대로라 «목록으로 돌아왔다» 리셋이 안 오고 다음 스캔부터 아무 콜도 못 누른다
                            AppLogger.w("1DAL_ALARM", LogTag.TAP, "🛑 [진입 실패] ${order.fare}원 — 누르기가 안 됐다. 이번 스캔은 손대지 않고 다음 스캔에 다시 본다")
                        }
                        if (fired) {
                            /**
                             * 📝 **누른 콜을 기억에 넣는다** — 앱이 들어간 콜만 기억한다(기사님 확정).
                             * 누르기는 이 자리에서 바로 끝나고(동기), 목록 이벤트는 같은 줄 뒤에 오므로 그 사이에 끼지 않는다.
                             * 넣지 않으면 목록으로 돌아오자마자 처음 보는 콜로 또 눌린다.
                             * 🔴 «눌렀다»는 필터 버전이 바뀌어도 안 지워진다 (`CallMemory.markEvaluated`).
                             */
                            callMemory.markEvaluated(orderHash)
                            alarmedRoutes.markOpened(order, android.os.SystemClock.elapsedRealtime())   // 🔔 요금만 올라도 다시 안 연다
                            session.openedByApp = true // 콜 잡기 시작!
                            // ✍️ 계약 버튼은 자동 모드 · 오늘 콜에서만 — 위 진입 줄과 같은 값 · 📅 상세에서 한 번 더: `appPressesAccept`
                            session.contractedByApp = willContract
                            session.setOrderId(order.id)
                            session.lastDetailOrder = order // [오파싱 방지] 상세 진입 후 사용할 원본 데이터 쥐어주기
                            /**
                             * 🎯 **찍는 그 카드를 쥐여 둔다** — 앱이 직접 누르고 들어가는 판이라 어느 콜인지 이미 안다.
                             * 픽커 사진 읽기가 이 카드와 엄격히 대조한다 (`detailOpener` 가 «알람이 연 상세»로 가른다).
                             */
                            session.alarmTappedCard = order
                            session.alarmTappedAtMs = alarmTapAtMs
                            session.alarmFoundAtMs = listReadAtMs
                            session.alarmTappedScreen = telemetryManager.currentScreenContext   // 🧾 누른 화면 — «먼저 가져감» 기록의 화면 칸
                            session.alarmTappedPage = lastScreenRead?.page
                            // 📊 서버 보고는 루프에서 이미 했다 (`markReportedOnce`) — 여기서 다시 보내지 않는다
                        }
                    }
                }
                }   // ✋ 누르기만 손 문 안
            }
        }
        telemetryManager.openBlocked = openBlocked   // 🚧 열었거나 통과 콜이 없으면 null
        if (scanOrders.isNotEmpty()) alarmedRoutes.seen(scanOrders, nowMs)   // 카드 0장 틀은 «안 보였다»가 아니다
        // 🔔 알람 테두리 — 가리키던 콜이 이번 스캔에 없으면 걷는다 (잡혔거나 남이 가져감 · §6-③)
        alarmSignaler.onScan(scanHashes)

        telemetryManager.screenNodeCount = allNodes.size
        /**
         * 👁️ **성적표를 서버로 넘긴다.** 앱 안에서만 알면 화면은 여전히 모른다 —
         *    기사님이 매번 로그를 여셔야 했던 이유가 그것이다.
         */
        telemetryManager.filterTally = tally

        // 메모리 관리 (지문 장부는 CallMemory 가 스스로 자른다)
        if (recentListOrders.size > RECENT_LIST_ORDERS_MAX) {
            val keepers = recentListOrders.takeLast(RECENT_LIST_ORDERS_KEEP)
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
     * 상세 처리의 공통 순서에서 부른다 — 인성은 팝업 3장으로 채운 뒤, 2차 필터를 지나고 나서(배차망_모드표.md 순서 ⑥).
     * 같은 요청을 두 벌로 적으면 한쪽만 고쳐져 갈라지므로 여기 하나만 둔다.
     *
     * 🔴 `isDetailScrapSent` 가 중복 전송을 막는다 — 미리보기 상세 수집이 끝나 상세 화면으로
     *    돌아왔을 때 이 함수가 다시 불리지 않게 하는 자물쇠이기도 하다.
     */
    override fun sendConfirmOnce(order: SimplifiedOfficeOrder, rawScreenStr: String) {
        if (session.isDetailScrapSent) return

        // ✅ 앱이 계약 버튼을 누르는 콜만 AUTO, 나머지는 전부 MANUAL
        val actualMatchType = session.clickOrigin
        apiClient.sendConfirm(
            DispatchBasicRequest(
                step = "BASIC",
                deviceId = apiClient.getDeviceId(),
                order = order,
                capturedAt = order.timestamp,
                matchType = actualMatchType,
                targetApp = currentTargetApp,
                openedByApp = session.openedByApp,   // 👆 앱이 목록에서 눌러 연 상세인가 — 서버가 판정 뒤 접기를 가른다(보호 분기와 따로)
                // 잡은 방식(자동·알람·직접) — 원장 기록 전용, 파생은 SessionManager 한 곳 (#75)
                capturedVia = session.capturedVia(effectiveMode),
                isPreview = session.isPreview,
                source = TargetApp.sourceOf(telemetryManager.screenPackage),   // 🏷️ 목록 보고와 같은 한 칸 (통계는 실물만 센다)
            )
        )
        AppLogger.d(TAG, LogTag.NETWORK, "📤 [post /confirm request] 서버 전송 내용 -> 모드: $actualMatchType (스위치: ${telemetryManager.currentMode}, 매크로클릭: ${session.contractedByApp}, 미리보기: ${session.isPreview}) | 텍스트: ${rawScreenStr.take(150)}...")
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
                matchType = session.clickOrigin,
                targetApp = currentTargetApp,
                isPreview = session.isPreview,
            )

            // 서버 응답("KEEP", "CANCEL") 대기를 위한 안전취소 타이머 가동
            startSafeCancelTimer()

            val actualMatchType = session.clickOrigin
            val previewStr = session.accumulatedDetailText.replace("\n", " ").take(150)
            AppLogger.d(TAG, LogTag.NETWORK, "🌐 [post /detail request] $actualMatchType 모드 판결 요청 텍스트: $previewStr...")

            // Option B (Piggyback V2): sendDetail은 202 응답만 확인하고 곧바로 리턴됨.
            // 실제 판결은 Telemetry 1.0초 폴링을 통해 decisionCallback으로 들어오게 됨.
            //
            /**
             * 🔴 **전송이 실패하면 기다리지 않고 바로 뱉는다** (기사님 확정).
             *
             * `ApiClient.sendDetail` 은 실패 시(비2xx · 재시도 소진 · 예외) `CANCEL` 을 준다.
             * 이 콜백을 버리고 30초 안전취소 타이머에 맡기면 그 대기가 **버는 것 없이 잃기만** 한다
             * (실패 경로를 잰 값):
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
     * 그 배차망 정의 표(`…Pages.screens`)의 차례대로 처음 맞는 페이지가 답이다(`ScreenDetector` · reviews/35).
     * 표가 모르는 화면이면 패키지로 바탕화면 · 배차망 밖 앱을 가린다.
     * 붙는 순간 화면은 건너뛰는 덧칸(로딩)을 보지 않고 페이지 값을 쓴다 — «본 것»을 말한다.
     */
    private fun readScreen(text: String): com.onedal.app.core.engine.ScreenRead =
        screenDetector.detect(text, com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).screens, lastScreenRead?.page)

    private fun contextOf(read: com.onedal.app.core.engine.ScreenRead, pkg: String?): ScreenContext {
        if (read.context != ScreenContext.UNKNOWN) return read.context
        val currentPlugin = com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp)

        if (pkg != null) {
            val p = pkg.lowercase()
            if (p.contains("launcher") || p.contains("nexuslauncher") || p == "com.sec.android.app.launcher") {
                return ScreenContext.LAUNCHER
            }
            val isSimulator = p == TargetApp.SIMULATOR_PACKAGE.lowercase() || p.contains("simulator")
            val isTargetApp = isSimulator || currentPlugin.isTargetPackage(p)
            if (!isTargetApp && p != "com.onedal.app") {
                return ScreenContext.OTHER_APP
            }
        }
        return ScreenContext.UNKNOWN
    }

    /** 📄 «어느 배차망의 어느 페이지 · 그 위에 뜬 것»을 바뀔 때만 한 줄 */
    /** 🧭 마지막으로 알아본 화면 — 배차망 페이지 이름(없으면 화면 값) · 모르는 화면 보고의 «직전»(`UnknownScreenReport.entryOf`) */
    private var lastKnownScreen: String? = null

    private fun logPageChange(read: com.onedal.app.core.engine.ScreenRead, detected: ScreenContext) {
        val key = "${currentTargetApp}|${read.page}|${read.overlay}|${detected}"
        if (key == lastPageKey) return
        lastPageKey = key
        AppLogger.i(TAG, LogTag.SCREEN, "📄 [페이지] ${keywords.appLabel} ${read.page ?: "표에 없음"}${read.overlay?.let { " + $it" } ?: ""} → ${detected.name}")
    }

    /**
     * 📡 화면 값을 정하고 서버에 알린다 — 원달앱 안 값(`context`)과 서버로 보내는 값(페이지 값 · 페이지 이름 · 덧칸 이름)을 함께.
     * 표가 모르는 화면(바탕화면 · 배차망 밖 · 모름)은 보내는 값도 그 값이고 이름은 없다 (reviews/35 5단계).
     */
    private fun updateScreenContext(context: ScreenContext, read: com.onedal.app.core.engine.ScreenRead?) {
        val known = read != null && read.context != ScreenContext.UNKNOWN
        val wire = if (known) read!!.wire else context
        val page = if (known) read!!.page else null
        val overlay = if (known) read!!.overlay else null
        val changed = telemetryManager.currentScreenContext != context || telemetryManager.reportedScreen != wire ||
            telemetryManager.screenPage != page || telemetryManager.screenOverlay != overlay
        telemetryManager.currentScreenContext = context
        telemetryManager.reportedScreen = wire
        telemetryManager.screenPage = page
        telemetryManager.screenOverlay = overlay
        // 화면 상태가 변경되면 즉각적으로 상태를 서버에 보고 (카톡 켰을 때 UNKNOWN 등 즉각 반영)
        if (changed) telemetryManager.forceFlushEvent()
    }

    // ════════════════════════════════════════════════════════════════
    //  AUTO 제어 및 비상 복구 유틸리티
    // ════════════════════════════════════════════════════════════════

    /** 서버 응답 대기용 안전취소 타이머 시작 (응답 없으면 자동 취소) */
    private fun startSafeCancelTimer() {
        // ⏱️ 그 배차망의 안전취소 시간 (서버 DB) — 픽커는 안전취소가 없어 타이머를 걸지 않는다
        val timeoutMs = com.onedal.app.core.engine.WaitTimes.safeCancelMs(savedFilter(), currentTargetApp) ?: return
        telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.SAFE_CANCEL, true)  // [Piggyback V2] 1.0초 단위 강제 무전 타격 시작!
        safeCancelTimer.start(timeoutMs, session) {
            sendEmergencyReport(EmergencyReason.AUTO_CANCEL, "안전취소 응답 없음 강제취소")
            executeDecisionImmediately("CANCEL")
        }
    }

    private fun cancelSafeCancelTimer() {
        safeCancelTimer.cancel(session)
        telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.SAFE_CANCEL, false) // [Piggyback V2] 짧은 무전 해제
    }

    /** 서버 판결(KEEP/CANCEL) 결과 행동을 실제 화면 액션으로 쏨 */
    private fun executeDecisionImmediately(decision: String) {
        cancelSafeCancelTimer() // 타이머 해제
        // ⏱️ 기사님이 손으로 연 상세 — 결재가 오면 머문다(판정을 보고 기사님이 누르신다). 앱이 연 콜은 아래에서 정한다
        if (!session.openedByApp) cancelDetailBack()

        // 🐥 [가상 체험 모드] 판결이 KEEP/CANCEL이어도 실제 수락/취소 버튼을 누르지 않고 안전하게 뒤로가기(Back) 집행!
        val isSimulated = decision == "SIMULATED_KEEP" || decision == "SIMULATED_CANCEL" || effectiveMode == "SIMULATION"
        if (isSimulated) {
            AppLogger.roadmap(LogTag.DECISION, "🐥 [체험 모드] 관제탑 판결 $decision 수신 → 안전한 뒤로가기(Back) 집행", telemetryManager.currentScreenContext.name)
            AppLogger.d(TAG, LogTag.DECISION, "🐥 [체험] 실서버 버튼을 누르지 않고 GLOBAL_ACTION_BACK 실행")
            waitBook.schedule("체험 결재 뒤 뒤로", com.onedal.app.core.WaitBook.SESSION, 300) {
                performGlobalAction(GLOBAL_ACTION_BACK)
                resetSessionState()
                AppLogger.roadmap(LogTag.DECISION, "✅ [체험] 뒤로가기 완료 → 리스트 복귀, 합짐 콜 스캔 대기", telemetryManager.currentScreenContext.name)
            }
            return
        }

        /**
         * 🧹 **취소로 끝났으면 «눌렀다» 에서 «막았다» 로 내린다** (기사님 · 실주행 시흥동) — 내리는 곳은 여기 한 곳.
         *
         * 앱은 콜을 누를 때 지문을 «눌렀다»로 기억한다 — 반송돼도 또 누르지 않으려는 것이다. 그런데 그 뜻은
         * **그 콜이 살아 있는 동안**만 맞다. 취소로 끝난 콜은 다시 판정받을 자격이 있다 — 길이 바뀌면 답도 바뀐다.
         * 🔴 안 내리면 필터가 아무리 바뀌어도 영영 안 본다 — 한 번 누른 뒤 필터가 93번 바뀌었는데도 다시 판정하지 않아
         *    좋은 콜을 그대로 지나친 적이 있다. 기억에서 아예 빼지는 않는다(`CallMemory.demoteActed`).
         * 🔴 **KEEP 은 안 내린다** — 잡은 콜을 또 누르면 사고다. 판결을 아는 곳이 여기라 조건을 여기 둔다.
         * 🔴 지문은 **누를 때 쥔 카드**(`alarmTappedCard`)로 뜬다 — 기억에 넣은 줄과 같은 블록에서 같은 콜로 세워진다.
         *    상세 처리의 콜(`lastDetailOrder`)은 픽커에서 사진 글자로 덮여 지문이 달라진다. 카드가 없으면 앱이 안 누른 콜이라
         *    기억에도 없어 내릴 것이 없다.
         */
        if (decision != "KEEP") demoteTappedCall("결재 $decision")

        /**
         * ↩️ **앱이 열었지만 계약하지 않는 콜(알람 등)** — 기사님 결정 (배차망_모드표.md 순서 ⑩).
         * CANCEL 이면 바로 목록으로 돌아온다 — 나쁜 콜 상세에 머물면 운전 중인 기사님이 목록을 못 본다.
         * KEEP 이면 돌아오는 타이머를 그대로 둔다 — 남은 시간 동안 기사님이 판정을 보고 확정·수락하신다.
         * 🔴 기사님이 손으로 연 상세(`openedByApp` 거짓)는 CANCEL 이 와도 뒤로 가지 않는다 — 기사님이 안 누른 방향이다.
         */
        if (!session.contractedByApp) {
            if (session.openedByApp && decision == "CANCEL") {
                AppLogger.i(com.onedal.app.plugins.DispatchPluginRegistry.get(currentTargetApp).logTag, LogTag.DECISION, "↩️ [결재 CANCEL] 앱이 연 콜 — 바로 목록으로 돌아온다")
                waitBook.schedule("결재 CANCEL 뒤 뒤로", com.onedal.app.core.WaitBook.SESSION, 300) {
                    if (telemetryManager.currentScreenContext == ScreenContext.DETAIL_PRE_CONFIRM) {
                        lastBackAtMs = android.os.SystemClock.elapsedRealtime()
                        touchManager.performBack("결재 CANCEL")
                    }
                    resetSessionState()
                }
            }
            return // 앱이 계약하지 않은 콜은 버튼을 누르지 않는다
        }

        val targetBtnStr = if (decision == "KEEP") "닫기" else "취소"
        AppLogger.roadmap(LogTag.DECISION, "🛡️ 관제탑 판결 수신 (Action: $decision) → '$targetBtnStr' 버튼 클릭 집행 개시", telemetryManager.currentScreenContext.name)
        AppLogger.d(TAG, LogTag.DECISION, "⚡ 판결 집행: 행동=$decision, 누를버튼=$targetBtnStr (버튼클릭을 시작합니다), 500ms 지연")
        
        // ⏳ 결재 몫 — «취소» 누름이 곧 계약 취소라, 그 사이 콜이 끝나도(목록 오탐 리셋) 거두지 않는다
        val firstAtMs = android.os.SystemClock.elapsedRealtime() + 500
        val screenAtFirst = telemetryManager.currentScreenContext
        val orderAtFirst = session.currentOrderId
        waitBook.schedule("결재 버튼", com.onedal.app.core.WaitBook.DECISION, 500) {
            pressDecisionButton(decision, targetBtnStr, firstAtMs, screenAtFirst, orderAtFirst, waited = false)
        }
    }

    /** 👆 상세 안 기사님 손의 마지막 시각(누름 · 스크롤) — KEEP «닫기»가 기다릴지 본다 (`KeepCloseWait`) */
    private var lastDetailHandAtMs = 0L

    /**
     * 🛡️ **결재 버튼 한 번 누르기** — KEEP «닫기»는 기사님 손이 상세에 있으면 멈출 때까지(최대 3초) 같은 이름으로 다시 건다.
     * 다시 걸었다 누를 때는 화면·콜을 다시 본다 — 그사이 상세를 떠났거나 다른 콜이면 누르지 않는다(`KeepCloseWait.skipWhy`).
     */
    private fun pressDecisionButton(decision: String, targetBtnStr: String, firstAtMs: Long,
                                    screenAtFirst: ScreenContext, orderAtFirst: String, waited: Boolean) {
        val now = android.os.SystemClock.elapsedRealtime()
        if (waited) com.onedal.app.core.KeepCloseWait.skipWhy(screenAtFirst, telemetryManager.currentScreenContext, orderAtFirst, session.currentOrderId)?.let { why ->
            AppLogger.i(TAG, LogTag.DECISION, "⏭️ [닫기 건너뜀] $why — 누르지 않는다")
            return
        }
        val wait = if (decision == "KEEP") KeepCloseWait.waitMs(now, firstAtMs, lastDetailHandAtMs) else null
        if (wait != null) {
            AppLogger.i(TAG, LogTag.DECISION, "⏳ [닫기 미룸] 상세 손 ${now - lastDetailHandAtMs}ms 전 · ${wait}ms 뒤 다시")
            waitBook.schedule("결재 버튼", com.onedal.app.core.WaitBook.DECISION, wait) {
                pressDecisionButton(decision, targetBtnStr, firstAtMs, screenAtFirst, orderAtFirst, waited = true)
            }
            return
        }
        if (decision == "KEEP" && now >= firstAtMs + KeepCloseWait.MAX_MS && now - lastDetailHandAtMs < KeepCloseWait.QUIET_MS)
            AppLogger.i(TAG, LogTag.DECISION, "👆 [닫기] 손이 계속 있어 ${KeepCloseWait.MAX_MS / 1000}초 뒤 누름")
        val rootNode = rootInActiveWindow
        if (rootNode == null) {
            resetSessionState()
            return
        }
        if (touchManager.findAndClickByText(rootNode, targetBtnStr, isStartsWith = false, currentMode = effectiveMode)) {
            touchManager.noteAppLeft()   // 🚪 결재 버튼으로 떠난 목록 복귀는 기사님 손이 아니다
            if (decision == "KEEP") {
                AppLogger.roadmap(LogTag.DECISION, "✅ 판결 KEEP 집행 완료 → [Current Page: LIST] 복귀, 락 해제, 합짐 콜 잡기 루프 회귀", telemetryManager.currentScreenContext.name)
            } else {
                AppLogger.roadmap(LogTag.DECISION, "❌ 판결 CANCEL 집행 완료 → [Current Page: LIST] 복귀, 락 해제, 기존 모드 루프 회귀", telemetryManager.currentScreenContext.name)
            }
            AppLogger.d(TAG, LogTag.DECISION, "🎉 행동 완료! 타겟($targetBtnStr) 명중.")
        } else {
            AppLogger.e(TAG, "❌ 대상 버튼($targetBtnStr)을 찾을 수 없음.")
            sendEmergencyReport(EmergencyReason.BUTTON_NOT_FOUND, "판결 $decision 의 대상 $targetBtnStr 버튼 누락")
        }
        /**
         * 🛡️ **세션은 버튼을 누른 뒤에 비운다** (18번 1.1.9 · 코드리뷰 C-2).
         *    500ms 콜백 밖에서 즉시 비우면 ① 버튼을 못 찾았을 때 위 비상 보고의 콜 id 가 이미 비어
         *    `unknown` 으로 나가고 ② 그 500ms 동안 «잡는 중이 아님»이라 다음 스캔이 끼어들며
         *    ③ 서버는 버튼이 눌리기도 전에 «리스트로 돌아왔다»(홀드 해제)를 받는다.
         *    눌렀든 못 찾았든 여기 한 곳이다 — 검사: `DecisionExecutionTest`.
         */
        resetSessionState()
        rootNode.recycle()
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
        cancelDetailBack()   // ⏱️ 콜이 끝났다 — 상세 대기 타이머도 이 한 곳에서 끈다 (#124)
        // ⏳ 콜이 끝났다 — 이 콜이 건 기다림(세션 몫)을 한 번에 거둔다. 손 클릭 AUTO 1초 보고는 거두면서 끈다
        waitBook.cancelOwner(com.onedal.app.core.WaitBook.SESSION).takeIf { it.isNotEmpty() }
            ?.let { AppLogger.d(TAG, LogTag.SCREEN, "⏳ [기다림 거둠] 세션 — ${it.joinToString(" · ")}") }
        telemetryManager.setFastPoll(com.onedal.app.core.PollOwners.HAND_AUTO, false)
        session.reset {
            cancelSafeCancelTimer()
            telemetryManager.isHolding = false  // [Page/Hold 분리] 리스트 복귀 → 콜 잡기 모드
            telemetryManager.forceFlushEvent()  // 즉시 서버에 홀드 해제 알림
        }
    }

    /** 세션 ID가 없으면 새로 생성 — 접두사는 **출신**이지 기기 모드가 아니다 */
    override fun ensureSessionId() {
        session.ensureOrderId()
    }

    /**
     * 앱별 확정 버튼 텍스트 리스트 중 첫 번째로 발견되는 버튼을 클릭합니다.
     * 목록은 배차망 플러그인의 `acceptButtons` 가 정한다 — 여기 손으로 적지 않는다.
     * ⚠️ 인성은 둘이다("확정"·"배차").
     */
    override fun clickFirstMatchingButton(rootNode: AccessibilityNodeInfo, buttonTexts: List<String>): Boolean {
        for (btnText in buttonTexts) {
            if (touchManager.findAndClickByText(rootNode, btnText, isStartsWith = true)) {
                AppLogger.d(TAG, LogTag.TAP, "✅ 버튼 '$btnText' 클릭 성공!")
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

        com.onedal.app.core.NodeText.clean(node.text)?.let { out.add(it) }
        com.onedal.app.core.NodeText.clean(node.contentDescription)?.let { out.add(it) }
        for (i in 0 until node.childCount) gatherNodeTexts(node.getChild(i), out)
    }

    /**
     * 🌳 **화면 나무 한 번 훑기** — 지문 글자(`NodeText.textsOf`)와 목록 좌표 노드(`NodeText.textNodesOf`)를 이 한 벌에서 만든다.
     * 두 번 훑으면 노드마다 접근성 통신(getChild)이 두 배다(목록 한 번 300~500ms · 실물 09-30 18:36). 우리 앱 노드는 건너뛴다.
     */
    private fun collectNodes(node: AccessibilityNodeInfo?, out: MutableList<com.onedal.app.core.RawNode>, prefetch: Boolean = false) {
        if (node == null) return
        if (node.packageName?.toString() == "com.onedal.app") return
        val text = node.text
        val desc = node.contentDescription
        if (!text.isNullOrBlank() || !desc.isNullOrBlank()) {
            val rect = Rect()
            node.getBoundsInScreen(rect)
            out.add(com.onedal.app.core.RawNode(text, desc, rect.left, rect.top, rect.right, rect.bottom, node, rect))
        }
        for (i in 0 until node.childCount) {
            val child = if (prefetch && android.os.Build.VERSION.SDK_INT >= com.onedal.app.core.WalkProbe.PREFETCH_MIN_SDK)
                node.getChild(i, PREFETCH_FLAGS) else node.getChild(i)
            collectNodes(child, out, prefetch)
        }
    }
}


