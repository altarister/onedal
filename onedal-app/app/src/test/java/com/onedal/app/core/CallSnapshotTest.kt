package com.onedal.app.core

import android.content.ContextWrapper
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.core.IScrapParser
import com.onedal.app.plugins.hwamul24.Hwamul24Parser
import com.onedal.app.plugins.insung.InsungParser
import com.onedal.app.plugins.isflex.IsflexParser
import com.onedal.app.plugins.kakaopicker.KakaoPickerParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 📐 **비교 기준 — 같은 화면 글자로 지금 플러그인 파서가 만드는 콜 값** (계획서 A2).
 * 기본 콜로 옮기는 내내 이 값이 안 변해야 운행이 그대로다. 문제지는 `shared/src/network/callSnapshotCases.json`,
 * 서버 상세 읽기는 `server/tests/rules/callSnapshot.test.ts` 가 같은 파일로 푼다.
 * 🔴 기대값은 지금 동작을 적은 것이다. 하차 앞글자가 사라지는 줄도 그대로 적었다 — 맞다는 뜻이 아니다.
 */
class CallSnapshotTest {
    private val cases = JsonParser.parseString(File("../../onedal-web/shared/src/network/callSnapshotCases.json").readText()).asJsonObject["app"].asJsonArray.map { it.asJsonObject }
    private val parsers: Map<String, IScrapParser> = mapOf(
        "insung" to InsungParser(ContextWrapper(null)), "hwamul24" to Hwamul24Parser(ContextWrapper(null)),
        "kakaopicker" to KakaoPickerParser(null), "isflex" to IsflexParser(),
    )

    /** 돌릴 때마다 달라지거나 입력 그대로인 칸을 뺀 콜 값 */
    private fun valuesOf(network: String, texts: List<String>): JsonObject =
        Gson().toJsonTree(parsers.getValue(network).parse(texts)).asJsonObject.apply { listOf("id", "timestamp", "rawText").forEach { remove(it) } }

    @Test fun `같은 화면 글자는 같은 콜 값이 된다`() {
        assertTrue("문제지가 비었다", cases.isNotEmpty())
        /* 틀린 줄을 한 번에 다 보인다 — 첫 줄에서 멈추면 묶음 작업 중 한 줄씩만 보인다 */
        val wrong = cases.mapNotNull { c ->
            val got = valuesOf(c["network"].asString, c["texts"].asJsonArray.map { it.asString })
            if (got == c["expect"].asJsonObject) null else "${c["network"].asString} ${c["why"].asString}\n  기대 ${c["expect"]}\n  실제 $got"
        }
        assertEquals(wrong.joinToString("\n"), 0, wrong.size)
    }
}
