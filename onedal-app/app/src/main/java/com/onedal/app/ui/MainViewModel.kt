package com.onedal.app.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.onedal.app.HijackService
import com.onedal.app.isAccessibilityServiceEnabled
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.Locale

/**
 * MainActivity의 SharedPreferences 폴링 로직을 담당하는 ViewModel
 *
 * 1초마다 SharedPreferences를 읽어 UI 상태를 갱신합니다.
 * Composable에서 직접 SharedPreferences를 접근하지 않도록 분리합니다.
 */
class MainViewModel {

    private val scope = CoroutineScope(Dispatchers.Main)

    // ── 접근성 서비스 상태 ──
    var isServiceActive by mutableStateOf(false)
        private set

    var deviceId by mutableStateOf("(서비스 시작 시 자동 생성됨)")
        private set

    // ── 서버 상태 ──
    var activeFilterJson by mutableStateOf("{}")
        private set
    var apiStatusJson by mutableStateOf("{}")
        private set
    var deviceControlJson by mutableStateOf("{}")
        private set

    // ── 전송 기록 ──
    var lastScrapTime by mutableStateOf(0L)
        private set

    // ── API 디버깅 로그 ──
    var apiScrapReq by mutableStateOf("없음")
        private set
    var apiScrapRes by mutableStateOf("없음")
        private set
    var apiConfirmReq by mutableStateOf("없음")
        private set
    var apiConfirmRes by mutableStateOf("없음")
        private set

    // ── 설정값 ──
    var isLiveMode by mutableStateOf(false)
    var showTapMarker by mutableStateOf(false)
        private set
    /** ⏱️ 서버에서 받은 배차망별 대기 시간 — 폰에서는 **보여 주기만** 한다 (고치는 곳은 관제웹 설정) */
    var waitTimesLabel by mutableStateOf("")
        private set

    /**
     * 1초 폴링 시작
     */
    fun startPolling(context: Context) {
        val prefs = context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)

        // 초기값 로드
        deviceId = prefs.getString("deviceId", null) ?: "(서비스 시작 시 자동 생성됨)"
        isLiveMode = prefs.getBoolean("isLiveMode", false)
        showTapMarker = prefs.getBoolean("showTapMarker", false)
        waitTimesLabel = waitTimesLabelOf(prefs.getString("activeFilter", null))

        scope.launch {
            while (true) {
                isServiceActive = isAccessibilityServiceEnabled(context, HijackService::class.java)
                activeFilterJson = prefs.getString("activeFilter", "{}") ?: "{}"
                apiStatusJson = prefs.getString("apiStatus", "{}") ?: "{}"
                deviceControlJson = prefs.getString("deviceControl", "{}") ?: "{}"
                lastScrapTime = prefs.getLong("lastScrapTime", 0L)
                apiScrapReq = prefs.getString("api_scrap_req", "없음") ?: "없음"
                apiScrapRes = prefs.getString("api_scrap_res", "없음") ?: "없음"
                apiConfirmReq = prefs.getString("api_confirm_req", "없음") ?: "없음"
                apiConfirmRes = prefs.getString("api_confirm_res", "없음") ?: "없음"
                showTapMarker = prefs.getBoolean("showTapMarker", false)
                delay(1000)
            }
        }
    }

    // ── 파싱된 표시 문자열 및 모델 (computed) ──

    data class ParsedFilter(
        val allowedVehicles: String = "전체 허용",
        val pickerAlarmMinFare: Int = 10000,
        val pickupRadiusKm: Double = 0.0,
        val destinationCity: String = "미설정",
        val destKeywordsCount: Int = 0,
        val excludedKeywordsCount: Int = 0,
        val waitTimes: String = ""
    )

    fun getParsedFilter(): ParsedFilter = try {
        val json = JSONObject(activeFilterJson)
        if (json.length() == 0) {
            ParsedFilter(allowedVehicles = "대기 중 (서버 응답 없음)", waitTimes = waitTimesLabel)
        } else {
            val vehicleArr = json.optJSONArray("allowedVehicleTypes")
            val vehicleStr = if (vehicleArr != null && vehicleArr.length() > 0) {
                (0 until vehicleArr.length()).map { vehicleArr.getString(it) }.joinToString(", ")
            } else "전체 허용"
            val destArr = json.optJSONArray("destinationKeywords")
            val exclArr = json.optJSONArray("excludedKeywords")
            ParsedFilter(
                allowedVehicles = vehicleStr,
                pickerAlarmMinFare = json.optInt("pickerAlarmMinFare", 10000),
                pickupRadiusKm = json.optDouble("pickupRadiusKm", 0.0),
                destinationCity = json.optString("destinationCity", "미설정"),
                destKeywordsCount = destArr?.length() ?: 0,
                excludedKeywordsCount = exclArr?.length() ?: 0,
                waitTimes = waitTimesLabel
            )
        }
    } catch (e: Exception) { ParsedFilter(allowedVehicles = "파싱 오류", waitTimes = waitTimesLabel) }

    fun getFilterConfig(): com.onedal.app.models.FilterConfig? = try {
        if (activeFilterJson.isBlank() || activeFilterJson == "{}") null
        else com.google.gson.Gson().fromJson(activeFilterJson, com.onedal.app.models.FilterConfig::class.java)
    } catch (e: Exception) { null }

    fun getFilterDisplayText(): String = try {
        val json = JSONObject(activeFilterJson)
        if (json.length() == 0) "대기 중 (서버 응답 없음)"
        else {
            val vehicleArr = json.optJSONArray("allowedVehicleTypes")
            val vehicleStr = if (vehicleArr != null && vehicleArr.length() > 0) {
                (0 until vehicleArr.length()).map { vehicleArr.getString(it) }.joinToString(", ")
            } else "전체 허용"
            val pickerFare = json.optInt("pickerAlarmMinFare", 10000)
            val formatFare = java.text.NumberFormat.getNumberInstance(Locale.KOREA).format(pickerFare)

            "allowedVehicleTypes: $vehicleStr\n" +
            "pickerAlarmMinFare: ${formatFare}원 (콜할인율 연동)\n" +
            "pickupRadiusKm: ${json.optString("pickupRadiusKm", "0")}km\n" +
            "destinationCity: ${json.optString("destinationCity", "미설정")}\n" +
            "destinationKeywords: ${json.optString("destinationKeywords", "없음")}\n" +
            "excludedKeywords: ${json.optString("excludedKeywords", "없음")}"
        }
    } catch (e: Exception) { "필터 파싱 오류" }

    fun getStatusDisplayText(): String = try {
        val json = JSONObject(apiStatusJson)
        if (json.length() == 0) "대기 중.."
        else "• 통신 성공여부: ${json.optBoolean("success")}\n• 누적 수집된 오더: ${json.optInt("totalItems")}건"
    } catch (e: Exception) { "파싱 오류" }

    fun getControlDisplayText(): String = try {
        val json = JSONObject(deviceControlJson)
        if (json.length() == 0) "대기 중.."
        else "• 데스맨 스위치 모드: ${json.optString("mode")}"
    } catch (e: Exception) { "파싱 오류" }

    // ── SharedPreferences 저장 ──

    fun saveLiveMode(context: Context, checked: Boolean) {
        isLiveMode = checked
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            .edit().putBoolean("isLiveMode", checked).apply()
    }

    fun saveShowTapMarker(context: Context, enabled: Boolean) {
        showTapMarker = enabled
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            .edit().putBoolean("showTapMarker", enabled).apply()
    }

    /**
     * ⏱️ **대기 시간은 폰에서 고르지 않는다** (기사님 확정 2026-09-14 · docs/지금/배차망별_대기_시간.md).
     * 예전 «30·40·50초» 고르기는 폰 안에만 저장돼 서버가 몰랐다. 원천은 서버 DB 이고, 여기는 받은 값을 글로 보여 준다.
     */
    private fun waitTimesLabelOf(json: String?): String {
        val f = try {
            json?.let { com.google.gson.Gson().fromJson(it, com.onedal.app.models.FilterConfig::class.java) }
        } catch (e: Exception) { null }
            ?: return "서버 값을 아직 못 받았습니다 — 기본 인성 30초 · 화물24시 30초 · 픽커 상세 60초"
        return "인성 ${f.safeCancelSecInsung}초 · 화물24시 ${f.safeCancelSecHwamul24}초 · 픽커 상세 ${f.pickerAlarmDetailSec}초"
    }

    fun saveLocalIp(context: Context, ip: String) {
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            .edit().putString("localPcIp", ip).apply()
    }
}
