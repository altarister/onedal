package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

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

        var success = false
        val result = service.dispatchGesture(gesture, object : AccessibilityService.GestureResultCallback() {
            override fun onCompleted(gestureDescription: GestureDescription?) {
                super.onCompleted(gestureDescription)
                Log.d(TAG, "✅ [가로채기 성공!] 화면 좌표 (X:$x, Y:$y) 터치 완료!")
                success = true
            }
            override fun onCancelled(gestureDescription: GestureDescription?) {
                super.onCancelled(gestureDescription)
                Log.e(TAG, "❌ [터치 실패] 시스템에 의해 무시됨")
                success = false
            }
        }, null)

        if (!result) {
            Log.e(TAG, "❌ [권한 오류] 제스처 발생이 차단되었습니다.")
        }
        
        // 주의: dispatchGesture는 비동기이지만, 
        // 일단 이 함수 자체의 반환값은 요청의 성공 여부 위주로 리턴합니다.
        return result
    }
}
