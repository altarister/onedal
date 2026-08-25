package kr.co.onedal.dashboard;

import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

/**
 * 🔊 볼륨 업을 누르면 «서버 고르기» 팝업을 띄운다 (기사님 확정 2026-08-25).
 *
 * 기사님: *"볼륨 버튼을 클릭해서 라이브인지 로컬인지 바꿀 수 있으면 더 좋을 것 같은데."*
 *
 * ── 왜 볼륨 버튼인가 ──
 * 관제앱은 **운전 중에 보는 화면**이라 설정 메뉴를 늘리면 그만큼 읽을 것이 늘어난다.
 * 배차망 시뮬레이터 앱이 이미 같은 방식을 쓰고 있어 손에 익어 있다.
 *
 * ── 왜 네이티브가 필요한가 ──
 * 하드웨어 키는 웹뷰가 못 듣는다. 여기서 잡아 **웹으로 넘겨 주면** 화면 그리기는
 * 리액트가 한다 — 네이티브에는 «눌렸다»만 두고 판단은 웹에 둔다.
 *
 * ⚠️ **볼륨 조절을 뺏지 않는다.** 볼륨 다운은 그대로 두고, 업만 가로챈다.
 *    주행 중에 소리를 못 줄이면 그게 더 큰 사고다.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP && getBridge() != null) {
            // 웹이 듣고 팝업을 그린다 (window 이벤트)
            getBridge().eval(
                "window.dispatchEvent(new CustomEvent('onedal:volume-up'))",
                null
            );
            return true;   // 볼륨 업만 가로챈다
        }
        return super.onKeyDown(keyCode, event);
    }
}
