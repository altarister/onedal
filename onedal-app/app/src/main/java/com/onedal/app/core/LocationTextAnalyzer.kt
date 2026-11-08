package com.onedal.app.core

/** ✂️ 칸 한 개를 가른 토막 — 칸 원문 · 앞 «@» · 약속 토막 원문 · 조건 토막(표시 글자) */
data class CellPieces(
    /** 칸 원문(앞뒤 빈칸 뗌) — 정거장 `listText` 로 그대로 간다 */
    val text: String,
    /** 칸 맨 앞 «@» — 인성은 공유콜 표시 */
    val mark: Boolean,
    /** 약속 토막 원문(«낼8:30» · «14시전» · «7시까지» · «예약») — 날 · 시각 · «예약» 표시가 있는 조각이 있을 때만 · 정거장 `promiseText` · 없으면 null */
    val promise: String?,
    /** 조건 토막 — 정의 표 표시 글자(«급송» · «왕복» · «폰») 가운데 약속 · 날 · 올린 곳 · 뜻 모름이 아닌 것 */
    val conditions: List<String>,
)

/**
 * ✂️ **칸 앞 토막 한 함수** — 인성 · 화물24시 · 플렉스 목록 칸과 플렉스 상세 칸을 «앞 기호 · 약속 토막 · 조건 토막 · 지역»으로 가른다.
 * 칸 원문은 정거장 `listText` 로 그대로 가고 글자를 잘라 내지 않는다 — 판정 글자는 원달앱 짝 `StopText.query`(shared `stopQueryOf` 와 같은 규칙)가 만든다.
 * 마지막 토막을 가르는 표(약속 · 조건 기호 · 지역 끝말 토막 · 동 꼴 토막 · 괄호 덧글 · 붙은 시각)는 `StopText` 의 표와 같은 것이다.
 * 인성 · 화물24시가 «이 노드가 지역 칸인가»를 고르는 1차 · 2차 규칙(`regionCell`)은 노드 고르기에만 쓴다.
 */
object LocationTextAnalyzer {
    // ── 1차: 행정구역 접미사가 붙은 정식 지역명 (예: "경안동", "초월읍", "서울 강남구", "역삼1동", "을지로6가") ──
    //    🔴 «숫자+동 · 숫자+가»는 `AddressForm.ADMIN_UNIT` 과 같은 동 꼴 — 못 받으면 화물24시 하차가 상차로 채워진다
    private val fullRegionRegex = Regex("^(.*?)([가-힣]{2,}(?:\\s+[가-힣]+){0,2}(?:\\d{1,2}(?:동|가)|동|읍|면|리|시|구|군))([-+@/\\s]*)$")

    // ── 2차: 인성앱이 축약해버린 짧은 지역명 (예: "의왕", "강남", "광주", "평택") — 순수 한글 2~4글자 + 끝에 기호가 올 수 있음 ──
    private val shortRegionRegex = Regex("^(.*?)([가-힣]{2,4})([-+@/\\s]*)$")

    /** 조건 토막이 아닌 표시 글자 뜻 — 약속(예약 · 날 배지)은 약속 토막, 올린 곳 «@» 은 앞 기호, 뜻 모름은 그대로 약속 토막 자리에 둔다 */
    private val NOT_CONDITION = setOf(BadgeMeaning.RESERVED, BadgeMeaning.PROMISE_DAY, BadgeMeaning.POSTED_BY, BadgeMeaning.UNKNOWN)

    /**
     * 🔎 **이 노드가 지역 칸인가** — 1차(지역 끝말) · 2차(한글 2~4자) 규칙이 알아본 글자 · 아니면 null.
     * 인성 · 화물24시가 상차 · 하차 노드를 고르고 같은 칸을 뺄 때만 쓴다 — 정거장 글자는 노드 원문이다.
     */
    fun regionCell(text: String): String? {
        val t = text.trim()
        fullRegionRegex.find(t)?.let { return it.groupValues[2].trim() }
        val short = shortRegionRegex.find(t) ?: return null
        val candidate = short.groupValues[2].trim()
        return candidate.takeIf { it.length in 2..4 && it.all { c -> c in '가'..'힣' } }
    }

    /**
     * ✂️ **칸 원문 → 토막** — 마지막 토막을 판정 글자와 같은 표로 가르고, 지역 토막 밖의 조각 가운데
     * 표시 글자(`badges`)는 조건 토막 · 날 · 시각 · «예약» 표시가 있는 조각(`ReservationText.hasMark`)은 약속 토막 원문 ·
     * 그 밖(다른 지역 끝말 토막 «풍납동>논현동» 의 «풍납동» — 두 곳 하차 · «카고,» · 잘린 «성남터/»)은 칸 원문에만 남긴다(판정 글자가 뗀다).
     * 약속 조각이 둘 이상이거나 지역 토막과의 사이에 다른 조각이 끼면 칸 원문에서 약속부터 지역 토막 앞까지를 그대로 담는다(서버가 원문에서 찾아 뗀다).
     */
    fun split(text: String, badges: List<BadgeWord>): CellPieces {
        val t = text.trim()
        val tokens = t.split(StopText.SPACES).filter { it.isNotEmpty() }
        if (tokens.isEmpty()) return CellPieces(t, false, null, emptyList())
        val mark = tokens.first().startsWith("@")
        val head = tokens.dropLast(1).map { it.trimStart('@') }
        // 괄호 · 꺾쇠 덧글을 판정 글자와 같은 규칙으로 가른다 — 잘린 «(» 앞이 약속이면(«낼6시(구래동») 그 앞이 약속 토막
        val note = StopText.noteOf(tokens.last().trimStart('@'))
        val last = note.base
        val leftover = mutableListOf<String>()
        note.lead?.let { leftover += it }
        val cut = if (head.any { it.contains('(') } || last.contains('(')) StopText.PROMISE_CUT_NO_PAREN else StopText.PROMISE_CUT
        val pieces = if (cut.containsMatchIn(last)) last.split(cut) else listOf(last)
        // 지역 토막 — 지역 끝말 토막 · 동 꼴 토막 · 둘 다 없으면 마지막 조각(화면에서 잘린 «…/구»)
        val place = pieces.lastOrNull { StopText.REGION_PIECE.matches(it) } ?: pieces.lastOrNull { StopText.PLACE_PIECE.matches(it) }
            ?: pieces.lastOrNull { it.isNotEmpty() }.takeIf { pieces.size > 1 }
        if (place != null) {
            val at = pieces.lastIndexOf(place)
            leftover += pieces.filterIndexed { i, p -> i != at && p.isNotEmpty() && !StopText.REGION_PIECE.matches(p) }
        } else {
            StopText.GLUED_CLOCK.matchEntire(last)?.takeIf { StopText.REGION_PIECE.matches(it.groupValues[1]) }
                ?.let { leftover += last.removeSuffix(it.groupValues[1]) }
        }
        val isCondition = { piece: String ->
            badges.any { b -> b.meaning !in NOT_CONDITION && (b.text == piece || b.text.trimEnd('/', ')') == piece) }
        }
        // 기호 하나가 표시 글자인 것(«>» — 두 곳 하차)은 칸에 있으면 조건 토막
        val marks = badges.filter { b -> b.meaning !in NOT_CONDITION && b.text.none { it.isLetterOrDigit() } && last.contains(b.text) }.map { it.text }
        val conditions = leftover.filter(isCondition) + marks.distinct()
        val promises = leftover.filter { !isCondition(it) && ReservationText.hasMark(it) }
        val others = leftover.filter { !isCondition(it) && !ReservationText.hasMark(it) }
        val promise = when {
            promises.isEmpty() -> null
            promises.size == 1 && others.isEmpty() -> promises.first()
            // 약속 조각이 둘 이상이거나 지역 토막과 사이에 다른 조각(«14시/짐/자양동» 의 «짐»)이 끼면 칸 원문에서 약속부터 지역 토막 앞까지 통째 — 서버가 원문 그대로 찾아 뗀다
            else -> {
                val from = t.indexOf(promises.first())
                val placeAt = place?.let { t.lastIndexOf(it) } ?: -1
                val to = if (placeAt > from) placeAt else leftover.maxOf { t.lastIndexOf(it) + it.length }
                if (from in 0 until to) t.substring(from, to).trimEnd('/', ')', '(', ',', '>', ' ') else promises.first()
            }
        }
        return CellPieces(t, mark, promise, conditions)
    }
}
