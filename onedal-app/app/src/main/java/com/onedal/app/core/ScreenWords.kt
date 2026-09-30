package com.onedal.app.core

/** 📰 모은 글자 한 개 — 서버 `screen_words` 로 가는 모양 (보고 본문 `screenWords.words[]`) */
data class ScreenWord(val word: String, val kind: String, val sample: String?)

/**
 * 📄 **화면 종류 → 페이지** — 페이지 정의(`…Pages.kt`)와 모은 글자가 같은 넷으로 갈린다.
 * 모르는 화면(UNKNOWN · 로딩 · 오류 팝업)은 null — 그 화면 글자는 모으지 않는다.
 */
fun pageOf(ctx: com.onedal.app.models.ScreenContext): Page? = when (ctx) {
    com.onedal.app.models.ScreenContext.LIST -> Page.LIST
    com.onedal.app.models.ScreenContext.DETAIL_PRE_CONFIRM,
    com.onedal.app.models.ScreenContext.POPUP_PICKUP,
    com.onedal.app.models.ScreenContext.POPUP_DROPOFF,
    com.onedal.app.models.ScreenContext.POPUP_MEMO -> Page.DETAIL
    // 확정(계약 직후) — 인성·24시의 확정 뒤 상세 · 픽커의 수락 뒤 운행 화면(픽업 이동 · 픽업 · 배송 중 · 배송지)
    com.onedal.app.models.ScreenContext.DETAIL_CONFIRMED,
    com.onedal.app.models.ScreenContext.RUN_TO_PICKUP,
    com.onedal.app.models.ScreenContext.RUN_AT_PICKUP,
    com.onedal.app.models.ScreenContext.RUN_TO_DROPOFF,
    com.onedal.app.models.ScreenContext.RUN_AT_DROPOFF -> Page.CONFIRM
    // 내 오더 — 인성 완료 탭 · 24시 배차내역 · 픽커 내 오더 탭 · 배송 완료
    com.onedal.app.models.ScreenContext.LIST_COMPLETED,
    com.onedal.app.models.ScreenContext.MY_ORDERS,
    com.onedal.app.models.ScreenContext.RUN_DONE -> Page.MY_ORDERS
    else -> null
}

/** 📰 한 보고 몫 — 한 보고는 한 화면이라 페이지는 한 번 */
data class ScreenWordsReport(val page: String, val words: List<ScreenWord>)

/**
 * 📰 **칸에 안 들어간 글자를 버리지 않고 모으는 한 곳** (reviews/24 · 기사님 «정의되지 않았다고 버리는 것이 문제다 —
 * 앱이 리뉴얼됐을 때 알아보게»). 파서가 글자를 뺄 때 까닭(잡음 · 못 알아봄 · 남는 토막)과 함께 여기 넣고,
 * 보고를 만들 때(`TelemetryManager`) 한 화면 몫을 꺼내 싣는다. 서버가 배차망 · 페이지 · 낱말별로 처음·마지막·횟수를 센다.
 *
 * 🔴 **홍수를 막는 가름** — 콜마다 다른 글자가 낱말 표를 불리지 않게:
 * - 값(요금·거리·시각·날짜·전화)은 이름표로(`ValueShape`). 못 알아본 글자 중 값은 싣지 않는다 — 값 칸은 정의돼 있다
 * - «키 : 값» 줄은 키만 — 이름·주소 같은 값은 콜마다 다르다
 * - 지명 명부에 있는 토막 → «<지역>» · 가게·건물 모양 → «<가게·건물>» · 띄어 쓴 긴 글 → «<문장>» (잡음 낱말은 그대로 — 목록이 정해져 있다)
 * - 한 보고 200개 · 낱말 40자 · 예시 줄 200자 (서버 한도와 같다)
 * 한 보고에 두 화면이 섞이면 먼저 것만 싣는다. 화면을 모르면(`onScreen(null)`) 안 모은다.
 */
object ScreenWords {
    private const val MAX_WORDS = 200
    private const val WORD_MAX = 40
    private const val SAMPLE_MAX = 200

    /** 가게·건물 모양 — 서버 도구 `wordKinds.mjs` 의 `isPlace` 와 같은 규칙 (`ScreenWordsTest` 가 문다) */
    val PLACE = Regex("""점$|[\[\]]|-|로\d+번길$|아파트$|빌라$|타워$|센터$""")
    private const val PLACE_MIN_LEN = 6
    private const val SENTENCE_MIN_LEN = 20

    private var current: Page? = null
    private var page: Page? = null
    private val words = LinkedHashMap<String, ScreenWord>()

    /** 지명 명부의 이름 — «광주시»·«분당구»·«경안동»과 그 줄임(«광주»·«분당»·«경안»)까지 */
    private val regionNames: Set<String> by lazy {
        val out = HashSet<String>()
        for ((sgg, dongs) in com.onedal.app.core.engine.RegionRegister.bySgg) {
            (sgg.split(" ") + dongs).forEach { out.add(it); out.add(bare(it)) }
        }
        out
    }

    private fun bare(w: String) = w.replace(Regex("""\d+"""), "").replace(Regex("""(동|읍|면|시|구|군)$"""), "")

    private fun isRegion(w: String) = w in regionNames || bare(w).let { it.length >= 2 && it in regionNames }

    /** 지금 읽는 화면의 페이지 — 스캔마다 한 번 (`HijackService`). 모르는 화면이면 null */
    /** 이 화면의 글자 — 아무도 맡지 않으면(`handled` 가 안 불리면) 다음 화면이나 보고 때 통째로 «정의에 없음»으로 모은다 */
    private var pendingRaw: List<String> = emptyList()
    private var pendingSample: String? = null

    /**
     * 📄 **지금 읽는 화면** — 스캔마다 한 번 (`HijackService`). 모르는 화면이면 null(안 모은다).
     * 상세·확정·내 오더처럼 읽는 파서가 없는 화면은 그 글자가 곧 다음에 파서를 만들 재료다 — 통째로 모은다(홍수 가름은 그대로).
     */
    @Synchronized fun onScreen(p: Page?, texts: List<String> = emptyList(), sample: String? = null) {
        flushRaw()
        current = p
        pendingRaw = if (p != null) texts else emptyList()
        pendingSample = sample
    }

    /**
     * 🔎 **이 화면 글자는 맡은 곳이 있다** — 파서가 읽었거나(뺀 글자는 파서가 까닭과 함께 넣는다),
     * 겹친 화면·배차망 갈아타기처럼 이 판을 버리고 다시 읽는다. 통째로 모으지 않는다.
     */
    @Synchronized fun handled() { pendingRaw = emptyList() }

    private fun flushRaw() {
        val texts = pendingRaw
        pendingRaw = emptyList()
        texts.forEach { add(it, WordKind.UNKNOWN, pendingSample) }
    }

    @Synchronized fun add(raw: String, kind: WordKind, sample: String? = null) {
        val p = current ?: return
        if (page != null && page != p) return
        val w = wordOf(raw, kind) ?: return
        val key = "${kind.word}|$w"
        if (key in words || words.size >= MAX_WORDS) return
        page = p
        words[key] = ScreenWord(w, kind.word, sample?.take(SAMPLE_MAX))
    }

    /** 한 보고 몫을 꺼내고 비운다 — 모은 것이 없으면 null (보고에 안 싣는다) */
    @Synchronized fun drain(): ScreenWordsReport? {
        flushRaw()
        val p = page ?: return null
        val r = ScreenWordsReport(p.word, words.values.toList())
        page = null
        words.clear()
        return r
    }

    private fun wordOf(raw: String, kind: WordKind): String? {
        var t = raw.trim()
        if (t.contains(':')) t = t.substringBefore(':').trim()
        if (t.isEmpty()) return null
        val shaped = ValueShape.normalize(t)
        if (shaped != t) return if (kind == WordKind.UNKNOWN) null else shaped
        if (kind != WordKind.NOISE) {
            if (isRegion(t)) return "<지역>"
            // 띄어 쓴 긴 글은 적요·유의사항 같은 문장 — 콜마다 다르다. 띄어 쓴 짧은 말(«한차배송 신청내역 보기»)은 화면 이름이라 그대로 둔다
            if (' ' in t && t.length > SENTENCE_MIN_LEN) return "<문장>"
            if (PLACE.containsMatchIn(t) || (t.length >= PLACE_MIN_LEN && ' ' !in t)) return "<가게·건물>"
        }
        return t.take(WORD_MAX)
    }
}
