package com.onedal.app.core

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.os.Build
import android.os.SystemClock
import android.view.Display
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import java.util.concurrent.Executors

/**
 * 📷 **범용 화면 스냅샷 OCR 판독기** — 접근성 스크린샷(API 30↑) → 배차망 관심영역 추출 → 540폭 축소 → 온디바이스 한국어 인식.
 *
 * 배차망에 완전히 독립적이며, 자르기(crop)와 텍스트 라인 해석(parse)은 넘겨받은 ScreenOcrParser<T>에 위임합니다.
 * 시스템 제한: 접근성 스크린샷은 0.33초에 한 번만 허용됩니다.
 */
class ScreenReader(private val service: AccessibilityService) {

    companion object {
        private const val TAG = "1DAL_OCR"
        /** 9월 13일 실측과 같은 폭 — 그 문제지의 y 간격이 이 폭 기준이다 */
        const val TARGET_WIDTH = 540
        /** ⏱️ 상세 화면 진입 후 배차망 UI 애니메이션 멈춤 대기 (150ms) */
        const val DETAIL_STABILIZE_IDLE_MS = 150L
    }

    data class StageMs(
        val capture: Long, val convert: Long, val ocr: Long, val parse: Long,
    ) { val total get() = capture + convert + ocr + parse }

    data class Result(
        val label: String,
        val ms: StageMs,
        val lines: List<OcrLine>,
        val parsedSummary: String,
    )

    private val executor = Executors.newSingleThreadExecutor()
    private val recognizer: TextRecognizer =
        TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
    /** 첫 호출은 모델을 올리느라 느리다 — 서비스가 붙을 때 빈 그림으로 한 번 돌려 둔다 */
    fun warmUp() {
        val t0 = SystemClock.elapsedRealtime()
        val blank = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888).apply { eraseColor(0xFFFFFFFF.toInt()) }
        recognizer.process(InputImage.fromBitmap(blank, 0))
            .addOnSuccessListener { AppLogger.i(TAG, "🔥 예열 완료 ${SystemClock.elapsedRealtime() - t0}ms") }
            .addOnFailureListener { AppLogger.e(TAG, "예열 실패", it) }
    }

    fun close() {
        recognizer.close()
        executor.shutdown()
    }

    /**
     * 📷 **범용 화면 스냅샷 OCR 판독기** (배차망 비종속 공통 파이프라인).
     *
     * 1. 시스템 접근성 스크린샷 캡처 (API 30↑)
     * 2. parser.crop(sw) 로 배차망별 관심 영역 추출 (자르기 위임)
     * 3. 540폭 축소 및 온디바이스 ML Kit 한글 텍스트 인식
     * 4. parser.parse(lines) 로 텍스트 줄 해석 (줄 나누기 위임)
     */
    fun <T> readAndVerifyDetail(
        parser: ScreenOcrParser<T>,
        onSuccess: (result: T, lines: List<OcrLine>) -> Unit,
        onParseFailed: (reason: String, lines: List<OcrLine>) -> Unit,
        onError: (error: String) -> Unit
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            onError("안드로이드 11 미만 — 접근성 스크린샷 없음")
            return
        }

        service.takeScreenshot(Display.DEFAULT_DISPLAY, executor, object : AccessibilityService.TakeScreenshotCallback {
            override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
                val hb = screenshot.hardwareBuffer
                val hw = Bitmap.wrapHardwareBuffer(hb, screenshot.colorSpace)
                hb.close()
                if (hw == null) {
                    onError("비트맵 변환 실패")
                    return
                }
                val sw = hw.copy(Bitmap.Config.ARGB_8888, false)
                hw.recycle()

                val cropped = parser.crop(sw)
                sw.recycle()

                val h = cropped.height * TARGET_WIDTH / cropped.width
                val scaled = Bitmap.createScaledBitmap(cropped, TARGET_WIDTH, h, true)
                cropped.recycle()

                recognizer.process(InputImage.fromBitmap(scaled, 0))
                    .addOnSuccessListener { text ->
                        scaled.recycle()
                        val lines = text.textBlocks.flatMap { b -> b.lines }
                            .map { OcrLine(it.boundingBox?.top ?: 0, it.text) }

                        val parsed = parser.parse(lines)
                        if (parsed == null) {
                            AppLogger.w(TAG, "👀 [스냅샷 판독 실패] 파서가 결과를 반환하지 못함 · ${lines.size}줄")
                            onParseFailed("머리 둘(픽업/배송) 누락", lines)
                            return@addOnSuccessListener
                        }

                        onSuccess(parsed, lines)
                    }
                    .addOnFailureListener { e ->
                        scaled.recycle()
                        AppLogger.e(TAG, "인식 실패", e)
                        onError("인식 실패: ${e.message}")
                    }
            }

            override fun onFailure(errorCode: Int) {
                onError("스크린샷 실패 code=$errorCode")
            }
        })
    }

    /**
     * 찍고 → 전체 화면 540폭으로 읽고 → 같은 그림의 아래 60% 만 540폭으로 다시 읽는다.
     * 둘 다 잰다 — 0.5초는 자른 쪽에서만 나올 가능성이 크다.
     */
    fun bench(
        parser: ScreenOcrParser<*>? = null,
        onDone: (List<Result>) -> Unit,
        onError: (String) -> Unit
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) { onError("안드로이드 11 미만 — 접근성 스크린샷 없음"); return }
        val t0 = SystemClock.elapsedRealtime()
        service.takeScreenshot(Display.DEFAULT_DISPLAY, executor, object : AccessibilityService.TakeScreenshotCallback {
            override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
                val tCaptured = SystemClock.elapsedRealtime()
                val hb = screenshot.hardwareBuffer
                val hw = Bitmap.wrapHardwareBuffer(hb, screenshot.colorSpace)
                hb.close()
                if (hw == null) { onError("비트맵 변환 실패"); return }
                val sw = hw.copy(Bitmap.Config.ARGB_8888, false)
                hw.recycle()
                val tConverted = SystemClock.elapsedRealtime()
                AppLogger.i(TAG, "📸 찍기 ${tCaptured - t0}ms · 변환 ${tConverted - tCaptured}ms · 원본 ${sw.width}x${sw.height}")

                val results = ArrayList<Result>()
                runOne("전체", sw, 0, parser, tCaptured - t0, tConverted - tCaptured) { r1 ->
                    results += r1
                    val top = (sw.height * 0.4).toInt()
                    runOne("아래60%", sw, top, parser, 0, 0) { r2 ->
                        results += r2
                        sw.recycle()
                        onDone(results)
                    }
                }
            }
            override fun onFailure(errorCode: Int) { onError("스크린샷 실패 code=$errorCode") }
        })
    }

    private fun runOne(
        label: String,
        src: Bitmap,
        cropTop: Int,
        parser: ScreenOcrParser<*>?,
        captureMs: Long,
        convertMsBase: Long,
        done: (Result) -> Unit
    ) {
        val t0 = SystemClock.elapsedRealtime()
        val cropped = if (cropTop > 0) Bitmap.createBitmap(src, 0, cropTop, src.width, src.height - cropTop) else src
        val h = cropped.height * TARGET_WIDTH / cropped.width
        val scaled = Bitmap.createScaledBitmap(cropped, TARGET_WIDTH, h, true)
        if (cropped !== src) cropped.recycle()
        val convertMs = convertMsBase + (SystemClock.elapsedRealtime() - t0)

        val tOcr = SystemClock.elapsedRealtime()
        recognizer.process(InputImage.fromBitmap(scaled, 0))
            .addOnSuccessListener { text ->
                val ocrMs = SystemClock.elapsedRealtime() - tOcr
                val lines = text.textBlocks.flatMap { b -> b.lines }
                    .map { OcrLine(it.boundingBox?.top ?: 0, it.text) }
                val tParse = SystemClock.elapsedRealtime()
                val parsed = parser?.parse(lines)
                val parseMs = SystemClock.elapsedRealtime() - tParse
                val summary = parsed?.toString() ?: "${lines.size}줄 추출"
                scaled.recycle()
                AppLogger.i(TAG, "🔤 [$label] 인식 ${ocrMs}ms · ${lines.size}줄 · 나누기 ${parseMs}ms → $summary")
                lines.forEach { AppLogger.d(TAG, "   y=${it.y} ${it.text}") }
                done(Result(label, StageMs(captureMs, convertMs, ocrMs, parseMs), lines, summary))
            }
            .addOnFailureListener { e ->
                scaled.recycle()
                AppLogger.e(TAG, "[$label] 인식 실패", e)
                done(Result(label, StageMs(captureMs, convertMs, -1, 0), emptyList(), "인식 실패: ${e.message}"))
            }
    }
}

/** 설정 화면이 보는 마지막 시험 결과 — 시험용이라 여기 한 곳에만 둔다 */
object ScreenReadBench {
    var lastReport by mutableStateOf("아직 안 찍음")
}
