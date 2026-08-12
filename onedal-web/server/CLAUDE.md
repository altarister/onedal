# server — 판정 엔진

파싱·카카오 경로·요율 연산. Express 5 + better-sqlite3 + Socket.IO (port 4000).
루트 [CLAUDE.md](../../CLAUDE.md) 의 규칙이 먼저다. 여기에는 **서버 안에서만 참인 것**만 둔다.

## 이건 버그가 아니라 규칙이다

- **필터는 두 그릇이고 서로 남남이다.**
  `baseFilter`(DB · 평소 설정) 와 `activeFilter`(메모리 · 오늘 사냥)는 로그인 시 1회 복사된 뒤
  완전히 격리된다. 설정을 바꿔도 진행 중인 사냥에 영향이 없어야 한다
  · `saveBaseFilter()` — DB 만, activeFilter 안 건드림
  · `updateActiveFilter()` — 메모리만, DB 안 건드림

- **파생값은 `filterManager` 한 곳에서만 만든다.**
  호출부는 **입력만** 넘긴다(`destinationCity`·`destinationRadiusKm`). 키워드를 직접 채워 넘기면
  `recalculateDerivedFields` 가 자기 계산을 건너뛰어 **다른 파생값이 안 채워진다.**
  🔴 2026-08-12 소켓 핸들러가 지리 연산을 자기가 해서 `customCityFilters` 가 영영 비었다

- **`destinationKeywords` 를 넘길 땐 `customCityFilters` 도 같이.** 안 넘기면 옛 별칭이 남아
  멀쩡한 콜을 조용히 거른다 (투트랙에서 실제로 났다)

## 함정

- **조건부 `DROP TABLE` 마이그레이션을 새로 추가하지 않는다** (`db.ts` — 부팅 경로에서 데이터가 날아감)

- **`CREATE TABLE IF NOT EXISTS` 는 기존 테이블에 컬럼을 추가하지 않는다.**
  `ensureColumns()` / `dropStaleCheck()` 를 쓴다. 낡은 `CHECK` 제약이 새 enum 값을 조용히 거부한다
  ⚠️ **빈 DB 가 아니라 기존 DB 사본으로 확인해야 드러난다**

- **`shared/` 순환 참조** → `ReferenceError: Cannot access '…' before initialization` (부팅 불가).
  `tsc`·`jest` 는 통과하는데 런타임에서만 터진다

- **`@turf/turf` 배럴을 import 하지 않는다.** node_modules 안에 TS 원본을 담은 모듈이 섞여 있어
  **jest 가 파싱 단계에서 죽는다.** 쓰는 것만 개별 import (`@turf/bbox` 등)

- **`turf.buffer` 는 반경이 작을수록 비싸다** (작은 버퍼는 원본 디테일을 그대로 문다).
  부팅 때 만들어 둔 `f.simplified`(200m) 로 버퍼링한다 — 1415ms → 13ms

## 명령

| 목적 | 명령 |
|---|---|
| 타입 체크 | `npx tsc --noEmit` |
| 테스트 | `npx jest` |
| **도는 서버 확인** | `curl -s localhost:4000/api/health \| python3 -m json.tool` → `bootedAt` |

로컬 DB 는 `local.db`(실서버는 `data.db`)로 자동 분리된다.
⚠️ `bootedAt` 을 매번 확인할 것 — 옛 서버를 붙잡고 오진한 적이 여러 번 있다.

## 신뢰할 수 있는 문서

`docs/DISPATCH_STATE_MACHINE.md` · `docs/ENV_CONFIG_SPEC.md` ·
`docs/SERVER_ARCHITECTURE.md` (v4.0) · `docs/API_SPEC.md` (v3.1)
