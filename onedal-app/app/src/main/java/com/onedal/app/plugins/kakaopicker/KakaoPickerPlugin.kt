package com.onedal.app.plugins.kakaopicker

import android.content.Context
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.core.TargetApp
import com.onedal.app.models.FilterConfig
import com.onedal.app.plugins.IDispatchAppPlugin

/**
 * 📦 **카카오 T 픽커 플러그인 구현체**
 *
 * 카카오픽커 배차망의 고유 동작을 캡슐화한다:
 * - 수집·알람 전용 (잡기 수순 미지원: `supportsCatching = false`)
 * - 텍스트 트리에 배송지 주소가 없으므로 상단 스냅샷 OCR 파서(`PickerDetailOcrParser`) 탑재
 * - 수락 시 즉시 계약이 체결되므로 안전취소가 없음 (`getSafeCancelMs = null`)
 * - 상세 머묾 타이머: `filter.pickerAlarmDetailSec * 1000L`
 */
class KakaoPickerPlugin(private val context: Context? = null) : IDispatchAppPlugin {

    override val code: String = TargetApp.KAKAOPICKER
    override val label: String = "픽커"
    override val packageKeywords: List<String> = listOf("flexer")
    override val keywords: ScreenKeywords = KakaoPickerKeywords.PICKER
    override val networkMarkers: List<List<String>> = KakaoPickerKeywords.NETWORK_MARKERS
    override val parser: IScrapParser by lazy { KakaoPickerParser(context) }

    override val supportsCatching: Boolean = false

    override val ocrParser: ScreenOcrParser<*> = PickerDetailOcrParser()

    override fun getSafeCancelMs(filter: FilterConfig): Long? = null

    override fun getDetailBackTimeoutMs(filter: FilterConfig): Long =
        filter.pickerAlarmDetailSec * 1000L

    override fun resolveScreenContext(
        text: String,
        defaultContext: com.onedal.app.models.ScreenContext
    ): com.onedal.app.models.ScreenContext =
        KakaoPickerKeywords.pickerScreenContextOf(text) ?: defaultContext
}
