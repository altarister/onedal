package com.onedal.app.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * 🔁 **끌 수 있는 주기 읽기** (`PollLoopTest` · 29 X5 · P1-12) — 두 번 켜도 하나 · 끄면 더 안 읽는다.
 * 원달앱 화면의 1초 읽기(`MainViewModel`)가 쓴다 — 끄는 곳이 없으면 화면이 다시 만들어질 때마다 루프가 늘었다.
 */
class PollLoop(private val scope: CoroutineScope, private val intervalMs: Long, private val body: () -> Unit) {
    private var job: Job? = null
    fun start() {
        if (job?.isActive == true) return
        job = scope.launch { while (isActive) { body(); delay(intervalMs) } }
    }
    fun stop() { job?.cancel(); job = null }
}
