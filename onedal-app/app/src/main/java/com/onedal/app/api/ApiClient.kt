package com.onedal.app.api

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.gson.Gson
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.ScrapPayload
import com.onedal.app.models.ScrapResponse
import java.util.concurrent.Executors

/**
 * 1DAL 앱 네트워크 계층 담당자 (API Client)
 * HTTP 연결 설정, Gson 직렬화, 로컬/라이브 URL 스위칭 로직을 전담합니다.
 */
class ApiClient(private val context: Context) {

    companion object {
        private const val TAG = "1DAL_API"
    }

    private val gson = Gson()
    // Confirm(최대 35초 대기)과 Telemetry(3초 주기)가 서로를 차단하지 않도록 스레드풀 분리
    private val confirmExecutor = Executors.newSingleThreadExecutor()
    private val telemetryExecutor = Executors.newSingleThreadExecutor()

    private val prefs by lazy {
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
    }

    /**
     * 기기 고유 ID 획득 (SharedPreferences)
     */
    fun getDeviceId(): String {
        return prefs.getString("deviceId", null) ?: run {
            val generated = "앱폰-${Build.MODEL.take(8)}-${(100..999).random()}"
            prefs.edit().putString("deviceId", generated).apply()
            generated
        }
    }

    /**
     * 타겟 URL 생성 (동적 Local / Live 판별)
     */
    private fun getTargetUrl(endpoint: String): String {
        val isLiveMode = prefs.getBoolean("isLiveMode", false)
        return if (isLiveMode) {
            "https://1dal.altari.com$endpoint"
        } else {
            "http://10.0.2.2:4000$endpoint"
        }
    }

    /**
     * 배차 확정(Confirm) / BASIC 보고 전송
     */
    fun sendConfirm(payload: DispatchBasicRequest) {
        confirmExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val jsonBody = gson.toJson(payload)
                val targetUrl = getTargetUrl("/api/orders/confirm")
                val url = java.net.URL(targetUrl)

                conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 35000 // 서버의 30초 데스밸리 Wait을 견디기 위한 넉넉한 타임아웃

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                Log.d(TAG, "🌐 [Confirm] 응답: $code")

                if (code == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    Log.d(TAG, "🌐 [Confirm 서버 대답] $body")
                    // 추후 4단계 취소 로직(CANCEL) 연동 지점
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ [Confirm 전송 실패] ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    /**
     * 스크랩 버퍼 벌크 전송 (텔레메트리)
     * @param payload ScrapPayload
     * @param onModeReceived 서버로부터 모드(AUTO/MANUAL) 수신 시 콜백
     */
    fun sendScrapTelemetry(payload: ScrapPayload, onModeReceived: (String) -> Unit) {
        telemetryExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val jsonBody = gson.toJson(payload)
                val targetUrl = getTargetUrl("/api/scrap")
                val url = java.net.URL(targetUrl)

                conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                if (code == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    val scrapRes = gson.fromJson(body, ScrapResponse::class.java)
                    Log.d(TAG, "📡 [텔레메트리] 스크랩 ${payload.data.size}건 전송 완료 (모드: ${scrapRes.mode})")
                    
                    if (scrapRes.filter != null) {
                        prefs.edit().putString("activeFilter", gson.toJson(scrapRes.filter)).apply()
                    }

                    onModeReceived(scrapRes.mode)
                } else {
                    Log.w(TAG, "📡 [텔레메트리] 서버 에러 응답: $code")
                }
            } catch (e: Exception) {
                Log.e(TAG, "📡 [텔레메트리 통신 실패] ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    fun shutdown() {
        confirmExecutor.shutdown()
        telemetryExecutor.shutdown()
    }
}
