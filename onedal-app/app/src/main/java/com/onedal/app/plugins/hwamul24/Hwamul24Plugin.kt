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
 * - 자동 모드에서 앱이 확정을 누른다 (`acceptButtons` = 확정 버튼 글자)
 * - OCR 대신 접근성 텍스트 트리 직접 수집 (`ocrParser = null`)
 * - 안전취소 시간: `filter.safeCancelSecHwamul24 * 1000L`
 * - 패키지 키워드: logione, carrier
 */
class Hwamul24Plugin(private val context: Context? = null) : IDispatchAppPlugin {

    override val code: String = TargetApp.HWAMUL24
    override val label: String = "24시"
    override val packageKeywords: List<String> = listOf("logione", "carrier")
    override val keywords: ScreenKeywords = Hwamul24Keywords.TWENTYFOUR
    override val networkMarkers: List<List<String>> get() = Hwamul24Pages.networkMarkers
    override val parser: IScrapParser by lazy {
        Hwamul24Parser(context ?: throw IllegalStateException("Hwamul24Parser requires non-null Context"))
    }

    override val availableModes: Set<String> = TargetApp.ALL_MODES

    /** 📄 페이지 정의 — `Hwamul24Pages` (reviews/24) */
    override val pages get() = Hwamul24Pages.pages
    override val screens get() = Hwamul24Pages.screens

    /**
     * ✍️ **배차신청 버튼 글자 — «배차신청» 하나** (기사님 «가»). 실물 잡기 전 상세(캡처 18 · 51) 바닥 버튼은 «배차신청 · 돌아가기»다.
     * 🔴 둘째 글자를 두지 않는다 — «배차신청»이 안 보이는 순간 «전화걸기»를 눌러 화주에게 전화가 걸릴 수 있었다. 못 찾으면 «버튼 못 찾음» 길(누르지 않고 빠져나옴).
     */
    override val acceptButtons: List<String>? = listOf("배차신청")

    override val ocrParser: ScreenOcrParser<*>? = null

    override fun getSafeCancelMs(filter: FilterConfig): Long =
        filter.safeCancelSecHwamul24 * 1000L
}
