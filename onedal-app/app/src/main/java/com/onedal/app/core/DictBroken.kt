package com.onedal.app.core

import java.time.LocalDate

/**
 * 📕 **서버 낱말 사전(`targetAppKeywords`)이 깨져 읽지 못했다** — 운영센터 «이상 기록»에 «DICT_BROKEN: 배차망 · 까닭»으로 남긴다.
 *
 * 파서는 그때 앱 기본값으로 걸러 콜은 계속 돈다 — 다만 기본값은 일부라 잡음 낱말이 지역으로 샐 수 있어, 깨진 채 하루가 가면 아무도 모른다.
 * 목록은 몇 초마다 다시 읽히므로 **같은 배차망은 하루 한 번만** 올린다 — 날이 바뀌면 다시 한 번 (`VehicleWordMiss` 와 같은 꼴).
 * 보내는 손(`sink`)은 `HijackService` 가 단다(이상 기록 길 `POST /api/telemetry/anomalies`). 달기 전에는 세기만 한다.
 */
object DictBroken {
    /** (배차망 이름, 까닭 글) */
    @Volatile var sink: ((String, String) -> Unit)? = null

    private var day: LocalDate = LocalDate.now()
    private val sent = mutableSetOf<String>()

    /** 오늘 이 배차망에서 처음이면 true(그리고 올린다) — 같은 날 다시 오면 false */
    @Synchronized
    fun record(network: String, error: Throwable, today: LocalDate = LocalDate.now()): Boolean {
        if (today != day) { day = today; sent.clear() }
        if (!sent.add(network)) return false
        sink?.invoke(network, "${error.javaClass.simpleName}: ${error.message?.take(80) ?: ""}")
        return true
    }
}
