package com.onedal.app.core.engine

import com.onedal.app.core.ScreenKeywords
import com.onedal.app.models.ScreenContext

/**
 * 화면 판별 전담 모듈
 *
 * 화면의 전체 텍스트를 키워드 사전(ScreenKeywords)과 대조하여
 * 현재 화면이 어떤 종류인지(LIST, DETAIL, POPUP 등) 판별합니다.
 *
 * 판별 우선순위:
 *   1. 에러 팝업 (any)
 *   2. 출발지/도착지 팝업 (any)
 *   3. 적요 팝업 (all)
 *   4. 상세 화면 (all) → 확정 키워드 유무로 PRE/CONFIRMED 구분
 *   5. 신규 리스트 (all)
 *   6. 완료 리스트 (all)
 *   7. UNKNOWN (fallback)
 */
class ScreenDetector {

    /**
     * 화면 텍스트를 분석하여 ScreenContext를 반환합니다.
     *
     * @param text 화면의 모든 텍스트를 공백으로 연결한 문자열
     * @param keywords 타겟 앱별 키워드 사전
     * @return 판별된 화면 상태
     */
    fun detect(text: String, keywords: ScreenKeywords): ScreenContext = when {
        keywords.errorKeywords.any { text.contains(it) }    -> ScreenContext.POPUP_ERROR
        keywords.pickupKeywords.any { text.contains(it) }   -> ScreenContext.POPUP_PICKUP
        keywords.dropoffKeywords.any { text.contains(it) }  -> ScreenContext.POPUP_DROPOFF
        // 적요 팝업: "적요 상세"(띄어쓰기) + "적요 내용" → 확정화면("적요상세" 붙여쓰기)과 구분
        keywords.memoKeywords.all { text.contains(it) }     -> ScreenContext.POPUP_MEMO
        keywords.detailKeywords.all { text.contains(it) }   -> if (keywords.confirmKeywords.any { text.contains(it) })
                                                                    ScreenContext.DETAIL_PRE_CONFIRM
                                                                else ScreenContext.DETAIL_CONFIRMED
        keywords.listRequired.all { text.contains(it) }     -> ScreenContext.LIST
        keywords.completedListRequired.all { text.contains(it) } -> ScreenContext.LIST_COMPLETED
        else -> ScreenContext.UNKNOWN
    }

    /**
     * 팝업 잔상이 화면에 남아있는지 검사합니다.
     * 팝업 닫기 애니메이션(0.1~0.3초) 중 텍스트가 잔류하여
     * 화면 판별이 오작동하는 것을 방어합니다.
     *
     * @param rawScreenStr 화면 전체 텍스트
     * @return true이면 잔상 → 해당 프레임 처리를 스킵해야 함
     */
    fun isPopupResidue(rawScreenStr: String): Boolean {
        return rawScreenStr.contains("출발지 상세") || rawScreenStr.contains("도착지 상세")
    }

    /**
     * 로딩 화면인지 판별합니다.
     *
     * @param rawScreenStr 화면 전체 텍스트
     * @param keywords 타겟 앱별 키워드 사전
     * @return true이면 로딩 중 → 판별 자체를 스킵
     */
    fun isLoading(rawScreenStr: String, keywords: ScreenKeywords): Boolean {
        return keywords.loadingKeywords.any { rawScreenStr.contains(it) }
    }
}
