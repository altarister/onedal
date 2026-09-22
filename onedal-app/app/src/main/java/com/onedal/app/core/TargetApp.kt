package com.onedal.app.core

/**
 * 🌐 **배차망 라벨↔코드 — 매핑은 여기 한 곳뿐** (기사님 확정)
 *
 * 매핑을 여러 파일(HijackService·TelemetryManager 등)에 흩으면 배차망을 하나 더할 때 곳곳이 각자 갈라진다
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
    fun codeOf(label: String?): String =
        com.onedal.app.plugins.DispatchPluginRegistry.findByLabel(label).code

    /** 코드 → 저장 라벨 (자동 전환이 프리퍼런스를 같은 말로 되돌릴 때) */
    fun labelOf(code: String): String =
        com.onedal.app.plugins.DispatchPluginRegistry.get(code).label

    /**
     * 🏷️ **배차망마다 «그 배차망 화면에만 있는 글자 묶음»** — 원천은 각 배차망 폴더의 Keywords 다.
     * 배차망을 더하면 여기 한 줄 + 그 폴더에 `NETWORK_MARKERS` 하나.
     */
    fun networkMarkers(): Map<String, List<List<String>>> =
        com.onedal.app.plugins.DispatchPluginRegistry.all().associate { it.code to it.networkMarkers }

    /**
     * 🖥️ **이 화면에 글자가 보이는 배차망들** (기사님 확정).
     *
     * 🔴 **화면 글자로 가른다** — 시뮬레이터 앱은 인성·24시·픽커 화면을 **한 앱**으로 띄우므로,
     *    앱 이름으로 가르면 늘 «인성»이 되어 픽커 화면을 인성 파서로 읽는다.
     *    실제 픽커도 «나 픽커입니다»라고 알려 주지 않는다 — 실제든 시뮬레이터든 같은 길이어야 한다.
     */
    fun networksOnScreen(texts: List<String>): Set<String> =
        NetworkByScreen.hits(texts.joinToString(" "), networkMarkers())

    /** 이 화면은 어느 배차망인가 — 하나일 때만 답한다. 모르면 null (지어내지 않는다) */
    fun networkOfScreen(texts: List<String>): String? = networksOnScreen(texts).singleOrNull()

    /**
     * 📝 **실제 픽커 앱 화면인가 — 배차망을 정하는 데 쓰지 않는다** (기사님 확정 ㉯).
     *
     * 쓰는 곳은 하나다: «처음 보는 픽커 화면의 글자»를 로그로 모을지(`HijackService`).
     * 처음 보는 화면은 **픽커 글자가 없는 화면**이라 화면 글자로는 픽커인지 알 수 없고,
     * «직전 배차망이 픽커면»으로 걸면 잠금화면·런처가 다시 찍힌다.
     */
    fun isKakaoPickerApp(packageName: String?): Boolean = packageName == KAKAOPICKER_PACKAGE

    /** 📝 픽커 로그를 어디까지 남기나 — `pickerLogScope` 의 답 */
    enum class PickerLog {
        /** 안 남긴다 */
        NONE,
        /** «🚚 운행 단계»만 — 시뮬레이터 앱이 픽커 화면을 띄울 때 */
        STAGE_ONLY,
        /** «🚚 운행 단계» + «❓ 모르는 화면» 글자 — 실제 픽커 앱 */
        STAGE_AND_UNKNOWN,
    }

    /**
     * 📝 **픽커 로그를 어디까지 남기나** (기사님 지시: *"시뮬레이터에서도 «운행 단계» 로그를 찍어"*).
     *
     * · 실제 픽커 앱 → 운행 단계 + 모르는 화면 글자 (㉯ 그대로)
     * · 시뮬레이터 앱 + 지금 배차망이 픽커 → **운행 단계만**. 시뮬레이터 수락 뒤 화면을 폰 시험으로 확인하려고 연다
     * · 그 밖 → 안 남긴다
     *
     * 🔴 **시뮬레이터에서 «모르는 화면»은 안 모은다** — 시뮬레이터 앱은 설정 화면·인성·화물24시도 띄운다.
     *    그 글자가 «모르는 픽커 화면»으로 찍히면 09-02 잠금화면 사고처럼 로그가 덮인다.
     *    모르는 화면을 모으는 까닭은 **실물의 처음 보는 낱말**을 고르는 것이라 실제 앱에서만 뜻이 있다.
     * 🔴 시뮬레이터는 «지금 배차망이 픽커»일 때만 — 인성·화물24시 화면에 운행 단계 낱말(«시작하기» 등)이 우연히 있어도 안 찍힌다.
     */
    fun pickerLogScope(packageName: String?, currentTarget: String): PickerLog = when {
        isKakaoPickerApp(packageName) -> PickerLog.STAGE_AND_UNKNOWN
        packageName == SIMULATOR_PACKAGE && currentTarget == KAKAOPICKER -> PickerLog.STAGE_ONLY
        else -> PickerLog.NONE
    }

    /**
     * 🚧 **이 배차망에 «잡기 시퀀스»가 있는가** (기사님 확정).
     *
     * 잡는 수순은 배차망마다 완전히 다르다 — 인성은 상세→팝업3장→확정, 픽커는
     * 수락한 **뒤에야** 주소가 나온다. 지금 공용 코드의 수순은 인성 모양이라,
     * 수순이 없는 배차망에서 돌면 엉뚱한 화면을 누른다.
     *
     * `false` 면 앱은 **인성 잡기 수순을 타지 않는다** — 인성 전용 화면(확정 후·팝업 3종)
     * 처리와 AUTO 모드의 리스트 자동 클릭을 건너뛴다.
     *
     * 🔴 **«아무것도 안 누른다»는 뜻이 아니다** (기사님 교정).
     *    *"알람일 때 «수락하기» 버튼만 클릭하지 못하는 것이고, 나머지는 계약과 관련
     *    없으므로 어떤 것도 클릭 가능하다."* — 실제로 **알람일 때는 그 콜의 상세까지
     *    들어간다**(`scheduleDetailBack` — 누가 열었든 상세 대기 시간 뒤 돌아온다). 막아야 하는 단 하나는 **계약 버튼**이고,
     *    그건 이 함수가 아니라 `KakaoPickerParser.clickSafe`(«수락» 글자가 보이면 손대지
     *    않는다)가 막는다. 픽커는 되돌릴 창이 없어서(전화만·하루 5번) 계약이 곧 확정이다.
     *
     * 이 함수를 읽는 자리들이 곧 «인성 전용 구간»이다 (🚧 주석) —
     * 픽커로 잡기를 시작하는 날, 그 표시를 따라 인성 수순을 떼어낸다.
     */
    fun supportsCatching(code: String): Boolean =
        com.onedal.app.plugins.DispatchPluginRegistry.get(code).supportsCatching
}
