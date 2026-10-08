package com.onedal.app.core

import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 📋 **목록 한 줄을 처리한다 — 읽기 · 건너뛰기 · 판정 · 기억 · 보고** (`HijackService.handleListScreen` 의 루프 몸통).
 * 판단과 기록이 줄마다 섞여 있어(성적표 앞뒤로 «평가했나»를 재고, 막은 콜만 기억한다) 차례째 옮겼다 — 이름 «scan»이 기록을 한다는 뜻이다.
 * 서비스는 셈(요금 실패 · 덜 읽힘 · 이미 본 콜) · 이번 읽기의 지역 목록(보인 콜 · 지문 위치 · 누를 후보)을 결과(`Outcome`)대로 채운다.
 * ⚠️ 판단(요금 0 · 덜 읽힘 · 이미 본 콜 · 막힌 계정 · 이미 연 콜)과 기록(기억 · 보고 · 성적표)을 값으로 가르는 일은 남아 있다 — `ListRowScanTest` 가 그 가름의 안전망.
 */
class ListRowScan(
    private val scrapParser: IScrapParser,
    private val callMemory: CallMemory,
    private val alarmedRoutes: AlarmedRoutes,
    private val tally: FilterTally,
    private val accountBlocked: Boolean,
    private val nowMs: Long,
    private val listScanNo: Long,
    private val currentTargetApp: String,
    /** 이 배차망은 하차 칸이 빈 줄도 다 읽은 것으로 치나(도보) — `DispatchPlugin.allowsEmptyDropoff` */
    private val allowsEmptyDropoff: (SimplifiedOfficeOrder) -> Boolean,
    /** 📡 서버에 보고 — 콜당 한 번(텔레메트리 줄 + 최근 목록 콜) */
    private val report: (SimplifiedOfficeOrder) -> Unit,
) {
    enum class Kind { FARE_FAIL, UNREAD, SEEN, SCANNED }

    /** @property addHit 통과했고 아직 안 연 콜 — 루프 뒤 «요금 최고 하나»의 후보 */
    data class Outcome(val kind: Kind, val order: SimplifiedOfficeOrder, val orderHash: Int = 0, val addHit: Boolean = false)

    fun scanRow(cardTexts: List<String>): Outcome {
        val order = scrapParser.parse(cardTexts)

        if (order.fare == 0) {
            /**
             * 💸 **요금을 못 읽으면 그 카드의 글자를 남긴다** (기사님 확정).
             *
             * 숫자(`요금실패 1`)만으로는 **차종을 못 읽은 건지 요금 자리에 딴 게 있는
             * 건지** 알 수가 없어, 재현해도 원인을 못 찾았다.
             *
             * 파서는 `차종 노드 → 바로 다음이 요금` 으로 읽는다(`InsungParser`).
             * 그래서 **텍스트 순서 자체가 진단**이다 — 앞부분만 봐도 어디서 어긋났는지 보인다.
             * 카드마다 매번 찍히지 않게 **못 읽은 것만** 남긴다.
             */
            /**
             * 🔴 **빈 카드는 스캔 요약이 찍는다** — 여기서 찍으면 실주행에서 수만 줄이 나와 다른
             *    로그를 통째로 묻는다. 빈 카드는 스캔 요약(`👁️ [리스트 스캔]`)이
             *    좌표와 함께 한 줄로 말한다. 여기는 **글자는 있는데 요금만 못 읽은**
             *    진짜 파싱 실패만 남긴다.
             */
            if (cardTexts.isNotEmpty()) {
                AppLogger.w(TAG, "💸 [요금 못 읽음] ${cardTexts.joinToString(" | ").take(140)}")
            }
            return Outcome(Kind.FARE_FAIL, order)
        }

        /**
         * 📋 **줄을 다 읽었나** — 상차·하차·요금·상차지거리를 못 읽은 줄은 같은 콜인지·반경 안인지 알 수 없다(기사님 «같은 콜인지는 모든 값이 들어 있을 때»).
         * 그 스캔에서 통째로 뺀다 — 지문·기억·서버 보고·알람·누르기 전부 안 한다. 다음 스캔에 읽히면 그때 본다.
         */
        if (!com.onedal.app.core.engine.OrderRequirement.listComplete(order,
                allowsEmptyDropoff(order))) {
            return Outcome(Kind.UNREAD, order)
        }
        val orderHash = CallMemory.fingerprintOf(order)
        com.onedal.app.core.ListSightings.saw(orderHash, listScanNo)   // 🧾 몇 번째 읽기에서 봤나 — 같은 콜 요금 인상 가르기
        // 📅 예약인데 날을 모른다 — 상세가 가른다. 배차망별로 몇 번인지 세려고 콜당 한 줄
        if (order.reserved == true && order.reservedDay == null && LogOnce.changed("reservation-unknown:$orderHash", "1"))
            AppLogger.i(TAG, LogTag.FILTER, "📅 [예약 날 모름] $currentTargetApp · ${order.pickup}→${order.dropoff} ${order.fare}원 · ${order.tagsText ?: order.scheduleText ?: ""}")
        /**
         * ⏭️ **건너뛰었다는 사실을 남긴다**.
         *
         * 지문은 **상차+하차+요금**이라 차종만 바꾼 콜은 같은 콜로 보인다. 그런데
         * 아무 로그 없이 `continue` 하니, 화면엔 떴는데 판정이 한 줄도 안 남는다 —
         * *"필터가 막았나 / 요금을 못 읽었나 / 서버가 안 보냈나"* 를 가릴 수가 없다.
         *
         * 차종만 바꾼 문제지를 다시 흘리면 조용히 건너뛰어 **서버를 고쳤는지조차 확인 못 한다.**
         * (캐시는 접근성 토글로 서비스가 새로 만들어져야 비워진다 — 앱을 밀어내도 안 된다)
         */
        /**
         * 🔁 **가까워진 콜은 다시 판정한다** (기사님 «가») — 반경 밖이라 막았던 콜이 오늘 반경 안으로 들어오면 막은 기억을 푼다.
         * 소리는 울림 함 규칙(같은 길 한 번)대로다. 내일 이후 콜은 집 기준 목록으로 가르므로 폰 km 로 풀지 않는다.
         */
        if ((order.reservedDay ?: 0) < 1) {
            val scanRadiusKm = scrapParser.todayPickupRadiusKm()
            callMemory.releaseIfCloser(orderHash, order.pickupDistance, scanRadiusKm)?.let { was ->
                AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔁 [가까워져 다시 판정] ${order.pickup}→${order.dropoff} · $was → ${order.pickupDistance}km (반경 ${scanRadiusKm}km)")
            }
        }
        if (callMemory.alreadyEvaluated(orderHash)) {
            // 🔕 콜마다 첫 한 번만 (차종만 바꾼 문제지 진단용) — 스캔마다 되풀이하지 않는다
            if (LogOnce.changed("seen:$orderHash", "seen")) AppLogger.d(TAG, LogTag.FILTER, "⏭️ [이미 본 콜] ${order.pickup.take(14)} → ${order.dropoff.take(14)} " +
                "${order.fare}원 (지문 $orderHash · 기억 ${callMemory.evaluatedCount}개)")
            return Outcome(Kind.SEEN, order, orderHash)
        }

        // 🌟 [항시 인터셉터] 콜 필터 매칭 검사 (디버그 로그를 위해 MANUAL/AUTO 무관하게 항시 실행)
        /**
         * 🔒 **평가가 실제로 돌았는지는 성적표가 답한다** (#79).
         * `decide()` 는 필터가 잠겨 있으면(선점 중·대기) 첫 줄에서 돌아서며
         * `tally.seen` 을 올리지 않는다 — 앞뒤 차이가 «평가했다»의 유일한 원천이다.
         * 여기서 필터를 다시 읽어 판단하면 decide 와 두 벌이 된다 (규칙 ③).
         */
        val seenBefore = tally.seen
        val isTarget = !accountBlocked && scrapParser.shouldClick(order, tally)
        val wasEvaluated = tally.seen > seenBefore

        /**
         * 🗳️ **판정을 콜에 실어 보낸다**.
         *
         * 현황판이 「🗑️ 버린 콜」 목록을 그릴 때 앱 판정식을 **TS 로 옮겨 적은 사본**으로
         * 다시 재고 있었고, 그것이 이미 한 번 갈라졌다 — 앱은 요율 모델이 서면
         * `minFare` 를 안 보는데 사본은 그것만 봐서 **가짜 «통과»** 를 냈다.
         * 값이 함께 가면 그 사본이 통째로 사라진다.
         *
         * 🔴 **성적표는 다시 세지 않는다** — `tally` 를 안 넘긴다. 위에서 이미 셌고,
         *    두 번 세면 «이 축을 풀면 몇 개가 들어오나»가 두 배로 읽힌다 (#79 와 같은 병).
         * ⚠️ 판정 계산 자체는 한 번 더 돈다 — 순수 계산이라 싸고, **같은 함수**라
         *    갈라지지 않는다. 결과를 둘러 나르는 것보다 이쪽이 읽기 쉽다.
         */
        val judged = scrapParser.withVerdict(order)

        /**
         * 🎯 **통과 콜은 모으기만 한다 — 누르는 것은 루프 뒤 한 곳** (기사님 확정 · 배차망_모드표.md).
         * 자동·체험·알람 모두 «목록을 끝까지 보고 요금 최고 하나»를 누른다. 요금이 같으면 먼저 읽힌 콜이다.
         */
        if (isTarget) {
            // 🔔 이 경로의 통과 콜을 적어 둔다 — 요금만 오른 같은 콜은 같은 콜(판정은 위에서 다시 했다)
            val firstFare = alarmedRoutes.firstFareOf(order)
            if (alarmedRoutes.notePassing(order, nowMs))
                AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔔 [새 통과 콜] ${order.pickup}→${order.dropoff} ${order.fare}원")
            else if (LogOnce.changed("alarmed-route:${order.pickup}→${order.dropoff}", "${order.fare}"))
                AppLogger.i("1DAL_ALARM", LogTag.CALL_STAGE, "🔕 [이미 본 콜] ${order.pickup}→${order.dropoff} · 요금 ${firstFare ?: "?"} → ${order.fare}")
        }
        // 폰이 이미 연 콜은 요금만 올라도 다시 안 연다 — 적어 두기만 하고 못 연 콜(심사 중·미룸)은 연다
        val addHit = isTarget && !alarmedRoutes.opened(order)

        // 4) 신규 콜 → 서버에 텔레메트리 보고 — **보고는 콜당 한 번** (평가와 딴 그릇 · #79)
        if (callMemory.markReportedOnce(orderHash)) {
            report(judged)
        }
        /**
         * 🔒 평가가 안 돈 콜(선점 잠금·대기)은 **기억에 남기지 않는다** (#79).
         * 잠금이 풀리는 다음 스캔에서 처음처럼 평가된다 — 콜을 잡는 10~30초 사이에
         * 나타난 콜을 영영 삼키지 않는다. 로그를 남기는 이유는
         * 이렇다: 침묵하면 «필터가 막았나/잠겼나/못 읽었나»를 가릴 수 없다.
         */
        /**
         * #135 — 막혔으면 «막았다»(필터 버전이 바뀌면 다시 판정).
         * 🔴 **통과한 콜은 여기서 기억하지 않는다** — 앱이 누른 콜만 루프 뒤에서 «눌렀다»로 기억한다(기사님 확정).
         *    여기서 «통과했다»로 넣으면 이번 스캔에 안 누른 둘째·셋째 좋은 콜이 다음 스캔에 «이미 본 콜»로 영영 건너뛰어진다.
         */
        if (!isTarget) callMemory.onScanned(orderHash, wasEvaluated, passed = false)
        // 🔁 상차 축으로 막았으면 그때 km 를 적는다 — 가까워지면 위에서 푼다
        if (!isTarget && wasEvaluated) order.pickupDistance?.let { km -> if (judged.verdict == "pickup") callMemory.rememberBlockedKm(orderHash, km) }
        if (!wasEvaluated) {
            AppLogger.d(TAG, LogTag.FILTER, "🔒 [평가 보류] ${order.pickup.take(14)} → ${order.dropoff.take(14)} " +
                "${order.fare}원 — 필터 잠김(선점 중·대기), 다음 스캔에서 다시 본다")
        }
        return Outcome(Kind.SCANNED, order, orderHash, addHit)
    }

    private companion object {
        /** 목록 처리와 같은 로그캣 태그 — 옮겨도 로그 줄이 같다 */
        const val TAG = "1DAL_MVP"
    }
}
