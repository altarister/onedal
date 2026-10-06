package com.onedal.app.core

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID

/**
 * 📶 **관제앱 공급을 블루투스로 받는다 — 접근성 서비스 안 GATT 서버** (reviews/50 ①-3 · 틀은 `BleFrames`).
 * 관제앱(거는 쪽)이 이 폰에 붙어 필터(SUPPLY) · 이 폰 몫(PHONE: 모드 · 심사 중) · 결재(DECISION) · 빨리 접기(FOLD) · 숨(BREATH: 서버 살아 있음)을 쓴다.
 * - 광고: 서비스 UUID 는 광고 본문, 광고 표시(서버가 보고 답에 준 `bleAdTag` · 기사님 · 영업일)는 스캔 응답(31바이트 한계) — 관제앱은 표시가 맞는 폰에만 붙는다.
 * - 🔏 **주고받기 증명**(서명은 공중에 안 보낸다): 관제앱 CHALLENGE → 이 폰 HELLO `{deviceId, mac, nonce}` → 관제앱 PROOF.
 *   PROOF 가 맞은 기기 하나만 «관제앱»으로 든다 — 그 전에는 그 연결의 공급을 다 버리고 «공급 연결»도 안 켠다(근처 기기가 «자동»이나 KEEP 을 넣지 못하게).
 *   증명된 관제앱이 붙어 있는 동안은 광고를 멈춘다 · 끊기면 다시.
 * - 증명된 관제앱의 쓰기가 5초 동안 없으면 «공급 연결 끊김» — 원달앱은 자동을 알람으로 내린다(`TargetApp.runningMode`).
 * - 표시 · 서명이 바뀌면(영업일 · 다시 연결) 광고를 다시 한다. 블루투스 «근처 기기» 허락이 없으면 아무것도 안 띄운다(점검 탭 줄).
 * 모든 콜백은 메인 핸들러로 옮겨 한 줄로 돈다.
 */
@SuppressLint("MissingPermission")
class BleLink(private val ctx: Context, private val deviceIdOf: () -> String, private val listener: Listener) {

    interface Listener {
        fun onSupply(json: String)
        fun onPhone(json: String)
        fun onDecision(json: String)
        fun onFold(json: String)
        fun onServerAlive(alive: Boolean)
        fun onLinked(alive: Boolean)
    }

    companion object {
        private const val TAG = "BleLink"
        const val PREF_PAIR_SIG = "blePairSig"
        const val PREF_AD_TAG = "bleAdTag"
        const val PREF_NO_PERMISSION = "bleNoPermission"
        private const val UNPROVEN_MS = 10_000L

        /** 블루투스 «근처 기기» 허락이 있나 — 12 이상은 광고 · 연결 둘, 그 아래는 설치 권한이라 늘 있다 */
        fun hasPermission(c: Context): Boolean = Build.VERSION.SDK_INT < 31 ||
            (c.checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED &&
                c.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED)
    }

    private val h = Handler(Looper.getMainLooper())
    private val prefs = ctx.getSharedPreferences("OneDalPrefs", Context.MODE_PRIVATE)
    private val mgr = ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private var server: BluetoothGattServer? = null
    private var notifyChr: BluetoothGattCharacteristic? = null
    /** 붙은 기기마다 — 증명 전 · 후 (증명된 하나가 [central]) */
    private class Peer(val device: BluetoothDevice) {
        val connectedAt = SystemClock.elapsedRealtime()
        var subscribed = false
        var challenge: String? = null
        var myNonce: String? = null
        var proven = false
        val prepared = HashMap<UUID, ByteArrayOutputStream>()
    }
    private val peers = HashMap<String, Peer>()
    private var central: Peer? = null
    private var advertisedTag: String? = null
    private val outQ = ArrayDeque<Pair<BluetoothDevice, ByteArray>>()
    private var notifying = false
    private val big = BleFrames.BigAssembler()
    private var lastWriteMs = 0L
    private var linked = false
    private var started = false

    fun start() {
        if (started) return
        val permitted = hasPermission(ctx)
        prefs.edit().putBoolean(PREF_NO_PERMISSION, !permitted).apply()
        if (!permitted) {
            if (LogOnce.changed("ble-permission", "없음")) AppLogger.w(TAG, LogTag.NETWORK, "📶 [블루투스] «근처 기기» 허락이 없다 — 관제앱과 못 붙는다(점검 탭) · 허락하면 5초 안에 붙는다")
            h.postDelayed({ start() }, 5000)
            return
        }
        LogOnce.changed("ble-permission", "있음")
        if (mgr?.adapter?.isEnabled != true) AppLogger.w(TAG, LogTag.NETWORK, "📶 [블루투스] 꺼져 있다 — 켜지면 광고한다")
        started = true
        try { openServer() } catch (e: Exception) { AppLogger.e(TAG, "📶 [블루투스] GATT 서버를 못 열었다 — ${e.message}") }
        h.post(tick)
    }

    fun stop() {
        h.removeCallbacksAndMessages(null)
        try { mgr?.adapter?.bluetoothLeAdvertiser?.stopAdvertising(advCb) } catch (_: Exception) {}
        try { server?.close() } catch (_: Exception) {}
        server = null
        started = false
        setLinked(false)
    }

    /** ✅ 결재를 실행했다 — 증명된 관제앱으로 «받았음» */
    fun ack(orderId: String) {
        val c = central ?: return
        send(c.device, BleFrames.small(BleFrames.ACK, JSONObject().put("orderId", orderId).toString()))
    }

    // ─────────────────────────── GATT 서버 ───────────────────────────

    private fun openServer() {
        val s = mgr?.openGattServer(ctx, cb) ?: return
        server = s
        val svc = BluetoothGattService(BleFrames.SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        svc.addCharacteristic(BluetoothGattCharacteristic(BleFrames.SMALL, BluetoothGattCharacteristic.PROPERTY_WRITE, BluetoothGattCharacteristic.PERMISSION_WRITE))
        svc.addCharacteristic(BluetoothGattCharacteristic(BleFrames.BIG, BluetoothGattCharacteristic.PROPERTY_WRITE, BluetoothGattCharacteristic.PERMISSION_WRITE))
        val n = BluetoothGattCharacteristic(BleFrames.NOTIFY, BluetoothGattCharacteristic.PROPERTY_NOTIFY, BluetoothGattCharacteristic.PERMISSION_READ)
        n.addDescriptor(BluetoothGattDescriptor(BleFrames.CCCD, BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE))
        svc.addCharacteristic(n)
        notifyChr = n
        s.addService(svc)
    }

    private val cb = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(d: BluetoothDevice, status: Int, newState: Int) {
            h.post {
                if (newState == BluetoothProfile.STATE_CONNECTED) {
                    peers[d.address] = Peer(d)
                    AppLogger.i(TAG, LogTag.NETWORK, "📶 [블루투스] 기기 붙음 — 증명을 기다린다")
                } else {
                    peers.remove(d.address)
                    if (central?.device?.address == d.address) {
                        AppLogger.i(TAG, LogTag.NETWORK, "📶 [블루투스] 관제앱 끊김 (status $status)")
                        central = null
                        outQ.clear(); notifying = false; big.reset()
                        setLinked(false)
                        advertisedTag = null   // 다음 숨에서 광고를 다시
                    }
                }
            }
        }
        override fun onDescriptorWriteRequest(d: BluetoothDevice, id: Int, desc: BluetoothGattDescriptor, prep: Boolean, resp: Boolean, off: Int, v: ByteArray) {
            if (resp) server?.sendResponse(d, id, BluetoothGatt.GATT_SUCCESS, 0, null)
            h.post { peers[d.address]?.let { it.subscribed = true; sendHello(it) } }
        }
        override fun onCharacteristicWriteRequest(d: BluetoothDevice, id: Int, c: BluetoothGattCharacteristic, prep: Boolean, resp: Boolean, off: Int, v: ByteArray) {
            if (resp) server?.sendResponse(d, id, BluetoothGatt.GATT_SUCCESS, off, null)
            val copy = v.clone()
            val u = c.uuid
            h.post {
                val p = peers[d.address] ?: return@post
                if (prep) p.prepared.getOrPut(u) { ByteArrayOutputStream() }.write(copy)
                else onWrite(p, u, copy)
            }
        }
        override fun onExecuteWrite(d: BluetoothDevice, id: Int, execute: Boolean) {
            server?.sendResponse(d, id, BluetoothGatt.GATT_SUCCESS, 0, null)
            h.post {
                val p = peers[d.address] ?: return@post
                val done = HashMap(p.prepared); p.prepared.clear()
                if (execute) for ((u, b) in done) onWrite(p, u, b.toByteArray())
            }
        }
        override fun onNotificationSent(d: BluetoothDevice, status: Int) { h.post { notifying = false; pumpOut() } }
    }

    private fun onWrite(p: Peer, u: UUID, v: ByteArray) {
        try {
            if (u == BleFrames.SMALL) {
                val m = BleFrames.readSmall(v) ?: return
                when (m.kind) {
                    BleFrames.CHALLENGE -> { p.challenge = JSONObject(m.body).optString("nonce").ifEmpty { null }; sendHello(p); return }
                    BleFrames.PROOF -> { checkProof(p, JSONObject(m.body).optString("proof")); return }
                }
            }
            /* 🔏 증명 전 기기의 공급은 버린다 — «공급 연결»도 안 켠다 */
            if (!p.proven || central !== p) {
                if (LogOnce.changed("ble-unproven:${p.device.address}", "버림")) AppLogger.w(TAG, LogTag.NETWORK, "🔏 [블루투스] 증명 전 기기의 쓰기를 버린다")
                return
            }
            lastWriteMs = SystemClock.elapsedRealtime()
            setLinked(true)
            when (u) {
                BleFrames.BIG -> big.add(v)?.let { listener.onSupply(it) }
                BleFrames.SMALL -> {
                    val m = BleFrames.readSmall(v) ?: return
                    when (m.kind) {
                        BleFrames.BREATH -> m.serverAlive?.let { listener.onServerAlive(it) }
                        BleFrames.PHONE -> listener.onPhone(m.body)
                        BleFrames.DECISION -> listener.onDecision(m.body)
                        BleFrames.FOLD -> listener.onFold(m.body)
                        else -> AppLogger.w(TAG, LogTag.NETWORK, "📶 [블루투스] 모르는 종류 ${m.kind}")
                    }
                }
            }
        } catch (e: Exception) {
            AppLogger.e(TAG, "📶 [블루투스] 받은 것을 못 다뤘다 — ${e.message}")
        }
    }

    /** 🔏 관제앱의 PROOF 가 HMAC(짝 서명, 이 폰 nonce) 와 맞으면 그 기기가 관제앱이다 — 광고를 멈춘다 */
    private fun checkProof(p: Peer, proof: String) {
        val sig = prefs.getString(PREF_PAIR_SIG, null)
        val nonce = p.myNonce
        if (sig == null || nonce == null || proof != BleFrames.proofMac(sig, nonce)) {
            AppLogger.w(TAG, LogTag.NETWORK, "🔏 [블루투스] 증명이 틀렸다 — 그 기기를 끊는다")
            try { server?.cancelConnection(p.device) } catch (_: Exception) {}
            return
        }
        central?.takeIf { it !== p }?.let { old -> try { server?.cancelConnection(old.device) } catch (_: Exception) {} }
        p.proven = true
        central = p
        big.reset()
        try { mgr?.adapter?.bluetoothLeAdvertiser?.stopAdvertising(advCb) } catch (_: Exception) {}
        AppLogger.i(TAG, LogTag.NETWORK, "🔏 [블루투스] 관제앱 증명 맞음 — 이 연결로 공급을 받는다 · 광고 멈춤")
    }

    private fun setLinked(alive: Boolean) {
        if (alive == linked) return
        linked = alive
        AppLogger.i(TAG, LogTag.NETWORK, if (alive) "📶 [블루투스] 공급 연결 살아남" else "📶 [블루투스] 공급 연결 끊김 — 자동은 알람으로")
        listener.onLinked(alive)
    }

    /** 🔏 HELLO `{deviceId, mac: HMAC(짝 서명, 관제앱 nonce), nonce: 이 폰 nonce}` — 서명 · CHALLENGE 가 다 있을 때 한 번(서명은 서버 보고 답에서 온다 · 숨마다 다시 본다) */
    private fun sendHello(p: Peer) {
        if (!p.subscribed || p.myNonce != null) return
        val challenge = p.challenge ?: return
        val sig = prefs.getString(PREF_PAIR_SIG, null) ?: return
        val mine = BleFrames.nonce()
        p.myNonce = mine
        send(p.device, BleFrames.small(BleFrames.HELLO, JSONObject().put("deviceId", deviceIdOf()).put("mac", BleFrames.helloMac(sig, challenge)).put("nonce", mine).toString()))
        AppLogger.i(TAG, LogTag.NETWORK, "🔏 [블루투스] HELLO 보냄 — 관제앱의 증명을 기다린다")
    }

    private fun send(d: BluetoothDevice, b: ByteArray) { outQ.addLast(d to b); pumpOut() }

    private fun pumpOut() {
        val c = notifyChr ?: return
        if (notifying) return
        val (d, b) = outQ.removeFirstOrNull() ?: return
        if (!peers.containsKey(d.address)) { pumpOut(); return }
        notifying = true
        if (Build.VERSION.SDK_INT >= 33) server?.notifyCharacteristicChanged(d, c, false, b)
        else { @Suppress("DEPRECATION") run { c.value = b; server?.notifyCharacteristicChanged(d, c, false) } }
    }

    // ─────────────────────────── 광고 · 1초 ───────────────────────────

    private val advCb = object : AdvertiseCallback() {
        override fun onStartSuccess(s: AdvertiseSettings?) { AppLogger.i(TAG, LogTag.NETWORK, "📶 [블루투스] 광고 시작 · 표시 $advertisedTag") }
        override fun onStartFailure(e: Int) { AppLogger.w(TAG, LogTag.NETWORK, "📶 [블루투스] 광고 실패 $e"); advertisedTag = null }
    }

    private fun advertiseIfNeeded() {
        val tag = prefs.getString(PREF_AD_TAG, null) ?: return
        if (tag == advertisedTag || central != null) return   // 증명된 관제앱이 붙어 있는 동안은 광고하지 않는다
        val adv = mgr?.adapter?.takeIf { it.isEnabled }?.bluetoothLeAdvertiser ?: return
        try { adv.stopAdvertising(advCb) } catch (_: Exception) {}
        advertisedTag = tag
        adv.startAdvertising(
            AdvertiseSettings.Builder().setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY).setConnectable(true).build(),
            AdvertiseData.Builder().addServiceUuid(ParcelUuid(BleFrames.SERVICE)).build(),
            AdvertiseData.Builder().addServiceData(ParcelUuid(BleFrames.SERVICE), BleFrames.tagBytes(tag)).build(),
            advCb,
        )
    }

    private val tick = object : Runnable {
        override fun run() {
            try {
                if (server == null && mgr?.adapter?.isEnabled == true) openServer()
                advertiseIfNeeded()
                peers.values.forEach { sendHello(it) }
                /* 🔏 붙고 10초 안에 증명 안 된 기기는 끊는다 — 남이 GATT 연결 자리를 오래 잡지 못하게 */
                val now = SystemClock.elapsedRealtime()
                peers.values.filter { !it.proven && now - it.connectedAt > UNPROVEN_MS }.forEach { p ->
                    AppLogger.w(TAG, LogTag.NETWORK, "🔏 [블루투스] 10초 안에 증명 안 된 기기 — 끊는다")
                    try { server?.cancelConnection(p.device) } catch (_: Exception) {}
                    peers.remove(p.device.address)
                }
                if (linked && SystemClock.elapsedRealtime() - lastWriteMs > BleFrames.SILENT_MS) setLinked(false)
            } catch (e: Exception) {
                AppLogger.e(TAG, "📶 [블루투스] 숨 도중 — ${e.message}")
            }
            h.postDelayed(this, 1000)
        }
    }
}
