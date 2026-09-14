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

fun ScanContext.sendPickerPreview(rawScreenStr: String, screenTexts: List<String>) {
    if (session.isDetailScrapSent) return          // 한 콜에 한 번만
    /**
     * 👀 **이 상세가 리스트의 어느 카드인가 — 누가 열었든 한 곳** (2026-09-14 폰 시험 · 버그 대장 #119).
     * 예전엔 알람이 누를 때만 카드를 쥐여 줘서, 기사님이 손으로 연 상세는 «리스트 원본이 없다»로 끝났다.
     * 이제 방금 읽은 리스트 카드(`recentListOrders`)에서 요금 + 픽업지로 찾는다 (`matchListCard`).
     */
    val match = KakaoPickerParser.matchListCard(screenTexts, recentListOrders)
    val base = match.card
    if (base == null) {
        AppLogger.w("1DAL_PICKER", "👀 [미리보기 보류] ${match.why} — 주소를 지어내지 않는다")
        return
    }
    session.lastDetailOrder = base                 // 기사님이 수락하면 이 카드를 잡은 콜로 올린다 (`reportPickerAccepted`)
    ensureSessionId()
    session.isPreview = true
    val order = base.copy(
        id = session.currentOrderId,
        type = "MANUAL_CLICK",                     // 계약은 기사님 손가락 — 직접 갈래다
        /**
         * 🚚 **차종은 픽커에 없는 축이다 — 일반값을 넣고 «미확인»으로 표시한다** (규칙 ⑤-2).
         * 픽커는 물품 크기(초소형·소형·중형)로 가르고 차종 칸이 아예 없다.
         * 실측 표본 316건에서 소형이 95% 라 승용차·다마스 급이 일반값이다.
         * 🔴 **표시 없이 값만 쓰면 규칙 ④ 위반이다** — `tagsText` 에 «차종미확인»을 함께 싣는다.
         */
        vehicleType = KakaoPickerKeywords.PICKER_ASSUMED_VEHICLE,
        tagsText = listOfNotNull(base.tagsText, KakaoPickerKeywords.PICKER_VEHICLE_UNKNOWN_TAG).joinToString(" "),
        rawText = rawScreenStr,                    // 📄 상세 원문 — 칸 나누기는 실물 캡처 뒤에
    )
    sendConfirmOnce(order, rawScreenStr)
    /**
     * 📡 **둘째 보고까지 보낸다** (#119) — 서버는 `/detail` 이 와야 경로를 찾고 판정 색을 낸다.
     * 예전엔 «수락하기» 뒤에만 보내, 픽커 미리보기는 관제웹 «평가중» 30초 뒤 사라지고 한 번도 판정되지 않았다.
     * 미리보기 표시를 단 채라 서버는 잡지 않고(규칙 ①), 픽커는 안전취소가 없어 타이머도 걸지 않는다.
     * 두 보고는 원달앱 전송 줄 하나(`dispatchExecutor`)로 순서대로 간다 — 서버가 첫 보고의 기억을 이어받는다.
     */
    session.accumulatedDetailText = rawScreenStr
    sendDetail(order)
    AppLogger.i("1DAL_PICKER", "👀 [미리보기 전송] ${base.fare}원 · ${base.pickup}→${base.dropoff} · ${rawScreenStr.length}자 — 판정은 서버 · 수락은 기사님")
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
 * ⚠️ 리스트 카드를 못 찾으면 **보내지 않는다** — 상세 화면 글자만으로 주소를
 *    지어내지 않는다 (규칙 ④). 카드는 누가 열었든 `matchListCard` 가 찾는다 (#119 — 예전엔 알람만 쥐여 줬다).
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
 * 🟢 **화면 낱말은 실물로 검증됐다** (2026-09-13 새벽 · 이 주석은 «2023 추정»이라 적혀 있었다).
 *    기사님 캡처 `실물_2026/15~22` 를 그대로 읽어 대조했고, 검사도 그 원문을 문다
 *    (`PickerScreenDetectTest`). 특히 **수락 직후 첫 화면(실물 15 «내 오더» 탭)** 이
 *    검사에 없었는데, 승격이 걸리는 판이 바로 거기라 그날 못 잡으면 **하루 5번**뿐인
 *    기회를 잃는다 — 그래서 그 한 건을 못박았다.
 */
fun ScanContext.reportPickerAccepted(rawScreenStr: String) {
    /**
     * 📡 **왜 안 올라갔는지 말한다** (2026-09-13 새벽).
     *    🔴 여기서 조용히 돌아서면 «수락했는데 콜이 안 잡혔다»의 원인을 못 찾는다.
     *       픽커는 **하루 5번**이라 판을 한 번 더 돌리는 값이 비싸다.
     *    ⚠️ 이 함수는 화면이 바뀔 때만 불리므로 로그가 밀리지 않는다.
     */
    if (!session.isPreview) {
        // ⚠️ 리스트로 돌아온 경우는 여기 안 온다 (`KakaoPickerKeywords.afterDetail`) — 세션이 비워진 뒤라 까닭을 틀리게 적었다
        AppLogger.d("1DAL_PICKER", "↩️ [승격 안 함] 미리보기 딱지가 없다 — " +
            (if (session.lastDetailOrder == null) "미리보기를 못 보냈다 (상세에서 리스트 카드를 못 찾았다 — `👀 [미리보기 보류]` 줄에 까닭)" else "이미 올린 콜이다"))
        return
    }
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
