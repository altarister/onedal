package com.onedal.app.core

import android.content.Context
import android.os.Build

/**
 * 앱 버전 정보를 PackageManager에서 **런타임에** 조회합니다.
 *
 * ⚠️ BuildConfig.VERSION_NAME 을 쓰면 안 되는 이유 (2026-08-09 실제 발생):
 * BuildConfig.VERSION_NAME 은 `static final String` 컴파일 타임 상수라
 * Kotlin 컴파일러가 **호출부에 값을 그대로 인라인**합니다.
 * build.gradle.kts 의 versionName 만 바꾸고 호출부 소스는 그대로 두면
 * compileDebugKotlin 이 up-to-date 로 판정되어 재컴파일하지 않고,
 * 결과적으로 APK 안에 옛 버전 문자열이 남습니다.
 * (실제로 DEX 안에 신·구 버전 문자열이 동시에 존재했고,
 *  화면에는 옛 버전이, adb dumpsys 에는 새 버전이 표시되어 혼동을 일으켰습니다)
 *
 * PackageManager 는 설치된 APK 의 매니페스트를 읽으므로
 * `adb shell dumpsys package` 결과와 **항상 일치**합니다.
 */
object AppInfo {

    /** 예: "v1.2-capacity+logdiet (build 3)" */
    fun versionLabel(context: Context): String {
        return try {
            val pi = context.packageManager.getPackageInfo(context.packageName, 0)
            val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pi.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                pi.versionCode.toLong()
            }
            "v${pi.versionName} (build $code)"
        } catch (e: Exception) {
            "v?(조회 실패)"
        }
    }
}
