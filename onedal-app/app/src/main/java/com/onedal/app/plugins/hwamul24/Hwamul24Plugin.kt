package com.onedal.app.plugins.hwamul24

import android.content.Context
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.core.TargetApp
import com.onedal.app.models.FilterConfig
import com.onedal.app.plugins.IDispatchAppPlugin

/**
 * 📦 **화물24시 플러그인 구현체**
 *
 * 화물24시 배차망의 고유 동작을 캡슐화한다:
 * - 잡기 수순(자동 배차 시도) 지원 (`supportsCatching = true`)
 * - OCR 대신 접근성 텍스트 트리 직접 수집 (`ocrParser = null`)
 * - 안전취소 시간: `filter.safeCancelSecHwamul24 * 1000L`
 * - 패키지 키워드: logione, carrier
 */
class Hwamul24Plugin(private val context: Context? = null) : IDispatchAppPlugin {

    override val code: String = TargetApp.HWAMUL24
    override val label: String = "24시"
    override val packageKeywords: List<String> = listOf("logione", "carrier")
    override val keywords: ScreenKeywords = Hwamul24Keywords.TWENTYFOUR
    override val parser: IScrapParser by lazy {
        Hwamul24Parser(context ?: throw IllegalStateException("Hwamul24Parser requires non-null Context"))
    }

    override val supportsCatching: Boolean = true

    override val ocrParser: ScreenOcrParser<*>? = null

    override fun getSafeCancelMs(filter: FilterConfig): Long =
        filter.safeCancelSecHwamul24 * 1000L
}
