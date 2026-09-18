package com.onedal.app.plugins

import android.content.Context
import com.onedal.app.core.TargetApp
import com.onedal.app.plugins.hwamul24.Hwamul24Plugin
import com.onedal.app.plugins.insung.InsungPlugin
import com.onedal.app.plugins.kakaopicker.KakaoPickerPlugin

/**
 * 🏛️ **배차망 플러그인 레지스트리**
 *
 * 배차망 코드(code)나 패키지명(pkg)으로 등록된 배차망 플러그인을 O(1)로 조회한다.
 * 새로운 배차망이 추가되면 여기에 한 줄 등록하는 것으로 전체 엔진이 연동된다.
 */
object DispatchPluginRegistry {

    private val plugins = mutableMapOf<String, IDispatchAppPlugin>()
    private var initialized = false

    init {
        // 기본 플러그인 등록 (JVM 테스트 및 정적 참조용)
        register(KakaoPickerPlugin())
        register(InsungPlugin())
        register(Hwamul24Plugin())
    }

    fun init(context: Context) {
        if (initialized) return
        register(KakaoPickerPlugin(context))
        register(InsungPlugin(context))
        register(Hwamul24Plugin(context))
        initialized = true
    }

    fun register(plugin: IDispatchAppPlugin) {
        plugins[plugin.code] = plugin
    }

    fun get(code: String): IDispatchAppPlugin {
        return plugins[code] ?: plugins[TargetApp.INSUNG] ?: throw IllegalStateException("기본 플러그인(인성) 미등록")
    }

    fun findByLabel(label: String?): IDispatchAppPlugin {
        return plugins.values.firstOrNull { it.label == label } ?: get(TargetApp.INSUNG)
    }

    fun findByPackage(pkg: String?): IDispatchAppPlugin? {
        if (pkg == null) return null
        val lowerPkg = pkg.lowercase()
        return plugins.values.firstOrNull { it.isTargetPackage(lowerPkg) }
    }

    /** 현재 등록된 모든 플러그인 */
    fun all(): Collection<IDispatchAppPlugin> = plugins.values
}
