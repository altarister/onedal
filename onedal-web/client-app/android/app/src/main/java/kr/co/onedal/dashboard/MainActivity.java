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
 * ── 🔴 `onKeyDown` 으로는 안 온다 (2026-08-25 실측) ──
 * 처음에 `onKeyDown` 으로 만들었더니 팝업이 안 떴다. 로그캣을 보니 이랬다:
 *
 *     MediaSessionService: dispatchVolumeKeyEvent, pkg=kr.co.onedal.dashboard
 *     AudioManager: adjustSuggestedStreamVolume …
 *
 * **볼륨 키는 액티비티에 닿기 전에 미디어 세션이 먼저 집어간다.** 그래서 시스템 볼륨만
 * 오르고 `onKeyDown` 은 아예 안 불렸다. 더 앞단인 `dispatchKeyEvent` 에서 받아야 한다.
 *
 * ⚠️ **볼륨 다운은 그대로 둔다.** 주행 중에 소리를 못 줄이면 그게 더 큰 사고다.
 * ⚠️ `ACTION_UP` 만 소비한다 — 길게 누르면 반복 이벤트가 쏟아져 팝업이 깜빡인다.
 *    다만 `ACTION_DOWN` 도 **삼켜야** 시스템 볼륨이 안 오른다.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_VOLUME_UP) {
            // 눌렀다 뗄 때 한 번만 연다 — 반복 이벤트로 깜빡이지 않게
            if (event.getAction() == KeyEvent.ACTION_UP && getBridge() != null) {
                getBridge().eval(
                    "window.dispatchEvent(new CustomEvent('onedal:volume-up'))",
                    null
                );
            }
            return true;   // DOWN 도 삼켜야 시스템 볼륨이 안 오른다
        }
        return super.dispatchKeyEvent(event);
    }
}
