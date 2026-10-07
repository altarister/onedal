package com.onedal.app.core.engine

import com.onedal.app.core.LogTag
import com.onedal.app.core.AppLogger

/**
 * 안전취소 비상 자동취소 타이머
 *
 * 서버로 /detail 전송 후 판결(KEEP/CANCEL) 응답이 일정 시간 내에
 * 오지 않으면 기사님을 보호하기 위해 자동으로 취소를 집행합니다.
 */
/** @param waitBook 서비스의 기다림 장부 — 🔴 판결 몫(DECISION): 콜이 끝나도(세션 몫 거두기) 안 지운다. 기사님 보호 타이머라 끄는 곳은 [cancel] 뿐 */
class SafeCancelTimer(
    private val waitBook: com.onedal.app.core.WaitBook,
    /** 💾 다시 떠도 되살리게 «콜 번호 · 벽시계 마감»을 적어 두는 곳(D1 ②) — 없으면 메모리만 */
    private val store: Store? = null,
    /** 벽시계 — 다시 뜨면 부팅 기준 시계가 이어지지 않아 마감은 벽시계로 적는다 */
    private val wallClock: () -> Long = { System.currentTimeMillis() },
    /** 부팅 기준 시계 — 검사는 가짜 시계를 넣는다(맨 뒤 — `SafeCancelTimer(book) { now }` 가 이것을 받는다) */
    private val clock: () -> Long = { android.os.SystemClock.elapsedRealtime() },
) {
    /** 💾 안전취소 저장 손잡이 — 실물은 원달앱 저장소(`Prefs.SAFE_CANCEL_ARMED`) · 검사는 가짜 */
    interface Store {
        fun put(orderId: String, deadlineWallMs: Long)
        fun get(): Pair<String, Long>?
        fun clear()
    }

    companion object {
        private const val TAG = "1DAL_DEATHVALLEY"
        private const val NAME = "안전취소"
    }

    private var runnable: Runnable? = null

    /**
     * 🔒 **이 타이머가 지키는 콜** (null = 안 걸림). 타이머가 **제 콜 번호를 스스로 쥔다** — 화면이 목록으로 돌아와
     *    세션이 비어도(`SessionManager.reset`) 끄지 않고 울린다(D1 ①). 그 뒤 온 결재도 이 번호로 알아본다(`DecisionReplay`).
     */
    var armedOrderId: String? = null
        private set

    /**
     * ⏱️ **언제 끝나는가** (`SystemClock.elapsedRealtime` 기준 · 0 = 안 도는 중).
     * 관제웹이 «안전취소 12초»를 그리려면 **남은 초**가 있어야 한다
     *.
     * 🔴 벽시계가 아니라 **부팅 기준 시계**를 쓴다 — 폰 시계가 틀어져도 안 흔들린다.
     */
    private var deadlineAt = 0L

    /** ⏱️ 남은 초 (`null` = 안 도는 중). 지난 것은 0 으로 — 음수를 내보내지 않는다 */
    val remainSec: Int?
        get() {
            if (deadlineAt == 0L) return null
            val left = deadlineAt - clock()
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
        if (!session.contractedByApp) return // 앱이 계약하지 않은 콜은 서버가 취소권한 없음

        cancel(session)
        session.isWaitingForDecision = true
        armedOrderId = session.currentOrderId
        AppLogger.roadmap(LogTag.DECISION, "⏳ 안전취소 타이머 가동 (${timeoutMs / 1000}초 대기 → 서버 판결 대기 시작)", "DEATHVALLEY")
        AppLogger.w(TAG, "⏳ 안전취소 타이머 시작: ${timeoutMs / 1000}초 대기...")

        deadlineAt = clock() + timeoutMs
        store?.put(armedOrderId ?: "", wallClock() + timeoutMs)
        arm(timeoutMs, onTimeout)
    }

    /**
     * 💾 **원달앱이 다시 떴을 때 — 적어 둔 안전취소를 되살린다** (D1 ② · 기사님 «가»).
     *    남은 시간이 있으면 그만큼 뒤에, 지났으면 바로 시간 끝(누를 버튼이 없으면 «안 눌렀음» 알림 — `CancelReport`).
     * @return 되살린 콜과 남은 ms (적어 둔 것이 없으면 null)
     */
    fun restore(session: SessionManager, onTimeout: () -> Unit): Pair<String, Long>? {
        val (id, deadlineWall) = store?.get() ?: return null
        val left = (deadlineWall - wallClock()).coerceAtLeast(0L)
        armedOrderId = id
        session.isWaitingForDecision = true
        deadlineAt = clock() + left
        arm(left, onTimeout)
        return id to left
    }

    private fun arm(timeoutMs: Long, onTimeout: () -> Unit) {
        runnable = Runnable {
            if (armedOrderId != null) {   // 🔒 세션이 아니라 제 표시를 본다 — 목록 복귀로 세션이 비어도 운다
                AppLogger.roadmap(LogTag.DECISION, "🚨 안전취소 타임아웃! 서버 응답 없음 → 기사 보호를 위한 강제 배차 취소 집행", "DEATHVALLEY")
                AppLogger.e(TAG, "🚨 안전취소 타임아웃! 기사님 보호를 위해 강제 배차 취소 집행!")
                onTimeout()
            }
        }
        val r = runnable!!
        waitBook.schedule(NAME, com.onedal.app.core.WaitBook.DECISION, timeoutMs) { r.run() }
    }

    /** 🛑 원달앱 서비스가 내려간다 — 도는 것만 멈추고 **적어 둔 것은 남긴다**(다시 뜨면 `restore` · D1 ②) */
    fun pauseForShutdown() {
        waitBook.cancel(NAME)
        runnable = null
    }

    /**
     * 타이머를 취소합니다.
     */
    fun cancel(session: SessionManager) {
        waitBook.cancel(NAME)
        runnable = null
        deadlineAt = 0L
        armedOrderId = null
        store?.clear()
        session.isWaitingForDecision = false
    }
}
