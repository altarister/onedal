package com.onedal.app.core

import android.content.Context
import com.onedal.app.core.AppLogger
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 파서 팩토리 겸 위임자(Delegator).
 *
 * HijackService 등 기존 코드에서 `ScrapParser(context)`로 생성하던 방식을
 * 건드리지 않고, 내부적으로 올바른 파서 구현체에 위임합니다.
 *
 * 기본값: NativeScrapParser (진짜 배차 앱용)
 * 테스트: MockWebScrapParser (웹뷰 가짜 콜용)
 */
class ScrapParser(private val context: Context) : IScrapParser {

    companion object {
        private const val TAG = "1DAL_PARSER"
    }

    // 기본값은 네이티브 파서. switchToMock() / switchToNative() 로 교체 가능.
    private var delegate: IScrapParser = NativeScrapParser(context)

    /** 웹뷰 테스트 모드로 전환 */
    fun switchToMock() {
        AppLogger.i(TAG, "🧪 파서 전환: MockWebScrapParser (테스트 모드)")
        delegate = MockWebScrapParser(context)
    }

    /** 네이티브 앱 모드로 복귀 */
    fun switchToNative() {
        AppLogger.i(TAG, "🏭 파서 전환: NativeScrapParser (프로덕션 모드)")
        delegate = NativeScrapParser(context)
    }

    /** 현재 어떤 파서를 쓰고 있는지 확인 */
    fun currentParserName(): String = delegate::class.simpleName ?: "Unknown"

    override fun parse(texts: List<String>): SimplifiedOfficeOrder = delegate.parse(texts)
    override fun shouldClick(order: SimplifiedOfficeOrder): Boolean = delegate.shouldClick(order)
    override fun parsePickupDistance(rawText: String): Double? = delegate.parsePickupDistance(rawText)
}
