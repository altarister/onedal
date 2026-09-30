package com.onedal.app.core

/**
 * 🔒 **서버가 앞 콜을 심사 중인가 — 응답 맨 위 칸이 먼저** (`EvaluatingNowTest`).
 *
 * 필터 안의 evaluatingNow 는 상세 중 true · 목록 false 로 갈려, 그 칸 하나로 필터 버전이 30초마다 바뀌었다.
 * 서버는 버전을 이 칸 뺀 필터로 만들고 목록 보고 응답 맨 위에 늘 싣는다 — 본문이 생략된 응답에도.
 * 맨 위 칸이 없으면(옛 서버) 저장된 필터 안 값을 쓴다.
 */
object EvaluatingNow {
    /** 목록 보고 응답 원문의 맨 위 칸 — 없거나 못 읽으면 null */
    fun topOf(body: String): Boolean? = try {
        com.google.gson.JsonParser.parseString(body).asJsonObject.get(KEY)?.takeIf { !it.isJsonNull }?.asBoolean
    } catch (e: Exception) { null }

    fun of(top: Boolean?, inFilter: Boolean): Boolean = top ?: inFilter

    const val KEY = "evaluatingNow"
    /** 앱 저장소 이름 — 마지막 목록 보고 응답의 맨 위 값 (없으면 지운다) */
    const val PREF_KEY = "evaluatingNowTop"
}
