package com.onedal.app.core.engine

import com.onedal.app.core.AppLogger
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 단일 콜 처리 세션의 상태를 추적하는 매니저
 *
 * HijackService에 흩어져 있던 세션 변수 9개를 한 곳에서 관리합니다.
 * 리스트로 복귀하면 reset()으로 모든 상태를 초기화합니다.
 */
class SessionManager {

    companion object {
        private const val TAG = "1DAL_SESSION"
    }

    // ── 세션 변수 ──
    /** 현재 처리 중인 오더 ID */
    var currentOrderId: String = ""
        private set

    /** AUTO 매크로가 클릭해서 시작된 세션인지 여부 */
    var isAutoActive: Boolean = false

    /** 이미 /confirm을 보냈는지 (중복 전송 방지) */
    var isDetailScrapSent: Boolean = false

    /** 서버 판결(KEEP/CANCEL) 대기 중인지 */
    var isWaitingForDecision: Boolean = false

    /** 상세 수집 상태 */
    var collectState: CollectState = CollectState.IDLE

    /** 팝업에서 수집한 텍스트 누적 버퍼 */
    var accumulatedDetailText: String = ""

    /** 상세 화면에서 참조할 원본 오더 데이터 */
    var lastDetailOrder: SimplifiedOfficeOrder? = null

    /** 동명이동 3단계 검증 상태 (null=일반, VERIFY/ACCEPT/CANCEL) */
    var cautionAction: String? = null

    /**
     * 👀 **미리보기 콜** — 기사님이 확정을 누르기 전에 팝업 3장을 읽어 판정만 받아 보는 중
     * (기사님 확정 2026-08-22 · 용어집 §9).
     *
     * 🔴 아직 안 잡은 콜이라 **인성에는 아무 일도 일어나지 않았다.** 서버는 이 표시를 보고
     *    취소 카운트(배차망 10회 패널티)에서 뺀다. 확정 화면에 들어가면 딱지를 벗는다.
     *
     * ⚠️ 손으로 연 상세(`isAutoActive == false`)에서만 켜진다. 앱이 자동으로 연 상세는
     *    선점이 생명이라 팝업을 먼저 열지 않는다 — 2026-08-09 에 "잡기 전 미리 계산"을
     *    제거한 바로 그 이유다.
     */
    var isPreview: Boolean = false

    // ── CollectState enum ──
    enum class CollectState {
        IDLE,
        WAITING_FOR_MEMO_POPUP,
        WAITING_FOR_PICKUP_POPUP,
        WAITING_FOR_DROPOFF_POPUP,
        DONE
    }

    /**
     * 세션 ID를 지정합니다.
     */
    fun setOrderId(id: String) {
        currentOrderId = id
    }

    /**
     * 세션 ID가 없으면 모드+타임스탬프로 자동 생성합니다.
     */
    fun ensureOrderId(mode: String) {
        if (currentOrderId.isEmpty()) {
            currentOrderId = "$mode-${System.currentTimeMillis()}"
        }
    }

    /**
     * 모든 세션 상태를 초기화합니다.
     * 리스트(LIST) 복귀, 2차 필터 실패, 판결 집행 완료 시 호출됩니다.
     *
     * @param onReset 외부 리소스 정리 콜백 (안전취소 타이머 취소, 텔레메트리 flush 등)
     */
    fun reset(onReset: (() -> Unit)? = null) {
        isDetailScrapSent = false
        collectState = CollectState.IDLE
        accumulatedDetailText = ""
        lastDetailOrder = null
        currentOrderId = ""
        isAutoActive = false
        isWaitingForDecision = false
        cautionAction = null
        isPreview = false
        onReset?.invoke()
        AppLogger.roadmap("🔄 세션 및 콜 잡기 상태 완전 초기화 (새로운 타겟 대기)", "SESSION")
        AppLogger.i(TAG, "🔄 세션 상태 완전 초기화")
    }

    /**
     * 현재 활성 세션이 있는지 여부
     */
    fun hasActiveSession(): Boolean {
        return isAutoActive || isWaitingForDecision || currentOrderId.isNotEmpty()
    }
}
