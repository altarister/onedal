package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * 🔢 **값 모양 — 원달앱이 싣기 전에 바꾸는 이름표와 서버 도구의 가름이 한 벌** (reviews/24).
 * 짝: `onedal-web/scripts/lib/wordKinds.mjs` 의 `VALUE_SHAPES` ↔ `ValueShape.kt`. 정규식 글자와 이름표가 같아야 한다.
 */
class ValueShapePairTest {

    @Test fun `정규식과 이름표가 서버 도구와 같다 (차례까지)`() {
        val src = File("../../onedal-web/scripts/lib/wordKinds.mjs").readText()
        val body = src.substringAfter("export const VALUE_SHAPES = [").substringBefore("];")
        val server = Regex("""\{ re: /(.+)/, label: '([^']+)' \}""").findAll(body)
            .map { it.groupValues[1].replace("\\/", "/") to it.groupValues[2] }.toList()
        assertTrue("서버 목록을 못 읽었다", server.size >= 5)
        assertEquals(server, ValueShape.SHAPES.map { it.first.pattern to it.second })
    }

    @Test fun `실물 값은 이름표로 바뀐다`() {
        assertEquals("<숫자>", ValueShape.normalize("16,093"))
        assertEquals("<숫자>", ValueShape.normalize("40.0"))
        assertEquals("<거리>", ValueShape.normalize("4.7km"))
        assertEquals("<시각>", ValueShape.normalize("14:00"))
        assertEquals("<시각>", ValueShape.normalize("21시"))
        assertEquals("<남은 시간>", ValueShape.normalize("31분 내"))
        assertEquals("<날짜>", ValueShape.normalize("9/30(수)"))
        assertEquals("<날짜>", ValueShape.normalize("10일"))
        assertEquals("<전화>", ValueShape.normalize("010-1234-5678"))
        assertEquals("<금액>", ValueShape.normalize("11만원"))
        assertEquals("<금액>", ValueShape.normalize("16,093원"))
        assertEquals("<포인트>", ValueShape.normalize("2387P"))
        assertEquals("<포인트>", ValueShape.normalize("29,491 P"))
        assertEquals("<개수>", ValueShape.normalize("1개"))
        assertEquals("<동호수>", ValueShape.normalize("105동"))
        assertEquals("<동호수>", ValueShape.normalize("1203호"))
        assertEquals("<전화>", ValueShape.normalize("01012345678"))
    }

    @Test fun `글자는 그대로다`() {
        assertEquals("당상", ValueShape.normalize("당상"))
        assertEquals("반나절", ValueShape.normalize("반나절"))
    }
}
