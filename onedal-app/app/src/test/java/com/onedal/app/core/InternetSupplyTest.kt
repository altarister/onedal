package com.onedal.app.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 🌐 **인터넷 길** (`InternetSupply`) — 켜는 사실 셋 · 끄는 조건 · 1초 묻기 · 바뀐 것만 넘기기.
 * 받은 것은 블루투스와 같은 처리로 간다 — 같은 결재가 두 길로 와도 집행은 한 번(`DecisionReplay`).
 */
class InternetSupplyTest {
    private var now = 0L
    private val posted = mutableListOf<Pair<Runnable, Long>>()
    private val book = WaitBook(object : WaitBook.Poster {
        override fun post(r: Runnable, delayMs: Long) { posted.add(r to delayMs) }
        override fun remove(r: Runnable) { posted.removeAll { it.first === r } }
    }) { now }

    private var facts = InternetSupply.Facts(linked = true, serverAlive = true, armed = false)
    private var asked = 0
    private val answers = ArrayDeque<(String?) -> Unit>()
    private val got = mutableListOf<String>()

    private val net = InternetSupply(book, { facts }, { onBody -> asked++; answers.addLast(onBody) }, object : InternetSupply.Sink {
        override fun supply(json: String) { got += "공급" }
        override fun phone(json: String) { got += "폰 $json" }
        override fun decision(json: String) { got += "결재 $json" }
        override fun fold(json: String) { got += "접기 $json" }
    })

    /** 1초가 지났다 — 걸린 묻기 차례를 돌린다 */
    private fun second() { val r = posted.toList(); posted.clear(); r.forEach { it.first.run() } }
    private fun answer(body: String?) { answers.removeFirst()(body) }

    private val body = """{"filter":{"isActive":true},"filterVersion":"v1","phone":{"mode":"AUTO","evaluatingNow":false},
        |"decisions":[{"deviceId":"d","orderId":"o1","action":"KEEP"}],"folds":[{"deviceId":"d","orderId":"o1","remainMs":3000}]}""".trimMargin()

    @Test fun `켜는 사실 셋 — 하나만 참이어도 묻고 셋 다 거짓이면 묻지 않는다`() {
        assertTrue("블루투스 끊김", InternetSupply.wanted(linked = false, serverAlive = true, armed = false))
        assertTrue("관제앱 서버 끊김", InternetSupply.wanted(linked = true, serverAlive = false, armed = false))
        assertTrue("안전취소 걸림", InternetSupply.wanted(linked = true, serverAlive = true, armed = true))
        assertFalse("셋 다 거짓", InternetSupply.wanted(linked = true, serverAlive = true, armed = false))
    }

    @Test fun `켠 까닭 한 줄 — 블루투스가 끊기면 관제앱 서버 끊김은 따로 적지 않는다`() {
        assertEquals("블루투스 끊김 · 안전취소 걸림", InternetSupply.whyOn(InternetSupply.Facts(linked = false, serverAlive = false, armed = true)))
        assertEquals("관제앱 서버 끊김", InternetSupply.whyOn(InternetSupply.Facts(linked = true, serverAlive = false, armed = false)))
    }

    @Test fun `사실이 다 멀쩡하면 켜지 않는다 — 묻지 않는다`() {
        net.refresh()
        assertFalse(net.on); assertEquals(0, asked); assertTrue(posted.isEmpty())
    }

    @Test fun `블루투스가 끊기면 곧바로 한 번 묻고 1초마다 다시 묻는다`() {
        facts = facts.copy(linked = false)
        net.refresh()
        assertTrue(net.on); assertEquals(1, asked)
        assertEquals(InternetSupply.POLL_MS, posted.single().second)
        answer(null); second()
        assertEquals(2, asked)
    }

    @Test fun `안전취소가 걸리면 블루투스가 멀쩡해도 묻는다 · 풀리면 다음 차례에 끈다`() {
        facts = facts.copy(armed = true)
        net.refresh()
        assertTrue(net.on)
        answer(null)
        facts = facts.copy(armed = false)
        second()
        assertFalse(net.on); assertEquals(1, asked); assertTrue(posted.isEmpty())
    }

    @Test fun `사실이 돌아오면 refresh 가 곧바로 끈다 — 걸린 차례도 거둔다`() {
        facts = facts.copy(serverAlive = false)
        net.refresh()
        facts = facts.copy(serverAlive = true)
        net.refresh()
        assertFalse(net.on); assertTrue(posted.isEmpty())
    }

    @Test fun `답이 아직 안 왔으면 다음 차례는 묻지 않고 기다린다 — 겹쳐 묻지 않는다`() {
        facts = facts.copy(linked = false)
        net.refresh()
        second(); second()
        assertEquals(1, asked)
        answer(null); second()
        assertEquals(2, asked)
    }

    @Test fun `답의 넷을 블루투스와 같은 처리로 넘긴다`() {
        facts = facts.copy(linked = false)
        net.refresh()
        answer(body)
        assertEquals(listOf(
            "공급",
            """폰 {"mode":"AUTO","evaluatingNow":false}""",
            """결재 {"deviceId":"d","orderId":"o1","action":"KEEP"}""",
            """접기 {"deviceId":"d","orderId":"o1","remainMs":3000}""",
        ), got)
    }

    @Test fun `같은 공급 · 이 폰 몫 · 접기는 다시 넘기지 않는다 — 결재는 «받았음» 전까지 오는 대로 넘긴다`() {
        facts = facts.copy(linked = false)
        net.refresh()
        answer(body); second(); answer(body)
        assertEquals(listOf("공급", "폰", "결재", "접기", "결재"), got.map { it.substringBefore(' ') })
    }

    @Test fun `공급 판이나 이 폰 몫이 바뀌면 넘긴다`() {
        facts = facts.copy(linked = false)
        net.refresh()
        answer(body); second()
        answer(body.replace("\"v1\"", "\"v2\"").replace("AUTO", "ALARM"))
        assertEquals(listOf("공급", "폰", "결재", "접기", "공급", "폰", "결재"), got.map { it.substringBefore(' ') })
    }

    @Test fun `다시 켜면 첫 답은 같아도 넘긴다 — 꺼진 사이 블루투스가 다른 값을 줬을 수 있다`() {
        facts = facts.copy(linked = false)
        net.refresh(); answer(body)
        facts = facts.copy(linked = true); net.refresh()
        facts = facts.copy(linked = false); net.refresh(); answer(body)
        assertEquals(listOf("공급", "폰", "결재", "접기", "공급", "폰", "결재", "접기"), got.map { it.substringBefore(' ') })
    }

    @Test fun `끈 뒤 온 답은 버린다`() {
        facts = facts.copy(linked = false)
        net.refresh()
        facts = facts.copy(linked = true); net.refresh()
        answer(body)
        assertTrue(got.isEmpty())
    }

    @Test fun `phone 이 null 이면(서버가 모드를 모른다) 이 폰 몫은 넘기지 않는다 · 못 읽는 답은 버린다`() {
        facts = facts.copy(linked = false)
        net.refresh()
        answer("""{"filter":{"a":1},"filterVersion":"v1","phone":null,"decisions":[],"folds":[]}""")
        second(); answer("<html>")
        assertEquals(listOf("공급"), got)
    }

    @Test fun `같은 결재가 두 길로 와도 집행은 한 번 — 둘째는 «다시 옴»`() {
        facts = facts.copy(armed = true)
        net.refresh()
        answer(body)
        var lastExecuted: String? = null
        val steps = listOf("o1", "o1").map { id ->   // 블루투스로 한 번 · 인터넷으로 한 번
            DecisionReplay.stepOf(id, lastExecuted, "o1", "o1").also { if (it == DecisionStep.EXECUTE) lastExecuted = id }
        }
        assertEquals(listOf(DecisionStep.EXECUTE, DecisionStep.REPLAY), steps)
    }
}
