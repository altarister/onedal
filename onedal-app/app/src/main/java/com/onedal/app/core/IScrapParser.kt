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
     * 👁️ `tally` 를 주면 **축별 탈락 수를 채워 준다** (기사님 확정).
     *    한 콜은 **첫 번째로 걸린 축에만** 센다 — 다 세면 합이 본 수를 넘어
     *    *"이 축을 풀면 몇 개가 들어오나"* 를 못 읽는다.
     *    🔴 파서가 결과를 들고 있지 않는다. **호출자가 그릇을 만들어 넘긴다** —
     *       파서 안에 두면 언제 갱신되는지가 호출 순서에 달린다 (숨은 상태).
     */
    fun shouldClick(order: SimplifiedOfficeOrder, tally: FilterTally? = null): Boolean

    /**
     * 🗳️ **판정을 콜에 실어 돌려준다**.
     *
     * 현황판이 앱 판정식을 TS 로 옮겨 적으면 사본이 갈라진다 (앱은 요율 모델이 서면 `minFare` 를
     * 안 보는데 사본이 그것만 보면 **가짜 «통과»**). 그래서 판정 값을 콜에 실어 보낸다.
     *
     * 🔴 **기본 구현을 두지 않는다** — 기본값(`= order`)이 있으면 위임자(`ScrapParser`)가 이 메서드를
     *    안 넘겨도 컴파일러가 못 잡고, `verdict` 가 조용히 `null` 로 나간다 (**fail-open 은 조용하다**).
     *    `alarmBandHalfPx` 도 같은 까닭으로 기본값이 없다 (#84). 안 싣는 파서도 **제 손으로 «안 싣는다»고 적는다.**
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
     * 🔴 **기본값 없는 추상 메서드다** (#84) — 기본값이 있으면 위임자(ScrapParser)가 위임을 빠뜨려도
     *    컴파일이 되어, 판정은 픽커인데 띠는 기본값 0 이 되어 테두리가 반 토막 난다.
     *    이 인터페이스에 메서드를 더할 때도 기본값 없이 더해 위임 누락을 **컴파일러가** 잡게 한다.
     */
    fun alarmBandHalfPx(): Int
}
