package com.onedal.app.core

/**
 * 👁️ **«본 콜» 기억 — 스캔 루프의 지문 장부** (#79 · 2026-08-30 신설)
 *
 * 원래 `HijackService` 의 `processedOrderHashes` 한 세트가 두 가지 사실을 답했다:
 *   ① 이 콜은 **평가를 마쳤다** — 다시 평가(알람·클릭)하지 않는다
 *   ② 이 콜은 **서버에 보고했다** — 텔레메트리를 중복으로 보내지 않는다
 *
 * 🔴 그래서 콜을 잡는 동안(선점 잠금 · `isActive=false`) 처음 나타난 콜이
 *    **평가 없이** ①의 도장을 받았다 — `decide()` 는 첫 줄에서 돌아서는데
 *    지문은 등재돼, 잠금이 풀려도 «이미 본 콜»로 영영 건너뛰었다.
 *    실측: 7지점 5판 16:04 — 06·07이 평가 로그 0줄로 삼켜짐 (버그 대장 #79).
 *
 * 그릇을 갈라 각자 하나의 사실만 답하게 한다 (#76·#78 과 같은 수리 방향).
 */
class CallMemory(
    private val maxSize: Int = 100,
    private val keepCount: Int = 50,
) {
    private val evaluated = LinkedHashSet<Int>()
    private val reported = LinkedHashSet<Int>()

    /** 평가 기억의 크기 — «이미 본 콜» 로그가 찍는 숫자 */
    val evaluatedCount: Int get() = evaluated.size

    /** 🔄 배차망 전환 — 남의 배차망 지문이 남으면 «이미 본 콜»로 삼킨다 (0831) */
    fun clear() { evaluated.clear(); reported.clear() }

    /** 서버가 마지막으로 알려 준 회차 — null 이면 아직 못 받았다 */
    private var lastRound: Int? = null

    /**
     * 🧹 **서버 회차 — 바뀌면 기억을 비운다** (2026-09-15 · 서버 `routes/sim.ts` 의 `callMemoryRoundForPhone`).
     *
     * 시뮬레이터 시나리오를 다시 시작하면 서버가 이전 콜을 리셋하고 회차를 올린다. 같은 콜이 다시 뜨는데
     * 지문(상차 동 + 하차 동 + 요금)이 같아 «이미 본 콜»로 판정 없이 삼켰다.
     * 🔴 **처음 받은 회차는 기억만 한다** — 이미 누른 콜을 다시 누르지 않게 (선등재 기억을 지키는 이유와 같다).
     * @return 비웠으면 true
     */
    fun onRound(round: Int): Boolean {
        val prev = lastRound
        lastRound = round
        if (prev == null || prev == round) return false
        clear()
        return true
    }

    /** ① 이 콜은 평가를 마쳤는가 — 맞으면 스캔 루프가 건너뛴다 */
    fun alreadyEvaluated(hash: Int): Boolean = hash in evaluated

    /**
     * 클릭 직전 선(先)등재 — 2차 검증 반송(취소)으로 리스트에 튕겨나와도
     * 또 누르지 않기 위한 지뢰 탐지기. 클릭은 평가를 전제하므로 평가 기억에 든다.
     */
    fun markEvaluated(hash: Int) {
        evaluated += hash
        trim(evaluated)
    }

    /**
     * 스캔 루프의 끝 — 이번에 본 콜을 장부에 적는다.
     *
     * @param wasEvaluated 판정(`decide`)이 실제로 돌았는가.
     *   원천은 성적표다: `decide` 는 평가가 돌 때만 `tally.seen` 을 올리므로
     *   호출자는 앞뒤 `seen` 을 비교해 넘긴다 — 판단을 여기서 재구성하지 않는다.
     */
    fun onScanned(hash: Int, wasEvaluated: Boolean) {
        // 🔴 평가가 실제로 돈 콜만 기억한다 — 잠금(선점·대기) 중에 스쳐 간 콜은
        //    기억에 남기지 않아, 잠금이 풀리는 다음 스캔에서 처음처럼 평가된다 (#79)
        if (!wasEvaluated) return
        evaluated += hash
        trim(evaluated)
    }

    /** ② 보고는 콜당 한 번 — 처음이면 true (호출자가 그때만 enqueue 한다) */
    fun markReportedOnce(hash: Int): Boolean {
        val first = reported.add(hash)
        trim(reported)
        return first
    }

    private fun trim(set: LinkedHashSet<Int>) {
        if (set.size > maxSize) {
            val keepers = set.toList().takeLast(keepCount)
            set.clear()
            set.addAll(keepers)
        }
    }
}
