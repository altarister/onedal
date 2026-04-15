package com.onedal.app.core

data class LocationInfo(
    val cleanRegion: String,
    val scheduleText: String?
)

object LocationTextAnalyzer {
    // ── 1차: 행정구역 접미사가 붙은 정식 지역명 (예: "경안동", "초월읍", "서울 강남구") ──
    private val fullRegionRegex = Regex("^(.*?)([가-힣]{2,}(?:\\s+[가-힣]+){0,2}(?:동|읍|면|리|시|구|군))([-+@/\\s]*)$")
    
    // ── 2차: 인성앱이 축약해버린 짧은 지역명 (예: "의왕", "강남", "광주", "평택") ──
    //    순수 한글 2~4글자 + 끝에 기호가 올 수 있음
    private val shortRegionRegex = Regex("^(.*?)([가-힣]{2,4})([-+@/\\s]*)$")
    
    fun analyze(text: String): LocationInfo? {
        val t = text.trim()
        
        // 1차 시도: 정식 접미사 매칭 (경안동, 초월읍, 서울 중구 등)
        val fullMatch = fullRegionRegex.find(t)
        if (fullMatch != null) {
            return buildLocationInfo(fullMatch)
        }
        
        // 2차 시도: 축약형 한글 지역명 (의왕, 강남, 광주 등)
        val shortMatch = shortRegionRegex.find(t)
        if (shortMatch != null) {
            val candidate = shortMatch.groupValues[2].trim()
            // 순수 한글 2~4자이고 숫자/영문이 섞이지 않은 진짜 축약 지역명만 통과
            if (candidate.length in 2..4 && candidate.all { it in '가'..'힣' }) {
                return buildLocationInfo(shortMatch)
            }
        }
        
        return null
    }
    
    private fun buildLocationInfo(matchResult: MatchResult): LocationInfo {
        val prefix = matchResult.groupValues[1].trim()
        val region = matchResult.groupValues[2].trim()
        
        // 순수 기호로만 이루어진 prefix 제거 (예: "@", "-")
        var cleanedPrefix = prefix.replace(Regex("^[-+@/\\s]*$"), "").trim()
        // 텍스트+기호인 경우 끝의 불필요한 구분 기호 제거 (예: "낼09시/" -> "낼09시")
        cleanedPrefix = cleanedPrefix.removeSuffix("/").removeSuffix("-").removeSuffix("@").trim()
        
        return LocationInfo(
            cleanRegion = region,
            scheduleText = cleanedPrefix.takeIf { it.isNotEmpty() }
        )
    }
}
