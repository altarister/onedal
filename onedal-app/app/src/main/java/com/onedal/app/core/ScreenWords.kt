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
 * - 값(요금·거리·시각·날짜·전화·포인트·개수·동호수)은 이름표로(`ValueShape`). 못 알아본 글자 중 값은 싣지 않는다 — 값 칸은 정의돼 있다
 * - 여러 토막 글자와 예시 줄은 토막마다 가린다(`mask`) — «픽업지 경기 성남시 분당구 이매2동» → «픽업지 <지역>» (개인정보 · 새 낱말 홍수)
 *   ⚠️ 한계: 사람 이름은 모양으로 못 가린다
 * - «키 : 값» 줄은 키만 — 이름·주소 같은 값은 콜마다 다르다
 * - 지명 명부에 있는 토막 → «<지역>» · 가게·건물 모양 → «<가게·건물>» · 띄어 쓴 긴 글 → «<문장>» (잡음 낱말은 그대로 — 목록이 정해져 있다)
 * - 한 보고 200개 · 낱말 40자 · 예시 줄 200자 (서버 한도와 같다)
 * 한 보고에 두 화면이 섞이면 먼저 것을 싣고 나머지는 다음 보고로 넘긴다(버리지 않는다). 화면을 모르면(`onScreen(null)`) 안 모은다.
 */
object ScreenWords {
    private const val MAX_WORDS = 200
    private const val WORD_MAX = 40
    private const val SAMPLE_MAX = 200

    /** 가게·건물 모양 — 서버 도구 `wordKinds.mjs` 의 `isPlace` 와 같은 규칙 (`ScreenWordsTest` 가 문다) */
    val PLACE = Regex("""점$|[\[\]]|-|로\d+번길$|아파트$|빌라$|타워$|센터$""")
    private const val PLACE_MIN_LEN = 6
    private const val SENTENCE_MIN_LEN = 20
    private val KEY_COLON = Regex("""(?<!\d):|:(?!\d)""")

    private var current: Page? = null
    /** 페이지마다 모은 글자 — 보고 하나는 한 페이지라 먼저 모은 페이지부터 하나씩 꺼낸다 */
    private val byPage = LinkedHashMap<Page, LinkedHashMap<String, ScreenWord>>()

    /** 지명 명부의 이름 — «광주시»·«분당구»·«경안동»과 그 줄임(«광주»·«분당»·«경안»)까지 */
    private val regionNames: Set<String> by lazy {
        val out = HashSet<String>()
        for ((sgg, dongs) in com.onedal.app.core.engine.RegionRegister.bySgg) {
            (sgg.split(" ") + dongs).forEach { out.add(it); out.add(bare(it)) }
        }
        out.addAll(PROVINCES)
        out
    }

    /** 도 이름 — 명부 키는 도 아래를 «성남시 분당구»로 적어 도가 없다(광역시 «서울»은 키에 있다) */
    private val PROVINCES = setOf("경기", "강원", "충북", "충남", "세종")

    private fun bare(w: String) = w.replace(Regex("""\d+"""), "").replace(Regex("""(동|읍|면|시|구|군)$"""), "")

    private fun isRegion(w: String) = w in regionNames || bare(w).let { it.length >= 2 && it in regionNames }

    /** 지금 읽는 화면의 페이지 — 스캔마다 한 번 (`HijackService`). 모르는 화면이면 null */
    /** 이 화면의 글자 — 다음 화면이나 보고 때 통째로 «정의에 없음»으로 모은다 */
    private var pendingRaw: List<String> = emptyList()
    private var pendingSample: String? = null

    /**
     * 📄 **지금 읽는 화면** — 스캔마다 한 번 (`HijackService`). 모르는 화면이면 null(안 모은다).
     * 상세·확정·내 오더처럼 읽는 파서가 없는 화면은 그 글자가 곧 다음에 파서를 만들 재료다 — 통째로 모은다(홍수 가름은 그대로).
     */
    @Synchronized fun onScreen(p: Page?, texts: List<String> = emptyList(), sample: String? = null) {
        flushRaw()
        current = p
        // 🔴 목록 페이지는 통째로 모으지 않는다 — 목록 글자는 파서가 까닭과 함께 넣는다.
        //    화면이 바뀐 보고는 그 자리에서 나가므로, 걸어 두면 파서가 읽기도 전에 목록 판이 «정의에 없음»으로 쏟아진다
        pendingRaw = if (p != null && p != Page.LIST) texts else emptyList()
        pendingSample = sample
    }

    private fun flushRaw() {
        val texts = pendingRaw
        pendingRaw = emptyList()
        texts.forEach { add(it, WordKind.UNKNOWN, pendingSample) }
    }

    @Synchronized fun add(raw: String, kind: WordKind, sample: String? = null) {
        val p = current ?: return
        val w = wordOf(raw, kind) ?: return
        val words = byPage.getOrPut(p) { LinkedHashMap() }
        val key = "${kind.word}|$w"
        if (key in words || words.size >= MAX_WORDS) return
        words[key] = ScreenWord(w, kind.word, sample?.let(::mask)?.take(SAMPLE_MAX))
    }

    /**
     * 🔒 **토막마다 값·지명·가게를 이름표로 — 한 벌** (예시 줄 · 여러 토막 낱말 · 오더카드 로그 · 개인정보).
     * «경기 성남시 중원구 금광1동» → «<지역>»(이어진 지역은 하나로) · «010-1234-5678»·«01012345678» → «<전화>» · «105동» → «<동호수>» · 요금 → «<숫자>».
     * ⚠️ 사람 이름은 모양으로 못 가린다.
     */
    fun mask(raw: String): String {
        val out = ArrayList<String>()
        for (t in raw.trim().split(Regex("""\s+""")).filter { it.isNotEmpty() }) {
            val shaped = ValueShape.normalize(t)
            val m = when {
                shaped != t -> shaped
                isRegion(t) -> REGION
                PLACE.containsMatchIn(t) -> "<가게·건물>"
                else -> t
            }
            if (m == REGION && out.lastOrNull() == REGION) continue
            out.add(m)
        }
        return out.joinToString(" ")
    }
    private const val REGION = "<지역>"

    /** 한 보고 몫(먼저 모은 페이지 하나)을 꺼낸다 — 다른 페이지 것은 다음 보고로. 모은 것이 없으면 null (보고에 안 싣는다) */
    @Synchronized fun drain(): ScreenWordsReport? {
        flushRaw()
        val p = byPage.keys.firstOrNull() ?: return null
        val words = byPage.remove(p)!!
        return ScreenWordsReport(p.word, words.values.toList())
    }

    private fun wordOf(raw: String, kind: WordKind): String? {
        var t = raw.trim()
        // «키 : 값»은 키만 — 숫자 사이 콜론(«09:30»)은 시각이라 가르지 않는다
        KEY_COLON.find(t)?.let { t = t.substring(0, it.range.first).trim() }
        if (t.isEmpty()) return null
        val shaped = ValueShape.normalize(t)
        if (shaped != t) return if (kind == WordKind.UNKNOWN) null else shaped
        if (kind != WordKind.NOISE) {
            if (isRegion(t)) return "<지역>"
            // 띄어 쓴 긴 글은 적요·유의사항 같은 문장 — 콜마다 다르다. 띄어 쓴 짧은 말(«한차배송 신청내역 보기»)은 화면 이름이라 그대로 둔다
            if (' ' in t && t.length > SENTENCE_MIN_LEN) return "<문장>"
            if (PLACE.containsMatchIn(t) || (t.length >= PLACE_MIN_LEN && ' ' !in t)) return "<가게·건물>"
            // 🔒 짧은 여러 토막 글자 — 토막마다 가린다(«대박스 1개» → «대박스 <개수>» · «픽업지 경기 … 이매2동» → «픽업지 <지역>»)
            if (' ' in t) return mask(t).take(WORD_MAX)
        }
        return t.take(WORD_MAX)
    }
}
