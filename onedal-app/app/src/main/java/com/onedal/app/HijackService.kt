package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class HijackService : AccessibilityService() {

    private var lastSeenTextCounts = mapOf<String, Int>()

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            val rootNode = rootInActiveWindow
            if (rootNode != null) {
                val currentTexts = mutableListOf<String>()
                
                // 텍스트 추출 및 100 이상 자동 클릭 동시 수행
                extractTextsAndCheckClick(rootNode, currentTexts)
                
                val currentTextCounts = mutableMapOf<String, Int>()
                for (text in currentTexts) {
                    currentTextCounts[text] = currentTextCounts.getOrDefault(text, 0) + 1
                }
                
                val newlyAppearedTexts = mutableListOf<String>()
                for ((text, currentCount) in currentTextCounts) {
                    val lastCount = lastSeenTextCounts.getOrDefault(text, 0)
                    if (currentCount > lastCount) {
                        for (i in 0 until (currentCount - lastCount)) {
                            newlyAppearedTexts.add(text)
                        }
                    }
                }
                
                if (newlyAppearedTexts.isNotEmpty()) {
                    Log.d("1DAL_MVP", "=================================")
                    Log.d("1DAL_MVP", "🆕 새로 감지 : ${newlyAppearedTexts.joinToString(", ")}")
                    
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
                    val dropoff = dropoffText.split("/").take(3).joinToString(" ").trim() // 뒷자리 상세 이름 제외
                    
                    val orderData = com.onedal.app.models.OrderData(
                        type = "NEW_ORDER",
                        pickup = pickup,
                        dropoff = dropoff,
                        fare = fare,
                        timestamp = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'").format(java.util.Date()),
                        rawText = rawJoined
                    )
                    
                    // 요금이 있거나 유의미한 길이의 덩어리일 때만 서버로 발송
                    if (fare > 0 || newlyAppearedTexts.size > 10) {
                        try {
                            val gson = com.google.gson.Gson()
                            val jsonBody = gson.toJson(orderData)
                            Log.d("1DAL_MVP", "🚀 서버 전송 시도: $jsonBody")
                            sendToServer(jsonBody)
                        } catch (e: Exception) {
                            Log.e("1DAL_MVP", "JSON 직렬화 에러", e)
                        }
                    } else {
                        Log.d("1DAL_MVP", "🗑️ 의미 없는 부스러기 데이터 (전송 스킵)")
                    }
                }
                
                lastSeenTextCounts = currentTextCounts
                rootNode.recycle()
            }
        }
    }

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
                Log.d("1DAL_MVP", "💥 [자동 배차 엔진 발동] 조건 충족 (요금: $value)")
                performSimulatedTouch(node)
            }
        } catch (e: Exception) {
            // 무시
        }
    }

    // 시스템 레벨의 강제 스크린 터치(Gesture)를 발생시킴
    private fun performSimulatedTouch(node: AccessibilityNodeInfo) {
        val rect = Rect()
        node.getBoundsInScreen(rect) // 글씨가 화면의 어느 좌표(X,Y)에 있는지 사각형 계산
        
        val x = rect.centerX().toFloat()
        val y = rect.centerY().toFloat()

        if (x <= 0f || y <= 0f) {
            Log.e("1DAL_MVP", "❌ [터치 실패] 화면 좌표를 구할 수 없습니다.")
            return
        }

        val clickPath = Path()
        clickPath.moveTo(x, y) // 정확히 해당 숫자 글씨의 정중앙 좌표

        val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, 50)
        val clickBuilder = GestureDescription.Builder().addStroke(clickStroke).build()

        // 사람이 직접 손가락으로 누르는 것과 동일한 터치 신호를 화면 좌표에 발사!
        val result = dispatchGesture(clickBuilder, object : GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                Log.d("1DAL_MVP", "✅ [가로채기 성공!] 진짜 손가락처럼 화면 좌표 (X:$x, Y:$y) 터치 완료!")
            }

            override fun onCancelled(gestureDescription: GestureDescription?) {
                super.onCancelled(gestureDescription)
                Log.e("1DAL_MVP", "❌ [터치 실패] 시스템에 의해 무시됨")
            }
        }, null)
        
        if (!result) {
            Log.e("1DAL_MVP", "❌ [권한 오류] 제스처 발생이 차단되었습니다.")
        }
    }

    // 초경량 백그라운드 HTTP POST 요청 (무거운 라이브러리 제거)
    private fun sendToServer(jsonBody: String) {
        Thread {
            try {
                // 승욱님의 로컬 웹 서버 주소 (에뮬레이터에서는 10.0.2.2 가 localhost를 의미)
                val url = java.net.URL("http://10.0.2.2:4000/api/orders")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                conn.setRequestProperty("Accept", "application/json")
                conn.doOutput = true

                conn.outputStream.use { os ->
                    val input = jsonBody.toByteArray(Charsets.UTF_8)
                    os.write(input, 0, input.size)
                }

                val responseCode = conn.responseCode
                Log.d("1DAL_MVP", "🌐 [API 통신 파이프 작동] 서버 응답 코드: $responseCode")
            } catch (e: Exception) {
                // 아직 서버 쪽에 /api/orders 라우터가 없어도 앱이 죽지 않도록 예외 처리
                Log.e("1DAL_MVP", "❌ [API 통신 실패] 서버 미작동 또는 엔드포인트 없음: ${e.message}")
            }
        }.start()
    }

    override fun onInterrupt() {
        Log.e("1DAL_MVP", "Service Interrupted")
    }
    
    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i("1DAL_MVP", "1DAL Accessibility Service Connected!")
    }
}
