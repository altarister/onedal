package com.onedal.app.core.engine

import android.content.Context
import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.AppLogger
import com.onedal.app.core.AutoTouchManager
import org.json.JSONObject

/**
 * 동명이동 방어 로직
 *
 * 전국에 2개 이상의 시/구에 존재하는 읍면동(예: 신사동, 논현동 등)이
 * 하차지에 나타나면, 상세 진입 후 customCityFilters로 2차 검증합니다.
 * 도착지 팝업에서 상위 지역명(예: "강남구")이 포함되어 있는지 3단계로 대조합니다.
 */
class CautionDongVerifier(private val context: Context) {

    companion object {
        private const val TAG = "1DAL_CAUTION"

        // 🚨 전국에 2개 이상 시/구에 존재하는 읍면동 (빌드 시 고정)
        val CAUTION_DONGS = setOf(
            // 6개 지역 중복
            "금곡동",
            // 5개 지역 중복
            "중동",
            // 4개 지역 중복
            "갈현동", "장지동",
            // 3개 지역 중복
            "평동", "송정동", "능동", "장안동", "구산동", "신촌동", "창전동", "목동",
            "오류동", "항동", "오금동", "심곡동", "신흥동", "중앙동", "대장동", "화정동",
            // 2개 지역 중복 (배송 빈도 높은 핵심 동네)
            "효자동", "송현동", "남창동", "주교동", "방산동", "도원동", "군자동", "용두동",
            "창동", "신사동", "도화동", "신정동", "동교동", "합정동", "시흥동", "도림동",
            "신길동", "내곡동", "신원동", "논현동", "신천동", "고덕동", "중산동", "용현동",
            "청학동", "고잔동", "산곡동", "갈산동", "장기동", "백석동", "신현동", "가좌동",
            "마전동", "당하동", "원당동", "정자동", "탑동", "영동", "고등동", "성남동",
            "은행동", "고산동", "소사동", "상동", "송내동", "옥길동", "신장동", "세교동",
            "광암동", "안흥동", "부곡동", "당정동", "청계동", "중리동",
            "연희동", "하중동", "율현동", "사동", "내동", "계수동", "이동", "삼동", "신동",
            "하동", "우만동", "교동", "낙원동", "계동", "연지동", "이화동", "숭인동",
            "송월동", "옥천동", "영천동"
        )
    }

    /**
     * 하차지가 동명이동 위험 동네인지 판별
     * @param dropoff 하차지 텍스트
     * @return true이면 3단계 검증 필요
     */
    fun isCautionDong(dropoff: String): Boolean {
        return CAUTION_DONGS.any { dropoff.contains(it) }
    }

    /**
     * SharedPreferences에서 customCityFilters 로드
     * 예: ["서울 강남", "경기 수원"] → 도착지 팝업에서 이 키워드가 포함되어야 합격
     */
    fun loadCityFilters(): List<String> {
        val prefs = context.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
        val jsonStr = prefs.getString("activeFilter", null) ?: return emptyList()
        return try {
            val json = JSONObject(jsonStr)
            val arr = json.optJSONArray("customCityFilters") ?: return emptyList()
            (0 until arr.length()).map { arr.getString(it) }
        } catch (e: Exception) {
            AppLogger.e(TAG, "customCityFilters 파싱 오류: ${e.message}")
            emptyList()
        }
    }

    /**
     * 3단계 검증: 도착지 팝업 텍스트에 상위 지역 키워드가 포함되어 있는지 대조
     * @param popupText 도착지 팝업의 전체 텍스트
     * @param cityFilters 상위 지역 키워드 리스트
     * @return true면 합격(진짜 우리 동네), false면 불합격(동명이동!)
     */
    fun verifyCityMatch(popupText: String, cityFilters: List<String>): Boolean {
        return cityFilters.any { popupText.contains(it, ignoreCase = true) }
    }
}
