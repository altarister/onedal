package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.google.gson.Gson
import com.onedal.app.models.*

class HijackService : AccessibilityService() {

    companion object {
        private const val TAG = "1DAL_MVP"
        private const val SCRAP_INTERVAL_MS = 3000L  // 3초 주기 텔레메트리
    }

    private val gson = Gson()

    // 화면 변화 감지용 이전 상태
    private var lastSeenTextCounts = mapOf<String, Int>()
    private var hasClickedInThisCycle = false

    // 수집 통계 (DeviceControlPanel에 표시됨)
    private var statPolled = 0   // 스크랩한 콜 건수
    private var statGrabbed = 0  // 광클 선점 성공 횟수

    // 스크랩 벌크 전송용 버퍼 (3초마다 서버로 flush)
    private val scrapBuffer = mutableListOf<SimplifiedOrder>()

    // 텔레메트리 루프 핸들러
    private val handler = Handler(Looper.getMainLooper())
    private val scrapRunnable = object : Runnable {
        override fun run() {
            flushScrapBuffer()
            handler.postDelayed(this, SCRAP_INTERVAL_MS)
        }
    }

    // 기기 ID (SharedPreferences에서 읽음)
    private fun getOneDalDeviceId(): String {
        val prefs = getSharedPreferences("OneDalPrefs", android.content.Context.MODE_PRIVATE)
        return prefs.getString("deviceId", null) ?: run {
            // 최초 실행 시 고유 ID 자동 생성
            val generated = "앱폰-${android.os.Build.MODEL.take(8)}-${(100..999).random()}"
            prefs.edit().putString("deviceId", generated).apply()
            generated
        }
    }

    // ─────────────────────────────────────────────────────────
    //  서비스 생명주기
    // ─────────────────────────────────────────────────────────
    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "1DAL Accessibility Service Connected! (기기: ${getOneDalDeviceId()})")
        // 텔레메트리 루프 시작
        handler.postDelayed(scrapRunnable, SCRAP_INTERVAL_MS)
    }

    override fun onInterrupt() {
        Log.e(TAG, "Service Interrupted")
        handler.removeCallbacks(scrapRunnable)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(scrapRunnable)
    }

    // ─────────────────────────────────────────────────────────
    //  핵심: 화면 변화 감지 및 처리
    // ─────────────────────────────────────────────────────────
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            val rootNode = rootInActiveWindow ?: return

            hasClickedInThisCycle = false
            val currentTexts = mutableListOf<String>()

            // 텍스트 추출 및 조건 충족 시 자동 클릭 동시 수행
            extractTextsAndCheckClick(rootNode, currentTexts)

            val currentTextCounts = mutableMapOf<String, Int>()
            for (text in currentTexts) {
                currentTextCounts[text] = currentTextCounts.getOrDefault(text, 0) + 1
            }

            val newlyAppearedTexts = mutableListOf<String>()
            for ((text, currentCount) in currentTextCounts) {
                val lastCount = lastSeenTextCounts.getOrDefault(text, 0)
                if (currentCount > lastCount) {
                    repeat(currentCount - lastCount) { newlyAppearedTexts.add(text) }
                }
            }

            if (newlyAppearedTexts.isNotEmpty()) {
                Log.d(TAG, "=================================")
                Log.d(TAG, "🆕 새로 감지 : ${newlyAppearedTexts.joinToString(", ")}")

                val rawJoined = newlyAppearedTexts.joinToString(", ")

                // --- Best-Effort 휴리스틱 파서 ---

                // 1. 요금(Fare) 파싱: "요금 : 133,000" 형태에서 숫자만 추출
                val fareText = newlyAppearedTexts.find { it.contains("요금") }
                val fare = fareText?.replace(Regex("[^0-9]"), "")?.toIntOrNull() ?: 0

                // 2. 상차지(Pickup) 파싱: '@' 기호가 포함된 텍스트
                val pickupText = newlyAppearedTexts.find { it.contains("@") } ?: "미상"
                val pickup = pickupText.substringAfter("@").split("/").firstOrNull()?.trim()?.replace("()", "") ?: pickupText

                // 3. 하차지(Dropoff) 파싱: '/' 구분자가 2개 이상이면서 '@'가 없는 주소 텍스트
                val dropoffText = newlyAppearedTexts.find { it.split("/").size >= 3 && !it.contains("@") } ?: "미상"
                val dropoff = dropoffText.split("/").take(3).joinToString(" ").trim()

                val now = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.getDefault())
                    .format(java.util.Date())

                val order = SimplifiedOrder(
                    id = java.util.UUID.randomUUID().toString(),
                    type = "NEW_ORDER",
                    pickup = pickup,
                    dropoff = dropoff,
                    fare = fare,
                    timestamp = now,
                    rawText = rawJoined
                )

                if (hasClickedInThisCycle) {
                    // ── 광클 성공! → 배차 확정 파이프라인으로 전송 ──
                    statGrabbed++
                    val confirmPayload = DispatchBasicRequest(
                        step = "BASIC",
                        deviceId = getOneDalDeviceId(),
                        order = order,
                        capturedAt = now,
                        matchType = "AUTO"
                    )
                    val json = gson.toJson(confirmPayload)
                    Log.d(TAG, "🚀 선점 성공! 배차 확정(Confirm) 프로세스 시작")
                    sendToServer(json, isConfirm = true)

                } else if (fare > 0 || newlyAppearedTexts.size > 10) {
                    // ── 일반 콜 데이터 → 스크랩 버퍼에 적재 (3초마다 벌크 전송) ──
                    statPolled++
                    synchronized(scrapBuffer) {
                        scrapBuffer.add(order)
                    }
                    Log.d(TAG, "📦 스크랩 버퍼에 적재 (버퍼 크기: ${scrapBuffer.size})")
                } else {
                    Log.d(TAG, "🗑️ 의미 없는 부스러기 데이터 (전송 스킵)")
                }
            }

            lastSeenTextCounts = currentTextCounts
            rootNode.recycle()
        }
    }

    // ─────────────────────────────────────────────────────────
    //  접근성 트리 탐색 + 조건부 자동 클릭
    // ─────────────────────────────────────────────────────────
    private fun extractTextsAndCheckClick(node: AccessibilityNodeInfo?, texts: MutableList<String>) {
        if (node == null) return

        val text = node.text?.toString()?.trim()
        if (!text.isNullOrEmpty()) {
            texts.add(text)
            checkAndClickIfHighProfit(text, node)
        }

        val contentDesc = node.contentDescription?.toString()?.trim()
        if (!contentDesc.isNullOrEmpty()) {
            texts.add(contentDesc)
            checkAndClickIfHighProfit(contentDesc, node)
        }

        for (i in 0 until node.childCount) {
            extractTextsAndCheckClick(node.getChild(i), texts)
        }
    }

    private fun checkAndClickIfHighProfit(text: String, node: AccessibilityNodeInfo) {
        try {
            val value = text.toIntOrNull()
            if (value != null && value >= 100) {
                Log.d(TAG, "💥 [자동 배차 엔진 발동] 조건 충족 (요금: $value)")
                performSimulatedTouch(node)
                hasClickedInThisCycle = true
            }
        } catch (_: Exception) {
            // 무시
        }
    }

    // ─────────────────────────────────────────────────────────
    //  시스템 레벨 강제 스크린 터치
    // ─────────────────────────────────────────────────────────
    private fun performSimulatedTouch(node: AccessibilityNodeInfo) {
        val rect = Rect()
        node.getBoundsInScreen(rect)

        val x = rect.centerX().toFloat()
        val y = rect.centerY().toFloat()

        if (x <= 0f || y <= 0f) {
            Log.e(TAG, "❌ [터치 실패] 화면 좌표를 구할 수 없습니다.")
            return
        }

        val clickPath = Path().apply { moveTo(x, y) }
        val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, 50)
        val gesture = GestureDescription.Builder().addStroke(clickStroke).build()

        val result = dispatchGesture(gesture, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                Log.d(TAG, "✅ [가로채기 성공!] 화면 좌표 (X:$x, Y:$y) 터치 완료!")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                super.onCancelled(gestureDescription)
                Log.e(TAG, "❌ [터치 실패] 시스템에 의해 무시됨")
            }
        }, null)

        if (!result) {
            Log.e(TAG, "❌ [권한 오류] 제스처 발생이 차단되었습니다.")
        }
    }

    // ─────────────────────────────────────────────────────────
    //  스크랩 벌크 전송 (3초 주기 텔레메트리)
    // ─────────────────────────────────────────────────────────
    private fun flushScrapBuffer() {
        val snapshot: List<SimplifiedOrder>
        synchronized(scrapBuffer) {
            if (scrapBuffer.isEmpty()) {
                // 버퍼가 비어있어도 빈 배열로 heartbeat 전송 (데드맨 스위치 생존 신고)
                snapshot = emptyList()
            } else {
                snapshot = scrapBuffer.toList()
                scrapBuffer.clear()
            }
        }

        val payload = ScrapPayload(
            deviceId = getOneDalDeviceId(),
            data = snapshot
        )
        val json = gson.toJson(payload)

        Thread {
            try {
                val targetUrl = getTargetUrl("/api/scrap")
                val url = java.net.URL(targetUrl)
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                conn.outputStream.use { os ->
                    os.write(json.toByteArray(Charsets.UTF_8))
                }

                val responseCode = conn.responseCode
                if (responseCode == 200) {
                    // Piggyback 응답에서 서버 모드(AUTO/MANUAL) 수신
                    val body = conn.inputStream.bufferedReader().readText()
                    val scrapRes = gson.fromJson(body, ScrapResponse::class.java)
                    Log.d(TAG, "📡 [텔레메트리] 스크랩 ${snapshot.size}건 전송 (서버 모드: ${scrapRes.mode}, 누적: ${scrapRes.total})")
                } else {
                    Log.w(TAG, "📡 [텔레메트리] 서버 응답: $responseCode")
                }
            } catch (e: Exception) {
                Log.e(TAG, "📡 [텔레메트리 실패] ${e.message}")
            }
        }.start()
    }

    // ─────────────────────────────────────────────────────────
    //  배차 확정(Confirm) 전송
    // ─────────────────────────────────────────────────────────
    private fun sendToServer(jsonBody: String, isConfirm: Boolean = false) {
        Thread {
            try {
                val endpoint = if (isConfirm) "/api/orders/confirm" else "/api/orders"
                val targetUrl = getTargetUrl(endpoint)

                val url = java.net.URL(targetUrl)
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = if (isConfirm) 35000 else 5000  // Confirm은 데스밸리 대기 고려

                conn.outputStream.use { os ->
                    os.write(jsonBody.toByteArray(Charsets.UTF_8))
                }

                val responseCode = conn.responseCode
                Log.d(TAG, "🌐 [API 통신] $endpoint → 응답: $responseCode")

                // (4단계 예비) Confirm 응답에서 KEEP/CANCEL 수신 처리
                if (isConfirm && responseCode == 200) {
                    try {
                        val body = conn.inputStream.bufferedReader().readText()
                        Log.d(TAG, "🌐 [Confirm 응답] $body")
                        // TODO(4단계): DispatchConfirmResponse 파싱 → CANCEL 시 자동 취소 터치
                    } catch (_: Exception) { }
                }
            } catch (e: Exception) {
                Log.e(TAG, "❌ [API 통신 실패] ${e.message}")
            }
        }.start()
    }

    // ─────────────────────────────────────────────────────────
    //  서버 URL 결정 (Local / Live 스위치)
    // ─────────────────────────────────────────────────────────
    private fun getTargetUrl(endpoint: String): String {
        val prefs = getSharedPreferences("OneDalPrefs", android.content.Context.MODE_PRIVATE)
        val isLiveMode = prefs.getBoolean("isLiveMode", false)
        return if (isLiveMode) {
            "https://1dal.altari.com$endpoint"
        } else {
            "http://10.0.2.2:4000$endpoint"
        }
    }
}
