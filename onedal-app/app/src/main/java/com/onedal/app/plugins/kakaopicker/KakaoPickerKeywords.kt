package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.ScreenKeywords

/**
 * 🌐 카카오T픽커(`com.kakaomobility.flexer`) 화면 판별 사전.
 *
 * 근거 실물: `log/카카오픽커/화면덤프/`(08-28 · 심사 중) + `화면덤프_0830/`(08-30 · 심사 통과).
 * 픽커는 네이티브 앱이라 텍스트 노드가 낱개로 깨끗하게 온다 (인성 웹뷰와 다름).
 *
 * 화면을 알아보는 글자는 배차망 정의 표(`KakaoPickerPages.screens`)에 있다 — 여기에는 수락 확인(운행 단계 · 내 오더)에 쓰는 글자만 둔다.
 */
object KakaoPickerKeywords {
    /**
     * 🚚 **픽커 콜에 넣는 차종 — 픽커에 차종 축이 없어서 하나로 통일한다**
     * (기사님 확정: *"차종, 짐 등등.. 그건 하나로 통일해서 임의로 넣고"*).
     *
     * 픽커는 **물품 크기**(초소형·소형·중형)로 가르고 차종 칸이 아예 없다. 그런데 서버
     * 판정·장부는 차종 칸을 쓰므로 빈칸으로 두면 그 아래가 전부 «모름»이 된다.
     *
     * 🔴 **지어내는 것이 아니다 — 일반값이다** (규칙 ⑤-2). 실측 표본 316건에서 소형이
     *    95% 라 승용차·다마스 급이 가장 흔하다. 그리고 **반드시 «미확인»을 함께 표시**한다
     *    (`PICKER_VEHICLE_UNKNOWN_TAG`) — 표시 없이 값만 쓰면 규칙 ④ 위반이다.
     */
    const val PICKER_ASSUMED_VEHICLE = "다마스"

    /** 🏷️ 위 차종이 실제 값이 아니라 일반값임을 화면·장부가 알아보게 하는 표시 */
    const val PICKER_VEHICLE_UNKNOWN_TAG = "차종미확인"

    // ══════════════════════════════════════════════════════════════
    //  수락한 뒤의 운행 단계
    // ══════════════════════════════════════════════════════════════

    /**
     * 🚚 **수락한 뒤의 운행 단계 다섯** (기사님 확정: *"23년도 자료로 지금 만들자"*).
     *
     * 지금까지는 수락 뒤를 **«수락됨» 하나로 뭉뚱그렸다.** 그래서 «픽업하러 가는 중인가,
     * 배송하러 가는 중인가»를 몰랐고 우리 6단계 장부에 이을 수도 없었다.
     *
     * ⚠️ **낱말은 2023년 자료에서 뽑은 추정이다** (`ex_images/카카오픽커/참고_2023_출처불명/`).
     *    실물 캡처가 오면 **`STAGE_WORDS` 표만** 갈아끼운다 — 판정 함수와 부르는 곳은
     *    안 고쳐도 된다 (기사님 방침: *"그 단어만 바꿔치기 하면 되니까"*).
     */
    enum class Stage {
        HOME,         // 🏠 출근 전 홈 — 아직 일을 시작하지 않았다  (실물 덤프 01·02)
        TO_PICKUP,    // 픽업지로 이동 중            (자료 01)
        AT_PICKUP,    // 픽업지 도착 — 픽업 완료 대기  (자료 02·03)
        TO_DROPOFF,   // 배송지로 이동 중            (자료 04)
        AT_DROPOFF,   // 배송지 도착 — 배송 완료 대기  (자료 05)
        DONE,         // 배송 완료                   (자료 06)
    }

    /**
     * 🔴 **순서가 곧 우선순위다 — 「밀어서 …」가 헤더를 이긴다**.
     *
     * 🟢 **실물에는 헤더와 확정 버튼이 함께 보이는 화면이 없다** (기사님 완주 기록 · `실물_2026/` 11~32):
     *    「밀어서 …」는 **시트를 올려야** 나오고, 그때 시트가 **헤더를 덮는다**(17·22번).
     *    접근성 트리는 가려진 헤더도 읽으므로 **확정 버튼이 있으면 그것이 답**이다.
     */
    /* 🔴 일부러 두 벌 — 화면 판별은 표(`KakaoPickerPages.screens` 의 운행 페이지)가 하고, 여기 글자는 수락 확인(`stageOf`)만 쓴다 · 표로 옮기는 일은 기사님 여쭘 대기(수락 확인 결과가 인증사진 · 문자 화면에서 바뀐다) */
    val STAGE_WORDS: List<Pair<Stage, List<String>>> = listOf(
        /**
         * 🏠 **홈은 「시작하기」 버튼으로 안다** (기사님 확정:
         * *"'시작하기' 이 버튼이 있어야 홈화면이야"*).
         *
         * 실물 덤프 17종 전수로 확인했다 — **홈 3종에만 있고 리스트·상세 14종엔 하나도 없다.**
         *
         * 🔴 「어떤 일을 시작할까요」·「미션」 같은 안내 문구로 가르지 않는다. 특히 「미션」은
          *    그 목록에 **「퀵 1건 배송완료하고」** 같은 문구가 있어,
         *    홈을 먼저 보지 않으면 「까지 배송완료」 규칙에 걸려 «배송지 도착»으로 읽힌다.
         *    버튼 하나가 화면을 정한다 — 안내 문구는 바뀌지만 버튼은 그 화면의 뼈대다.
         *
         * ⚠️ 홈이 **맨 앞**인 이유도 그것이다. 미션 문구가 다른 규칙에 걸리기 전에 먼저 잡는다.
         */
        Stage.HOME       to listOf("시작하기"),
        Stage.DONE       to listOf("물품이 안전하게 전달"),                  // 실물 31 ✅ (2023 자료도 맞았다)
        /* 🟢 **확정 버튼 먼저** — 시트가 올라오면 헤더가 가려진다 (실물 17·22) */
        Stage.AT_PICKUP  to listOf("밀어서 픽업 완료"),                      // 실물 17
        Stage.AT_DROPOFF to listOf("밀어서 사진 촬영"),                      // 실물 22 (2023 의 「밀어서 배송 인증」이 아니다)
        /**
         * 🔴 **「배송 시간」이지 「배송」이 아니다** — 픽업 이동 화면(실물 16)에도
         *    「배송 33분 남음」이 있다. 넓게 잡으면 **픽업하러 가는 중을 배송 중으로** 읽는다.
         */
        Stage.TO_DROPOFF to listOf("배송 시간", "물품 파손"),                 // 실물 21
        Stage.TO_PICKUP  to listOf("픽업 준비", "픽업지 근처에"),             // 실물 16·18
    )

    /**
     * 🚚 **퀵 흰 페이지 표식** — 실물 17-1 · 17-2 · 22-1 (퀵은 도보의 지도 위 시트와 페이지가 다르다).
     *
     * 🟢 실물 A24 로그(`log/1dal-주행로그-20260913/폰로그/A24_logcat_전체_1000-1210.log` 11:55:15 · 11:56:32)에서 원달앱이 실제로 읽은 글자다.
     * 🔴 **머리 글자(«지금 바로 출발해 주세요» · «픽업이 지연되고 있어요» · «배송 출발해주세요»)는 원달앱이 못 읽는다** —
     *    20초 동안 여러 번 읽었는데 한 번도 없었다. 그래서 표식은 버튼 이름과 가려진 칸 이름이다.
     * ⚠️ «픽업지 정보» · «도착지 정보»까지 넣는 까닭 — 스크롤된 화면(11:55:15)에는 복사 · 전화 이름이 없고 «도착지 정보»만 있었다.
     *    표식만으로는 정하지 않는다 — 아래 버튼 글자가 함께 보여야 한다 (수락 전 상세에도 가려진 칸 이름이 있을 수 있다).
     */
    val QUICK_PAGE_MARKERS: List<String> = listOf(
        "픽업지 정보", "도착지 정보",
        "픽업지 주소 복사하기", "픽업지에 전화하기", "도착지 주소 복사하기", "도착지에 전화하기",
    )

    /**
     * 🚚 **퀵 페이지 안의 차례는 바닥 버튼 하나가 답이다** — 한 페이지에서 버튼만 바뀐다 (기사님 확인 · 실물 17-1 → 17-2 · 22-1 두 장).
     * 출발하기 = 이동(TO) · 완료하기 = 완료 대기(AT) — 도보가 «밀어서 픽업 완료»가 보이는 화면을 AT 로 보는 것과 같은 규칙이라,
     * 퀵 버튼 네 번이 «픽업 이동 → 픽업 도착 → 배송 이동 → 배송 도착» 순서로 찍힌다.
     * ⚠️ 실물 로그로 본 것은 «픽업 출발하기» 하나다 — 나머지 셋은 사진 글자다 (운행 기록 `PickerTrace` 로 확인한다).
     */
    val QUICK_STAGE_BUTTONS: List<Pair<Stage, String>> = listOf(
        Stage.AT_DROPOFF to "배송 완료하기",   // 22-1 출발 뒤
        Stage.TO_DROPOFF to "배송 출발하기",   // 22-1 출발 전
        Stage.AT_PICKUP  to "픽업 완료하기",   // 17-2
        Stage.TO_PICKUP  to "픽업 출발하기",   // 17-1 🟢 실물 로그
    )

    /**
     * 🚚 **이 화면은 운행의 어느 단계인가** — 아니면 `null`(아직 수락 전이거나 딴 화면).
     *
     * 🔴 「수락하기」가 아직 보이면 **무조건 `null`** 이다 (실사고).
     *    그날 «수락하기가 없다»를 «수락했다»의 근거로 썼다가, 리스트로 돌아오는 판의
     *    상세 잔상 한 줄을 «수락됨»으로 읽어 **아무도 안 누른 콜이 잡은 콜로 승격**됐다.
     *    → **없음이 아니라 있음을 본다.**
     *
     * 순수 함수라 폰 없이 검사된다 (`PickerScreenDetectTest`).
     */
    fun stageOf(rawText: String?): Stage? {
        val t = rawText ?: return null
        if (t.contains("수락하기")) return null          // 아직 계약 전이다
        // 🚚 퀵 흰 페이지 — 표식 + 바닥 버튼 두 겹 (버튼 글자만으로는 정하지 않는다: 문자 전송 화면에도 «배송 완료»가 있다)
        if (QUICK_PAGE_MARKERS.any { t.contains(it) }) {
            QUICK_STAGE_BUTTONS.firstOrNull { (_, button) -> t.contains(button) }?.let { return it.first }
        }
        return STAGE_WORDS.firstOrNull { (_, words) -> words.any { t.contains(it) } }?.first
    }

    /**
     * 🔴 **«알아본 화면»과 «수락한 뒤»는 다른 것이다** (홈을 넣으며 갈랐다).
     *
     * `Stage` 는 «이 화면이 무엇인가»를 답하고, 여기는 «계약이 성립했는가»를 답한다.
     * **홈은 알아보지만 수락한 게 아니다** — 안 가르면 홈 화면이 콜을 «잡은 콜»로
     * 승격시킨다. 한 값이 두 사실을 답하게 두지 않는다 (규칙 ⑤-4 ⑤).
     */
    private val ACCEPTED_STAGES = setOf(
        Stage.TO_PICKUP, Stage.AT_PICKUP, Stage.TO_DROPOFF, Stage.AT_DROPOFF, Stage.DONE,
    )

    /**
     * ↩️ **수락 전 상세에서 화면이 바뀌었다 — 무엇을 할까** (기사님: *"로그 문구는 오해를 할 수 있는 부분이라 수정"*).
     *
     * 🔴 리스트로 돌아오면 `HijackService` 가 세션(리스트 원본 · 미리보기 딱지)을 **먼저 비운다.** 그 뒤에 승격 확인을 부르면
     *    비워진 값을 보고 «상세를 거쳐 오지 않았다»고 적었다 — 폰 시험(16:23)에서 30초 자동 복귀마다 그렇게 찍혔다.
     *    리스트로 돌아온 것은 **수락이 아니다** (넘기기 · 뒤로 · 자동 복귀) — 승격 확인을 부르지 않는다.
     * 🔴 **상세에 머무는 중이면 아무것도 적지 않는다** (33 폰 시험) — 상세 글자(«130분 남음»→«129분»)만
     *    바뀌어도 «상세 → 상세»로 화면 변경이 잡혀, 떠난 적이 없는데 «상세 글자가 남은 화면 — 버린다»가 찍혔다.
     * 순수 함수라 폰 없이 검사된다 (`PromotionCheckTest`).
     */
    enum class AfterDetail { STILL_ON_DETAIL, RETURNED_TO_LIST, RESIDUE, CHECK_ACCEPTED }

    fun afterDetail(returnedToList: Boolean, residue: Boolean, stillOnDetail: Boolean = false): AfterDetail = when {
        stillOnDetail -> AfterDetail.STILL_ON_DETAIL
        returnedToList -> AfterDetail.RETURNED_TO_LIST
        residue -> AfterDetail.RESIDUE
        else -> AfterDetail.CHECK_ACCEPTED
    }

    /** ⏱️ 자동 복귀가 몇 초 뒤인지는 적지 않는다 — 서버 DB 값이다 */
    const val RETURNED_TO_LIST_LOG = "↩️ [승격 안 함] 상세에서 리스트로 돌아왔다 — 수락하지 않았다 (넘기기 · 뒤로 · 상세 대기 시간 뒤 자동 복귀)"

    /** ✅ 수락한 뒤인가 — 잡은 콜로 승격해도 되는가 */
    fun isAcceptedScreen(rawText: String?): Boolean = stageOf(rawText) in ACCEPTED_STAGES

    /**
     * ⏳ **늦은 수락 확인 — 상세 바로 뒤가 아니어도 승격을 확인하는가**.
     *
     * 퀵은 수락하면 «내 오더»로 가고 카드를 눌러야 흰 페이지(수락 표식)가 보인다. 상세 바로 뒤(내 오더)에는 표식이 없어
     * 승격이 보류되고, 흰 페이지는 «직전이 상세»가 아니다 — 이 확인이 없으면 수락이 **한 건도 서버에 안 올라간다**.
     * 🔴 `hasOpenDetailCall` = 아직 정리되지 않은 상세 콜이 있다 — 미리보기 딱지(`isPreview`) 또는 보고 보류(`heldUnfilled` · 손으로 열었고 전체 주소를 못 채운 콜).
     *    둘 다 넘기기 · 뒤로 · 자동 복귀로 **리스트에 가면 비워진다** — 남아 있다는 것은
     *    상세를 떠난 뒤 리스트를 거치지 않았다는 뜻이다. 거기에 수락 뒤 표식이 **실제로 보여야** 한다 (없음이 아니라 있음).
     * 상세 바로 뒤는 원래 길(`afterDetail` → `reportPickerAccepted`)이 한다 — 두 번 부르지 않는다.
     */
    fun shouldCheckLateAcceptance(previousWasDetail: Boolean, hasOpenDetailCall: Boolean, hasDetailOrder: Boolean, rawText: String?): Boolean =
        !previousWasDetail && hasOpenDetailCall && hasDetailOrder && isAcceptedEvidence(rawText)

    /**
     * 📝 **승격할 때 서버로 보낼 상세 글자 — 상세에서 모은 것이 이긴다** (체험 · 로그 분석).
     *
     * 승격은 «딱지를 벗기는 것»이지 콜을 다시 읽는 것이 아니다. 그런데 수락 뒤 화면 글자로
     * **통째로 갈아치우고** 있었다. 그날 「내 오더」 탭에는 줄임 이름(「초월읍」)뿐이라
     * 0.14초 전 상세에서 읽은 전체 주소(「경기 광주시 초월읍 경충대로 907」)가 사라졌고,
     * 서버는 「광주 초월읍」으로 좌표를 못 찾아 판정이 🔴 로 남았다.
     *
     * 🔴 **상세를 못 읽은 판만 수락 뒤 글자를 쓴다** — 퀵은 수락하면 흰 페이지에 주소가 있고,
     *    상세를 한 번도 못 읽은 콜에는 그것이 유일한 재료다. 지어내지 않고 있는 것 중 나은 쪽을 고른다.
     */
    fun detailTextForAccept(collected: String?, acceptedScreen: String): String =
        if (collected.isNullOrBlank()) acceptedScreen else collected

    /**
     * 📋 **«내 오더» 탭** — «목록 지도»(머리 토글)가 있고 «리스트 설정» · «수락하기»가 없다 (실물 라이브 09-16 04:36).
     * 그날 신규 리스트 기록 4건에는 «목록 지도»가 한 번도 없었다 («수요지도»는 리스트에도 있어 못 쓴다).
     * 🔴 화면 판별(«내 오더» 화면 값)은 배차망 정의 표가 한다 — 여기는 수락 확인(`isAcceptedEvidence`)만 쓴다(표와 같은 글자 · reviews/35 4단계에서 표로).
     */
    fun isMyOrderTab(rawText: String?): Boolean {
        val t = rawText ?: return false
        return t.contains(MY_ORDER_TAB_WORD) && MAIN_TAB_WORDS.all { t.contains(it) } &&
            !t.contains("리스트 설정") && !t.contains("수락하기")
    }
    private const val MY_ORDER_TAB_WORD = "목록 지도"
    /** 아래 탭 줄 «신규 · 내 오더» — 리스트에도 있어(09-16 라이브 8/8) 가르지는 못하지만, 픽커 탭 화면이라는 확인으로 함께 요구한다 (기사님 지시) */
    private val MAIN_TAB_WORDS = listOf("신규", "내 오더")
    /** 오더가 없을 때만 나오는 글자 — 이 탭은 수락의 증거가 아니다 (실물 라이브 09-16 04:36) */
    private const val MY_ORDER_EMPTY = "진행 중인 오더가 없어요"

    /** ✅ **수락했다는 증거** — 운행 화면(퀵 흰 페이지 · 도보 «밀어서 …» 등)이거나, 오더가 든 «내 오더» 탭 (수락하면 곧바로 여기로 온다) */
    fun isAcceptedEvidence(rawText: String?): Boolean =
        isAcceptedScreen(rawText) || (isMyOrderTab(rawText) && rawText?.contains(MY_ORDER_EMPTY) == false)

    /** 🔴 원천은 `STAGE_WORDS` 하나다 — 손으로 또 적으면 두 벌이 된다 (규칙 ③) */
    val ACCEPTED_SCREEN_WORDS: List<String> =
        STAGE_WORDS.filter { it.first in ACCEPTED_STAGES }.flatMap { it.second } +
            QUICK_STAGE_BUTTONS.filter { it.first in ACCEPTED_STAGES }.map { it.second }

    // ══════════════════════════════════════════════════════════════
    //  배정 알림 · 이름표
    // ══════════════════════════════════════════════════════════════

    /** 🏁 다른 기사가 먼저 가져갔다는 알림인가 — 픽커 배차망 정의 표의 알림(NOTICE) 덧칸(`CallTakenNote`) */
    fun isTakenToast(text: String): Boolean = com.onedal.app.core.CallTakenNote.noticeOf(KakaoPickerPages.screens, text) != null

    /** 픽커 이름표 · 취소 버튼 글자 — 화면을 알아보는 글자는 배차망 정의 표(`KakaoPickerPages.screens`)에 있다 */
    val PICKER = ScreenKeywords(appLabel = "픽커", cancelKeyword = "넘기기")

    /** 🖥️ 이 배차망 화면에만 있는 글자 묶음 — 원천은 shared 배차망 정의 표의 networkMarkers(`KakaoPickerPages.networkMarkers`) · 여기는 이름만 잇는다(`TargetApp.networksOnScreen` · `NetworkByScreenTest`) */
    val NETWORK_MARKERS: List<List<String>> get() = KakaoPickerPages.networkMarkers

}
