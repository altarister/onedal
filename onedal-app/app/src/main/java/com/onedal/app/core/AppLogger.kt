package com.onedal.app.core

import android.content.Context
import android.util.Log
import com.onedal.app.BuildConfig
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object AppLogger {
    /**
     * 📝 **여기가 길목이다** — 앱의 로그 198곳이 전부 이 객체를 지난다.
     *    그래서 파일 갈래도 여기 하나에만 낸다 (규칙 ③ — 파생은 한 곳에서).
     *    `v`(스팸 덤프)만 뺀다: 화면 글자를 통째로 찍는 로그라 파일이 하루면 기가로 간다.
     */
    fun attachFile(context: Context) = LogFileSink.attach(context)

    /** 지금 쌓이는 파일 자리 — 안 붙었으면 null */
    val filePath: String? get() = LogFileSink.currentPath
    // [Phase 3 / 이슈 A2] 디버그 빌드에서만 스팸성 v 로그를 남긴다.
    // release APK에서는 자동으로 꺼져 배터리·성능 손해가 없다.
    // (디버그 중에도 조용히 보고 싶으면 이 값을 false로 고정하면 된다)
    private val SHOW_VERBOSE_LOGS = BuildConfig.DEBUG

    /**
     * 🏷️ **태그를 말머리 맨 앞에** (reviews/22 2단계) — `#누름 👉 …`. 태그는 logcat 과 파일에 함께 찍힌다.
     * 태그 없이 찍으면 logcat 은 원문 그대로, 파일에는 `#없음`(경고·오류는 `#경고`)이 붙는다 — 서버 `fileLogger` 와 같은 방식.
     * 로그를 읽는 도구(채점기 · appLoop)는 줄 안의 글자를 `.*` 로 찾으므로 맨 앞 한 토막이 늘어도 그대로 읽힌다.
     */
    fun tagged(logTag: LogTag, message: String): String = "#${logTag.word} $message"

    /** 파일에 쓰는 말머리 — 태그가 있으면 그것, 없으면 경고·오류는 «경고», 나머지는 «없음» */
    fun fileLine(level: String, logTag: LogTag?, message: String): String = when {
        logTag != null -> tagged(logTag, message)
        level == "W" || level == "E" -> tagged(LogTag.WARN, message)
        else -> "#${LogTag.NO_TAG} $message"
    }

    /** 기본 디버그 로그 (Log.d 대체용) */
    fun d(tag: String, message: String) {
        Log.d(tag, message)
        LogFileSink.write("D", tag, fileLine("D", null, message))
    }
    fun d(tag: String, logTag: LogTag, message: String) {
        Log.d(tag, tagged(logTag, message))
        LogFileSink.write("D", tag, fileLine("D", logTag, message))
    }

    /** 정보성 로그 (Log.i 대체용) */
    fun i(tag: String, message: String) {
        Log.i(tag, message)
        LogFileSink.write("I", tag, fileLine("I", null, message))
    }
    fun i(tag: String, logTag: LogTag, message: String) {
        Log.i(tag, tagged(logTag, message))
        LogFileSink.write("I", tag, fileLine("I", logTag, message))
    }

    /** 경고 로그 (Log.w 대체용) — 태그를 안 주면 파일에 «#경고» */
    fun w(tag: String, message: String) {
        Log.w(tag, message)
        LogFileSink.write("W", tag, fileLine("W", null, message))
    }
    fun w(tag: String, logTag: LogTag, message: String) {
        Log.w(tag, tagged(logTag, message))
        LogFileSink.write("W", tag, fileLine("W", logTag, message))
    }

    /** 에러 로그 (Log.e 대체용) — 태그를 안 주면 파일에 «#경고» */
    fun e(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, message)
        }
        LogFileSink.write("E", tag, fileLine("E", null, if (throwable != null) "$message · ${throwable}" else message))
    }
    fun e(tag: String, logTag: LogTag, message: String) {
        Log.e(tag, tagged(logTag, message))
        LogFileSink.write("E", tag, fileLine("E", logTag, message))
    }

    /** 매우 많은 양의 스팸성 텍스트 덤프 출력용 (Log.v 대체용) */
    fun v(tag: String, message: String) {
        if (SHOW_VERBOSE_LOGS) {
            Log.v(tag, message)
        }
    }

    /** 1DAL 생명주기(ROADMAP) 전용 특수 로그 */
    fun roadmap(message: String, pageName: String = "") = roadmapLine(null, message, pageName)
    fun roadmap(logTag: LogTag, message: String, pageName: String = "") = roadmapLine(logTag, message, pageName)

    private fun roadmapLine(logTag: LogTag?, message: String, pageName: String) {
        val ts = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault()).format(Date())
        val pageStr = if (pageName.isNotEmpty()) " [$pageName]" else ""
        // ROADMAP 로그는 주로 1DAL_MVP 태그로 통일하여 사용합니다.
        val line = "🚦 [ROADMAP $ts] [📱앱]$pageStr $message"
        Log.d("1DAL_MVP", if (logTag != null) tagged(logTag, line) else line)
        LogFileSink.write("D", "1DAL_MVP", fileLine("D", logTag, line))
    }
}
