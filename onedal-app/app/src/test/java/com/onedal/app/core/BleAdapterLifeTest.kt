package com.onedal.app.core

import android.bluetooth.BluetoothAdapter
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 📶 **블루투스가 꺼지면 GATT 서버를 버리고, 켜지면 1초 틱이 다시 연다** (38 F07 · 71 «가»).
 * 꺼지면 안드로이드 블루투스 스택이 서버 등록 · 서비스 표를 지우는데 원달앱은 빈 껍데기 서버를 쥔 채 «있음»으로 보고 다시 안 열었다 —
 * 관제앱이 붙으면 «공급 서비스 칸이 없다»를 되풀이하고, 접근성을 다시 켜야 붙었다(71판 V5 · 72판 G6).
 * 못 잡는 것: 수신기 등록 배선 · 실제 스택이 서비스를 지우는지 — 폰 G6.
 */
class BleAdapterLifeTest {
    @Test fun `꺼짐 둘에 서버를 버린다 · 켜짐 둘에는 안 버린다`() {
        assertTrue(BleAdapterLife.dropsOn(BluetoothAdapter.STATE_TURNING_OFF))
        assertTrue(BleAdapterLife.dropsOn(BluetoothAdapter.STATE_OFF))
        assertFalse(BleAdapterLife.dropsOn(BluetoothAdapter.STATE_ON))
        assertFalse(BleAdapterLife.dropsOn(BluetoothAdapter.STATE_TURNING_ON))
    }

    @Test fun `틱은 서버가 없고 어댑터가 켜졌을 때만 다시 연다`() {
        assertTrue(BleAdapterLife.reopens(hasServer = false, adapterOn = true))
        assertFalse(BleAdapterLife.reopens(hasServer = true, adapterOn = true))
        assertFalse(BleAdapterLife.reopens(hasServer = false, adapterOn = false))
    }
}
