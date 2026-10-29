package com.onedal.app.plugins.isflex

import android.content.Context
import com.onedal.app.core.IScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.ScreenOcrParser
import com.onedal.app.core.TargetApp
import com.onedal.app.models.FilterConfig
import com.onedal.app.plugins.IDispatchAppPlugin

/**
 * 🟣 **인성플렉스 플러그인 — 정의 표만 읽는 최소 꼴**
 *
 * - 모드 · 패키지 글자 · 페이지 · 배차망 표식은 배차망 정의 표(`IsflexPages`)에서 온다
 * - 계약 단추(«…원 수행하기»)를 누르지 않는다 (`acceptButtons = null`)
 * - 사진 판독기 없음 — 접근성 글자를 읽는다 (`ocrParser = null`)
 * - 파서(`IsflexParser`)는 빈 껍데기라 아무 콜도 읽지 않고 누르지 않는다
 */
class IsflexPlugin(@Suppress("unused") private val context: Context? = null) : IDispatchAppPlugin {

    override val code: String = TargetApp.ISFLEX
    override val label: String = "플렉스"
    override val packageKeywords: List<String> get() = IsflexPages.packageKeywords
    override val keywords: ScreenKeywords = IsflexKeywords.FLEX
    override val networkMarkers: List<List<String>> get() = IsflexPages.networkMarkers
    override val parser: IScrapParser = IsflexParser()

    override val availableModes: Set<String> get() = IsflexPages.modes

    /** 📄 페이지 정의 — `IsflexPages` */
    override val pages get() = IsflexPages.pages
    override val screens get() = IsflexPages.screens

    override val acceptButtons: List<String>? = null

    override val ocrParser: ScreenOcrParser<*>? = null

    /** ⏱️ 어느 설정 칸인지는 배차망 정의 표(`IsflexPages.safeCancelSecKey` · `detailBackSecKey`) */
    override fun getSafeCancelMs(filter: FilterConfig): Long? = filter.secOf(IsflexPages.safeCancelSecKey)?.times(1000L)

    override fun getDetailBackTimeoutMs(filter: FilterConfig): Long? = filter.secOf(IsflexPages.detailBackSecKey)?.times(1000L)
}
