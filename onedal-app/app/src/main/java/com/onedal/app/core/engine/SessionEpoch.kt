package com.onedal.app.core.engine

/**
 * 🧬 **세션 세대** — 세션을 비울 때마다(`SessionManager.reset`) 1씩 오른다.
 * 따로 도는 일(사진 판독 등)은 시작할 때 세대를 쥐고, 돌아왔을 때 세대가 다르면 그 사이 콜이 끝난 것이라 결과를 버린다.
 * 안 버리면 비워진 새 세션에 옛 콜의 표시(«이미 처리함» 등)가 박혀 다음 상세가 아무것도 안 하고 굳는다 — 굳은 동안 목록을 안 봐 알람이 안 울린다.
 */
object SessionEpoch {
    /** 시작 때 세대와 지금 세대가 다르면 늦게 돌아온 것이다 */
    fun stale(startedEpoch: Long, nowEpoch: Long): Boolean = startedEpoch != nowEpoch
}
