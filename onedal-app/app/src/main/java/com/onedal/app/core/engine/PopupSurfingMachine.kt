package com.onedal.app.core.engine

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.AppLogger
import com.onedal.app.core.AutoTouchManager

/**
 * 팝업 서핑 상태 머신
 *
 * 확정 화면(DETAIL_CONFIRMED)에 진입한 뒤,
 * 적요상세 → 출발지 → 도착지 팝업을 자동으로 순서대로 열고 닫으며
 * 텍스트를 수집하는 상태 머신입니다.
 *
 * 흐름: IDLE → WAITING_FOR_MEMO → WAITING_FOR_PICKUP → WAITING_FOR_DROPOFF → DONE
 */
class PopupSurfingMachine(
    private val touchManager: AutoTouchManager
) {
    companion object {
        private const val TAG = "1DAL_SURFING"
    }

    /**
     * 확정 화면에서 서핑을 시작합니다.
     * 적요상세 버튼을 찾아 클릭하고, 없으면 출발지로 바로 넘어갑니다.
     *
     * @param rootNode 현재 화면 루트 노드
     * @param session 세션 매니저 (surfingState, accumulatedDetailText 관리)
     * @param screenTexts 현재 화면 텍스트 리스트
     */
    fun startSurfing(
        rootNode: AccessibilityNodeInfo,
        session: SessionManager,
        screenTexts: List<String>
    ) {
        session.accumulatedDetailText = screenTexts.joinToString("\n") + "\n"

        AppLogger.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 확정 화면 진입 확인! 적요상세 팝업 호출 시도")
        if (touchManager.findAndClickByText(rootNode, "적요상세", isStartsWith = true)) {
            AppLogger.roadmap("확정페이지에서 '적요상세' 추출 후 클릭", "DETAIL_CONFIRMED")
            AppLogger.i(TAG, "📋 [SEQ 81] 적요상세 버튼 클릭 → 적요 정보 요청")
            session.surfingState = SessionManager.SurfingState.WAITING_FOR_MEMO_POPUP
        } else if (touchManager.findAndClickByText(rootNode, "출발지", isStartsWith = true) ||
                   touchManager.findAndClickByText(rootNode, "상차", isStartsWith = true)) {
            AppLogger.w(TAG, "⚠️ 적요상세 버튼을 찾을 수 없습니다. 곧바로 출발지 서핑으로 넘어갑니다.")
            AppLogger.i(TAG, "📋 [SEQ 82] 출발지/상차 클릭 → 출발지 정보 요청")
            session.surfingState = SessionManager.SurfingState.WAITING_FOR_PICKUP_POPUP
        } else {
            AppLogger.w(TAG, "⚠️ [서핑 대기] 팝업 호출 버튼(적요상세/출발지)을 찾지 못했습니다. (대기)")
        }
    }

    /**
     * 확정 화면에서 출발지 팝업 호출 (적요 팝업 닫힌 후)
     */
    fun clickPickup(rootNode: AccessibilityNodeInfo) {
        AppLogger.roadmap("[Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)", "DETAIL_CONFIRMED")
        AppLogger.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 적요 정보 확인 완료. 출발지 정보 확인을 위해 자동 클릭 시도")
        AppLogger.roadmap("확정페이지에서 '출발지' 추출 후 클릭", "DETAIL_CONFIRMED")
        if (touchManager.findAndClickByText(rootNode, "출발지", isStartsWith = true) ||
            touchManager.findAndClickByText(rootNode, "상차", isStartsWith = true)) {
            // 클릭 성공
        } else {
            AppLogger.w(TAG, "⚠️ [서핑 대기] 출발지/상차 버튼을 찾지 못했습니다.")
        }
    }

    /**
     * 확정 화면에서 도착지 팝업 호출 (출발지 팝업 닫힌 후)
     */
    fun clickDropoff(rootNode: AccessibilityNodeInfo) {
        AppLogger.roadmap("[Current Page: DETAIL_CONFIRMED] 확정페이지 복귀 확인 (잔상 회피 완료)", "DETAIL_CONFIRMED")
        AppLogger.d(TAG, "🏄‍♂️ [자동 팝업 서핑] 출발지 확인 완료. 도착지 정보 확인을 위해 자동 클릭 시도")
        AppLogger.roadmap("확정페이지에서 '도착지' 추출 후 클릭", "DETAIL_CONFIRMED")
        if (touchManager.findAndClickByText(rootNode, "도착지", isStartsWith = true) ||
            touchManager.findAndClickByText(rootNode, "하차", isStartsWith = true)) {
            // 클릭 성공
        } else {
            AppLogger.w(TAG, "⚠️ [서핑 대기] 팝업은 닫혔으나 도착지/하차 버튼을 찾지 못했습니다. (대기)")
        }
    }

    /**
     * 적요 팝업(POPUP_MEMO) 핸들링
     * 로딩 완료 확인 → 텍스트 수집 → 닫기 → 다음 단계(출발지)
     *
     * @return true이면 처리 완료, false이면 거짓 이벤트로 스킵
     */
    fun handleMemoPopup(
        rootNode: AccessibilityNodeInfo,
        session: SessionManager,
        screenTexts: List<String>
    ): Boolean {
        if (session.surfingState != SessionManager.SurfingState.WAITING_FOR_MEMO_POPUP) return false

        val multilineScreenStr = screenTexts.joinToString("\n")
        if (!multilineScreenStr.contains("적요 내용")) {
            AppLogger.d(TAG, "거짓 이벤트 무시: 아직 적요상세 팝업 데이터 로딩 안됨")
            return false
        }

        session.accumulatedDetailText += "[적요상세/정보]\n$multilineScreenStr\n"
        AppLogger.d(TAG, "📝 적요 스크래핑 성공! 닫기 버튼 누름")
        AppLogger.i(TAG, "📋 [SEQ 81-82] 적요상세 추출 완료 → 닫기")
        AppLogger.roadmap("[Current Page: POPUP_MEMO] 진입 완료 (\"적요 내용\" 텍스트 매칭 확인)", "POPUP_MEMO")
        AppLogger.roadmap("적요상세 데이터 추출 및 메모리에 누적 저장", "POPUP_MEMO")
        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        session.surfingState = SessionManager.SurfingState.WAITING_FOR_PICKUP_POPUP
        return true
    }

    /**
     * 출발지 팝업(POPUP_PICKUP) 핸들링
     * 로딩 완료 확인 → 텍스트 수집 → 닫기 → 다음 단계(도착지)
     */
    fun handlePickupPopup(
        rootNode: AccessibilityNodeInfo,
        session: SessionManager,
        screenTexts: List<String>
    ): Boolean {
        if (session.surfingState != SessionManager.SurfingState.WAITING_FOR_PICKUP_POPUP) return false

        val multilineScreenStr = screenTexts.joinToString("\n")
        if (!multilineScreenStr.contains("전화1") && !multilineScreenStr.contains("도착지 상세")) {
            AppLogger.d(TAG, "거짓 이벤트 무시: 아직 출발지 팝업 데이터 로딩 안됨")
            return false
        }

        session.accumulatedDetailText += "[출발지상세]\n$multilineScreenStr\n"
        AppLogger.d(TAG, "📝 출발지 스크래핑 성공! 닫기 버튼 누름")
        AppLogger.roadmap("[Current Page: POPUP_PICKUP] 진입 완료 (\"전화1\" 텍스트 매칭 확인)", "POPUP_PICKUP")
        AppLogger.roadmap("출발지 데이터 추출 및 메모리에 누적 저장", "POPUP_PICKUP")
        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        session.surfingState = SessionManager.SurfingState.WAITING_FOR_DROPOFF_POPUP
        return true
    }

    /**
     * 도착지 팝업(POPUP_DROPOFF) 핸들링 — 서핑 모드 전용
     * 로딩 완료 확인 → 텍스트 수집 → 닫기 → DONE 마킹
     *
     * @return true이면 서핑 완료 (호출자가 /detail 전송 실행)
     */
    fun handleDropoffPopup(
        rootNode: AccessibilityNodeInfo,
        session: SessionManager,
        screenTexts: List<String>
    ): Boolean {
        if (session.surfingState != SessionManager.SurfingState.WAITING_FOR_DROPOFF_POPUP) return false

        val multilineScreenStr = screenTexts.joinToString("\n")
        if (!multilineScreenStr.contains("전화1")) {
            AppLogger.d(TAG, "거짓 이벤트 무시: 아직 도착지 팝업 데이터 로딩 안됨")
            return false
        }

        session.accumulatedDetailText += "[도착지상세]\n$multilineScreenStr\n"
        AppLogger.d(TAG, "📝 도착지 스크래핑 성공! 닫기 누름 및 전체 내용 /detail 로 발송")
        AppLogger.roadmap("[Current Page: POPUP_DROPOFF] 진입 완료 (\"전화1\" 텍스트 매칭 확인)", "POPUP_DROPOFF")
        AppLogger.roadmap("도착지 데이터 추출 및 메모리에 누적 저장", "POPUP_DROPOFF")
        touchManager.findAndClickByText(rootNode, "닫기", isStartsWith = true)
        session.surfingState = SessionManager.SurfingState.DONE
        AppLogger.roadmap("[Current Page: DETAIL_CONFIRMED] 무인 서핑 종료 (State Machine: DONE)", "DETAIL_CONFIRMED")
        return true  // 호출자에게 /detail 전송 신호
    }
}
