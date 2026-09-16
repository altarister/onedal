package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import com.onedal.app.core.AppLogger
import android.view.accessibility.AccessibilityNodeInfo

/**
 * 시스템 레벨 스크린 터치 및 제스처 동작 전담 매니저
 */
class AutoTouchManager(private val service: AccessibilityService) {

    companion object {
        private const val TAG = "1DAL_TOUCH"
    }

    /** 👁️ 찍은 자리를 눈으로 보이게 하는 자국 — 기사님이 «어디에 무엇이 눌렸나»를 그 자리에서 본다 */
    private val tapMarker by lazy { TapMarker(service) }

    /**
     * 특정 UI 노드의 Bounds(좌표 영역)를 계산하여 화면 정중앙을 터치합니다.
     * @param node 클릭 대상 AccessibilityNodeInfo
     * @return 성패 여부
     */
    fun performSimulatedTouch(node: AccessibilityNodeInfo, leftShiftPx: Int = 0): Boolean {
        /**
         * 🔴 **찍기 직전에 다시 잰다** (2026-09-13 · 라이브 오배차 조사에서 신설).
         *
         * `AccessibilityNodeInfo` 는 **만들어질 때의 사각형을 품고 다니는 사본**이다 —
         * `getBoundsInScreen` 은 앱에 다시 묻지 않고 그 품은 값을 돌려준다. 스캔은 노드
         * 트리를 통째로 훑느라 수백 밀리초가 걸리고, 그동안 리스트가 갱신되면 **잰 자리와
         * 누르는 자리가 달라진다.** 09-13 실측에서 알람이 456밀리초 간격으로 두 번 울렸다 —
         * 그 사이에 카드가 움직인다.
         *
         * `refresh()` 는 앱에 지금 값을 다시 묻는다. 실패하면 **그 노드는 이미 사라진 것**이라
         * 누르지 않는다 — 사라진 카드 자리에는 다른 것이 와 있다 (규칙 ④).
         */
        if (!node.refresh()) {
            AppLogger.w(TAG, "🛑 [터치 보류] 노드가 사라졌다 — 잰 자리와 누를 자리가 다르다. 누르지 않는다")
            return false
        }

        val rect = Rect()
        node.getBoundsInScreen(rect)

        /**
         * 👈 **요금 자리를 그대로 찍지 않는다** (`TapShift` · 기사님 지시).
         * 요금 닻과 상세의 «수락하기»가 둘 다 오른쪽 아래라, 화면이 바뀌는 찰나에 그 자리를 찍으면 곧 계약이다.
         * 같은 줄에서 왼쪽으로 옮겨 찍으면 상세로 똑같이 들어가고, 잘못 눌려도 그 자리는 «넘기기»다.
         */
        val x = TapShift.leftOf(rect.centerX(), leftShiftPx).toFloat()
        val y = rect.centerY().toFloat()

        if (x <= 0f || y <= 0f) {
            AppLogger.e(TAG, "❌ [터치 실패] 화면 좌표를 구할 수 없습니다. (X:$x, Y:$y)")
            return false
        }

        /**
         * 🔴 **보내는 순간에 남긴다** — 아래 `onCompleted` 는 **2~4초 늦게** 온다
         *    (09-13 실측: 12:00:10.387 에 보낸 것이 12:00:12.676 에 찍혔다). 콜백이
         *    서비스 메인 핸들러에 줄을 서기 때문이다. 완료 로그만 보면 **시각이 거짓말한다.**
         */
        AppLogger.i(TAG, "👉 [터치 발사] (X:$x, Y:$y) \"${node.text?.toString()?.take(20) ?: ""}\"")

        // 👁️ 찍는 자리에 자국을 남긴다 — 화면은 곧 넘어가고 로그는 나중에나 본다 (`TapMarker`)
        tapMarker.show(x.toInt(), y.toInt(), node.text?.toString() ?: node.contentDescription?.toString())

        val clickPath = Path().apply { moveTo(x, y) }
        val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, 50)
        val gesture = GestureDescription.Builder().addStroke(clickStroke).build()

        val dispatched = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                AppLogger.d(TAG, "✅ [가로채기 성공!] 화면 좌표 (X:$x, Y:$y) 터치 완료!")
                AppLogger.roadmap("버튼 터치 완료 (가로채기 성공) X:$x, Y:$y", "")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                super.onCancelled(gestureDescription)
                AppLogger.e(TAG, "❌ [터치 실패] 시스템에 의해 무시됨")
            }
        }, null)

        if (!dispatched) {
            AppLogger.e(TAG, "❌ [권한 오류] 제스처 발생이 차단되었습니다.")
        }

        return dispatched
    }

    /**
     * 화면 상의 특정 텍스트를 포함하는 노드를 찾아 클릭합니다.
     * @param rootNode 최상위 화면 노드
     * @param targetText 찾을 텍스트 (명확한 식별을 위해 포함 여부 또는 시작 여부 검사)
     * @param isStartsWith true면 startsWith 매칭, false면 정확한 매칭
     * @return 성패 여부
     */
    fun findAndClickByText(rootNode: AccessibilityNodeInfo?, targetText: String, isStartsWith: Boolean = false): Boolean {
        val targetNode = findNodeByText(rootNode, targetText, isStartsWith)
        if (targetNode != null) {
            AppLogger.roadmap("'$targetText' 버튼 인식 ➡️ 클릭 시도", "")
            val result = performSimulatedTouch(targetNode)
            targetNode.recycle()
            return result
        }
        AppLogger.w(TAG, "⚠️ 요소 찾기 실패: '$targetText'")
        return false
    }

    /**
     * 노드 트리를 재귀적으로 순회하며 텍스트를 찾습니다.
     */
    private fun findNodeByText(node: AccessibilityNodeInfo?, targetText: String, isStartsWith: Boolean): AccessibilityNodeInfo? {
        if (node == null) return null

        val nodeText = node.text?.toString()?.trim() ?: ""
        val contentDesc = node.contentDescription?.toString()?.trim() ?: ""

        val isMatch = if (isStartsWith) {
            nodeText.startsWith(targetText) || contentDesc.startsWith(targetText)
        } else {
            nodeText == targetText || contentDesc == targetText
        }

        if (isMatch) return AccessibilityNodeInfo.obtain(node)

        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            val found = findNodeByText(child, targetText, isStartsWith)
            if (found != null) {
                child?.recycle()
                return found
            }
            child?.recycle()
        }
        return null
    }

    /**
     * 시스템 [뒤로 가기] 버튼 기능을 수행합니다.
     */
    fun performBack(): Boolean {
        val dispatched = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        if (dispatched) {
            AppLogger.d(TAG, "🔙 [백버튼 전송] 글로벌 액션 수행 완료")
        } else {
            AppLogger.e(TAG, "❌ [백버튼 실패] 글로벌 액션 권한 오류")
        }
        return dispatched
    }
}
