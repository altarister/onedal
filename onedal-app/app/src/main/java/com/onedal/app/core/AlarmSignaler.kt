package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import com.onedal.app.core.AppLogger

/**
 * 🔔 **알람 모드의 폰 쪽 신호 — 소리 두 번 + 강한 진동 + 통과한 콜 줄에 테두리**
 * (기사님 확정 2026-08-30 · `docs/지금/기기_모드.md` §6-②④ · 2단계).
 *
 * 알람 모드에서 앱은 콜을 **안 누른다.** 기사님이 인성 리스트에서 직접 누르시는데,
 * 관제웹 소리만으로는 **어느 줄인지**를 모른다 — 그래서 폰이 그 줄을 테두리로 가리킨다.
 *
 * 🔴 **인성앱 글자를 가리지 않고, 터치를 먹지 않는다** (기사님 확정).
 *    - 채우기 없는 **테두리만** 그린다 (`Paint.Style.STROKE`)
 *    - `FLAG_NOT_TOUCHABLE` — 그 줄을 눌러야 하므로 터치는 전부 인성앱으로 통과
 *    - `TYPE_ACCESSIBILITY_OVERLAY` — 접근성 서비스의 창이라
 *      「다른 앱 위에 표시」(`SYSTEM_ALERT_WINDOW`) 권한을 기사님이 켤 필요가 없다
 *
 * 🔇 **«먼저 오는 것»으로 걷는다** (§6-③): 그 콜이 리스트에서 사라짐 / 10초 경과 /
 *    리스트가 아닌 화면으로 이동. 남의 화면 위에 테두리가 떠돌면 안 된다.
 *
 * 📐 **좌표는 세 겹으로 어긋난다 — 첫 실검증(08-30)에서 셋 다 났다** (버그 대장 #83):
 *    ① 접근성의 `getBoundsInScreen` 은 상태바 포함 **화면 절대 좌표**인데, 오버레이 창의
 *       y 는 기본으로 상태바 **아래**가 원점이라 그만큼 아래로 밀린다
 *       → `FLAG_LAYOUT_IN_SCREEN`(+`NO_LIMITS`) 으로 창도 절대 좌표를 쓰게 한다
 *    ② 요금 닻 노드는 글자 한 줄(66px)이다 — 픽커 카드는 요금 위아래로 태그줄·지역줄이
 *       있어서 닻만 두르면 카드 반 토막이다 → 파서가 알려주는 띠 반높이로 키운다(`borderSpan`)
 *    ③ 리스트가 갱신되면 카드가 움직인다 — 테두리가 fire 시점 자리에 붙박이면
 *       빈 줄을 가리킨다 → 매 스캔에서 그 콜의 새 위치로 **따라 옮긴다**(`onScan`)
 *
 * ⚠️ 소리는 `ToneGenerator`(미디어 스트림) — 파일도 권한도 필요 없다. 진동은
 *    `VIBRATE` 권한(설치 시 자동 승인)이 매니페스트에 있어야 한다 — 없으면
 *    `SecurityException` 이 조용히 삼켜져 **소리만 나고 진동이 없는** 반쪽이 된다.
 */
class AlarmSignaler(private val service: AccessibilityService) {

    companion object {
        /** 🔇 테두리·알람이 스스로 걷히는 시간 — 관제웹 띠(FILTER_ALARM_HOLD_MS)와 같은 값 */
        const val HOLD_MS = 10_000L
        /** 소리 두 번 사이 간격 — 관제웹(soundManager 220ms)과 같은 리듬 */
        private const val BEEP_GAP_MS = 220L
        private const val BEEP_MS = 120

        /**
         * 📐 요금 닻 줄에서 **카드 전체의 세로 구간**을 만든다 (#83-② · 순수 함수, 검사용 공개).
         * 닻 중심에서 위아래로 `max(닻 반높이, 띠 반높이)` — 픽커는 파서의 띠 반높이(±60)가
         * 태그줄·지역줄까지 덮고, 인성(0)은 닻 줄 그대로다.
         */
        fun borderSpan(anchorTop: Int, anchorBottom: Int, bandHalfPx: Int): Pair<Int, Int> {
            val centerY = (anchorTop + anchorBottom) / 2
            val half = maxOf((anchorBottom - anchorTop) / 2, bandHalfPx)
            return Pair(centerY - half, centerY + half)
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val wm get() = service.getSystemService(Context.WINDOW_SERVICE) as WindowManager

    private var borderView: View? = null
    private var borderLp: WindowManager.LayoutParams? = null
    /** 지금 테두리가 가리키는 콜의 지문 — 다음 스캔에 이 콜이 없으면 걷는다 */
    private var activeHash: Int? = null
    /** 이 콜 카드의 띠 반높이 — 따라 옮길 때(#83-③) 같은 크기로 다시 두르기 위해 */
    private var activeBandHalfPx: Int = 0
    private val hideRunnable = Runnable { hide("10초 경과") }

    /** 🔔 필터를 통과한 콜이 리스트에 떴다 — 소리·진동·테두리를 한 번에 */
    fun fire(anchorRect: Rect, bandHalfPx: Int, orderHash: Int) {
        beepTwice()
        vibrateStrong()
        val (top, bottom) = borderSpan(anchorRect.top, anchorRect.bottom, bandHalfPx)
        activeBandHalfPx = bandHalfPx
        showBorder(top, bottom, orderHash)
        AppLogger.i("1DAL_ALARM", "🔔 [알람] 통과 콜 카드에 테두리 ($top~$bottom) · 소리 2 · 진동")
    }

    /**
     * 👁️ 매 리스트 스캔이 끝날 때 부른다 — **그 콜이 사라졌으면 걷고, 움직였으면 따라간다** (#83-③).
     * (사라짐 = 내가 잡았거나 남이 가져갔거나 — 어느 쪽이든 더 가리킬 것이 없다)
     */
    fun onScan(seenAnchors: Map<Int, Rect>) {
        val h = activeHash ?: return
        val anchor = seenAnchors[h] ?: run { hide("콜이 리스트에서 사라짐"); return }
        val view = borderView ?: return
        val lp = borderLp ?: return
        val (top, bottom) = borderSpan(anchor.top, anchor.bottom, activeBandHalfPx)
        val newY = top - 8
        if (lp.y != newY) {
            lp.y = newY
            lp.height = (bottom - top) + 16
            try { wm.updateViewLayout(view, lp) } catch (_: Exception) {}
        }
    }

    /** 리스트가 아닌 화면으로 갔다 — 남의 화면 위에 테두리를 남기지 않는다 */
    fun onLeaveList() {
        if (activeHash != null) hide("리스트 이탈")
    }

    // ── 소리 — 짧게 두 번 (관제웹과 같은 리듬) ──
    private fun beepTwice() {
        try {
            val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, BEEP_MS)
            handler.postDelayed({
                tone.startTone(ToneGenerator.TONE_PROP_BEEP, BEEP_MS)
                handler.postDelayed({ tone.release() }, 500)
            }, BEEP_GAP_MS)
        } catch (e: Exception) {
            AppLogger.w("1DAL_ALARM", "🔇 소리 실패: ${e.message}")
        }
    }

    // ── 진동 — 강하게 (운전 중 네비 소리에 소리가 묻힐 때의 두 번째 통로) ──
    private fun vibrateStrong() {
        try {
            val vib = if (Build.VERSION.SDK_INT >= 31) {
                (service.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                service.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            vib.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 300, 150, 300), -1))
        } catch (e: Exception) {
            AppLogger.w("1DAL_ALARM", "📳 진동 실패: ${e.message}")
        }
    }

    // ── 테두리 — 그 카드를 두른다. 채우지 않는다 ──
    private fun showBorder(spanTop: Int, spanBottom: Int, orderHash: Int) {
        hide(null)   // 이전 것이 있으면 먼저 걷는다 — 콜 하나만 가리킨다
        try {
            val view = object : View(service) {
                private val paint = Paint().apply {
                    style = Paint.Style.STROKE          // 🔴 채우면 글자를 가린다
                    strokeWidth = 8f
                    // 청록 — 판정 색(🔵🟢🟡🔴)·지도 색(상차 초록·하차 빨강)과 안 겨루는 색
                    color = Color.parseColor("#00E5FF")
                }
                override fun onDraw(canvas: Canvas) {
                    canvas.drawRoundRect(4f, 4f, width - 4f, height - 4f, 16f, 16f, paint)
                }
            }
            val lp = WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                (spanBottom - spanTop) + 16,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    // 🔴 #83-① — 접근성 좌표(화면 절대값)와 창 좌표의 원점을 맞춘다.
                    //    이 두 플래그가 없으면 창의 y 가 상태바 아래를 0 으로 세어
                    //    테두리가 상태바 높이만큼 아래(다음 카드와의 사이)에 그려진다
                    or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT,
            ).apply {
                gravity = android.view.Gravity.TOP or android.view.Gravity.START
                x = 0
                y = spanTop - 8
            }
            wm.addView(view, lp)
            borderView = view
            borderLp = lp
            activeHash = orderHash
            handler.removeCallbacks(hideRunnable)
            handler.postDelayed(hideRunnable, HOLD_MS)
        } catch (e: Exception) {
            AppLogger.w("1DAL_ALARM", "🖼️ 테두리 실패: ${e.message}")
        }
    }

    private fun hide(why: String?) {
        handler.removeCallbacks(hideRunnable)
        borderView?.let {
            try { wm.removeView(it) } catch (_: Exception) {}
        }
        if (borderView != null && why != null) AppLogger.d("1DAL_ALARM", "🔇 [테두리 걷음] $why")
        borderView = null
        borderLp = null
        activeHash = null
    }
}
