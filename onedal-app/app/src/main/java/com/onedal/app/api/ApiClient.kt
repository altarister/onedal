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
 *
 * [Executor 분리 전략]
 * - dispatchExecutor (2스레드): confirm + detail + decision — 배차 라이프사이클 전용
 * - emergencyExecutor (전용 1스레드): emergency — 어떤 상황에서도 즉시 실행
 * - telemetryExecutor (1스레드): scrap + keywords + pair + offline — 텔레메트리/설정
 */
class ApiClient(private val context: Context) {

    companion object {
        private const val TAG = "1DAL_API"
    }

    private val gson = Gson()

    /** 배차 라이프사이클 전용 (confirm/detail/decision) — 2스레드로 병렬 가능 */
    private val dispatchExecutor = Executors.newFixedThreadPool(2)

    /** 비상 전용 — 절대 다른 작업에 의해 블로킹되지 않음 */
    private val emergencyExecutor = Executors.newSingleThreadExecutor()

    /** 텔레메트리/설정 전용 */
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
     * [공통] 크리티컬 API용 HTTP 실행기 — 1회 자동 재시도 포함
     * 1차 실패 시 500ms 대기 후 재시도. 2차도 실패하면 최종 실패(null) 반환.
     *
     * @param targetUrl 대상 URL
     * @param jsonBody JSON 직렬화된 요청 본문
     * @param apiName ROADMAP 로그용 API 이름 (예: "/confirm", "/detail")
     * @param timeoutMs connect + read 타임아웃 (ms)
     * @param maxRetries 최대 시도 횟수 (기본 2 = 1차 + 재시도 1회)
     * @return Pair(HTTP코드, 응답본문) 또는 null(모든 시도 실패)
     */
    private fun executeWithRetry(
        targetUrl: String,
        jsonBody: String,
        apiName: String,
        timeoutMs: Int = 10000,
        maxRetries: Int = 2
    ): Pair<Int, String>? {
        for (attempt in 1..maxRetries) {
            val startMs = System.currentTimeMillis()
            var conn: java.net.HttpURLConnection? = null
            try {
                AppLogger.roadmap("[HTTP 전송] POST $apiName 시작 (시도 $attempt/$maxRetries)", "NETWORK")

                conn = java.net.URL(targetUrl).openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true
                conn.connectTimeout = timeoutMs
                conn.readTimeout = timeoutMs

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                val body = if (code in 200..299) {
                    conn.inputStream.bufferedReader().readText()
                } else {
                    conn.errorStream?.bufferedReader()?.readText() ?: "Error body empty"
                }

                val elapsedMs = System.currentTimeMillis() - startMs
                AppLogger.roadmap(
                    "[HTTP 응답] POST $apiName 완료 (${elapsedMs}ms, HTTP $code, 시도 $attempt/$maxRetries)",
                    "NETWORK"
                )
                return Pair(code, body)

            } catch (e: Exception) {
                val elapsedMs = System.currentTimeMillis() - startMs
                AppLogger.roadmap(
                    "[HTTP 실패] POST $apiName (${elapsedMs}ms, 시도 $attempt/$maxRetries) " +
                            "사유: ${e.javaClass.simpleName} - ${e.message}",
                    "NETWORK"
                )
                if (attempt < maxRetries) {
                    Thread.sleep(500) // 500ms 대기 후 재시도
                }
            } finally {
                conn?.disconnect()
            }
        }
        return null // 모든 시도 실패
    }

    /**
     * 배차 확정(Confirm) / BASIC 보고 전송
     */
    fun sendConfirm(payload: DispatchBasicRequest) {
        dispatchExecutor.submit {
            try {
                val jsonBody = gson.toJson(payload)
                prefs.edit().putString("api_confirm_req", jsonBody).apply()
                val targetUrl = getTargetUrl("/api/orders/confirm")

                val result = executeWithRetry(targetUrl, jsonBody, "/confirm", timeoutMs = 10000)

                if (result != null) {
                    val (code, body) = result
                    if (code == 200) {
                        prefs.edit().putString("api_confirm_res", body).apply()
                        AppLogger.d(TAG, "🌐 [post /confirm response / $code] $body")
                        AppLogger.roadmap("[HTTP 폴링] 응답 /orders/confirm")
                    } else {
                        AppLogger.e(TAG, "❌ [post /confirm response / $code] $body")
                    }
                } else {
                    AppLogger.e(TAG, "❌ [Confirm 전송 실패] 재시도 포함 모든 시도 실패")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "❌ [Confirm 전송 실패] ${e.message}")
            }
        }
    }

    /**
     * 배차 2차 상세(DETAILED) 보고 (Option B: 짧은 무전 방식 지원)
     * 서버는 상세 정보를 큐(Queue)에 넣고 즉시 202 Accepted를 반환함. 
     * 최종 판결(KEEP/CANCEL)은 이후 Telemetry의 Piggyback으로 수신됨.
     */
    fun sendDetail(payload: DispatchDetailedRequest, onDecisionReceived: (String, String) -> Unit) {
        dispatchExecutor.submit {
            try {
                val jsonBody = gson.toJson(payload)
                prefs.edit().putString("api_detail_req", jsonBody).apply()
                val targetUrl = getTargetUrl("/api/orders/detail")

                val result = executeWithRetry(targetUrl, jsonBody, "/detail", timeoutMs = 15000)

                if (result != null) {
                    val (code, body) = result
                    if (code == 200 || code == 202) {
                        prefs.edit().putString("api_detail_res", body).apply()
                        AppLogger.d(TAG, "🌐 [post /detail response / $code] 즉결 접수 완료. Piggyback 대기 시작.")
                        // 성공적으로 큐에 등록되었으므로 여기서 판단 콜백을 부르지 않고, 
                        // 이후 Telemetry(Scrap) 폴링이 결재를 물어올 때까지 기다립니다.
                    } else {
                        AppLogger.e(TAG, "❌ [post /detail response / $code] $body")
                        // 타임아웃 등의 이유로 실패 시 CANCEL로 간주하여 뱉기
                        onDecisionReceived(payload.order.id, "CANCEL")
                    }
                } else {
                    AppLogger.e(TAG, "❌ [Detail 전송 실패] 재시도 포함 모든 시도 실패")
                    onDecisionReceived(payload.order.id, "CANCEL")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "❌ [Detail 전송 실패] ${e.message}")
                onDecisionReceived(payload.order.id, "CANCEL")
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
            val startMs = System.currentTimeMillis()
            try {
                // 발송 직전에 SharedPreferences에서 pendingAckDecisionId를 가져와서 주입
                val pendingAck = prefs.getString("pendingAckDecisionId", null)
                val finalPayload = payload.copy(ackDecisionId = pendingAck)

                val jsonBody = gson.toJson(finalPayload)
                prefs.edit().putString("api_scrap_req", jsonBody).apply()
                val targetUrl = getTargetUrl("/api/scrap")

                // [Phase 1.5] 생존신고(scrap)에도 1회 자동 재시도를 적용합니다.
                // 기존에는 confirm/detail/emergency만 재시도가 있고 scrap은 맨 요청이라,
                // 터널·기지국 전환으로 1회만 실패해도 다음 하트비트까지 120초 공백이 생겨
                // 서버 데드맨이 오작동(기기를 죽은 것으로 판정)하는 원인이 되었습니다.
                val result = executeWithRetry(targetUrl, jsonBody, "/scrap", timeoutMs = 5000)

                if (result == null) {
                    val elapsedMs = System.currentTimeMillis() - startMs
                    AppLogger.roadmap("[HTTP 실패] POST /scrap (${elapsedMs}ms) 재시도 포함 모든 시도 실패", "NETWORK")
                    AppLogger.e(TAG, "📡 [텔레메트리 통신 실패] 재시도 포함 모든 시도 실패")
                    return@submit
                }

                val (code, body) = result
                if (code == 200) {
                    prefs.edit().putString("api_scrap_res", body).apply()
                    val scrapRes = gson.fromJson(body, ScrapResponse::class.java)
                    
                    val screenName = payload.screenContext ?: "UNKNOWN"
                    AppLogger.roadmap("[post /api/scrap response] deviceId: ${payload.deviceId}, (건수: ${payload.data.size})", screenName)
                    
                    if (scrapRes.dispatchEngineArgs != null) {
                        val filterJson = gson.toJson(scrapRes.dispatchEngineArgs)
                        val prevFilterJson = prefs.getString("activeFilter", null)
                        prefs.edit().putString("activeFilter", filterJson).apply()

                        // 서버가 이제 Array로 내려주므로 Gson 파싱(역직렬화) 시 에러(IllegalStateException)가 전혀 발생하지 않음
                        val updatedFilter = gson.fromJson(filterJson, FilterConfig::class.java)

                        // [Phase 3 / 이슈 A2] 로그 다이어트
                        // 기존에는 필터 전체 스키마(키워드 400여 개 포함, ~10KB)를 매 응답마다 d 레벨로 찍었다.
                        // 안전취소 대기 중엔 1초 폴링이라 초당 10KB가 쌓여 logcat 버퍼 한계에 걸려
                        // 문자열이 잘리고, 정작 봐야 할 로그가 묻혔다.
                        // → 평소에는 요약 한 줄, 필터가 실제로 바뀐 순간에만 전체를 v 레벨로 남긴다.
                        AppLogger.d(
                            TAG,
                            "📋 [필터 동기화] 차종 ${updatedFilter.allowedVehicleTypes.size}종 " +
                                    "| 키워드 ${updatedFilter.destinationKeywords.size}개 " +
                                    "| isActive=${updatedFilter.isActive} " +
                                    "| ${if (updatedFilter.isSharedMode) "합짐" else "첫짐"} " +
                                    "| minFare=${updatedFilter.minFare}"
                        )
                        if (prevFilterJson != filterJson) {
                            AppLogger.v(TAG, "📋 [필터 변경 감지] 전체 스키마:\n$updatedFilter")
                        }
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
                val elapsedMs = System.currentTimeMillis() - startMs
                AppLogger.roadmap(
                    "[HTTP 실패] POST /scrap (${elapsedMs}ms) 사유: ${e.javaClass.simpleName} - ${e.message}",
                    "NETWORK"
                )
                AppLogger.e(TAG, "📡 [텔레메트리 통신 실패] ${e.message}")
            }
            // 커넥션 정리는 executeWithRetry 내부의 finally에서 수행합니다.
        }
    }


    /**
     * [Safety Mode V3] 비상 보고 전송 (POST /api/emergency)
     * 자동취소 실행, 취소불가 팝업, 알 수 없는 화면 등 이상 상황 시 서버에 즉시 보고.
     * 서버는 이 신호를 받고 해당 오더의 메모리를 초기화합니다.
     *
     * ⚠️ emergencyExecutor 전용 — 다른 작업에 의해 절대 블로킹되지 않음
     */
    fun sendEmergency(report: EmergencyReport) {
        emergencyExecutor.submit {
            try {
                val jsonBody = gson.toJson(report)
                AppLogger.w(TAG, "🚨 [EMERGENCY 전송] reason=${report.reason}, orderId=${report.orderId}")
                prefs.edit().putString("api_emergency_req", jsonBody).apply()
                val targetUrl = getTargetUrl("/api/emergency")

                val result = executeWithRetry(targetUrl, jsonBody, "/emergency", timeoutMs = 10000)

                if (result != null) {
                    val (code, body) = result
                    if (code == 200) {
                        prefs.edit().putString("api_emergency_res", body).apply()
                        AppLogger.w(TAG, "🚨 [EMERGENCY 응답] $body")
                    } else {
                        AppLogger.e(TAG, "🚨 [EMERGENCY 서버 에러] HTTP $code")
                    }
                } else {
                    AppLogger.e(TAG, "🚨 [EMERGENCY 전송 실패] 재시도 포함 모든 시도 실패")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "🚨 [EMERGENCY 전송 실패] ${e.message}")
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
                conn.connectTimeout = 10000
                conn.readTimeout = 10000

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
                conn.connectTimeout = 10000
                conn.readTimeout = 10000

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
        dispatchExecutor.shutdown()
        emergencyExecutor.shutdown()
        telemetryExecutor.shutdown()
    }
}
