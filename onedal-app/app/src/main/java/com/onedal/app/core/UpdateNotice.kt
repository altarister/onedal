package com.onedal.app.core

/**
 * 📦 **앱 업데이트 안내** — 서버 보고 응답의 최신·최소 versionCode 와 이 앱을 견준다 (운영센터 4단계 · `ReleaseBuildTest`).
 * 칸이 없으면(서버가 아직 안 보냄) 아무것도 안 띄운다. 설치는 기사 손이다 — 안드로이드는 조용한 자동 설치가 없다.
 */
object UpdateNotice {
    enum class Kind { AVAILABLE, REQUIRED }
    data class Notice(val kind: Kind, val text: String)

    fun of(myCode: Int, latest: Int?, minimum: Int?): Notice? = when {
        minimum != null && myCode < minimum -> Notice(Kind.REQUIRED, "업데이트해야 씁니다 — 이 앱 판이 너무 낮습니다")
        latest != null && myCode < latest -> Notice(Kind.AVAILABLE, "업데이트 있음 — 가입 페이지 «앱 받기»에서 받으세요")
        else -> null
    }
}
