package com.onedal.app.core

/**
 * 💾 **원달앱 저장소 — 이름과 여러 파일이 함께 쓰는 칸 이름은 여기 한 곳**.
 *    칸 이름을 파일마다 글자로 적으면 하나만 틀려도 읽기가 조용히 기본값이 된다 — 상수면 틀린 이름을 컴파일이 잡는다.
 *    한 파일 안에서만 쓰는 칸 · 이미 그 주인 곁에 상수가 있는 칸(`DeviceLink.PREF_TOKEN` · `BleLink.PREF_*` · `EvaluatingNow.PREF_KEY` ·
 *    `TelemetryManager.PREF_SUPPLIED_MODE`)은 그 자리에 둔다. `isLiveMode` 는 `ServerTarget` 한 곳만 읽는다(`ReleaseBuildTest`).
 */
object Prefs {
    const val NAME = "OneDalPrefs"

    /** 🌐 지금 배차망 이름표 — 서비스가 쓰고 보고 · 서버 주소가 읽는다 */
    const val TARGET_APP = "targetApp"
    /** 📖 서버 낱말 사전(JSON) — 세 파서가 읽는다 */
    const val TARGET_APP_KEYWORDS = "targetAppKeywords"
    /** 🎛️ 관제앱이 준 필터(JSON)와 그 판 — FilterStore 가 쓴다 */
    const val ACTIVE_FILTER = "activeFilter"
    const val FILTER_VERSION = "filterVersion"
    /** 📱 이 폰 id */
    const val DEVICE_ID = "deviceId"
    /** 👁️ 누른 자리 자국을 보이나 — 설정 화면이 쓰고 누르는 손이 읽는다 */
    const val SHOW_TAP_MARKER = "showTapMarker"
    /** 💻 로컬 서버 주소 */
    const val LOCAL_PC_IP = "localPcIp"
    /** 🩺 원달앱 화면의 «통신 상태» 칸 — 보고 길이 쓰고 화면이 읽는다 */
    const val LAST_SCRAP_TIME = "lastScrapTime"
    const val API_STATUS = "apiStatus"
    const val APP_LATEST_CODE = "appLatestCode"
    const val APP_MINIMUM_CODE = "appMinimumCode"
    const val API_SCRAP_REQ = "api_scrap_req"
    const val API_SCRAP_RES = "api_scrap_res"
    const val API_CONFIRM_REQ = "api_confirm_req"
    const val API_CONFIRM_RES = "api_confirm_res"
    /** 💾 걸려 있는 안전취소 «콜 번호|벽시계 마감 ms» — 원달앱이 다시 떠도 되살린다(`SafeCancelTimer.restore`) */
    const val SAFE_CANCEL_ARMED = "safeCancelArmed"
    /**
     * 📮 못 보낸 «자동 취소 · 눌렀음» 비상 보고(JSON 목록) — 원달앱이 다시 떠도 남게(40 S2-3 · 23 · 기사님 답 3 «저장 칸 하나»).
     *    값: `PendingEmergency.toJson` · 비면 없음 · 같은 콜은 한 줄 / 적는 때: 보고가 재시도까지 못 닿음 / 지우는 때: 다시 보낸 보고가 200 /
     *    화면: 안 보임 / 읽는 곳: 보고가 서버에 닿을 때마다 `HijackService.flushPendingEmergency`.
     */
    const val PENDING_AUTO_CANCEL = "pendingAutoCancel"
}
