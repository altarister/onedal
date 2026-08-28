package com.onedal.app.plugins.insung

import android.content.Context
import com.onedal.app.core.AppLogger
import com.onedal.app.plugins.RouteOrderFilter
import com.onedal.app.plugins.RegionMatch
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.LocationTextAnalyzer
import com.onedal.app.core.ScreenTextNode
import com.google.gson.Gson
import com.onedal.app.models.FilterConfig
import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder
import org.json.JSONObject
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * 화면에서 추출된 원시 문자열 데이터를 파싱하여
 * 구조화된 모델(SimplifiedOfficeOrder)로 변환하고,
 * 서버에서 내려준 필터 조건(차종·도착지·요금·상차거리·블랙·경로순서 — 축은 여섯이다)에
 * 부합하는지 종합 판정하는 두뇌 엔진입니다.
 */
class InsungParser(private val context: Context) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER"

        /**
         * 🚚 **인성 화면의 차종 토큰 — 목록은 여기 하나뿐이다** (2026-08-25).
         *
         * 화면은 차종을 한 글자로 쓴다(오·다·라·승·1t·5t…). 앱은 이 토큰을 **닻**으로
         * 카드를 묶고, 바로 다음 노드를 요금으로 읽는다.
         *
         * 🔴 예전엔 이 목록이 **세 벌**이었다 — 요금 앵커링 · 뭉친 텍스트 폴백 ·
         *    `groupListNodes`. 앞의 둘에만 «승」을 넣고 세 번째를 놓쳐서, 승용차 콜은
         *    **카드 그룹이 아예 안 만들어졌다.** 그룹이 없으면 파싱 루프를 안 타므로
         *    «요금 못 읽음»도 «이미 본 콜»도 안 찍힌다 — 화면엔 떠 있는데 앱에서는
         *    **아무 일도 없는 것처럼 보인다.** 그 침묵 때문에 시험 세 판을 버렸다.
         *
         * 목록을 늘릴 일이 있으면 **여기만** 고친다 (규칙 ③ — 경유 4벌·상태목록 3벌과
         * 같은 클래스다).
         */
        private const val VEHICLE_TOKENS = "오|다|라|승|1t|1\\.4|2\\.5t?|3\\.5t?|5t|11t|14t|18t|25t"

        /** 노드 하나가 통째로 차종일 때 — 카드 묶기·요금 앵커링이 함께 쓴다 */
        private val VEHICLE_ONLY = Regex("^($VEHICLE_TOKENS)$")

        /** 「라2.2」처럼 차종과 요금이 한 노드로 뭉친 경우 */
        private val VEHICLE_WITH_FARE = Regex("($VEHICLE_TOKENS)\\s*(\\d+(?:\\.\\d+)?)")

        /**
         * 📏 **같은 줄인가** — 카드를 묶는 유일한 판정 (2026-08-25 계측용으로 떼어냈다).
         *
         * 인성 리스트는 한 줄이 콜 하나다. 차종 글자를 닻으로 잡고 **세로로 겹치는**
         * 글자들을 같은 카드로 본다.
         *
         * 🔴 **2026-08-23 실주행에서 `💸 [요금 못 읽음]` 이 12,467회 났고 뒤가 공백이었다.**
         *    카드가 묶이긴 했는데 **같은 줄 글자가 0개**였다는 뜻이다 (스캔당 약 30개,
         *    같은 시간에 제대로 묶인 것은 18개뿐).
         *
         * ⚠️ 겹침은 **열린 구간**으로 잰다. 그래서 높이가 0인 사각형(`top == bottom`)은
         *    자기 자신과도 안 겹친다 — 스크롤 밖 노드처럼 bounds 가 `(0,0,0,0)` 으로
         *    오면 **그 카드는 통째로 비게 된다.** 이게 지금 유력한 가설이고,
         *    확정하려면 실주행에서 좌표를 봐야 한다 (그래서 아래 계측을 넣었다).
         *
         * 🔴 **여기서 고치지 않는다.** 원인을 못박기 전에 조건을 바꾸면 그게 레거시가 된다.
         */
        fun sameRow(aTop: Int, aBottom: Int, bTop: Int, bBottom: Int): Boolean =
            aTop < bBottom && aBottom > bTop

        /** 사각형이 자리를 안 차지한다 — 스크롤 밖 노드의 표식일 수 있다 (계측용) */
        fun isEmptyRect(top: Int, bottom: Int): Boolean = top >= bottom

        /**
         * 🏠 **주소처럼 생겼는가** (2026-08-25 신설).
         *
         * 기사님이 손으로 연 상세에서 상차지가 **«다마스»**, 하차지가 **«계산서필»** 로
         * 장부에 남았다 (2026-08-25 13:23 실측).
         *
         * 🔴 뿌리는 *"첫 번째 유효 지역 = 상차지, 두 번째 = 하차지"* 다. 그건 **리스트에서만
         *    참인 규칙**인데, 상세 화면은 글자 배치가 달라 엉뚱한 낱말이 1·2번째로 잡혔다.
         *    값이 비어 있지 않으니 «배차값없음» 폴백도 안 걸렸다.
         *
         * 직접콜(MANUAL)은 서버가 심사하지 않으므로(규칙 ①) 그 깨진 주소가 그대로 남아
         * **경로의 기점이 된다** — 여유·색·지도가 통째로 틀어진다.
         *
         * → 행정구역·도로명 꼬리가 없으면 주소로 쓰지 않는다. **모르면 모른다고 둔다**
         *   (규칙 ④). 서버는 «배차값없음» 을 «못 읽음» 으로 다루고, 뒤이어 오는
         *   상세 수집(`[출발지상세]`·`[도착지상세]`)이 진짜 주소를 채운다.
         */
        fun looksLikeAddress(text: String): Boolean {
            val t = text.trim()
            if (t.length < 2) return false
            return Regex("(시|군|구|동|읍|면|리|로|길)$").containsMatchIn(t) ||
                   Regex("(시|군|구|동|읍|면|리)\\s").containsMatchIn(t) ||
                   Regex("\\d+(-\\d+)?$").containsMatchIn(t) && t.contains(" ")
        }

        private fun resolveRate(rates: Map<String, Int>, parsedVehicle: String): Int? {
            if (rates.isEmpty()) return null
            val p = parsedVehicle.lowercase(Locale.getDefault())
            for ((key, rate) in rates) {
                val matched = when (key.lowercase(Locale.getDefault())) {
                    "1t" -> p.contains("1") || p.contains("t") || p.contains("톤")
                    "다마스" -> p.contains("다")
                    "라보" -> p.contains("라")
                    "오토바이" -> p.contains("오") || p.contains("바")
                    "승용차" -> p.contains("승")
                    else -> p.contains(key.lowercase(Locale.getDefault())) || key.lowercase(Locale.getDefault()).contains(p)
                }
                if (matched) return rate
            }
            return null
        }

        /**
         * 🚚 **차종을 «담고 있나»가 아니라 «같은가»로 본다** (기사님 실측 2026-08-26).
         *
         * 예전엔 이랬다:
         * ```
         * "1t" -> normParsed.contains("1") || normParsed.contains("t") || normParsed.contains("톤")
         * ```
         * 허용에 `1t` 가 있으면 **`t` 가 든 차종이 전부 통과**했다 — 5t·2.5t·11t·25t 까지.
         * 2026-08-26 실측에서 막아야 할 **5t 콜을 잡았고**, 그 한 건이 적재를 채워
         * 뒤에 온 콜이 전부 «자리 없음»으로 떨어졌다. **첫짐조차 못 잡았다.**
         *
         * ⚠️ 규칙 ⑤(*"앱은 느슨하게 올린다"*)와 어긋나지 않는다 — **느슨한 것과 틀린 것은
         *    다르다.** 못 싣는 차종은 애매한 콜이 아니라 **불가능한 콜**이다.
         *
         * 🔴 인성 리스트는 **한 글자**로 준다(`다`·`오`·`라`·`승`). 톤 차량만 숫자로 온다
         *    (`1t`·`2.5t`). 그래서 한글은 첫 글자로, 톤은 **정확히 일치**로 가른다.
         */
        fun vehicleMatches(allowed: String, parsed: String): Boolean {
            val a = normalizeVehicle(allowed)
            val p = normalizeVehicle(parsed)
            return when (a) {
                "다마스" -> p == "다" || p == "다마스"
                "라보" -> p == "라" || p == "라보"
                "승용차" -> p == "승" || p == "승용차"
                "오토바이" -> p == "오" || p == "바" || p == "오토바이" || p == "바이"
                // 톤 차량 — 숫자가 다르면 다른 차다. 담고 있는지로 보지 않는다
                else -> a == p
            }
        }

        /** `1톤`·`1 t`·`1` 을 전부 `1t` 로 맞춘다 — 화면 표기가 제각각이라 */
        private fun normalizeVehicle(s: String): String {
            val v = s.lowercase(Locale.getDefault()).replace(" ", "").replace("톤", "t")
            // 숫자만 온 경우(`1`·`2.5`)는 톤을 붙여 준다
            return if (Regex("""^\d+(\.\d+)?$""").matches(v)) "${v}t" else v
        }

        fun decide(order: SimplifiedOfficeOrder, filter: FilterConfig, tally: FilterTally? = null): Boolean {

            // ── 조건 0: 전체 필터 활성화 여부 (스캔 정지 상태면 무조건 클릭 안함) ──
            if (!filter.isActive) {
                return false
            }

            val rawText = order.rawText ?: ""

            // ── 조건 1: 차종 매칭 (빈 배열이면 전체 허용) ──
            val vehicleMatch = if (filter.allowedVehicleTypes.isEmpty()) {
                true
            } else {
                order.vehicleType != null && filter.allowedVehicleTypes.any { allowed ->
                    vehicleMatches(allowed, order.vehicleType)
                }
            }

            // ── 조건 1: 도착지 매칭 (2단계 필터링 + 스마트 유추 로직) ──
            val isDetailPreConfirmStage = order.type.endsWith("_CLICK", ignoreCase = true)

            val regionMatch = if (isDetailPreConfirmStage && filter.customCityFilters.isNotEmpty()) {
                val dropoffIdx = rawText.indexOf("도착지상세").takeIf { it != -1 } 
                                 ?: rawText.indexOf("도착지")
                val pureDropoffText = if (dropoffIdx != -1) rawText.substring(dropoffIdx) else rawText

                // [1단계] 상위 지역(시/구) 검사: 도착지 텍스트에 우리 지역 이름이 있는가?
                val hasCityAlias = filter.customCityFilters.any { alias -> 
                    pureDropoffText.contains(alias, ignoreCase = true) 
                }

                // [2단계] 동/읍/면 검사: 도착지 텍스트에 우리 키워드(동 이름)가 있는가?
                // 🗺️ RegionMatch(④) — "남동"⊂"인천 남동구" 부분 문자열 오탐을 트랩으로 거른다
                val hasDongMatch = RegionMatch.anyHit(pureDropoffText, filter.destinationKeywords, filter.keywordTraps)

                val matchResult = when {
                    hasCityAlias && hasDongMatch -> true    // ✅ 시/도 + 동 모두 확인 → 꿀콜
                    hasCityAlias && !hasDongMatch -> false   // ❌ 시/도는 맞지만 동이 없음
                    !hasCityAlias && hasDongMatch -> {       // 🤔 동은 있지만 시/도가 생략됨
                        // → 인성앱이 상위 지역을 표시하지 않은 것으로 추정
                        // → 1차 필터 결과를 신뢰하고, 동명이동은 CautionDongVerifier(3단계 팝업)에 위임
                        AppLogger.d(TAG, "🤔 [2차 스마트 유추] 시/도 생략 감지 → 동 이름(${order.dropoff}) 1차 매칭 신뢰, 동명이동은 3단계 팝업에 위임")
                        true
                    }
                    else -> false                            // ❌ 시/도도 동도 없음
                }

                if (order.fare > 0) AppLogger.d(TAG, "🔍 [2차 상세 필터] 시/도=$hasCityAlias, 동=$hasDongMatch, 최종결과=$matchResult | 대상문자열: ${pureDropoffText.replace('\n', ' ').take(50)}")
                matchResult
            } else {
                // [1차 리스트 필터] 기존 구조 유지 (dropoff만 검사, rawText는 출발지도 포함되므로 사용 금지)
                // 🔴 2026-08-12 — 예전에는 키워드가 비면 `true`(전부 통과)였다.
                //    도착지 조건이 없는 상태는 "아무 데나 좋다"가 아니라
                //    **"필터가 아직 안 만들어졌다"** 는 뜻이다 (경유 실패 · 목적지 미설정).
                //    통과시키면 isActive 는 켜진 채 도착지 제한만 사라진다.
                //    서버도 같은 방향으로 열려 있어 두 겹이 동시에 무력화됐다.
                val matchResult = if (filter.destinationKeywords.isEmpty()) {
                    AppLogger.d(TAG, "🚦 [콜 잡기 보류] 도착지 키워드가 비어 있습니다 — 서버가 필터를 아직 못 만들었습니다")
                    false
                } else {
                    // 🗺️ RegionMatch(④) — 부분 문자열 오탐을 트랩으로 거른다
                    RegionMatch.anyHit(order.dropoff, filter.destinationKeywords, filter.keywordTraps)
                }
                if (!isDetailPreConfirmStage && order.fare > 0) AppLogger.d(TAG, "🔍 [1차 리스트 필터] 도착지=${order.dropoff}, 결과=$matchResult")
                matchResult
            }

            // ── 조건 2: 요금 하한선 + 상한선 ──
            //
            // 🔴 2026-08-12 — 상한(maxFare)을 **서버만** 보고 있었다.
            //    앱은 파싱만 하고 판정에 안 써서, 상한을 50만으로 잡아도 100만짜리를 잡았다.
            //    서버가 안전취소에서 "똥콜"이라 걸러내지만 그때는 **이미 패널티 구간**이다.
            //    안 잡는 것과 잡고 나서 버리는 것은 전혀 다르다.
            //
            // 규칙은 서버(OrderEvaluator)와 **똑같이** 맞춘다:
            //   0 < maxFare < 1,000,000 일 때만 적용한다. 100만은 "상한 없음"의 뜻이다.
            val hasFareCeiling = filter.maxFare in 1..999_999

            /**
             * 🔴 2026-08-13 — **단가 판정** (docs/지금/필터.md)
             *
             * 기사님: *"합짐은 경로 중 우회되는 짧은 구간이 들어올 수 있다.
             * 그래서 여기는 단가가 들어가야 할 것 같은데."*
             *
             * 고정 금액 하한(minFare) 하나로는 구간 길이가 제각각인 콜을 잴 수 없다.
             * 분당→영등포 30km 짜리와 광주→파주 100km 짜리에 같은 2만원을 걸면
             * 한쪽은 똥콜이 통과하고 한쪽은 꿀콜이 걸러진다.
             *
             *   통과 = 요금 ≥ 배송거리 × 단가(차종)
             *
             * 서버가 콜할인율를 이미 반영한 단가표를 피기백으로 내려 준다 — 앱은 곱셈만 한다.
             *
             * **폴백은 한 갈래 — 셋 중 하나라도 없으면 기존 `minFare` 판정으로 되돌아간다.**
             *   단가표가 없거나(구서버·미응답) · 차종을 못 읽었거나 · 배송거리를 못 읽은 경우.
             *   통과시켜 버리지 않는 이유는, 그러면 리스트 전체가 들어와 안전취소가 밀리기 때문이다.
             *   `minFare` 는 최소한의 문턱으로 남기고 정확한 판정은 서버가 한다.
             *
             * 콜할인율가 "전부"면 서버가 단가를 0 으로 내려 보낸다 → `fare >= 거리 × 0` 은 항상 참.
             * 즉 "금액 무관 통과"가 별도 분기 없이 같은 식으로 표현된다.
             */
            val rateFloor = order.vehicleType?.let { vt -> resolveRate(filter.ratePerKm, vt) }
            val useRateModel = filter.ratePerKm.isNotEmpty() && rateFloor != null && order.deliveryDistance != null

            val fareMatch = if (useRateModel) {
                order.fare >= order.deliveryDistance!! * rateFloor!! &&
                    (!hasFareCeiling || order.fare <= filter.maxFare)
            } else {
                order.fare >= filter.minFare &&
                    (!hasFareCeiling || order.fare <= filter.maxFare)
            }

            // ── 조건 3: 상차지 거리 ──
            // 합짐 모드(isSharedMode)에서는 상차지 반경 제한을 무시합니다.
            // 합짐은 가는 길 위의 콜을 잡는 것이므로 거리가 아닌 경로(경유) 기준으로 판단됩니다.
            val distanceMatch = if (order.pickupDistance == null) {
                true
            } else if (filter.isSharedMode) {
                true // 합짐 모드: 상차 반경 무시 (경유 필터가 대신 판단)
            } else {
                order.pickupDistance <= filter.pickupRadiusKm
            }

            // ── 조건 4: 블랙리스트 제외 ──
            val blacklistClear = if (filter.excludedKeywords.isEmpty()) {
                true
            } else {
                filter.excludedKeywords.none { banned ->
                    rawText.contains(banned, ignoreCase = true)
                }
            }

            // ── 로그 출력 (디버깅용) ──
            val isValidOrder = order.fare > 0 || order.pickup != "배차값없음" || order.dropoff != "배차값없음"
            if (isValidOrder) {
                val screenCtxLog = if (isDetailPreConfirmStage) "DETAIL" else "LIST"
            
                AppLogger.roadmap("🔍 [타겟 콜 필터 결과] 차종(${order.vehicleType ?: "배차값없음"})=${if(vehicleMatch) "✅" else "❌"} " +
                            "도착지(${filter.destinationKeywords.size}중 ${order.dropoff})=${if(regionMatch) "✅" else "❌"} " +
                            (if (useRateModel)
                                "요금/단가(${order.deliveryDistance}km × ${rateFloor}원 = ${((order.deliveryDistance ?: 0.0) * (rateFloor ?: 0)).toInt()} <= ${order.fare})=${if(fareMatch) "✅" else "❌"} "
                             else
                                "요금(${filter.minFare} <= ${order.fare}${if (hasFareCeiling) " <= ${filter.maxFare}" else ""})=${if(fareMatch) "✅" else "❌"} ") +
                            "상차지/거리(${if(filter.isSharedMode) "합짐무시" else "${filter.pickupRadiusKm}km"} >= ${order.pickupDistance ?: "배차값없음"}km)=${if(distanceMatch) "✅" else "❌"} " +
                            "블랙()=${if(blacklistClear) "✅" else "❌"}", screenCtxLog)
            }

            // ── 조건 5: 🧭 경로 순서 (역주행·경로 밖 상차 차단 — 기사님 확정 2026-08-18) ──
            //    합짐·운행중에만 값이 내려온다(첫짐은 빈 맵 → 검사 없음). 국면 분기는 앱에 두지 않는다.
            val routeOrder = RouteOrderFilter.check(order.pickup, order.dropoff, filter.progressKm)
            if (!routeOrder.passed && order.fare > 0) {
                AppLogger.d(TAG, "🧭 [경로 순서] 차단 — ${routeOrder.reason}")
            }

            val result = vehicleMatch && regionMatch && fareMatch && distanceMatch && blacklistClear && routeOrder.passed

            /**
             * 👁️ **성적표를 채운다** — 첫 번째로 걸린 축에만 센다 (기사님 확정 2026-08-23).
             *
             * 여러 축에 걸린 콜을 다 세면 합이 `seen` 을 넘고, *"이 축을 풀면 몇 개가
             * 들어오나"* 를 못 읽는다 — 그게 이 숫자의 쓸모다.
             * 순서는 화면의 판정 순서와 같다: 차종 → 도착지 → 요금 → 상차지 → 블랙 → 경로순서.
             */
            tally?.let { t ->
                t.seen++
                when {
                    result           -> t.passed++
                    !vehicleMatch    -> t.vehicle++
                    !regionMatch     -> t.region++
                    !fareMatch       -> t.fare++
                    !distanceMatch   -> t.pickup++
                    !blacklistClear  -> t.blacklist++
                    else             -> t.routeOrder++
                }
            }

            return result
        }
    }

    private val gson = Gson()
    private val prefs by lazy {
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
    }

    /**
     * SharedPreferences에 저장된 최신 필터를 로드합니다.
     * 3초마다 텔레메트리 응답이 갱신해 주므로 항상 최신 상태입니다.
     */
    /**
     * JSON 배열을 List<String>으로 파싱하는 헬퍼
     */
    private fun parseJsonArray(json: JSONObject, key: String): List<String> {
        return try {
            val arr = json.optJSONArray(key)
            if (arr != null) (0 until arr.length()).map { arr.getString(it) } else emptyList()
        } catch (e: Exception) { emptyList() }
    }

    /**
     * 화면에서 읽은 축약 차종(오·다·라·1t…)에 해당하는 단가를 단가표에서 찾습니다.
     *
     * 앱 파서는 인성 화면의 축약 코드를 그대로 뽑는데(`"라"`, `"다"`), 단가표 키는
     * 정식 차종명(`"라보"`, `"다마스"`)이다. 조건 1(차종 매칭)이 쓰는 것과 **같은 규칙**으로
     * 맞춘다 — 두 곳이 갈라지면 "차종은 통과인데 단가는 못 찾는" 상태가 된다.
     *
     * @return 단가(원/km). 매칭 실패 시 null → 호출부가 단가 판정을 건너뛴다
     */

    /**
     * `{"1t": 693, "다마스": 554, ...}` 형태의 차종별 단가를 파싱합니다.
     * 키가 없으면 빈 맵 — 호출부가 minFare 판정으로 되돌아간다 (구서버 호환).
     */
    private fun parseRateMap(json: JSONObject, key: String): Map<String, Int> {
        return try {
            val obj = json.optJSONObject(key) ?: return emptyMap()
            val out = mutableMapOf<String, Int>()
            obj.keys().forEach { k -> out[k] = obj.optInt(k, 0) }
            out
        } catch (e: Exception) { emptyMap() }
    }

    /**
     * 콤마 구분 문자열을 List<String>으로 파싱하는 헬퍼
     */
    /** 🧭 progressKm 파싱 — JSON null 은 "순서를 모름"이므로 코틀린 null 로 보존한다 (0 으로 지어내지 않는다) */
    private fun parseProgressMap(json: JSONObject, key: String): Map<String, Double?> {
        val obj = json.optJSONObject(key) ?: return emptyMap()
        val map = mutableMapOf<String, Double?>()
        for (k in obj.keys()) {
            map[k] = if (obj.isNull(k)) null else obj.optDouble(k)
        }
        return map
    }

    /** 🗺️ keywordTraps 파싱 — {동: [더 긴 지명...]} (RegionMatch ④). 없으면 빈 맵 (구서버 호환) */
    private fun parseTrapsMap(json: JSONObject, key: String): Map<String, List<String>> {
        val obj = json.optJSONObject(key) ?: return emptyMap()
        val map = mutableMapOf<String, List<String>>()
        for (k in obj.keys()) {
            val arr = obj.optJSONArray(k) ?: continue
            map[k] = (0 until arr.length()).mapNotNull { arr.optString(it).takeIf { s -> s.isNotEmpty() } }
        }
        return map
    }

    private fun parseCommaSeparated(json: JSONObject, key: String): List<String> {
        val str = json.optString(key, "")
        return if (str.isNotEmpty()) str.split(",").map { it.trim() }.filter { it.isNotEmpty() } else emptyList()
    }

    fun loadCurrentFilter(): FilterConfig {
        return try {
            val jsonStr = prefs.getString("activeFilter", null) ?: return FilterConfig()
            val json = JSONObject(jsonStr)

            // 각 optXxx 의 두 번째 인자는 서버 미응답 시 최후 안전망 (정상 흐름에서는 서버가 항상 전송)
            // 🧭 [피기백 v2] 도착 목록 = destinationKeywords ∪ progressKm 키.
            //    신서버는 progressKm 에 실린 동을 키워드에서 빼서 보낸다 (같은 목록 두 번 안 싣기).
            //    구서버(중복 포함)와도 distinct 로 같은 집합이 된다 (호환)
            val progress = parseProgressMap(json, "progressKm")   // 없으면 빈 맵 → 순서 검사 안 함 (구서버 호환)
            val traps = parseTrapsMap(json, "keywordTraps")       // 없으면 빈 맵 → 문법 안전망만 (구서버 호환)
            FilterConfig(
                allowedVehicleTypes = parseJsonArray(json, "allowedVehicleTypes"),
                isActive = json.optBoolean("isActive", false),   // 키가 없으면 멈춘다 (안전 방향)
                isSharedMode = json.optBoolean("isSharedMode", false),
                pickupRadiusKm = json.optInt("pickupRadiusKm", 10),
                minFare = json.optInt("minFare", 30000),         // 서버 기본값과 동일
                maxFare = json.optInt("maxFare", 1000000),
                destinationCity = json.optString("destinationCity", ""),
                destinationRadiusKm = json.optInt("destinationRadiusKm", 10),
                excludedKeywords = parseJsonArray(json, "excludedKeywords"),
                destinationKeywords = (parseJsonArray(json, "destinationKeywords") + progress.keys).distinct(),
                customCityFilters = parseJsonArray(json, "customCityFilters"),
                ratePerKm = parseRateMap(json, "ratePerKm"),   // 없으면 빈 맵 → minFare 판정 (구서버 호환)
                progressKm = progress,
                keywordTraps = traps
            )
        } catch (e: Exception) {
            AppLogger.e(TAG, "❌ 필터 JSON 파싱 실패: ${e.message}")
            FilterConfig()
        }
    }

    /**
     * @param texts 한 화면 주기에서 새로 나타난 텍스트 블록 리스트
     * @return 파싱 성공 시 SimplifiedOfficeOrder 객체
     */
    override fun parse(texts: List<String>): SimplifiedOfficeOrder {
        val rawJoined = texts.joinToString(", ")

        // ── 1. 차종 앵커링을 통한 요금(Fare) 및 차종(VehicleType) 파싱 ──
        // 목록의 원천은 companion 의 VEHICLE_TOKENS 하나다 (세 벌로 갈라져 사고가 났다)
        val vehicleRegex = VEHICLE_ONLY
        var fare = 0
        var vehicleType: String? = null

        for (i in texts.indices) {
            val text = texts[i].trim().replace(",", "")
            
            // 만약 현재 텍스트(예: "라")가 차종이라면
            if (vehicleRegex.matches(text)) {
                vehicleType = text
                // 바로 다음 텍스트 노드가 오더 창 우측 끝의 요금(예: "2.2" -> 22,000원)
                if (i + 1 < texts.size) {
                    val nextText = texts[i + 1].trim().replace(",", "")
                    val nextVal = nextText.toDoubleOrNull()
                    // 요금이 만 단위(0.1만 = 1000원 이상)이면 채택
                    if (nextVal != null && nextVal > 0) {
                        fare = (nextVal * 10000).toInt()
                        break
                    }
                }
            } else {
                // 예외 fallback: 텍스트 노드가 하나로 뭉쳐진 경우 ("라2.2" 등)
                val clumpedMatch = VEHICLE_WITH_FARE.find(text)
                if (clumpedMatch != null) {
                    vehicleType = clumpedMatch.groupValues[1]
                    val nextVal = clumpedMatch.groupValues[2].toDoubleOrNull()
                    if (nextVal != null && nextVal > 0) {
                        fare = (nextVal * 10000).toInt()
                        break
                    }
                }
            }
        }

        // ── 2. 지역명 파싱 (동/읍/면/리 로 끝나는 텍스트) ──
        // 서버에서 다운받은 동적 키워드 사전에서 uiNoiseWords 로드, 없으면 기본값
        val uiNoiseWords = try {
            val keywordsJsonStr = prefs.getString("targetAppKeywords", null)
            if (keywordsJsonStr != null) {
                val keywordsObj = JSONObject(keywordsJsonStr)
                val arr = keywordsObj.optJSONArray("uiNoiseWords")
                if (arr != null) {
                    (0 until arr.length()).map { arr.getString(it) }.toSet()
                } else setOf("거리", "출발지", "도착지", "차종", "요금", "설정", "콜상세")
            } else {
                setOf("거리", "출발지", "도착지", "차종", "요금", "설정", "콜상세")
            }
        } catch(e: Exception) {
            setOf("거리", "출발지", "도착지", "차종", "요금", "설정")
        }

        // ── 2. 지역명 및 예약일정 파싱 (LocationTextAnalyzer 활용) ──
        val locationInfos = texts
            .map { it.trim() }
            .filter { text ->
                !uiNoiseWords.any { text.equals(it, ignoreCase = true) } && text.length >= 2
            }
            .mapNotNull { LocationTextAnalyzer.analyze(it) }
            .distinctBy { it.cleanRegion }

        // 첫 번째 유효 지역 = 상차지, 두 번째 유효 지역 = 하차지 (인성앱 리스트 순서)
        val pickupInfo = locationInfos.getOrNull(0)
        val dropoffInfo = locationInfos.getOrNull(1) ?: pickupInfo
        
        val pickup = pickupInfo?.cleanRegion ?: "배차값없음"
        val dropoff = dropoffInfo?.cleanRegion ?: "배차값없음"
        val scheduleText = pickupInfo?.scheduleText ?: dropoffInfo?.scheduleText

        // ── 3. 거리 파싱 ──
        // 소수점 있는 숫자들이 거리 (예: "9.6", "38.5")
        // 화면 최좌측에 상, 하로 두 개가 뜸. 먼저 오는 값이 [접근거리], 다음 오는 값이 [배송거리]
        val distances = mutableListOf<Double>()
        val distanceRegex = Regex("""(\d+\.\d+)""")
        texts.forEach { textNode ->
            val clean = textNode.replace(",", "")
            if (clean.toDoubleOrNull() != null && clean.contains(".")) {
                distances.add(clean.toDouble())
            } else if (clean.contains(".")) {
                distanceRegex.findAll(clean).forEach { match ->
                    match.groupValues[1].toDoubleOrNull()?.let { distances.add(it) }
                }
            }
        }
        
        // 첫 번째 값 = 상차지 직선거리 / 두 번째 값 = 배송거리 (의도적으로 sort() 제외)

        val now = // 🔴 `'Z'` 는 **글자 Z 를 붙일 뿐**이다 — 한국 시각에 UTC 표식이 달려 서버가 9시간 밀려 읽었다
        //    (2026-08-16 실측: "대기 572분"). `XXX` 를 쓰면 `+09:00` 이 붙는다
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.getDefault()).format(Date())
        
        // 시간 포맷 (HH:mm) 추출
        var postTime: String? = null
        val timeRegex = Regex("\\b([0-2]?\\d:[0-5]\\d)\\b")
        val timeMatch = timeRegex.find(rawJoined)
        if (timeMatch != null) {
            postTime = timeMatch.groupValues[1]
        }

        // 의미 없는 화면(오더 목록이 아닌 화면 등)에서 무의미한 로그 도배 방지
        val isValidOrder = fare > 0 || pickup != "배차값없음" || dropoff != "배차값없음"

        return SimplifiedOfficeOrder(
            id = UUID.randomUUID().toString(),
            type = "NEW_ORDER",
            pickup = pickup,
            dropoff = dropoff,
            fare = fare,
            timestamp = now,
            postTime = postTime,
            scheduleText = scheduleText,
            vehicleType = vehicleType,
            rawText = rawJoined,
            pickupDistance = distances.getOrNull(0),
            // 🔴 2026-08-13 — 두 번째 값(배송거리)을 **버리지 않고 보존**한다.
            //    단가 판정(fare ≥ 배송거리 × 단가)의 입력이다. 없으면 null →
            //    판정을 건너뛰고 통과시킨다 (앱은 일단 잡아와라, 서버가 정확히 잰다).
            deliveryDistance = distances.getOrNull(1)
        )
    }

    /**
     * 파싱된 오더가 필터 조건을 모두 만족하는지 종합 판정합니다.
     * 모든 조건이 AND(교집합)로 통과해야만 true를 반환합니다.
     */
    override fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally?): Boolean =
        decide(order, loadCurrentFilter(), tally)

    /**
     * 🧪 **판정 본체 — 필터를 인자로 받는다** (2026-08-25 신설).
     *
     * 기사님: *"도대체 어떻게 하면 필터가 잘 작동하는지 확인할 수 있는 거야.
     * 지금 이것만 2시간 동안 하고 있어."*
     *
     * 예전엔 `shouldClick` 이 안에서 `loadCurrentFilter()`(안드로이드 prefs)를 읽어서,
     * **판정 하나를 확인하려면 폰 한 판(3분)을 돌려야 했다.** 그 3분 안에 서로 무관한
     * 실패 지점이 여섯 개 있었다 — 지문 캐시 · 앱 바이너리 버전 · 차종 파싱 ·
     * 앱이 확정 중이라 리스트 못 봄 · 필터 값 바꿔 첫짐 탈락 · 손으로 잡을 때 주소 깨짐.
     * 2026-08-25 에 그 여섯을 하나씩 다 밟았고, **정작 필터 판정은 한 번도 못 봤다.**
     *
     * 판정은 원래 **(콜, 필터) → 통과/차단** 인 순수 계산이다. prefs 읽기만 밖으로 빼면
     * JVM 테스트에서 3초에 채점할 수 있다 (`app/src/test` · `filterVerdict` 문제지).
     *
     * ⚠️ **동작은 한 줄도 바뀌지 않는다.** `shouldClick` 은 필터를 읽어 이걸 부를 뿐이다.
     *    폰 주행은 이제 «필터가 맞나」가 아니라 **«GPS·경로·화면이 맞나」** 를 볼 때 쓴다.
     */

    /**
     * rawText에서 상차지 직선거리를 파싱합니다.
     * 인성앱 거리 표시 패턴: "2.3 / 45" (상차직선거리 / 배송거리)
     * 또는 "2.3km" 형태
     * @return 상차지 직선거리 (km), 파싱 불가 시 null
     */
    override fun parsePickupDistance(rawText: String): Double? {
        // 패턴1: "숫자 / 숫자" (슬래시 구분, 첫 번째가 상차 직선거리)
        val slashPattern = Regex("""(\d+\.?\d*)\s*/\s*(\d+\.?\d*)""")
        val slashMatch = slashPattern.find(rawText)
        if (slashMatch != null) {
            return slashMatch.groupValues[1].toDoubleOrNull()
        }

        // 패턴2: "숫자km" 또는 "숫자 km"
        val kmPattern = Regex("""(\d+\.?\d*)\s*km""", RegexOption.IGNORE_CASE)
        val kmMatch = kmPattern.find(rawText)
        if (kmMatch != null) {
            return kmMatch.groupValues[1].toDoubleOrNull()
        }

        return null
    }

    // ════════════════════════════════════════════════════════════════
    //  groupListNodes(): 인성콜 Row 기반 노드 그룹화
    // ════════════════════════════════════════════════════════════════
    
    override fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>> {
        // 🔴 여기가 **승(승용차)을 빼먹고 있던 세 번째 목록**이었다 (2026-08-25).
        //    카드를 묶는 자리라, 빠지면 그 콜은 로그 한 줄 없이 사라진다.
        val fareNodes = allNodes.filter { it.text.matches(VEHICLE_ONLY) }

        return fareNodes.map { fareNode ->
            val rowNodes = allNodes.filter {
                sameRow(it.rect.top, it.rect.bottom, fareNode.rect.top, fareNode.rect.bottom)
            }
            Pair(fareNode, rowNodes.map { it.text })
        }
    }
}
