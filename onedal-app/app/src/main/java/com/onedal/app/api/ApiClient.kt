package com.onedal.app.api

import com.onedal.app.core.DeviceLink
import android.content.Context
import com.onedal.app.core.LogTag
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
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * 1DAL 앱 네트워크 계층 담당자 (API Client)
 * HTTP 연결 설정, Gson 직렬화, 로컬/라이브 URL 스위칭 로직을 전담합니다.
 *
 * [Executor 분리 전략]
 * - dispatchExecutor (1스레드): confirm → detail — 배차 라이프사이클 전용 · **순서 보장**
 * - emergencyExecutor (전용 1스레드): emergency — 어떤 상황에서도 즉시 실행
 * - telemetryExecutor (1스레드): scrap + keywords + pair + offline — 텔레메트리/설정
 */
/**
 * 📤 **scrap 보고 한 줄** — 콜이 있으면 늘, «콜 0건»은 화면이 바뀔 때만 (`LogOnceTest`).
 * 상세 대기 중에는 1초마다 «콜 0건» 보고가 가서 하루 2,440줄이 됐다(09-30). 콜이 있던 뒤의 0건은 다시 한 번 찍는다(목록이 비었다는 사실).
 */
internal fun scrapLogLine(screenName: String, count: Int, ms: Long): String? {
    val line = "📤 [scrap] 화면 $screenName · 콜 ${count}건 · ${ms}ms"
    if (count > 0) { com.onedal.app.core.LogOnce.changed("scrap-empty", ""); return line }
    return if (com.onedal.app.core.LogOnce.changed("scrap-empty", screenName)) line else null
}

class ApiClient(private val context: Context) {

    companion object {
        private const val TAG = "1DAL_API"
    }

    private val gson = Gson()

    /**
     * 배차 라이프사이클 전용 (confirm/detail) — **한 줄로 세운다** (기사님 확정).
     *
     * 🔴 서버 계약은 *"`confirm` 이 콜을 만들고 `detail` 이 승급한다"* 라 **순서가 뒤집히면
     *    안 된다.** 스레드가 둘이면 둘이 동시에 출발해 `detail` 이 먼저 닿을 수 있다
     *    (실측 10ms 차) — 승급할 콜이 아직 없는 상태가 된다.
     *
     * 던지는 쪽은 **여전히 기다리지 않는다**(규칙 ② *"HTTP 를 물고 기다리지 않는다"*).
     * 큐가 넣은 순서대로 하나씩 꺼낼 뿐이다.
     *
     * ⚠️ 스레드 하나로 충분하다 — 피기백 V2 로 `sendDetail` 이 202 만 받고 즉시 리턴하므로
     *    롱폴링이 스레드를 오래 무는 일이 없다.
     *    판결은 텔레메트리(별도 스레드)로 온다. 앱 규칙 *"한 번에 하나만 평가한다"* 와도 맞다.
     */
    private val dispatchExecutor = Executors.newSingleThreadExecutor()

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
            val generated = DeviceLink.newDeviceId()   // 🔐 식별은 난수 — 사람이 읽는 이름은 짝 때 deviceName
            prefs.edit().putString("deviceId", generated).apply()
            generated
        }
    }

    /**
     * 🔐 **서버 요청은 여기 한 곳에서 연다** — 토큰 헤더 · 타임아웃 (`DeviceLinkTest`).
     * 짝 요청만 토큰 없이 연다(아직 토큰이 없다).
     */
    private fun open(url: String, method: String = "POST", connectMs: Int = 10000, readMs: Int = connectMs, withToken: Boolean = true): java.net.HttpURLConnection {
        val c = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        c.requestMethod = method
        if (method == "POST") c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
        c.setRequestProperty("Accept", "application/json")
        if (withToken) prefs.getString(DeviceLink.PREF_TOKEN, null)?.let { c.setRequestProperty(DeviceLink.HEADER, it) }
        c.connectTimeout = connectMs
        c.readTimeout = readMs
        return c
    }

    /** 🔐 응답으로 연결 상태를 적는다 — 거절이면 까닭을 남기고(띠 · 보고 60초), 받아 주면 지운다 */
    private fun noteLink(code: Int, body: String?) {
        val why = when (DeviceLink.verdict(code, body)) {
            DeviceLink.Verdict.OK -> null
            DeviceLink.Verdict.UNLINKED -> DeviceLink.WHY_UNLINKED
            DeviceLink.Verdict.BLOCKED -> DeviceLink.WHY_BLOCKED
            DeviceLink.Verdict.OTHER -> return
        }
        val prev = prefs.getString(DeviceLink.PREF_UNLINKED, null)
        if (prev == why) return
        prefs.edit().apply { if (why == null) remove(DeviceLink.PREF_UNLINKED) else putString(DeviceLink.PREF_UNLINKED, why) }.apply()
        if (why != null) AppLogger.w(TAG, "🔐 [폰 연결 풀림] HTTP $code · 까닭 $why — 설정에서 PIN 으로 다시 연결")
        else AppLogger.i(TAG, LogTag.NETWORK, "🔐 [폰 연결 돌아옴] 서버가 다시 받는다")
    }

    /** 응답 코드 — 거절(401·403)이면 본문까지 읽어 연결 상태를 적는다 */
    private fun codeOf(c: java.net.HttpURLConnection): Int {
        val code = c.responseCode
        noteLink(code, if (code == 401 || code == 403) c.errorStream?.bufferedReader()?.readText() else null)
        return code
    }

    /** 🔐 서버가 이 폰을 거절했나 — 보고 간격이 읽는다(`TelemetryManager.heartbeatIntervalMs`) */
    /** 🔐 연결이 풀린 까닭(«토큰» · «계정») — 비면 정상 */
    fun unlinkedWhy(): String? = prefs.getString(DeviceLink.PREF_UNLINKED, null)

    fun isUnlinked(): Boolean = prefs.getString(DeviceLink.PREF_UNLINKED, null) != null

    /**
     * 타겟 URL 생성 (동적 Local / Live 판별)
     */
    private fun getTargetUrl(endpoint: String): String {
        val isLiveMode = com.onedal.app.core.ServerTarget.isLive(prefs)
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
        maxRetries: Int = 2,
        /** 1초마다 되풀이되는 보고(scrap)는 시작·완료 줄을 찍지 않는다 — 실패 줄은 그대로 남는다 (reviews/22) */
        quiet: Boolean = false,
    ): Pair<Int, String>? {
        for (attempt in 1..maxRetries) {
            val startMs = System.currentTimeMillis()
            var conn: java.net.HttpURLConnection? = null
            try {
                if (!quiet) AppLogger.roadmap(LogTag.NETWORK, "[HTTP 전송] POST $apiName 시작 (시도 $attempt/$maxRetries)", "NETWORK")

                conn = open(targetUrl, connectMs = timeoutMs)
                conn.doOutput = true

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val code = conn.responseCode
                val body = if (code in 200..299) {
                    conn.inputStream.bufferedReader().readText()
                } else {
                    conn.errorStream?.bufferedReader()?.readText() ?: "Error body empty"
                }
                noteLink(code, body)

                val elapsedMs = System.currentTimeMillis() - startMs
                if (!quiet) AppLogger.roadmap(LogTag.NETWORK,
                    "[HTTP 응답] POST $apiName 완료 (${elapsedMs}ms, HTTP $code, 시도 $attempt/$maxRetries)",
                    "NETWORK"
                )
                return Pair(code, body)

            } catch (e: Exception) {
                val elapsedMs = System.currentTimeMillis() - startMs
                AppLogger.roadmap(LogTag.NETWORK,
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
                        AppLogger.d(TAG, LogTag.NETWORK, "🌐 [post /confirm response / $code] $body")
                        AppLogger.roadmap(LogTag.DECISION, "[HTTP 폴링] 응답 /orders/confirm")
                    } else {
                        AppLogger.e(TAG, LogTag.NETWORK, "❌ [post /confirm response / $code] $body")
                    }
                } else {
                    AppLogger.e(TAG, LogTag.NETWORK, "❌ [Confirm 전송 실패] 재시도 포함 모든 시도 실패")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, LogTag.NETWORK, "❌ [Confirm 전송 실패] ${e.message}")
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
                        AppLogger.d(TAG, LogTag.NETWORK, "🌐 [post /detail response / $code] 즉결 접수 완료. Piggyback 대기 시작.")
                        // 성공적으로 큐에 등록되었으므로 여기서 판단 콜백을 부르지 않고, 
                        // 이후 Telemetry(Scrap) 폴링이 결재를 물어올 때까지 기다립니다.
                    } else {
                        AppLogger.e(TAG, LogTag.NETWORK, "❌ [post /detail response / $code] $body")
                        // 타임아웃 등의 이유로 실패 시 CANCEL로 간주하여 뱉기
                        onDecisionReceived(payload.order.id, "CANCEL")
                    }
                } else {
                    AppLogger.e(TAG, LogTag.NETWORK, "❌ [Detail 전송 실패] 재시도 포함 모든 시도 실패")
                    onDecisionReceived(payload.order.id, "CANCEL")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, LogTag.NETWORK, "❌ [Detail 전송 실패] ${e.message}")
                onDecisionReceived(payload.order.id, "CANCEL")
            }
        }
    }

    /**
     * 스크랩 버퍼 벌크 전송 (텔레메트리) - Option B (Piggyback V2) 지원
     * @param payload ScrapPayload 기본 정보
     * @param onModeReceived 서버로부터 모드(AUTO/MANUAL) 수신 시 콜백
     * @param onDecisionReceived 서버가 결정(KEEP/CANCEL)을 Piggyback으로 보냈을 때 콜백
     * @param onCallMemoryRound 서버가 시뮬레이터 회차를 실어 보냈을 때 콜백 (본 콜 기억 비우기)
     */
    /** 🔄 새 필터 버전이 닿았을 때 — 서비스가 잇는다(지금 목록을 다시 판정). 보고 쓰레드에서 불린다 */
    var onFilterChanged: ((String) -> Unit)? = null

    fun sendScrapTelemetry(
        payload: ScrapPayload, 
        onModeReceived: (String) -> Unit,
        onDecisionReceived: ((String, String) -> Unit)? = null,
        onCallMemoryRound: ((Int) -> Unit)? = null,
        onFoldAfter: ((String, Long) -> Unit)? = null,
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

                // 생존신고(scrap)에도 1회 자동 재시도를 적용합니다.
                // 기존에는 confirm/detail/emergency만 재시도가 있고 scrap은 맨 요청이라,
                // 터널·기지국 전환으로 1회만 실패해도 다음 하트비트까지 120초 공백이 생겨
                // 서버 데드맨이 오작동(기기를 죽은 것으로 판정)하는 원인이 되었습니다.
                val result = executeWithRetry(targetUrl, jsonBody, "/scrap", timeoutMs = 5000, quiet = true)

                if (result == null) {
                    val elapsedMs = System.currentTimeMillis() - startMs
                    AppLogger.roadmap(LogTag.NETWORK, "[HTTP 실패] POST /scrap (${elapsedMs}ms) 재시도 포함 모든 시도 실패", "NETWORK")
                    AppLogger.e(TAG, "📡 [텔레메트리 통신 실패] 재시도 포함 모든 시도 실패")
                    return@submit
                }

                val (code, body) = result
                if (code == 200) {
                    prefs.edit().putString("api_scrap_res", body).apply()
                    val scrapRes = gson.fromJson(body, ScrapResponse::class.java)
                    // 📦 최신·최소 판 — 칸이 없으면 지운다(서버가 아직 안 보냄 → 안내 없음 · `UpdateNotice`)
                    prefs.edit().apply {
                        scrapRes.appLatestCode?.let { putInt("appLatestCode", it) } ?: remove("appLatestCode")
                        scrapRes.appMinimumCode?.let { putInt("appMinimumCode", it) } ?: remove("appMinimumCode")
                    }.apply()
                    // 🔒 «앞 콜 심사 중» 맨 위 칸 — 본문이 생략된 응답에도 온다. 없으면 지워 필터 안 값으로 (`EvaluatingNow`)
                    com.onedal.app.core.EvaluatingNow.topOf(body).let { top ->
                        prefs.edit().apply {
                            if (top == null) remove(com.onedal.app.core.EvaluatingNow.PREF_KEY)
                            else putBoolean(com.onedal.app.core.EvaluatingNow.PREF_KEY, top)
                        }.apply()
                    }
                    
                    val screenName = payload.screenContext ?: "UNKNOWN"
                    // 📤 보고 한 번 = 한 줄 (보내기·응답·건수·걸린 시간) — «콜 0건»은 화면이 바뀔 때만 (`scrapLogLine`)
                    scrapLogLine(screenName, payload.data.size, System.currentTimeMillis() - startMs)?.let { AppLogger.d(TAG, LogTag.NETWORK, it) }
                    
                    if (scrapRes.dispatchEngineArgs != null) {
                        /**
                         * 🕳️ **서버가 보낸 원문을 그대로 보관한다** (기사님 실측).
                         *
                         * `gson.toJson(scrapRes.dispatchEngineArgs)` 로 **되말아** 저장하면, Gson 은 기본으로
                         * `null` 필드를 직렬화하지 않으므로 `{"분당구": null}` 같은 항목이 **그 왕복에서 통째로 사라진다**
                         * (실측: 서버 435개 → 앱 407개, 차이 28개가 진행도를 모르는 지역 수).
                         *
                         * 🔴 이게 왜 치명적인가: `RouteOrderFilter` 에서 **뜻이 뒤집힌다.**
                         *      키가 있고 값이 null → *"순서 미상 — 통과"*   ← 서버의 의도
                         *      키가 아예 없음      → *"경로 밖 — 차단"*     ← 사라진 뒤 동작
                         *    *"진행도를 모르는 동은 남긴다"* 는 규칙이 **저장 계층에서**
                         *    조용히 깨진다. 콜을 못 잡는데 화면은 멀쩡해 보인다.
                         *
                         * 원문을 그대로 두면 어떤 값도 잃지 않는다 — 왕복 자체를 없앤다.
                         *
                         * ⚠️ 원문을 못 꺼내면 **옛 필터를 지킨다.** 되말기로 폴백하지 않는다 —
                         *    그건 안전망이 아니라 망가진 동작으로 돌아가는 길이고, 조용히
                         *    28개를 잃은 채 계속 돈다. 필터가 하나 늦는 편이 낫다 (규칙 ④).
                         */
                        val filterJson = JSONObject(body).optJSONObject("dispatchEngineArgs")?.toString()
                        if (filterJson == null) {
                            AppLogger.w(TAG, "📋 [필터 원문 없음] 응답에서 dispatchEngineArgs 를 못 꺼냈습니다 — 저장본을 그대로 둡니다")
                        } else {
                        val prevFilterJson = prefs.getString("activeFilter", null)
                        prefs.edit().putString("activeFilter", filterJson).apply()
                        // 🧭 [피기백 v2] 필터와 함께 온 버전을 저장 — 다음 텔레메트리에 실어 보내면
                        //    서버가 같을 때 본문을 생략한다. 응답에 필터가 없으면(버전 일치) 저장본 유지
                        val prevFilterVersion = prefs.getString("filterVersion", null)
                        val newFilterVersion = scrapRes.filterVersion ?: ""
                        prefs.edit().putString("filterVersion", newFilterVersion).apply()
                        // 🔄 새 필터가 닿았다 — 지금 목록을 곧바로 다시 판정하게 알린다. 막 켜져 이전 버전이 없으면 안 부른다(첫 스캔이 어차피 돈다)
                        if (!prevFilterVersion.isNullOrEmpty() && newFilterVersion != prevFilterVersion) onFilterChanged?.invoke(newFilterVersion)

                        // 서버가 이제 Array로 내려주므로 Gson 파싱(역직렬화) 시 에러(IllegalStateException)가 전혀 발생하지 않음
                        val updatedFilter = com.onedal.app.core.FilterStore.parse(filterJson)

                        // 로그 다이어트
                        // 기존에는 필터 전체 스키마(키워드 400여 개 포함, ~10KB)를 매 응답마다 d 레벨로 찍었다.
                        // 안전취소 대기 중엔 1초 폴링이라 초당 10KB가 쌓여 logcat 버퍼 한계에 걸려
                        // 문자열이 잘리고, 정작 봐야 할 로그가 묻혔다.
                        // → 필터가 실제로 바뀐 순간에만 요약 한 줄 + 전체(v 레벨)를 남긴다.
                        if (prevFilterJson != filterJson) {
                            // 🔕 필터가 실제로 바뀐 순간만 요약 한 줄 (응답마다 되풀이하지 않는다)
                            AppLogger.d(
                                TAG, LogTag.FILTER,
                                "📋 [필터 동기화] 차종 ${updatedFilter.allowedVehicleTypes.size}종 " +
                                        "| 키워드 ${updatedFilter.destinationKeywords.size}개 " +
                                        "| isActive=${updatedFilter.isActive} " +
                                        "| ${if (updatedFilter.isSharedMode) "합짐" else "첫짐"} " +
                                        "| minFare=${updatedFilter.minFare}"
                            )
                            AppLogger.v(TAG, "📋 [필터 변경 감지] 전체 스키마:\n$updatedFilter")
                        }
                        }
                    }

                    scrapRes.apiStatus?.let { prefs.edit().putString("apiStatus", gson.toJson(it)).apply() }
                    scrapRes.deviceControl?.let { prefs.edit().putString("deviceControl", gson.toJson(it)).apply() }

                    // 방금 보낸 스크랩 정보 화면 표시용으로 저장
                    prefs.edit()
                        .putLong("lastScrapTime", System.currentTimeMillis())
                        .putInt("lastScrapSize", payload.data.size)
                        .putString("lastScrapPreview", if (payload.data.isNotEmpty()) "${payload.data.first().pickup} -> ${payload.data.first().dropoff}" else "-")
                        .apply()

                    // Piggyback 판결(Decision) 분실 방지 (수신 처리)
                    // 결재 두 칸이 다 있을 때만 — 한 칸이 비면 넘기지 않고 적어 둔다(응답을 버리지 않는다)
                    val decisionId = scrapRes.decision?.orderId
                    val decisionAction = scrapRes.decision?.action
                    if (scrapRes.decision != null && (decisionId == null || decisionAction == null))
                        AppLogger.w(TAG, LogTag.DECISION, "⚠️ [결재 칸 비어 있음] orderId=$decisionId · action=$decisionAction — 넘기지 않는다")
                    if (decisionId != null && decisionAction != null) {
                        AppLogger.w(TAG, LogTag.DECISION, "⚡ [Piggyback Decision 수신] orderId: $decisionId, action: $decisionAction")
                        // 수신 확인증(ACK) 준비 (다음 번 텔레메트리 때 서버로 전송됨)
                        prefs.edit().putString("pendingAckDecisionId", decisionId).apply()
                        // 콜백 호출
                        onDecisionReceived?.invoke(decisionId, decisionAction)
                    }
                    // ⏩ 판정 뒤 접기 — 결재(decision)와 다른 사실이라 따로 받는다 (`DetailFold`)
                    scrapRes.foldAfter?.let { onFoldAfter?.invoke(it.orderId, it.remainMsOrSec()) }

                    // 서버가 pendingAck를 성공적으로 비웠다면 (이 부분은 응답이 성공했으므로 안심하고 로컬에서도 날림)
                    // (단, 이번 요청에 ackDecisionId를 담아 보낸 경우에만 성공 시 삭해야함)
                    if (finalPayload.ackDecisionId != null) {
                        prefs.edit().remove("pendingAckDecisionId").apply()
                    }

                    scrapRes.deviceControl?.callMemoryRound?.let { onCallMemoryRound?.invoke(it) }
                    scrapRes.deviceControl?.mode?.let { onModeReceived(it) }
                } else {
                    AppLogger.w(TAG, "📡 [텔레메트리] 서버 에러 응답: $code")
                }
            } catch (e: Exception) {
                val elapsedMs = System.currentTimeMillis() - startMs
                AppLogger.roadmap(LogTag.NETWORK,
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

    /** 📱 운행 기록 전용 한 줄 스레드 — 서버가 안 닿아 10초씩 걸려도 콜 전송(`telemetryExecutor`)을 막지 않는다 */
    private val traceExecutor = java.util.concurrent.Executors.newSingleThreadExecutor { r ->
        Thread(r, "1dal-trace").apply { isDaemon = true }
    }

    /** 📸 이상 징후 전용 한 줄 스레드 — 초당 스크랩(`telemetryExecutor`)이나 확정(`dispatchExecutor`)을 막지 않는다 */
    private val anomalyExecutor = java.util.concurrent.Executors.newSingleThreadExecutor { r ->
        Thread(r, "1dal-anomaly").apply { isDaemon = true }
    }

    /**
     * 📱 **실물 픽커 운행 기록을 올린다** — `POST /api/logs/app` (`PickerTrace`).
     * 결과만 알려 준다 — 실패하면 부르는 쪽이 대기열 앞에 되돌린다.
     * 🔴 기록 줄을 여기서 AppLogger 로 되찍지 않는다 — 부르는 쪽이 이미 찍었다.
     */
    fun sendAppTraceLines(lines: List<com.onedal.app.plugins.kakaopicker.PickerTrace.Line>, onResult: (Boolean) -> Unit) {
        traceExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            val ok = try {
                val fmt = java.text.SimpleDateFormat("HH:mm:ss.SSS", java.util.Locale.US)
                val body = gson.toJson(mapOf(
                    "deviceId" to getDeviceId(),
                    "lines" to lines.map { mapOf("at" to fmt.format(java.util.Date(it.atMs)), "msg" to it.msg) },
                ))
                val c = open(getTargetUrl("/api/logs/app"))
                conn = c
                c.doOutput = true
                c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                codeOf(c) in 200..299
            } catch (e: Exception) {
                AppLogger.w(TAG, "📱 [운행 기록 전송 실패] ${e.message} — 대기열에 되돌린다")
                false
            } finally {
                conn?.disconnect()
            }
            onResult(ok)
        }
    }

    fun fetchKeywords() {
        telemetryExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val targetApp = prefs.getString("targetApp", "인성콜") ?: "인성콜"
                // URLEncoder.encode 가 필요할 수도 있으나 한글 쿼리는 안드로이드에서 종종 깨지므로 기본적으로 안전하게 요청
                val targetUrl = getTargetUrl("/api/config/keywords?app=$targetApp")
                conn = open(targetUrl, method = "GET")

                val code = codeOf(conn)
                if (code == 200) {
                    val body = conn.inputStream.bufferedReader().readText()
                    prefs.edit().putString("targetAppKeywords", body).apply()
                    AppLogger.d(TAG, LogTag.BOOT, "🎯 [$targetApp] 키워드 사전 다운로드 성공: $body")
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
                    deviceName = deviceName?.takeIf { it.isNotBlank() } ?: Build.MODEL   // 🔐 표시 이름 — 비면 기종(식별 id 는 난수라 사람이 못 읽는다)
                )
                val jsonBody = gson.toJson(payload)
                val targetUrl = getTargetUrl("/api/devices/pair")

                conn = open(targetUrl, withToken = false)
                conn.doOutput = true

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
                    // 🔐 토큰은 이 응답에 한 번만 온다 — 저장하고 연결 풀림 표시를 지운다
                    prefs.edit().apply {
                        resultObj?.deviceToken?.let { putString(DeviceLink.PREF_TOKEN, it) }
                        remove(DeviceLink.PREF_UNLINKED)
                    }.apply()
                    val msg = resultObj?.message ?: "기기 연동이 완료되었습니다."
                    onResult(true, msg)
                } else {
                    val errMsg = resultObj?.error?.let { DeviceLink.pairErrorText(it) } ?: "연동 실패 ($code)"
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
    /**
     * 📵 **왜 내려가는지를 함께 보낸다** (기사님 지적:
     * *"'접근성 꺼짐' 이렇게 표현되면 좋겠는데"*).
     *
     * 까닭 없이 끊기면 관제웹은 끊긴 폰에도 **마지막으로 본 화면 이름**을 계속 그린다 —
     * 그 폰은 아무 말도 안 하는데 *"지금 이 화면이다"* 라고 단언하는 셈이다.
     * 까닭을 아는 것은 **앱뿐**이므로 죽기 전에 실어 보낸다.
     */
    fun sendOffline(reason: String? = null) {
        telemetryExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val targetUrl = getTargetUrl("/api/devices/${getDeviceId()}/offline")
                conn = open(targetUrl, connectMs = 3000, readMs = 1000) // 서버 응답을 안기다리고 폭파
                if (reason != null) {
                    conn.doOutput = true
                    conn.outputStream.use { it.write("{\"reason\":\"$reason\"}".toByteArray(Charsets.UTF_8)) }
                }

                val code = codeOf(conn)
                AppLogger.d(TAG, LogTag.NETWORK, "🔌 [오프라인 통보] 전송 완료 (코드: $code)")
            } catch (e: Exception) {
                // 이 상황에선 에러 로깅 외에는 할 수 있는 게 없음
                AppLogger.e(TAG, "🔌 [오프라인 통보 실패] ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    /**
     * 🚨 **스냅샷 검증 실패 또는 UI 이상 징후를 서버에 보고한다** — `POST /api/telemetry/anomalies`
     */
    fun sendAnomalyReport(
        targetApp: String,
        screenName: String?,
        failureReason: String,
        listOrderInfo: Any? = null,
        detailParsedText: String? = null,
        ocrResult: Any? = null,
        screenshotBase64: String? = null
    ) {
        anomalyExecutor.submit {
            var conn: java.net.HttpURLConnection? = null
            try {
                val payload = mutableMapOf<String, Any?>(
                    "timestamp" to java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                        timeZone = java.util.TimeZone.getTimeZone("UTC")
                    }.format(java.util.Date()),
                    "deviceId" to getDeviceId(),
                    "targetApp" to targetApp,
                    "screenName" to screenName,
                    "failureReason" to failureReason,
                    "listOrderInfo" to listOrderInfo,
                    "detailParsedText" to detailParsedText,
                    "ocrResult" to ocrResult,
                    "screenshotBase64" to screenshotBase64
                )
                val jsonBody = gson.toJson(payload)
                val targetUrl = getTargetUrl("/api/telemetry/anomalies")
                val c = open(targetUrl, connectMs = 5000)
                conn = c
                c.doOutput = true
                c.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }
                val code = codeOf(c)
                if (code == 200) {
                    AppLogger.w(TAG, "🚨 [이상 징후 보고 완료] $targetApp · $failureReason")
                } else {
                    AppLogger.e(TAG, "🚨 [이상 징후 보고 HTTP $code] $targetApp · $failureReason")
                }
            } catch (e: Exception) {
                AppLogger.e(TAG, "🚨 [이상 징후 보고 전송 실패] ${e.message}")
            } finally {
                conn?.disconnect()
            }
        }
    }

    fun shutdown() {
        dispatchExecutor.shutdown()
        emergencyExecutor.shutdown()
        telemetryExecutor.shutdown()
        traceExecutor.shutdown()
        anomalyExecutor.shutdown()
    }
}

