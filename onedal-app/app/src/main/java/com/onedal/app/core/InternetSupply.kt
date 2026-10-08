package com.onedal.app.core

import com.google.gson.JsonObject
import com.google.gson.JsonParser

/**
 * 🌐 **인터넷 길 — 블루투스 공급이 못 닿을 때 같은 값을 서버에 1초마다 묻는다** (A1 S1 · 기사님 «블루투스가 기본 길 · 끊기면 인터넷이 받침»).
 * 켜는 사실 셋: 블루투스 끊김 · 관제앱의 서버 끊김 · 안전취소 걸림 — 셋 다 거짓이면 끈다. 시간 짐작은 없다.
 * 받은 것은 블루투스와 같은 처리([Sink])로 넘긴다 — 결재가 두 길로 와도 집행은 한 번(`DecisionReplay`) · «받았음»은 부르는 쪽이 인터넷으로.
 * 공급 · 이 폰 몫 · 빨리 접기는 바뀐 것만 넘긴다 — 1초마다 같은 것을 다시 넣지 않는다. 결재는 «받았음» 전까지 서버가 다시 주니 오는 대로 넘긴다.
 * 메인 스레드에서만 부른다(기다림 장부).
 */
class InternetSupply(
    private val waitBook: WaitBook,
    /** 켜는 사실 셋을 지금 읽는다 */
    private val facts: () -> Facts,
    /** 서버에 한 번 묻는다 — 답 본문(못 받으면 null)을 메인 스레드에서 받는 손에 */
    private val fetch: (onBody: (String?) -> Unit) -> Unit,
    private val sink: Sink,
) {
    data class Facts(val linked: Boolean, val serverAlive: Boolean, val armed: Boolean)

    /** 블루투스 받기와 같은 처리 — 본문 모양도 블루투스와 같다 */
    interface Sink {
        fun supply(json: String)
        fun phone(json: String)
        fun decision(json: String)
        fun fold(json: String)
    }

    companion object {
        const val NAME = "인터넷 공급"
        /** 묻는 간격 — 기사님 «고정값» */
        const val POLL_MS = 1000L
        /** 한 번 묻기의 연결 · 읽기 시한 — 늦으면 다음 차례가 건너뛰고 기다린다 */
        const val TIMEOUT_MS = 3000

        /** 🌐 켜는 판단 — 사실 셋 중 하나라도 참이면 묻는다 */
        fun wanted(linked: Boolean, serverAlive: Boolean, armed: Boolean): Boolean = !linked || !serverAlive || armed

        /** 켠 까닭 한 줄 — 관제앱 서버 끊김은 블루투스가 붙어 있을 때만 따로 적는다(끊기면 서버 붙음도 모른다) */
        fun whyOn(f: Facts): String = listOfNotNull(
            "블루투스 끊김".takeIf { !f.linked },
            "관제앱 서버 끊김".takeIf { f.linked && !f.serverAlive },
            "안전취소 걸림".takeIf { f.armed },
        ).joinToString(" · ")
    }

    var on = false
        private set
    private var inFlight = false
    private var lastSupply: String? = null
    private var lastPhone: String? = null
    private var lastFoldOrderId: String? = null

    /** 사실이 바뀌었을 때 부른다 — 켜야 하면 켜고 꺼야 하면 끈다 */
    fun refresh() {
        val f = facts()
        val want = wanted(f.linked, f.serverAlive, f.armed)
        if (want == on) return
        if (want) turnOn(f) else turnOff()
    }

    private fun turnOn(f: Facts) {
        on = true
        lastSupply = null; lastPhone = null; lastFoldOrderId = null   // 켤 때마다 첫 답은 넘긴다 — 꺼진 사이 블루투스가 다른 값을 줬을 수 있다
        AppLogger.i("InternetSupply", LogTag.NETWORK, "🌐 [인터넷 묻기 켬] ${whyOn(f)} — ${POLL_MS}ms 마다 서버에 묻는다")
        tick()
    }

    private fun turnOff() {
        on = false
        waitBook.cancel(NAME)
        AppLogger.i("InternetSupply", LogTag.NETWORK, "🌐 [인터넷 묻기 끔] 블루투스 · 관제앱 서버 붙음 · 안전취소 없음")
    }

    private fun tick() {
        if (!on) return
        if (!inFlight) {
            inFlight = true
            fetch { body ->
                inFlight = false
                if (on && body != null) take(body)   // 끈 뒤 온 답은 버린다 — 결재는 «받았음» 전이라 서버가 블루투스로 다시 준다
            }
        }
        waitBook.schedule(NAME, WaitBook.SERVICE, POLL_MS) {
            val f = facts()
            if (wanted(f.linked, f.serverAlive, f.armed)) tick() else turnOff()
        }
    }

    private fun take(body: String) {
        val j = try { JsonParser.parseString(body).asJsonObject } catch (e: Exception) {
            AppLogger.w("InternetSupply", LogTag.NETWORK, "🌐 [인터넷 답 못 읽음] ${e.message}")
            return
        }
        j.get("filter")?.takeIf { it.isJsonObject }?.let { filter ->
            val key = "${j.get("filterVersion")}|$filter"
            if (key != lastSupply) { lastSupply = key; sink.supply(body) }
        }
        j.get("phone")?.takeIf { it.isJsonObject }?.toString()?.let { phone ->
            if (phone != lastPhone) { lastPhone = phone; sink.phone(phone) }
        }
        j.get("decisions")?.takeIf { it.isJsonArray }?.asJsonArray?.forEach { d -> if (d.isJsonObject) sink.decision(d.toString()) }
        j.get("folds")?.takeIf { it.isJsonArray }?.asJsonArray?.forEach { f ->
            val orderId = (f as? JsonObject)?.get("orderId")?.takeIf { it.isJsonPrimitive }?.asString ?: return@forEach
            if (orderId != lastFoldOrderId) { lastFoldOrderId = orderId; sink.fold(f.toString()) }
        }
    }
}
