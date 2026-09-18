package com.onedal.app.core

import android.graphics.Bitmap

/** OCR 한 줄 — `y` 는 위에서부터의 자리(위가 작다). 엔진이 무엇이든 이 둘만 주면 된다 */
data class OcrLine(val y: Int, val text: String)

/**
 * 📷 **배차망별 화면 OCR 자르기 및 줄 해석 위임 규격**
 *
 * ScreenReader는 접근성 스크린샷 캡처와 ML Kit 텍스트 인식만 수행하고,
 * "어느 영역을 자를지(crop)"와 "추출된 줄들(lines)을 어떻게 해석할지(parse)"는
 * 각 배차망의 ScreenOcrParser 구현체에 위임합니다.
 */
interface ScreenOcrParser<T> {

    /**
     * 1. 화면 비트맵에서 OCR을 수행할 관심 영역을 자른다.
     *    기본값: 원본 전체 화면 유지
     */
    fun crop(screen: Bitmap): Bitmap = screen

    /**
     * 2. ML Kit가 추출한 텍스트 라인들을 배차망 도메인 객체로 해석한다.
     *    파싱 실패 시 null 반환
     */
    fun parse(lines: List<OcrLine>): T?
}
