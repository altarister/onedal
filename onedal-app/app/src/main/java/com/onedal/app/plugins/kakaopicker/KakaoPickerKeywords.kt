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
 *    그 판별을 사실상 끈다.
 */
object KakaoPickerKeywords {
    /** 픽커에 존재하지 않는 화면 판별을 끄는 표식 — 실제 화면에 절대 안 나오는 문자열 */
    private const val NEVER = "〈픽커에는 이 화면이 없다〉"

    // ══════════════════════════════════════════════════════════════
    //  수락한 뒤의 운행 단계
    // ══════════════════════════════════════════════════════════════

    /**
     * 🚚 **수락한 뒤의 운행 단계 다섯** (기사님 확정 2026-09-02: *"23년도 자료로 지금 만들자"*).
     *
     * 지금까지는 수락 뒤를 **«수락됨» 하나로 뭉뚱그렸다.** 그래서 «픽업하러 가는 중인가,
     * 배송하러 가는 중인가»를 몰랐고 우리 6단계 장부에 이을 수도 없었다.
     *
     * ⚠️ **낱말은 2023년 자료에서 뽑은 추정이다** (`ex_images/카카오픽커/참고_2023_출처불명/`).
     *    실물 캡처가 오면 **`STAGE_WORDS` 표만** 갈아끼운다 — 판정 함수와 부르는 곳은
     *    안 고쳐도 된다 (기사님 방침: *"그 단어만 바꿔치기 하면 되니까"*).
     */
    enum class Stage {
        TO_PICKUP,    // 픽업지로 이동 중            (자료 01)
        AT_PICKUP,    // 픽업지 도착 — 픽업 완료 대기  (자료 02·03)
        TO_DROPOFF,   // 배송지로 이동 중            (자료 04)
        AT_DROPOFF,   // 배송지 도착 — 배송 완료 대기  (자료 05)
        DONE,         // 배송 완료                   (자료 06)
    }

    /**
     * 🔴 **순서가 곧 우선순위다 — 헤더가 버튼을 이긴다.**
     *
     * 자료 01 은 헤더가 「픽업지로 이동하세요」인데 버튼은 이미 「밀어서 픽업 완료」다.
     * 버튼을 먼저 보면 «도착했다»로 잘못 읽는다 — **헤더(이동 중)를 먼저 본다.**
     *
     * ⚠️ 「까지 픽업**완료**」와 수락 전 상세의 「17:04까지 픽업」은 다른 글자다.
     *    «완료»가 붙어야 이 단계다 — 수락 전 상세가 여기 걸리지 않게 하는 경계다.
     */
    val STAGE_WORDS: List<Pair<Stage, List<String>>> = listOf(
        Stage.DONE       to listOf("물품이 안전하게 전달"),
        Stage.TO_DROPOFF to listOf("배송지로 이동"),                                    // 헤더 먼저
        Stage.TO_PICKUP  to listOf("픽업지로 이동"),                                    // 헤더 먼저
        Stage.AT_DROPOFF to listOf("배송 완료하기", "밀어서 배송 인증", "까지 배송완료"),
        Stage.AT_PICKUP  to listOf("픽업 완료하기", "밀어서 픽업 완료", "까지 픽업완료", "픽업예약"),
    )

    /**
     * 🚚 **이 화면은 운행의 어느 단계인가** — 아니면 `null`(아직 수락 전이거나 딴 화면).
     *
     * 🔴 「수락하기」가 아직 보이면 **무조건 `null`** 이다 (2026-09-02 실사고).
     *    그날 «수락하기가 없다»를 «수락했다»의 근거로 썼다가, 리스트로 돌아오는 판의
     *    상세 잔상 한 줄을 «수락됨»으로 읽어 **아무도 안 누른 콜이 잡은 콜로 승격**됐다.
     *    → **없음이 아니라 있음을 본다.**
     *
     * 순수 함수라 폰 없이 검사된다 (`PickerScreenDetectTest`).
     */
    fun stageOf(rawText: String?): Stage? {
        val t = rawText ?: return null
        if (t.contains("수락하기")) return null          // 아직 계약 전이다
        return STAGE_WORDS.firstOrNull { (_, words) -> words.any { t.contains(it) } }?.first
    }

    /** ✅ 수락한 뒤인가 — 잡은 콜로 승격해도 되는가. 원천은 `stageOf` 하나다 (규칙 ③) */
    fun isAcceptedScreen(rawText: String?): Boolean = stageOf(rawText) != null

    /** 🔴 원천은 `STAGE_WORDS` 하나다 — 손으로 또 적으면 두 벌이 된다 (규칙 ③) */
    val ACCEPTED_SCREEN_WORDS: List<String> = STAGE_WORDS.flatMap { it.second }

    // ══════════════════════════════════════════════════════════════
    //  화면 판별 사전
    // ══════════════════════════════════════════════════════════════

    val PICKER = ScreenKeywords(
        // 리스트: 상단 고정 헤더 «리스트 설정»이 이 화면에만 있다 (덤프 04~10 · 0830 전부)
        listRequired = listOf("리스트 설정"),
        // 완료/수행 내역 화면은 아직 미탐사 — 오인 방지 표식 (실물 뜨면 채운다)
        completedListRequired = listOf(NEVER),
        /**
         * 🔴 **낱말 둘을 함께 요구한다 — 인성이 쓰는 방식** (2026-09-02 실사고 수리).
         *
         * 처음엔 `["픽업"]` 하나였다. 리스트로 돌아오는 판에 상세 잔상 한 줄
         * (「픽업지 경기 성남시 …」)이 남았고, 그 한 낱말로 리스트가 **상세로 오인**됐다.
         *
         * 인성은 처음부터 둘을 요구한다 — `listRequired = ["신규","빠른설정"]` ·
         * `detailKeywords = ["적요상세","요금"]`. 한 낱말이 잔상으로 남아도 나머지가
         * 없어서 안 걸린다. 픽커도 같게 만든다.
         *
         * 실물 덤프 12종을 훑어 **상세 2종 모두에 있고 리스트 7종·홈 3종 어디에도 없는**
         * 낱말이 정확히 이 둘이었다 — 지어낸 것이 아니라 골라낸 것이다.
         *
         * ⚠️ 둘 다 «수락 **전**»의 표식이다. 수락하면 사라지므로 **수락 후 화면은 여기로
         *    안 잡힌다** — 그 판정은 `stageOf` 가 따로 한다 (HijackService 화면 판별 직후).
         */
        detailKeywords = listOf("넘기기", "수락하기"),
        confirmKeywords = listOf("수락하기", "넘기기"),
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
