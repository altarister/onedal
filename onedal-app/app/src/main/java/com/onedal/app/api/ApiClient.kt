package com.onedal.app.api

import android.content.Context
import android.os.Build
import com.onedal.app.core.AppLogger
import com.google.gson.Gson
import com.onedal.app.models.DispatchBasicRequest
import com.onedal.app.models.DispatchConfirmResponse
import com.onedal.app.models.DispatchDetailedRequest
import com.onedal.app.models.EmergencyReport
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.ScrapPayload
import com.onedal.app.models.ScrapResponse
import com.onedal.app.models.PairDeviceRequest
import com.onedal.app.models.PairDeviceResponse
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
            val customIp = prefs.getString("localPcIp", "172.30.1.89:4000") ?: "172.30.1.89:4000"
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

                if (code == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    prefs.edit().putString("api_confirm_res", body).apply()
                    AppLogger.d(TAG, "🌐 [post /confirm response / $code] $body")
                    AppLogger.roadmap("[HTTP 폴링] 응답 /orders/confirm")
                    // 추후 4단계 취소 로직(CANCEL) 연동 지점
                } else {
                    val errorBody = try {
                        conn.errorStream?.bufferedReader()?.readText() ?: "Error body empty"
                    } catch (e: Exception) {
                        "Cannot read error body: ${e.message}"
                    }
                    AppLogger.e(TAG, "❌ [post /confirm response / $code] $errorBody")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "❌ [Confirm 전송 실패] ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    /**
     * 배차 2차 상세(DETAILED) 보고 (Option B: 짧은 무전 방식 지원)
     * 서버는 상세 정보를 큐(Queue)에 넣고 즉시 202 Accepted를 반환함. 
     * 최종 판결(KEEP/CANCEL)은 이후 Telemetry의 Piggyback으로 수신됨.
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
                conn.readTimeout = 5000 // 서버가 즉시 202를 반환하므로 짧게 설정

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode

                if (code == 200 || code == 202) {
                    val body = conn.inputStream.bufferedReader().readText()
                    prefs.edit().putString("api_detail_res", body).apply()
                    AppLogger.d(TAG, "🌐 [post /detail response / $code] 즉결 접수 완료. Piggyback 대기 시작.")
                    
                    // 성공적으로 큐에 등록되었으므로 여기서 판단 콜백을 부르지 않고, 
                    // 이후 Telemetry(Scrap) 폴링이 결재를 물어올 때까지 기다립니다.

                } else {
                    val errorBody = try {
                        conn.errorStream?.bufferedReader()?.readText() ?: "Error body empty"
                    } catch (e: Exception) {
                        "Cannot read error body: ${e.message}"
                    }
                    AppLogger.e(TAG, "❌ [post /detail response / $code] $errorBody")
                    // 타임아웃 등의 이유로 실패 시 CANCEL로 간주하여 뱉기
                    onDecisionReceived(payload.order.id, "CANCEL")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "❌ [Detail 전송 실패] ${e.message}")
                onDecisionReceived(payload.order.id, "CANCEL")
            } finally {
                conn?.disconnect()
            }
        }
    }

    /**
     * 스크랩 버퍼 벌크 전송 (텔레메트리) - Option B (Piggyback V2) 지원
     * @param payload ScrapPayload 기본 정보
     * @param onModeReceived 서버로부터 모드(AUTO/MANUAL) 수신 시 콜백
     * @param onDecisionReceived 서버가 결정(KEEP/CANCEL)을 Piggyback으로 보냈을 때 콜백
     */
    fun sendScrapTelemetry(
        payload: ScrapPayload, 
        onModeReceived: (String) -> Unit,
        onDecisionReceived: ((String, String) -> Unit)? = null
    ) {
        telemetryExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                // 발송 직전에 SharedPreferences에서 pendingAckDecisionId를 가져와서 주입
                val pendingAck = prefs.getString("pendingAckDecisionId", null)
                val finalPayload = payload.copy(ackDecisionId = pendingAck)
                
                val jsonBody = gson.toJson(finalPayload)
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
                    
                    val screenName = payload.screenContext ?: "UNKNOWN"
                    AppLogger.roadmap("[post /api/scrap response] deviceId: ${payload.deviceId}, (건수: ${payload.data.size})", screenName)
                    
                    if (scrapRes.dispatchEngineArgs != null) {
                        val filterJson = gson.toJson(scrapRes.dispatchEngineArgs)
                        prefs.edit().putString("activeFilter", filterJson).apply()
                        
                        // 서버가 이제 Array로 내려주므로 Gson 파싱(역직렬화) 시 에러(IllegalStateException)가 전혀 발생하지 않음
                        val updatedFilter = gson.fromJson(filterJson, FilterConfig::class.java)
                        AppLogger.d(TAG, "📋 [필터 동기화 (서버→앱) 적용됨] 맵핑된 필터 전체 스키마:\n$updatedFilter")
                    }
                    
                    prefs.edit().putString("apiStatus", gson.toJson(scrapRes.apiStatus)).apply()
                    prefs.edit().putString("deviceControl", gson.toJson(scrapRes.deviceControl)).apply()

                    // 방금 보낸 스크랩 정보 화면 표시용으로 저장
                    prefs.edit()
                        .putLong("lastScrapTime", System.currentTimeMillis())
                        .putInt("lastScrapSize", payload.data.size)
                        .putString("lastScrapPreview", if (payload.data.isNotEmpty()) "${payload.data.first().pickup} -> ${payload.data.first().dropoff}" else "-")
                        .apply()

                    // Piggyback 판결(Decision) 분실 방지 (수신 처리)
                    if (scrapRes.decision != null) {
                        AppLogger.w(TAG, "⚡ [Piggyback Decision 수신] orderId: ${scrapRes.decision.orderId}, action: ${scrapRes.decision.action}")
                        // 수신 확인증(ACK) 준비 (다음 번 텔레메트리 때 서버로 전송됨)
                        prefs.edit().putString("pendingAckDecisionId", scrapRes.decision.orderId).apply()
                        // 콜백 호출
                        onDecisionReceived?.invoke(scrapRes.decision.orderId, scrapRes.decision.action)
                    }

                    // 서버가 pendingAck를 성공적으로 비웠다면 (이 부분은 응답이 성공했으므로 안심하고 로컬에서도 날림)
                    // (단, 이번 요청에 ackDecisionId를 담아 보낸 경우에만 성공 시 삭해야함)
                    if (finalPayload.ackDecisionId != null) {
                        prefs.edit().remove("pendingAckDecisionId").apply()
                    }

                    onModeReceived(scrapRes.deviceControl.mode)
                } else {
                    AppLogger.w(TAG, "📡 [텔레메트리] 서버 에러 응답: $code")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "📡 [텔레메트리 통신 실패] ${e.message}")
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
                AppLogger.w(TAG, "🚨 [EMERGENCY 전송] reason=${report.reason}, orderId=${report.orderId}")
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
                    AppLogger.w(TAG, "🚨 [EMERGENCY 응답] $body")
                } else {
                    AppLogger.e(TAG, "🚨 [EMERGENCY 서버 에러] HTTP $code")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "🚨 [EMERGENCY 전송 실패] ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    /**
     * 수동 배차 결정 전송 (POST /api/orders/decision)
     * 앱 내에서 닫기/취소 등 최종 승인(KEEP/CANCEL)을 서버로 직통 통보합니다.
     */
    fun sendDecision(orderId: String, action: String) {
        confirmExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                // 웹 대시보드와 동일한 규격: { orderId, action }
                val jsonBody = """{"orderId":"$orderId", "action":"$action"}"""
                AppLogger.d(TAG, "📲 [Decision 전송] orderId=${orderId}, action=${action}")
                val targetUrl = getTargetUrl("/api/orders/decision")
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
                    AppLogger.d(TAG, "📲 [Decision 응답] $body")
                } else {
                    AppLogger.e(TAG, "📲 [Decision 서버 에러] HTTP $code")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "📲 [Decision 전송 실패] ${e.message}")
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
                    AppLogger.d(TAG, "🎯 [$targetApp] 키워드 사전 다운로드 성공: $body")
                } else {
                    AppLogger.e(TAG, "🎯 키워드 서버 에러 응답: $code")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "🎯 키워드 다운로드 실패: ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    /**
     * 6자리 PIN으로 서버에 기기 연동을 요청합니다 (POST /api/devices/pair)
     */
    fun pairDevice(pin: String, deviceName: String?, onResult: (Boolean, String) -> Unit) {
        telemetryExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val payload = PairDeviceRequest(
                    pin = pin,
                    deviceId = getDeviceId(),
                    deviceName = deviceName?.takeIf { it.isNotBlank() }
                )
                val jsonBody = gson.toJson(payload)
                val targetUrl = getTargetUrl("/api/devices/pair")
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
                val responseStr = if (code in 200..299) {
                    conn.inputStream.bufferedReader().readText()
                } else {
                    conn.errorStream?.bufferedReader()?.readText() ?: ""
                }

                val resultObj = try {
                    gson.fromJson(responseStr, PairDeviceResponse::class.java)
                } catch (e: Exception) { null }

                if (code in 200..299) {
                    val msg = resultObj?.message ?: "기기 연동이 완료되었습니다."
                    onResult(true, msg)
                } else {
                    val errMsg = resultObj?.error ?: "연동 실패 ($code)"
                    onResult(false, errMsg)
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "🔌 [기기 연동 통신 실패] ${e.message}")
                onResult(false, "네트워크 오류: ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    /**
     * [Option C] 오프라인(퇴근/종료) 비동기 통보
     * 화면이 꺼지거나 권한이 해제될 때 서버로 즉시 쏘고 종료.
     * 빠른 종료를 위해 readTimeout을 굉장히 짧게 주어 서버 응답을 기다리지 않습니다.
     */
    fun sendOffline() {
        telemetryExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val targetUrl = getTargetUrl("/api/devices/${getDeviceId()}/offline")
                val url = java.net.URL(targetUrl)

                conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.connectTimeout = 3000
                conn.readTimeout = 1000 // 서버 응답을 안기다리고 폭파

                val code = conn.responseCode
                AppLogger.d(TAG, "🔌 [오프라인 통보] 전송 완료 (코드: $code)")
            } catch (e: Exception) {
                // 이 상황에선 에러 로깅 외에는 할 수 있는 게 없음
                AppLogger.e(TAG, "🔌 [오프라인 통보 실패] ${e.message}")
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
