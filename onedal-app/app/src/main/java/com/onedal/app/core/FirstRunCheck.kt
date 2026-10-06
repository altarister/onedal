package com.onedal.app.core

/**
 * 🩺 **첫 실행 점검 — 줄마다 초록/빨강** (운영센터 4단계 · reviews/29 · `FirstRunCheckTest`).
 * 딸 폰에 개발자 없이 설치할 때 기사님 대신 «무엇이 빠졌나»를 한 화면에 보인다. 판단은 여기 한 곳 — 화면은 그리기만 한다.
 * [mustShow] 는 앱을 켤 때 이 화면을 먼저 띄울지 — 고칠 수 없는 빨강(안드로이드 버전)과 «닿은 적 있는 서버의 빨강»은 세지 않는다.
 */
object FirstRunCheck {
    /** 서버가 이만큼 안에 답했으면 «닿는다» */
    const val SERVER_FRESH_MS = 2 * 60_000L
    /** 안드로이드 11 — 픽커 사진 읽기(takeScreenshot) 최소 판 */
    const val PHOTO_MIN_SDK = 30
    /** 안드로이드 13 — 밖에서 받은 앱은 접근성 전에 «제한된 설정 허용»이 먼저 */
    const val RESTRICTED_SETTINGS_SDK = 33

    enum class Key { SERVER, LINK, ACCESSIBILITY, NEARBY, BATTERY, ANDROID }
    enum class Action { SETTINGS_TAB, ACCESSIBILITY_SETTINGS, BATTERY_EXEMPT, APP_DETAILS }

    data class Facts(
        val live: Boolean, val serverUrl: String, val lastReplyAtMs: Long, val nowMs: Long,
        val hasToken: Boolean, val unlinkedWhy: String?,
        val accessibilityOn: Boolean, val batteryExempt: Boolean, val sdkInt: Int,
        /** 📶 «근처 기기»(블루투스 광고 · 연결) 허락 — 없으면 관제앱과 못 붙는다(reviews/50 ①-3) */
        val nearbyPermitted: Boolean = true,
    )

    /** @param countsForShow 빨강일 때 앱을 켜면 이 화면을 먼저 띄우나 · @param guide 안내 글 자리(비어도 된다) */
    data class Row(
        val key: Key, val title: String, val ok: Boolean, val detail: String,
        val action: Action? = null, val action2: Action? = null,
        val countsForShow: Boolean = true, val guide: String = "",
    )

    fun rows(f: Facts): List<Row> {
        val replied = f.lastReplyAtMs > 0L
        val fresh = replied && f.nowMs - f.lastReplyAtMs in 0..SERVER_FRESH_MS
        val where = if (f.live) "실서버 ${f.serverUrl}" else "개발 PC ${f.serverUrl}"
        val restricted = f.sdkInt >= RESTRICTED_SETTINGS_SDK
        return listOf(
            Row(Key.SERVER, "서버", fresh,
                if (fresh) "$where · 닿는다" else if (replied) "$where · 2분 넘게 답이 없다" else "$where · 아직 한 번도 닿지 않았다",
                action = if (fresh) null else Action.SETTINGS_TAB, countsForShow = !replied),
            Row(Key.LINK, "폰 연결", f.unlinkedWhy == null,
                DeviceLink.bannerOf(f.unlinkedWhy) ?: if (f.hasToken) "연결됨" else "토큰 없음 — 다시 연결하면 생김",
                action = if (f.unlinkedWhy == null) null else Action.SETTINGS_TAB),
            Row(Key.ACCESSIBILITY, "접근성", f.accessibilityOn,
                if (f.accessibilityOn) "켜짐" else if (restricted) "꺼짐 — 먼저 앱 정보 → ⋮ → 제한된 설정 허용, 그다음 접근성에서 1DAL 켜기" else "꺼짐 — 접근성에서 1DAL 켜기",
                action = if (f.accessibilityOn) null else Action.ACCESSIBILITY_SETTINGS,
                action2 = if (!f.accessibilityOn && restricted) Action.APP_DETAILS else null),
            Row(Key.NEARBY, "근처 기기(블루투스)", f.nearbyPermitted,
                if (f.nearbyPermitted) "허락됨 — 관제앱과 붙는다" else "근처 기기 허락 없음 — 관제앱과 못 붙음 · 앱 정보 → 권한 → 근처 기기 허용",
                action = if (f.nearbyPermitted) null else Action.APP_DETAILS),
            Row(Key.BATTERY, "배터리 최적화 예외", f.batteryExempt,
                if (f.batteryExempt) "예외 — 화면이 꺼져도 돈다" else "최적화 중 — 화면이 꺼지면 보고가 끊길 수 있다",
                action = if (f.batteryExempt) null else Action.BATTERY_EXEMPT),
            Row(Key.ANDROID, "안드로이드 버전", f.sdkInt >= PHOTO_MIN_SDK,
                if (f.sdkInt >= PHOTO_MIN_SDK) "API ${f.sdkInt}" else "API ${f.sdkInt} — 안드로이드 11 미만이라 픽커 사진 읽기가 안 된다",
                countsForShow = false),
        )
    }

    fun mustShow(rows: List<Row>): Boolean = rows.any { !it.ok && it.countsForShow }
}
