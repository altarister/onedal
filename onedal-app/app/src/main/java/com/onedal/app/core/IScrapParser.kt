package com.onedal.app.core

import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 화면에서 추출된 원시 문자열을 파싱하여 오더 객체로 변환하고,
 * 4대 필터 조건 판정을 수행하는 인터페이스입니다.
 *
 * 구현체:
 *   - NativeScrapParser: 진짜 배차 앱 (인성콜, 24시 등) 전용
 *   - MockWebScrapParser: 웹뷰 가짜 콜 테스트 전용 (사금 채취식 정규식)
 */
interface IScrapParser {

    /** 텍스트 리스트를 파싱하여 SimplifiedOfficeOrder 객체로 변환 */
    fun parse(texts: List<String>): SimplifiedOfficeOrder

    /** 파싱된 오더가 4대 필터 조건을 모두 만족하는지 판정 */
    fun shouldClick(order: SimplifiedOfficeOrder): Boolean

    /** rawText에서 상차지 직선거리를 파싱 */
    fun parsePickupDistance(rawText: String): Double?
}
