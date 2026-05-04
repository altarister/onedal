package com.onedal.app.core.engine

import android.os.Handler
import android.os.Looper
import com.onedal.app.core.AppLogger

/**
 * 데스밸리 비상 자동취소 타이머
 *
 * 서버로 /detail 전송 후 판결(KEEP/CANCEL) 응답이 일정 시간 내에
 * 오지 않으면 기사님을 보호하기 위해 자동으로 취소를 집행합니다.
 */
class DeathValleyTimer {

    companion object {
        private const val TAG = "1DAL_DEATHVALLEY"
    }

    private val handler = Handler(Looper.getMainLooper())
    private var runnable: Runnable? = null

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
        AppLogger.w(TAG, "⏳ 데스밸리 타이머 시작: ${timeoutMs / 1000}초 대기...")

        runnable = Runnable {
            if (session.isWaitingForDecision) {
                AppLogger.e(TAG, "🚨 데스밸리 타임아웃! 기사님 보호를 위해 강제 배차 취소 집행!")
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
        session.isWaitingForDecision = false
    }
}
