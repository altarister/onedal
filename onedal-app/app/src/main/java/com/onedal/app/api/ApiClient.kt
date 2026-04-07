package com.onedal.app.api

import android.content.Context
import android.os.Build
import android.util.Log
import com.google.gson.Gson
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.DispatchConfirmResponse
import com.onedal.app.models.DispatchDetailedRequest
import com.onedal.app.models.EmergencyReport
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
            val customIp = prefs.getString("localPcIp", "172.30.1.54:4000") ?: "172.30.1.54:4000"
            // 사용자가 'http://'를 안 붙였을 수도 있으니 방어 로직 추가
            val base = if (customIp.startsWith("http")) customIp else "http://$customIp"
            "$base$endpoint"
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
                prefs.edit().putString("api_confirm_req", jsonBody).apply()
                val targetUrl = getTargetUrl("/api/orders/confirm")
                val url = java.net.URL(targetUrl)

                conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000 // 1차 선점(BASIC)은 즉시 응답이므로 짧은 타임아웃

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                Log.d(TAG, "🌐 [Confirm] 응답: $code")

                if (code == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    prefs.edit().putString("api_confirm_res", body).apply()
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
     * 배차 2차 상세(DETAILED) 보고 및 서버 최종 판결(Decision) 대기 (롱폴링)
     */
    fun sendDetail(payload: DispatchDetailedRequest, onDecisionReceived: (String, String) -> Unit) {
        confirmExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val jsonBody = gson.toJson(payload)
                prefs.edit().putString("api_detail_req", jsonBody).apply()
                val targetUrl = getTargetUrl("/api/orders/detail")
                val url = java.net.URL(targetUrl)

                conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 40000 // 서버의 30초 롱폴링 홀드를 견디기 위함

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                Log.d(TAG, "🌐 [Detail] 응답: $code")

                if (code == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    prefs.edit().putString("api_detail_res", body).apply()
                    Log.d(TAG, "🌐 [Detail 서버 대답] $body")
                    
                    val res = gson.fromJson(body, DispatchConfirmResponse::class.java)
                    // 서버가 내려준 최종 판결 (KEEP or CANCEL) 콜백
                    onDecisionReceived(payload.order.id, res.action)
                } else {
                    // 타임아웃 등의 이유로 실패 시 CANCEL로 간주하여 뱉기
                    onDecisionReceived(payload.order.id, "CANCEL")
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ [Detail 전송 실패] ${e.message}")
                onDecisionReceived(payload.order.id, "CANCEL")
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
                prefs.edit().putString("api_scrap_req", jsonBody).apply()
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
                    prefs.edit().putString("api_scrap_res", body).apply()
                    val scrapRes = gson.fromJson(body, ScrapResponse::class.java)
                    Log.d(TAG, "📡 [텔레메트리] 스크랩 ${payload.data.size}건 전송 완료 (모드: ${scrapRes.deviceControl.mode})")
                    
                    if (scrapRes.dispatchEngineArgs != null) {
                        prefs.edit().putString("activeFilter", gson.toJson(scrapRes.dispatchEngineArgs)).apply()
                    }
                    
                    prefs.edit().putString("apiStatus", gson.toJson(scrapRes.apiStatus)).apply()
                    prefs.edit().putString("deviceControl", gson.toJson(scrapRes.deviceControl)).apply()

                    // 방금 보낸 스크랩 정보 화면 표시용으로 저장
                    prefs.edit()
                        .putLong("lastScrapTime", System.currentTimeMillis())
                        .putInt("lastScrapSize", payload.data.size)
                        .putString("lastScrapPreview", if (payload.data.isNotEmpty()) "${payload.data.first().pickup} -> ${payload.data.first().dropoff}" else "-")
                        .apply()

                    onModeReceived(scrapRes.deviceControl.mode)
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


    /**
     * [Safety Mode V3] 비상 보고 전송 (POST /api/emergency)
     * 자동취소 실행, 취소불가 팝업, 알 수 없는 화면 등 이상 상황 시 서버에 즉시 보고.
     * 서버는 이 신호를 받고 해당 오더의 메모리를 초기화합니다.
     */
    fun sendEmergency(report: EmergencyReport) {
        confirmExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val jsonBody = gson.toJson(report)
                Log.w(TAG, "🚨 [EMERGENCY 전송] reason=${report.reason}, orderId=${report.orderId}")
                prefs.edit().putString("api_emergency_req", jsonBody).apply()
                val targetUrl = getTargetUrl("/api/emergency")
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
                    prefs.edit().putString("api_emergency_res", body).apply()
                    Log.w(TAG, "🚨 [EMERGENCY 응답] $body")
                } else {
                    Log.e(TAG, "🚨 [EMERGENCY 서버 에러] HTTP $code")
                }
            } catch (e: Exception) {
                Log.e(TAG, "🚨 [EMERGENCY 전송 실패] ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    fun fetchKeywords() {
        telemetryExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val targetApp = prefs.getString("targetApp", "인성콜") ?: "인성콜"
                // URLEncoder.encode 가 필요할 수도 있으나 한글 쿼리는 안드로이드에서 종종 깨지므로 기본적으로 안전하게 요청
                val targetUrl = getTargetUrl("/api/config/keywords?app=$targetApp")
                val url = java.net.URL(targetUrl)

                conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "GET"
                conn.setRequestProperty("Accept", "application/json")
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                val code = conn.responseCode
                if (code == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    prefs.edit().putString("targetAppKeywords", body).apply()
                    Log.d(TAG, "🎯 [$targetApp] 키워드 사전 다운로드 성공: $body")
                } else {
                    Log.e(TAG, "🎯 키워드 서버 에러 응답: $code")
                }
            } catch (e: Exception) {
                Log.e(TAG, "🎯 키워드 다운로드 실패: ${e.message}")
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
