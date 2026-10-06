package kr.co.onedal.dashboard;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

/**
 * 📡 **관제웹 → 공급 서비스 다리** (reviews/50 ①-2) — 로그인하면 `start`, 로그아웃하면 `stop`.
 * 🔴 **권한을 다 받은 뒤에만 서비스를 띄운다** — 안드로이드 14 이상은 블루투스 허락 없이 연결 기기 형 상단 알림 서비스를 띄우면 앱이 죽는다.
 *    거절이면 띄우지 않고 `{started: false, denied: [...]}` 를 돌려준다.
 * 토큰 · 서버 주소는 앱 전용 저장소에 둔다 — 서비스가 다시 떠도(START_STICKY) 붙게. 관제웹 localStorage 와 같은 값 · 같은 앱 안이다.
 */
@CapacitorPlugin(
    name = "Supply",
    permissions = {
        @Permission(alias = "ble", strings = { Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION }),
        @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class SupplyPlugin extends Plugin {

    /** 이 기기에서 물어야 할 권한 묶음 — 안드로이드 12 이상은 블루투스 둘, 그 아래는 검색에 위치 · 13 이상은 알림 */
    private String[] neededAliases() {
        List<String> a = new ArrayList<>();
        a.add(Build.VERSION.SDK_INT >= 31 ? "ble" : "location");
        if (Build.VERSION.SDK_INT >= 33) a.add("notify");
        return a.toArray(new String[0]);
    }

    @PluginMethod
    public void start(PluginCall call) {
        String url = call.getString("serverUrl");
        String token = call.getString("token");
        if (url == null || url.isEmpty() || token == null || token.isEmpty()) {
            call.reject("서버 주소 · 토큰이 비어 있다");
            return;
        }
        getContext().getSharedPreferences(SupplyService.PREFS, Context.MODE_PRIVATE).edit()
            .putString(SupplyService.KEY_URL, url).putString(SupplyService.KEY_TOKEN, token).remove(SupplyService.KEY_LAST_ERROR).apply();
        for (String alias : neededAliases()) {
            if (getPermissionState(alias) != PermissionState.GRANTED) {
                requestPermissionForAliases(neededAliases(), call, "permissionsResult");
                return;
            }
        }
        launch(call);
    }

    @PermissionCallback
    private void permissionsResult(PluginCall call) {
        JSArray denied = new JSArray();
        for (String alias : neededAliases()) if (getPermissionState(alias) != PermissionState.GRANTED) denied.put(alias);
        if (denied.length() > 0) {
            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("denied", denied);
            call.resolve(ret);
            return;
        }
        launch(call);
    }

    private void launch(PluginCall call) {
        Context c = getContext();
        SupplyService.ensureChannel(c);   // 알림 채널은 서비스를 띄우기 전에
        Intent i = new Intent(c, SupplyService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
        else c.startService(i);
        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Context c = getContext();
        c.getSharedPreferences(SupplyService.PREFS, Context.MODE_PRIVATE).edit()
            .remove(SupplyService.KEY_URL).remove(SupplyService.KEY_TOKEN).apply();
        c.stopService(new Intent(c, SupplyService.class));
        call.resolve();
    }
}
