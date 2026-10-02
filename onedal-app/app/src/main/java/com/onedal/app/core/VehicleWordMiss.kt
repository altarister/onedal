package com.onedal.app.core

import java.time.LocalDate

/**
 * 🚚 **배차망 차종 낱말을 우리 차종에 못 맞췄다** — 운영센터 «이상 기록»에 «VEHICLE_UNKNOWN: 낱말»로 남긴다
 * (기사님 «그쪽이 정의한 걸 플러그인으로 우리 기준에 맞춰야 · 못 했다면 어드민에 남아 있어야»).
 *
 * 목록은 몇 초마다 다시 읽히므로 **같은 배차망 · 같은 낱말은 하루 한 번만** 올린다 — 날이 바뀌면 다시 한 번.
 * 보내는 손(`sink`)은 `HijackService` 가 단다(이상 기록 길 `POST /api/telemetry/anomalies`). 달기 전에는 세기만 한다.
 * 콜은 지금처럼 거른다 — 차종 빈칸 → 허용 차종이 있으면 vehicle. 고칠 곳은 shared 배차망 정의 표의 vehicleWords 한 줄이다.
 */
object VehicleWordMiss {
    /** (배차망 code, 낱말, 그 줄 원문) */
    @Volatile var sink: ((String, String, String) -> Unit)? = null

    private var day: LocalDate = LocalDate.now()
    private val sent = mutableSetOf<String>()

    /** 처음 본 낱말이면 true(그리고 올린다) — 같은 날 다시 보면 false */
    @Synchronized
    fun record(network: String, word: String, line: String, today: LocalDate = LocalDate.now()): Boolean {
        if (today != day) { day = today; sent.clear() }
        if (!sent.add("$network|$word")) return false
        sink?.invoke(network, word, line)
        return true
    }
}
