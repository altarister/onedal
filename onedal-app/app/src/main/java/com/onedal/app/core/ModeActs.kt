package com.onedal.app.core

/**
 * 🎛️ **도는 모드 → 원달앱이 하는 일 — 한 곳** (reviews/44 · 표는 shared `modeTable.ts` 의 `acts` · `ModeTablePairTest` 가 견준다).
 * 목록 누름(`HijackService`) · 소리 · 확정(`appContractsOnOpen`) · 확정 막기(`AutoTouchManager`)가 모드 이름을 따로 견주지 않고 여기를 본다.
 * 모르는 모드 값은 누르지도 울리지도 확정하지도 않는다 — 모르면 잡지 않는다(규칙 ④).
 */
data class ModeActs(
    /** 목록에서 통과 콜(요금 최고 하나)을 누른다 */
    val tapsList: Boolean,
    /** 통과 콜에 소리 · 진동을 낸다 */
    val sound: Boolean,
    /** 원달앱이 확정 · 수락을 누를 수 있다(오늘 콜 · 확정 버튼 있는 배차망일 때 — `appContractsOnOpen` · `appPressesAccept`) */
    val contracts: Boolean,
    /** 확정 · 수락 누르기 자체를 막는다(체험) */
    val blocksAccept: Boolean,
) {
    companion object {
        private val NOTHING = ModeActs(tapsList = false, sound = false, contracts = false, blocksAccept = false)

        fun of(mode: String): ModeActs = when (mode) {
            "AUTO" -> ModeActs(tapsList = true, sound = false, contracts = true, blocksAccept = false)
            "ALARM" -> ModeActs(tapsList = true, sound = true, contracts = false, blocksAccept = false)
            "SIMULATION" -> ModeActs(tapsList = true, sound = false, contracts = false, blocksAccept = true)
            else -> NOTHING   // 직접 · 모르는 값
        }
    }
}
