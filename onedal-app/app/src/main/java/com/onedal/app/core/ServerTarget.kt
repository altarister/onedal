package com.onedal.app.core

import android.content.SharedPreferences
import com.onedal.app.BuildConfig

/**
 * 🌐 **실서버를 보나 — 한 곳** (`ReleaseBuildTest`). 폰 저장값이 있으면 그것, 없으면 빌드 기본값:
 * 개발판(debug)은 로컬 PC · 배포판(release)은 실서버(1dal.altari.com). 딸 폰에 깐 배포판이 처음부터 실서버를 본다.
 */
object ServerTarget {
    fun isLive(prefs: SharedPreferences): Boolean = prefs.getBoolean("isLiveMode", BuildConfig.LIVE_DEFAULT)
}
