package com.onedal.simulator

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.os.Bundle
import android.text.InputType
import android.view.KeyEvent
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.Toast

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
 * 주소는 둘 중 하나다 (2026-08-22 — 시뮬레이터를 레포 안으로 들이면서 열었다):
 *   · 배포본  https://map.altari.com/...   (옛 map 레포가 S3 로 배포한 것 — 기본값)
 *   · 로컬    http://<개발용 PC IP>:5173/... (레포의 `onedal-sim` — 문제지 모드가 여기 있다)
 * 원달 앱의 "개발용 PC IP" 설정과 같은 생각이다 — 폰을 다시 빌드하지 않고 붙일 곳을 바꾼다.
 */
class MainActivity : Activity() {

    companion object {
        private const val PREFS = "OnedalSimPrefs"
        private const val KEY_URL = "simulatorUrl"
        private const val KEY_IP = "localPcIp"
        // 붙을 곳은 둘 중 하나다 (기사님 확정 2026-08-24):
        //   · 로컬  http://<개발용 PC IP>:5173  — 레포의 onedal-sim (배포 없이 바로 본다)
        //   · 서버  https://rehearsal.altari.com — 리허설 배차망 (실주행·차 안에서)
        // 어느 쪽이든 /inseong · /hwamul24 설정 화면으로 들어가 문제지를 고른다.
        private const val REHEARSAL_BASE = "https://rehearsal.altari.com"
        private const val DEFAULT_IP = "172.30.1.58"
        private const val SIM_PORT = 5173
        private const val DEFAULT_URL = "$REHEARSAL_BASE/"
    }

    private lateinit var webView: WebView
    private val prefs by lazy { getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        webView.apply {
            // JavaScript 활성화 (시뮬레이터 동작에 필수)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true

            // 모바일 브라우저처럼 표시 (상단/하단 메뉴가 잘리지 않도록)
            settings.loadWithOverviewMode = false
            settings.useWideViewPort = false

            // 접근성 노드 노출을 위한 설정
            settings.setSupportZoom(false)
            settings.textZoom = 100

            // 모바일 User-Agent 강제 (데스크탑 모드 방지)
            settings.userAgentString = settings.userAgentString.replace("; wv", "")

            // 외부 브라우저로 이탈 방지
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()

            loadUrl(currentUrl())
        }
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
        // 🔴 로컬 ↔ 서버, 둘뿐이다 (기사님 확정 2026-08-24).
        //    홈(`/`)이 인성·화물24 분기 페이지라, 여기서는 어디로 붙을지만 고른다.
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
