package com.onedal.app.core

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo

/** 화면에서 추출된 텍스트 한 칸 (좌표 + 노드 참조 포함) */
data class ScreenTextNode(
    val text: String,
    val node: AccessibilityNodeInfo,
    val rect: Rect
)
