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

    /** 🎛️ 픽커에는 자동 모드가 없다 — 수락이 곧 계약이고 되돌릴 수 없어 앱이 수락하기를 누르지 않는다 (기사님 확정) */
    override val availableModes: Set<String> = TargetApp.ALL_MODES - "AUTO"

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

    /**
     * 👆 **픽커 목록에서 누르기 전 안전 확인** — 머리줄 위의 요금은 오더카드다, 누르면 그 자리에서 계약이다.
     *
     * `clickSafe` 는 요금 중심 **±60픽셀** 안의 글자만 보는데, 오더카드의 「수락」은 요금 **약 70픽셀 아래**라
     * 띠 밖이다. 그래서 **「리스트 설정」 머리줄보다 아래인가**를 함께 보고(`isListCardAnchor`),
     * 머리줄을 못 읽은 판은 손대지 않는다(규칙 ④). 누르기 바로 전에 요금 칸과 머리줄을 **다시 잰다**
     * (`stillListCardAtTap`). 요금 자리(오른쪽 아래)는 상세의 «수락하기»와 같은 자리라 **줄 왼쪽 끝**을
     * 자국 1초 뒤에 누른다(`TapShift`). 안 누른 것도 까닭을 남긴다 — 로그의 침묵이 조사를 가장 늦춘다.
     */
    override fun planListTap(
        allNodes: List<com.onedal.app.core.ScreenTextNode>,
        order: com.onedal.app.models.SimplifiedOfficeOrder,
        fareNode: com.onedal.app.core.ScreenTextNode,
    ): com.onedal.app.plugins.ListTap? {
        val listHeaderY = KakaoPickerParser.listHeaderCenterY(allNodes.map { it.text to it.rect.centerY() })
        val onListCard = KakaoPickerParser.isListCardAnchor(fareNode.rect.centerY(), listHeaderY)
        val anchor = "닻(${fareNode.rect.centerX()},${fareNode.rect.centerY()}) 머리줄 Y=$listHeaderY"
        if (!onListCard || !KakaoPickerParser.clickSafe(order.rawText)) {
            val why = if (!onListCard) "머리줄 아래가 아니다 (오더카드이거나 머리줄을 못 읽었다)" else "카드에 「수락」이 보인다"
            com.onedal.app.core.AppLogger.w("1DAL_ALARM", "🛑 [상세 진입 보류] ${order.fare}원 $anchor — $why · 손대지 않는다")
            return null
        }
        val headerNode = allNodes.firstOrNull { KakaoPickerParser.isListHeaderText(it.text) }?.node
        val refreshedY = { n: android.view.accessibility.AccessibilityNodeInfo? ->
            n?.takeIf { it.refresh() }?.let { val r = android.graphics.Rect(); it.getBoundsInScreen(r); r.centerY() }
        }
        val fareY = refreshedY(fareNode.node)
        val headerY = refreshedY(headerNode)
        if (!KakaoPickerParser.stillListCardAtTap(fareY, headerY)) {
            com.onedal.app.core.AppLogger.w("1DAL_ALARM", "🛑 [상세 진입 보류] ${order.fare}원 — 찍기 직전 다시 재니 머리줄 아래가 아니다 " +
                "(요금 Y=$fareY · 머리줄 Y=$headerY · 스캔 때 $anchor) · 손대지 않는다")
            return null
        }
        return com.onedal.app.plugins.ListTap(rowLeft = true, delayMs = com.onedal.app.core.TapShift.PREVIEW_MS)
    }
}
