package kr.co.onedal.dashboard;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelUuid;
import android.os.SystemClock;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.GZIPOutputStream;

import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.engineio.client.transports.WebSocket;

/**
 * 📡 **관제앱 공급 서비스** — 화면을 꺼도 서버 공급 소켓(`/supply`)에 붙어 있고, 받은 값을 블루투스로 스캔폰 셋까지 넘긴다 (reviews/50 ①-2).
 * 관제웹 화면(웹뷰) 소켓은 화면을 끄면 1분 안에 끊긴다(0-2b 시험) — 그래서 서버 연결도 이 네이티브 서비스가 직접 쥔다.
 * 포그라운드 서비스(연결 기기 형)라 상단 알림 «1DAL 관제 중»이 늘 뜬다 — 안드로이드가 얼리지 않게 하는 값이다(0-2 시험).
 *
 * - 서버: `phone-supply`(필터 · 폰마다 모드 · 심사 중 · 짝 서명)의 마지막 값을 들고 있다 · `phone-decision` → 그 폰에 DECISION · `phone-fold` → FOLD · 폰 ACK → `phone-decision-ack`
 * - 블루투스: 서비스 UUID 로 검색 → 광고 표시(기사님 · 영업일 · 공급 `adTags`)가 우리 것인 폰에만 붙는다(남의 기사님 폰에 자리를 잡지 않게) →
 *   🔏 주고받기 증명(짝 서명은 공중에 안 보낸다): 붙으면 CHALLENGE `{nonce}` → 폰 HELLO `{deviceId, mac, nonce}` 의 mac 이 HMAC(공급의 그 폰 서명, 내 nonce) 와 맞으면
 *   PROOF `{proof: HMAC(서명, 폰 nonce)}` 를 보내 폰도 이쪽을 믿게 한다 — 맞아야 그 연결 = 그 폰 · 다르면 끊고 10분 안 붙음.
 *   폰 줄에 아직 없으면(원달앱이 서버 보고를 하기 전) 붙은 채 기다리고, 30초 넘으면 막지 않고 끊었다 다시 찾는다 — 그동안 원달앱은 «서버 답 받기 전»(수동)이다.
 *   검색은 공급의 살아 있는 폰 수만큼 붙으면 멈춘다(셋은 상한) · MTU 185 미만 연결은 쓰지 않는다(작은 칸 한 번 쓰기에 결재가 들어가야 한다).
 * - 보내기: 폰마다 쓰기 줄 하나(GATT 는 한 번에 한 작업) · 작은 칸(PHONE · DECISION · BREATH)을 큰 칸(SUPPLY 조각) 사이사이에 먼저 —
 *   큰 필터를 보내는 도중에도 결재가 늦지 않는다. SUPPLY 는 판이 바뀔 때와 새로 붙을 때만 · PHONE 은 그 폰 몫이 바뀔 때만.
 * - 1초마다 BREATH(서버 소켓이 붙었나) · 5초 동안 아무것도 못 들으면 끊고 다시 검색.
 * - 서버가 토큰을 거절하면(만료 · 계정 막힘) 같은 토큰으로 끝없이 붙지 않고 멈춘다 · 저장을 지운다.
 * 모든 콜백은 메인 핸들러로 옮겨 한 줄로 돈다 — 상태를 여러 실이 동시에 만지지 않는다.
 */
@SuppressLint("MissingPermission")
public class SupplyService extends Service {

    static final String TAG = "1DAL_SUPPLY";
    static final String PREFS = "onedal_supply";
    static final String KEY_URL = "serverUrl";
    static final String KEY_TOKEN = "token";
    static final String KEY_LAST_ERROR = "lastError";
    static final String CHANNEL = "onedal_supply";
    private static final int NOTIFY_ID = 4001;
    private static final int MAX_PHONES = 3;
    private static final long HELLO_WAIT_MS = 30_000;
    private static final long BLOCK_MS = 10 * 60_000;
    private static final long SHORT_BLOCK_MS = 60_000;
    private static final int MIN_MTU = 185;

    /** 서버가 이 까닭으로 거절하면 같은 토큰으로는 다시 붙지 않는다 — 서버 `authSocket` · `webAccountGate` 의 거절 글 */
    private static final String[] AUTH_REJECTS = { "인증 토큰 없음", "토큰 만료 또는 위조", "이 서버에 등록되지 않은 계정", "ACCOUNT_BLOCKED" };

    private final Handler h = new Handler(Looper.getMainLooper());
    private BluetoothManager bt;
    private Socket socket;
    private String socketUrl;
    private String socketToken;
    private boolean serverAlive = false;
    private JSONObject lastSupply;
    private final Map<String, Link> links = new HashMap<>();
    private final Map<String, Long> blocked = new HashMap<>();
    /** 폰마다 «받았음»이 안 온 마지막 결재 — 폰이 (다시) 붙으면 보낸다 */
    private final Map<String, JSONObject> unacked = new HashMap<>();
    /** 폰마다 마지막 빨리 접기 — 남은 시간이 다할 때까지 들고 있다가 그 폰이 (다시) 붙으면 줄여서 보낸다(서버는 한 번만 보낸다) */
    private final Map<String, JSONObject> folds = new HashMap<>();
    private final Map<String, Long> foldAt = new HashMap<>();
    /** 서버 소켓이 끊긴 동안 폰이 보낸 «받았음» — 다시 붙으면 보낸다(서버의 다시 보내기 한 바퀴를 줄인다) */
    private final ArrayList<JSONObject> pendingAcks = new ArrayList<>();
    private boolean scanning = false;
    private String shownText = "";

    /** 📱 블루투스 연결 하나 = 스캔폰 하나(HELLO 서명이 맞은 뒤) */
    private final class Link {
        final BluetoothDevice device;
        BluetoothGatt gatt;
        BluetoothGattCharacteristic small;
        BluetoothGattCharacteristic big;
        int mtu = 23;
        boolean ready = false;
        boolean writing = false;
        String deviceId;
        String helloDeviceId;
        String helloMac;
        String helloNonce;
        String myNonce;
        long helloAt = 0;
        long lastHeard = SystemClock.elapsedRealtime();
        String sentSupplyVersion;
        String sentPhone;
        final ArrayDeque<byte[]> smallQ = new ArrayDeque<>();
        final ArrayDeque<byte[]> bigQ = new ArrayDeque<>();
        byte[] nextSupply;

        Link(BluetoothDevice d) { device = d; }
        String name() { return deviceId != null ? deviceId : device.getAddress(); }
    }

    // ─────────────────────────── 서비스 생애 ───────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        bt = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        ensureChannel(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        String url = p.getString(KEY_URL, null);
        String token = p.getString(KEY_TOKEN, null);
        if (url == null || token == null) {
            Log.i(TAG, "저장된 서버 · 토큰이 없다 — 서비스를 내린다");
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            Notification n = buildNotification("서버에 붙는 중");
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFY_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            else startForeground(NOTIFY_ID, n);
        } catch (Exception e) {
            // 블루투스 허락이 거둬진 채 다시 뜬 경우 — 앱이 죽지 않게 내리고 끝낸다
            Log.w(TAG, "상단 알림 서비스를 못 띄웠다 — " + e.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }
        connectSocket(url, token);
        updateScan();
        h.removeCallbacks(tick);
        h.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        h.removeCallbacksAndMessages(null);
        if (socket != null) { socket.off(); socket.disconnect(); socket = null; }
        stopScan();
        for (Link l : new ArrayList<>(links.values())) closeLink(l, "서비스 내림");
        Log.i(TAG, "공급 서비스 내려감");
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "1DAL 관제 중", NotificationManager.IMPORTANCE_LOW));
        }
    }

    private Notification buildNotification(String text) {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        return b.setContentTitle("1DAL 관제 중").setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth).setOngoing(true).setContentIntent(pi).build();
    }

    private void showStatus() {
        int phones = 0;
        for (Link l : links.values()) if (l.deviceId != null) phones++;
        String text = "폰 " + phones + "대 · 서버 " + (serverAlive ? "붙음" : "끊김");
        if (text.equals(shownText)) return;
        shownText = text;
        getSystemService(NotificationManager.class).notify(NOTIFY_ID, buildNotification(text));
    }

    // ─────────────────────────── 서버 공급 소켓 ───────────────────────────

    private void connectSocket(String url, String token) {
        if (socket != null && url.equals(socketUrl) && token.equals(socketToken)) return;
        if (socket != null) { socket.off(); socket.disconnect(); }
        socketUrl = url;
        socketToken = token;
        IO.Options opts = IO.Options.builder()
            .setTransports(new String[] { WebSocket.NAME })
            .setAuth(Collections.singletonMap("token", token))
            .setReconnection(true)
            .build();
        socket = IO.socket(URI.create(url + BleProtocol.SUPPLY_NAMESPACE), opts);
        socket.on(Socket.EVENT_CONNECT, a -> h.post(() -> { serverAlive = true; Log.i(TAG, "📡 공급 소켓 붙음 " + url); flushAcks(); showStatus(); }));
        socket.on(Socket.EVENT_DISCONNECT, a -> h.post(() -> { serverAlive = false; Log.i(TAG, "📡 공급 소켓 끊김 " + (a.length > 0 ? a[0] : "")); showStatus(); }));
        socket.on(Socket.EVENT_CONNECT_ERROR, a -> h.post(() -> onConnectError(a.length > 0 ? a[0] : null)));
        socket.on(BleProtocol.EVENT_SUPPLY, a -> { if (a.length > 0 && a[0] instanceof JSONObject) { JSONObject s = (JSONObject) a[0]; h.post(() -> onSupply(s)); } });
        socket.on(BleProtocol.EVENT_DECISION, a -> { if (a.length > 0 && a[0] instanceof JSONObject) { JSONObject d = (JSONObject) a[0]; h.post(() -> onDecision(d)); } });
        socket.on(BleProtocol.EVENT_FOLD, a -> { if (a.length > 0 && a[0] instanceof JSONObject) { JSONObject f = (JSONObject) a[0]; h.post(() -> onFold(f)); } });
        socket.connect();
    }

    private void onConnectError(Object err) {
        serverAlive = false;
        String why = err instanceof JSONObject ? ((JSONObject) err).optString("message") : String.valueOf(err);
        for (String reject : AUTH_REJECTS) {
            if (why.contains(reject)) {
                Log.w(TAG, "🛑 서버가 토큰을 거절 — " + why + " · 멈추고 저장을 지운다(관제앱에서 다시 로그인)");
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_URL).remove(KEY_TOKEN)
                    .putString(KEY_LAST_ERROR, "공급 서버 연결 끊김 — 다시 로그인 필요 (" + why + ")").apply();
                stopSelf();
                return;
            }
        }
        Log.i(TAG, "📡 공급 소켓 못 붙음 — " + why + " · 다시 시도");
        showStatus();
    }

    private void onSupply(JSONObject s) {
        lastSupply = s;
        updateScan();
        for (Link l : new ArrayList<>(links.values())) {
            if (l.deviceId != null) pushState(l);
            else if (l.helloMac != null) tryVerify(l);
        }
    }

    private void onDecision(JSONObject d) {
        String deviceId = d.optString("deviceId", null);
        if (deviceId == null) return;
        unacked.put(deviceId, d);
        Link l = linkOf(deviceId);
        if (l != null) sendDecision(l, d);
        else Log.i(TAG, "⚖️ 결재 " + d.optString("orderId") + " — " + deviceId + " 가 블루투스로 안 붙어 있다(붙으면 보낸다)");
    }

    private void onFold(JSONObject f) {
        String deviceId = f.optString("deviceId", null);
        if (deviceId == null) return;
        folds.put(deviceId, f);
        foldAt.put(deviceId, SystemClock.elapsedRealtime());
        Link l = linkOf(deviceId);
        if (l != null) sendFold(l);
    }

    /** ⏩ 그 폰의 마지막 빨리 접기를 남은 ms 만큼 줄여 보낸다 — 이미 지났으면 버린다 */
    private void sendFold(Link l) {
        JSONObject f = folds.get(l.deviceId);
        Long at = foldAt.get(l.deviceId);
        if (f == null || at == null) return;
        long remain = f.optLong("remainMs") - (SystemClock.elapsedRealtime() - at);
        if (remain <= 0) { folds.remove(l.deviceId); foldAt.remove(l.deviceId); return; }
        try {
            l.smallQ.add(small(BleProtocol.FOLD, new JSONObject().put("orderId", f.optString("orderId")).put("remainMs", remain).toString()));
            Log.i(TAG, "⏩ " + l.deviceId + " 에 빨리 접기 " + f.optString("orderId") + " · " + remain + "ms");
            pump(l);
        } catch (Exception ignored) { }
    }

    // ─────────────────────────── 블루투스 검색 · 연결 ───────────────────────────

    private final ScanCallback scanCb = new ScanCallback() {
        @Override public void onScanResult(int type, ScanResult r) {
            byte[] tag = r.getScanRecord() == null ? null : r.getScanRecord().getServiceData(new ParcelUuid(BleProtocol.SERVICE));
            h.post(() -> { if (isOurTag(tag)) onFound(r.getDevice()); else noteOtherTag(r.getDevice().getAddress(), tag); });
        }
        @Override public void onScanFailed(int code) {
            h.post(() -> { scanning = false; Log.w(TAG, "검색 실패 " + code + " — 3초 뒤 다시"); h.postDelayed(SupplyService.this::startScan, 3000); });
        }
    };

    /** 📶 광고 표시가 이 기사님 것(오늘 · 어제)인가 — 공급을 아직 못 받았으면 아무 폰에도 안 붙는다 */
    private boolean isOurTag(byte[] tag) {
        if (tag == null || lastSupply == null) return false;
        StringBuilder hex = new StringBuilder();
        for (byte b : tag) hex.append(String.format("%02x", b));
        org.json.JSONArray tags = lastSupply.optJSONArray("adTags");
        if (tags == null) return false;
        for (int i = 0; i < tags.length(); i++) if (hex.toString().equals(tags.optString(i))) return true;
        return false;
    }

    /** 표시가 다른(또는 없는 — 스캔 응답이 빠진 기기) 폰 — 주소마다 1분에 한 줄만 남긴다 */
    private final Map<String, Long> otherTagLogged = new HashMap<>();
    private void noteOtherTag(String addr, byte[] tag) {
        long now = SystemClock.elapsedRealtime();
        Long at = otherTagLogged.get(addr);
        if (at != null && now - at < 60_000) return;
        otherTagLogged.put(addr, now);
        Log.i(TAG, "📶 찾음 " + addr + " · 표시 " + (tag == null ? "null(스캔 응답 없음)" : tag.length + "바이트 — 우리 기사님 것 아님") + (lastSupply == null ? " · 공급 아직 없음" : ""));
    }

    /** 🔎 붙어야 할 폰 수 = 공급의 살아 있는 폰 수(셋은 상한) — 다 붙었으면 검색을 멈추고, 모자라면 다시 찾는다 */
    private void updateScan() {
        JSONObject phones = lastSupply == null ? null : lastSupply.optJSONObject("phones");
        int wanted = phones == null ? 0 : Math.min(MAX_PHONES, phones.length());
        if (links.size() >= wanted) stopScan();
        else startScan();
    }

    private void startScan() {
        if (scanning || links.size() >= MAX_PHONES || bt == null || bt.getAdapter() == null || !bt.getAdapter().isEnabled()) return;
        BluetoothLeScanner sc = bt.getAdapter().getBluetoothLeScanner();
        if (sc == null) return;
        try {
            sc.startScan(Collections.singletonList(new ScanFilter.Builder().setServiceUuid(new ParcelUuid(BleProtocol.SERVICE)).build()),
                new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_BALANCED).build(), scanCb);
            scanning = true;
            Log.i(TAG, "🔎 스캔폰 검색 시작");
        } catch (Exception e) {
            Log.w(TAG, "검색을 못 했다 — " + e.getMessage());
        }
    }

    private void stopScan() {
        if (!scanning) return;
        scanning = false;
        try {
            BluetoothLeScanner sc = bt.getAdapter().getBluetoothLeScanner();
            if (sc != null) sc.stopScan(scanCb);
        } catch (Exception ignored) { }
    }

    private void onFound(BluetoothDevice d) {
        String addr = d.getAddress();
        Long until = blocked.get(addr);
        if (links.containsKey(addr) || (until != null && until > SystemClock.elapsedRealtime()) || links.size() >= MAX_PHONES) return;
        Link l = new Link(d);
        links.put(addr, l);
        Log.i(TAG, "📶 찾음 " + addr + " → 붙기");
        l.gatt = d.connectGatt(this, false, gattCb, BluetoothDevice.TRANSPORT_LE);
        updateScan();
    }

    private Link linkOfGatt(BluetoothGatt g) { return links.get(g.getDevice().getAddress()); }

    private Link linkOf(String deviceId) {
        for (Link l : links.values()) if (deviceId.equals(l.deviceId)) return l;
        return null;
    }

    private void closeLink(Link l, String why) {
        links.remove(l.device.getAddress());
        try { if (l.gatt != null) { l.gatt.disconnect(); l.gatt.close(); } } catch (Exception ignored) { }
        Log.i(TAG, "📴 " + l.name() + " 끊음 — " + why);
        showStatus();
        h.postDelayed(this::updateScan, 1000);
    }

    private final BluetoothGattCallback gattCb = new BluetoothGattCallback() {
        @Override public void onConnectionStateChange(BluetoothGatt g, int status, int state) {
            h.post(() -> {
                Link l = linkOfGatt(g);
                if (l == null) { try { g.close(); } catch (Exception ignored) { } return; }
                if (state == BluetoothProfile.STATE_CONNECTED) {
                    g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH);
                    g.requestMtu(517);
                } else closeLink(l, "블루투스 끊김 (status " + status + ")");
            });
        }
        @Override public void onMtuChanged(BluetoothGatt g, int mtu, int status) {
            h.post(() -> {
                Link l = linkOfGatt(g);
                if (l == null) return;
                if (status != BluetoothGatt.GATT_SUCCESS || mtu < MIN_MTU) {
                    blocked.put(l.device.getAddress(), SystemClock.elapsedRealtime() + SHORT_BLOCK_MS);
                    closeLink(l, "MTU " + mtu + " (status " + status + ") — 결재가 한 번 쓰기에 안 들어간다 · 1분 뒤 다시");
                    return;
                }
                l.mtu = mtu;
                g.discoverServices();
            });
        }
        @Override public void onServicesDiscovered(BluetoothGatt g, int status) {
            h.post(() -> {
                Link l = linkOfGatt(g);
                if (l == null) return;
                BluetoothGattService s = g.getService(BleProtocol.SERVICE);
                BluetoothGattCharacteristic notify = s == null ? null : s.getCharacteristic(BleProtocol.NOTIFY);
                l.small = s == null ? null : s.getCharacteristic(BleProtocol.SMALL);
                l.big = s == null ? null : s.getCharacteristic(BleProtocol.BIG);
                if (notify == null || l.small == null || l.big == null) { closeLink(l, "공급 서비스 칸이 없다"); return; }
                g.setCharacteristicNotification(notify, true);
                BluetoothGattDescriptor cccd = notify.getDescriptor(BleProtocol.CCCD);
                if (cccd == null) { closeLink(l, "알림 칸 설정이 없다"); return; }
                if (Build.VERSION.SDK_INT >= 33) g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                else { cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE); g.writeDescriptor(cccd); }
            });
        }
        @Override public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
            h.post(() -> {
                Link l = linkOfGatt(g);
                if (l == null) return;
                l.ready = true;
                l.lastHeard = SystemClock.elapsedRealtime();
                l.helloAt = l.lastHeard;
                l.myNonce = nonce();
                try { l.smallQ.add(small(BleProtocol.CHALLENGE, new JSONObject().put("nonce", l.myNonce).toString())); } catch (Exception ignored) { }
                Log.i(TAG, "📶 " + l.device.getAddress() + " 준비됨 · MTU " + l.mtu + " — CHALLENGE 보내고 HELLO 를 기다린다");
                pump(l);
            });
        }
        @Override public void onCharacteristicWrite(BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
            h.post(() -> {
                Link l = linkOfGatt(g);
                if (l == null) return;
                l.writing = false;
                if (status != BluetoothGatt.GATT_SUCCESS) { closeLink(l, "쓰기 실패 " + status); return; }
                l.lastHeard = SystemClock.elapsedRealtime();
                pump(l);
            });
        }
        @SuppressWarnings("deprecation")
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
            byte[] v = c.getValue();
            if (v != null) { byte[] copy = v.clone(); h.post(() -> onNotify(g, copy)); }
        }
        @Override public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
            h.post(() -> onNotify(g, value));
        }
    };

    // ─────────────────────────── 폰에서 온 것 ───────────────────────────

    private void onNotify(BluetoothGatt g, byte[] v) {
        Link l = linkOfGatt(g);
        if (l == null || v.length == 0) return;
        l.lastHeard = SystemClock.elapsedRealtime();
        byte kind = v[0];
        if (kind == BleProtocol.BREATH) return;
        JSONObject body;
        try { body = new JSONObject(new String(v, 1, v.length - 1, StandardCharsets.UTF_8)); }
        catch (Exception e) { Log.w(TAG, "📶 " + l.name() + " 본문을 못 읽었다 (종류 " + kind + ")"); return; }
        if (kind == BleProtocol.HELLO) {
            l.helloDeviceId = body.optString("deviceId", null);
            l.helloMac = body.optString("mac", null);
            l.helloNonce = body.optString("nonce", null);
            l.helloAt = l.lastHeard;
            tryVerify(l);
        } else if (kind == BleProtocol.ACK && l.deviceId != null) {
            String orderId = body.optString("orderId", null);
            if (orderId == null) return;
            JSONObject last = unacked.get(l.deviceId);
            if (last != null && orderId.equals(last.optString("orderId"))) unacked.remove(l.deviceId);
            try { pendingAcks.add(new JSONObject().put("deviceId", l.deviceId).put("orderId", orderId)); } catch (Exception ignored) { }
            Log.i(TAG, "✅ " + l.deviceId + " 결재 " + orderId + " 받았음");
            flushAcks();
        }
    }

    /** ✅ 들고 있던 «받았음»을 서버로 — 소켓이 끊겨 있으면 붙을 때(EVENT_CONNECT) 보낸다 */
    private void flushAcks() {
        if (socket == null || !socket.connected()) return;
        for (JSONObject a : pendingAcks) socket.emit(BleProtocol.EVENT_DECISION_ACK, a);
        pendingAcks.clear();
    }

    /** 🔏 HELLO 의 mac 을 HMAC(공급의 그 폰 서명, 내 nonce) 와 견준다 — 폰 줄에 아직 없으면 기다린다(onSupply · tick 이 다시 부른다) · 맞으면 PROOF */
    private void tryVerify(Link l) {
        if (l.deviceId != null || l.helloDeviceId == null || l.helloMac == null || l.helloNonce == null || l.myNonce == null || lastSupply == null) return;
        JSONObject phones = lastSupply.optJSONObject("phones");
        JSONObject p = phones == null ? null : phones.optJSONObject(l.helloDeviceId);
        if (p == null) return;
        String sig = p.optString("pairSig");
        if (sig.isEmpty() || !l.helloMac.equals(mac(sig, "hello|" + l.myNonce))) {
            blocked.put(l.device.getAddress(), SystemClock.elapsedRealtime() + BLOCK_MS);
            closeLink(l, "서명이 다르다 — 다른 기사님 폰 · 10분 안 붙음");
            return;
        }
        Link old = linkOf(l.helloDeviceId);
        if (old != null && old != l) closeLink(old, "같은 폰이 다시 붙었다");
        l.deviceId = l.helloDeviceId;
        try { l.smallQ.add(small(BleProtocol.PROOF, new JSONObject().put("proof", mac(sig, "proof|" + l.helloNonce)).toString())); } catch (Exception ignored) { }
        Log.i(TAG, "🔏 " + l.deviceId + " 증명 맞음 — PROOF 보내고 이 연결로 공급");
        showStatus();
        pushState(l);
        JSONObject d = unacked.get(l.deviceId);
        if (d != null) sendDecision(l, d);
        sendFold(l);
    }

    // ─────────────────────────── 폰으로 보내기 ───────────────────────────

    /** 📦 그 폰에 SUPPLY(판이 바뀌었으면) · PHONE(그 폰 몫이 바뀌었으면) */
    private void pushState(Link l) {
        if (lastSupply == null || l.deviceId == null) return;
        JSONObject phones = lastSupply.optJSONObject("phones");
        JSONObject p = phones == null ? null : phones.optJSONObject(l.deviceId);
        if (p == null) return;   // 서버가 아직(또는 더) 살아 있는 폰으로 안 본다 — 마지막 값을 그대로 둔다
        String version = lastSupply.optString("filterVersion");
        try {
            if (!version.equals(l.sentSupplyVersion)) {
                JSONObject body = new JSONObject().put("filter", lastSupply.opt("filter")).put("filterVersion", version);
                l.nextSupply = frameSupply(body.toString().getBytes(StandardCharsets.UTF_8));
                l.sentSupplyVersion = version;
            }
            String phone = new JSONObject().put("mode", p.optString("mode")).put("evaluatingNow", p.optBoolean("evaluatingNow")).toString();
            if (!phone.equals(l.sentPhone)) {
                l.smallQ.add(small(BleProtocol.PHONE, phone));
                l.sentPhone = phone;
            }
        } catch (Exception e) {
            Log.w(TAG, "공급을 못 만들었다 — " + e.getMessage());
        }
        pump(l);
    }

    private void sendDecision(Link l, JSONObject d) {
        try {
            JSONObject body = new JSONObject().put("orderId", d.optString("orderId")).put("action", d.optString("action"));
            if (d.has("foldMs")) body.put("foldMs", d.optLong("foldMs"));
            l.smallQ.add(small(BleProtocol.DECISION, body.toString()));
            Log.i(TAG, "⚖️ " + l.deviceId + " 에 결재 " + d.optString("orderId") + " " + d.optString("action"));
            pump(l);
        } catch (Exception ignored) { }
    }

    /** 🔏 HMAC-SHA256(열쇠 = 짝 서명 글자) 16진 앞 32자 — 원달앱 `BleFrames` 와 같은 셈 · 글 머리말 «hello|» · «proof|» 로 두 방향을 가른다(되비추기 막기) */
    static String mac(String pairSig, String text) {
        try {
            javax.crypto.Mac m = javax.crypto.Mac.getInstance("HmacSHA256");
            m.init(new javax.crypto.spec.SecretKeySpec(pairSig.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            StringBuilder hex = new StringBuilder();
            for (byte b : m.doFinal(text.getBytes(StandardCharsets.UTF_8))) hex.append(String.format("%02x", b));
            return hex.substring(0, 32);
        } catch (Exception e) { return ""; }
    }

    private static String nonce() {
        byte[] b = new byte[16];
        new java.security.SecureRandom().nextBytes(b);
        StringBuilder hex = new StringBuilder();
        for (byte x : b) hex.append(String.format("%02x", x));
        return hex.toString();
    }

    private static byte[] small(byte kind, String json) {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        byte[] out = new byte[b.length + 1];
        out[0] = kind;
        System.arraycopy(b, 0, out, 1, b.length);
        return out;
    }

    /** [길이 4 · 큰 끝][gzip JSON] */
    private static byte[] frameSupply(byte[] json) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        try (GZIPOutputStream z = new GZIPOutputStream(o)) { z.write(json); }
        byte[] gz = o.toByteArray();
        return ByteBuffer.allocate(4 + gz.length).putInt(gz.length).put(gz).array();
    }

    /** ✍️ 쓰기 한 번 — 작은 칸 먼저, 없으면 큰 칸 조각 · 큰 칸이 비면 다음 SUPPLY 를 쪼개 넣는다(보내던 틀은 끝까지 보낸다) */
    private void pump(Link l) {
        if (!l.ready || l.writing || l.gatt == null) return;
        byte[] value;
        BluetoothGattCharacteristic c;
        if (!l.smallQ.isEmpty()) { value = l.smallQ.poll(); c = l.small; }
        else {
            if (l.bigQ.isEmpty() && l.nextSupply != null) {
                int size = Math.max(20, Math.min(l.mtu - 3, BleProtocol.MAX_WRITE));
                byte[] f = l.nextSupply;
                l.nextSupply = null;
                for (int i = 0; i < f.length; i += size) {
                    byte[] part = new byte[Math.min(size, f.length - i)];
                    System.arraycopy(f, i, part, 0, part.length);
                    l.bigQ.add(part);
                }
                Log.i(TAG, "📦 " + l.deviceId + " 에 필터 보냄 · " + f.length + " 바이트 · 조각 " + l.bigQ.size());
            }
            if (l.bigQ.isEmpty()) return;
            value = l.bigQ.poll();
            c = l.big;
        }
        boolean ok;
        if (Build.VERSION.SDK_INT >= 33) ok = l.gatt.writeCharacteristic(c, value, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothGatt.GATT_SUCCESS;
        else { c.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT); c.setValue(value); ok = l.gatt.writeCharacteristic(c); }
        if (!ok) { closeLink(l, "쓰기를 시작하지 못했다"); return; }
        l.writing = true;
    }

    // ─────────────────────────── 1초 ───────────────────────────

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            long now = SystemClock.elapsedRealtime();
            for (Link l : new ArrayList<>(links.values())) {
                if (!l.ready) {
                    if (now - l.lastHeard > BleProtocol.SILENT_MS * 3) closeLink(l, "붙기를 못 마쳤다");
                    continue;
                }
                if (now - l.lastHeard > BleProtocol.SILENT_MS) { closeLink(l, (now - l.lastHeard) + "ms 동안 답 없음"); continue; }
                if (l.deviceId == null) {
                    if (now - l.helloAt > HELLO_WAIT_MS) {
                        closeLink(l, "30초 동안 공급의 폰 줄에 없다 — 막지 않고 다시 찾는다");
                        continue;
                    }
                    tryVerify(l);
                    continue;
                }
                l.smallQ.add(new byte[] { BleProtocol.BREATH, (byte) (serverAlive && socket != null && socket.connected() ? 1 : 0) });
                pump(l);
            }
            updateScan();
            showStatus();
            h.postDelayed(this, BleProtocol.BREATH_MS);
        }
    };
}
