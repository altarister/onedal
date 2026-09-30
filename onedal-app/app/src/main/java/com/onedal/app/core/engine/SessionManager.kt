package com.onedal.app.core.engine

import com.onedal.app.core.AppLogger
import com.onedal.app.core.LogTag
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

    /**
     * 🖐️ **앱이 목록에서 콜을 눌러 이 상세를 열었다** — 모드를 가리지 않는다 (배차망_모드표.md 순서 ⑦).
     * «지금 잡는 중이라 새 콜을 누르지 않는다» · «목록에서 쥔 콜을 쓴다» · «2차 필터 탈락이면 앱이 빠져나온다»가 이 값을 읽는다.
     */
    var openedByApp: Boolean = false

    /**
     * ✍️ **앱이 이 콜의 계약 버튼(확정)을 누른다** — 서버에 «누가 계약했나»를 알리는 원천.
     * 세우는 곳은 목록 클릭 한 줄이다. 체험·알람에서 앱이 연 콜은 계약하지 않으므로 거짓이다.
     * 안전취소 · 결재 뒤 버튼 · 서버의 기사님 콜 보호가 이 값을 읽는다.
     */
    var contractedByApp: Boolean = false

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
        get() = if (contractedByApp) "AUTO" else "MANUAL"

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
        contractedByApp -> "AUTO"
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
     * 🎯 **앱이 방금 찍은 리스트 카드** — 그 상세가 어느 콜인지 **이미 아는 답**이다 (기사님 지시).
     *
     * 앱이 직접 그 줄을 찍고 들어간 상세는 대조하지 않는다 — 상세 글자로 되찾으면
     * 길 이름(«태전동로») ↔ 동 이름(«태전») 차이로 못 맞추는 판이 있다.
     * 🔴 손으로 연 상세는 `KakaoPickerParser.matchListCard` 로 찾는다.
     */
    var alarmTappedCard: SimplifiedOfficeOrder? = null

    /**
     * 앱이 그 카드를 찍은 시각(부팅 기준). `KakaoPickerKeywords.detailOpener` 로 «알람이 연 상세인가»를 가린다.
     * ⚠️ `HijackService.alarmTapAtMs` 와 **일부러 따로 둔다** — 그쪽은 `[상세 대기]` 로그의 «연 쪽»을
     *    찍고 바로 0 으로 비우고, 이쪽은 미리보기가 카드를 되찾을 때까지 남아 있어야 한다.
     */
    var alarmTappedAtMs: Long = 0L
    /** 🏁 그 콜을 누르기로 정한 목록 읽기의 시각(부팅 기준) — «발견→누름 ms» (먼저 가져감 한 줄) */
    var alarmFoundAtMs: Long = 0L

    /** 📏 인성 팝업 3장 채우기를 시작한 시각(부팅 기준) — 채우기에 걸린 시간을 로그로 남긴다 */
    var fillStartedAtMs: Long = 0L

    /**
     * 👀 **미리보기 콜** — 기사님이 확정을 누르기 전에 팝업 3장을 읽어 판정만 받아 보는 중
     * (기사님 확정).
     *
     * 🔴 아직 안 잡은 콜이라 **인성에는 아무 일도 일어나지 않았다.** 서버는 이 표시를 보고
     *    취소 카운트(배차망 10회 패널티)에서 뺀다. 확정 화면에 들어가면 딱지를 벗는다.
     *
     * ⚠️ 앱이 계약하지 않는 콜(`contractedByApp == false` — 기사님이 연 상세 · 체험 · 알람)에서 켜진다.
     *    인성은 누가 열었든 팝업 3장으로 채운 뒤에 보고하고, 앱이 계약하는 콜은 이 표시 없이 확정한다.
     */
    var isPreview: Boolean = false

    /**
     * ✋ **보고 보류** — 기사님이 손으로 연 콜인데 전체 주소를 못 채워 서버에 보내지 않았다(기사님 «가»).
     * 기사님이 확정(픽커는 수락)하시면 그건 기사님이 잡은 콜이라, 확정 화면·수락 감지가 이 표시를 보고 짧은 주소로라도 상세 보고한다.
     */
    var heldUnfilled: Boolean = false

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
        heldUnfilled = false
        collectState = CollectState.IDLE
        accumulatedDetailText = ""
        lastDetailOrder = null
        alarmTappedCard = null
        alarmTappedAtMs = 0L
        alarmFoundAtMs = 0L
        currentOrderId = ""
        openedByApp = false
        contractedByApp = false
        isWaitingForDecision = false
        fillStartedAtMs = 0L
        isPreview = false
        isVerifyingSnapshot = false
        onReset?.invoke()
        AppLogger.i(TAG, LogTag.CALL_STAGE, "🔄 세션 상태 완전 초기화")
    }

    /**
     * 현재 활성 세션이 있는지 여부
     */
    fun hasActiveSession(): Boolean {
        return openedByApp || isWaitingForDecision || currentOrderId.isNotEmpty()
    }
}
