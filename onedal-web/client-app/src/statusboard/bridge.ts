/**
 * 🌉 **다리 — 현황판이 관제웹 안쪽에 기대는 «전부»** (2026-09-11).
 *
 * 기사님 지시: *"지금꺼 잘 분리해서 **나중에 쓸수 있도록** 잘 만들어줘."*
 *
 * 기사님 구상(아직 안 함 · [todo.md](../../../../todo.md)): **브라우저 둘** — 프로젝트 / 어드민.
 * 어드민에서 기사를 골라 들어가면 지금 오른쪽에 있는 것이 그대로 뜬다 —
 * *"어짜피 오른쪽에 있는것이 서버에서 하는 일들이라 가능할꺼 같은데."*
 *
 * 🔴 **그날 갈아끼울 것을 여기 모아 둔다.** 현황판이 관제웹 안쪽을 여기저기서 직접 부르면
 *    옮길 때 **어디를 고쳐야 하는지 세어 봐야 한다.** 다리 하나면 «이 파일만 새로 쓰면 된다»가
 *    되고, **의존이 몇 개인지 한눈에 보인다** (지금 넷).
 *
 * 🔴 **여기에 계산을 넣지 않는다.** 잇기만 한다 — 로직이 들어가면 그것도 옮길 짐이 된다.
 *    `sidePanel.test.ts` 가 잠근다.
 *
 * ⚠️ `react` 와 `@onedal/shared` 는 **이 다리를 안 지난다** — 어디서 돌든 그대로 쓰는 것들이다.
 *
 * ── 옮길 때 새로 써야 하는 넷 ──
 * | 무엇 | 지금 어디서 오나 | 어드민에서는 |
 * |---|---|---|
 * | `useFilterConfig` | 소켓(`filter-init`·`filter-updated`) 구독 | 기사 id 를 얹어 같은 소켓을 본다 |
 * | `useDeviceStore`  | 앱폰 텔레메트리 스토어 | 〃 |
 * | `summarizeTally`  | 순수 함수 (앱 성적표 → 문구) | **그대로 쓴다** |
 * | `apiBase`         | 지금 보는 서버 주소 | 어드민 주소로 |
 * | `useMockDriveStore` | 모의 주행 스위치 (개발 전용) | 어드민에서도 같은 스위치 |
 * | `publishLocation` | 소켓 `dashboard-gps-update` 로 좌표를 낸다 | 기사 id 를 얹어 같은 소켓으로 |
 * | `apiClient`       | 토큰을 붙여 주는 axios (집 주소·주소 찾기) | 어드민 토큰으로 |
 *
 * 🔴 **위치는 `socket.emit` 을 직접 하지 않고 `publishLocation` 을 지난다** — 그 함수가
 *    **서버에 위치를 알리는 유일한 자리**다. 2026-08-14 에 두 훅이 각각 쏘다가 시뮬 좌표와
 *    실제 좌표가 섞여 경로가 156km 로 튄 적이 있어 문을 하나로 모았다 (`lib/gpsBridge.ts`).
 * ⚠️ 둘은 2026-09-12 에 **한 번 걷었다가 되살렸다** — 기사님이 *"자리가 모자란다 … 버리자"*
 *    하신 것은 **지도**였고(*"내 위치에서 지도만 빼라고 한거야.. 주소찾기하고 집은 그냥두고"*),
 *    주소 찾기와 집 버튼은 남는 것이었다. 지도만 빠졌다.
 */
export { useFilterConfig } from '../hooks/useFilterConfig';
export { useDeviceStore } from '../stores/deviceStore';
export { summarizeTally } from '../lib/filterTally';
export { apiBase } from '../lib/serverTarget';
/**
 * 📍 **서버가 아는 «내 자리»** (2026-09-12) — 화면이 제 손으로 정한 값과 대조해
 *    «지도와 서버가 다른 곳을 본다»를 잡는다. 그 어긋남이 실제로 17.6km 였다.
 */
export { useDriverPositionStore, ensureDriverPositionSubscribed } from '../stores/driverPositionStore';
/* ── 🧪 **여기부터 셋은 «테스트용»이다 — 어드민으로 갈 때 함께 걷는다** ──
   (기사님 지시 2026-09-12: *"모의 주행과 내 위치의 주소찾기, 집주소 이렇게 3개의 모듈은
    어드민때는 없어져야 하는것들이야"*)

   🔴 **셋의 성질이 같다 — 전부 «서버로 보내는» 것**이다. 위의 넷은 읽기만 한다.
      화면에서도 맨 위 **🧪 테스트용 구역** 하나에 모여 있다 (`TestOnlySection`).
   🔴 **걷는 법** — 아래 세 줄 + 그 구역 + `<TestOnlySection/>` 호출 한 줄. 그게 전부다. */

/**
 * 🎭 **모의 주행 스위치** (기사님 2026-09-12 — *"경로가 생기면 현황판도 알게 될 거고
 *    그때 버튼을 활성화해서 클릭하도록"*). 현황판은 `available` 을 보고 버튼을 켜고,
 *    `start()`·`stop()`·`setSpeed()` 를 부른다. **«경로가 있나»를 제 손으로 다시 보지 않는다.**
 */
export { useMockDriveStore, MOCK_DRIVE_SPEEDS, MOCK_DRIVE_DEFAULTS } from '../stores/mockDriveStore';
export { publishLocation } from '../lib/gpsBridge';
/* 🔴 **인증이 필요한 문은 이걸로 연다** — 토큰을 손으로 붙이면 갱신(리프레시)을 놓친다 */
export { apiClient } from '../api/apiClient';
