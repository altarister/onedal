package com.onedal.app.core

/**
 * 📱 **운행 기록 · 누름 기록 — 공통 그릇** — 켜진 동안 화면 글자 전문과 누른 버튼을 모아 서버로 올린다
 * (서버 `POST /api/logs/app` · 서버 로그 파일에 `📱 [원달앱 …]` 줄).
 *
 * 🔴 **누른 버튼 줄은 기록이 꺼져 있어도 늘** 남긴다(세 배차망 공통). 화면 글자 전문은 켜진 동안만.
 * 🔴 **언제 켜나 · 무엇을 누르면 끄나는 배차망이 정한다** — 플러그인 칸 `traceStartsOnClick` · `traceEndButton` · `afterScreenRead`(지금 픽커만 · 실물 앱일 때).
 *    퀵 화면(실물 17-1 · 17-2 · 22-1)은 사진만으로 원달앱이 읽는 글자를 못 맞추고, 밖에서는 logcat 을 볼 수 없어서 둔다.
 * 🔴 **끄는 때** — 끝 버튼(`endButtons`)을 누른 줄까지 남기고, 아니면 켠 지 5시간.
 *
 * 순수 계산만 한다 — 시각은 부르는 쪽이 넘기고, 전송은 `ApiClient.sendAppTraceLines` 가 한다 (검사가 그대로 문다).
 * 접근성 알림(메인)과 전송 결과(배경 스레드)가 함께 만지므로 전부 `@Synchronized`.
 */
class AppTrace(
    private val maxMs: Long = MAX_MS,
    private val maxQueue: Int = MAX_QUEUE,
    /** 누르면 기록을 끄는 버튼 글자 — 배차망 플러그인 `traceEndButton` 들(픽커 «오더 목록 보기») */
    private val endButtons: Set<String> = emptySet(),
) {
    /** 올릴 한 줄 — 시각은 기록한 순간 (서버 도착 시각과 다르다) */
    data class Line(val atMs: Long, val msg: String)

    companion object {
        /** 켠 뒤 이만큼 지나면 멈춘다 — 기사님 지시 «5시간» (퀵 픽업 지연 36분 사진도 있다) */
        const val MAX_MS = 5 * 60 * 60 * 1000L
        /** 못 올린 줄을 폰 메모리에 들고 있는 한도 — 넘치면 오래된 줄부터 버리고 버렸다고 남긴다 */
        const val MAX_QUEUE = 2000
        /**
         * 한 번에 올리는 줄 수 — 🔴 서버 `express.json()` 기본 한도 100KB 아래로 (서버가 받는 한 줄 최대 2만 자 × 3).
         * 넘으면 서버가 413 으로 거절하고, 되돌린 묶음이 영영 못 올라간다
         */
        const val SEND_BATCH = 3
        /** 누른 칸 글자 한 줄 길이 — 리스트 카드를 누르면 카드 글자가 통째로 온다 */
        const val CLICK_LABEL_MAX = 200
        /** 🔴 글자가 비어도 남긴다 — 버리면 «누름 알림이 안 온다»와 «글자가 비었다»를 못 가른다 (09-16 04:5x 라이브 누름 0건) */
        const val NO_LABEL = "〈글자 없음〉"

        /** 누른 칸 글자 — 알림 글자 → 설명(content-desc) → 누른 칸 안의 글자 순서로 처음 비지 않은 것 · 모두 비면 null */
        fun clickLabelOf(eventTexts: List<CharSequence?>?, contentDescription: CharSequence?, nodeTexts: List<String>): String? =
            listOf(
                eventTexts?.joinToString(" ") { it?.toString().orEmpty() }?.trim(),
                contentDescription?.toString()?.trim(),
                nodeTexts.joinToString(" ").trim(),
            ).firstOrNull { !it.isNullOrBlank() }?.take(CLICK_LABEL_MAX)
    }

    private val queue = ArrayDeque<Line>()
    private var startedAt: Long? = null
    private var lastScreen: String? = null
    private var dropped = 0

    /** 켠다 — 이미 켜져 있으면 시작 시각을 안 바꾸고 false */
    @Synchronized
    fun start(now: Long, reason: String): Boolean {
        if (isActive(now)) return false
        startedAt = now
        lastScreen = null
        push(Line(now, "#${LogTag.CALL_STAGE.word} ▶️ [기록 시작] $reason"))
        return true
    }

    /** 켜져 있나 — 5시간이 지났으면 여기서 끄고 «기록 끝» 줄을 한 번 남긴다 */
    @Synchronized
    fun isActive(now: Long): Boolean {
        val s = startedAt ?: return false
        if (now - s <= maxMs) return true
        startedAt = null
        push(Line(now, "#${LogTag.CALL_STAGE.word} ⏹️ [기록 끝] ${maxMs / 3_600_000}시간이 지났다"))
        return false
    }

    /** 화면이 바뀌면 글자 전문을 남긴다 — 🔴 자르지 않는다 · 같은 화면이 이어지면 한 번만. 남긴 줄을 돌려준다 (파일 로그용) */
    @Synchronized
    fun onScreen(now: Long, text: String, context: String): String? {
        if (!isActive(now) || text == lastScreen) return null
        lastScreen = text
        val msg = "🧾 [화면 $context] (${text.length}자) $text"
        push(Line(now, "#${LogTag.SCREEN.word} $msg"))
        return msg
    }

    /** 켜져 있을 때만 한 줄을 남긴다 — 화면 · 누름 말고 운행 기록에 실을 사실(목록 줄 사라짐) */
    @Synchronized
    fun note(now: Long, logTag: LogTag, msg: String): Boolean {
        if (!isActive(now)) return false
        push(Line(now, "#${logTag.word} $msg"))
        return true
    }

    /**
     * 누른 버튼 글자를 남긴다 — **기록이 꺼져 있어도 늘** (인성 · 화물24 · 픽커 공통 · 기사님: «분기도 없고 좋다»).
     * 빈 글자는 «〈글자 없음〉»으로 남긴다 · 켜져 있을 때 끝 버튼(`endButtons`)이면 그 줄까지 남기고 끈다
     */
    @Synchronized
    fun onClick(now: Long, label: String?, app: String = ""): String {
        val l = label?.trim()?.takeIf { it.isNotEmpty() }
        val msg = "👆 [누름${if (app.isNotEmpty()) " $app" else ""}] «${l ?: NO_LABEL}»"
        push(Line(now, "#${LogTag.TAP.word} $msg"))
        if (l != null && l in endButtons && isActive(now)) {
            push(Line(now, "#${LogTag.CALL_STAGE.word} ⏹️ [기록 끝] «$l»을 눌렀다"))
            startedAt = null
        }
        return msg
    }

    @Synchronized
    fun hasPending(): Boolean = queue.isNotEmpty() || dropped > 0

    /** 올릴 줄을 앞에서부터 꺼낸다 — 버린 줄이 있었으면 그 사실을 맨 앞에 */
    @Synchronized
    fun drain(max: Int): List<Line> {
        val out = mutableListOf<Line>()
        if (dropped > 0) {
            out += Line(queue.firstOrNull()?.atMs ?: 0L, "#${LogTag.WARN.word} ⚠️ [대기열 넘침] 오래된 ${dropped}줄을 버렸다")
            dropped = 0
        }
        while (out.size < max && queue.isNotEmpty()) out += queue.removeFirst()
        return out
    }

    /** 올리기에 실패한 줄을 순서 그대로 앞에 되돌린다 — 다음 기회에 다시 올린다 */
    @Synchronized
    fun requeueFront(lines: List<Line>) {
        lines.asReversed().forEach { queue.addFirst(it) }
        trim()
    }

    private fun push(line: Line) {
        queue.addLast(line)
        trim()
    }

    private fun trim() {
        while (queue.size > maxQueue) {
            queue.removeFirst()
            dropped++
        }
    }
}
