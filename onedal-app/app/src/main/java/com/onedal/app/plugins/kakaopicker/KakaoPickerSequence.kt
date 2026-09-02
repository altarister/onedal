package com.onedal.app.plugins.kakaopicker

import com.onedal.app.core.AppLogger
import com.onedal.app.core.engine.ScanContext

/**
 * 🌐 **픽커 수순 — 여기가 그 집이다** (2026-09-02 신설 · 기획/배차망_통합.md ②).
 *
 * 🔴 **픽커에는 «잡기» 수순이 없다.** 「수락하기」를 누르는 순간 계약이 성립하고
 * 되돌릴 창이 없다(버튼 취소 없음 · 전화만 · 하루 5번). 그래서 앱은 **읽고 알릴 뿐**이고,
 * 계약은 기사님 손가락으로만 이루어진다 (`TargetApp.supportsCatching = false`).
 *
 * 여기 있는 둘이 하는 일:
 *   · `sendPickerPreview`    — 확정 전 상세를 **미리보기 콜**로 서버에 올린다 (판정만 받는다)
 *   · `reportPickerAccepted` — 기사님이 수락하신 것을 알아보고 **잡은 콜로 승격**시킨다
 *
 * ⚠️ 둘 다 `ScanContext` 의 확장 함수다 — 본문은 `HijackService` 에 있을 때와
 *    한 글자도 다르지 않다. 다른 것은 «어디에 사는가»뿐이다.
 */

fun ScanContext.sendPickerPreview(rawScreenStr: String) {
    if (session.isDetailScrapSent) return          // 한 콜에 한 번만
    val base = session.lastDetailOrder
    if (base == null) {
        AppLogger.w("1DAL_PICKER", "👀 [미리보기 보류] 리스트 원본이 없다 — 주소를 지어내지 않는다")
        return
    }
    ensureSessionId()
    session.isPreview = true
    sendConfirmOnce(
        base.copy(
            id = session.currentOrderId,
            type = "MANUAL_CLICK",                 // 계약은 기사님 손가락 — 직접 갈래다
            /**
             * 🚚 **차종은 픽커에 없는 축이다 — 일반값을 넣고 «미확인»으로 표시한다** (규칙 ⑤-2).
             * 픽커는 물품 크기(초소형·소형·중형)로 가르고 차종 칸이 아예 없다.
             * 실측 표본 316건에서 소형이 95% 라 승용차·다마스 급이 일반값이다.
             * 🔴 **표시 없이 값만 쓰면 규칙 ④ 위반이다** — `tagsText` 에 «차종미확인»을 함께 싣는다.
             */
            vehicleType = KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE,
            tagsText = listOfNotNull(base.tagsText, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" "),
            rawText = rawScreenStr,                // 📄 상세 원문 — 칸 나누기는 실물 캡처 뒤에
        ),
        rawScreenStr,
    )
    AppLogger.i("1DAL_PICKER", "👀 [미리보기 전송] ${base.fare}원 · ${rawScreenStr.length}자 — 수락은 기사님")
}

/**
 * 👀 **픽커 «확정 전 상세» → 미리보기 콜로 서버에 올린다** (기사님 확정 2026-09-02).
 *
 * 기사님: *"갈래 b 를 선택하고 픽커에서 confirm 을 보내 오면 빈 값이 있을 거고..
 * 차종, 짐 등등.. 그건 하나로 통일해서 임의로 넣고, 나머지 픽커의 고유 값들은 따로 보관한다."*
 *
 * **인성 코드를 그대로 쓴다** — `sendConfirmOnce` 하나. 다른 것은 셋뿐이다:
 *   ① `isPreview = true` — 계약 전이라 서버가 결재 버튼을 안 띄우고 자동 취소도 안 한다
 *   ② 차종을 **고정값**으로 채운다 (픽커에 차종 축이 없다 — 아래 ⑤-2)
 *   ③ 상세 화면 글자를 **원문 그대로** 실어 보낸다 (서버가 `intel.rawDetailText` 로 보관)
 *
 * 🔴 **계약은 하지 않는다.** 이 함수는 서버에 «이런 콜을 보고 있습니다» 라고 알릴 뿐이고,
 *    「수락하기」를 누르는 것은 기사님 손가락이다. 픽커는 되돌릴 창이 없다
 *    (버튼 취소 없음 · 전화만 · 하루 5번).
 *
 * ⚠️ 리스트에서 읽어 둔 원본이 없으면 **보내지 않는다** — 상세 화면 글자만으로 주소를
 *    지어내지 않는다 (규칙 ④). 원본은 알람이 상세로 들어갈 때 쥐어 준다.
 */
/**
 * ✅ **픽커에서 기사님이 「수락하기」를 누르셨다 — 잡은 콜로 올린다** (2026-09-02 신설).
 *
 * 화면이 «수락 후»로 바뀌면(「픽업 완료하기」·「픽업지로 이동하세요」 …) 여기로 온다.
 * **인성이 «미리보기 → 확정»에서 쓰는 수단 그대로다** — `isPreview` 딱지를 벗기고
 * `sendDetail` 하나를 보낸다. 새로 만든 길이 아니다.
 *
 * 🔴 **딱지는 벗겨지기만 한다.** 잡은 콜을 안 잡은 것으로 되돌리면 취소 카운트가 새고,
 *    픽커는 되돌릴 창이 없어(전화만 · 하루 5번) 그 오차가 그대로 손해다.
 *
 * ⚠️ **화면 낱말은 2023년 남의 자료로 만든 추정이다** (`KakaoPickerKeywords.ACCEPTED_SCREEN_WORDS`).
 *    실물 캡처가 오면 그 목록만 갈아끼운다 — 이 함수는 안 고쳐도 된다.
 */
fun ScanContext.reportPickerAccepted(rawScreenStr: String) {
    if (!session.isPreview) return          // 이미 올렸거나, 미리보기를 보낸 적이 없다
    /**
     * 🔴 **화면 분류만 믿지 않는다 — 수락 후 표식이 실제로 보여야 한다** (0902 실사고).
     * 30초 자동 복귀가 도는 순간 상세→리스트 중간 프레임에서 「수락하기」만 먼저
     * 사라졌고, 화면 분류가 그걸 «확정»으로 읽어 **안 누른 콜이 잡은 콜로 승격**됐다.
     */
    if (!KakaoPickerKeywords.isAcceptedScreen(rawScreenStr)) {
        AppLogger.d("1DAL_PICKER", "↩️ [승격 보류] 수락 후 표식이 없다 — 화면 넘어가는 중으로 본다")
        return
    }
    val order = session.lastDetailOrder ?: return
    session.isPreview = false
    session.accumulatedDetailText = rawScreenStr   // 수락 후 화면 글자(주소 전문이 여기 있다)
    AppLogger.i("1DAL_PICKER", "✅ [수락 확인] 기사님이 「수락하기」를 누르셨다 — 잡은 콜로 올린다")
    AppLogger.roadmap("👀 [미리보기 → 확정] 픽커 수락 화면 감지 — 딱지를 벗고 서버에 알린다",
        telemetryManager.currentScreenContext.name)
    sendDetail(order)
}
