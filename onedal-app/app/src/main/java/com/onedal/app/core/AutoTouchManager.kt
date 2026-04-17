package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.RoadmapLogger

/**
 * 시스템 레벨 스크린 터치 및 제스처 동작 전담 매니저
 */
class AutoTouchManager(private val service: AccessibilityService) {

    companion object {
        private const val TAG = "1DAL_TOUCH"
    }

    /**
     * 특정 UI 노드의 Bounds(좌표 영역)를 계산하여 화면 정중앙을 터치합니다.
     * @param node 클릭 대상 AccessibilityNodeInfo
     * @return 성패 여부
     */
    fun performSimulatedTouch(node: AccessibilityNodeInfo): Boolean {
        val rect = Rect()
        node.getBoundsInScreen(rect)

        val x = rect.centerX().toFloat()
        val y = rect.centerY().toFloat()

        if (x <= 0f || y <= 0f) {
            Log.e(TAG, "❌ [터치 실패] 화면 좌표를 구할 수 없습니다. (X:$x, Y:$y)")
            return false
        }

        val clickPath = Path().apply { moveTo(x, y) }
        val clickStroke = GestureDescription.StrokeDescription(clickPath, 0, 50)
        val gesture = GestureDescription.Builder().addStroke(clickStroke).build()

        val dispatched = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                Log.d(TAG, "✅ [가로채기 성공!] 화면 좌표 (X:$x, Y:$y) 터치 완료!")
                RoadmapLogger.log("버튼 터치 완료 (가로채기 성공) X:$x, Y:$y", "")
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                super.onCancelled(gestureDescription)
                Log.e(TAG, "❌ [터치 실패] 시스템에 의해 무시됨")
            }
        }, null)

        if (!dispatched) {
            Log.e(TAG, "❌ [권한 오류] 제스처 발생이 차단되었습니다.")
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
            RoadmapLogger.log("'$targetText' 버튼 인식 ➡️ 클릭 시도", "")
            val result = performSimulatedTouch(targetNode)
            targetNode.recycle()
            return result
        }
        Log.w(TAG, "⚠️ 요소 찾기 실패: '$targetText'")
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
            Log.d(TAG, "🔙 [백버튼 전송] 글로벌 액션 수행 완료")
        } else {
            Log.e(TAG, "❌ [백버튼 실패] 글로벌 액션 권한 오류")
        }
        return dispatched
    }
}
