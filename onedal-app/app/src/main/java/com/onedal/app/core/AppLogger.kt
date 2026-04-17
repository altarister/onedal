package com.onedal.app.core

import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object AppLogger {
    // 💡 나중에 필요하시면 이 값을 false로 바꾸면 스팸 데이터 로그(v)가 한방에 사라집니다!
    private const val SHOW_VERBOSE_LOGS = true 

    /**
     * 기본 디버그 로그 (Log.d 대체용)
     */
    fun d(tag: String, message: String) {
        Log.d(tag, message)
    }

    /**
     * 정보성 로그 (Log.i 대체용)
     */
    fun i(tag: String, message: String) {
        Log.i(tag, message)
    }

    /**
     * 경고 로그 (Log.w 대체용)
     */
    fun w(tag: String, message: String) {
        Log.w(tag, message)
    }

    /**
     * 에러 로그 (Log.e 대체용)
     */
    fun e(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
    }

    /**
     * 매우 많은 양의 스팸성 텍스트 덤프 출력용 (Log.v 대체용)
     * 현재는 요청하신 대로 '모두 표기(true)'로 세팅되어 있습니다.
     */
    fun v(tag: String, message: String) {
        if (SHOW_VERBOSE_LOGS) {
            Log.v(tag, message)
        }
    }

    /**
     * 1DAL 생명주기(ROADMAP) 전용 특수 로그
     */
    fun roadmap(message: String, pageName: String = "") {
        val ts = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault()).format(Date())
        val pageStr = if (pageName.isNotEmpty()) " [$pageName]" else ""
        // ROADMAP 로그는 주로 1DAL_MVP 태그로 통일하여 사용합니다.
        Log.d("1DAL_MVP", "🚦 [ROADMAP $ts] [📱앱]$pageStr $message")
    }
}
