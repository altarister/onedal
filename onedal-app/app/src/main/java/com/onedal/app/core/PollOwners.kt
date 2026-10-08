package com.onedal.app.core

/**
 * 🔁 **1초 보고를 켠 쪽들 — 켠 쪽마다 한 칸, 끄는 쪽은 자기 몫만 끈다** (`PollOwnersTest`).
 * 참/거짓 한 칸을 둘이 나눠 쓰면 한쪽이 끌 때 다른 쪽이 켜 둔 것도 꺼진다.
 */
class PollOwners {
    companion object {
        /** 상세에 머무는 동안 1초 보고 (`scheduleDetailBack`) */
        const val DETAIL_WAIT = "상세 대기"
        /** 안전취소 타이머가 도는 동안 (인성·24) */
        const val SAFE_CANCEL = "안전취소"
    }

    private val owners = mutableSetOf<String>()

    val any: Boolean
        @Synchronized get() = owners.isNotEmpty()

    /** 켜거나 끈다 — 1초 보고가 켜짐↔꺼짐으로 바뀌었으면 true(보고 주기를 그때만 다시 건다) */
    @Synchronized
    fun set(owner: String, on: Boolean): Boolean {
        val before = owners.isNotEmpty()
        if (on) owners.add(owner) else owners.remove(owner)
        return before != owners.isNotEmpty()
    }
}
