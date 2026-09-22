package com.onedal.app.core.engine

/**
 * 🚪 **확정 전 화면(DETAIL_PRE_CONFIRM) 처리를 건너뛸 것인가** (#82)
 *
 * «서버에 보고했다»는 표시(`isDetailScrapSent`)만 보고 건너뛰면, 그 표시가 «이 화면에서 할 일이
 * 끝났다»는 질문에 대답해 버린다 (#76·#78~#81 과 같은 «한 값이 두 사실» 병).
 *
 * 🔴 그러면 3단계 동명이동 검증(도착지 팝업)을 다녀온 콜은 **확정을 영영 못 누른다**:
 *    첫 진입에서 보고(표시 켜짐) → 팝업 검증 → 통과(ACCEPT 예약) → 상세 복귀
 *    → 건너뜀 → 확정 클릭 코드 미도달 → 9초 멈춤 → 서버 강제 정리. 적발(CANCEL) 갈래도 같다.
 *
 * 판단을 한 곳에 모은다: 보고를 이미 했어도 **3단계에서 돌아와 마저 할 일**
 * (확정 또는 취소 클릭)이 예약돼 있으면 건너뛰지 않는다.
 */
object PreConfirmGate {
    fun shouldSkip(isDetailScrapSent: Boolean, cautionAction: String?): Boolean {
        // 🔴 3단계에서 돌아와 마저 할 일(확정/취소 클릭)이 예약돼 있으면 건너뛰지 않는다.
        //    VERIFY 는 팝업 화면이 소비하는 상태라 상세 화면은 그대로 기다린다.
        val pendingCautionClick = cautionAction == "ACCEPT" || cautionAction == "CANCEL"
        return isDetailScrapSent && !pendingCautionClick
    }
}
