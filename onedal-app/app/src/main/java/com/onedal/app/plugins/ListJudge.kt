package com.onedal.app.plugins

import com.onedal.app.core.AppLogger
import com.onedal.app.core.LogTag
import com.onedal.app.core.engine.FareFloor
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🧪 **목록 줄 판정 — 배차망이 달라도 같은 축 · 같은 차례** (예약 → 차종 → 도착지 → 요금 → 상차 목록 · 거리 → 제외어).
 * 누름(`shouldClick`)과 장부의 까닭(`withVerdict`)이 **같은 분기**를 쓴다 — 따로 세면 «누름은 요금, 장부는 지역»으로 갈라진다.
 * 배차망마다 다른 것은 `Rules` 다섯뿐이다 — 차종 표 · 단가에 쓰는 차종 · 제외어를 볼 글 · 로그 머리 · 한 번만 남기는 로그 열쇠의 배차망 코드.
 * 인성 판정(`InsungParser.judge`)은 도착지를 상세 글로 다시 보는 갈래와 차종 비교가 달라 이 함수를 쓰지 않는다.
 * 같은 판정 두 벌이 아니라 인자가 둘 더 필요한 판정이다 — 인성이 들어오려면 `Rules` 에 도착지를 볼 글 · 차종 정규화를 품은 `vehicleOf`.
 */
object ListJudge {

    private const val TAG = "1DAL_LIST_JUDGE"

    /** 🗳️ 판정 — 눌러도 되나 · 걸린 축 한 낱말(통과면 «pass») */
    data class Verdict(val passed: Boolean, val axis: String)

    /**
     * 배차망 몫 다섯.
     * - `vehicleOf` — 화면 차종 글자 → 우리 차종(표에 없으면 null = 차종 모름)
     * - `blacklistTextOf` — 제외어를 찾아볼 글
     * - `logHead` — 판정 로그 머리 «🔍 [○○ 필터]»의 ○○
     * - `netCode` — 한 번만 남기는 로그(`LogOnce`)의 열쇠 앞머리 · 배차망끼리 같은 상차 · 하차 · 요금 콜의 로그가 서로를 지우지 않게
     * - `rateVehicleOf` — 단가표(`FareFloor.rateOf`)에 넣을 차종 글자. 화물24시는 콜 화면 차종(`order.vehicleType`),
     *   인성플렉스가 기사님 차종(`FilterConfig.driverVehicleType`)을 넘긴다(5단계). null 이면 단가 조건만 빠지고 최소 금액은 남는다.
     *   차종 축(허용 차종 · `vehicleOf`)과는 따로다 — 이 값은 단가만 고른다
     */
    data class Rules(
        val vehicleOf: (String?) -> String?,
        val blacklistTextOf: (SimplifiedOfficeOrder) -> String,
        val logHead: String,
        val netCode: String,
        val rateVehicleOf: (SimplifiedOfficeOrder, FilterConfig) -> String? = { order, _ -> order.vehicleType },
    )

    fun judge(order: SimplifiedOfficeOrder, filter: FilterConfig, tally: FilterTally? = null, rules: Rules): Verdict {

        // ── 조건 0: 전체 필터 활성화 여부 ──
        if (!filter.isActive) {
            /* 🔴 «잠겨서 안 본 것»은 «걸러진 것»이 아니다 — 성적표에 안 센다 (인성과 같은 말) */
            return Verdict(false, "locked")
        }

        // 📅 예약 — 인성 파서와 같은 자리 (목록에서는 확실한 다른 날만 · 날 모름은 채운 뒤 필터)
        val reservationOk = com.onedal.app.core.engine.ReservationGate.passesList(order, filter.reservationMode)

        // ── 조건 1: 차종 매칭 (빈 배열이면 전체 허용) ──
        //    🚚 배차망 낱말(«다마스/전체»의 «다마스»)을 배차망 차종 표(`Rules.vehicleOf`)로 우리 차종에 맞춘 뒤 **같은지**로 본다 —
        //    «담고 있나»로 보면 «11톤»이 허용 1t 에 걸린다. 표에 없는 낱말은 차종 모름 → 지금처럼 거른다
        val vehicleMatch = if (filter.allowedVehicleTypes.isEmpty()) {
            true
        } else {
            rules.vehicleOf(order.vehicleType)?.let { v -> v in filter.allowedVehicleTypes } ?: false
        }

        // ── 조건 2: 도착지 매칭 ──
        //
        // 🔴 키워드가 비면 `false`(보류)다.
        //    도착지 조건이 없는 상태는 "아무 데나 좋다"가 아니라
        //    **"필터가 아직 안 만들어졌다"** 는 뜻이다. 서버가 경유을 못 구했거나
        //    목적지 도시가 비었을 때 그렇게 된다.
        //
        //    그대로 통과시키면 `isActive` 는 켜진 채 **도착지 제한만 사라진다.**
        //    필터가 느슨해지는 게 아니라 없어지는 것이다.
        //    서버도 같은 규칙으로 막는다 — 한쪽만 열어도 두 겹 중 하나가 사라진다.
        //    (서버: `callFilterBlocker` · `OrderEvaluator` 5번 항목)
        val regionMatch = if (filter.destinationKeywords.isEmpty()) {
            AppLogger.d(TAG, LogTag.FILTER, "🚦 [콜 잡기 보류] 도착지 키워드가 비어 있습니다 — 서버가 필터를 아직 못 만들었습니다")
            false
        } else {
            // 🗺️ RegionMatch(④) — "남동"⊂"인천 남동구" 부분 문자열 오탐을 트랩으로 거른다
            RegionMatch.anyHit(order.dropoff, filter.destinationKeywords, filter.keywordTraps, filter.destinationDongSigungu)
        }

        // ── 조건 3: 요금 하한선 + 상한선 ──
        //
        // 🔴 상한(maxFare)도 앱이 판정한다 — 서버만 보면 상한을 50만으로 잡아도 100만짜리를 잡고,
        //    서버가 안전취소에서 걸러낼 때는 **이미 패널티 구간**이다.
        //    안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다.
        //
        // 규칙은 서버(OrderEvaluator)와 **똑같이** 맞춘다:
        //   0 < maxFare < 1,000,000 일 때만 적용한다. 100만은 "상한 없음"의 뜻이다.
        val hasFareCeiling = filter.maxFare in 1..999_999

        /**
         * 💰 **최저가 AND 단가 — 둘 다 넘어야 통과** (기사님 확정).
         *
         * 두 손해가 서로 다른 축이라 한 축으로는 못 막는다:
         *   2km 에 10,000원   → 상하차 품값도 안 나온다  ← `minFare` 가 막는다
         *   400km 에 100,000원 → 단가가 안 나온다        ← `ratePerKm` 가 막는다
         *
         * 🔴 **배송거리(`deliveryDistance`)를 안 읽는 배차망(지금 화물24시)은 단가 판정이 꺼진다.**
         *    24시 카드에 그 숫자가 있는지부터 확인해야 한다.
         *    기사님 확정: «24시 목록엔 상차지거리만 있다» — 배송거리는 실물 화면이 생기면 다시 본다.
         *    없으면 `useRateModel` 이 false 라 **지금은 `minFare` 단독으로만 돈다** —
         *    안전망을 빼지 않으려는 폴백이다 (규칙 ②). 배송거리를 읽게 되는 순간
         *    이 판정이 **저절로 켜진다.**
         */
        // 단가 조회는 인성과 **같은 함수**를 쓴다 — 차종 별칭 규칙이 두 벌이 되면 망마다 값이 갈린다 · 어느 차종 글자인지는 배차망이 고른다(`Rules.rateVehicleOf`)
        val rateFloor = rules.rateVehicleOf(order, filter)?.let { vt -> FareFloor.rateOf(filter.ratePerKm, vt) }
        val useRateModel = filter.ratePerKm.isNotEmpty() && rateFloor != null && order.deliveryDistance != null
        val fareMatch = FareFloor.passes(order.fare, filter.minFare) &&
                        (!useRateModel || order.fare >= order.deliveryDistance!! * rateFloor!!) &&
                        (!hasFareCeiling || order.fare <= filter.maxFare)

        // ── 조건 4: 상차지 ──
        // 📋 상차 목록이 오면 그것으로 거른다 — 인성 파서와 같은 규칙 (`PickupListFilter` · 하차 목록»).
        //    그 배차망 상차지 글자(화물24시는 `cleanRegion`)에 동이 실리는지는 실물 캡처로 확인할 것 (규격 표 ⬜)
        //    🔴 칸이 안 오면(옛 서버) 아래 옛 판정 — 3단계(옛 칸 걷는 날)에 함께 지운다
        val pickupListCheck = filter.pickupKeywords?.let { PickupListFilter.check(order.pickup, it, filter.keywordTraps) }
        val pickupListMatch = pickupListCheck?.passed ?: true
        val distanceMatch = if (pickupListCheck != null) {
            true
        } else if (filter.isSharedMode) {
            true
        } else {
            // 상차지거리는 목록 완독 칸이다(`OrderRequirement.listComplete`) — 모르면 여기까지 오지 않는다
            order.pickupDistance != null && order.pickupDistance <= filter.pickupRadiusKm
        }

        // ── 조건 5: 블랙리스트 제외 — 볼 글은 배차망이 고른다(`Rules.blacklistTextOf` · 화물24시는 적요가 든 원문 전체) ──
        val blacklistClear = if (filter.excludedKeywords.isEmpty()) {
            true
        } else {
            val blacklistText = rules.blacklistTextOf(order)
            filter.excludedKeywords.none { banned ->
                blacklistText.contains(banned, ignoreCase = true)
            }
        }

        // ── 로그 출력 ──
        val isValidOrder = order.fare > 0 || order.pickup != "배차값없음" || order.dropoff != "배차값없음"
        // 🔕 같은 콜의 판정이 바뀔 때만 (스캔마다 되풀이하지 않는다)
        if (isValidOrder && com.onedal.app.core.LogOnce.changed("target:${rules.netCode}|"+"${order.pickup}|${order.dropoff}|${order.fare}", "$reservationOk$vehicleMatch$regionMatch$fareMatch$pickupListMatch$distanceMatch$blacklistClear")) {
            AppLogger.roadmap(LogTag.FILTER, "🔍 [${rules.logHead} 필터] " + "예약(${com.onedal.app.core.engine.ReservationGate.wordOf(order)})=${if(reservationOk) "✅" else "❌"} " + "차종(${order.vehicleType ?: "배차값없음"})=${if(vehicleMatch) "✅" else "❌"} " +
                    "도착지(${order.dropoff})=${if(regionMatch) "✅" else "❌"} " +
                    "요금(${filter.minFare} <= ${order.fare}${if (hasFareCeiling) " <= ${filter.maxFare}" else ""})=${if(fareMatch) "✅" else "❌"} " +
                    (if (pickupListCheck != null)
                        "상차 목록(${filter.pickupKeywords?.size ?: 0}중 ${order.pickup})=${if(pickupListMatch) "✅" else "❌"} "
                     else
                        "거리(${if(filter.isSharedMode) "합짐무시" else "${filter.pickupRadiusKm}km"} >= ${order.pickupDistance ?: "배차값없음"})=${if(distanceMatch) "✅" else "❌"} ") +
                    "블랙=${if(blacklistClear) "✅" else "❌"}", "LIST")
        }

        // 📋 상차지는 상차 목록, 하차지는 하차 목록 — 두 모음에 들면 올린다. 방향은 서버 판정이 본다(규칙 ⑤).
        if (pickupListCheck != null && !pickupListCheck.passed && order.fare > 0 && com.onedal.app.core.LogOnce.changed("pick:${rules.netCode}|"+"${order.pickup}|${order.dropoff}|${order.fare}", pickupListCheck.reason)) {
            AppLogger.d(TAG, LogTag.FILTER, "📋 [상차 목록] 차단 — ${pickupListCheck.reason}")
        }

        val result = reservationOk && vehicleMatch && regionMatch && fareMatch && pickupListMatch && distanceMatch && blacklistClear

        /**
         * 👁️ **성적표를 채운다** — 인성 파서와 **같은 규칙**이다 (첫 축에만 센다).
         *    한쪽만 고치면 두 배차망의 숫자가 다른 뜻을 갖게 된다.
         */
        val axis = when {
            result           -> "pass"
            !reservationOk   -> "reservation"
            !vehicleMatch    -> "vehicle"
            !regionMatch     -> "region"
            !fareMatch       -> "fare"
            !pickupListMatch -> "pickupList"
            !distanceMatch   -> "pickup"
            else             -> "blacklist"
        }
        tally?.let { t ->
            t.seen++
            when (axis) {
                "pass"        -> t.passed++
                "reservation" -> t.reservation++
                "vehicle"     -> t.vehicle++
                "region"      -> t.region++
                "fare"        -> t.fare++
                "pickupList"  -> t.pickupList++
                "pickup"      -> t.pickup++
                "blacklist"   -> t.blacklist++
                else          -> t.routeOrder++
            }
        }

        return Verdict(result, axis)
    }
}
