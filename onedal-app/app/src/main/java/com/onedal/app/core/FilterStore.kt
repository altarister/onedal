package com.onedal.app.core

import android.content.Context
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.onedal.app.models.FilterConfig

/**
 * 🎛️ **피기백 필터(prefs `activeFilter`) 읽기 — 한 곳** (`FilterStoreTest` · onedal-69(1f) «가»).
 * 인성 · 화물24시 · 픽커 · 폰 서비스 · 앱 화면이 모두 여기서 읽는다. Gson 이라 JVM 검사에서도 실물로 돈다.
 * 칸마다 인성 읽기 규칙 그대로다 — 판정 결과를 바꾸지 않는다:
 *  - isActive 가 없으면 false(멈춘다) · reservationMode 빈 글자는 null(오늘 콜만)
 *  - 하차 목록 = 서버가 보낸 destinationKeywords 그대로(빈 낱말 · 중복만 뺀다). 상차 목록과 함께 두 모음만 본다
 *  - pickupKeywords 칸이 없으면 null(옛 판정) · 있으면 빈 목록도 목록(고장 → 안 잡음)
 *  - 함정 · 이름 겹침 목록은 빈 글자를 빼고, 평 목록은 빈 글자를 남긴다(상차 [""] 를 [] 로 만들면 판정이 바뀐다)
 *  - 정수 칸은 소수면 버리고, 숫자 글자도 읽는다(org.json optInt 와 같다)
 * 깨진 입력에서만 갈리는 것 — 목록 안의 null · 글자 아닌 원소는 그 원소만 뺀다(픽커 규칙 · 인성 옛것은 목록을 통째로 비워 «도착 제한 없음»이 됐다).
 */
object FilterStore {
    /** 필터 원문 → FilterConfig. 없거나 깨졌으면 기본값(서버 미응답 안전망) */
    fun parse(raw: String?): FilterConfig {
        if (raw.isNullOrEmpty()) return FilterConfig()
        return try {
            val root = JsonParser.parseString(raw)
            if (root.isJsonObject) configOf(root.asJsonObject) else FilterConfig()
        } catch (e: Exception) {
            FilterConfig()
        }
    }

    /** ♻️ 같은 원문은 한 번만 푼다 — 인성 · 화물24시가 목록 줄마다 부른다(`LastParse`) */
    private val cache = LastParse(::parse)

    /** 지금 저장된 필터 — 원문이 없으면 기본값 */
    fun current(context: Context?): FilterConfig {
        val raw = context?.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)?.getString("activeFilter", null)
            ?: return FilterConfig()
        return cache.of(raw)
    }

    private fun configOf(j: JsonObject): FilterConfig {
        val d = FilterConfig()
        fun value(key: String): JsonElement? = j.get(key)?.takeIf { !it.isJsonNull }
        return FilterConfig(
            allowedVehicleTypes = strings(value("allowedVehicleTypes")),
            isActive = bool(value("isActive")) ?: false,
            evaluatingNow = bool(value("evaluatingNow")) ?: false,
            reservationMode = text(value("reservationMode"))?.ifEmpty { null },
            isSharedMode = bool(value("isSharedMode")) ?: false,
            pickupRadiusKm = number(value("pickupRadiusKm")) ?: d.pickupRadiusKm,
            minFare = whole(value("minFare")) ?: d.minFare,
            safeCancelSecInsung = whole(value("safeCancelSecInsung")) ?: d.safeCancelSecInsung,
            safeCancelSecHwamul24 = whole(value("safeCancelSecHwamul24")) ?: d.safeCancelSecHwamul24,
            pickerAlarmDetailSec = whole(value("pickerAlarmDetailSec")) ?: d.pickerAlarmDetailSec,
            maxFare = whole(value("maxFare")) ?: d.maxFare,
            ratePerKm = value("ratePerKm")?.takeIf { it.isJsonObject }?.asJsonObject?.entrySet()
                ?.associate { (k, v) -> k to (whole(v) ?: 0) } ?: emptyMap(),
            destinationCity = text(value("destinationCity")) ?: d.destinationCity,
            destinationRadiusKm = number(value("destinationRadiusKm")) ?: d.destinationRadiusKm,
            excludedKeywords = strings(value("excludedKeywords")),
            destinationKeywords = strings(value("destinationKeywords")).filter { it.isNotEmpty() }.distinct(),
            pickupKeywords = if (j.has("pickupKeywords")) strings(value("pickupKeywords")) else null,
            customCityFilters = strings(value("customCityFilters")),
            keywordTraps = listMap(value("keywordTraps")),
            destinationDongSigungu = listMap(value("destinationDongSigungu")),
            reservedPickupRadiusKm = number(value("reservedPickupRadiusKm")),
            reservedPickupKeywords = value("reservedPickupKeywords")?.let { strings(it) },
            reservedPickupGroups = listMap(value("reservedPickupGroups")).takeIf { it.isNotEmpty() },
        )
    }

    /** 글자 하나 — 숫자 · 참거짓도 글자로(org.json optString 과 같다) · 객체 · 배열은 없음 */
    private fun text(e: JsonElement?): String? = e?.takeIf { it.isJsonPrimitive }?.asString

    /** 소수 — 숫자 또는 숫자 글자 */
    private fun number(e: JsonElement?): Double? {
        val p = e?.takeIf { it.isJsonPrimitive }?.asJsonPrimitive ?: return null
        return if (p.isNumber) p.asDouble else if (p.isString) p.asString.trim().toDoubleOrNull() else null
    }

    /** 정수 — 소수면 버린다(org.json optInt 와 같다) */
    private fun whole(e: JsonElement?): Int? = number(e)?.takeIf { !it.isNaN() }?.toInt()

    /** 참거짓 — true/false 또는 그 글자(대소문자 무관) */
    private fun bool(e: JsonElement?): Boolean? {
        val p = e?.takeIf { it.isJsonPrimitive }?.asJsonPrimitive ?: return null
        return when {
            p.isBoolean -> p.asBoolean
            p.isString -> p.asString.lowercase().let { if (it == "true") true else if (it == "false") false else null }
            else -> null
        }
    }

    /** 글자 목록 — 배열이 아니면 빈 목록 · 깨진 원소(null · 객체 · 배열)만 뺀다 · 빈 글자는 남긴다 */
    private fun strings(e: JsonElement?): List<String> =
        e?.takeIf { it.isJsonArray }?.asJsonArray?.mapNotNull { text(it) } ?: emptyList()

    /** {이름: [글자…]} — 빈 글자를 빼고, 배열이 아닌 값은 건너뛴다(인성 parseTrapsMap 과 같다) */
    private fun listMap(e: JsonElement?): Map<String, List<String>> =
        e?.takeIf { it.isJsonObject }?.asJsonObject?.entrySet()
            ?.filter { (_, v) -> v.isJsonArray }
            ?.associate { (k, v) -> k to strings(v).filter { it.isNotEmpty() } } ?: emptyMap()

}
