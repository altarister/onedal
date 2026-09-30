package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/**
 * 🔁 **겉 파서(`ScrapParser`)는 배차망 파서의 함수를 하나도 빠뜨리지 않고 넘긴다** (라이브 09-30 21:47:01).
 * 기본값이 있는 함수를 넘기지 않으면 컴파일은 되고 목록 스캔은 늘 기본값을 읽는다 —
 * `judgmentValuesKey` 가 늘 null 이라 필터 버전 글자만 바뀌어도 막은 기억이 비었고, 알람 모드가 연 콜을 다시 열었다.
 */
class ScrapParserForwardsAllTest {
    private val root = "src/main/java/com/onedal/app/core"

    @Test fun `IScrapParser 의 함수·값마다 ScrapParser 에 override 가 있다`() {
        val declared = Regex("""^\s{4}(?:fun|val|var) (\w+)""", RegexOption.MULTILINE)
            .findAll(File("$root/IScrapParser.kt").readText()).map { it.groupValues[1] }.toSet()
        val forwarded = Regex("""override (?:fun|val|var) (\w+)""")
            .findAll(File("$root/ScrapParser.kt").readText()).map { it.groupValues[1] }.toSet()
        assertEquals("겉 파서가 안 넘기는 것", emptySet<String>(), declared - forwarded)
    }
}
