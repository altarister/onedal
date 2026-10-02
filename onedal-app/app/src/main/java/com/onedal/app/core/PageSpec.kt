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
    /**
     * 🧩 **그 칸의 어느 조각** — 한 화면에 같은 칸이 여럿일 때(인성 상세의 연락처: 배차사 · 출발 고객 · 도착 고객 …) 가른다. 빈 글자 = 그 칸 자체.
     * 중복 검사는 (칸, 조각)으로 · 공통 읽기(`PageFieldRead`)는 조각을 따로 주지 않으면 빈 조각만 본다.
     */
    val part: String = "",
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

/**
 * 🧭 **우리 기준 페이지** — 배차망 페이지를 우리 시스템의 어느 자리로 맞추나(reviews/35).
 * shared `networkPages.ts` 의 `STANDARD_SCREENS` 와 이름 · 차례가 같다(`NetworkPagesPairTest`).
 * TRANSITION = 콜을 누른 직후 넘어가는 틀 · NETWORK_MENU = 배차망 안의 일이 아닌 화면(목록 복귀 아님).
 * 화면 판별(`ScreenDetector`)이 이 값을 `ScreenContext` 로 바꿔 보낸다.
 */
enum class StandardScreen {
    HOME, LIST, DETAIL_PRE_CONFIRM, DETAIL_CONFIRMED, MY_ORDERS,
    RUN_TO_PICKUP, RUN_AT_PICKUP, RUN_TO_DROPOFF, RUN_AT_DROPOFF, RUN_DONE,
    TRANSITION, NETWORK_MENU, OTHER_APP,
}

/** 🪟 페이지 위에 뜨는 것의 갈래 — 팝업(시트 · 드롭다운 포함) · 알림(알림 사건으로 옴) · 토스트 · 띠 */
enum class OverlayKind { POPUP, NOTICE, TOAST, BANNER }

/**
 * 🔎 **알아보는 글자 한 벌** — all 모두 있어야 · any 하나라도(비면 안 봄) · none 하나도 없어야 ·
 * shape 정규식이 화면 글에서 맞는 횟수가 shapeMin 이상 · shapeMax 이하.
 */
data class ScreenMatch(
    val all: List<String> = emptyList(),
    val any: List<String> = emptyList(),
    val none: List<String> = emptyList(),
    val shape: Regex? = null,
    val shapeMin: Int? = null,
    val shapeMax: Int? = null,
)

/**
 * 🛠️ **이 덧칸이 보이면 원달앱이 할 일** — 건너뛰기(로딩) · 팝업으로 상세 채우기(인성 출발지 · 도착지 · 적요) · 오류(아무것도 안 누름).
 * 서버로 보내는 화면 값은 페이지 값 그대로이고 덧칸 이름이 따로 간다(reviews/35 5단계).
 */
enum class OverlayAction { SKIP, FILL_PICKUP, FILL_DROPOFF, FILL_MEMO, ERROR }

/** 🪟 페이지 위에 뜨는 것 하나 — 근거가 비었거나 toCollect 가 있으면 «모을 것» · wordsFrom 은 글자 원천(서버 낱말 사전 자리) */
data class OverlaySpec(
    val name: String,
    val kind: OverlayKind,
    val match: List<ScreenMatch>,
    val meaning: String,
    val seen: Seen,
    val evidence: List<String>,
    val toCollect: String = "",
    val wordsFrom: String = "",
    val action: OverlayAction? = null,
)

/**
 * 🖥️ **배차망 페이지 한 줄** — 플러그인 폴더 `…Pages.kt` 의 `screens` 차례가 판별 차례다.
 * standard 가 null 이면 화면을 못 봐 못 정함 · listReturn 은 LIST 가 아닌 페이지를 목록 복귀로 치나.
 */
data class ScreenSpec(
    val name: String,
    val standard: StandardScreen?,
    val match: List<ScreenMatch>,
    val listReturn: Boolean,
    val overlays: List<OverlaySpec>,
    val seen: Seen,
    val evidence: List<String>,
    val toCollect: String = "",
    val wordsFrom: String = "",
)
