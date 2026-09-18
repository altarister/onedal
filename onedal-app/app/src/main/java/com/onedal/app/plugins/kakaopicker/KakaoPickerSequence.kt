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
 * 상세 화면(DETAIL_PRE_CONFIRM)의 진입, 검증, 2차 필터 탈락 시 회피 기동은
 * **공통 관문(`com.onedal.app.core.engine.PreConfirmSequence.kt`)** 에서 전 배차망 공통으로 통솔한다.
 *
 * 여기 있는 함수:
 *   · `reportPickerAccepted` — 기사님이 수락하신 것을 알아보고 **잡은 콜로 승격**시킨다
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
    if (!KakaoPickerKeywords.isAcceptedEvidence(rawScreenStr)) {   // 운행 화면 또는 오더가 든 «내 오더» 탭
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
