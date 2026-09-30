package com.onedal.app.core

/**
 * 🔁 **1초 보고를 켠 쪽들 — 켠 쪽마다 한 칸, 끄는 쪽은 자기 몫만 끈다** (`PollOwnersTest`).
 * 참/거짓 한 칸을 셋이 나눠 쓰면 한쪽이 끌 때 다른 쪽이 켜 둔 것도 꺼진다(손 클릭 AUTO 임시 10초는 끝날 때 조건 없이 껐다).
 */
class PollOwners {
    companion object {
        /** 상세에 머무는 동안 서버 판결·빨리 접기를 1초마다 묻는다 (`scheduleDetailBack`) */
        const val DETAIL_WAIT = "상세 대기"
        /** 안전취소 타이머가 도는 동안 (인성·24) */
        const val SAFE_CANCEL = "안전취소"
        /** 손 클릭인데 스위치가 AUTO — 임시 10초 */
        const val HAND_AUTO = "손 클릭 AUTO"
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
