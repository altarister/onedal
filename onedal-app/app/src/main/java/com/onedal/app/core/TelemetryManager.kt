package com.onedal.app.core

import android.os.Handler
import android.os.Looper
import android.content.Context
import android.location.LocationManager
import com.onedal.app.core.AppLogger
import com.onedal.app.api.ApiClient
import com.onedal.app.models.ScrapPayload
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.models.ScreenContext

/**
 * 이벤트 기반 즉각 스크랩 전송 및 **60초** 주기 생존신고(Heartbeat) 관리.
 * (판결 대기 중에는 1초 — `FAST_POLLING_MS`. 값의 원천은 아래 상수다)
 */
class TelemetryManager(
    private val apiClient: ApiClient,
    private val context: Context? = null  // [GPS 텔레메트리] 위치 조회용
) {

    companion object {
        private const val TAG = "1DAL_TELEMETRY"
        private const val HEARTBEAT_INTERVAL_MS = 60000L // 60초 (빈 통신)
        private const val FAST_POLLING_MS = 1000L // 1.0초 (관제탑 결재 대기 시 короткий 폴링)
        private const val DEBOUNCE_MS = 300L // 콜 수집 후 모아쏘기 위한 디바운스 대기시간
    }

    private val scrapBuffer = mutableListOf<SimplifiedOfficeOrder>()

    /**
     * 🐢 **«예약한 발사가 제때 깨어났나»를 재는 자리** (기사님 실측 2026-09-02).
     *
     * 같은 «리스트 → 홈» 전환인데 어떤 때는 0.23초, 어떤 때는 **8.1초**가 걸렸다.
     * 그 8초 동안 앱 로그가 한 줄도 없어서, **늦게 깨어난 것인지 깨어나서 안에서
     * 걸린 것인지 구분할 수가 없었다** — flush 첫머리에 로그가 없었기 때문이다.
     * 후보 넷(GPS 조회·로그 전송·이벤트 폭주·시계 어긋남)은 이미 지웠다.
     */
    private var flushScheduledAt = 0L
    private var flushRequestedDelayMs = 0L

    private fun scheduleFlush(delayMs: Long) {
        handler.removeCallbacks(eventFlushRunnable)
        flushScheduledAt = android.os.SystemClock.elapsedRealtime()
        flushRequestedDelayMs = delayMs
        handler.postDelayed(eventFlushRunnable, delayMs)
    }
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false

    // [Safety Mode V3] 현재 화면 상태 (HijackService에서 상태 전이 시 업데이트)
    @Volatile
    var currentScreenContext: ScreenContext = ScreenContext.UNKNOWN

    // [Page/Hold 분리] 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀)
    @Volatile
    var isHolding: Boolean = false

    /**
     * 👁️ **마지막 리스트 화면에서 읽은 텍스트 노드 수** (2026-08-22 · 크리티컬).
     *
     * 콜 0건이 **리스트가 빈 것**인지 **못 읽는 것**인지 가르는 유일한 단서다.
     * 기사님이 겪은 일: 접근성이 막혔는데 관제웹은 파란불 — 텔레메트리가 계속 갔기 때문이다.
     * `null` 은 "아직 리스트를 본 적 없음"이고 `0` 은 **접근성 트리가 안 온다**는 뜻이다.
     */
    @Volatile
    var screenNodeCount: Int? = null

    /**
     * 👁️ **마지막 스캔의 필터 성적표** (기사님 확정 2026-08-23).
     *
     * `data` 건수는 *"앱이 살아 있다"* 까지만 말한다. **왜 하나도 안 잡는지**는 이 값이 말한다.
     * 리스트 스캔이 매번 새로 채워 넣는다 — 누적이 아니라 **지금 화면의 스냅샷**이다.
     */
    var filterTally: com.onedal.app.models.FilterTally? = null

    /**
     * 💤 **폰 화면이 켜져 있는가** (기사님 확정 2026-08-22).
     *
     * 접근성 스크래핑은 화면이 켜져 있어야 배차망 화면을 읽는다. 화면이 꺼지면 앱은
     * 살아 있어도 **콜을 잡을 수 없다** — 그런데 관제웹은 녹색이었다.
     *
     * 🔴 예전에는 `Screen Off` 이벤트로 `sendOffline()` 을 **한 번** 보내고 끝이었다.
     *    그러면 60초 뒤 하트비트가 `status = "ONLINE"` 으로 되돌려 버린다.
     *    **사실을 매번 실어 보내면 서버가 추측할 일이 없다** (규칙 ③).
     */
    @Volatile
    var isScreenOn: Boolean = true

    // [Piggyback V2] 관제탑 결재 대기 여부 (1.0초 단위 Short Polling 발동 조건)
    var isWaitingDecision: Boolean = false
        set(value) {
            val changed = field != value
            field = value
            if (changed) resetHeartbeatTimer()
        }

    // [Piggyback V2] 결재 수신 콜백
    var decisionCallback: ((String, String) -> Unit)? = null

    /**
     * 🔴 **여기서 «보내기 직전에 화면을 다시 읽기»를 하지 않는다 — 해 봤고, 안 된다** (2026-09-02).
     *
     * 앱 → 서버는 POST 뿐이라 **보내는 그 순간이 유일한 기회**다(기사님 확인:
     * *"post 방식의 통신을 하고 있어서 요청하지 않으면 변하지 않는 것도 알고 있는 거지?"*).
     * 그래서 여기서 화면을 다시 읽어 싣는 고리(`rescanCallback`)를 넣었다가 **되돌렸다.**
     *
     * 안드로이드 접근성은 화면을 캐시하고 **이벤트가 와야** 버린다 — 이벤트 없이 읽으면
     * **아까 그 화면**을 준다. 그러니 여기서 다시 읽어도 같은 값이 실린다.
     * 자세한 실측과 대안은 `HijackService.onAccessibilityEvent` 의 «모름» 분기 주석에.
     */
    // 하트비트용 (주기적)
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            if (isRunning) {
                flush(isHeartbeat = true) // 버퍼가 비어있어도 생존신고를 위해 발송
            }
        }
    }

    // 디바운스용 (이벤트 기반)
    private val eventFlushRunnable = Runnable {
        if (isRunning) {
            flush(isHeartbeat = false)
        }
    }

    fun start() {
        if (isRunning) return
        isRunning = true
        resetHeartbeatTimer()
        AppLogger.i(TAG, "Telemetry Loop Started (Event-driven + 60s Keep-alive)")
    }

    fun stop() {
        isRunning = false
        handler.removeCallbacks(heartbeatRunnable)
        handler.removeCallbacks(eventFlushRunnable)
        AppLogger.i(TAG, "Telemetry Loop Stopped")
    }

    /**
     * 버퍼에 콜 데이터를 쌓음 (Thread-safe)
     * 수집 시점에 즉각 발송되도록 타이머 조작
     */
    fun enqueue(order: SimplifiedOfficeOrder) {
        synchronized(scrapBuffer) {
            scrapBuffer.add(order)
        }
        
        // 데이터가 들어오면 300ms 뒤에 한꺼번에 쏘도록 디바운스 세팅
        scheduleFlush(DEBOUNCE_MS)
    }

    /**
     * 👀 **화면이 바뀐 보고는 예약하지 않는다 — 그 자리에서 보낸다** (2026-09-02 실측으로 확정).
     *
     * 예전엔 200ms 뒤로 예약했다(로딩 잔상으로 폭격되는 것을 막으려고). 그런데 **안드로이드가
     * 그 예약을 제때 안 깨워 준다** — 계측 결과:
     * ```
     * 🐢 [발사 지연] 200ms 뒤로 예약했는데  2174ms 만에 깨어났다
     * 🐢 [발사 지연] 200ms 뒤로 예약했는데 13396ms 만에 깨어났다
     * ```
     * 「발사 준비 지연」은 한 줄도 안 나왔다 — **flush 안이 느린 게 아니라 깨어나기가 늦다.**
     * 안드로이드를 못 고치니 **예약을 안 한다.**
     *
     * 🟢 폭격 걱정은 없다 — 화면 보고는 `updateScreenContext` 가 **바뀔 때만** 부른다.
     * ⚠️ 콜 수집(`enqueue`)의 300ms 는 그대로 둔다 — 여러 콜을 한 번에 모아 보내는 것이라
     *    뜻이 있고, 그 길은 리스트가 움직이는 동안이라 «깨어나기»가 늦지 않는다.
     */
    fun forceFlushEvent() {
        if (!isRunning) return
        // 예약해 둔 것이 있으면 거둔다 — 두 번 보내지 않게
        handler.removeCallbacks(eventFlushRunnable)
        flushScheduledAt = 0L
        flush(isHeartbeat = false)
    }

    // [추가] 폰 화면이 켜졌을 때 즉각 생존(ONLINE) 신고를 쏘기 위한 함수
    fun forceHeartbeat() {
        if (!isRunning) return
        handler.removeCallbacks(heartbeatRunnable)
        handler.post(heartbeatRunnable)
    }

    /**
     * 🎛️ **서버한테 한 번도 못 들었으면 «잡지 않음»으로 시작한다** (2026-09-02 실측 사고).
     *
     * 예전 기본값은 `"AUTO"` 였다. 그래서 **앱을 새로 깐 직후**, 서버가 «알람»이라고
     * 답하기 전에 앱이 스스로 «자동»이라 믿고 콜을 눌렀다:
     * ```
     * 15:35:40.0  모드: AUTO        ← 아직 서버 말을 못 들음
     * 15:35:40.1  💥 [AUTO] 꿀콜 조건 통과! 강제 터치!
     * 15:35:40.4  🔔 [알람] … 기사님이 직접 누르십니다   ← 서버 대답은 이때 왔다
     * ```
     * 그날 그 창은 **50초**였다(화면이 안 바뀌어 첫 통신이 60초 생존신고였다).
     * 🔴 픽커에서 같은 일이 나면 「수락하기」가 눌리고 **되돌릴 창이 없다.**
     *
     * ⚠️ 앱 기본값은 «서버 미응답 시의 오프라인 안전망»이라 일부러 두는 것이지만
     *    (CLAUDE.md 규칙 ③), 안전망은 **안전한 쪽**으로 틀어야 한다.
     *    모르면 잡지 않는다 — 첫 응답이 오면 그때부터 서버 말을 따른다.
     */
    @Volatile
    var currentMode: String = "MANUAL"

    /**
     * 🚦 **«지금 무슨 일을 하는 중인가»를 보낼 때마다 물어본다** (2026-09-02 · 0단계 ①).
     *
     * 🔴 값을 여기 복사해 두고 여러 곳에서 갱신하게 하지 않는다 — 갱신을 한 군데라도
     *    빠뜨리면 화면이 **옛 단계를 계속 말한다**(오늘 오전에 고친 «읽지 않고 단언»과
     *    같은 병). 보낼 때 물으면 **늘 지금 것**이다 (규칙 ③).
     */
    @Volatile
    var workStageProvider: (() -> WorkStage.Stage)? = null

    /** 📦 이 폰에 깔린 앱 버전 — 서비스가 뜰 때 한 번 채운다 (설치할 때만 바뀐다) */
    @Volatile
    var appVersion: String? = null

    private fun flush(isHeartbeat: Boolean) {
        // 🐢 깨어난 순간을 **가장 먼저** 찍는다 — 이 아래 한 줄이라도 지나면 재는 뜻이 없다
        val wokeAt = android.os.SystemClock.elapsedRealtime()
        if (!isHeartbeat && flushScheduledAt > 0L) {
            val actual = wokeAt - flushScheduledAt
            val late = actual - flushRequestedDelayMs
            if (late >= 1_000) {
                AppLogger.w(TAG, "🐢 [발사 지연] ${flushRequestedDelayMs}ms 뒤로 예약했는데 " +
                        "${actual}ms 만에 깨어났다 (${late}ms 늦음) — 늦은 것은 «깨어나기»다")
            }
        }
        flushScheduledAt = 0L
        val snapshot: List<SimplifiedOfficeOrder>
        synchronized(scrapBuffer) {
            snapshot = scrapBuffer.toList()
            scrapBuffer.clear()
        }

        // [GPS 텔레메트리] 마지막 알려진 위치 조회 (앱폰 = 차량 거치대, GPS = 차량 위치)
        //
        // 🚨 TODO(미구현) — Phase 4에서 복구 예정
        // AndroidManifest.xml에 ACCESS_FINE_LOCATION 권한이 선언되어 있지 않아
        // getLastKnownLocation()이 SecurityException을 던지고 아래 catch가 이를 삼킵니다.
        // 결과적으로 lat/lng는 **항상 null**로 전송되며, 서버의 appLocation 저장 로직도 죽어 있습니다.
        // 수정 시: Manifest 권한 추가 + 런타임 권한 요청 UI 필요.
        var lat: Double? = null
        var lng: Double? = null
        try {
            context?.let { ctx ->
                val lm = ctx.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                val loc = lm?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    ?: lm?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
                if (loc != null) {
                    lat = loc.latitude
                    lng = loc.longitude
                }
            }
        } catch (e: SecurityException) {
            // 위치 권한 없으면 무시 (lat/lng = null로 전송)
        }

        // 🚦 보내는 그 순간의 단계를 묻는다 — 복사본을 들고 있지 않는다
        val stage = workStageProvider?.invoke()

        val prefs = context?.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
        val appCode = TargetApp.codeOf(prefs?.getString("targetApp", null))   // 매핑은 TargetApp 한 곳뿐

        val payload = ScrapPayload(
            deviceId = apiClient.getDeviceId(),
            data = snapshot,
            screenContext = currentScreenContext.value,  // [Safety Mode V3] 화면 상태 (물리적 페이지)
            isHolding = isHolding,                       // [Page/Hold 분리] 콜 처리 중 여부
            screenNodeCount = screenNodeCount,           // 👁️ 마지막 리스트에서 읽은 텍스트 노드 수
            filterTally = filterTally,                   // 👁️ 축별로 몇 개가 왜 떨어졌나
            isScreenOn = isScreenOn,                     // 💤 폰 화면이 켜져 있는가 (꺼지면 못 읽는다)
            lat = lat,                                   // [GPS 텔레메트리] 앱폰 위도
            lng = lng,                                   // [GPS 텔레메트리] 앱폰 경도
            targetApp = appCode,
            // 📦🚦🎛️ 폰 상태 바가 쓸 셋 — 앱 안엔 있었는데 여태 안 보내던 것들
            appVersion = appVersion,
            workStage = stage?.stage,
            workStageStep = stage?.step,
            workStageSeconds = stage?.seconds,
            appliedMode = currentMode,
            // 🧭 [피기백 v2] 들고 있는 필터 버전 — 같으면 서버가 본문을 생략한다.
            // ⚠️ null 이면 Gson 이 필드를 통째로 빼서 서버가 구앱으로 오인한다 —
            //    아직 버전이 없으면 빈 문자열("전체 주세요")을 보낸다
            filterVersion = prefs?.getString("filterVersion", "") ?: ""
        )

        /**
         * 👁️ **한 스캔의 성적표는 한 번만 보낸다** (기사님 지적 2026-08-23).
         *
         * 비우지 않으면 이 `var` 가 살아남아 **하트비트를 포함한 모든 전송**에 같은 숫자가
         * 계속 실려 간다. 서버는 올 때마다 새 시각을 찍으므로, 폰이 `알 수 없는 화면` 에 있어
         * **스캔을 아예 안 하는데도** 관제웹은 *"방금 훑었다"* 고 말한다.
         *
         * 🔴 비워야 *"성적표가 왔다" = "방금 리스트를 훑었다"* 가 참이 된다.
         *    관제웹은 그 등식에 기대어 낡은 줄을 안 그린다.
         * ⚠️ 서버는 마지막 값을 **지우지 않고** 들고 있으므로, 안 보낸다고 화면이 비지 않는다.
         */
        filterTally = null

        // 🐢 깨어난 뒤 여기까지(위치 조회·페이로드 만들기) 걸린 시간 — 이게 크면 «안에서» 걸린 것이다
        val prepMs = android.os.SystemClock.elapsedRealtime() - wokeAt
        if (prepMs >= 1_000) AppLogger.w(TAG, "🐢 [발사 준비 지연] 깨어난 뒤 ${prepMs}ms — 늦은 것은 «flush 안»이다")
        val triggerStr = if (isHeartbeat) "⏱️ 타이머 생존신고" else "👀 화면 변경 감지"
        // [앱폰] /api/scrap 전송 직전: 중복 해시값(출발지+도착지+요금) 검사 및 디바운스(300ms) 완료 로그
        AppLogger.i(TAG, "🛡️ 파싱된 콜 객체의 (출발지+도착지+요금) 해시값 검사 및 디바운스(300ms) 완료. /api/scrap 전송 직전!")
        AppLogger.roadmap("[post /api/scrap request] $triggerStr 발송  deviceId: ${payload.deviceId}, (건수: ${snapshot.size})", currentScreenContext.name)
        
        // 페이로드 상세는 AppLogger.v (Verbose) 레벨로 확인 가능 (SHOW_VERBOSE_LOGS=true 시)
        AppLogger.v(TAG, "📦 [전송 페이로드] deviceId=${payload.deviceId}, screen=${payload.screenContext}, holding=${payload.isHolding}, 콜=${snapshot.size}건")

        // [Piggyback V2] ackDecisionId는 ApiClient 내부에서 결합하므로 여기서는 전달 생략 
        apiClient.sendScrapTelemetry(
            payload = payload,
            onModeReceived = { mode ->
                currentMode = mode
                AppLogger.d(TAG, "📥 [서버 수신] $triggerStr 완료 (수신된 모드: $mode)")
            },
            onDecisionReceived = decisionCallback
        )

        // 통신을 방금 했으므로, 다음 하트비트 시점을 한 주기(60초) 뒤로 연기함
        resetHeartbeatTimer()
    }

    private fun resetHeartbeatTimer() {
        handler.removeCallbacks(heartbeatRunnable)
        if (isRunning) {
            val interval = if (isWaitingDecision) FAST_POLLING_MS else HEARTBEAT_INTERVAL_MS
            handler.postDelayed(heartbeatRunnable, interval)
        }
    }
}

