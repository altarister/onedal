# 1DAL 정비 계획 (Cleanup & Fix Plan)

> **작성일**: 2026-08-07
> **근거**: server / client-app / onedal-app 전체 코드 + docs 26개 교차 검증
> **결정**: 재작성하지 않는다. **청소 → 고정 → 수정** 순으로 정비한다.

---

## 0. 왜 재작성이 아닌가 (판단 근거)

| 항목 | 사실 |
|---|---|
| 코드 품질 | server / client 모두 `tsc --noEmit` 통과, `jest` 8/8 통과. 계층 분리가 형식이 아니라 실제로 지켜짐 |
| 발견된 버그의 성격 | **아키텍처 변경이 필요한 버그가 0건.** 대부분 1~4줄 수정 |
| 코드에만 있는 자산 | 동명이동 동네 100여 개, 팝업 잔상 타이밍, 카카오 3중 폴백, 요금 파싱 정규식, 레이스 컨디션 방어 10종 — **콜을 놓치며 얻은 암묵지** |
| 진짜 문제 | 결합도가 아니라 **관측 가능성**: ①죽은 코드가 살아있는 척함 ②문서 2개가 거짓 ③테스트 없음 |
| 결론 | 위 3가지는 재작성으로 해결되지 않음. 습관을 안 바꾸면 새 코드도 2달 뒤 동일해짐 |

### 재작성을 다시 검토해야 할 조건 (둘 이상 해당 시)
- [ ] Phase 0 청소 후에도 값의 출처 추적이 30분 넘게 걸린다
- [ ] 버그 하나 고치면 다른 데가 두 개 터지는 일이 반복된다
- [ ] SQLite 단일 인스턴스(`instances: 1`)가 실제 병목이 되는 사용자 수에 도달했다
- [ ] 기사 3명 이상 동시 사용 시 멀티테넌시 누수로 실제 사고가 났다

---

## 1. 작업 원칙

1. **한 Phase = 한 PR = 한 배포.** 섞지 않는다.
2. **삭제 전 반드시 소비처 grep 결과를 todo에 기록**한다.
3. 기사님 운행 시간(주간)에는 서버 배포하지 않는다. Phase 1은 **새벽 배포**.
4. 수정 후 `npx tsc --noEmit` + `npx jest`가 통과해야 커밋한다.
5. 문서를 "완료"로 쓰지 않는다. **코드에 들어간 것만** 문서에 반영한다.
6. 되살릴 예정인 미구현 기능은 지우지 말고 `// TODO(미구현):` 주석을 명시한다.

---

## Phase 0 — 죽은 코드 청소 🧹  ✅ 완료 (2026-08-07)
> **목적**: "뭐가 실제로 도는가"를 눈으로 확인 가능하게 만든다
> **위험도**: 매우 낮음 (소비처 0건 확인 완료)
> **배포**: 아직 안 함 (다음 Phase와 함께)

- [x] **K. `client-app/src/stores/orderStore.ts` 삭제**
  - 확인 완료: `useOrderStore` import 0건. `useOrderEngine`은 여전히 `useState` 사용
  - **삭제** 선택 (필요해지면 `STATE_MANAGEMENT.md` §4에 설계가 남아 있음)
- [x] **`server/src/services/dispatchEngine.ts` `resetMainCallState()` 삭제**
  - 주석에 "하위 호환용"이라 적힌 사실상 no-op. 호출처 0건
  - 이에 따라 미사용이 된 `TERMINAL_STATUSES` import도 함께 제거
- [x] **`app/api/ApiClient.kt` `sendDecision()` 삭제**
  - 호출처 0건 + `deviceId` 누락으로 호출해도 서버가 401 반환 (죽었고 동시에 깨져 있었음)
  - 서버 `POST /api/orders/decision` 라우트는 API_SPEC에 문서화되어 있어 **유지**
- [x] **`app/build.gradle.kts` `BuildConfig.SERVER_URL` 삭제**
  - 참조 0건. URL은 SharedPreferences(`isLiveMode`/`localPcIp`)가 결정 → 주석으로 명시
  - 비게 된 `debug { }` 블록도 함께 제거
- [x] **`server/src/routes/orders.ts` 레거시 `POST /` 삭제**
  - 무인증 + `userId` 없이 DB INSERT + `io.emit` 전역 방송. API_SPEC에도 미기재
  - ✅ 소비처 확인: 앱은 `/confirm`·`/detail`·`/decision`만 호출. `simulator-app`은 외부 WebView(`map.altari.com`)만 로드
  - ⚠️ 연쇄: 이 라우트가 `new-order`의 **유일한 발신처**였으므로 클라이언트 리스너도 고아가 됨
    → `client-app/src/hooks/useOrderEngine.ts`의 `new-order` 리스너 3곳(선언·on·off) 제거
    → `GET /api/orders`는 그대로 유지 (`useOrderEngine.ts:54`가 사용 중)
- [x] **미구현 기능에 `TODO(미구현)` 주석 명시** (삭제하지 않음)
  - `server/src/services/geoService.ts` `getActivePolyline` / `getLastDropoffCoord`
  - `client-app/src/pages/Dashboard.tsx` `auto-arrived` 리스너
  - `app/core/TelemetryManager.kt` GPS 블록
- [x] **검증**
  - `npx tsc --noEmit` (server) → EXIT 0 ✅
  - `npx tsc -b` (client-app) → EXIT 0 ✅
  - `npx jest` (server) → 3 suites / 8 tests 통과 ✅
  - ❌ `./gradlew` — **이 머신에 JDK 미설치로 실행 불가.** 대신 수동 검증: 잔여 참조 0건, 중괄호 균형 일치 확인. **실기기 빌드는 승욱님 확인 필요**

---

## Phase 0.5 — 거짓 문서 교정 📄
> **목적**: 맥락 복원의 출발점. 지금은 문서를 읽을수록 헷갈림
> **예상**: 반나절 / **위험도**: 없음

- [ ] **`onedal-web/server/docs/SERVER_ARCHITECTURE.md` 재작성**
  - 허위 7건: ESM 전환 완료(실제 `"type":"commonjs"` + `require()` 4곳) / `RouteManager.ts` 없음 / `routes/confirm.ts` 없음 / dispatchEngine "God Object 해체" (여전히 881줄 최대 파일) / §1 파이프라인 `scrap.ts→OrderEvaluator` 틀림(실제 `detail.ts`) / §5 `isActive=true` 컬럼 없음 / §6 Task 29 브로드캐스트 캐싱 없음
  - ✅ 유지할 것: §6 "Event Loop 7초 블로킹 차단"은 **사실** (`filterManager.ts:57` 가드 클로즈, 커밋 `65f739a`)
- [ ] **`onedal-app/docs/ANDROID_ARCHITECTURE.md` 재작성**
  - 허위 6건: Compose 제거 완료(실제 사용 중) / Coroutines 기반(실제 Executors+Handler) / `LocationTracker`+`FusedLocationProviderClient` 없음 / `ACCESS_BACKGROUND_LOCATION` 권한 미선언 / TelemetryManager "3초"(실제 60초) / 패키지 트리에 `plugins/` `core/engine/` `ui/` 누락
- [ ] **`onedal-app/docs/PLUGIN_INTERFACE_SPEC.md` 재작성**
  - `BaseScrapParser`→실제 `IScrapParser`(패키지도 다름) / `extractOrdersFromList`→실제 `groupListNodes`(시그니처·Pair 순서 다름) / `parseDetailed` 없음(서버가 담당) / `parsePickupDistance` 누락 / `BaseAutomationEngine` 인터페이스 자체가 없음
  - 이 문서 보고 플러그인 만들면 **컴파일 안 됨**
- [ ] **`onedal-web/server/docs/API_SPEC.md` 정정**
  - `deathvalley-warning` "15초" → **30초** (`WAITING_WARNING_MS=30000`)
  - `sync-active-orders` "서버 재시작 시" → **1초 주기 하트비트**
  - 미기재 엔드포인트 2개 추가 또는 삭제 반영: `POST /api/auth/bypass`, `GET /api/scrap`
- [ ] **`onedal-web/client-app/docs/SOCKET_EVENT_MAP.md` 정정**
  - payload 6건: `new-order`(playBeep) / `order-evaluating`(전체 객체) / `order-canceled`(`{id,status,isManual}`) / `create-home-return`(`{corridorRadiusKm,destinationRadiusKm}`) / `device-paired`(`{deviceId,deviceName}`) / `dashboard-gps-update`(발신처 2곳)
  - `auto-arrived`에 **"미구현"** 표기
  - 서버 emit이나 클라 리스너 없는 것 표기: `decision-ack`, `recalculate-route-ack`, `two-track-ack`

### ⛔ 손대지 말 것 (검증 결과 정확함)
`EDGE_CASES.md`(방어 10/10 일치 — 최고 품질) · `SHARED_PREFERENCES_SPEC.md`(키 21개 일치) · `SCREEN_STATE_MACHINE.md` · `onedal-app/docs/API_SPEC.md` · `DISPATCH_STATE_MACHINE.md` · `ENV_CONFIG_SPEC.md` · `STATE_MANAGEMENT.md`

---

## Phase 1 — 보안 🔒
> **예상**: 반나절 / **위험도**: 중 (배포 순서 엄수)
> **배포**: 🌙 **새벽. 웹 전원 재로그인 발생 공지 필요**

- [ ] **사전 확인 (코드 수정 전)**
  - [ ] EC2 `.env`에 `JWT_SECRET` / `JWT_REFRESH_SECRET` 실제 존재 여부
  - [ ] 실기기 안드로이드 앱에서 **구글 로그인이 되는지** ← A(bypass) 처리 방향이 여기서 갈림
- [ ] **A. `POST /api/auth/bypass` 게이트** — `server/src/routes/auth.ts:218`
  - 현재 인증·환경 가드 **전무**. `curl` 한 방이면 DB 첫 유저(=ADMIN) 권한 30일 토큰 발급
  - `client-app/src/pages/Login.tsx:14`가 3초 뒤 무조건 버튼 노출 → **프로덕션에서도 보임**
  - ⚠️ 사이드 이펙트: Capacitor WebView는 origin이 `https://localhost`라 구글 OAuth가 자주 실패 → **네이티브 앱의 주 로그인 수단일 가능성**
  - 방식: 삭제 ❌ → `ALLOW_BYPASS_LOGIN` 환경변수 게이트 + 요청 본문 공유 시크릿 검증. 클라는 게이트 OFF 시 버튼 숨김
- [ ] **B. JWT 시크릿 폴백 제거** — `authMiddleware.ts:37`, `socketHandlers.ts:28`, `auth.ts` 3곳
  - `process.env.JWT_SECRET || "fallback_secret"` → 부팅 시 없으면 `process.exit(1)`
  - ⚠️ **배포 순서 엄수**: ①`.env` 확인 → ②시크릿 주입 → ③가드 코드 배포. 순서 틀리면 **부팅 실패 = 전면 장애**
  - ⚠️ 현재 프로덕션이 `fallback_secret`으로 돌고 있었다면 **발급된 토큰 전부 무효화 → 웹 전원 로그아웃** (앱폰은 deviceId 기반이라 무영향)
- [ ] **C-1. `GET /api/scrap` 삭제** — `server/src/routes/scrap.ts:165`
  - 무인증 + `WHERE user_id` 없음 → **전 기사 콜 정보 500건 노출**
  - ✅ 확인 완료: client-app · logbook 전체 grep 결과 **소비처 0건**
- [ ] **C-2. 전역 브로드캐스트 → 유저 룸** — `scrap.ts:92` `io.emit("telemetry-ping")` → `io.to(userId)`
- [ ] **`.github/1dal.pem`을 레포 밖(`~/.ssh/`)으로 이동**
  - ✅ 확인: `*.pem` gitignore됨 + `git log --diff-filter=A -- '*.pem'` 이력 없음 → **유출 안 됨**
  - 다만 gitignore 한 줄이 사라지면 즉시 유출. `deploy-auto.sh`의 `PEM_KEY` 경로도 함께 수정
- [ ] **`.github/workflows/deploy.yml` 정리**
  - 주석엔 "자동 배포 로봇 **비활성화**"인데 `on: push` 블록은 **활성** → 주석 삭제
  - `secrets.EC2_H0ST || secrets.EC2_HOST` 오타(숫자 0) 폴백 정리

---

## Phase 1.5 — 풀오토 자동 해제 버그 ⭐ 최우선
> **루트 `docs/TASKS.md` 첫 줄 "디바이스에 풀오토가 자꾸 풀려"의 근본 원인**
> **예상**: 반나절 / **효과**: 체감 최대

### 원인 (2경로)
```
경로① 화면 꺼짐
  screenOffReceiver → sendOffline() → devices.ts:270  mode="MANUAL", lastSeen=0
  화면 켜짐 → touchDeviceSession → devices.ts:57  status="ONLINE"  ← mode 복원 코드 없음!

경로② 네트워크 1회 실패 (더 잦음)
  앱 하트비트 60초 (TelemetryManager.kt:22)  vs  서버 데드맨 70초 (devices.ts:17)  → 여유 10초
  sendScrapTelemetry는 executeWithRetry 미적용 (confirm/detail/emergency만 재시도 있음)
  1회 실패 → 다음 전송까지 120초 → 데드맨 초과 → devices.ts:355  mode="MANUAL" 강제 → 복구 안 됨
```

- [ ] **① 서버: 모드 복원** — `server/src/routes/devices.ts` `touchDeviceSession()`
  - OFFLINE→ONLINE 복귀 시 사용자가 마지막에 지정한 모드를 복원
  - `sendOffline()`이 `status`만 내리고 `mode`는 건드리지 않도록 분리
- [ ] **② 앱: 하트비트 주기 단축** — `TelemetryManager.kt:22` `HEARTBEAT_INTERVAL_MS` 60000 → **25000**
- [ ] **③ 앱: scrap에도 재시도 적용** — `ApiClient.kt:214` `sendScrapTelemetry`에 `executeWithRetry` 사용
- [ ] **④ 앱: 스테일 주석 정리** — TelemetryManager KDoc/로그의 "20초 주기" → 실제 값으로
- [ ] **검증**: 실기기에서 (a)비행기모드 30초 후 해제 (b)화면 껐다 켜기 → **AUTO가 유지되는지**
- ⚠️ **사이드 이펙트**: 하트비트 25초면 `/api/scrap` 트래픽 **2.4배** → 아래 Phase 3의 **H(intel COUNT 풀스캔)가 2.4배 악화**. → **H를 이 Phase에 함께 넣거나, H 배포 후에 ②를 적용할 것**

---

## Phase 2 — 데이터 정합성 (D + F 한 커밋)  ✅ 코드 수정 완료 (2026-08-08) / 실기기 재검증 대기
> ⚠️ **D 단독 수정 금지.** D를 고치면 지금까지 조기 리턴하던 복구 로직이 실제로 돌기 시작하며 **F 버그가 깨어남**

> **🔬 실물 재현 기록 (2026-08-08 11:20, 로컬 실기기 테스트)**
> 실기기로 콜(오포읍→문발동, 104,000원)을 KEEP한 직후 `local.db` 조회 결과:
> ```
> status = [confirmed]                                    ← 소문자로 저장됨
> 오늘 ORDER_CONFIRMED/COMPLETED 로 조회되는 건수: 0      ← GET /api/orders 에서 누락
> ```
> 반면 서버 재부팅을 거친 과거 행들은 V7 마이그레이션 덕에 `ORDER_CONFIRMED`. 예측대로 재현됨.

- [x] **D. 확정 오더 status 오기록** — `server/src/repositories/OrderRepository.ts:32`
  - INSERT 바인딩에 `"confirmed"`(소문자 레거시) 하드코딩. 같은 쿼리의 `ON CONFLICT`는 `'ORDER_CONFIRMED'`
  - 결과: `GET /api/orders`와 세션 복구 쿼리(`status IN ('ORDER_CONFIRMED',...)`)에서 **누락** → 서버 재시작 시 그날 궤적 복구 안 됨
  - 지금 안 터지는 이유: `db.ts:238` V7 마이그레이션이 부팅 때 쓸어줌 (**버그를 가리고 있음**)
  - ✅ 수정 완료: 바인딩 값 → `'ORDER_CONFIRMED'`
- [x] **F. 궤적이 취소된 콜에 붙음** — `dispatchEngine.ts` (Phase 0 삭제로 라인 이동, 현재 676행)
  - `session.myOrders[session.myOrders.length - 1]` → **`activeSubs[activeSubs.length - 1]`**
  - 복구 쿼리가 `ORDER_CANCELED`/`ORDER_RELEASED`까지 로드하므로, 마지막이 취소된 콜이면 궤적이 거기 붙음
  - ✅ 추가로 `handleDecision` KEEP 경로(419행)의 **동일 패턴도 같은 형태로 통일**.
    그쪽은 방금 push한 콜이 곧 마지막 활성 콜이라 결과는 동일하지만, 같은 패턴이 두 곳에 있으면
    한쪽만 고치는 실수가 반복되므로 맞춰둠 (현재 126/419/676행 전부 `activeSubs` 기준)
- [x] **검증 (코드)**: `npx tsc --noEmit` EXIT 0 ✅ / `npx jest` 3 suites 8 tests 통과 ✅
- [x] **검증 (실기기)** — 2026-08-08 11:27~11:30, 전부 통과
  - 서버 재시작 → V7 마이그레이션이 기존 `confirmed` 행 정리 → **레거시 잔존 0건**
  - `[Session DB Load] 궤적 복구 연산 시작. 대상 콜: 1개` → 카카오 재호출 → **934 포인트 복구 성공**
    (이 로그는 오늘 처음 나옴. D 버그 때문에 그동안 `rows.length===0`으로 조기 리턴만 하고 있었음)
  - `GET /api/orders` 조회 가능 건수: **0건 → 1건**
  - 신규 콜(`f134859d`, 분당구→탄현면) KEEP → **`status = ORDER_CONFIRMED`로 직접 기록됨** ✅
  - 이 사이클은 **합짐(Detour)** 이라 F+로 통일한 419행 코드도 실제 실행됨 (Waypoints 2, 궤적 883pt, ACK 정상)

### 🆕 R. `isShared` 플래그가 실제 합짐 여부와 어긋남 (Phase 2 검증 중 발견, 별건)
- [ ] `dispatchEngine.handleDecision`의 `const isShared = session.activeFilter.isSharedMode ? 1 : 0`
  - 서버 재시작 시 `userSessionStore.ts:88`이 `isSharedMode: false`로 리셋하므로,
    복구된 세션에서 잡은 합짐 콜은 Detour 연산을 하고도 DB에 `isShared=0`으로 기록됨
  - 실측: `f134859d`는 `Waypoints Count: 2`로 우회 연산했으나 `isShared=0`
  - 수정 방향: 필터 모드가 아니라 **`getActiveCalls(session).length > 0`**(= 실제 Detour 여부)로 판정
  - 영향: 운행일지·통계에서 합짐 건수가 실제보다 적게 집계됨
- ⚠️ **사이드 이펙트**: `Dashboard.tsx:35` `dbConfirmedOrCompleted`가 채워지며 **완료/취소 탭에 과거 콜이 갑자기 나타남**. id 기반 Map 병합이라 중복은 없지만 화면이 달라 보임 — 정상 동작

---

## Phase 3 — 안정성
- [ ] **G. 데스밸리 타이머 통합** — 현재 3곳 분산 + 경고와 강제취소가 **동시(30초)**에 터져 판단 시간 0초
  - `detail.ts:148` 경고 30초 / `orders.ts:179` **강제취소 30초** / `detail.ts:164` 타임아웃 35초
  - ⚠️ `orders.ts:179` 타이머 **삭제 금지** — "BASIC은 왔는데 DETAIL이 영영 안 오는" 경우의 유일한 안전망. 지우면 `isActive=false`인 채 사냥 영구 정지
  - 수정: `session.activeTimers`에 등록 + DETAIL 수신 시 clear + `handleDecision` await/catch. 경고를 **20초**로 당김
- [ ] **H. `SELECT COUNT(*) FROM intel` 제거** — `server/src/routes/scrap.ts:70`
  - 폰 3대가 1초마다 때리는 엔드포인트에서 인덱스 없는 무한증가 테이블 풀스캔
  - ⚠️ `totalItems`는 안드로이드 `MainViewModel.kt:110`이 "누적 수집된 오더 N건"으로 표시 중 → **필드는 유지**하고 메모리 카운터로 대체하면 앱 수정 불필요
  - `intel(timestamp)` 인덱스 + 7일 보존 배치 추가
- [ ] **I + M. 1초 브로드캐스트 다이어트** ← **서버·클라 반드시 동시 배포**
  - 서버 `socketHandlers.ts:166`: payload를 "오늘 + 최근 N건"으로 제한
  - 클라 `useOrderEngine.ts:168`: `JSON.stringify` 전량 비교 + 전 키 diff 로깅 → merge 방식 + `import.meta.env.DEV` 가드
  - ⚠️ 서버가 종료 오더를 payload에서 빼면 **클라가 배열을 통째 교체**하므로 '취소/방출' 탭이 매초 비워짐. 클라 merge 전환과 한 쌍으로만 가능
- [ ] **L. GPS watchPosition 이중화 제거**
  - `App.tsx:35` `useNativeLocation` + `App.tsx:37` `useGpsTelemetry`(50m/10s 스로틀) + `PinnedRoute.tsx:49` `useMasterGps`(**스로틀 없음**)가 동시 가동
  - `useMasterGps`의 real 모드 `watchPosition` 제거 → `useLocationStore` 구독으로 통일. emit은 `useGpsTelemetry` 한 곳만
- [ ] **A5. `/confirm` 재시도 멱등화** — `app/api/ApiClient.kt:151`
  - 응답만 유실되면 같은 콜 2회 confirm → 데스밸리 타이머 2개. 요청 ID 기반 서버 중복 무시 또는 confirm 재시도 제외
- [ ] **N. 낙관적 업데이트 되돌림** — `client-app/src/hooks/useFilterConfig.ts:52`
  - `updateFilter`가 `baseFilter`까지 낙관적 갱신하는데 서버 `update-filter` 핸들러는 `activeFilter`만 변경 → 1초 안에 원복(깜빡임). `setBaseFilter` 호출 제거
- [ ] **O. raw fetch → apiClient** — `client-app/src/hooks/useOrderEngine.ts:53`
  - 401 자동 refresh를 못 타고 `.catch(() => {})`로 조용히 실패
- [ ] **🆕 P. keywords 설정 파일 경로 오류** — `server/src/routes/config.ts:14`
  - `path.join(__dirname, "../../../config")` → `server/src/routes`에서 3단계 올라가 `onedal-web/config`를 봄
  - 실제 파일은 `server/config/keywords_inseong.json`. **`../../config`로 수정** (dist 빌드 시에도 동일하게 맞음)
  - 현재는 else 분기의 기본값으로 폴백 + `targetAppKeywords`를 읽는 코드가 없어 **무해**하지만, 매 앱 기동 시 에러 로그를 뱉음
  - 2026-08-08 로컬 테스트 중 발견
- [ ] **🆕 Q. 없는 API가 404 대신 HTML 200을 반환** — `server/src/index.ts:82`
  - SPA 폴백(`app.use((req,res) => sendFile(index.html))`)이 `/api/*` 미매칭 요청까지 잡아 `text/html` 200을 돌려줌
  - 앱(Gson)이 HTML을 파싱하려다 예외 → 실패 원인을 알 수 없게 됨
  - 수정: SPA 폴백 앞에 `app.use("/api", (req,res) => res.status(404).json({error:"NOT_FOUND"}))` 추가
  - 2026-08-08 로컬 테스트 중 발견
- [ ] **Ghost Defense 수정** — `app/HijackService.kt:140`
  - `"$session.currentOrderId"` → `"${session.currentOrderId}"` (현재 `SessionManager` 객체 toString이 찍혀 **방어 발동 시 원인 추적 불가**)
  - `receivedOrderId`가 빈 문자열일 때 검증 없이 통과하는 조건 보완

---

## Phase 4 — GPS 기능 복구 (E + A3 + auto-arrived)
> 서버 죽은 코드와 앱 권한 누락은 **같은 기능의 양쪽 끝**. 한 묶음으로.

- [ ] **사전 측정**: `getCorridorRegions` 실측 소요시간 로깅 후 배포 → 위험도 정량화
- [ ] **A3. 앱 위치 권한** — `AndroidManifest.xml`에 `ACCESS_FINE_LOCATION` 추가 + 런타임 권한 요청 UI
  - 현재 선언 권한은 `INTERNET`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` **2개뿐**
  - `TelemetryManager.kt:118`이 `SecurityException`을 조용히 삼켜 **lat/lng가 영구 null**
- [ ] **E. 서버 회랑 트림 복구** — `server/src/services/geoService.ts:305,317`
  - `session.subCalls`/`session.mainCallState`(V2에서 삭제된 필드) → **`getActiveCalls(session)`** 기반으로
  - ⚠️ **최대 위험 항목**: 이 한 줄이 2km마다 `getCorridorRegions`(turf buffer+union+전국 폴리곤 교차)를 켬. `filterManager.ts:54` 주석에 **"CPU 집약적(~7초)"**. Node 싱글스레드가 7초 물리면 앱폰 3대 하트비트 정지 + 데스밸리 판정 지연 → **실제로 콜을 놓침** (커밋 `65f739a`가 잡았던 그 버그)
  - 반드시 **플래그 뒤에서** 켜고 실주행 1일 관찰. 측정값이 초 단위면 `worker_threads` 분리 또는 캐싱 선행
- [ ] **`auto-arrived` 서버 구현** — 하차지 500m 도달 시 `io.to(userId).emit`
  - 프론트 `Dashboard.tsx:61`이 리스너 + confirm 다이얼로그까지 만들어 놓고 대기 중
- [ ] **`DISPATCH_STATE_MACHINE.md` §4** "DRIVING: pickupRadius GPS 실시간 좁힘"이 이때부터 사실이 됨

---

## Phase 5 — 화물24시 동작 복구
> **버그가 아니라 "아직 안 만들어진 것".** 현재 구조로는 화면 구조가 다른 앱을 담을 수 없음

- [ ] **A2. 화면 판별 우선순위 붕괴** — `app/core/engine/ScreenDetector.kt:38`
  ```
  우선순위 2  pickupKeywords.any  = ["상차지","상차 주소"]   ← 화물24시 '상세 화면'에 있는 단어
  우선순위 5  detailKeywords.all  = ["화물상세정보","운송료"]  ← 여기 도달 불가
  ```
  - 화물24시 상세 화면에 "상차지"가 반드시 나옴 → 우선순위 2에서 `POPUP_PICKUP` 확정 → **`DETAIL_PRE_CONFIRM`이 절대 안 나옴 → `handlePreConfirmScreen`(배차신청 클릭)이 한 번도 실행 안 됨**
  - 리스트에 "적요"가 노출되면 우선순위 4 `memoKeywords.all=["화물정보","적요"]`에 걸려 **리스트 스캔도 안 됨**
  - 수정: `ScreenKeywords`에 판별 우선순위를 데이터로 포함하거나 앱별 `ScreenDetector` 분기
- [ ] **A4. HijackService 인성콜 하드코딩 이관** (커밋 `3837f07`이 키워드만 뽑고 본문은 남김)
  - `HijackService.kt:620` `if (KEEP) "닫기" else "취소"` → `keywords.cancelKeyword` (화물24시는 **"돌아가기"** → 현재 버튼 못 찾아 `BUTTON_NOT_FOUND` 비상보고 → **판결 집행 실패**)
  - `HijackService.kt:526` `contains("전화1")`
  - `HijackService.kt:439` `findAndClickByText(rootNode, "도착지")`
  - `ScreenDetector.kt:70` `isPopupResidue`의 `"출발지 상세"`/`"도착지 상세"`
- [ ] **검증**: 실기기 화물24시에서 리스트 스캔 → 배차신청 → KEEP/CANCEL 집행 전 구간

---

## Phase 6 — 테스트 고정 (상시, Phase 2 전에 최소분 확보 권장)
- [ ] `handleDecision`의 KEEP / CANCEL 분기 (Phase 2 회귀 방어)
- [ ] `OrderRepository.upsertOrder` status 값
- [ ] `ScreenDetector.detect` 앱별 (Phase 5 회귀 방어) — 앱은 현재 `test/` 디렉터리 자체가 없음
- [ ] `InsungParser.parse` / `shouldClick` — `onedal-app/docs/TESTING_STRATEGY.md`에 케이스 표가 이미 있음, 그대로 구현만 하면 됨

---

## 부록 A. 확인된 사실 (재조사 불필요)

| 항목 | 결과 |
|---|---|
| `.pem` 유출 | ❌ 없음 (gitignore + 커밋 이력 0) |
| `GET /api/scrap` 소비처 | 0건 (client-app, logbook 전수 grep) |
| `useOrderStore` import | 0건 |
| `ApiClient.sendDecision` 호출처 | 0건 |
| `BuildConfig.SERVER_URL` 참조 | 0건 |
| `auto-arrived` 서버 emit | 0건 |
| `totalItems` 소비처 | ✅ 있음 — `MainViewModel.kt:110` |
| 앱 위치 권한 선언 | 0건 |
| `GOOGLE_CLIENT_SECRET` 코드 사용 | 0건 (ID 토큰 검증 방식이라 불필요) |
| server/client 타입 체크 | ✅ 통과 |
| server 테스트 | ✅ 3 suites / 8 tests 통과 |

## 부록 B. 확인 불가 (환경 접근 필요)
- [ ] `https://1dal.altari.com` TLS 종단 (nginx/CloudFront?) — 레포에 설정 없음. iptables는 80→4000만
- [ ] EC2 `.env` 실제 내용
- [ ] 실기기 구글 로그인 성공 여부
- [ ] 프로덕션 `intel` 테이블 행 수

---

## 진행 로그
| 날짜 | Phase | 내용 | 결과 |
|---|---|---|---|
| 2026-08-07 | — | 전체 코드·문서 감사 완료, 본 계획 수립 | ✅ |
| 2026-08-07 | — | `CLAUDE.md` 신규 작성 (구조·명령·도메인 용어·문서 신뢰도 등급) | ✅ |
| 2026-08-07 | 0 | 죽은 코드 6건 제거 + `TODO(미구현)` 3곳 명시. tsc·jest 통과, 안드로이드 빌드 미검증(JDK 부재) | ✅ |
| 2026-08-08 | 0 | **실기기 로컬 테스트로 Phase 0 검증 완료** — 앱폰 PIN 페어링 → `/scrap` → `/confirm` → 팝업서핑 → `/detail` → 카카오 연산(폴리라인 612pt) → 관제웹 카드 렌더 확인 | ✅ |
| 2026-08-08 | — | 테스트 중 발견: 시뮬레이터 `map.altari.com/inseong` **404**(다른 프로젝트가 배포됨) / keywords 경로 버그(P) / API 404가 HTML 200(Q) | 📌 기록 |
| 2026-08-08 | 2 | D+F 수정. 실기기로 `status=confirmed` 버그 실물 재현 → 수정 → 재검증(궤적 복구·신규 INSERT·합짐 사이클) 전부 통과 | ✅ 완료 |
| 2026-08-08 | — | Phase 2 검증 중 발견: `isShared` 플래그가 실제 합짐 여부와 어긋남(R) | 📌 기록 |
