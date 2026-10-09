package com.onedal.app.core

import android.bluetooth.BluetoothAdapter

/**
 * 📶 **블루투스 어댑터가 꺼지고 켜질 때 GATT 서버를 어떻게 하나** — 값만 받는 판단(`BleLink` 수신기 · 1초 틱이 부른다 · 38 F07).
 * 꺼지면 안드로이드 블루투스 스택이 서버 등록 · 서비스 표를 지운다 — 원달앱이 쥔 서버 객체는 빈 껍데기라 버려야 한다.
 * 켜짐은 따로 다루지 않는다 — 서버가 없으면 1초 틱이 다시 연다(광고도 다시).
 */
object BleAdapterLife {
    /** 이 어댑터 상태에서 서버 · 연결 · 광고를 버리나 — 꺼지는 중 · 꺼짐 */
    fun dropsOn(state: Int): Boolean = state == BluetoothAdapter.STATE_TURNING_OFF || state == BluetoothAdapter.STATE_OFF

    /** 1초 틱이 서버를 다시 여나 — 없고 어댑터가 켜졌을 때만 */
    fun reopens(hasServer: Boolean, adapterOn: Boolean): Boolean = !hasServer && adapterOn
}
