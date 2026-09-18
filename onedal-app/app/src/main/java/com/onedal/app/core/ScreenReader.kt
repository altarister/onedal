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
import com.onedal.app.models.SimplifiedOfficeOrder
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords
import com.onedal.app.plugins.kakaopicker.OcrLine
import com.onedal.app.plugins.kakaopicker.PickerDetailFromImage
import com.onedal.app.plugins.kakaopicker.PickerScreenOcr
import java.util.concurrent.Executors

/**
 * 📷 **화면을 찍어 글자로 읽는다** — 접근성 스크린샷(API 30↑) → 540폭 축소 → 온디바이스 한국어 인식.
 *
 * 왜 폰에서 읽나: 픽커 상세는 접근성 트리에 배송지가 안 온다. 서버로 그림을 보내 읽으면 왕복만으로
 * 0.5초를 넘긴다(기사님 지시 «폰에서 0.5초 안에»). 그래서 인식 모델을 앱에 번들로 넣는다.
 *
 * 🔴 지금은 **시험용**이다 — 설정 화면 버튼이 부르고, 단계별 ms 를 로그·화면에 적는다.
 *    콜 흐름(대조·뒤로가기)에는 아직 안 물려 있다. 0.5초가 나오는지 이 폰(A24)에서 먼저 잰다.
 *
 * 시스템 제한: 접근성 스크린샷은 0.33초에 한 번만 허용된다 — 상세 한 장에 한 번이라 걸리지 않는다.
 */
class ScreenReader(private val service: AccessibilityService) {

    companion object {
        private const val TAG = "1DAL_OCR"
        /** 9월 13일 실측과 같은 폭 — 그 문제지의 y 간격이 이 폭 기준이다 */
        const val TARGET_WIDTH = 540
        /** ⏱️ 상세 화면 진입 후 접근성 이벤트 정지 확인 유휴 시간 (규칙 ⑤-4) */
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
     * 📷 **픽커 상세 화면을 찍어 읽고 검증한다** (공통 관문 PreConfirmSequence 연동).
     *
     * - 알람 콜(alarmTappedCard != null): 리스트 기억 카드와 동 이름을 대조 (contains). 일치 시 정상 오더, 불일치 시 onMismatch.
     * - 수동 콜(alarmTappedCard == null): OCR 판독 결과 자체가 화면 실물의 유일한 원천 (#119). OCR 결과로 새 오더 조립.
     * - 판독 실패(null): onParseFailed (콜 증발 방지 및 폴백용).
     */
    fun readAndVerifyPickerDetail(
        alarmTappedCard: SimplifiedOfficeOrder?,
        rawScreenStr: String,
        onSuccess: (order: SimplifiedOfficeOrder, detail: PickerDetailFromImage) -> Unit,
        onMismatch: (reason: String, detail: PickerDetailFromImage?, lines: List<OcrLine>) -> Unit,
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

                val top = (sw.height * 0.4).toInt()
                val cropped = Bitmap.createBitmap(sw, 0, top, sw.width, sw.height - top)
                sw.recycle()

                val h = cropped.height * TARGET_WIDTH / cropped.width
                val scaled = Bitmap.createScaledBitmap(cropped, TARGET_WIDTH, h, true)
                cropped.recycle()

                recognizer.process(InputImage.fromBitmap(scaled, 0))
                    .addOnSuccessListener { text ->
                        scaled.recycle()
                        val lines = text.textBlocks.flatMap { b -> b.lines }
                            .map { OcrLine(it.boundingBox?.top ?: 0, it.text) }

                        val parsed = PickerScreenOcr.parseDetail(lines)
                        if (parsed == null) {
                            AppLogger.w(TAG, "👀 [스냅샷 판독 실패] 픽커 상세 머리(픽업/배송)를 찾지 못함 · ${lines.size}줄")
                            onParseFailed("머리 둘(픽업/배송) 누락", lines)
                            return@addOnSuccessListener
                        }

                        if (alarmTappedCard != null) {
                            // 🎯 [알람 콜] 리스트에서 누른 카드와 대조
                            val pickupTokens = alarmTappedCard.pickup.split(' ', '·').map { it.trim() }.filter { it.length >= 2 }
                            val dropoffTokens = alarmTappedCard.dropoff.split(' ', '·').map { it.trim() }.filter { it.length >= 2 }

                            val pickupMatch = pickupTokens.isEmpty() || pickupTokens.any { parsed.pickup.admin.contains(it) || it.contains(parsed.pickup.admin) }
                            val dropoffMatch = dropoffTokens.isEmpty() || dropoffTokens.any { parsed.dropoff.admin.contains(it) || it.contains(parsed.dropoff.admin) }

                            if (pickupMatch && dropoffMatch) {
                                AppLogger.i(TAG, "🎯 [스냅샷 대조 일치] 알람 카드와 일치: ${parsed.pickup.admin} → ${parsed.dropoff.admin}")
                                val verifiedOrder = alarmTappedCard.copy(
                                    pickup = parsed.pickup.admin,
                                    dropoff = parsed.dropoff.admin,
                                    rawText = rawScreenStr,
                                    itemSize = parsed.itemSize ?: alarmTappedCard.itemSize
                                )
                                onSuccess(verifiedOrder, parsed)
                            } else {
                                val reason = "주소 불일치 (기억: ${alarmTappedCard.pickup}→${alarmTappedCard.dropoff} / OCR: ${parsed.pickup.admin}→${parsed.dropoff.admin})"
                                AppLogger.w(TAG, "🚨 [스냅샷 대조 불일치] $reason")
                                onMismatch(reason, parsed, lines)
                            }
                        } else {
                            // 🖐️ [손으로 연 상세] 대조 카드가 없으므로 OCR 판독 결과 자체가 유일한 원천 (#119)
                            AppLogger.i(TAG, "🖐️ [손으로 연 상세] OCR 결과로 오더 조립: ${parsed.pickup.admin} → ${parsed.dropoff.admin}")
                            val now = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
                                timeZone = java.util.TimeZone.getTimeZone("UTC")
                            }.format(java.util.Date())
                            val manualOrder = SimplifiedOfficeOrder(
                                id = "MANUAL-${System.currentTimeMillis()}",
                                type = "MANUAL_CLICK",
                                pickup = parsed.pickup.admin,
                                dropoff = parsed.dropoff.admin,
                                fare = 0,
                                timestamp = now,
                                rawText = rawScreenStr,
                                itemSize = parsed.itemSize,
                                vehicleType = KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE,
                                tagsText = listOfNotNull(parsed.itemSize, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" ")
                            )
                            onSuccess(manualOrder, parsed)
                        }
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
    fun bench(onDone: (List<Result>) -> Unit, onError: (String) -> Unit) {
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
                runOne("전체", sw, 0, tCaptured - t0, tConverted - tCaptured) { r1 ->
                    results += r1
                    val top = (sw.height * 0.4).toInt()
                    runOne("아래60%", sw, top, 0, 0) { r2 ->
                        results += r2
                        sw.recycle()
                        onDone(results)
                    }
                }
            }
            override fun onFailure(errorCode: Int) { onError("스크린샷 실패 code=$errorCode") }
        })
    }

    private fun runOne(label: String, src: Bitmap, cropTop: Int, captureMs: Long, convertMsBase: Long, done: (Result) -> Unit) {
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
                val parsed = PickerScreenOcr.parseDetail(lines)
                val parseMs = SystemClock.elapsedRealtime() - tParse
                val summary = parsed?.let {
                    "상차 ${it.pickup.admin} / ${it.pickup.place ?: "-"} ${it.pickup.straightKm}km ${it.pickup.at ?: ""}" +
                        " · 하차 ${it.dropoff.admin} / ${it.dropoff.place ?: "-"} ${it.dropoff.straightKm}km ${it.dropoff.at ?: ""}" +
                        (if (it.reserved) " · 예약" else "")
                } ?: "픽커 상세 아님(머리 둘 없음)"
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
