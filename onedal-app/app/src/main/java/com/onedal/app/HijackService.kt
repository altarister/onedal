package com.onedal.app

import android.accessibilityservice.AccessibilityService
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.api.ApiClient
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.TelemetryManager
import com.onedal.app.models.DispatchBasicRequest

/**
 * 접근성 서비스 메인 관제탑 (Orchestrator)
 * 로직을 각 매니저(ApiClient, ScrapParser, TelemetryManager, AutoTouchManager)에게 위임합니다.
 */
class HijackService : AccessibilityService() {

    companion object {
        private const val TAG = "1DAL_MVP"
    }

    // 의존성 주입 (매니저 객체들)
    private lateinit var apiClient: ApiClient
    private lateinit var telemetryManager: TelemetryManager
    private lateinit var scrapParser: ScrapParser
    private lateinit var touchManager: AutoTouchManager

    // 화면 사이클 1회당 상태 임시 저장
    private var lastSeenTextCounts = mapOf<String, Int>()
    private var hasClickedInThisCycle = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "1DAL Service Connected! [Clean Architecture]")

        // 매니저 초기화
        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient)
        scrapParser = ScrapParser()
        touchManager = AutoTouchManager(this)

        // 텔레메트리 루프 시작
        telemetryManager.start()
    }

    override fun onInterrupt() {
        Log.e(TAG, "Service Interrupted")
        telemetryManager.stop()
    }

    override fun onDestroy() {
        super.onDestroy()
        telemetryManager.stop()
        apiClient.shutdown()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return
        val rootNode = rootInActiveWindow ?: return

        hasClickedInThisCycle = false
        val currentTexts = mutableListOf<String>()

        // 텍스트 추출 및 광클 검사
        extractTextsAndCheckClick(rootNode, currentTexts)

        // 이번 사이클에 새로 나타난 텍스트 블록만 필터링
        val currentTextCounts = currentTexts.groupingBy { it }.eachCount()
        val newlyAppearedTexts = getNewlyAppearedTexts(currentTextCounts, lastSeenTextCounts)

        if (newlyAppearedTexts.isNotEmpty()) {
            val rawStr = newlyAppearedTexts.joinToString(", ")
            Log.d(TAG, "=================================")
            Log.d(TAG, "🆕 새로 감지 : $rawStr")

            // 파서 엔진 가동
            val order = scrapParser.parse(newlyAppearedTexts)

            if (hasClickedInThisCycle) {
                // 선점 성공 (Confirm 파이프라인 진입)
                val payload = DispatchBasicRequest(
                    step = "BASIC",
                    deviceId = apiClient.getDeviceId(),
                    order = order,
                    capturedAt = order.timestamp,
                    matchType = "AUTO"
                )
                Log.d(TAG, "🚀 선점 성공! 배차 확정(Confirm) 프로세스 시작")
                apiClient.sendConfirm(payload)

            } else if (order.fare > 0 || newlyAppearedTexts.size > 10) {
                // 일반 콜 (스크랩 버퍼로 적재)
                telemetryManager.enqueue(order)
                Log.d(TAG, "📦 스크랩 버퍼에 적재 (일반 콜)")
            } else {
                Log.d(TAG, "🗑️ 의미 없는 부스러기 데이터 (전송 스킵)")
            }
        }

        lastSeenTextCounts = currentTextCounts
        rootNode.recycle()
    }

    private fun extractTextsAndCheckClick(node: AccessibilityNodeInfo?, texts: MutableList<String>) {
        if (node == null) return

        val nodeText = node.text?.toString()?.trim()
        if (!nodeText.isNullOrEmpty()) {
            texts.add(nodeText)
            if (!hasClickedInThisCycle && scrapParser.isHighProfit(nodeText)) {
                Log.d(TAG, "💥 [자동 배차 엔진 발동] 조건 충족 ($nodeText)")
                touchManager.performSimulatedTouch(node)
                hasClickedInThisCycle = true
            }
        }

        val contentDesc = node.contentDescription?.toString()?.trim()
        if (!contentDesc.isNullOrEmpty()) {
            texts.add(contentDesc)
            if (!hasClickedInThisCycle && scrapParser.isHighProfit(contentDesc)) {
                Log.d(TAG, "💥 [자동 배차 엔진 발동] 조건 충족 ($contentDesc)")
                touchManager.performSimulatedTouch(node)
                hasClickedInThisCycle = true
            }
        }

        for (i in 0 until node.childCount) {
            extractTextsAndCheckClick(node.getChild(i), texts)
        }
    }

    private fun getNewlyAppearedTexts(current: Map<String, Int>, last: Map<String, Int>): List<String> {
        val newlyAppeared = mutableListOf<String>()
        for ((text, currentCount) in current) {
            val lastCount = last.getOrDefault(text, 0)
            if (currentCount > lastCount) {
                repeat(currentCount - lastCount) { newlyAppeared.add(text) }
            }
        }
        return newlyAppeared
    }
}
