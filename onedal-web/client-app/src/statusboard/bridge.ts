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
 *
 * 🗑️ **한때 둘이 더 있었다** (2026-09-11 → 09-12 에 걷었다) — `publishLocation`(좌표 보내기)과
 *    `apiClient`(설정 읽기). 현황판의 «찍어서 내 위치 찾기»가 쓰던 것인데 기사님이
 *    *"자리가 모자란다 … 버리자"* 하셔서 화면과 함께 걷었다.
 *    🔴 되살릴 때는 **`publishLocation` 을 다시 얹는다** — 위치를 서버로 보내는 문은 그것
 *       하나뿐이고, 여기서 `socket.emit` 을 새로 내면 2026-08-14 의 «두 곳에서 쏘던» 사고가
 *       되살아난다 (`lib/gpsBridge.ts` 머리 참조).
 */
export { useFilterConfig } from '../hooks/useFilterConfig';
export { useDeviceStore } from '../stores/deviceStore';
export { summarizeTally } from '../lib/filterTally';
export { apiBase } from '../lib/serverTarget';
/**
 * 🎭 **모의 주행 스위치** (기사님 2026-09-12 — *"경로가 생기면 현황판도 알게 될 거고
 *    그때 버튼을 활성화해서 클릭하도록"*). 현황판은 `available` 을 보고 버튼을 켜고,
 *    `start()`·`stop()`·`setSpeed()` 를 부른다. **«경로가 있나»를 제 손으로 다시 보지 않는다.**
 */
export { useMockDriveStore, MOCK_DRIVE_SPEEDS } from '../stores/mockDriveStore';
