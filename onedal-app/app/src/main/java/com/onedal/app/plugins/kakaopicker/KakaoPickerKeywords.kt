package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.ScreenKeywords

/**
 * 🌐 카카오T픽커(`com.kakaomobility.flexer`) 화면 판별 사전 (2026-08-30 신설).
 *
 * 근거 실물: `log/카카오픽커/화면덤프/`(08-28 · 심사 중) + `화면덤프_0830/`(08-30 · 심사 통과).
 * 픽커는 네이티브 앱이라 텍스트 노드가 낱개로 깨끗하게 온다 (인성 웹뷰와 다름).
 *
 * ⚠️ 픽커에는 인성식 팝업(출발지/도착지/적요)이 **없다.** 판별 규칙이 «키워드 전부 포함»
 *    이라 빈 목록을 주면 모든 화면이 그 팝업으로 오인된다 — 절대 안 뜨는 문자열을 박아
 *    그 판별을 사실상 끈다. 수집 전용 1차라 상세·팝업 흐름은 어차피 안 탄다
 *    (`TargetApp.supportsCatching = false` · 픽커_수집.md §3-확장).
 */
object KakaoPickerKeywords {
    /** 픽커에 존재하지 않는 화면 판별을 끄는 표식 — 실제 화면에 절대 안 나오는 문자열 */
    private const val NEVER = "〈픽커에는 이 화면이 없다〉"

    val PICKER = ScreenKeywords(
        // 리스트: 상단 고정 헤더 «리스트 설정»이 이 화면에만 있다 (덤프 04~10 · 0830 전부)
        listRequired = listOf("리스트 설정"),
        // 완료/수행 내역 화면은 아직 미탐사 — 오인 방지 표식 (실물 뜨면 채운다)
        completedListRequired = listOf(NEVER),
        // 상세: 하단 «수락하기»(+넘기기)가 상세에만 있다 (덤프 11·12 · 0830 03)
        detailKeywords = listOf("수락하기"),
        confirmKeywords = listOf("수락하기"),   // 배차 전 표식 — 수락 전 상세
        pickupKeywords = listOf(NEVER),
        dropoffKeywords = listOf(NEVER),
        memoKeywords = listOf(NEVER),
        // «이미 배정» 안내 (덤프 10 — 상세 열기 실패)
        errorKeywords = listOf("다른 기사에게 배정"),
        // 홈(출근 전/미션 화면)은 해로울 게 없는 화면 — 조용히 넘기는 분류로 둔다
        loadingKeywords = listOf("어떤 일을 시작할까요"),
        appLabel = "픽커",
        cancelKeyword = "넘기기"
    )
}
