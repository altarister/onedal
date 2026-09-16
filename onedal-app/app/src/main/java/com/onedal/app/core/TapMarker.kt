package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager

/**
 * 👁️ **앱이 찍은 자리에 자국을 남긴다 — 반투명 회색 원 + «클릭 · 그 카드 글자»** (기사님 지시).
 *
 * 앱이 대신 눌러 주면 기사님은 **어디에 무엇이 눌렸는지**를 볼 수 없다 —
 * 화면은 벌써 다음 장으로 넘어가 있고, 로그는 나중에나 본다.
 * 찍는 순간 그 좌표에 원을 띄우면 «내가 어디를 눌렀나»가 그 자리에서 보인다.
 *
 * 🔴 **남의 화면을 방해하지 않는다** (`AlarmSignaler` 테두리와 같은 규칙):
 *    - `TYPE_ACCESSIBILITY_OVERLAY` — 접근성 서비스의 창이라 「다른 앱 위에 표시」 권한이 필요 없다
 *    - `FLAG_NOT_TOUCHABLE` — 터치를 먹지 않는다. 자국이 떠 있는 동안에도 기사님 손이 그대로 닿는다
 *    - `FLAG_LAYOUT_IN_SCREEN` + `NO_LIMITS` — 접근성 좌표(화면 절대값)와 창 좌표의 원점을 맞춘다
 *      (없으면 상태바 높이만큼 아래에 그려진다 · 버그 대장 #83-①)
 *    - `HOLD_MS` 뒤 스스로 걷힌다
 *
 * 🔴 **이 글자는 접근성으로 읽히지 않는다** — `Canvas` 에 그림으로 칠한 것이라 노드가 아니다.
 *    그래서 우리 스캐너가 이 자국을 «모르는 화면»으로 잘못 읽는 일도 없다.
 *    (반대로, 이 글자를 읽어서 아래 카드 내용을 알아내는 것도 안 된다)
 */
class TapMarker(private val service: AccessibilityService) {

    companion object {
        /** 원 반지름 (폰 픽셀 · 손가락 끝만 한 크기 — 화면을 가리지 않게 작게) */
        const val RADIUS_PX = 30
        /** 이름표에 넣는 카드 글자 길이 — 넘으면 자른다 */
        const val LABEL_MAX = 24

        /** 창 위쪽 y — 찍은 자리에서 반지름만큼 위. 화면 위로는 안 나간다 */
        fun windowTopOf(centerY: Int, radiusPx: Int): Int = maxOf(0, centerY - radiusPx)

        /**
         * 「클릭 · 그 카드 글자」 한 줄. 글자가 없으면 무슨 짓을 했는지만 («클릭» · «뒤로»).
         * `action` 은 **무엇을 했나**다 — 좌표를 찍으면 «클릭», 뒤로 가기면 «뒤로».
         */
        fun labelOf(cardText: String?, action: String = "클릭"): String {
            val flat = cardText?.trim()?.replace(Regex("\\s+"), " ").orEmpty()
            if (flat.isEmpty()) return action
            val body = if (flat.length > LABEL_MAX) flat.take(LABEL_MAX - 1) + "…" else flat
            return "$action · $body"
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val wm get() = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private var markerView: View? = null
    private val hideRunnable = Runnable { hide() }

    /**
     * 👉 여기를 찍었다 — 그 자리에 점을 띄운다.
     *
     * 🔴 **고정된 시간으로 지우지 않는다** (기사님 지시). 지우기를 **메인 줄 맨 뒤**에 세워 두어,
     *    폰이 바빠 멈춰 있으면 그동안 점이 남고 **깨어나는 순간 지워진다.**
     *    그래서 점이 오래 남아 있었다는 것 자체가 «그만큼 폰이 멈춰 있었다»는 뜻이 된다.
     */
    fun show(centerX: Int, centerY: Int, cardText: String?, action: String = "클릭") {
        val label = labelOf(cardText, action)
        /**
         * 🏃 **줄 맨 앞에 세운다** — 화면 그리기는 메인 스레드 한 줄에서 차례로 처리된다.
         * 줄 끝에 세웠더니(`post`) 목록이 길 때 자국이 **12초 늦게** 떴다 (09-16 실측 14:58).
         * 찍기 타이머도 같은 줄이라 함께 밀려, 자국이 뜬 지 0.07초 만에 터치가 나갔다.
         */
        handler.postAtFrontOfQueue {
            hide()
            try {
                val view = object : View(service) {
                    // 진한 회색 한 겹 — 테두리는 두지 않는다 (기사님 지시)
                    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                        style = Paint.Style.FILL
                        color = Color.argb(205, 60, 60, 60)
                    }
                    // 🔴 **글자는 그리지 않는다** (기사님 지시) — 점 하나면 «어디를 눌렀나»가 보인다.
                    //    무엇을 눌렀는지는 로그에 남는다 (아래 `👁️ [클릭 자국]` 줄).
                    override fun onDraw(canvas: Canvas) {
                        canvas.drawCircle(centerX.toFloat(), height / 2f, RADIUS_PX.toFloat(), fill)
                    }
                }
                // 🔴 우리 스캐너가 이 창을 화면 글자로 읽지 않게 한다 (그림이라 원래 안 읽히지만 못 박아 둔다)
                view.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS

                val lp = WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT,
                    RADIUS_PX * 2,
                    WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                        or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                    PixelFormat.TRANSLUCENT,
                ).apply {
                    gravity = android.view.Gravity.TOP or android.view.Gravity.START
                    x = 0
                    y = windowTopOf(centerY, RADIUS_PX)
                }
                wm.addView(view, lp)
                markerView = view
                /**
                 * 🧹 **지우기를 메인 줄 맨 뒤에 세운다** (기사님 지시).
                 * 고정된 시간으로 지우면 폰이 멈춘 사이 점이 먼저 사라지거나, 반대로 화면을 오래 가린다.
                 * 맨 뒤에 세워 두면 **밀린 일이 다 끝나 깨어나는 순간** 지워진다 —
                 * 점이 오래 남았다는 것 자체가 «그만큼 폰이 멈춰 있었다»는 뜻이 된다.
                 */
                handler.removeCallbacks(hideRunnable)
                handler.post(hideRunnable)
                // 🔎 «안 떴다»와 «떴는데 못 봤다»를 로그로 가른다 — 둘의 고칠 곳이 다르다
                AppLogger.i("1DAL_TOUCH", "👁️ [클릭 자국] ($centerX,$centerY) «$label»")
                /**
                 * 📐 **그리자고 한 자리와 실제로 그려진 자리를 함께 남긴다** (기사님 지시 — 점이 어긋난다).
                 * 창 좌표는 시스템이 조정할 수 있다 — 어긋나면 이 두 값이 달라진다.
                 * `post` 로 한 번 미루는 까닭: 창이 화면에 붙어 자리를 잡은 뒤라야 실제 값이 나온다.
                 */
                view.post {
                    val at = IntArray(2)
                    view.getLocationOnScreen(at)
                    val drawnX = at[0] + centerX          // 창 안에서 원은 centerX 자리에 그린다
                    val drawnY = at[1] + view.height / 2  // 창 한가운데에 그린다
                    val gap = if (drawnX == centerX && drawnY == centerY) "맞다" else "어긋났다"
                    AppLogger.i("1DAL_TOUCH", "📐 [자국 자리] 그리려던 ($centerX,$centerY) → 실제 ($drawnX,$drawnY) · $gap " +
                        "(창 왼위 ${at[0]},${at[1]} · 창 높이 ${view.height})")
                }
            } catch (e: Exception) {
                AppLogger.w("1DAL_TOUCH", "👁️ [클릭 자국 실패] ${e.message}")
            }
        }
    }

    /** 🧹 자국을 지금 걷는다 — 미뤘다 찍는 길에서는 **찍는 순간** 걷는다 (기사님 지시) */
    fun hide() {
        handler.removeCallbacks(hideRunnable)
        markerView?.let { try { wm.removeView(it) } catch (_: Exception) {} }
        markerView = null
    }
}
