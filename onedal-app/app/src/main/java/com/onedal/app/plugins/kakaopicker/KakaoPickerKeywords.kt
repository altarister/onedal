package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.ScreenKeywords
import com.onedal.app.models.ScreenContext

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
    /**
     * 🚫 **그런 화면이 없다** — 확정된 사실. 실제 화면에 절대 안 나오는 문자열로 판별을 끈다.
     *
     * 🔴 아래 `NOT_YET_SEEN` 과 **갈라 둔다** (2026-09-02). 예전엔 한 표식(`NEVER`)이
     *    «없다»와 «아직 못 봤다» 둘 다를 답했다 — 그러면 나중에 읽는 사람이
     *    *"이건 채워야 하는 건가, 두는 건가"* 를 알 수 없다.
     *    이 레포가 한 값에 두 질문을 답하게 두어 하루에 여섯 번 당한 그 형태다
     *    (CLAUDE.md 규칙 ⑤-4 ⑤).
     */
    private const val NO_SUCH_SCREEN = "〈픽커에는 이 화면이 없다〉"

    /** ❓ **아직 실물을 못 봤다** — 있을 수도 있다. 실물이 오면 채운다 (규칙 ④: 지어내지 않는다) */
    private const val NOT_YET_SEEN = "〈아직 실물을 못 본 화면〉"

    /**
     * 🚚 **픽커 콜에 넣는 차종 — 픽커에 차종 축이 없어서 하나로 통일한다**
     * (기사님 확정 2026-09-02: *"차종, 짐 등등.. 그건 하나로 통일해서 임의로 넣고"*).
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
        HOME,         // 🏠 출근 전 홈 — 아직 일을 시작하지 않았다  (실물 덤프 01·02)
        TO_PICKUP,    // 픽업지로 이동 중            (자료 01)
        AT_PICKUP,    // 픽업지 도착 — 픽업 완료 대기  (자료 02·03)
        TO_DROPOFF,   // 배송지로 이동 중            (자료 04)
        AT_DROPOFF,   // 배송지 도착 — 배송 완료 대기  (자료 05)
        DONE,         // 배송 완료                   (자료 06)
    }

    /**
     * 🔴 **순서가 곧 우선순위다 — 「밀어서 …」가 헤더를 이긴다** (2026-09-05 뒤집음).
     *
     * 2023 자료로 만들 때는 반대였다 — 자료 01 이 헤더와 버튼을 **한 화면에** 담고 있었다.
     * 🟢 **실물에는 그런 화면이 없다** (기사님 완주 기록 · `실물_2026/` 11~32):
     *    「밀어서 …」는 **시트를 올려야** 나오고, 그때 시트가 **헤더를 덮는다**(17·22번).
     *    접근성 트리는 가려진 헤더도 읽으므로 **확정 버튼이 있으면 그것이 답**이다.
     */
    val STAGE_WORDS: List<Pair<Stage, List<String>>> = listOf(
        /**
         * 🏠 **홈은 「시작하기」 버튼으로 안다** (기사님 확정 2026-09-02:
         * *"'시작하기' 이 버튼이 있어야 홈화면이야"*).
         *
         * 실물 덤프 17종 전수로 확인했다 — **홈 3종에만 있고 리스트·상세 14종엔 하나도 없다.**
         *
         * 🔴 처음엔 「어떤 일을 시작할까요」·「미션」도 넣었다가 기사님이 잡으셨다. 특히
         *    「미션」이 나빴다 — 그 목록에 **「퀵 1건 배송완료하고」** 같은 문구가 있어,
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
        // 🚚 퀵 흰 페이지 — 표식 + 바닥 버튼 두 겹 (버튼 글자만으로는 정하지 않는다: 문자 전송 화면에도 «배송 완료»가 있다)
        if (QUICK_PAGE_MARKERS.any { t.contains(it) }) {
            QUICK_STAGE_BUTTONS.firstOrNull { (_, button) -> t.contains(button) }?.let { return it.first }
        }
        return STAGE_WORDS.firstOrNull { (_, words) -> words.any { t.contains(it) } }?.first
    }

    /**
     * 🔴 **«알아본 화면»과 «수락한 뒤»는 다른 것이다** (2026-09-02 · 홈을 넣으며 갈랐다).
     *
     * `Stage` 는 «이 화면이 무엇인가»를 답하고, 여기는 «계약이 성립했는가»를 답한다.
     * **홈은 알아보지만 수락한 게 아니다** — 안 가르면 홈 화면이 콜을 «잡은 콜»로
     * 승격시킨다. 한 값이 두 사실을 답하게 두지 않는다 (규칙 ⑤-4 ⑤).
     */
    private val ACCEPTED_STAGES = setOf(
        Stage.TO_PICKUP, Stage.AT_PICKUP, Stage.TO_DROPOFF, Stage.AT_DROPOFF, Stage.DONE,
    )

    /**
     * 🖥️ **이 화면을 관제웹이 알아볼 이름으로 바꾼다** (기사님 지시 2026-09-02).
     *
     * 기사님: *"내가 관제앱에서 현 페이지를 확인할 수 있어야 해.. 그래야 일을 시작할 수 있지."*
     *
     * 🔴 **치환은 배차망 안에서 한다.** 페이지(`Stage`)는 픽커 폴더 밖으로 나가지 않고,
     *    나가는 것은 **공통 화면 값 하나**뿐이다 — 마일스톤을 안 늘리는 것과 같은 원리다
     *    (`docs/기획/배차망_통합.md` §2). 그래야 배차망이 늘어도 공통 목록이 안 부푼다.
     *
     * ⚠️ 홈은 `null` 이다 — 홈은 운행 화면이 아니고, 화면 판별이 «로딩»으로 건너뛴다.
     */
    fun screenContextOf(stage: Stage?): ScreenContext? = when (stage) {
        Stage.TO_PICKUP  -> ScreenContext.RUN_TO_PICKUP
        Stage.AT_PICKUP  -> ScreenContext.RUN_AT_PICKUP
        Stage.TO_DROPOFF -> ScreenContext.RUN_TO_DROPOFF
        Stage.AT_DROPOFF -> ScreenContext.RUN_AT_DROPOFF
        Stage.DONE       -> ScreenContext.RUN_DONE
        // 🏠 홈은 운행 화면이 아니지만 «모름»도 아니다 — 읽었고, 대기 중이다
        Stage.HOME       -> ScreenContext.HOME
        null             -> null              // 픽커가 아는 화면이 아니다 — 낱말 판별에 맡긴다
    }

    /**
     * ↩️ **수락 전 상세에서 화면이 바뀌었다 — 무엇을 할까** (2026-09-14 · 기사님: *"로그 문구는 오해를 할 수 있는 부분이라 수정"*).
     *
     * 🔴 리스트로 돌아오면 `HijackService` 가 세션(리스트 원본 · 미리보기 딱지)을 **먼저 비운다.** 그 뒤에 승격 확인을 부르면
     *    비워진 값을 보고 «상세를 거쳐 오지 않았다»고 적었다 — 폰 시험(16:23)에서 30초 자동 복귀마다 그렇게 찍혔다.
     *    리스트로 돌아온 것은 **수락이 아니다** (넘기기 · 뒤로 · 자동 복귀) — 승격 확인을 부르지 않는다.
     * 🔴 **상세에 머무는 중이면 아무것도 적지 않는다** (2026-09-14 18:28:33 폰 시험) — 상세 글자(«130분 남음»→«129분»)만
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

    /**
     * 🔎 **이 상세를 누가 열었나 — 로그에 적는 기록일 뿐이다** (기사님 지시 2026-09-14).
     * 기사님: *"손으로 연 상세가 60초 뒤 돌아오는지 — 로그캣에 넣어서 나중에 확인할 수 있게 만들어"*
     * 🔴 동작을 가르지 않는다 — 상세 대기 타이머는 누가 열었든 한 곳에서 걸린다 (#124). `[상세 대기]` 줄에만 붙인다.
     * 알람이 카드를 누른 뒤 상세가 뜨기까지 실측 0.3~0.4초 — 넉넉히 5초 안이면 알람이 연 것이다 (`DetailOpenerTest`).
     */
    const val ALARM_OPEN_WINDOW_MS = 5_000L

    /** 앱(알람)이 찍어 연 상세 */
    const val OPENER_ALARM = "알람"
    /** 기사님이 손으로 연 상세 */
    const val OPENER_HAND = "손"

    fun detailOpener(alarmTapAtMs: Long, nowMs: Long): String =
        if (alarmTapAtMs > 0L && nowMs - alarmTapAtMs in 0L..ALARM_OPEN_WINDOW_MS) OPENER_ALARM else OPENER_HAND

    /** ⏱️ 자동 복귀가 몇 초 뒤인지는 적지 않는다 — 서버 DB 값이다 (`docs/지금/배차망별_대기_시간.md`) */
    const val RETURNED_TO_LIST_LOG = "↩️ [승격 안 함] 상세에서 리스트로 돌아왔다 — 수락하지 않았다 (넘기기 · 뒤로 · 상세 대기 시간 뒤 자동 복귀)"

    /** ✅ 수락한 뒤인가 — 잡은 콜로 승격해도 되는가 */
    fun isAcceptedScreen(rawText: String?): Boolean = stageOf(rawText) in ACCEPTED_STAGES

    /**
     * ⏳ **늦은 수락 확인 — 상세 바로 뒤가 아니어도 승격을 확인하는가** (09-16 03:23 폰 시험 수리).
     *
     * 퀵은 수락하면 «내 오더»로 가고 카드를 눌러야 흰 페이지(수락 표식)가 보인다. 상세 바로 뒤(내 오더)에는 표식이 없어
     * 승격이 보류되고, 흰 페이지에서는 «직전이 상세»가 아니라 확인을 안 해서 **«✅ [수락 확인]» 0건 · 서버 장부 0건**이었다.
     * 🔴 미리보기 딱지(`isPreview`)는 넘기기 · 뒤로 · 자동 복귀로 **리스트에 가면 비워진다** — 딱지가 남아 있다는 것은
     *    상세를 떠난 뒤 리스트를 거치지 않았다는 뜻이다. 거기에 수락 뒤 표식이 **실제로 보여야** 한다 (없음이 아니라 있음 · 0902 실사고).
     * 상세 바로 뒤는 원래 길(`afterDetail` → `reportPickerAccepted`)이 한다 — 두 번 부르지 않는다.
     */
    fun shouldCheckLateAcceptance(previousWasDetail: Boolean, isPreview: Boolean, hasDetailOrder: Boolean, rawText: String?): Boolean =
        !previousWasDetail && isPreview && hasDetailOrder && isAcceptedEvidence(rawText)

    /**
     * 📋 **«내 오더» 탭** — «목록 지도»(머리 토글)가 있고 «리스트 설정» · «수락하기»가 없다 (실물 라이브 09-16 04:36).
     * 그날 신규 리스트 기록 4건에는 «목록 지도»가 한 번도 없었다 («수요지도»는 리스트에도 있어 못 쓴다).
     * 🔴 화면 분류(`ScreenContext`)로는 올리지 않는다 — «완료 리스트»로 두면 리스트 복귀로 읽혀 미리보기 딱지가 비워지고 승격이 막힌다.
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

    /**
     * 🖥️ **픽커 화면을 관제웹 이름으로** — 운행 단계가 먼저, 아니면 «내 오더» 탭, 둘 다 아니면 `null`(낱말 판별에 맡긴다).
     * 🔴 내 오더는 리스트 계열이 아니다 — `HijackService` 의 리스트 복귀(세션 비움)에 안 걸려야 수락 뒤 승격이 산다.
     */
    fun pickerScreenContextOf(rawText: String?): ScreenContext? =
        screenContextOf(stageOf(rawText))
            ?: if (isMyOrderTab(rawText)) ScreenContext.MY_ORDERS
            else if (isScrolledList(rawText)) ScreenContext.LIST
            // 📋 머리줄도 아래 탭도 안 보이는 가운데 토막 — 카드 모양으로 알아본다 (기사님 라이브)
            else if (looksLikeCardList(rawText)) ScreenContext.LIST
            else null

    /**
     * 📋 **스크롤해서 머리줄 «리스트 설정»이 가려진 신규 리스트** (09-16 05:28 라이브 — 상세에서 돌아온 리스트가 «모르는 화면»으로 떴다).
     * 아래 탭 줄 «신규 내 오더» + 떠 있는 메뉴 «서포트모드»가 있고, 내 오더 표식(«목록 지도») · 상세 표식(«수락하기»)이 없다.
     * 머리줄이 보이면 원래 판별(`PICKER.listRequired`)에 맡긴다.
     * 🔴 머리줄이 안 보이는 리스트에서는 알람이 카드를 누르지 않는다 — `KakaoPickerParser.isListCardAnchor` 가 머리줄 Y 없음이면 false (#111)
     */
    fun isScrolledList(rawText: String?): Boolean {
        val t = rawText ?: return false
        return !t.contains("리스트 설정") && t.contains("신규 내 오더") && t.contains("서포트모드") &&
            !t.contains(MY_ORDER_TAB_WORD) && !t.contains("수락하기")
    }

    /** 📋 «14.6km … 7,315» — 거리 뒤에 요금이 오는 카드 한 장의 모양 */
    private val CARD_SHAPE = Regex("""\d+(?:\.\d+)?km\s.{0,40}?\d{1,3}(?:,\d{3})+""")

    /** 📋 리스트로 보려면 카드가 이만큼은 보여야 한다 — 상세(한 장)와 가르는 선 */
    private const val CARD_LIST_MIN = 3

    /**
     * 📋 **위도 아래도 안 보이는 «가운데 토막» 도 리스트다** (기사님 라이브: *"지금도 리스트 페이지야"*).
     *
     * 머리줄(«리스트 설정»)이 가려지면 아래 탭 두 글자로 알아보는데(`isScrolledList`),
     * 목록 한가운데를 보고 있으면 **위도 아래도 안 보인다** — 카드만 가득하다. 그때 관제웹에
     * «픽커 알 수 없는 화면»이 떴다.
     *
     * 🔴 **낱말이 아니라 카드 «모양»으로 알아본다** — 「거리 + 요금」이 세 벌 넘게 되풀이되면 리스트다.
     *    픽커가 탭 이름을 바꿔도 안 뚫리고, 상세는 카드가 한 장뿐이라 안 걸린다.
     */
    fun looksLikeCardList(rawText: String?): Boolean {
        val t = rawText ?: return false
        if (t.contains("수락하기") || t.contains(MY_ORDER_TAB_WORD)) return false   // 상세 · 내 오더는 아니다
        return CARD_SHAPE.findAll(t).count() >= CARD_LIST_MIN
    }

    /** ✅ **수락했다는 증거** — 운행 화면(퀵 흰 페이지 · 도보 «밀어서 …» 등)이거나, 오더가 든 «내 오더» 탭 (수락하면 곧바로 여기로 온다) */
    fun isAcceptedEvidence(rawText: String?): Boolean =
        isAcceptedScreen(rawText) || (isMyOrderTab(rawText) && rawText?.contains(MY_ORDER_EMPTY) == false)

    /** 🔴 원천은 `STAGE_WORDS` 하나다 — 손으로 또 적으면 두 벌이 된다 (규칙 ③) */
    val ACCEPTED_SCREEN_WORDS: List<String> =
        STAGE_WORDS.filter { it.first in ACCEPTED_STAGES }.flatMap { it.second } +
            QUICK_STAGE_BUTTONS.filter { it.first in ACCEPTED_STAGES }.map { it.second }

    // ══════════════════════════════════════════════════════════════
    //  화면 판별 사전
    // ══════════════════════════════════════════════════════════════

    /** 🚫 배정 완료 토스트의 글자 — 화면 판별(에러)과 파서(지역에서 뺀다)가 **이 한 곳**을 본다 (규칙 ③) */
    const val ASSIGNED_TOAST_WORD = "이미 배정이 완료된"

    val PICKER = ScreenKeywords(
        // 리스트: 상단 고정 헤더 «리스트 설정»이 이 화면에만 있다 (덤프 04~10 · 0830 전부)
        listRequired = listOf("리스트 설정"),
        // 완료/수행 내역 화면은 아직 미탐사 — 오인 방지 표식 (실물 뜨면 채운다)
        completedListRequired = listOf(NOT_YET_SEEN),
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
        pickupKeywords = listOf(NO_SUCH_SCREEN),
        dropoffKeywords = listOf(NO_SUCH_SCREEN),
        memoKeywords = listOf(NO_SUCH_SCREEN),
        /**
         * 🚫 **«이미 배정이 완료된 오더입니다» 토스트** — 남이 가져간 콜을 눌렀을 때 리스트 위에 뜬다 (실물 캡처 03).
         * 🔴 **09-02 실주행에서 이 글자를 카드 출발지로 읽어 가짜 콜 3건을 서버에 올렸다**
         *    (`log/1dal-주행로그-20260902/표/버려진콜_intel.json` id 3000·3004·3045) — 예전 글자 «다른 기사에게 배정»(2023 자료)은
         *    실물에서 본 적이 없어 못 알아봤다. 토스트가 보이는 동안은 에러 화면으로 보고 리스트를 훑지 않는다.
         * ⚠️ «다른 기사에게 배정»은 남겨 둔다 — 틀렸다는 증거도 없다 (규칙 ② 안전장치는 빼지 않는다). 검사: `AssignedToastTest`
         */
        errorKeywords = listOf(ASSIGNED_TOAST_WORD, "다른 기사에게 배정"),
        /**
         * ⏳ **비워 둔다 — 안 본 것은 안 적는다** (2026-09-02 · 기사님 실측 제보로 수리).
         *
         * 예전엔 `["어떤 일을 시작할까요"]` 였고 주석은 *"홈은 해로울 게 없는 화면 —
         * 조용히 넘기는 분류로 둔다"* 고 적혀 있었다. **홈을 로딩으로 위장시켜 버린 것**이다.
         *
         * 그 뒤 홈을 제대로 된 화면(`Stage.HOME`)으로 만들면서 이 줄을 안 지웠고,
         * 한 화면을 두 곳이 다르게 답하게 됐다 — 로딩이 먼저라 늘 이겼고,
         * `HijackService` 가 홈 프레임을 **통째로 버려** 관제웹이 «알 수 없는 화면»에
         * 굳었다 (규칙 ⑤-4 ⑤ — 읽는 곳이 둘이면 각자 다른 질문을 답하고 있는 것이다).
         *
         * 🔴 **로딩으로 버리는 것이 틀린 답보다 나쁘다.** 틀린 답은 다음 프레임에
         *    고쳐지지만, 버려진 프레임은 아무것도 안 남긴다.
         *
         * 🔴 **픽커에는 로딩 화면이 아예 없다** (기사님 확정 2026-09-02:
         *    *"픽커는 로딩화면이 없어 그냥 홈 화면만 있어"*).
         *    그러니 여기는 «아직 못 봤다»가 아니라 **«없다»** 다 — 채울 날이 오지 않는다.
         *    인성은 있다(「오더 조회」·「기다려 주십」). 배차망마다 다른 것이지
         *    빠뜨린 것이 아니다.
         */
        loadingKeywords = listOf(NO_SUCH_SCREEN),
        appLabel = "픽커",
        cancelKeyword = "넘기기"
    )

    /**
     * 🖥️ **이 배차망 화면에만 있는 글자 묶음** — 스캔앱이 화면 글자로 배차망을 가를 때 쓴다
     * (기사님 확정 2026-09-14 · `TargetApp.networksOnScreen`). 묶음 안 글자가 **전부** 보여야 이 배차망이다.
     * 🔴 새로 적지 않는다 — 위 화면 판별 글자에서 만든다 (두 곳에 적으면 갈라진다 · 규칙 ③).
     */
    /* 픽커는 리스트·상세 말고도 홈·수락 뒤 단계마다 글자가 따로 있다 — `STAGE_WORDS` 는 «그중 하나라도»라서 낱말 하나가 한 묶음이다 */
    val NETWORK_MARKERS: List<List<String>> =
        listOf(PICKER.listRequired, PICKER.detailKeywords) + STAGE_WORDS.flatMap { (_, words) -> words.map { listOf(it) } } +
            QUICK_PAGE_MARKERS.map { listOf(it) }   // 퀵 흰 페이지도 픽커 화면이다 — 머리 글자를 못 읽어 단계 글자로는 안 잡힌다
}
