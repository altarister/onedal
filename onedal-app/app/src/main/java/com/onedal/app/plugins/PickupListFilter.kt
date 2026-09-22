package com.onedal.app.plugins

/**
 * 📋 **상차 목록 대조 — 상차지가 서버가 내려준 읍·면·동 목록에 걸리나** (2단계 원달앱)
 *
 * 규격은 서버 `shared/src/pickupList.ts` 와 한 벌이다 — 한쪽을 고치면 다른 쪽도 본다.
 *
 * ── 왜 ──
 * 동을 경로 위 한 지점으로만 기억해 순서로 거르면, 경로가 같은 동을 다시 지날 때(복귀콜로
 * «신둔면 → 이천터미널 → 다시 신둔면 → 집») 앞길 위 좋은 콜(신둔면 → 곤지암읍)을 «지나왔다»며 막는다.
 * 그래서 서버가 **«지금 내 위치 둘레»로 상차 목록**을 만들어 보내고, 앱은 **목록에 있나만** 본다.
 * 목록이 오면 상차 반경 숫자 비교와 경로 순서 판정은 쓰지 않는다 (기사님 «앱은 지역명 목록만 본다»).
 *
 * 🔴 **빈 목록은 «제한 없음»이 아니라 «고장 → 잡지 않음»** (규칙 ④) — 빈 하차 목록을 `false` 로 두는 자리와 같은 모양.
 * 🔴 **오탐 막는 낱말(`keywordTraps`)은 하차 목록과 같은 한 벌**을 쓴다 — 서버가 상차 ∪ 하차 목록으로 만든다.
 * 🔴 서버가 상차 목록 칸을 안 보내면 거리·순서 판정으로 돌아간다 — 그 길은 **부르는 쪽**(파서)에 있다.
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
