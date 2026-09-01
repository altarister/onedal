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

    /**
     * 🚚 **수락한 뒤에 뜨는 화면들의 낱말** (2026-09-02 신설 · ⚠️ **아직 실물 미확인**).
     *
     * 기사님 확정: *"켑처화면으로 이후를 예상하고 만들어야 한다.
     * 내가 캡쳐해오면 **그 단어만 바꿔치기** 하면 되니까."*
     *
     * 근거는 [`ex_images/카카오픽커/참고_2023_출처불명/`] — **2023년 1월 남의 자료**다.
     * 실물(2026)과 이미 어긋난 자리가 하나 확인됐다: 픽업 완료가 그때는 «밀어서 픽업 완료»
     * (스와이프), 지금은 «픽업 완료하기»(버튼)다. 그래서 **낱말을 여기 한 곳에 모아 둔다** —
     * 내일 실물 캡처가 오면 이 목록만 갈아끼우면 되고 화면 판별 구조는 안 흔들린다.
     *
     * 🔴 **하나라도 맞으면 «수락됨»으로 본다** (`any`). 셋 다 요구하면(`all`) 한 화면에
     *    다 있을 리가 없어 영영 안 잡힌다 — 판별 규칙(`ScreenDetector`)이 `detailKeywords`
     *    에는 `all`, `confirmKeywords` 에는 `any` 를 쓰므로 그 자리에 맞춰 넣는다.
     */
    val ACCEPTED_SCREEN_WORDS = listOf(
        "픽업 완료",      // 「픽업 완료하기」(2026 추정) · 「밀어서 픽업 완료」(2023 실물)
        "픽업지로 이동",   // 수락 직후 첫 화면 (2023 실물)
        "배송 완료",      // 「배송 완료하기」 (2023 실물)
        "배송지로 이동",   // 픽업을 마친 뒤 (2023 실물)
    )

    val PICKER = ScreenKeywords(
        // 리스트: 상단 고정 헤더 «리스트 설정»이 이 화면에만 있다 (덤프 04~10 · 0830 전부)
        listRequired = listOf("리스트 설정"),
        // 완료/수행 내역 화면은 아직 미탐사 — 오인 방지 표식 (실물 뜨면 채운다)
        completedListRequired = listOf(NEVER),
        /**
         * 상세로 볼 화면 — **수락 전과 수락 후를 둘 다 여기 담는다.**
         * `ScreenDetector` 가 `detailKeywords.all` 로 «상세인가»를 먼저 보고,
         * 그다음 `confirmKeywords.any` 로 **수락 전(PRE_CONFIRM) / 수락 후(CONFIRMED)** 를 가른다.
         * 그래서 여기에는 **두 화면에 공통인 것**을, confirm 쪽에는 **수락 전에만 있는 것**을 넣는다.
         *
         * 🔴 공통 낱말은 «픽업»이다 — 수락 전 상세에 「픽업 15.2km」·「픽업 장소」,
         *    수락 후에 「픽업 완료하기」·「픽업지로 이동하세요」. 리스트에는 «픽업»이 없다
         *    (리스트는 «15.2km» 처럼 숫자만 쓴다) — 실물 02·04 로 확인했다.
         */
        detailKeywords = listOf("픽업"),
        confirmKeywords = listOf("수락하기"),   // 수락 **전**에만 있다 → 없으면 수락 후로 본다
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
