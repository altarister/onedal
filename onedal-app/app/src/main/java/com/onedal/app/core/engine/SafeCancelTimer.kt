package com.onedal.app.core.engine

import android.os.Handler
import android.os.Looper
import com.onedal.app.core.AppLogger

/**
 * 안전취소 비상 자동취소 타이머
 *
 * 서버로 /detail 전송 후 판결(KEEP/CANCEL) 응답이 일정 시간 내에
 * 오지 않으면 기사님을 보호하기 위해 자동으로 취소를 집행합니다.
 */
class SafeCancelTimer {

    companion object {
        private const val TAG = "1DAL_DEATHVALLEY"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var runnable: Runnable? = null

    /**
     * ⏱️ **언제 끝나는가** (`SystemClock.elapsedRealtime` 기준 · 0 = 안 도는 중).
     * 관제웹이 «안전취소 12초»를 그리려면 **남은 초**가 있어야 한다
     * (`docs/기획/폰_상태바.md` 0단계 ① — 다섯 칸 중 하나).
     * 🔴 벽시계가 아니라 **부팅 기준 시계**를 쓴다 — 폰 시계가 틀어져도 안 흔들린다.
     */
    private var deadlineAt = 0L

    /** ⏱️ 남은 초 (`null` = 안 도는 중). 지난 것은 0 으로 — 음수를 내보내지 않는다 */
    val remainSec: Int?
        get() {
            if (deadlineAt == 0L) return null
            val left = deadlineAt - android.os.SystemClock.elapsedRealtime()
            return if (left <= 0L) 0 else ((left + 999L) / 1000L).toInt()
        }

    /**
     * 타이머를 시작합니다.
     *
     * @param timeoutMs 타임아웃 밀리초 (기본 30000)
     * @param session 세션 매니저 (isWaitingForDecision 관리)
     * @param onTimeout 타임아웃 시 호출될 콜백
     */
    fun start(timeoutMs: Long, session: SessionManager, onTimeout: () -> Unit) {
        if (!session.isAutoActive) return // MANUAL이면 서버가 취소권한 없음

        cancel(session)
        session.isWaitingForDecision = true
        AppLogger.roadmap("⏳ 안전취소 타이머 가동 (${timeoutMs / 1000}초 대기 → 서버 판결 대기 시작)", "DEATHVALLEY")
        AppLogger.w(TAG, "⏳ 안전취소 타이머 시작: ${timeoutMs / 1000}초 대기...")

        deadlineAt = android.os.SystemClock.elapsedRealtime() + timeoutMs
        runnable = Runnable {
            if (session.isWaitingForDecision) {
                AppLogger.roadmap("🚨 안전취소 타임아웃! 서버 응답 없음 → 기사 보호를 위한 강제 배차 취소 집행", "DEATHVALLEY")
                AppLogger.e(TAG, "🚨 안전취소 타임아웃! 기사님 보호를 위해 강제 배차 취소 집행!")
                onTimeout()
            }
        }
        handler.postDelayed(runnable!!, timeoutMs)
    }

    /**
     * 타이머를 취소합니다.
     */
    fun cancel(session: SessionManager) {
        runnable?.let { handler.removeCallbacks(it) }
        runnable = null
        deadlineAt = 0L
        session.isWaitingForDecision = false
    }
}
