package com.onedal.app.core

import android.content.Context
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * 📝 **앱이 자기 로그를 파일로 남긴다**.
 *
 * 🔴 **왜 있어야 하나 — logcat 은 우리 로그를 세 시간도 못 지킨다.**
 *    삼성은 버퍼를 5MiB 로 묶어 두고 `logd` 가 말 많은 UID 를 골라 버린다.
 *    그러면 몇 시간 전 앱 로그가 한 줄도 안 남아, 오배차 조사 때 «무슨 콜을 눌렀나»를 못 짚는다.
 *    나가기 전에 로그를 비우고 가도 같은 일이 난다 — 앱이 제 파일을 쓰는 수밖에 없다.
 *
 * 📂 **자리**: `/sdcard/Android/data/com.onedal.app/files/logs/1dal-YYYY-MM-DD.log`
 *    앱 전용 외부 저장소라 **권한이 필요 없고**, 루팅 없이 `adb pull` 로 그대로 가져온다.
 *    앱을 지우면 함께 지워진다.
 *
 * 🔴 **로그가 앱을 느리게 만들면 안 된다** — 쓰기는 전부 **한 줄짜리 배경 스레드**로
 *    미룬다. 부르는 쪽은 큐에 넣고 바로 돌아온다. 스캔은 초당 여러 번 돈다.
 *
 * ⚠️ **`v`(스팸 덤프)는 파일에 안 쓴다** — 화면 글자를 통째로 찍는 로그라 하루면 기가로 간다.
 *    파일이 커져서 스스로 지워지면 지금 문제와 똑같아진다.
 */
object LogFileSink {

    /** 며칠치를 남기나 — 필드 테스트가 2일에 한 번이라 그 사이 판을 다 덮는다 */
    private const val KEEP_DAYS = 5

    /** 하루 파일이 이보다 커지면 더 안 쓴다 — 저장소를 채워 폰을 망가뜨리지 않는다 */
    private const val MAX_BYTES_PER_DAY = 64L * 1024 * 1024

    private val writer = Executors.newSingleThreadExecutor { r ->
        Thread(r, "1dal-log").apply { isDaemon = true; priority = Thread.MIN_PRIORITY }
    }

    private val dayFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    private val timeFormat = SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US)

    @Volatile private var dir: File? = null
    @Volatile private var openDay: String? = null
    @Volatile private var openFile: File? = null
    @Volatile private var wroteBytes = 0L
    @Volatile private var capped = false

    /** 지금 쓰고 있는 파일 — 화면에 «어디에 쌓이나»를 보여줄 때 쓴다. 안 붙었으면 null */
    val currentPath: String? get() = openFile?.absolutePath

    /**
     * 🚀 파일 갈래를 연다. 서비스가 붙을 때 한 번 부른다 — 두 번 불러도 탈이 없다.
     * 실패해도 **앱은 그대로 돈다** (로그가 앱을 죽이지 않는다).
     */
    fun attach(context: Context) {
        try {
            val base = context.getExternalFilesDir(null) ?: context.filesDir
            val d = File(base, "logs")
            if (!d.exists() && !d.mkdirs()) return
            dir = d
            writer.execute { pruneOldFiles(d) }
        } catch (_: Throwable) {
            // 저장소를 못 쓰는 폰이라도 logcat 은 그대로 나간다
        }
    }

    /** ✍️ 한 줄 쌓는다 — 부르는 쪽은 기다리지 않는다 */
    fun write(level: String, tag: String, message: String) {
        val d = dir ?: return
        val now = Date()
        writer.execute {
            try {
                val day = dayFormat.format(now)
                if (day != openDay) roll(d, day)
                if (capped) return@execute
                val f = openFile ?: return@execute
                val line = "${timeFormat.format(now)} $level/$tag: $message\n"
                FileWriter(f, true).use { it.write(line) }
                wroteBytes += line.length
                if (wroteBytes >= MAX_BYTES_PER_DAY) {
                    capped = true
                    FileWriter(f, true).use {
                        it.write("${timeFormat.format(Date())} W/1DAL_LOG: 🛑 오늘 파일이 상한(64MB)에 닿았다 — 더 쓰지 않는다\n")
                    }
                }
            } catch (_: Throwable) {
                // 한 줄 못 썼다고 앱을 멈추지 않는다
            }
        }
    }

    /** 날짜가 바뀌면 새 파일로 넘어가고 묵은 것을 치운다 */
    private fun roll(d: File, day: String) {
        openDay = day
        openFile = File(d, "1dal-$day.log")
        wroteBytes = openFile?.length() ?: 0L
        capped = wroteBytes >= MAX_BYTES_PER_DAY
        pruneOldFiles(d)
    }

    /**
     * 🧹 **지울 것을 고른다 — 순수 함수라 검사가 그대로 문다.**
     *
     * 이름이 `1dal-YYYY-MM-DD.log` 라 **이름순이 곧 시간순**이다. 새것 `keep` 개를 남긴다.
     * 🔴 우리 것이 아닌 파일은 **손대지 않는다** — 같은 폴더에 남이 둔 것이 있을 수 있고,
     *    조용히 지우는 것이 이 조사에서 가장 아팠던 실수다.
     */
    fun expiredNames(names: List<String>, keep: Int = KEEP_DAYS): List<String> =
        names.filter { it.startsWith("1dal-") && it.endsWith(".log") }
            .sortedDescending()
            .drop(keep)

    private fun pruneOldFiles(d: File) {
        try {
            val files = d.listFiles() ?: return
            val doomed = expiredNames(files.map { it.name }).toSet()
            files.filter { it.name in doomed }.forEach { it.delete() }
        } catch (_: Throwable) {
        }
    }

    /** 검사·종료용 — 큐가 빌 때까지 기다린다 */
    fun flushBlocking(timeoutMs: Long = 2_000L) {
        try {
            val done = java.util.concurrent.CountDownLatch(1)
            writer.execute { done.countDown() }
            done.await(timeoutMs, TimeUnit.MILLISECONDS)
        } catch (_: Throwable) {
        }
    }
}
