package com.onedal.app.plugins

import android.content.Context
import com.onedal.app.core.TargetApp
import com.onedal.app.plugins.hwamul24.Hwamul24Plugin
import com.onedal.app.plugins.insung.InsungPlugin
import com.onedal.app.plugins.kakaopicker.KakaoPickerPlugin

/**
 * 🏛️ **배차망 플러그인 레지스트리**
 *
 * 배차망 코드(code)나 라벨(label)로 등록된 배차망 플러그인을 O(1)로 조회한다.
 * 새로운 배차망이 추가되면 여기에 등록하는 것으로 전체 엔진이 연동된다.
 */
object DispatchPluginRegistry {

    private val plugins = mutableMapOf<String, IDispatchAppPlugin>()
    private var hasContext = false

    /**
     * 📱 안드로이드 런타임 초기화 — 서비스 생명주기(`onServiceConnected`)에서 실제 Context와 함께 1회 등록한다.
     */
    fun init(context: Context) {
        register(KakaoPickerPlugin(context))
        register(InsungPlugin(context))
        register(Hwamul24Plugin(context))
        hasContext = true
    }

    /**
     * 🧪 JVM 로컬 테스트 초기화 — Context가 없는 환경에서 메타데이터/키워드 검증용으로 등록한다.
     */
    fun initForTest() {
        if (hasContext) return
        register(KakaoPickerPlugin(null))
        register(InsungPlugin(null))
        register(Hwamul24Plugin(null))
    }

    fun register(plugin: IDispatchAppPlugin) {
        plugins[plugin.code] = plugin
    }

    fun get(code: String): IDispatchAppPlugin {
        if (plugins.isEmpty()) {
            initForTest()
        }
        return plugins[code] ?: plugins[TargetApp.INSUNG] ?: throw IllegalStateException("기본 플러그인(인성) 미등록")
    }

    fun findByLabel(label: String?): IDispatchAppPlugin {
        if (plugins.isEmpty()) {
            initForTest()
        }
        return plugins.values.firstOrNull { it.label == label } ?: get(TargetApp.INSUNG)
    }

    /** 현재 등록된 모든 플러그인 */
    fun all(): Collection<IDispatchAppPlugin> {
        if (plugins.isEmpty()) {
            initForTest()
        }
        return plugins.values
    }
}
