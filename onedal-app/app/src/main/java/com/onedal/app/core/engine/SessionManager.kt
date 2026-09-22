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

    /**
     * 🔴 **콜의 출신 — «누가 눌렀나» 를 파생하는 유일한 자리** (규칙 ③).
     *
     * 기기 모드(자동·알람·대기)는 **스위치**이고, 출신은 **실제로 누른 주체**다.
     * 켠 채 기사님이 끼어들어 누르는 경우가 있어서 둘이 갈린다.
     *
     * 🔴 스위치로 출신을 정하면 «자동 스위치인 채 손으로 확정»한 콜이 `"AUTO_CLICK"` 이 되어
     *    서버의 직접콜 보호(`type.startsWith("MANUAL")`)가 안 걸리고, **리스트로 돌아오는 순간
     *    기사님의 콜이 강제 취소**된다 (규칙 ①). 알람 모드에서는 서버가 모르는 `"ALARM_CLICK"` 이 생긴다.
     *    **여기서 파생하면 모드 값이 몇 개로 늘든 출신은 늘 둘이다.**
     */
    val clickOrigin: String
        get() = if (isAutoActive) "AUTO" else "MANUAL"

    /**
     * 🖱️ **잡은 방식 — 6하원칙의 «어떻게», 기록 전용** (기사님 확정).
     *
     * 원장(`orders.capturedVia`)에 자동·알람·직접 셋으로 남긴다 — 일지가
     * *"알람 모드가 실제로 벌어줬나"* 를 답하게 하기 위해서다.
     *
     * 🔴 **보호 분기에는 절대 쓰지 않는다.** 서버의 직접콜 보호는 `clickOrigin`(둘)이
     *    만든 matchType 만 본다 — 모드 이름이 출신으로 새어 기사님 콜이 취소된 #75 를
     *    기록 칸이 다시 밟으면 안 된다. 파생은 여기 한 곳뿐이다.
     */
    fun capturedVia(currentMode: String): String = when {
        isAutoActive -> "AUTO"
        currentMode == "ALARM" -> "ALARM"
        else -> "MANUAL"
    }

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

    /**
     * 🎯 **알람이 방금 찍은 리스트 카드** — 그 상세가 어느 콜인지 **이미 아는 답**이다 (기사님 지시).
     *
     * 앱이 직접 그 줄을 찍고 들어간 상세는 대조하지 않는다 — 상세 글자로 되찾으면
     * 길 이름(«태전동로») ↔ 동 이름(«태전») 차이로 못 맞추는 판이 있다.
     * 🔴 손으로 연 상세는 `KakaoPickerParser.matchListCard` 로 찾는다.
     */
    var alarmTappedCard: SimplifiedOfficeOrder? = null

    /**
     * 알람이 그 카드를 찍은 시각(부팅 기준). `KakaoPickerKeywords.detailOpener` 로 «알람이 연 상세인가»를 가린다.
     * ⚠️ `HijackService.alarmTapAtMs` 와 **일부러 따로 둔다** — 그쪽은 `[상세 대기]` 로그의 «연 쪽»을
     *    찍고 바로 0 으로 비우고, 이쪽은 미리보기가 카드를 되찾을 때까지 남아 있어야 한다.
     */
    var alarmTappedAtMs: Long = 0L

    /** 동명이동 3단계 검증 상태 (null=일반, VERIFY/ACCEPT/CANCEL) */
    var cautionAction: String? = null

    /**
     * 👀 **미리보기 콜** — 기사님이 확정을 누르기 전에 팝업 3장을 읽어 판정만 받아 보는 중
     * (기사님 확정).
     *
     * 🔴 아직 안 잡은 콜이라 **인성에는 아무 일도 일어나지 않았다.** 서버는 이 표시를 보고
     *    취소 카운트(배차망 10회 패널티)에서 뺀다. 확정 화면에 들어가면 딱지를 벗는다.
     *
     * ⚠️ 손으로 연 상세(`isAutoActive == false`)에서만 켜진다. 앱이 자동으로 연 상세는
     *    선점이 생명이라 팝업을 먼저 열지 않는다.
     */
    var isPreview: Boolean = false

    /** 📸 픽커 상세 화면 스냅샷 OCR 판독 진행 중 여부 (중복 트리거 및 0.33초 제한 방어) */
    var isVerifyingSnapshot: Boolean = false

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
     * 세션 ID가 없으면 **출신**+타임스탬프로 자동 생성합니다.
     *
     * ⚠️ 기기 모드가 아니라 출신(`clickOrigin`)을 쓴다 — 모드로 만들면 `"ALARM-…"` 처럼
     *    서버가 모르는 id 가 생긴다. 출신은 늘 둘뿐이다.
     */
    fun ensureOrderId() {
        if (currentOrderId.isEmpty()) {
            currentOrderId = "$clickOrigin-${System.currentTimeMillis()}"
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
        alarmTappedCard = null
        alarmTappedAtMs = 0L
        currentOrderId = ""
        isAutoActive = false
        isWaitingForDecision = false
        cautionAction = null
        isPreview = false
        isVerifyingSnapshot = false
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
