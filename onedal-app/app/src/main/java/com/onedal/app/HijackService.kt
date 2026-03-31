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
                    
                    // 서버로 인텔 데이터(또는 꿀콜 데이터) 백그라운드 전송
                    val jsonArray = newlyAppearedTexts.joinToString(",") { "\"$it\"" }
                    val jsonBody = """{"texts": [$jsonArray]}"""
                    sendToServer(jsonBody)
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
                val url = java.net.URL("http://10.0.2.2:5173/api/orders")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json; utf-8")
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
