package com.onedal.app.plugins.insung

import android.view.accessibility.AccessibilityNodeInfo
import com.onedal.app.core.TargetApp
import com.onedal.app.core.engine.ScanContext

/**
 * 🔴 **인성 잡기 수순 — 여기가 그 집이다** (2026-09-02 신설 · 기획/배차망_통합.md §4).
 *
 * 인성 전용 수순(상세·확정·팝업 3종 · 약 636줄)이 오랫동안 `HijackService` 안에 있었다.
 * 배차망을 계속 붙이려면 그게 나와야 한다 — **공통 코드가 인성 화면을 알면 안 된다.**
 *
 * ── 어떻게 옮기나 ──
 * `ScanContext` 의 **확장 함수**로 둔다. 그러면 본문의 `session`·`collectMachine`·
 * `currentTargetApp` 이 **수신자에서 그대로 풀려서**, 본문을 한 줄도 안 고치고 옮겨진다.
 * 부르는 쪽도 `handleMemoPopup(rootNode, texts)` 그대로다 (`HijackService` 가 `ScanContext`
 * 를 구현하므로 자기 자신이 수신자다).
 *
 * ── 지금 여기 있는 것 ──
 * 팝업 하나만 먼저 옮겼다. **묶음(`ScanContext`)이 실제로 도는지 증명하려는 것**이고,
 * 나머지(상세·확정·팝업 둘·약 630줄)는 이 증명이 게이트를 통과한 뒤에 따라온다.
 *
 * 🔴 **본문은 옮기기 전과 한 글자도 다르지 않다.** 다른 것은 «어디에 사는가»뿐이다.
 */

/** 적요 팝업 — 인성에만 있는 화면이다 */
fun ScanContext.handleMemoPopup(rootNode: AccessibilityNodeInfo, screenTexts: List<String>) {
    // 🚧 인성 전용 구간 — 인성 잡기 수순 (픽커_수집.md §3-확장)
    if (!TargetApp.supportsCatching(currentTargetApp)) return
    collectMachine.handleMemoPopup(rootNode, session, screenTexts)
}
