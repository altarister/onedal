package com.onedal.app.plugins

/**
 * 📋 **상차 목록 대조 — 상차지가 서버가 내려준 읍·면·동 목록에 걸리나** (2026-09-15 · 2단계 원달앱)
 *
 * 규격은 `docs/지금/필터.md` «상차 목록 · 하차 목록» 하나다 — 서버(onedal-b5)와 같은 글을 보고 고친다.
 *
 * ── 왜 ──
 * 이천 왕복 03:08:52: 복귀콜을 잡자 경로가 «신둔면 → 이천터미널 → 다시 신둔면 → 집»으로 되돌아갔고,
 * 이천터미널에서 집 가는 앞길 위 좋은 콜(신둔면 → 곤지암읍)을 `RouteOrderFilter` 가
 * «경로 밖 — 상차지(신둔면)가 경유 목록에 없음»으로 막았다. 서버가 동을 경로 위 한 지점으로만 기억해
 * 다시 지날 신둔면을 «지나왔다»며 뺐기 때문이다.
 * 이제 서버가 **«지금 내 위치 둘레»로 상차 목록**을 만들어 보내고, 앱은 **목록에 있나만** 본다.
 * 상차 반경 숫자 비교와 경로 순서 판정은 쓰지 않는다 (기사님 2026-09-14 «앱은 지역명 목록만 본다»).
 *
 * 🔴 **빈 목록은 «제한 없음»이 아니라 «고장 → 잡지 않음»** (규칙 ④) — 빈 하차 목록을 `false` 로 두는 자리와 같은 모양.
 * 🔴 **오탐 막는 낱말(`keywordTraps`)은 하차 목록과 같은 한 벌**을 쓴다 — 서버가 상차 ∪ 하차 목록으로 만든다.
 * 🔴 «칸이 안 오면(옛 서버) 옛 판정» 되돌아가는 길은 **부르는 쪽**(파서)에 있고, 3단계(옛 칸 걷는 날)에 함께 지운다 (todo.md).
 */
object PickupListFilter {

    data class Result(val passed: Boolean, val reason: String)

    fun check(pickupText: String, pickupKeywords: List<String>, traps: Map<String, List<String>>): Result {
        if (pickupKeywords.isEmpty()) {
            return Result(false, "상차 목록이 비었다 — 서버가 필터를 아직 못 만들었다")
        }
        return if (RegionMatch.anyHit(pickupText, pickupKeywords, traps)) {
            Result(true, "상차 목록 안 — ${pickupText.take(20)}")
        } else {
            Result(false, "상차 목록 밖 — 상차지(${pickupText.take(20)})가 목록 ${pickupKeywords.size}곳에 없음")
        }
    }

    /**
     * 🧾 **인성 상세 글에서 상차지 칸만 자른다** — «출발지(상세) ~ 도착지» 사이.
     *
     * 하차지는 «도착지» 뒤를 자른다(`InsungParser` 의 `pureDropoffText`). 상차지는 그 앞이다.
     * 상세 글 전체로 대조하면 **하차지 동 이름이 상차 목록에 걸려** 통과한다 — 그래서 자른다.
     * 🔴 «출발지»를 못 찾으면 null — 부르는 쪽이 리스트에서 읽은 상차지로 대조한다 (지어내지 않는다).
     * 🔴 시 이름으로 추정하는 분기(`customCityFilters`)는 하차 도시 전용이라 상차지엔 없다 (규격 표).
     */
    fun insungDetailPickupText(rawText: String): String? {
        val start = rawText.indexOf("출발지상세").takeIf { it != -1 } ?: rawText.indexOf("출발지")
        if (start == -1) return null
        val end = rawText.indexOf("도착지", start)
        return if (end == -1) rawText.substring(start) else rawText.substring(start, end)
    }
}
