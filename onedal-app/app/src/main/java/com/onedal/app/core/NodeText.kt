package com.onedal.app.core

/**
 * 🧹 **화면 노드 글자 한 칸을 읽는 규칙 — 파싱으로 가는 두 길(`gatherNodeTexts` · `extractAllTextNodes`)이 같이 쓴다** (`NodeTextTest`).
 * 어떤 노드는 끝에 «kotlin.Unit»을 달고 온다 — 화면 글이 아니라 앱 쪽 찌꺼기다(픽커 상세 «픽업지 …» 노드 · 실물 덤프 content-desc). 모든 배차망에서 뗀다.
 * 건물 이름에 띄어쓰기 없이 붙어 오기도 해서(«지엔코빌딩kotlin.Unit») 낱말이 아니라 글자로 뗀다.
 */
object NodeText {
    private const val UNIT_NOISE = "kotlin.Unit"

    /** 앞뒤 공백·찌꺼기 글자를 뗀 글자 · 남는 것이 없으면 null(모으지 않는다) */
    fun clean(raw: CharSequence?): String? =
        raw?.toString()?.replace(UNIT_NOISE, "")?.trim()?.takeIf { it.isNotEmpty() }

    /** 사각형이 자리를 안 차지한다 — 스크롤 밖 노드의 표식일 수 있다 (목록 묶기 계측용) */
    fun isEmptyRect(top: Int, bottom: Int): Boolean = top >= bottom

    /** 좌표 노드에서 빼는 큰 틀 — 이 높이 이상은 목록 줄이 아니라 감싸는 틀이다 */
    const val MAX_TEXT_NODE_HEIGHT_PX = 400

    /**
     * 🌳 **지문 글자** — 노드마다 글자와 설명을 **둘 다**(비지 않으면) 차례로 (`NodeWalkTest`).
     * 화면이 바뀌었나(지문)와 상세 글자가 이것을 쓴다.
     */
    fun textsOf(nodes: List<RawNode>): List<String> = nodes.flatMap { listOfNotNull(clean(it.text), clean(it.desc)) }

    /**
     * 🌳 **좌표 노드** — 글자가 있으면(빈 글자라도) 글자만, 글자가 없을 때만 설명 · 높이 [MAX_TEXT_NODE_HEIGHT_PX] 이상 틀과 너비 0 은 뺀다.
     * 목록 조립(카드 묶기 · 누름)이 쓴다. 좌표 노드 수를 늘리지 않으려 글자·설명 중 하나만.
     */
    fun textNodesOf(nodes: List<RawNode>): List<Pair<String, RawNode>> = nodes.mapNotNull { n ->
        val t = clean(n.text ?: n.desc) ?: return@mapNotNull null
        if (n.bottom - n.top >= MAX_TEXT_NODE_HEIGHT_PX || n.right - n.left <= 0) null else t to n
    }
}

/**
 * 🌳 **훑은 노드 하나** — 글자 · 설명 · 화면 자리 (`NodeText.textsOf` · `textNodesOf` 가 이것 한 벌에서 두 가지를 만든다).
 * [node]·[rect] 는 원달앱 실행 중에만 채운다(누름용) — 검사에서는 null.
 */
data class RawNode(
    val text: CharSequence?, val desc: CharSequence?,
    val left: Int, val top: Int, val right: Int, val bottom: Int,
    val node: android.view.accessibility.AccessibilityNodeInfo? = null,
    val rect: android.graphics.Rect? = null,
)
