package com.onedal.simulator

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.text.InputType
import android.view.KeyEvent
import android.view.ViewGroup
import android.webkit.GeolocationPermissions
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * 🚚 **배차망 시뮬레이터 WebView 래퍼**
 *
 * 브라우저(삼성/크롬)가 웹 콘텐츠를 접근성 노드로 노출하지 않는 문제를 우회하려고,
 * 자체 앱 안의 WebView 로 시뮬레이터를 로드한다. 패키지명이 원달 앱(com.onedal.app)과
 * 달라서 원달의 접근성 서비스가 이 앱의 WebView 콘텐츠를 정상적으로 읽는다.
 *
 * 🔴 **화면에 버튼을 추가하지 않는다** — 이 화면은 원달 앱이 "배차망 화면"으로 읽는 곳이다.
 *    설정 UI 를 상시로 띄우면 접근성 트리에 섞여 파서를 흔든다.
 *    그래서 주소 변경은 **볼륨 위 버튼**으로 연다 (다이얼로그는 열려 있는 동안만 트리에 뜬다).
 *
 * 주소는 둘 중 하나다 (— 시뮬레이터를 레포 안으로 들이면서 열었다):
 *   · 배포본  https://map.altari.com/...   (옛 map 레포가 S3 로 배포한 것 — 기본값)
 *   · 로컬    http://<개발용 PC IP>:5173/... (레포의 `onedal-sim` — 문제지 모드가 여기 있다)
 * 원달 앱의 "개발용 PC IP" 설정과 같은 생각이다 — 폰을 다시 빌드하지 않고 붙일 곳을 바꾼다.
 */
class MainActivity : Activity() {

    companion object {
        private const val PREFS = "OnedalSimPrefs"
        private const val KEY_URL = "simulatorUrl"
        private const val KEY_IP = "localPcIp"
        // 붙을 곳은 둘 중 하나다 (기사님 확정):
        //   · 로컬  http://<개발용 PC IP>:5173  — 레포의 onedal-sim (배포 없이 바로 본다)
        //   · 서버  https://rehearsal.altari.com — 리허설 배차망 (실주행·차 안에서)
        // 어느 쪽이든 루트(/) 설정 한 장이 열린다 — 거기서 배차망·문제지·옵션을 고르고 시작한다
        // (이전에는 /inseong · /hwamul24 로 설정이 두 벌이었다)
        private const val REHEARSAL_BASE = "https://rehearsal.altari.com"
        private const val DEFAULT_IP = "172.30.1.72"
        private const val SIM_PORT = 5173
        private const val DEFAULT_URL = "$REHEARSAL_BASE/"
    }

    private lateinit var webView: WebView
    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        setUpWebView(webView)
        webView.loadUrl(currentUrl())

        applySystemBarInsets()

        // 📍 위치 권한이 없으면 한 번 청한다 — 거부해도 시뮬은 돈다 (서버·고정 좌표로 폴백)
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION), 1001)
        }
    }

    /**
     * ⚙️ **웹뷰 설정은 한 곳이다** (규칙 ③).
     *    처음 만들 때와 **렌더러가 죽어 다시 만들 때** 같은 함수를 부른다 —
     *    두 벌로 두면 한쪽만 고쳐져, 되살아난 화면이 원달앱에 다르게 읽힌다.
     */
    private fun setUpWebView(wv: WebView) {
        wv.settings.javaScriptEnabled = true          // 시뮬레이터 동작에 필수
        wv.settings.domStorageEnabled = true

        // 모바일 브라우저처럼 표시 (상단/하단 메뉴가 잘리지 않도록)
        wv.settings.loadWithOverviewMode = false
        wv.settings.useWideViewPort = false

        // 접근성 노드 노출을 위한 설정
        wv.settings.setSupportZoom(false)
        wv.settings.textZoom = 100

        // 모바일 User-Agent 강제 (데스크탑 모드 방지)
        wv.settings.userAgentString = wv.settings.userAgentString.replace("; wv", "")

        /**
         * 📍 **웹뷰가 위치를 물으면 허락한다**.
         * 시뮬 문제지가 «현위치 → 상차지» 거리를 여기서 잰다. 이 폰이 곧 기사님이므로
         * 되물을 것이 없다 — 대신 안드로이드 권한이 없으면 onCreate 에서 한 번 요청한다.
         */
        wv.settings.setGeolocationEnabled(true)

        // 외부 브라우저로 이탈 방지 · 렌더러가 죽으면 되살린다
        wv.webViewClient = reviveOnRendererDeath()
        wv.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(
                origin: String?, callback: GeolocationPermissions.Callback?,
            ) { callback?.invoke(origin, true, false) }
        }
    }

    /**
     * 🧟 **웹뷰 렌더러가 죽으면 되살린다 — 안 그러면 앱이 통째로 죽는다** (기사님 실측)
     *
     * 안드로이드는 웹뷰의 렌더러(별도 프로세스)가 죽었을 때 `onRenderProcessGone` 이
     * **`false` 를 돌려주면 앱 프로세스를 죽인다.** 기본 `WebViewClient` 가 바로 그 `false` 다.
     * 렌더러는 메모리가 빠듯하면 시스템이 걷어 가므로(로그캣 «Killing …:sandboxed_process0»),
     * 이 앱은 **아무 잘못 없이** 사라진다.
     *
     * 🔴 기사님 눈에는 «브라우저가 죽었다»로 보이고, 원달앱이 읽을 화면이 사라져
     *    **콜 목록이 0항목**이 된다. 실주행 한 바퀴를 세 번 끊어 먹은 자리다.
     *
     * 🔴 **죽은 웹뷰는 다시 못 쓴다** — 같은 자리에 새 웹뷰를 끼우고 보던 주소를 다시 연다.
     *    `destroy()` 를 먼저 불러 옛 것을 확실히 놓는다.
     * 🔴 **화면 구조는 그대로다** — 부모의 같은 자리·같은 레이아웃 인자로 갈아 끼운다.
     *    원달앱이 이 화면을 접근성 트리로 읽으므로 노드가 늘면 안 된다.
     */
    private fun reviveOnRendererDeath() = object : WebViewClient() {
        override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
            val dead = view ?: return true
            val url = currentUrl()
            val parent = dead.parent as? ViewGroup
            val at = parent?.indexOfChild(dead) ?: -1
            val params = dead.layoutParams
            val padL = dead.paddingLeft; val padT = dead.paddingTop
            val padR = dead.paddingRight; val padB = dead.paddingBottom
            parent?.removeView(dead)
            dead.destroy()

            val fresh = WebView(this@MainActivity).apply {
                id = R.id.webView
                setPadding(padL, padT, padR, padB)
            }
            if (params != null) parent?.addView(fresh, at, params) else parent?.addView(fresh, at)
            webView = fresh
            setUpWebView(fresh)
            fresh.loadUrl(url)
            Toast.makeText(this@MainActivity, "화면이 꺼져 다시 열었습니다", Toast.LENGTH_SHORT).show()
            return true      // 🔴 true 여야 안드로이드가 이 앱을 안 죽인다
        }
    }

    /**
     * 📏 **시스템 바 안쪽으로 들인다 — 안 하면 화면 위아래가 먹힌다**.
     *
     * `targetSdk 35`(안드로이드 15)부터 창이 **가장자리까지 확장**된다(edge-to-edge).
     * 그런데 이 앱에는 인셋을 먹는 코드가 **한 줄도 없어서** WebView 가 상태바·내비게이션 바
     * **뒤까지** 깔렸다. 실측(A24 · 1080x2340 · 450dpi = 384x832dp):
     *
     *   · 위  — 헤더(배차망 스위치가 사는 줄)가 **상태바에 가려 안 보였다**
     *   · 아래 — 「시작」 버튼이 **삼성 내비게이션 바 뒤**에 깔려 파란 조각만 보였다
     *
     * 웹에서 `100dvh` 는 **창 전체**라, 화면에 딱 맞춘 레이아웃일수록 양 끝이 잘린다.
     * 웹 쪽에서 `env(safe-area-inset-*)` 로 때울 수도 있지만 **화면마다** 챙겨야 하고
     * 껍데기는 그대로라 다른 화면에서 또 잘린다 — **껍데기에서 한 번 먹는 것이 맞다.**
     *
     * 🔴 **뷰 구조는 그대로다** — 패딩만 준다. 원달 앱이 이 화면을 접근성 트리로 읽으므로
     *    («화면에 버튼을 얹지 않는다»와 같은 이유) 노드를 늘리는 방식은 쓰지 않는다.
     */
    private fun applySystemBarInsets() {
        /**
         * 🔴 **리스너는 `decorView` 에 건다 — WebView 에 걸면 첫 배달을 놓친다**.
         *
         * 처음엔 `webView` 에 걸었는데 **화면이 그대로 잘렸다.** 인셋은 뷰가 창에 붙는
         * 순간 한 번 내려오는데, `onCreate` 에서 거는 시점이 그보다 늦으면 콜백이
         * **영영 안 온다** (그 뒤로 인셋이 변할 일이 없다 — 세로 고정 화면이다).
         * `decorView` 는 창 자신이라 항상 받고, `requestApplyInsets` 로 한 번 더 청한다.
         */
        /**
         * 🔴 **패딩은 «부모」가 먹는다 — WebView 에 주면 그림에 반영되지 않는다**.
         *
         * 인셋 값은 제대로 왔다(`top=77 bottom=135`). 그런데 `webView.setPadding` 으로는
         * **웹 콘텐츠가 여전히 상태바·내비바 자리에 그려졌다.** 그래서 감싼 `FrameLayout`
         * 에 패딩을 줘 **WebView 자체를 안쪽으로 줄인다** — 그러면 웹의 `100dvh` 도 그만큼
         * 줄어 화면 위아래가 안 먹힌다. 드러나는 테두리는 `@id/root` 의 검은 배경이다.
         */
        val frame = findViewById<android.view.View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            frame.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(window.decorView)
    }

    private fun currentUrl(): String = prefs.getString(KEY_URL, DEFAULT_URL) ?: DEFAULT_URL
    private fun localIp(): String = prefs.getString(KEY_IP, DEFAULT_IP) ?: DEFAULT_IP

    /** 볼륨 위 = 주소 바꾸기 (이 앱에서 소리를 쓸 일이 없다) */
    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            showUrlPicker()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    private fun showUrlPicker() {
        val ip = localIp()
        // 🔴 로컬 ↔ 서버, 둘뿐이다 (기사님 확정).
        //    홈(`/`)이 설정 한 장이라, 여기서는 어디로 붙을지만 고른다.
        val labels = arrayOf(
            "🏠 로컬  (http://$ip:$SIM_PORT)",
            "☁️ 서버  (rehearsal.altari.com)",
            "⚙️ 개발용 PC IP 바꾸기  (지금 $ip)",
            "✏️ 주소 직접 입력",
        )
        val urls = arrayOf(
            "http://$ip:$SIM_PORT/",
            "$REHEARSAL_BASE/",
        )

        AlertDialog.Builder(this)
            .setTitle("어느 배차망을 띄울까요")
            .setItems(labels) { _, which ->
                when (which) {
                    in urls.indices -> load(urls[which])
                    urls.size -> askText("개발용 PC IP", ip) { v ->
                        prefs.edit().putString(KEY_IP, v.trim()).apply()
                        Toast.makeText(this, "PC IP 저장: ${v.trim()}", Toast.LENGTH_SHORT).show()
                        showUrlPicker()
                    }
                    else -> askText("주소 직접 입력", currentUrl()) { v -> load(v.trim()) }
                }
            }
            .show()
    }

    private fun load(url: String) {
        prefs.edit().putString(KEY_URL, url).apply()
        webView.loadUrl(url)
        Toast.makeText(this, url, Toast.LENGTH_SHORT).show()
    }

    private fun askText(title: String, initial: String, onOk: (String) -> Unit) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_TEXT_VARIATION_URI
            setText(initial)
        }
        AlertDialog.Builder(this)
            .setTitle(title)
            .setView(input)
            .setPositiveButton("확인") { _, _ -> onOk(input.text.toString()) }
            .setNegativeButton("취소", null)
            .show()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
