package com.onedal.app.core.engine

import android.os.Handler
import com.onedal.app.core.AutoTouchManager
import com.onedal.app.core.ScrapParser
import com.onedal.app.core.ScreenKeywords
import com.onedal.app.core.TelemetryManager
import com.onedal.app.models.SimplifiedOfficeOrder

/**
 * 🧰 **스캔 한 판이 쓰는 것들 — 배차망별 수순에게 넘겨주는 묶음**.
 *
 * ── 무엇인가 ──
 * 배차망별 수순(`InsungSequence` · `PreConfirmSequence`)은 `ScanContext` 의 **확장 함수**다.
 * 수순 함수는 서비스 내부 것 20개(필드 10 + 메서드 10)에 기대므로, 그것을 이 묶음으로 넘긴다.
 *
 * ── 🔴 이름을 서비스 안 이름과 똑같이 둔 이유 ──
 * `telemetryManager`·`scrapParser`·`touchManager`·`currentTargetApp` 처럼 길고 안 예쁜
 * 이름을 그대로 둔다. 확장 함수 본문의 `session`·`telemetryManager` 가 **수신자에서 그대로 풀리므로**
 * 서비스 안 본문을 한 줄도 안 고치고 옮길 수 있다 — 본문을 고치는 자리가 인성이 흔들리는 자리다.
 *
 * ── 왜 인터페이스인가 ──
 * 값을 복사해 담는 그릇(data class)이면 **낡는다** — `keywords`·`currentTargetApp` 은
 * 배차망을 갈아탈 때 바뀌고, `session` 은 콜마다 상태가 변한다.
 * 인터페이스는 **그때그때 읽으므로** 지금 동작과 완전히 같다 (규칙 ③ — 상태를 복사해
 * 두지 않고 원천에서 파생한다).
 */
interface ScanContext {

    // ── 상태를 들고 있는 것들 ──────────────────────────────

    /** 한 콜의 세션 (선점 중인가 · 어느 콜인가 · 미리보기인가) */
    val session: SessionManager

    /** 서버로 모아쏘기 — 화면 상태·홀드·성적표를 싣는다 */
    val telemetryManager: TelemetryManager

    /** 지금 배차망의 파서 (리스트를 콜로 읽는다) */
    val scrapParser: ScrapParser

    /** 좌표 탭·버튼 찾기 */
    val touchManager: AutoTouchManager

    /** 지금 배차망의 화면 판별 낱말 */
    val keywords: ScreenKeywords

    /** 리스트에서 방금 읽은 콜들 — 상세에서 역추적할 때 쓴다 */
    val recentListOrders: MutableList<SimplifiedOfficeOrder>

    /** 인성 팝업 3장을 순서대로 여닫는 기계 */
    val collectMachine: DetailCollectMachine

    /** 지연 실행 (자동 복귀 타이머 등) */
    val mainHandler: Handler

    /** ⏳ 기다림 장부 — 기다림은 여기로 건다(이름 · 건 쪽 · 만료가 한 곳에) */
    val waitBook: com.onedal.app.core.WaitBook


    /** 화면 판별 (지금은 인성 모양이다 — 배차망이 자기 판별을 갖는 날 여기가 바뀐다) */
    val screenDetector: ScreenDetector

    /** 지금 보고 있는 배차망 코드 (`insung`·`hwamul24`·`kakaopicker`) */
    val currentTargetApp: String

    /** 🎛️ 이 배차망에서 실제로 도는 모드 — 관제웹이 보낸 모드를 배차망에 맞춰 매번 계산한다 (`TargetApp.effectiveMode`) */
    val effectiveMode: String

    /** 📷 화면 판독기 (온디바이스 OCR 스냅샷 검증) */
    val screenReader: com.onedal.app.core.ScreenReader

    /** 📡 서버 통신 클라이언트 */
    val apiClient: com.onedal.app.api.ApiClient


    // ── 공통 동작 — 배차망이 달라도 같은 일 ────────────────

    /** 📤 1차 선점을 보낸다 — 한 콜에 한 번만 */
    fun sendConfirmOnce(order: SimplifiedOfficeOrder, rawScreenStr: String)

    /** 📤 상세를 보낸다 (판결 요청) */
    fun sendDetail(order: SimplifiedOfficeOrder)

    /** 🔄 세션·타이머·홀드를 초기화한다 (리스트 복귀) */
    fun resetSessionState()

    /** 🆔 세션 ID 가 없으면 만든다 — 접두사는 **출신**이지 기기 모드가 아니다 */
    fun ensureSessionId()

    /** ⏱️ 지금 시각 (시간대를 실어서 — 안 실으면 9시간 밀린다) */
    fun nowTimestamp(): String

    /** 👆 주어진 낱말 중 첫 번째로 보이는 버튼을 누른다 */
    fun clickFirstMatchingButton(rootNode: android.view.accessibility.AccessibilityNodeInfo, texts: List<String>): Boolean

    /** ⏱️ 상세 화면 진입 시 설정된 대기 시간 후 자동으로 리스트로 복귀하는 타이머를 작동 */
    fun scheduleDetailBack()

    /** ⏱️ 이 배차망은 누가 열었든 상세에서 돌아오는가 — 상세 대기 시간 값이 있는 배차망(픽커) */
    fun returnsFromDetailWhoeverOpened(): Boolean

    /** 🧹 앱이 누른 콜을 «눌렀다»에서 «막았다»로 내린다 — 누를 때 쥔 목록 줄로 지문을 뜬다. 처리 비우기 **앞**에 부른다 */
    fun demoteTappedCall(reason: String)

    /** 📱 운행 기록을 켠다 — 공통 기록기 (배차망 칸이 «수락했다»를 알아볼 때 부른다) */
    fun startAppTrace(reason: String)

    /** ⏱️ 읽기 나눔 — 이 읽기에서 방금 끝난 구간의 이름(`ReadSplit`) */
    fun markRead(name: String) {}
}
