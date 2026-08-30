package com.onedal.app.plugins

/**
 * 🧭 경로 순서 판정 — 역주행·경로 밖 상차를 잡기 전에 거른다 (기사님 확정 2026-08-18)
 *
 * 🔴 실사고: 파주 도착 직전에 `초월읍(광주) → 금촌동(파주)` 콜이 필터를 통과했다
 *    (2026-08-18 08:50). 하차지만 보고 **상차지는 아무도 안 봐서** — 78km 뒤로
 *    돌아가 실어야 하는 콜이었다. 잡았다 취소하면 배차망 취소 횟수(10회)를 쓴다.
 *    안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다.
 *
 * `orderKm` 는 서버가 경유 목록을 만들 때 동마다 함께 계산해 둔
 * **"경로 출발점에서 몇 km 지점인가"** 다 (지나온 구간 제거가 쓰던 값 — 새 계산이 아니다).
 * 운행 중엔 지나온 동이 서버에서 목록째 빠지므로, 키에 없다 = 경로 밖 또는 이미 지나옴.
 *
 * 규칙 (여유 0km — 뒤로 가는 콜은 버린다, 기사님 2026-08-18):
 *   · 비어 있음(첫짐 — 아직 경로가 없다)  → 검사하지 않는다
 *   · 상차지가 키에 없음                  → 경로 밖 → 차단
 *   · 상차 > 하차                         → 역주행 → 차단
 *   · 값이 null(순서를 모름)              → 통과 — 모른다고 막지 않는다 (서버 판정이 뒤에서 거른다)
 *
 * 같은 텍스트에 동이 여럿 걸리면 **막히는 쪽으로 잰다** (상차는 가장 뒤, 하차는 가장 앞) —
 * 느슨하게 재면 역주행이 새어 나가고, 그 비용은 패널티다.
 */
object RouteOrderFilter {

    data class Result(val passed: Boolean, val reason: String)

    fun check(
        pickupText: String,
        dropoffText: String,
        orderKm: Map<String, Double?>,
    ): Result {
        // 첫짐 — 경로가 없으니 순서도 없다. 기존 검사(상차 반경·도착지 매칭)만 돈다
        if (orderKm.isEmpty()) return Result(true, "첫짐 — 순서 검사 없음")

        val pickupHits = orderKm.filterKeys { pickupText.contains(it, ignoreCase = true) }
        if (pickupHits.isEmpty()) {
            return Result(false, "경로 밖 — 상차지(${pickupText.take(20)})가 경유 목록에 없음")
        }

        val dropoffHits = orderKm.filterKeys { dropoffText.contains(it, ignoreCase = true) }

        // 순서를 모르면 통과 — 스냅 실패 동(null)이거나, 하차지가 목록 밖(도착지 매칭이 따로 판단)
        val pickupAt = pickupHits.values.filterNotNull().maxOrNull()
            ?: return Result(true, "상차지 순서 미상 — 통과")
        val dropoffAt = dropoffHits.values.filterNotNull().minOrNull()
            ?: return Result(true, "하차지 순서 미상 — 통과")

        return if (pickupAt <= dropoffAt) {
            Result(true, "순방향 — 상차 ${pickupAt}km → 하차 ${dropoffAt}km")
        } else {
            Result(false, "역주행 — 상차 ${pickupAt}km → 하차 ${dropoffAt}km (${"%.1f".format(pickupAt - dropoffAt)}km 후진)")
        }
    }
}
