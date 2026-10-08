package com.onedal.app.core

/**
 * 🎛️ **도는 모드 → 원달앱이 하는 일 — 한 곳** (표는 shared `modeTable.ts` 의 `acts` · `ModeTablePairTest` 가 견준다).
 * 목록 누름(`HijackService`) · 확정(`appContractsOnOpen`) · 확정 막기(`AutoTouchManager`)가 모드 이름을 따로 견주지 않고 여기를 본다.
 * 모르는 모드 값은 누르지도 확정하지도 않는다 — 모르면 잡지 않는다(규칙 ④).
 */
data class ModeActs(
    /** 목록에서 통과 콜(요금 최고 하나)을 누른다 */
    val tapsList: Boolean,
    /** 원달앱이 확정 · 수락을 누를 수 있다(오늘 콜 · 확정 버튼 있는 배차망일 때 — `appContractsOnOpen` · `appPressesAccept`) */
    val contracts: Boolean,
    /** 확정 · 수락 누르기 자체를 막는다(체험) */
    val blocksAccept: Boolean,
) {
    companion object {
        private val NOTHING = ModeActs(tapsList = false, contracts = false, blocksAccept = false)

        fun of(mode: String): ModeActs = when (mode) {
            "AUTO" -> ModeActs(tapsList = true, contracts = true, blocksAccept = false)
            "ALARM" -> ModeActs(tapsList = true, contracts = false, blocksAccept = false)
            "SIMULATION" -> ModeActs(tapsList = true, contracts = false, blocksAccept = true)
            else -> NOTHING   // 직접 · 모르는 값
        }

        /**
         * 🛑 체험이면 계약을 만드는 확정 · 수락 글자 버튼만 막는다 — 배차망에 실제 계약을 만들지 않게(둘째 겹 · 첫째 겹은 [contracts]).
         *    «수락 · 확정» 글자에 더해 그 배차망의 확정 글자([acceptButtons] — 플러그인 · 화물24시 «배차신청»)도 막는다(29 P5-4 · 더하기만 — 지금 막는 것은 그대로).
         *    결재를 집행하는 탭(«닫기» · «취소»)은 지금 모드가 아니라 결재 종류로 가른다 — 체험 결재(`SIMULATED_*`)는 `DecisionPlan` 이 버튼 없이 뒤로 보낸다.
         */
        fun blocksTap(mode: String?, text: String, acceptButtons: List<String> = emptyList()): Boolean =
            of(mode ?: "").blocksAccept && (text.contains("수락") || text.contains("확정") || acceptButtons.any { text.contains(it) })
    }
}
