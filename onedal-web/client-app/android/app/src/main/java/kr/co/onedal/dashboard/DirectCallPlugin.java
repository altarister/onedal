package kr.co.onedal.dashboard;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 📞 **누르면 바로 건다** — 웹의 `tel:` 링크는 다이얼러를 «번호만 찍어 놓고» 열어서
 * 통화 버튼을 한 번 더 눌러야 한다. 운전 중에는 그 한 번이 손이 가는 일이다.
 *
 * 🔴 **권한이 없으면 다이얼러라도 연다** — 전화를 아예 못 거는 것이 더 큰 사고다.
 *    그래서 거부당해도 실패로 끝내지 않고 `ACTION_DIAL` 로 떨어진다.
 * ⚠️ 바로 거는 것은 `ACTION_CALL` 이고 `CALL_PHONE` 권한이 있어야 한다.
 *    `ACTION_DIAL` 은 권한이 필요 없다 — 둘의 차이가 「한 번 더 누르는가」다.
 */
@CapacitorPlugin(
    name = "DirectCall",
    permissions = { @Permission(alias = "phone", strings = { Manifest.permission.CALL_PHONE }) }
)
public class DirectCallPlugin extends Plugin {

    @PluginMethod
    public void dial(PluginCall call) {
        String number = call.getString("number");
        if (number == null || number.isEmpty()) {
            call.reject("번호가 비어 있다");
            return;
        }
        if (getPermissionState("phone") != PermissionState.GRANTED) {
            // 처음 한 번만 묻는다 — 거부해도 아래 콜백에서 다이얼러로 연다
            requestPermissionForAlias("phone", call, "phonePermissionResult");
            return;
        }
        place(call, number);
    }

    @PermissionCallback
    private void phonePermissionResult(PluginCall call) {
        place(call, call.getString("number"));
    }

    private void place(PluginCall call, String number) {
        boolean granted = getPermissionState("phone") == PermissionState.GRANTED;
        Intent intent = new Intent(granted ? Intent.ACTION_CALL : Intent.ACTION_DIAL, Uri.parse("tel:" + number));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);

        // 관제웹이 «바로 걸렸나»를 알 수 있게 돌려준다 (화면에 쓸 일이 생기면 여기서 받는다)
        JSObject ret = new JSObject();
        ret.put("direct", granted);
        call.resolve(ret);
    }
}
