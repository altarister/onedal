package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.onedal.app.core.AppLogger

/**
 * 🔔 **폰 쪽 소리 — 삑 한 번 + 강한 진동** (기사님 확정).
 * 부르는 곳은 둘이다: 상세 보고를 서버가 받았을 때(`DetailBeep`) · 확정 안 된 벨 콜의 2초 반복(`PreviewRing`).
 * 목록에서 맞는 콜이 떴을 때는 울리지 않는다 — 소리는 상세 보고를 서버가 받은 뒤부터다.
 *
 * ⚠️ 소리는 `ToneGenerator`(미디어 스트림) — 파일도 권한도 필요 없다. 진동은
 *    `VIBRATE` 권한(설치 시 자동 승인)이 매니페스트에 있어야 한다 — 없으면
 *    `SecurityException` 이 조용히 삼켜져 **소리만 나고 진동이 없는** 반쪽이 된다.
 */
class AlarmSignaler(private val service: AccessibilityService, private val waitBook: WaitBook) {


    companion object {
        /** 소리 길이 */
        private const val BEEP_MS = 120

        /**
         * 🥇 한 스캔에서 여러 콜이 통과하면 **요금 최고 하나만** 연다 (기사님 확정).
         * 같으면 먼저 본 콜, 빈 목록이면 -1.
         * (한 스캔에 여러 건이 동시에 통과하는 일은 실제로 있다)
         */
        fun pickBestIndex(fares: List<Int>): Int {
            var best = -1
            var bestFare = Int.MIN_VALUE
            fares.forEachIndexed { i, f -> if (f > bestFare) { bestFare = f; best = i } }
            return best
        }
    }

    private var beepNo = 0L
    /** 🔔 삑 한 번 + 강한 진동 — 상세 보고를 서버가 받았을 때 · 확정 안 된 벨 콜의 2초 반복(`DetailBeep` · `PreviewRing` · 29 P4) */
    fun beepAndVibrate() {
        beepOnce()
        vibrateStrong()
    }

    // ── 소리 — 짧게 한 번 (기사님 «한 번으로») ──
    private fun beepOnce() {
        try {
            val tone = ToneGenerator(AudioManager.STREAM_MUSIC, 100)
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, BEEP_MS)
            // ⏳ 부를 때마다 번호 — 알람 둘이 빨리 겹쳐도 앞 소리의 «풀기»를 지우지 않게(같은 이름이면 장부가 앞 것을 거둔다)
            val no = ++beepNo
            waitBook.schedule("소리 풀기 #$no", WaitBook.SERVICE, 500) { tone.release() }
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
}
