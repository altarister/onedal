package com.onedal.app.core

import com.onedal.app.models.FilterTally
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 화면에서 추출된 원시 문자열을 파싱하여 오더 객체로 변환하고,
 * 4대 필터 조건 판정을 수행하는 인터페이스입니다.
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
     * rawText에서 상차지 직선거리(숫자)만 파싱합니다.
     */
    fun parsePickupDistance(rawText: String): Double?

    /**
     * 리스트 화면의 전체 텍스트 노드들을 콜(Card/Row) 단위로 묶어줍니다.
     * @return 요금 노드(클릭 대상)와 해당 콜을 구성하는 전체 텍스트들의 리스트 쌍(Pair)
     */
    fun groupListNodes(allNodes: List<ScreenTextNode>): List<Pair<ScreenTextNode, List<String>>>
}
