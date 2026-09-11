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
 */
export { useFilterConfig } from '../hooks/useFilterConfig';
export { useDeviceStore } from '../stores/deviceStore';
export { summarizeTally } from '../lib/filterTally';
export { apiBase } from '../lib/serverTarget';
