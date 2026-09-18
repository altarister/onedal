package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager

/**
 * 🖼️ **모드 테두리 — 접근성이 켜져 있는 동안 폰 화면 전체 가장자리를 모드 색으로 두른다.**
 *
 * 🟢 녹색 알람 · 🔵 짙은 파랑 자동 · 🟠 주황 직접 — 관제웹 모드 버튼과 같은 색이다.
 * 까닭: 폰 화면만 봐서는 스캐너가 켜졌는지 · 어느 모드인지 알 수 없어 오작동을 못 알아챘다.
 * 스캐너(`HijackService`)가 그리므로 **테두리가 없으면 접근성 꺼짐**이다 — 원달앱 화면을 띄울 필요는 없다.
 *
 * 🔴 **아래 화면을 막지 않는다** — 채우지 않고 테두리만 · `FLAG_NOT_TOUCHABLE` 로 터치는 전부 아래 앱으로.
 * 🔴 **글자가 없다** — 원달앱 스캔이 이 창을 콜 화면으로 읽을 거리가 없다.
 * `TYPE_ACCESSIBILITY_OVERLAY` — 접근성 서비스의 창이라 «다른 앱 위에 표시» 권한이 필요 없다 (`AlarmSignaler` 와 같다).
 */
class ModeFrame(private val service: AccessibilityService) {

    companion object {
        val ALARM_GREEN: Int = 0xFF22C55E.toInt()
        /** 알람 콜 띠(청록 `#00E5FF`)와 헷갈리지 않게 짙은 파랑 */
        val AUTO_BLUE: Int = 0xFF1D4ED8.toInt()
        val MANUAL_GRAY: Int = 0xFF64748B.toInt()
        /** 🐥 햇병아리 노랑 — 가상 체험 모드 (기사님 확정) */
        val SIMULATION_YELLOW: Int = 0xFFF59E0B.toInt()
        /** 테두리 굵기(px) — 굵으면 화면 가장자리 글자·버튼을 가린다 */
        private const val STROKE_PX = 6f

        /** 모드 → 테두리 색. 모르는 값은 직접(회색) — 서버 답을 못 받았을 때의 앱 기본값(`TelemetryManager.currentMode`)과 같다 */
        fun colorOf(mode: String): Int = when (mode) {
            "ALARM" -> ALARM_GREEN
            "AUTO" -> AUTO_BLUE
            "SIMULATION" -> SIMULATION_YELLOW
            else -> MANUAL_GRAY
        }
    }

    private val wm by lazy { service.getSystemService(Context.WINDOW_SERVICE) as WindowManager }
    private val handler = Handler(Looper.getMainLooper())
    private var frame: FrameView? = null
    private var shownMode: String? = null

    private class FrameView(context: Context, color: Int) : View(context) {
        val paint = Paint().apply {
            style = Paint.Style.STROKE
            strokeWidth = STROKE_PX
            this.color = color
        }
        override fun onDraw(canvas: Canvas) {
            val h = STROKE_PX / 2
            canvas.drawRect(h, h, width - h, height - h, paint)
        }
    }

    /** 모드 색으로 두른다 — 이미 떠 있으면 색만 바꾼다. 어느 스레드에서 불러도 된다 */
    fun show(mode: String) {
        handler.post {
            if (mode == shownMode && frame != null) return@post
            val color = colorOf(mode)
            val current = frame
            if (current != null) {
                current.paint.color = color
                current.invalidate()
            } else {
                try {
                    val view = FrameView(service, color)
                    val lp = WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        WindowManager.LayoutParams.MATCH_PARENT,
                        WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                        WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                            or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT,
                    )
                    wm.addView(view, lp)
                    frame = view
                } catch (e: Exception) {
                    AppLogger.w("1DAL_FRAME", "🖼️ [모드 테두리] 못 그렸다: ${e.message}")
                    return@post
                }
            }
            AppLogger.i("1DAL_FRAME", "🖼️ [모드 테두리] ${shownMode ?: "없음"} → $mode")
            shownMode = mode
        }
    }

    /** 걷는다 — 서비스가 내려갈 때 (메인 스레드에서 바로) */
    fun hideNow() {
        handler.removeCallbacksAndMessages(null)
        frame?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        frame = null
        shownMode = null
    }
}
