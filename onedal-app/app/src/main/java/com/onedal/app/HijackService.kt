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
 *
 * ★ 핵심 아키텍처: Scan → Judge → Shoot ★
 * 1단계(Scan):  화면 전체 텍스트를 수집 (클릭하지 않음)
 * 2단계(Judge): 파싱된 오더를 4대 필터 조건으로 종합 판정
 * 3단계(Shoot): 조건 통과 시에만 저장해 둔 타겟 노드를 정밀 타격
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
    
    // 원격 퇴근(세션 끊기) 상태 플래그
    private var isKickedOut = false

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.i(TAG, "1DAL Service Connected! [Scan→Judge→Shoot Architecture]")

        // 매니저 초기화
        apiClient = ApiClient(this)
        telemetryManager = TelemetryManager(apiClient) {
            // [세션 끊기] 수신 시 콜백
            isKickedOut = true
            Log.w(TAG, "🔴 원격 서버 명령에 의해 접근성 권한 스위치를 스스로 해제합니다 (disableSelf)")
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                disableSelf()
            }
        }
        scrapParser = ScrapParser(this)  // Context 주입
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
        // 이미 쫓겨난(퇴근) 상태면 어떤 이벤트도 처리하지 않고 무시
        if (isKickedOut) return

        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return
        val rootNode = rootInActiveWindow ?: return

        // ════════════════════════════════════════
        // [1단계: Scan] 화면 전체 텍스트 수집 + 클릭 후보 노드 확보
        // ════════════════════════════════════════
        val allTexts = mutableListOf<String>()
        var candidateNode: AccessibilityNodeInfo? = null

        collectTextsAndCandidateNode(rootNode, allTexts) { node ->
            // 아직 후보가 없고, 숫자(요금처럼 보이는 것)를 발견하면 후보로 기억
            if (candidateNode == null) {
                candidateNode = node
            }
        }

        // 이번 사이클에 새로 나타난 텍스트 블록만 필터링
        val currentTextCounts = allTexts.groupingBy { it }.eachCount()
        val newlyAppearedTexts = getNewlyAppearedTexts(currentTextCounts, lastSeenTextCounts)

        if (newlyAppearedTexts.isNotEmpty()) {
            val rawStr = newlyAppearedTexts.joinToString(", ")
            Log.d(TAG, "=================================")
            Log.d(TAG, "🆕 새로 감지 : $rawStr")

            // ════════════════════════════════════════
            // [2단계: Judge] 파서 엔진으로 오더 구조체 생성 → 4대 필터 AND 검사
            // ════════════════════════════════════════
            val order = scrapParser.parse(newlyAppearedTexts)
            val shouldClick = scrapParser.shouldClick(order)

            if (shouldClick && candidateNode != null) {
                // ════════════════════════════════════════
                // [3단계: Shoot] 조건 통과! 정밀 타격 실행
                // ════════════════════════════════════════
                Log.d(TAG, "💥 [Scan→Judge→Shoot] 4대 조건 통과! 타겟 클릭 실행!")
                touchManager.performSimulatedTouch(candidateNode!!)

                // 선점 성공 → Confirm 파이프라인 진입
                val payload = DispatchBasicRequest(
                    step = "BASIC",
                    deviceId = apiClient.getDeviceId(),
                    order = order,
                    capturedAt = order.timestamp,
                    matchType = "AUTO"
                )
                Log.d(TAG, "🚀 선점 성공! 배차 확정(Confirm) 프로세스 시작")
                apiClient.sendConfirm(payload)

            } else if (shouldClick && candidateNode == null) {
                Log.w(TAG, "⚠️ [Shoot 실패] 4대 조건은 통과했으나 클릭할 요금 노드를 찾지 못했습니다")
            } else if (order.fare > 0 || newlyAppearedTexts.size > 10) {
                // 조건 불일치지만 유의미한 콜 → 스크랩 버퍼로 적재 (빅데이터용)
                telemetryManager.enqueue(order)
                Log.d(TAG, "📦 스크랩 버퍼에 적재 (일반 콜 / 조건 불일치)")
            } else {
                Log.d(TAG, "🗑️ 의미 없는 부스러기 데이터 (전송 스킵)")
            }
        }

        lastSeenTextCounts = currentTextCounts
        rootNode.recycle()
    }

    /**
     * [1단계: Scan] 노드 트리를 순회하며 텍스트만 수집합니다.
     * 클릭 판단은 절대 하지 않습니다.
     * 요금처럼 보이는 숫자 노드를 발견하면 onCandidateFound 콜백으로 알립니다.
     */
    private fun collectTextsAndCandidateNode(
        node: AccessibilityNodeInfo?,
        texts: MutableList<String>,
        onCandidateFound: (AccessibilityNodeInfo) -> Unit
    ) {
        if (node == null) return

        val nodeText = node.text?.toString()?.trim()
        if (!nodeText.isNullOrEmpty()) {
            texts.add(nodeText)
            // 요금 후보 감지: 소수점 없는 정수이고 10~9999 범위 (인성앱 운임 표시: "47" = 47,000원)
            val numValue = nodeText.replace(",", "").toIntOrNull()
            if (numValue != null && numValue in 10..9999 && !nodeText.contains(".")) {
                onCandidateFound(node)
            }
        }

        val contentDesc = node.contentDescription?.toString()?.trim()
        if (!contentDesc.isNullOrEmpty()) {
            texts.add(contentDesc)
        }

        for (i in 0 until node.childCount) {
            collectTextsAndCandidateNode(node.getChild(i), texts, onCandidateFound)
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
