# server — 판정 엔진

파싱·카카오 경로·요율 연산. Express 5 + better-sqlite3 + Socket.IO (port 4000).
루트 [CLAUDE.md](../../CLAUDE.md) 가 먼저다 — **명령·커밋 게이트·경계를 넘는 규칙은 루트 [README.md](../../README.md) 에 있다.**
여기에는 **서버 안에서만 참인 것**만 둔다.

## 이건 버그가 아니라 규칙이다

- **필터는 두 그릇이다.** `baseFilter`(DB · 평소 설정) 와 `activeFilter`(메모리 · 오늘의 콜 필터).
  base → active 로 되돌리는 때는 **세션을 만들 때와 영업일이 바뀔 때**(`resetToBaseFilter`) 뿐이고, 그 사이에는 따로 논다
  · `saveBaseFilter()` — DB 만, activeFilter 안 건드림
  · `updateActiveFilter()` — 메모리만, DB 안 건드림
  · 관제웹 💾 저장(`saveAsDefault`)은 둘을 차례로 부른다 (`socketHandlers.ts`) — 그 밖의 길은 한쪽만 바꾼다

- **경유 한 벌(`destinationKeywords` · `destinationGroups` · `customCityFilters`)은 `filterManager` 한 곳에서 조립해 함께 싣는다.**
  다른 호출부는 **입력만** 넘긴다(`destinationCity`·`destinationRadiusKm`).
  키워드를 직접 채워 넘기면 `recalculateDerivedFields` 가 자기 계산을 건너뛰고,
  묶음 없이 키워드만 오면 시 별칭이 **비워져** 앱이 멀쩡한 콜을 조용히 거른다 (`keepKeepsAliases` 가 문다)

- **세션은 두 층이고 서로 남남이다** — 사용자 세션(`userSessionStore.ts`)과 기기 세션(`routes/devices.ts` 의 `activeDevices` · `user_devices` 표).
  🔴 `session.devices` 는 없다 — 부르면 런타임 `TypeError` 로 배차가 멈춘다. 기기 모드는 `getDeviceMode(deviceId, userId)` 로 묻는다

- **취소·수락을 세는 자리는 `core/cancelCount.ts` 하나다.** 콜이 끝나는 길(결재 취소 · 화면 이탈 · 안전취소 시간 초과 · 긴급 리셋 · 새 콜 선점)은 여럿이어도
  배차망 취소 패널티를 세는 조건은 여기서만 판단한다 — 미리보기 콜 · 체험 콜은 세지 않는다

- **체험 콜은 메모리에만 있다.** 기기 모드가 `SIMULATION` 인 콜은 `session.myOrders` 에는 올라가지만 `orders` · `places` 표에는 안 쓰인다.
  DB 행을 전제하는 호출(`birthFirstStep` 등)은 `!isSimulated` 로 막는다.
  ⚠️ 배차망 시뮬레이터(`onedal-sim`) 화면에서 잡은 콜은 체험 콜이 아니다 — 보통 콜처럼 DB 에 쓰인다

## 로그는 파일에도 남는다

```
logs/server-YYYY-MM-DD.log        평소(4000)
logs/server-YYYY-MM-DD-4012.log   다른 포트(검사·재현용)
```

- 터미널 출력은 **그대로** 있다 — 파일은 추가지 대체가 아니다. 콘솔은 스크롤이 지나가면 사라지니 «몇 번 찍혔나»·«언제 꺼졌나»는 파일로 본다
- 보관 기간은 `src/utils/fileLogger.ts` 의 `KEEP_DAYS` — 부팅 때 자동 정리된다. `.gitignore` 에 들어 있다
- ⚠️ **파일을 지우면 서버를 다시 띄울 때까지 안 쌓인다** (열려 있던 스트림이 지워진 파일을 계속 문다)
- 읽는 명령은 `cd .. && pnpm log` ([onedal-web/CLAUDE.md](../CLAUDE.md) 스크립트 표)

## 함정

- **조건부 `DROP TABLE` 마이그레이션을 새로 추가하지 않는다** (`db.ts` — 부팅 경로에서 데이터가 날아감).
  부팅할 때 표를 만지는 옛 코드는 하나 남아 있다. `order_judgments` 를 다시 만드는 코드다. 행을 먼저 복사하고 나서 표를 바꾸므로 데이터는 잃지 않는다.
  `dropStaleCheck()` 도 같은 방식이지만 지금은 아무 데서도 부르지 않는다. V7 은 표를 지우지 않고 `orders` 의 상태값만 `UPDATE` 로 바꾼다.
  둘 다 지금 DB 에서는 조건이 맞지 않아 실제로 돌지 않는다

- **타이머는 `session.activeTimers` 에 넣어 취소할 수 있게 한다** — 끄는 곳은 `clearOrderTimers` 한 곳이다 (키를 손으로 나열하면 좀비 타이머가 남는다)

- **`CREATE TABLE IF NOT EXISTS` 는 기존 테이블에 컬럼을 추가하지 않는다.** 칸 추가는 `ensureColumns()` 로 한다.
  enum 성 칸에는 `CHECK` 를 걸지 않는다 — 낡은 `CHECK` 는 새 값을 조용히 거부하고 `ALTER` 로 못 고친다 (`db.ts` 머리).
  ⚠️ `tsc`·`jest` 는 통과하고 **런타임에서만** `no such column` 으로 터진다 —
  빈 DB 가 아니라 **기존 DB 사본**으로 부팅해 봐야 드러난다

- **`@turf/turf` 배럴을 import 하지 않는다.** node_modules 안에 TS 원본을 담은 모듈이 섞여 있어
  **jest 가 파싱 단계에서 죽는다.** 쓰는 것만 개별 import (`@turf/bbox` 등)

- **`turf.buffer` 는 반경이 작을수록 비싸다** (작은 버퍼는 원본 디테일을 그대로 문다).
  부팅 때 만들어 둔 `f.simplified`(`geoService.ts`) 로 버퍼링한다
