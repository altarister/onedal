package com.onedal.app.plugins.isflex

import com.google.gson.JsonParser
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import java.time.LocalDateTime

/**
 * 🔇 **인성플렉스 낱말 — 서버 파일 `keywords_isflex.json` 과 파서 기본값은 짝이다**.
 *
 * 원달앱은 서버 사전(`GET /api/config/keywords?app=플렉스`)을 받아 기본값과 합쳐 쓰되, 못 받으면 기본값(`NOISE_WORDS` · `DETAIL_ONLY_WORDS`)으로 돈다.
 * 받아 둔 사전의 `appName` 이 «플렉스»일 때만 합친다(`IsflexParser.wordsOf`) — 서버 파일의 이름표가 다르면 서버 낱말은 통째로 안 쓰인다.
 * 못 잡는 것: 서버 사전 고르기(`routes/config.ts`)가 «플렉스»에 이 파일을 주나(서버 curl) · 폰이 실제로 받아 저장했나.
 */
class IsflexNoiseWordsTest {
    private val now = LocalDateTime.of(2026, 10, 30, 20, 0)

    private val dict = JsonParser.parseString(File("../../onedal-web/server/config/keywords_isflex.json").readText()).asJsonObject

    private fun serverWords(key: String): Set<String> = dict[key].asJsonArray.map { it.asString }.toSet()

    /** 실물 목록 두 장의 줄을 주어진 잡음 낱말로 읽는다 — 매번 바뀌는 id · 시각은 뺀다 */
    private fun rows(words: Set<String>): List<String> =
        listOf(IsflexRealScreens.LIST_02, IsflexRealScreens.LIST_07).flatMap { cells ->
            IsflexRowGrouping.rows(cells).map { r ->
                IsflexParser.parseList(r.members.map { cells[it].text }, words, now).copy(id = "", timestamp = "").toString()
            }
        }

    @Test fun `서버 사전의 이름표는 플렉스 - 원달앱이 이 이름일 때만 서버 낱말을 합친다`() {
        assertEquals("플렉스", dict["appName"].asString)
    }

    @Test fun `서버 uiNoiseWords 는 파서 기본 잡음 낱말을 다 담는다`() {
        assertEquals("서버 사전에 없는 기본값", emptySet<String>(), IsflexParser.NOISE_WORDS - serverWords("uiNoiseWords"))
    }

    @Test fun `서버 detailOnlyWords 는 파서 기본 상세 전용 낱말을 다 담는다`() {
        assertEquals("서버 사전에 없는 기본값", emptySet<String>(), IsflexParser.DETAIL_ONLY_WORDS - serverWords("detailOnlyWords"))
    }

    /** 🔴 서버 낱말(홈 · 시트 · 진행중 화면 것)을 합쳐도 실물 목록 줄의 콜 칸은 기본값으로 읽은 것과 같다 — 서버 낱말이 지역 · 요금을 먹지 않는다 */
    @Test fun `서버 낱말을 합쳐도 실물 목록 줄의 콜 칸은 기본값으로 읽은 것과 같다`() {
        val base = rows(IsflexParser.NOISE_WORDS)
        assertEquals("실물 목록 줄 수", 11, base.size)
        assertEquals(base, rows(IsflexParser.NOISE_WORDS + serverWords("uiNoiseWords")))
    }
}
