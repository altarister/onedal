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

    /** 🎛️ 모드 이름 한 벌 — 관제웹이 보내는 값. 배차망마다 쓸 수 있는 모드는 여기서 파생한다 (`availableModes`) */
    val ALL_MODES: Set<String> = setOf("AUTO", "MANUAL", "SIMULATION", "ALARM")

    /**
     * 🎛️ **이 배차망에서 실제로 도는 모드** — 저장하지 않고 매번 계산한다 (기사님 확정 · README 규칙 ③).
     *
     * 모드는 서버 응답 때, 배차망은 화면 글자로 **다른 때에** 바뀐다. 한 번 바꿔 저장하면 화면이 픽커로 넘어갈 때 다시 돌지 않는다.
     * 🔴 바꾸는 것은 «자동인데 그 배차망에 자동이 없다» 하나뿐이다 → 알람과 똑같이 (기사님 결정).
     *    모르는 값은 그대로 둔다 — 모르면 잡지 않는다(README 규칙 ④). 알람으로 바꾸면 앱이 상세에 들어가 소리를 낸다.
     */
    fun effectiveMode(requested: String, code: String): String =
        if (requested == "AUTO" && "AUTO" !in com.onedal.app.plugins.DispatchPluginRegistry.get(code).availableModes) "ALARM"
        else requested

    /** 실제 카카오T픽커 앱의 이름 (0830 실측) — 배차망을 정하는 데는 쓰지 않는다 (`isKakaoPickerApp`) */
    const val KAKAOPICKER_PACKAGE = "com.kakaomobility.flexer"

    /**
     * 🧪 배차망 시뮬레이터 앱의 이름 — 설정 화면 «테스트 가상 콜 화면 열기»가 켠다.
     * 🔴 배차망을 정하는 데 쓰지 않는다 — 시뮬레이터는 세 배차망을 한 앱으로 띄운다 (`networksOnScreen`).
     */
    const val SIMULATOR_PACKAGE = "com.onedal.simulator"

    /** 🏷️ 실물 배차망 앱 이름 — 여기 있을 때만 보고가 real 이다. 실물 인성·화물24시는 설치하는 날 이 줄에 더한다 */
    private val REAL_NETWORK_PACKAGES = setOf(KAKAOPICKER_PACKAGE)

    /**
     * 🏷️ **이 화면의 보고는 실물인가 시뮬인가** — 통계·뉴스레터는 real 만 센다 (`TargetAppSourceTest`).
     * 🔴 실물 목록에 없으면 전부 sim — 시뮬 쪽 이름을 막는 식이면 크롬·다른 브라우저가 «실물»로 샌다. 이름을 모르면 싣지 않는다
     */
    fun sourceOf(pkg: String?): String? = when {
        pkg == null -> null
        pkg in REAL_NETWORK_PACKAGES -> "real"
        else -> "sim"
    }

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

    /**
     * 📡 **배차망 앱에서 온 알림인가** — 픽커 · 시뮬레이터 · 마지막으로 배차망 화면이던 앱(인성·화물24 · 화면 글자로 정한 것).
     * 내비·상태줄 알림은 아니다 — 세면 운행 중 «목록이 조용하다»가 안 와 조용한 다시 읽기가 멈춘다 (`NetworkEventSourceTest`).
     */
    fun isNetworkPackage(pkg: String?, lastNetworkPackage: String?): Boolean =
        pkg != null && (isKakaoPickerApp(pkg) || pkg == SIMULATOR_PACKAGE || pkg == lastNetworkPackage)

    /** 📱 붙는 순간 화면이 **실물 배차망 목록**이면 운행 기록을 켠다 — 앱을 새로 깔면 목록에서 바로 붙어 «홈에서 목록으로» 조건이 영영 안 온다(09-30 14:13) */
    fun startsTraceOnAttach(pkg: String?, isList: Boolean): Boolean = isList && sourceOf(pkg) == "real"


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
}
