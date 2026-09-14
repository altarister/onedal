package com.onedal.app.core

import com.onedal.app.plugins.hwamul24.Hwamul24Keywords
import com.onedal.app.plugins.insung.InsungKeywords
import com.onedal.app.plugins.kakaopicker.KakaoPickerKeywords

/**
 * 🌐 **배차망 라벨↔코드 — 매핑은 여기 한 곳뿐** (기사님 확정 2026-08-30 · 픽커_수집.md §6-전)
 *
 * 예전엔 `"24시" -> hwamul24, else -> insung` 이 HijackService·TelemetryManager 등에
 * 흩어져 있었다 — 배차망을 하나 더할 때 곳곳이 각자 갈라질 판이었다
 * (#76~#82 «한 값이 여러 곳» 클래스). 서버 쪽 표준은 shared `TARGET_APPS` 한 벌이고,
 * 앱은 Kotlin 이라 그 파일을 못 읽으므로 **여기가 앱의 한 곳**이다.
 * 값이 어긋나면 서버 수신이 기본값(insung)으로 떨어져 로그에 남는다.
 */
object TargetApp {
    const val INSUNG = "insung"
    const val HWAMUL24 = "hwamul24"
    const val KAKAOPICKER = "kakaopicker"

    /** 실제 카카오T픽커 앱의 이름 (0830 실측) — 배차망을 정하는 데는 쓰지 않는다 (`isKakaoPickerApp`) */
    private const val KAKAOPICKER_PACKAGE = "com.kakaomobility.flexer"

    /**
     * 🧪 배차망 시뮬레이터 앱의 이름 — 설정 화면 «테스트 가상 콜 화면 열기»가 켠다.
     * 🔴 배차망을 정하는 데 쓰지 않는다 — 시뮬레이터는 세 배차망을 한 앱으로 띄운다 (`networksOnScreen`).
     */
    const val SIMULATOR_PACKAGE = "com.onedal.simulator"

    /** 저장된 라벨 → 서버 코드. 모르는 라벨은 인성 — 오프라인 안전망과 같은 결 */
    fun codeOf(label: String?): String = when (label) {
        "24시" -> HWAMUL24
        "픽커" -> KAKAOPICKER
        else -> INSUNG
    }

    /** 코드 → 저장 라벨 (자동 전환이 프리퍼런스를 같은 말로 되돌릴 때) */
    fun labelOf(code: String): String = when (code) {
        HWAMUL24 -> "24시"
        KAKAOPICKER -> "픽커"
        else -> "인성콜"
    }

    /**
     * 🏷️ **배차망마다 «그 배차망 화면에만 있는 글자 묶음»** — 원천은 각 배차망 폴더의 Keywords 다.
     * 배차망을 더하면 여기 한 줄 + 그 폴더에 `NETWORK_MARKERS` 하나.
     */
    fun networkMarkers(): Map<String, List<List<String>>> = mapOf(
        INSUNG to InsungKeywords.NETWORK_MARKERS,
        HWAMUL24 to Hwamul24Keywords.NETWORK_MARKERS,
        KAKAOPICKER to KakaoPickerKeywords.NETWORK_MARKERS,
    )

    /**
     * 🖥️ **이 화면에 글자가 보이는 배차망들** (기사님 확정 2026-09-14 · 원달앱 계획서 ③).
     *
     * 🔴 **앱 이름(패키지)으로 가르지 않는다** — 옛 이름 `codeOfPackage` 는 지웠다.
     *    시뮬레이터 앱은 인성·24시·픽커 화면을 **한 앱**으로 띄워 늘 «인성»이 됐고,
     *    픽커 화면을 인성 파서로 읽으며 관제앱 배지도 «인성»으로 보였다.
     *    실제 픽커도 «나 픽커입니다»라고 알려 주지 않는다 — 실제든 시뮬레이터든 같은 길이어야 한다.
     */
    fun networksOnScreen(texts: List<String>): Set<String> =
        NetworkByScreen.hits(texts.joinToString(" "), networkMarkers())

    /** 이 화면은 어느 배차망인가 — 하나일 때만 답한다. 모르면 null (지어내지 않는다) */
    fun networkOfScreen(texts: List<String>): String? = networksOnScreen(texts).singleOrNull()

    /**
     * 📝 **실제 픽커 앱 화면인가 — 배차망을 정하는 데 쓰지 않는다** (기사님 확정 2026-09-14 ㉯).
     *
     * 쓰는 곳은 하나다: «처음 보는 픽커 화면의 글자»를 로그로 모을지(`HijackService`).
     * 처음 보는 화면은 **픽커 글자가 없는 화면**이라 화면 글자로는 픽커인지 알 수 없고,
     * «직전 배차망이 픽커면»으로 걸면 잠금화면·런처가 다시 찍힌다 (2026-09-02 실측).
     */
    fun isKakaoPickerApp(packageName: String?): Boolean = packageName == KAKAOPICKER_PACKAGE

    /**
     * 🚧 **이 배차망에 «잡기 시퀀스»가 있는가** (기사님 확정 2026-08-30 · 픽커_수집.md §3-확장).
     *
     * 잡는 수순은 배차망마다 완전히 다르다 — 인성은 상세→팝업3장→확정, 픽커는
     * 수락한 **뒤에야** 주소가 나온다. 지금 공용 코드의 수순은 인성 모양이라,
     * 수순이 없는 배차망에서 돌면 엉뚱한 화면을 누른다.
     *
     * `false` 면 앱은 **인성 잡기 수순을 타지 않는다** — 인성 전용 화면(확정 후·팝업 3종)
     * 처리와 AUTO 모드의 리스트 자동 클릭을 건너뛴다.
     *
     * 🔴 **«아무것도 안 누른다»는 뜻이 아니다** (기사님 교정 2026-09-02).
     *    *"알람일 때 «수락하기» 버튼만 클릭하지 못하는 것이고, 나머지는 계약과 관련
     *    없으므로 어떤 것도 클릭 가능하다."* — 실제로 **알람일 때는 그 콜의 상세까지
     *    들어간다**(`scheduleDetailBack` — 누가 열었든 상세 대기 시간 뒤 돌아온다). 막아야 하는 단 하나는 **계약 버튼**이고,
     *    그건 이 함수가 아니라 `KakaoPickerParser.clickSafe`(«수락» 글자가 보이면 손대지
     *    않는다)가 막는다. 픽커는 되돌릴 창이 없어서(전화만·하루 5번) 계약이 곧 확정이다.
     *
     * 이 함수를 읽는 자리들이 곧 «인성 전용 구간»이다 (🚧 주석) —
     * 픽커로 잡기를 시작하는 날, 그 표시를 따라 인성 수순을 떼어낸다.
     */
    fun supportsCatching(code: String): Boolean = when (code) {
        KAKAOPICKER -> false   // 수순 미구현 — 수집·알람 전용 (1차 확정)
        else -> true
    }
}
