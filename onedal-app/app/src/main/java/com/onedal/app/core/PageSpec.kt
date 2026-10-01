package com.onedal.app.core

/** 📄 이 칸을 어디서 봤나 — 실물 캡처·실물 로그 / 시뮬레이터 화면만 / 아직 못 봄(«모름» = 실물 확인 목록) */
enum class Seen { REAL, SIM, UNKNOWN }

/** 📄 원달앱이 지금 이 칸을 어떻게 하나 — 읽어 콜에 담는다 / 읽거나 보고도 버린다 / 안 읽는다 */
enum class Handling { READ, DROPPED, UNUSED }

/**
 * 📄 **페이지 한 장의 칸 하나** (reviews/24).
 * @param where 화면 어디 — 줄 · 배지 · 팝업 · 사진
 * @param sample 글자 모양 — 실물 예 그대로 (없으면 시뮬 예)
 * @param usedAt 읽는 곳(파일:함수) — 안 읽으면 빈칸
 */
data class FieldSpec(
    val field: PageField,
    val where: String,
    val sample: String,
    val seen: Seen,
    val handling: Handling,
    val usedAt: String = "",
    /**
     * 📖 **이 칸을 화면 글에서 읽는 법** — 노드 글을 한 칸 띄어 이은 줄에 대고, 1번 묶음이 값이다(`PageFieldRead.fieldOf`).
     * 없으면 공통 길이 이 칸을 읽지 않는다(설명만 하는 칸). 배차망마다 다른 것은 이 인자 하나다 — 공통 코드는 배차망 이름을 모른다.
     */
    val read: Regex? = null,
)

/** 📄 배차망 하나의 페이지 정의 — 페이지 넷 × 칸들. 플러그인 폴더의 `…Pages.kt` 가 적는다 */
typealias PageSpecs = Map<Page, List<FieldSpec>>

object PageSpecSummary {
    /** 🧾 부팅 때 한 줄 — «모름» 칸이 실물 확인 목록이고, «버림»·«안 읽음» 칸이 다음에 읽을 재료다 */
    fun line(label: String, pages: PageSpecs): String {
        val all = pages.values.flatten()
        return "$label 칸 ${all.size} · 모름 ${all.count { it.seen == Seen.UNKNOWN }} · " +
            "버림 ${all.count { it.handling == Handling.DROPPED }} · 안 읽음 ${all.count { it.handling == Handling.UNUSED }}"
    }
}
