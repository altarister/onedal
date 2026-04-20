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
 * 이벤트 기반 즉각 스크랩 전송 및 20초 주기 생존신고(Heartbeat) 관리.
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
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false

    // [Safety Mode V3] 현재 화면 상태 (HijackService에서 상태 전이 시 업데이트)
    @Volatile
    var currentScreenContext: ScreenContext = ScreenContext.UNKNOWN

    // [Page/Hold 분리] 콜 처리 중 여부 (확정 클릭 ~ 리스트 복귀)
    @Volatile
    var isHolding: Boolean = false

    // [Piggyback V2] 관제탑 결재 대기 여부 (1.0초 단위 Short Polling 발동 조건)
    var isWaitingDecision: Boolean = false
        set(value) {
            val changed = field != value
            field = value
            if (changed) resetHeartbeatTimer()
        }

    // [Piggyback V2] 결재 수신 콜백
    var decisionCallback: ((String, String) -> Unit)? = null

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
        AppLogger.i(TAG, "Telemetry Loop Started (Event-driven + 20s Keep-alive)")
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
        handler.removeCallbacks(eventFlushRunnable)
        handler.postDelayed(eventFlushRunnable, DEBOUNCE_MS)
    }

    // [추가] 이벤트 화면 변경 시 200ms 디바운스를 적용하여 전송
    // 안드로이드 화면의 로딩 애니메이션 잔상으로 인해 강제 전송이 폭격(Spam)되는 것을 방지합니다.
    fun forceFlushEvent() {
        if (!isRunning) return
        handler.removeCallbacks(eventFlushRunnable)
        handler.postDelayed(eventFlushRunnable, 200)
    }

    // [추가] 폰 화면이 켜졌을 때 즉각 생존(ONLINE) 신고를 쏘기 위한 함수
    fun forceHeartbeat() {
        if (!isRunning) return
        handler.removeCallbacks(heartbeatRunnable)
        handler.post(heartbeatRunnable)
    }

    @Volatile
    var currentMode: String = "AUTO"

    private fun flush(isHeartbeat: Boolean) {
        val snapshot: List<SimplifiedOfficeOrder>
        synchronized(scrapBuffer) {
            snapshot = scrapBuffer.toList()
            scrapBuffer.clear()
        }

        // [GPS 텔레메트리] 마지막 알려진 위치 조회 (앱폰 = 차량 거치대, GPS = 차량 위치)
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

        val payload = ScrapPayload(
            deviceId = apiClient.getDeviceId(),
            data = snapshot,
            screenContext = currentScreenContext.value,  // [Safety Mode V3] 화면 상태 (물리적 페이지)
            isHolding = isHolding,                       // [Page/Hold 분리] 콜 처리 중 여부
            lat = lat,                                   // [GPS 텔레메트리] 앱폰 위도
            lng = lng                                    // [GPS 텔레메트리] 앱폰 경도
        )

        val triggerStr = if (isHeartbeat) "⏱️ 타이머 생존신고" else "👀 화면 변경 감지"
        AppLogger.roadmap("[post /api/scrap request] $triggerStr 발송  deviceId: ${payload.deviceId}, (건수: ${snapshot.size})", currentScreenContext.name)
        
        // [추가] 기사님 요청: 텔레메트리로 보내는 실제 JSON 형태를 터미널에서 구경할 수 있도록 세분화 출력
        val previewData = if (snapshot.isEmpty()) "[]" else "[ ${snapshot.size}개의 콜... ]"
        // AppLogger.d(TAG, "📦 [전송 페이로드] { \"deviceId\": \"${payload.deviceId}\", \"screenContext\": \"${payload.screenContext}\", \"data\": $previewData }")

        // AppLogger.d(TAG, "📦 [전송 페이로드] { deviceId: ${payload.deviceId}, screenContext: ${payload.screenContext}, data: $previewData }")
        /**
        if (snapshot.isNotEmpty()) {
            snapshot.forEachIndexed { index, order ->
                val entries = mutableListOf<String>()
                entries.add("  \"dropoff\": \"${order.dropoff}\"")
                entries.add("  \"fare\": ${order.fare}")
                entries.add("  \"id\": \"${order.id}\"")
                entries.add("  \"pickup\": \"${order.pickup}\"")
                if (order.pickupDistance != null) entries.add("  \"pickupDistance\": ${order.pickupDistance}")
                if (order.postTime != null) entries.add("  \"postTime\": \"${order.postTime}\"")
                if (order.rawText != null) entries.add("  \"rawText\": \"${order.rawText}\"")
                entries.add("  \"timestamp\": \"${order.timestamp}\"")
                entries.add("  \"type\": \"${order.type}\"")
                if (order.vehicleType != null) entries.add("  \"vehicleType\": \"${order.vehicleType}\"")

                val jsonLikeStr = "{\n${entries.joinToString(",\n")}\n}"
                AppLogger.d(TAG, "   └─ [data][$index] 상세 정보:\n$jsonLikeStr")
            }
        }
        */

        // [Piggyback V2] ackDecisionId는 ApiClient 내부에서 결합하므로 여기서는 전달 생략 
        apiClient.sendScrapTelemetry(
            payload = payload,
            onModeReceived = { mode ->
                currentMode = mode
                AppLogger.d(TAG, "📥 [서버 수신] $triggerStr 완료 (수신된 모드: $mode)")
            },
            onDecisionReceived = decisionCallback
        )

        // 통신을 방금 했으므로, 다음 하트비트 시점을 20초 뒤로 연기함
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

