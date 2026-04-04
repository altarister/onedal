package com.onedal.app.core

import android.os.Handler
import android.os.Looper
import android.util.Log
import com.onedal.app.api.ApiClient
import com.onedal.app.models.ScrapPayload
import com.onedal.app.models.SimplifiedOrder

/**
 * 3초 주기 스크랩/생존신고 버퍼와 전송 스케줄링을 관리.
 */
class TelemetryManager(private val apiClient: ApiClient) {

    companion object {
        private const val TAG = "1DAL_TELEMETRY"
        private const val SCRAP_INTERVAL_MS = 3000L
    }

    private val scrapBuffer = mutableListOf<SimplifiedOrder>()
    private val handler = Handler(Looper.getMainLooper())
    private var isRunning = false

    private val scrapRunnable = object : Runnable {
        override fun run() {
            flush()
            if (isRunning) {
                handler.postDelayed(this, SCRAP_INTERVAL_MS)
            }
        }
    }

    fun start() {
        if (isRunning) return
        isRunning = true
        handler.postDelayed(scrapRunnable, SCRAP_INTERVAL_MS)
        Log.i(TAG, "Telemetry Loop Started")
    }

    fun stop() {
        isRunning = false
        handler.removeCallbacks(scrapRunnable)
        Log.i(TAG, "Telemetry Loop Stopped")
    }

    /**
     * 버퍼에 콜 데이터를 쌓음 (Thread-safe)
     */
    fun enqueue(order: SimplifiedOrder) {
        synchronized(scrapBuffer) {
            scrapBuffer.add(order)
        }
    }

    private fun flush() {
        val snapshot: List<SimplifiedOrder>
        synchronized(scrapBuffer) {
            snapshot = scrapBuffer.toList()
            scrapBuffer.clear()
        }

        val payload = ScrapPayload(
            deviceId = apiClient.getDeviceId(),
            data = snapshot
        )

        apiClient.sendScrapTelemetry(payload) { mode ->
            // [TODO] 향후 모드 값이 "MANUAL" 이면 앱 내부적으로 터치를 막는 연동 가능
            Log.d(TAG, "Received Mode: $mode")
        }
    }
}
