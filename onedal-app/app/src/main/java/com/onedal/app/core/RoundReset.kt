package com.onedal.app.core

/**
 * 🧹 **서버 회차가 오르면 «본 콜» 기억과 «같은 길» 기억을 함께 비운다** (38 F32 · 기사님 «가» · `RoundResetTest`).
 * 회차가 바뀌었는지는 `CallMemory.onRound` 가 정한다. 두 기억은 서로를 모르고, 묶는 것은 회차를 받는 이 자리 하나다.
 * @return 비웠으면 true
 */
object RoundReset {
    fun apply(round: Int, callMemory: CallMemory, alarmedRoutes: AlarmedRoutes): Boolean =
        callMemory.onRound(round).also { if (it) alarmedRoutes.clear() }
}
