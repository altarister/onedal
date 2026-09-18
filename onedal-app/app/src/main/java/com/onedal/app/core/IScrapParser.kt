package com.onedal.app.core

import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 화면에서 추출된 원시 문자열을 파싱하여 오더 객체로 변환하고,
 * 필터 조건 판정을 수행하는 인터페이스입니다 (축은 여섯 — 차종·도착지·요금·상차거리·블랙·경로순서).
 *
 * 구현체:
 *   - InsungParser: 진짜 배차 앱 (인성콜) 전용
 */
interface IScrapParser {

    /** 텍스트 리스트를 파싱하여 SimplifiedOfficeOrder 객체로 변환 */
    fun parse(texts: List<String>): SimplifiedOfficeOrder

    /**
     * 파싱된 오더가 필터 조건을 모두 만족하는지 판정.
     *
     * 👁️ `tally` 를 주면 **축별 탈락 수를 채워 준다** (기사님 확정 2026-08-23).
     *    한 콜은 **첫 번째로 걸린 축에만** 센다 — 다 세면 합이 본 수를 넘어
     *    *"이 축을 풀면 몇 개가 들어오나"* 를 못 읽는다.
     *    🔴 파서가 결과를 들고 있지 않는다. **호출자가 그릇을 만들어 넘긴다** —
     *       파서 안에 두면 언제 갱신되는지가 호출 순서에 달린다 (숨은 상태).
     */
    fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally? = null): Boolean

    /**
     * 🗳️ **판정을 콜에 실어 돌려준다** (현황판 의뢰 2026-09-12).
     *
     * 현황판이 앱 판정식을 TS 로 **옮겨 적은 사본**으로 화면을 그리고 있었고, 그것이 이미
     * 한 번 갈라졌다 (앱은 요율 모델이 서면 `minFare` 를 안 보는데 사본은 그것만 봐서
     * **가짜 «통과»**). 값을 실어 보내면 사본이 통째로 사라진다.
     *
     * 🔴 **기본 구현을 두지 않는다 — `alarmBandHalfPx` 와 같은 병을 겪었다** (#84 · 2026-09-12).
     *
     *    처음엔 «기본은 안 싣는다»로 `= order` 를 달았다. 그랬더니 **위임자(`ScrapParser`)가
     *    이 메서드를 안 넘기는 것을 컴파일러가 못 잡았고**, 인성 파서가 멀쩡히 판정하는데도
     *    `verdict` 가 **77건 내리 `null`** 로 나갔다. 화면에는 「앱이 판정을 안 실었다」로만
     *    보여서 어디가 끊겼는지 알 수 없었다 — **fail-open 은 조용하다.**
     *
     *    `alarmBandHalfPx` 가 기본값 `0` 때문에 픽커 테두리를 반 토막 냈을 때(#84)
     *    **«기본값을 없애 컴파일러가 누락을 잡는다»** 로 끝냈는데, 여기서 같은 편의를 또 썼다.
     *    🔴 **같은 병이 두 번이면 인스턴스가 아니라 그 클래스를 없앤다** (루트 CLAUDE.md).
     *    그래서 기본값을 지운다 — 안 싣는 파서도 **제 손으로 «안 싣는다»고 적는다.**
     */
    fun withVerdict(order: SimplifiedOfficeOrder, tally: FilterTally? = null): SimplifiedOfficeOrder

    /**
     * rawText에서 상차지 직선거리(숫자)만 파싱합니다.
     */
    fun parsePickupDistance(rawText: String): Double?

    /**
     * 상세 화면에서 추출된 텍스트 목록과 최근 리스트 오더 목록을 대조하여
     * 원본 리스트 오더를 매칭합니다. 매칭 실패 시 null을 반환합니다.
     */
    fun matchDetailOrder(screenTexts: List<String>, recentOrders: List<SimplifiedOfficeOrder>): SimplifiedOfficeOrder?

    /**
     * 리스트 화면의 전체 텍스트 노드들을 콜(Card/Row) 단위로 묶어줍니다.
     * @return 요금 노드(클릭 대상)와 해당 콜을 구성하는 전체 텍스트들의 리스트 쌍(Pair)
     */
    fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>>

    /**
     * 🔔 알람 테두리가 요금 닻 중심에서 위아래로 몇 px 을 더 둘러야 **카드 전체**인가.
     * 0 이면 닻 줄만 두른다 (인성 — 요금 줄이 곧 카드 한 줄). 픽커는 요금이 태그줄과
     * 지역줄 **사이**에 껴 있어서 띠 반높이(±60)를 알려줘야 카드가 다 들어온다 (#83).
     *
     * 🔴 **기본값을 주지 않는다** (#84). 처음에 `= 0` 을 줬더니 위임자(ScrapParser)가
     *    위임을 빠뜨려도 컴파일이 되어 — 판정은 픽커, 띠는 기본값 0 — 테두리가 반 토막
     *    났다. 기본값 없는 추상 메서드면 위임 누락을 **컴파일러가** 잡는다.
     *    앞으로 이 인터페이스에 메서드를 더할 때도 기본값을 주지 말 것 — 같은 병이 재발한다.
     */
    fun alarmBandHalfPx(): Int
}
