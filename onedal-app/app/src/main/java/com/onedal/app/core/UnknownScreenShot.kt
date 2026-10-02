package com.onedal.app.core

/**
 * 📷 **못 알아본 화면을 찍을지 정한다** — 운영센터가 «그 화면이 무엇이었나»를 사진으로 특정하게 (reviews/37).
 *
 * - 보고 순간이 아니라 **1초 뒤에** 본다 — 픽커 «콜을 누른 직후 넘어가는 틀»(0.3~0.7초)은 찍지 않는다
 * - 🔴 **상세 사진 판독이 먼저다** — 접근성 사진은 0.33초에 한 번뿐이라, 판독 중이거나 마지막 사진에서 0.4초가 안 지났으면
 *   찍지 않고 글만 보낸다(그래도 겹치면 상세 판독 쪽이 `ShotGap` 만큼 미뤄 찍는다)
 * - 배차망마다 따로 두지 않는다 — «판독이 지금 도나»는 배차망 이름이 아니라 그 사실(`session.isVerifyingSnapshot`)로 읽는다
 * - «조금 뒤 다시 읽기는 안 된다»(`HijackService` UNKNOWN 갈래 주석)는 화면 노드 이야기다 — 사진은 픽셀이라 1초 뒤의 실제 화면이 찍힌다
 * - 사진은 가리지 않은 원본이다 — 서버가 운영센터 문으로만 열고 30일 뒤 지운다(서버 `core/anomalyShots`)
 * 찍고 보내는 손은 `HijackService` 가 `UnknownScreenReport.sink` 에 단다.
 */
object UnknownScreenShot {
    /** 보고 뒤 이만큼 기다렸다가 아직 모르는 화면이면 찍는다 */
    const val WAIT_MS = 1_000L
    /** 마지막 사진에서 이만큼 안 지났으면 안 찍는다 — 접근성 사진 간격(0.33초)에 여유를 둔다 */
    const val MIN_GAP_MS = 400L
    /** 접근성 `takeScreenshot` 최소 판 — 안드로이드 11 */
    private const val MIN_SDK = 30

    /** 안 찍는 까닭 — null 이면 찍는다 */
    fun whyNot(stillUnknown: Boolean, verifyingDetail: Boolean, msSinceLastShot: Long, sdk: Int): String? = when {
        sdk < MIN_SDK -> "안드로이드 11 미만"
        !stillUnknown -> "다른 화면으로 넘어감"
        verifyingDetail -> "상세 사진 판독 중"
        msSinceLastShot < MIN_GAP_MS -> "사진 간격 0.4초 안"
        else -> null
    }
}
