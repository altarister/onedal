# shared — `@onedal/shared`

서버 · 관제웹 · 운행일지가 함께 쓰는 DTO·상수·파생 함수. `main: src/index.ts` (빌드 없이 TS 직접 참조).
루트 [CLAUDE.md](../../CLAUDE.md) 가 먼저다. 여기에는 **shared 안에서만 참인 것**만 둔다.

## 여기를 고치면 세 앱이 동시에 흔들린다

이 폴더는 경계 그 자체다. 한 줄 바꾸면 서버·관제웹·운행일지가 같이 영향을 받고,
원달앱(Kotlin)도 이 모양의 JSON 을 받는다.
**`tsc`·`jest` 가 통과해도 런타임에서만 터지는 부류가 있으니 반드시 부팅까지 확인한다.**

- 🔴 **순환 참조** → `ReferenceError: Cannot access '…' before initialization` — **부팅 자체가 안 된다.**
  `tsc` 도 `jest` 도 못 잡고, `tsx` 로 서버를 띄워야 드러난다.
  모듈 A 가 B 를 import 하고 B 가 다시 A 의 **런타임 값**(상수·함수)을 쓰면 걸린다.
  타입만 주고받으면 안전하다 — `import type` 을 쓸 수 있으면 쓴다

- **DTO 필드를 지우면 앱이 조용히 무너질 수 있다.** 앱은 Kotlin 이라 타입 체크가 같이 안 돈다.
  콜 양식(`SimplifiedOfficeOrder`)의 **칸 이름**은 `appOrderShape` 검사가 앱 쪽과 대조한다 — 타입은 안 본다.
  지우기 전에 `onedal-app/app/src/main/java` 를 grep 할 것

## 이건 버그가 아니라 규칙이다

- **목록을 손으로 나열하지 않고 파생시킨다.**
  `RESTORABLE_STATUSES = ALL_ORDER_STATUSES.filter(...)` 처럼.
  손으로 적은 목록은 여러 곳에서 갈라진다 — 상차한 콜이 화면에서 사라지는 모양으로 터진다.
  새 상태를 추가하면 `ALL_ORDER_STATUSES` 에만 넣고, 어느 쪽인지 안 정하면 테스트가 깨진다

- **시간 계산은 `timing.ts` 한 곳에서만 한다** (루트 규칙 ⑤-5)

## 확인

- shared 자체 vitest — `cd .. && pnpm test:web` (관제웹 vitest 와 함께 돈다)
- 서버 테스트도 shared 를 함께 검증한다 — `cd ../server && npx jest`
- 스키마·상수를 바꿨다면 **기존 DB 사본으로 부팅 스모크**까지 (빈 DB 는 컬럼 문제를 숨긴다).
