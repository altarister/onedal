package com.onedal.app.core

/**
 * 🖥️ **화면에 적힌 글자로 배차망을 가른다** (기사님 확정 2026-09-14)
 *
 * 기사님: *"진짜 픽커 리스트 페이지로 일을 하려 할 때 픽커가 우리 앱에게 «나 픽커입니다» 이렇게
 * 이야기 안 할 거잖아. 스캔앱은 페이지에 있는 값만으로도 이건 인성, 이건 픽커 리스트 페이지
 * 이렇게 알아야 된다."*
 *
 * 순수 함수다 — 어느 배차망의 어떤 글자인지는 모른다. 글자 묶음은 `TargetApp.networkMarkers()` 가
 * 각 배차망 폴더에서 모아 넘긴다 (공통 코드에 화면 글자를 박지 않는다 — 배차망_통합 §9-4).
 */
object NetworkByScreen {

    /**
     * 화면 글자에 **묶음 하나가 통째로** 들어 있는 배차망들.
     *
     * 🔴 **빈 묶음은 아무 화면에도 맞지 않는다** — `all` 은 빈 목록에 늘 참이라, 그대로 두면
     *    모든 화면이 그 배차망이 된다. 빈 필터는 «제한 없음»이 아니라 «고장»이다 (규칙 ④).
     */
    fun hits(screenText: String, markers: Map<String, List<List<String>>>): Set<String> =
        markers.filter { (_, groups) ->
            groups.any { group -> group.isNotEmpty() && group.all { screenText.contains(it) } }
        }.keys

    /**
     * 이 화면은 어느 배차망인가 — **하나일 때만** 답한다.
     * 아무것도 안 맞으면 null(카톡·잠금화면), 둘 이상 맞으면 null(화면이 넘어가는 중) — 지어내지 않는다.
     */
    fun detect(screenText: String, markers: Map<String, List<List<String>>>): String? =
        hits(screenText, markers).singleOrNull()
}
