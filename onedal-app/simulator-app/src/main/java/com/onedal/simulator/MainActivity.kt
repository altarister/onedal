package com.onedal.simulator

import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * 인성콜 시뮬레이터 WebView 래퍼
 *
 * 브라우저(삼성/크롬)가 웹 콘텐츠를 접근성 노드로 노출하지 않는 문제를 우회하기 위해,
 * 자체 앱 안의 WebView로 시뮬레이터를 로드합니다.
 *
 * 패키지명이 com.onedal.simulator로 원달 앱(com.onedal.app)과 다르기 때문에,
 * 원달의 접근성 서비스가 이 앱의 WebView 콘텐츠를 정상적으로 읽을 수 있습니다.
 */
class MainActivity : Activity() {

    companion object {
        private const val SIMULATOR_URL = "https://map.altari.com/inseong"
    }

    private lateinit var webView: WebView

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

            // 시뮬레이터 로드
            loadUrl(SIMULATOR_URL)
        }
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
