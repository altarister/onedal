package com.onedal.app.ui

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.onedal.app.HijackService
import com.onedal.app.isAccessibilityServiceEnabled
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject

/**
 * MainActivity의 SharedPreferences 폴링 로직을 담당하는 ViewModel
 *
 * 1초마다 SharedPreferences를 읽어 UI 상태를 갱신합니다.
 * Composable에서 직접 SharedPreferences를 접근하지 않도록 분리합니다.
 */
class MainViewModel : ViewModel() {

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
    var targetApp by mutableStateOf("인성콜")
    var deathValleyTimeout by mutableStateOf(30000L)

    /**
     * 1초 폴링 시작
     */
    fun startPolling(context: Context) {
        val prefs = context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)

        // 초기값 로드
        deviceId = prefs.getString("deviceId", null) ?: "(서비스 시작 시 자동 생성됨)"
        isLiveMode = prefs.getBoolean("isLiveMode", false)
        targetApp = prefs.getString("targetApp", "인성콜") ?: "인성콜"
        deathValleyTimeout = prefs.getLong("deathValleyTimeout", 30000L)

        viewModelScope.launch {
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
                delay(1000)
            }
        }
    }

    // ── 파싱된 표시 문자열 (computed) ──

    fun getFilterDisplayText(): String = try {
        val json = JSONObject(activeFilterJson)
        if (json.length() == 0) "대기 중 (서버 응답 없음)"
        else {
            val vehicleArr = json.optJSONArray("allowedVehicleTypes")
            val vehicleStr = if (vehicleArr != null && vehicleArr.length() > 0) {
                (0 until vehicleArr.length()).map { vehicleArr.getString(it) }.joinToString(", ")
            } else "전체 허용"

            "allowedVehicleTypes: $vehicleStr\n" +
            "minFare: ${json.optString("minFare", "0")}원\n" +
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

    fun saveTargetApp(context: Context, app: String) {
        targetApp = app
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            .edit().putString("targetApp", app).apply()
    }

    fun saveDeathValleyTimeout(context: Context, ms: Long) {
        deathValleyTimeout = ms
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            .edit().putLong("deathValleyTimeout", ms).apply()
    }

    fun saveLocalIp(context: Context, ip: String) {
        context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
            .edit().putString("localPcIp", ip).apply()
    }
}
