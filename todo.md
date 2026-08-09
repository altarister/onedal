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

## Phase 1 — 보안 🔒  B·C 완료 (2026-08-09) / A 보류
> **배포**: 새벽 작업 **불필요**로 확정 — EC2에 시크릿이 이미 있어 재로그인이 발생하지 않음

- [x] **사전 확인** — 2026-08-09 SSH 실측 (IP `13.222.63.17`)
  - [x] EC2 `.env`: `JWT_SECRET` ✅ `JWT_REFRESH_SECRET` ✅ **둘 다 설정돼 있음**
        → B의 가장 큰 위험(전원 로그아웃)이 사라짐
  - [x] bypass 사용 이력: **프로덕션에서 2회 사용됨**. 구글 로그인 로그는 **0회**
        → `capacitor.config.ts`에 `server.url`이 없어 WebView origin이 `https://localhost`이고,
          Google이 임베디드 WebView 로그인을 차단하므로 **bypass가 유일한 입구**임이 확정
  - [x] 배포된 프로덕션 코드: `3837f07` (2026-05-11) · PM2 online · 재시작 3회 · 90일 무중단
  - [x] `data.db` 168KB (intel 부담 없음 → H 이슈 시급도 하향)
- [ ] **A. `POST /api/auth/bypass` 게이트** — `server/src/routes/auth.ts:218` 🔴 **보류 (2026-08-09 사용자 결정)**
  - 🔬 실측: 프로덕션 pm2 로그에 `🔓 [AUTH] 로컬 우회 로그인` **2회**, 구글 로그인 **0회**
    → 관제웹 앱의 유일한 로그인 경로. **삭제하면 폰에서 접속 불가**
  - 대안 3가지: ⓐ `ALLOW_BYPASS_LOGIN` 환경변수 + 공유 시크릿(즉시 가능) /
    ⓑ `capacitor.config.ts`에 `server.url` 지정 → origin이 실도메인이 되어 구글 로그인 가능해질 수 있음(근본) /
    ⓒ 관제웹도 PIN 로그인
  - 현재 인증·환경 가드 **전무**. `curl` 한 방이면 DB 첫 유저(=ADMIN) 권한 30일 토큰 발급
  - `client-app/src/pages/Login.tsx:14`가 3초 뒤 무조건 버튼 노출 → **프로덕션에서도 보임**
  - ⚠️ 사이드 이펙트: Capacitor WebView는 origin이 `https://localhost`라 구글 OAuth가 자주 실패 → **네이티브 앱의 주 로그인 수단일 가능성**
  - 방식: 삭제 ❌ → `ALLOW_BYPASS_LOGIN` 환경변수 게이트 + 요청 본문 공유 시크릿 검증. 클라는 게이트 OFF 시 버튼 숨김
- [ ] **B. JWT 시크릿 폴백 제거** — `authMiddleware.ts:37`, `socketHandlers.ts:28`, `auth.ts` 3곳
  - `process.env.JWT_SECRET || "fallback_secret"` → 부팅 시 없으면 `process.exit(1)`
  - ⚠️ **배포 순서 엄수**: ①`.env` 확인 → ②시크릿 주입 → ③가드 코드 배포. 순서 틀리면 **부팅 실패 = 전면 장애**
  - ⚠️ 현재 프로덕션이 `fallback_secret`으로 돌고 있었다면 **발급된 토큰 전부 무효화 → 웹 전원 로그아웃** (앱폰은 deviceId 기반이라 무영향)
- [x] **B. JWT 시크릿 폴백 제거** ✅ 2026-08-09
  - `config/env.ts` 신설 — `validateEnv()`가 부팅 시 필수 변수를 검사하고 없으면 `process.exit(1)`
  - `jwtSecret()` / `jwtRefreshSecret()` 런타임 getter로 8곳 전부 교체
    (`authMiddleware` 1 · `socketHandlers` 1 · `auth.ts` 6). `fallback_secret` 잔존 0건
  - ⚠️ `validateEnv()`는 `dotenv.config()` **이후**에 호출해야 함 —
    CommonJS는 import가 먼저 실행되므로 모듈 로드 시점에 `process.env`를 읽으면 undefined
  - 🔬 검증: `JWT_SECRET=""`로 기동 시도 → **종료 코드 1 + 안내 메시지 출력** 확인
- [x] **C-1. `GET /api/scrap` 삭제** ✅ 2026-08-09
  - 🔬 프로덕션 실측: 토큰 없이 `HTTP 200` · **콜 327건(68KB)** 반환.
    `pickup`/`dropoff`/`fare`/`user_id`/`device_id` 전부 포함
  - 소비처 0건 확인 후 삭제 → 로컬 검증 `404 application/json`
- [x] **C-2. 전역 브로드캐스트 → 유저 룸** ✅ `scrap.ts` `telemetry-ping` → `io.to(userId)`
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

> **🔬 2026-08-08 실측으로 진단 수정**
> 경로①(화면 꺼짐)은 **자동 복구된다**. `/offline`이 `lastSeen=0`으로 만들면 세션 삭제 조건
> (`> DEADMAN×12`)에 즉시 걸려 세션이 통째로 지워지고, 다음 하트비트에 재생성되기 때문.
> curl로 확인함(오프라인 마킹 직후 `mode: AUTO`).
> **영구 고착은 경로②뿐**이다. 데드맨은 `lastSeen`을 0으로 만들지 않고 `mode`만 바꾸며,
> 통신이 재개되면 `lastSeen`이 계속 갱신되어 세션 삭제 조건에 영영 걸리지 않는다.

- [x] **① 서버: 사용자 지정 모드 보존/복원** — `devices.ts`
  - `deviceModePreference` 맵 신설: 관제탑에서 명시 지정한 모드만 담으며 통신 상태에 영향받지 않음
  - `POST /:deviceId/mode` → preference 기록 / `DELETE /:deviceId` → preference 삭제
  - `touchDeviceSession`: OFFLINE→ONLINE 복귀 시 preference로 **모드 복원** (핵심)
  - 세션 신규 생성·비활성 기기 폴백도 `resolveDefaultMode()`(preference 우선)로 통일
- [x] **② 서버: 데드맨 판정 여유 확대** — `devices.ts` `DEADMAN_TIMEOUT_MS` **70초 → 150초**
  - 앱 하트비트 60초 대비 여유가 10초뿐이라 1회 전송 실패(다음까지 120초)로 오작동했음
  - `sendOffline()`과 데드맨 모두 **`mode`를 MANUAL로 강제하던 로직 제거**, `status`만 변경
  - 트레이드오프: 기기 사망 감지가 70초 → 150초로 느려짐 (관제탑에 status가 표시되므로 허용)
- [x] **③ 앱: scrap에도 재시도 적용** — `ApiClient.kt` `sendScrapTelemetry`에 `executeWithRetry` 사용
  - 기존엔 confirm/detail/emergency만 재시도가 있고 생존신고인 scrap만 맨 요청이었음
- [x] ~~**④ 앱: 하트비트 60→25초**~~ — **철회.** ②로 여유가 확보되어 불필요.
  적용했다면 `/api/scrap` 트래픽이 2.4배가 되어 미수정 상태인 **H(intel COUNT 풀스캔)** 를 악화시켰을 것
- [x] **검증 (코드)**: `tsc --noEmit` ✅ / `jest` 8/8 ✅
- [ ] **검증 (실기기)**: 비행기모드 **90초** 후 해제 → 관제탑에서 AUTO가 유지되는지
- [ ] ⚠️ **안드로이드 빌드 미검증** — 이 맥에 JDK 없음. `sendScrapTelemetry` 구조를 바꿨으므로 실기기 빌드 확인 필요

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

### 🆕 S. 첫 짐이 작을수록 합짐 사냥 범위가 좁아짐 (역설) ✅ 2026-08-09 수정 완료
- [x] `shared/src/vehicles.ts:63` `getSharedModeVehicleTypes(v)` = `VEHICLE_OPTIONS.slice(0, idx+1)`
  - `VEHICLE_OPTIONS`가 [오토바이, 다마스, 라보, 승용차, 1t, ...] 작은→큰 순이라
    **첫 짐이 `오토바이`면 `[오토바이]` 하나만 반환** → 합짐 사냥이 사실상 정지
  - 실측 로그: KEEP 전 `[오토바이, 다마스, 라보, 승용차, 1t]` → KEEP 후 **`[오토바이]`**
    (잡은 콜 `93695ca1`의 vehicleType = 오토바이)
  - **논리가 뒤집힘**: 1t 트럭에 오토바이급 짐을 실었으면 공간이 가장 많이 남은 상태인데
    오히려 범위가 가장 좁아진다
  - **근본 원인 — 같은 함수를 두 곳에서 다른 의미로 사용**
    | 호출처 | 인자 | 의미 | 판정 |
    |---|---|---|---|
    | `filterManager.ts:81`, `userSessionStore.ts:97,112` | 내 차종 | "내 차로 잡을 수 있는 콜 등급" | ✅ |
    | `dispatchEngine.ts:496` | 첫 짐 차종 | "남은 적재 공간" 의도 | ❌ |
  - **왜 두 의미로 쓰였나 (git 이력 추적)**
    | 날짜 | 커밋 | 사건 |
    |---|---|---|
    | 4/22 | `963a8b5` | 함수 탄생. 파라미터명 `firstLoadVehicle`, 유일한 호출처는 dispatchEngine(합짐용) |
    | 4/24 | `8b3e877` | filterManager가 같은 함수를 `userVehicleType`(내 차종)으로 재사용 |
    - 이름이 인자의 의미를 안 담음(`getSharedModeVehicleTypes(x)`의 x가 뭔지 알 수 없음)
    - 두 의미 모두 `string`이라 컴파일러가 못 잡음
    - 우연히 둘 다 그럴듯한 결과를 냄
    - **근본적으로 함수 입력이 부족했음** — 남은 공간은 `내 차 용량 − Σ실은 짐`인데
      시그니처에 내 차 용량이 아예 없었다

  - ✅ **수정 (2026-08-09)** — 기사님 실측 규칙 반영
    ```
    적재 점수 (1t 트럭 = 30점): 1t×1 = 라보×2 = 다마스×3 = 승용차×5
      오토바이 0(조수석, 상한없음) · 승용차 6 · 다마스 10 · 라보 15 · 1t 30 · 이후 톤당 30
    ```
    - `VEHICLE_CAPACITY` 명시 점수표 도입 → `VEHICLE_OPTIONS` 배열 순서 의존 제거
      (⚠️ 배열은 UI용이며 승용차가 다마스보다 뒤에 있어 실제 용량 순서와 다름)
    - `normalizeVehicleType()` — 앱 파서 축약코드(오/다/라) 보정
    - **`getEligibleVehicleTypes(myVehicle)`** — 빈차 기준 수행 가능 등급 (filterManager, userSessionStore)
    - **`getRemainingCapacityTypes(myVehicle, loadedVehicles[])`** — 합짐 잔여 공간 기준 (dispatchEngine)
      인자 개수가 달라 **오용 시 컴파일 에러**
    - dispatchEngine이 첫 짐 하나가 아니라 **`getActiveCalls()` 전부를 합산**하도록 변경
    - 단위 테스트 24개 추가 (`tests/shared/vehicles.test.ts`) — 이슈 S 재현 방어 케이스 포함

### 🆕 T. 필터 전체를 매 scrap 응답마다 로그 출력 (앱) ✅ 2026-08-09 수정 완료
- [x] `ApiClient.kt` `AppLogger.d(TAG, "📋 [필터 동기화...] ...\n$updatedFilter")`
  - `destinationKeywords` 180개 + `destinationGroups` 전체를 매 응답마다 출력.
    데스밸리 대기 중엔 1초 폴링이라 초당 수 KB. logcat 4KB 한계에 걸려 `…�`로 잘림
  - 운전 중 배터리·성능 손해 + 정작 봐야 할 로그가 묻힘
  - ✅ **A2 수정**: 평소엔 요약 한 줄(`차종 N종 | 키워드 N개 | isActive | 첫짐/합짐 | minFare`),
    필터가 실제로 바뀐 순간에만 전체를 `v` 레벨로. `AppLogger.SHOW_VERBOSE_LOGS`를
    `BuildConfig.DEBUG`에 연동해 release 빌드에선 자동 off
  - ✅ **A1 수정 (서버 페이로드)**: `/api/scrap` 응답에서 `destinationGroups` 제외.
    앱의 `loadCurrentFilter()`가 파싱조차 하지 않는데 응답의 27%(약 3.6KB)를 차지하고 있었음.
    관제탑은 소켓(`filter-updated`)으로 별도 수신하므로 무영향
  - 🔜 **A3 (미착수, Phase 3)**: 필터 해시 비교 → 안 바뀌었으면 `dispatchEngineArgs` 생략.
    평상시 13,458B → ~500B (−96%). 앱·서버 동시 배포 필요

### 🆕 X. 관제탑 경로 요약 문구가 정상 상태를 에러로 표시 ✅ 2026-08-09 수정 완료
- [x] `client-app/.../PinnedRoute.tsx` — 콜을 전부 취소하면 `카카오 연산 에러 혹은 대기중...` 표시
  - 원인: `liveRoute = activeRoute.filter(!isTerminal)`가 빈 배열이 되는데,
    취소된 콜은 '취소/방출' 탭 표시용으로 `activeRoute`에 남아 있어 블록은 계속 렌더됨
    → `lastRoute === undefined` → 무조건 위 문구
  - 서로 다른 3가지가 한 문구로 뭉뚱그려져 **정상 상태를 에러로 오인**하게 만들었다
  - ✅ 수정: 상태를 분리
    | 상황 | 표시 |
    |---|---|
    | 진행 중 0건 (전부 취소/완료) | `진행 중인 경로 없음 · 새 콜 대기 중` |
    | 콜은 있는데 연산 미완 | `카카오 경로 연산 중...` |
    | `kakaoTimeExt`에 실패/에러 | `카카오 경로 연산 실패` |
  - ✅ `(N건 완료)` → `(N건 종료)` — 종료에는 취소·방출도 포함되므로 "완료"는 부정확
  - ✅ 진행 중 경로가 없을 때 구글맵 링크 비활성화 (origin/destination이 비어 깨진 링크였음)
  - 2026-08-09 실기기 사용 중 발견

### 🆕 W. 서버 재시작 후 필터가 실제 적재 상태와 어긋남 ✅ 2026-08-09 수정 완료 🔴
- [x] 재시작 시 `userSessionStore`가 `activeFilter`를 무조건 STANDBY/`isSharedMode=false`로 리셋하는데,
  `restoreAndRecalculateSession`은 **myOrders와 궤적만 복구하고 필터는 손대지 않았다.**
  - 실측(2026-08-09): DB에 진행 중 3건(광주→파주)인데 필터는 `STANDBY / isSharedMode=false / isActive=true`
  - **위험 3가지**
    1. `OrderEvaluator`는 `isSharedMode`일 때만 도착지 회랑을 검사 → **경로 이탈 콜도 통과**
       (앱 1차 필터가 "파주행"만 거르므로 인천·수원에서 상차하는 파주행 콜을 잡을 수 있음)
    2. `dispatchPhase==='STANDBY'`라 **첫짐 절대하한가(minFare)가 잘못 적용** (놓치는 쪽이라 덜 위험)
    3. 남은 적재 공간 무시 — 이번엔 실린 3건이 전부 오토바이(0점)라 우연히 맞았지만,
       **라보 2건이었다면 만재인데도 1t 콜을 잡으러 갔을 것**
  - 이슈 R(`isShared` 플래그 어긋남)도 같은 뿌리
  - ✅ **수정**: `restoreAndRecalculateSession` 끝에서 복구된 데이터로부터 상태를 **파생**
    ```
    dispatchPhase       = deriveDispatchPhase(driverAction, activeCalls.length)
    isSharedMode        = true (활성 콜이 있을 때)
    allowedVehicleTypes = getRemainingCapacityTypes(myVehicle, 실린 차종들)
    destinationKeywords = syncCorridorFilter()  ← 복구된 폴리라인 기준 회랑 재계산
    ```
    - `shared`에 이미 있던 `deriveDispatchPhase`(사용처 0건)를 드디어 연결
    - **상태를 저장했다 되살리는 대신 데이터에서 매번 파생** — 파생값은 어긋날 수 없다
    - 복구 쿼리가 오늘 것만 가져오므로 "어제 상태가 살아남" 우려는 근거 없음 (주석 정정)
  - ✅ **관제탑 배너**: `session-restored` 소켓 이벤트 → Dashboard 상단 알림.
    이미 배달했는데 완료 처리를 안 한 건이 있으면 서버가 계속 "적재 중"으로 믿으므로
    완료 처리를 유도한다
  - ✅ 단위 테스트 7개 추가 (`tests/shared/dispatchPhase.test.ts`) — 이슈 W 재현 방어 포함
  - 판단: 복구 시 사냥을 멈추지 않는다. 필터가 맞으면 위험 자체가 사라지고,
    멈추면 기사가 배너를 못 볼 때 조용히 사냥이 정지해 콜을 놓친다

### 🆕 V. 컴파일 타임 상수 인라인으로 버전 마커가 거짓말을 함 ✅ 2026-08-09 수정 완료
- [x] `BuildConfig.VERSION_NAME`은 `static final String` 컴파일 타임 상수라 **호출부에 값이 인라인**된다.
  `versionName`만 바꾸고 호출부 소스가 그대로면 `compileDebugKotlin`이 up-to-date로 판정되어
  APK에 옛 문자열이 남는다.
  - 실측: DEX 안에 `1.2-capacity+logdiet` 1개(BuildConfig 클래스)와
    `1.1-phase1.5` 2개(DashboardScreen·HijackService 인라인)가 **동시에 존재**
  - 증상: `adb dumpsys`는 1.2인데 앱 화면은 1.1 → 설치 여부를 판단할 수 없게 됨
    (버전 혼동을 없애려고 만든 마커가 스스로 혼동의 원인이 됨)
  - ✅ 수정: `core/AppInfo.kt` 신설. `PackageManager.getPackageInfo()`로 **런타임 조회**.
    매니페스트를 읽으므로 `adb dumpsys` 결과와 항상 일치하며 인라인 영향을 받지 않는다.
  - 교훈: 빌드 산출물을 식별하는 값은 컴파일 타임 상수로 쓰지 말 것

### 🆕 Z. 자체 리뷰에서 발견한 내 코드의 결함 (2026-08-09) — 3건 수정 완료
> 오늘 작업을 기획 문서와 대조해 스스로 검토한 결과. 남은 땜빵도 정직하게 기록한다.

- [x] **Z-1. 보안 작업 중 새 정보 노출을 만들었다 (자기모순)** ✅ 수정
  - 같은 날 무인증 `GET /api/scrap`를 "정찰 정보 노출"이라며 삭제해 놓고,
    내가 만든 `/api/health`는 git 커밋·브랜치·NODE_ENV·DB 파일명·Node 버전을 무인증 노출
  - → 공개는 `ok`/`bootedAt`/`uptime`만. 상세는 `/api/health/detail` + `requireAuth`
  - "재기동됐는가" 판별에는 `bootedAt` 하나로 충분하다
- [x] **Z-2. W의 원칙을 절반만 지켰다** ✅ 수정
  - `isSharedMode === (dispatchPhase !== 'STANDBY')`인데 두 값을 따로 세팅해 왔고,
    W 수정에서도 **값만 손으로 맞춰놨을 뿐** 어긋날 수 있는 구조는 그대로 뒀다
  - → `updateActiveFilter` 단일 진입점에서 **불변식을 강제**해 divergence를 불가능하게 함
  - 필드 제거가 이상적이지만 앱 `InsungParser`가 이 키를 파싱하므로 값만 파생
- [x] **Z-3. 차종 인식 실패가 조용히 합짐을 차단한다** ✅ 경고 로그 추가
  - `capacityOf`가 unknown 차종을 "내 차 만재"로 처리 → 이후 오토바이만 잡게 됨
  - 안전한 방향이지만 **콜을 놓친다**. 실전 파싱 실패율을 모르므로 눈에 띄게 로그
- [x] **A-2. 킬스위치 결정** — 통신 복귀 시 **AUTO 자동 복원** (2026-08-09 승욱님 확인)
  - PRD §3의 "누적 페널티 킬스위치"를 데드맨이 대행하던 것을 제거한 셈이므로,
    `devices.ts`에 결정 근거를 주석으로 남김. 킬스위치는 관제탑 명시 지정으로만 작동
- [x] **대기열 시뮬레이션 제거** (2026-08-09 승욱님 결정)
  - `useKakaoRouting.ts` · `DrillDownModal.tsx` 삭제, `selectedOrder`/`pendingOrders`/`rejectedCallIds` 정리
  - 한 번도 동작한 적 없음: 모달을 여는 코드 0곳 · 입력이 구조적으로 항상 빈 배열 ·
    적요는 하드코딩 더미 · 수락 버튼은 안내 alert
  - PRD의 선빵필승(광클 → 데스밸리 30초) 설계와 상충. 같은 정보는 `order-evaluated`가 더 정확히 제공
  - 서버 `/api/kakao/directions/compare`는 범용이라 존치

### 🆕 AA. 종료된 콜을 "적재 중"으로 세던 UI 버그 ✅ 2026-08-09 수정
- [x] `VehicleStatusPanel.tsx` — `1t 예약 7건 (오토바이, 오토바이, 오토바이, 다마스, 다마스, 라보, 라보)`
  처럼 이미 취소·방출한 콜까지 적재 중으로 표시 (실제 진행 중은 2건)
  - 원인: `mainCall`/`subCalls`는 서버 `sync-active-orders`를 그대로 받은 것이라
    **'취소/방출' 탭 표시용으로 종료된 콜이 의도적으로 포함**되어 있다.
    `PinnedRoute`(liveRoute)와 `PinnedRouteCanvas`는 걸러내는데 **이 컴포넌트만 빠져 있었다**
  - 함께 고친 것 ①: **GPS 상차 감지**도 같은 배열을 써서, 이미 취소한 콜의 상차지를
    지나가기만 해도 "상차 완료"로 기록되고 있었다
  - 함께 고친 것 ②: `Dashboard.hasHomeReturnActive`도 미필터라, 귀가콜을 한 번 만들었다
    취소하면 **다시 만들 수 없게** 되어 있었다
  - 전수 조사: `mainCall`/`subCalls`/`activeRoute`를 쓰는 3개 파일 모두 `isTerminal` 적용 확인

### 🆕 BB. 경로 재탐색(시간/거리 우선)이 엉뚱한 콜을 고치고 있었음 ✅ 2026-08-09 수정
> 기사님이 붙여넣은 로그의 `-9223372036854776000`(= Long.MIN 오버플로)에서 출발해 5건을 찾았다.
- [x] **① 재탐색 대상이 항상 첫 콜** — `PinnedRoute`가 `activeRoute[0].id`를 보냈다.
  합짐 3건이면 1번 콜을 기준으로 재탐색하는데, 정작 서버는 **마지막 콜** 기준으로 경로를 만든다.
  → `liveRoute[liveRoute.length - 1]`(종료건 제외한 마지막 활성 콜)로 통일. `liveRoute` 비면 버튼 자체를 숨긴다
- [x] **② 단독 재탐색 결과에 거리·시간이 없었음** — `[시간우선]`만 찍혀 무엇이 바뀌었는지 알 수 없었다.
  → `[시간우선] 42.3km, 58분` 형태로 통일
- [x] **③ 합짐 재탐색 결과를 엉뚱한 콜에 기록** — 결과 폴리라인을 항상 `securedOrder`에 썼는데,
  화면이 그리는 건 **마지막 활성 콜**의 폴리라인이라 재탐색해도 지도가 그대로였다.
  → `existingActive[마지막]`에 기록하고, `securedOrder`와 다르면 그 콜도 `order-evaluated`로 함께 내보낸다
- [x] **④ 폴리라인 좌표 검증 없음** — 카카오가 이상값을 주면 지도가 통째로 붕괴된다.
  → `KOREA_BOUNDS`(경도 123~133 / 위도 32~40) 밖 좌표는 버리고 버린 개수를 경고 로그로 남긴다
- [x] **⑤ 죽은 변수 + 정밀도 불일치** — 쓰이지 않는 `currentOrders` 제거, `toFixed(1)` 문자열이
  숫자 필드에 들어가던 것을 `parseFloat(toFixed(1))`로 통일

### 🆕 CC. 부트스트랩 순서 통일 — 컴포넌트가 각자 놀던 문제 ✅ 2026-08-09 수정 🔴
> 기사님 지적: *"컨포넌트들이 각자 일을 하는데 일관성이 없어 발생하는 거 같다"* — 정확했다.
- **전(前) 상태**: 초기화가 세 군데로 흩어져 서로를 기다리지 않았다
  - `getUserSession()` (동기) — DB 로드 + **무거운 지리 연산**을 소켓 접속 시점에 수행
  - `restoreAndRecalculateSession()` (비동기) — 소켓 핸들러가 **await 하지 않고** 호출
  - `syncCorridorFilter()` — 회랑을 따로 계산
  - 그 결과 `destinationKeywords`를 만드는 곳이 **4군데**였고 진실 공급원이 없었다
- **증상**: 복구가 끝나기 전에 `filter-init`이 나가서
  ① 앱폰이 1~3초간 *회랑 없는 첫짐 필터*를 받아 **경로 이탈 콜을 잡을 수 있었고**
  ② 관제탑이 첫짐 → 합짐으로 깜빡였다
- [x] **`bootstrapUserSession(userId, io)` 신설** — 순서를 한 함수가 책임진다
  `① 세션(지리연산 없음) → ② 콜 복구 → ③ 카카오 노선 → ④ 상태 파생 → ⑤ 회랑 → ⑥ 필터 확정·1회 전송`
- [x] **`isBootstrapping` 게이트 3곳** — 확정 전에는 밖으로 아무것도 안 내보낸다
  - `/api/scrap` 응답에 `isActive: false` → **앱폰이 사냥을 멈춘다** (핵심)
  - `broadcastFilter()` 억제 → 관제탑 깜빡임 제거
  - `request-filter-init` 보류 → 미완성 필터 응답 방지
  - `finally`로 반드시 해제 (여기서 막히면 사냥이 영영 멈추므로)
- [x] **`destinationKeywords` 생성처를 ⑤ 한 곳으로** — `userSessionStore`에서 `getCityRegionsWithRadius`
  호출을 걷어내고, 활성 콜이 있으면 회랑 / 없으면 `destinationCity` 기준으로 ⑤에서만 만든다
- [x] **`filter-init` 중복 발신 제거** — 서버가 접속 시 push 하는데 관제웹이 `request-filter-init`도
  보내서 키워드 140개짜리 페이로드가 2회 오갔다(실측 37ms 내 2회). 관제웹은 필터가 비었을 때만 요청
- **실측 검증** (4001 포트 스모크 + 소켓 프로브)
  - 최초 접속: `filter-init` **1회**, `+810ms`(부트스트랩 완료 후). 그 전엔 아무것도 안 나감
  - 재접속: `filter-init` **1회**, `+28ms` (재연산 없음)
  - 로그: `🗺️ [Bootstrap ⑤] 첫짐 모드 — '파주' 기준 키워드 140개` → `✅ [Bootstrap 완료] 804ms`
  - 관제웹은 확정 전까지 기존 `오더 필터 동기화 중...` 스켈레톤을 그대로 표시 (수정 불필요)

### 🆕 DD. 경로 요약줄 운임이 취소·방출 콜까지 합산 ✅ 2026-08-09 수정
- [x] 실측: `총 7개 경로 정보 (5건 종료) / 104.7km / 510,000원` — 진행 중은 2건뿐인데 **운임만 7건 합계**
  - 원인: 같은 요약줄에서 주행거리·예상시간은 `liveRoute`(진행 중)로 계산하는데
    **운임만 `activeRoute` 전체를 `reduce`** 하고 있었다. 취소한 콜은 한 푼도 받지 못하므로 명백한 과다 표시
  - AA(적재 건수)와 **완전히 같은 종류의 누락** — `isTerminal` 필터를 한 군데만 빠뜨린 것
- [x] 앞자리 표기도 `총 7개 경로 정보` → **`진행 중 2건 · 종료 5건`**.
  종료 건까지 합한 수가 먼저 보여 7건짜리 운행으로 읽혔다
- [x] 금액 아래 `진행 중 운임` 라벨 추가 — 무엇의 합계인지 화면에서 바로 알 수 있게
- [x] **거리 정밀도 불일치**: 사후 재계산의 단독 분기만 `Math.round(distance/1000)`로 정수화해
  합짐은 `104.7km`, 단독은 `105.0km`로 표시됐다 → `parseFloat(toFixed(1))`로 통일

### 🆕 EE. 중간 점검 — 오늘 수정하며 생긴 임기응변 정리 ✅ 2026-08-09
> 기사님 지시로 오늘 작업분을 다시 훑었다. 고치는 과정에서 스스로 만든 땜빵 5종을 걷어냈다.

**1. 합짐 경로 조립 코드가 4벌 복사돼 있었다** → `services/routeComposer.ts` 신설
- `handleDecision(KEEP)` · `recalculateActiveKakaoRoute(취소 후)` · `recalculateKakaoRoute(재탐색)` ·
  `restoreAndRecalculateSession(재시작 복구)` 가 **똑같은 20여 줄을 각자** 들고 있었다
- 복사본이라 조금씩 어긋났고, **그 어긋남이 그대로 오늘의 버그였다**
  - 결과 기록처가 제각각(`securedOrder` / `activeSubs[last]` / `existingActive[last]`) → 이슈 BB-③
  - 거리 단위가 제각각(`Math.round` / 나눗셈 그대로 / `toFixed`) → 이슈 DD
  - TSP 시작점이 제각각(`driverLocation` 쓰는 곳 2 / 안 쓰는 곳 2) → 같은 콜인데 경유지 순서가 달라짐
  - 좌표 없는 콜을 거르는 곳과 안 거르는 곳 (`{x: undefined}` 가 경유지로 들어갈 수 있었음)
- 이제 규약은 세 함수뿐: `composeMergedRoute()` / `pickRouteHolder()` / `applyRoute()` + `toKm()` `toMin()`
- `dispatchEngine.ts` **182줄 삭제 / 86줄 추가 (순 -96줄)**

**2. 부트스트랩이 "시퀀스"가 아니라 "옛 모놀리스 + 땜빵"이었다**
- 주석에는 ①~⑥이라 써놓고 실제로는 `restoreAndRecalculateSession()` 한 방 + ⑤ 보강 패치였다.
  `rows.length === 0`이면 그 모놀리스가 조기 return 해서 신규 유저는 통째로 건너뛰고,
  그걸 메우려고 밖에 패치를 덧댄 구조 — **내가 고치겠다던 "각자 일을 한다"와 같은 모양**
- → `rebuildDestinationKeywords(userId, io)` 로 분리. 활성 콜 유무 갈래가 **여기 한 곳**에만 있다
- `restoreAndRecalculateSession` 안의 `syncCorridorFilter` 중복 호출도 제거 (같은 지리 연산 2회)

**3. 🔴 마지막 콜을 취소하면 회랑 키워드가 그대로 남아 있었다** (리팩터링 중 발견한 실제 버그)
- `recalculateActiveKakaoRoute`가 `activeCalls.length === 0`이면 **곧바로 return** 해서
  `syncCorridorFilter`까지 가지 못했다 → 첫짐 모드로 돌아왔는데도 **끝난 경로 주변만 사냥**
- → 조기 return 전에 `rebuildDestinationKeywords()` 호출

**4. 인라인 `require()` 4건 제거** — ESM import 파일 안에 CommonJS `require`가 섞여 있었다
  (`geoService` 2건, `@onedal/shared` 2건). 순환 참조 때문이 아니라 그냥 급하게 쓴 것 — 상단 import로 정리

**5. 클라: `isTerminal` 필터를 "기억해야 하는 규칙" → "고를 수 없는 구조"로**
- 오늘 같은 버그가 세 번(AA 적재 건수 · BB 재탐색 대상 · DD 운임 합계) 났고 전부
  *"종료된 콜이 섞인 배열을 필터 없이 썼다"* 였다
- → `useOrderEngine`이 `liveCalls`를 유일한 판정처로 제공.
  `VehicleStatusPanel`은 계약 자체를 `{ liveCalls }`로 바꿔 **종료된 콜을 애초에 받지 않는다**
- ⚠️ 남은 근본 원인은 서버 `sync-active-orders`가 진행/종료를 한 배열로 보내는 것 (todo I+M)

- **검증**: server tsc · jest 39 · client tsc 통과. 4001 포트 스모크 재실행 —
  `filter-init` 1회 `+912ms`, `🗺️ [키워드 재구성] 첫짐 모드 — '파주' 기준 140개` (동작 동일)

### 🆕 FF. 요금 폴백 파서 — 정정 후 수정 완료 ✅ 2026-08-10

> ⚠️ **최초 보고 정정**: *"40,000원을 40원으로 읽는다"* 고 적었으나 **틀렸다.**
> 정규식만 눈으로 보고 판단했고 함수를 끝까지 읽지 않았다. 실제로 실행해 보니
> `요금 : 40,000(신용)` → **40,000원(정답)** 이었다. 뒤의 축약형 휴리스틱
> (`val>=10 && val<=9999 → val*1000`)이 쉼표 절단을 우연히 상쇄하고 있었다.
>
> 그런데 그 휴리스틱 자체가 **훨씬 위험한 버그**였다.

**실측 (수정 전)**

| 입력 | 결과 | 판정 |
|---|---|---|
| `요금 : 8000` | **8,000,000원** | 🔴 **1000배 뻥튀기** — 8천원 똥콜이 800만원 초꿀콜로 |
| `요금 : 9900` | 9,900,000원 | 🔴 동일 |
| `요금 : 8,000(착불)` | 8원 | 과소 (하한가에 걸려 탈락하므로 상대적으로 안전) |
| `요금 : 9,500` | 9원 | 과소 |
| `요금 : 40,500(신용)` | 40,000원 | 백 단위 절단 |
| `요금 : 40,000(신용)` | 40,000원 | ✅ (우연) |

- [x] **원인**: 쉼표를 버려서 "이 숫자가 원 단위인가 축약형인가"를 **크기로 추측**해야 했다.
      추측이 틀리는 구간(1000~9999)에서 1000배가 튄다
- [x] **수정**: 쉼표를 살려 판별 근거로 쓴다 — **쉼표가 있으면 원 단위 확정**
      (인성콜 축약형 "45"는 쉼표를 쓰지 않는다). 맨 정수는 `< 1000` 일 때만 축약형
- [x] `[목업 지원 전용]` 이라는 주석도 거짓이었다 — `detail.ts:63`에서 실제 호출된다.
      앱의 리스트 파서는 차종코드 옆 만 단위("라 2.2")를 읽게 돼 있어 **확정 상세 화면에서는
      요금을 못 잡고 0을 보낸다.** 그때 이 함수가 판정의 유일한 근거가 된다 → 주석 정정
- [x] **회귀 테스트 26개 추가** (`tests/utils/parser.test.ts`)
- ⚠️ **실제로 터졌는지는 미확인** — `local.db` 16건은 요금이 모두 정상이다.
      앱이 리스트에서 제대로 긁으면 이 폴백은 안 탄다.
      폴백이 도는 경로는 `HijackService.kt:485` (`lastDetailOrder == null`, 즉
      **리스트를 거치지 않고 상세 화면부터 시작한 경우**)

### 🆕 GG. 결제방법이 16건 전부 `null` 이던 원인 ✅ 2026-08-10 수정

- [x] 화면은 `요금 : 40,000(신용)` — **결제방법이 요금 값의 괄호 안**에 있다
      (`ex_images/인성/상세-확정(...).png`)
- [x] 파서는 `extractField(lines, "결제방법") || "지불" || "결제"` — **존재하지 않는 필드명**을 찾고 있었다
- [x] 수정: 요금 괄호에서 추출. **알려진 결제수단일 때만** 채택해
      `요금 : 40,000(협의)` 같은 자유 텍스트를 결제수단으로 오인하지 않는다
- [x] `@onedal/shared`에 `PAYMENT_TYPES` 배열 신설 — 런타임 검사 목록과 타입이 갈라지지 않도록
      **배열을 진실 공급원으로 두고 타입을 파생** (`typeof PAYMENT_TYPES[number]`)
- [x] 기존 `결제방법 :` 필드 표기도 계속 지원 (다른 배차망 대비)
- 이걸로 Phase 8.5(착불 현금 수령)의 전제가 성립한다

### 🆕 HH. 앱이 보내는데 저장 안 되던 컬럼 2개 ✅ 2026-08-10 수정

`orders` 40개 컬럼 중 INSERT 목록에 11개가 빠져 있었다. 전수 대조 결과:

| 빠진 컬럼 | 판정 |
|---|---|
| `settlementStatus` · `unpaidAmount` · `createdAt` | DB DEFAULT 로 채워짐 — 정상 |
| `completedAt` | 별도 UPDATE 로 기록 — 정상 |
| `payerName` · `payerPhone` · `dueDate` · `settlementMemo` · `settledAt` | 미구현 기능용 — 소스 없음 |
| **`scheduleText`** · **`postTime`** | 🔴 **앱이 보내는데 버려지고 있었다** |

- [x] `scheduleText` — `"낼09시"` `"급송"` 같은 **예약 표기 원문**.
      앱 `LocationTextAnalyzer` → `InsungParser` → DTO → DB 컬럼까지 다 있는데
      **INSERT 목록 한 곳에서만** 빠져 16건 전부 저장 0건
- [x] `postTime` — 콜 등록/상차 시간 표기. 같은 이유로 0건
- [x] `ON CONFLICT` 에는 `COALESCE(excluded.x, x)` 로 — 재확정 시 빈 값이 기존 값을 지우지 않게
      (`PlaceRepository`가 쓰는 것과 같은 규약)
- 🔴 **지금 켜야 하는 이유**: Phase 8.7의 `scheduleText` 파서는
      *"주선사가 임의로 쓰는 비표준 표기"*(기사님)라 **실물을 모아야 규칙을 만들 수 있다.**
      저장을 안 켜면 분석할 과거 데이터가 영영 안 쌓인다

### ⚠️ 남은 땜빵 (정직하게 기록)
- [ ] **데드맨 150초는 숫자 조정일 뿐** — 근본은 앱 하트비트 주기와 서버 판정 주기 사이에 계약이 없는 것.
      앱이 `/scrap`에 자기 주기를 실어 보내고 서버가 그 배수로 판정해야 한다
- [ ] **`deviceModePreference`가 메모리 전용** — 서버 재시작 시 사라져 `isActive` 폴백.
      → 재시작 후 풀오토가 또 풀릴 수 있다. `user_devices` 테이블에 컬럼 추가 필요
- [ ] **앱 버전 마커 수동 증가** — 잊으면 또 혼동. gradle이 커밋 해시를 자동 주입하도록
- [ ] **G(데스밸리 타이머 3중)** 미수정 — 경고와 강제취소가 여전히 동시(30초). 관제사 판단 시간 0초
- [ ] **앱 로그 `20s Keep-alive`** 여전히 거짓 (실제 60초)
- [ ] **부트스트랩 ⑤의 지리 연산이 이벤트 루프를 804ms 막는다** — `getCityRegionsWithRadius`가 동기라
      그동안 다른 기사의 `/api/scrap`도 함께 지연된다. 위치만 옮겼을 뿐 근본은 그대로.
      → 폴리곤 교차 결과를 (도시, 반경) 키로 캐시하거나 worker_thread 로 빼야 한다

### 🆕 Y. 배포 인프라 문제 (2026-08-09 발견) 🔴
- [ ] **EC2 퍼블릭 IP가 바뀌었는데 스크립트가 옛 IP를 보고 있음**
  - `deploy-auto.sh:7` `EC2_IP="44.222.73.86"` → **22/80/4000 전부 도달 불가 (죽은 IP)**
  - 실제 IP는 **`13.222.63.17`** (Cloudflare DNS 패널에서 확인)
  - `LOCAL_DEVELOPMENT_GUIDE.md`가 "긴급 시 이걸 쓰라"고 안내하는 수동 배포 경로가 **동작하지 않음**
  - GitHub Actions는 `secrets.EC2_HOST`를 쓰므로 그쪽은 별개 (Secrets는 읽을 수 없어 확인 불가)
- [ ] **Elastic IP 미할당** — EC2를 중지·재시작할 때마다 IP가 바뀌어
  `deploy-auto.sh`와 GitHub Secrets가 동시에 깨진다. 탄력적 IP를 붙이면 재발하지 않으며
  인스턴스에 연결된 상태에서는 무료
- [ ] **`deploy.sh`(구버전 폴백)도 깨져 있음** — `cd client`인데 실제 폴더는 `client-app`
- [ ] IP를 `.env`나 환경변수로 빼서 하드코딩 제거

### 🆕 U. `tsx watch`가 파일 변경을 놓침 (로컬 개발 신뢰성) ✅ 2026-08-09 완화
- [x] `pnpm dev`의 `tsx watch src/index.ts`가 소스 수정을 감지하지 못하는 경우가 반복됨
  - 2026-08-08 `OrderRepository.ts` 수정 → 미감지 (수동 재시작 필요)
  - 2026-08-09 `scrap.ts` 수정 → 미감지 (서버 8/8 11:43 기동, 파일 8/9 01:01 수정)
  - 그 사이 8/8 `index.ts` 수정은 정상 감지 → **간헐적**
  - 증상이 위험한 이유: 고친 줄 알고 검증했는데 옛 코드가 돌고 있어 결론을 잘못 내리게 됨
    (앱 APK 버전 혼동과 동일한 종류의 문제)
  - ✅ **대응**: `GET /api/health` 신설 — 부팅 시각·업타임·git 커밋/브랜치·DB 파일·NODE_ENV 노출.
    기동 로그에도 `🧾 [BUILD] commit xxx (branch) · 부팅 시각` 한 줄 출력.
    **소스를 고쳤는데 `bootedAt`이 그대로면 재기동이 안 된 것**이므로 curl 한 번으로 판별된다.
    (앱의 versionName 마커와 동일한 목적 — 시스템이 자기 정체를 스스로 말하게 만든다)
  - ⚠️ 근본 원인(tsx watch 자체의 미감지)은 미해결. 감지 실패 시 수동 재시작 필요

### 🆕 R. `isShared` 플래그가 실제 합짐 여부와 어긋남 ✅ 2026-08-09 수정 완료
- [x] `dispatchEngine.handleDecision`의 `const isShared = session.activeFilter.isSharedMode ? 1 : 0`
  - 서버 재시작 시 `userSessionStore.ts:88`이 `isSharedMode: false`로 리셋하므로,
    복구된 세션에서 잡은 합짐 콜은 Detour 연산을 하고도 DB에 `isShared=0`으로 기록됨
  - 실측: `f134859d`는 `Waypoints Count: 2`로 우회 연산했으나 `isShared=0`
  - ✅ **수정**: 필터 모드가 아니라 **`getActiveCalls(session).length > 1`** 로 판정.
    이 시점엔 confirmedOrder가 이미 push된 뒤라, 활성 콜이 2건 이상이면 앞선 짐이 있었다는 뜻이다.
    W와 같은 원칙 — 상태가 아니라 데이터에서 파생시킨다.
  - 영향(수정 전): 운행일지·통계에서 합짐 건수가 실제보다 적게 집계됐음
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
- [x] **🆕 P. keywords 설정 파일 경로 오류** — `server/src/routes/config.ts:14` ✅ 2026-08-08 수정
  - `path.join(__dirname, "../../../config")` → `server/src/routes`에서 3단계 올라가 `onedal-web/config`를 봄
  - 실제 파일은 `server/config/keywords_inseong.json`. **`../../config`로 수정** (dist 빌드 시에도 동일하게 맞음)
  - 현재는 else 분기의 기본값으로 폴백 + `targetAppKeywords`를 읽는 코드가 없어 **무해**하지만, 매 앱 기동 시 에러 로그를 뱉음
  - 2026-08-08 로컬 테스트 중 발견 → 같은 날 `../../config`로 수정. curl 검증 시 실제 파일 반환 확인
- [x] **🆕 Q. 없는 API가 404 대신 HTML 200을 반환** — `server/src/index.ts` ✅ 2026-08-08 수정
  - SPA 폴백(`app.use((req,res) => sendFile(index.html))`)이 `/api/*` 미매칭 요청까지 잡아 `text/html` 200을 돌려줌
  - 앱(Gson)이 HTML을 파싱하려다 예외 → 실패 원인을 알 수 없게 됨
  - 수정: SPA 폴백 앞에 `app.use("/api", ...)` 404 JSON 가드 추가
  - curl 검증: `POST /api/이런거없음` → `{"error":"NOT_FOUND"}` 404 application/json ✅
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

---

## Phase 7 — 영업일 경계 (Day Rollover) 📅  🔴 계획 (미착수) · v2 (2026-08-10 재작성)

> 기사님 요청: *"날짜가 바뀌어 어제까지 정보를 저장해 두고 오늘 데이터를 리셋해서 첨부터 시작"*
>
> **v1 정정**: v1은 `local.db`의 완료율(16건 중 1건 = 6%)을 근거로 "기사님이 완료 처리를
> 거의 안 한다"고 결론 내고 설계를 그 위에 얹었다. **그 DB는 집에서 만든 테스트 데이터**라
> 근거가 될 수 없다. 철회하고, 실제 운행 시나리오에서 설계를 다시 유도한다.
>
> ⚠️ **이 Phase의 전제**: 실 운행 데이터가 없다. 그러므로 설계는
> **"기사님이 어떻게 행동하든 깨지지 않는" 쪽**으로 잡고, 검증은 시뮬레이션으로 한다.

### 7.1 실제 운행 시나리오 (설계 검증용 5종)

설계안은 아래 다섯 가지를 **모두** 통과해야 한다.

| # | 시나리오 | 자정 경계에서 무슨 일이 | 설계가 답해야 할 것 |
|---|---|---|---|
| **A** | **일반 주간** 07:00 상차 → 18:00 귀가콜 | 아무 일 없음 | 대다수 케이스. 롤오버가 방해하면 안 됨 |
| **B** | **야간 단발** 23:00 상차 → 02:00 하차 | 상차와 하차가 다른 날 | 한 운행이 이틀로 쪼개지면 안 됨 |
| **C** | **1박 장거리** 전날 20:00 상차 → 차박 → 익일 09:00 하차 | 잠자는 사이에 날짜가 바뀜 | 기사님이 말한 그 케이스. 아침에 화면에 남아 있어야 함 |
| **D** | **새벽 합짐** C 상태에서 익일 07:00 기상 → 합짐 2건 추가 | 이월분 + 신규분이 섞임 | 이월 콜의 적재 용량이 신규 필터에 반영돼야 함 |
| **E** | **공치는 날** 콜 못 잡고 대기만 하다 자정 통과 | 활성 콜 0건 | 롤오버가 조용히 지나가야 함. 회랑 없이 첫짐 필터 유지 |

### 7.2 설계 원칙 3

- [ ] **㉠ 화면은 날짜로 자르지 않는다** — 노출 기준은 **상태**(`!isTerminal`)다.
      시나리오 C·D의 답이 여기 있다. 어제 콜이 오늘 아침에 보이는 이유는
      "어제 것이라서"가 아니라 **"아직 안 끝나서"** 다.
      → 롤오버는 실적 집계만 가른다. 화면은 건드리지 않는다
- [ ] **㉡ 정산이 기사님의 버튼 습관에 의존하면 안 된다** 🔴
      완료 버튼을 눌러야 매출이 잡히는 구조면, 바쁜 날 안 누르는 순간 그날 실적이 사라진다.
      **시스템이 100% 자동으로 아는 값만 정산 기준으로 쓴다**
- [ ] **㉢ 마감된 영업일은 다시 안 바뀐다** — 정산은 스냅샷으로 고정한다

### 7.3 🔄 매출 귀속 기준 변경 — 완료 시각 ❌ → 확정 시각 ✅

v1은 "완료 시각 기준"을 원칙으로 삼았다. **원칙 ㉡에 어긋나므로 뒤집는다.**

| | 확정(선빵) 시각 = `capturedAt` | 완료 시각 = `completedAt` |
|---|---|---|
| 기록 방식 | **시스템 자동** (데스밸리 판정 시점) | 기사님이 버튼을 눌러야 함 |
| 안 눌렀을 때 | 영향 없음 | **그 콜 매출이 영원히 0** |
| 운임·거리 확정 | 이 시점에 이미 확정됨 | 동일 |
| 실제 배송 여부 | 배차망이 이미 확정 처리함 | 우리 앱의 내부 상태일 뿐 |

> **완료 버튼의 진짜 목적은 정산이 아니라 적재 공간 관리다.**
> 안 누르면 서버가 계속 "적재 중"으로 믿어 합짐 필터가 좁아진다(이슈 W).
> 두 목적을 한 버튼에 묶어두면, 정산을 위해 누르라고 잔소리하는 시스템이 된다.

- [ ] 매출·건수·주행거리 귀속 = **확정 시각(`capturedAt`)의 영업일**
- [ ] 취소·방출 = **그 사건이 일어난 시각**의 영업일에 건수만 집계 (매출 0)
- [ ] `completedAt`은 정산에 쓰지 않는다. **"미완료 N건"은 잔소리가 아니라
      적재 공간이 실제와 어긋나 있다는 경고**로 표시 (시나리오 D에서 중요)
- [ ] 시나리오 B·C 확인: 확정 시각 하나로 귀속되므로 **한 콜이 두 영업일에 걸치지 않는다** ✅
- ⚠️ **2026-08-10 조건부 철회 예고** — 기사님이 *"모든 콜은 배송 완료 시 이벤트를 받게 될 것"*
  이라 하셨다. 하차 보고는 버튼 습관이 아니라 **배차망이 요구하는 필수 업무**이므로
  원칙 ㉡의 전제가 달라진다. **Phase 8.2(이벤트 단일화) 완료 후 완료 시각 기준으로 전환**한다.
  그 전까지는 이 항목(확정 시각)을 유지 — 자세한 근거는 8.8

### 7.4 영업일 경계 = 04:00 KST (설정 가능)

- [ ] 경계를 **기사님이 운전대를 잡고 있지 않을 시간**에 둔다
  - 시나리오 B(23:00→02:00): 자정 경계면 **상차와 하차가 다른 영업일**. 04:00이면 한 덩어리 ✅
  - 시나리오 C(20:00 상차 → 익일 09:00 하차): 어느 경계든 쪼개진다.
    → 7.3의 확정 시각 귀속으로 해결된다 (전날 영업일 1건) ✅
  - 시나리오 D(07:00 기상): 04:00 이후라 **정상적으로 새 영업일** ✅
- [ ] `user_settings.businessDayStartHour` (기본 `4`). 기사님 패턴이 새벽 3시 출발이면 조정
- [ ] ⚠️ CLAUDE.md는 *"기사님 운행 시간(주간)"* 이라 적고 있다. 주간 위주라면 시나리오 A가
      대다수이고 경계값은 거의 무해하다. **04:00은 B·C를 대비한 안전 마진**이다

### 7.5 시각 표준 통일 (선행 필수) 🔴 — v1 조사 유지

시각 포맷이 **네 종류**이고 서로 비교조차 안 된다. 이건 테스트 데이터와 무관한 **코드의 사실**이다.

| 컬럼 | 생성처 | 실제 값 | 문제 |
|---|---|---|---|
| `capturedAt`·`timestamp` | 앱 `SimpleDateFormat` | `2026-08-09T17:32:09Z` | KST 벽시계 + **가짜 Z** (`'Z'`는 리터럴) |
| 〃 (서버 폴백) | `new Date().toISOString()` | `...T08:32:09.123Z` | 진짜 UTC — 9시간 차이 |
| `completedAt` | `datetime('now','localtime')` | `2026-08-09 17:32:09` | **`T`도 `Z`도 없음**, 서버 TZ 의존 |
| `settledAt` | (없음) | `null` | 미사용 |

- `'2026-08-09 17:32:09' < '2026-08-09T17:32:09Z'` — **공백이 `T`보다 작아 정렬이 뒤집힌다**
- 앱: `HijackService.kt:52` · `InsungParser.kt:177` · `Hwamul24Parser.kt:189` 3곳 동일
- 서버 TZ 미설정 → 로컬(KST)은 **어제 15:00 이후 콜이 오늘로 딸려오고**, 실서버(UTC 추정)는
  두 오류가 상쇄돼 우연히 맞는다. **로컬과 실서버가 다르게 동작하는 가장 위험한 상태**
- `statService`는 `toISOString().slice(0,10)`(UTC 날짜)라 **양쪽 다 09:00 KST에 매출이 리셋**된다

- [ ] `@onedal/shared`에 시각 유틸 신설 — **경계 계산은 여기 한 곳에서만** (EE의 교훈)
      `nowKst()` / `businessDate(iso, startHour)` / `businessDayRange(date, startHour)` /
      `parseAnyTimestamp(raw)` ← 4종 포맷을 모두 받아 정규화하는 어댑터
- [ ] 앱 3곳 포맷 수정: `"yyyy-MM-dd'T'HH:mm:ssXXX"` + `TimeZone.getTimeZone("Asia/Seoul")`
      → `2026-08-09T17:32:09+09:00`. 앱 버전 올리고 `:app:compileDebugKotlin` 필수
- [ ] 서버 기동 시 `process.env.TZ = 'Asia/Seoul'` 고정
- [ ] `completedAt`을 `datetime('now','localtime')` → 동일 규격으로 변경
- [ ] 기존 데이터 1회 백필 — **부팅 경로 아님, 별도 스크립트** (CLAUDE.md 금지사항 준수)
      실서버 데이터가 어떤 포맷인지 먼저 조회한 뒤 실행. 테스트 DB로 리허설 필수

### 7.6 롤오버가 무엇을 지우고 무엇을 남기나

> ⚠️ **진행 중인 콜은 절대 지우지 않는다.** 시나리오 C·D가 그대로 깨진다.
> 자정에 배달 중인 짐을 메모리에서 날리면 결재도 완료 처리도 못 하게 된다.

| 대상 | 처리 | 근거 / 관련 시나리오 |
|---|---|---|
| 종료된 콜 (메모리) | 🗑️ 비움 | DB에 남으므로 유실 아님 |
| **진행 중인 콜** | ✅ **이월** | C·D — 아침에 화면에 있어야 함 |
| `activeFilter` | ♻️ `baseFilter` 복사본 재생성 | 어제 회랑·차종 제약 상속 방지 |
| `dispatchPhase`·`isSharedMode`·`allowedVehicleTypes` | ♻️ **이월분에서 재파생** | D — 이월 콜의 적재 용량이 반영돼야 함 |
| `destinationKeywords` | ♻️ `rebuildDestinationKeywords()` | 이미 단일 생성처 (EE) |
| 기기 통계 `stats.grabbed/canceled` | 🗑️ 0으로 | `devices.ts:141` — 리셋이 없어 계속 누적 중 |
| `pendingDecisions`·`activeTimers` | 🗑️ 정리 | 데스밸리 타이머 누수 방지 |
| DB `orders` | ✅ **손대지 않음** | 운행일지·매출 원천 |

- [ ] `UserSession.isRestored: boolean` → **`businessDate: string | null`** 로 교체
      지금은 `true`가 되면 프로세스가 사는 동안 재복구를 안 해서,
      **관제탑을 켜둔 채 경계를 넘기면 어제 상태가 그대로 남는다**

### 7.7 트리거 3종 — 모두 같은 `rolloverBusinessDay(userId, io)` 를 부른다

- [ ] **㉠ Lazy** — 부트스트랩·`/api/scrap` 진입 시 `session.businessDate` 비교 ← **주 경로**
      스케줄러가 죽어도 서버가 재시작해도 동작한다
- [ ] **㉡ 스케줄러** — `businessDayStartHour` +1분 ← 관제탑을 켜둔 채 넘길 때 (시나리오 C)
- [ ] **㉢ 수동** — 관제탑 "영업 종료" 버튼 ← 일찍 마치고 정산하고 싶을 때
- [ ] 갈래가 셋이면 셋이 어긋난다 — **EE에서 배운 것**. 진입점만 셋, 본체는 하나

### 7.8 관측 가능성 — 시스템이 자기 영업일을 말하게 한다

> 오늘 반복해서 시간을 잡아먹은 문제는 로직 버그가 아니라
> **"시스템이 자기 상태를 잘못 보고하는 것"** 이었다 (V·U·X·Z-1).
> 영업일은 눈에 안 보이는 상태라 같은 함정에 빠지기 쉽다.

- [ ] 관제탑 헤더에 **`영업일 08/09 · 마감까지 3시간 12분`** 표시
- [ ] `/api/health/detail`에 `businessDate` · `businessDayStartHour` · `serverTz` 노출
- [ ] 롤오버 실행 시 로그 1줄: `📅 [영업일 전환] 08/09 → 08/10 | 이월 2건 · 정리 7건`

### 7.9 일 정산 화면 (신규)

- [ ] 영업일 마감 시 **스냅샷**을 `business_day_summary` 에 기록 (원칙 ㉢)
- [ ] 표시: 확정 건수 / 매출 / 주행거리 / 원단가(원/km) / 합짐 건수 /
      취소·방출 건수 / **미완료 N건(적재 공간 경고)** / 미수금 누계
- [ ] 매출(영업일 축)과 입금(`settledAt` 축)은 **분리해서 둘 다** 표시.
      배차망 정산은 주·월 단위라 입금 기준으로는 하루 실적을 못 본다

### 7.10 검증 — 실 데이터가 없으므로 시뮬레이션으로 한다 🔴

- [ ] **유닛**: `businessDate()` 경계값 — `03:59` / `04:00` / `23:59` / `08:59`(UTC 함정)
- [ ] **유닛**: 4종 포맷을 `parseAnyTimestamp()`가 모두 같은 순간으로 해석하는가
- [ ] **시나리오 테스트 A~E 5종을 자동화** — 각 시나리오의 콜을 DB에 심고
      영업일을 강제 전환시켜 기대 결과를 검증
- [ ] **개발 전용 강제 전환 API** (`NODE_ENV !== 'production'` 가드)
      `POST /api/dev/rollover` — 04:00까지 기다리지 않고 즉시 검증
- [ ] **실기기**: 강제 전환 후 이월된 콜의 결재·완료가 정상 동작하는가

### 7.11 착수 순서 (의존성)

```
7.5 시각 표준 통일 ──┬─▶ 7.4 영업일 정의 ──▶ 7.6 롤오버 ──▶ 7.7 트리거 ──▶ 7.9 정산 화면
   (앱 수정 포함)     │                          │
                     └─▶ 7.3 귀속 기준 변경 ─────┘
                                                 └─▶ 7.8 관측 · 7.10 검증 (병행)
```

- [ ] **7.5 없이 그 위를 만들면 잘못된 경계로 리셋한다.** 반드시 먼저
- [ ] 7.5는 앱 수정을 포함 → APK 재배포 필요 → 기사님 운행 시간 피해서
- [ ] 7.9는 나머지가 안정된 뒤 마지막에

### 7.12 착수 전 확인 필요 ❓

- [ ] **EC2의 실제 TZ** — AWS 콘솔 → EC2 → [연결] → EC2 Instance Connect(브라우저, 키 불필요)
      → `date; timedatectl | head -3`. 7.5 백필 범위가 여기서 결정된다
- [ ] **실서버 `orders` 테이블의 시각 포맷 분포** — 백필 스크립트를 짜기 전에 필요
- [ ] **`04:00`이 기사님 실제 패턴과 맞는가** — 새벽 3~5시에 운전대를 잡는 날이 잦은지
- [x] ~~완료 버튼을 실제로 누르시는지~~ → **Phase 8로 해소.** 하차 보고가 배차망 필수 업무이므로
      이벤트는 반드시 발생한다. 문제는 '누르는가'가 아니라 **'그 이벤트를 우리가 받는가'** 였다



---

## Phase 8 — 콜 관리 (배차 이후의 운행 실행) 🚚  🔴 계획 (미착수)

> 2026-08-10 기사님: *"지금까지는 콜 잡는 것에 포커스되어 있지만 앞으로 더 구현해야 하는 것은
> 콜 관리 부분이다. 잡은 콜로 상차지·하차지 전화해서 짐의 양과 종류, 도착 시간 조율을 해야 하고,
> 상차하면 배달앱에 상차 보고, 하차하면 하차 보고를 해야 한다.
> 그러므로 모든 콜은 배송이 완료되면 — 화면 분석해서 자동으로 하든, 내가 직접 누르든,
> 앱으로부터 받든 — 이벤트를 받게 될 것이다."*

### 8.0 현재 시스템은 "잡기"에서 끝난다

```
[구현됨]  콜 등장 → 선빵 → 데스밸리 판정 → 확정(KEEP)
[비어있음]         ↓
          상차지 전화(짐 양·종류·시간) → 상차 → 배차앱 상차 보고
          → 하차지 전화(도착 시간) → 하차 → 배차앱 하차 보고
[구현됨]                                              ↓
          관제탑 "완료" 버튼 하나
```

확정과 완료 사이의 **실제 업무 6단계가 통째로 비어 있다.** 그래서 지금의 완료 버튼은
실제 업무와 아무 연결이 없는 "기사님이 기억해서 눌러줘야 하는 것"이 되어 있다.

### 8.1 이미 있는 뼈대 (조사 결과 — 상당수 준비되어 있다)

| 자산 | 상태 | 비고 |
|---|---|---|
| `ORDER_PICKED_UP` · `ORDER_DELIVERED` 상태값 | ✅ 정의됨 · ❌ **사용처 0곳** | `shared/index.ts:22-23` |
| `LocationDetailInfo` (담당자·전화1·전화2·예약시간·메모) | ✅ DTO 정의됨 | `shared/index.ts:97` |
| `places.phone1` | ✅ **실제로 긁혀서 저장 중 (21건)** | 화면에 노출만 안 됨 |
| `places.contactName` · `rating` · `visitCount` · `blacklistMemo` | ✅ 컬럼 · ❌ 미사용 | 단골/블랙리스트 기반 |
| `orderStops.requestedTime` · `phoneSnapshot` · `memo` | ✅ 컬럼 · ❌ **0건** | 파싱/저장 미연결 |
| `settlementStatus` · `unpaidAmount` · `settledAt` | ✅ 컬럼 · ❌ 미사용 | 정산 축 |

> **새로 만들 것보다 연결할 것이 많다.** 스키마가 이 도메인을 이미 예상하고 설계돼 있었는데
> 화면과 로직이 따라가지 않았다. Phase 8은 대부분 "뼈대에 살 붙이기"다.

### 8.2 🔴 완료 이벤트 3경로를 하나로 — 기사님이 말한 핵심

*"화면 분석해서 자동으로 하든, 내가 직접 누르든, 앱으로부터 받든"* — 진입점이 셋이다.
**EE에서 배운 것: 갈래가 셋이면 셋이 어긋난다. 진입점만 셋, 본체는 하나.**

- [ ] `reportMilestone(orderId, milestone, source, occurredAt)` 단일 함수
  - `milestone`: `PICKED_UP` | `DELIVERED`
  - `source`: `AUTO_SCRAPE`(앱 화면 감지) | `APP_BUTTON`(앱 수동) | `MANUAL_WEB`(관제탑)
  - `occurredAt`: **이벤트가 실제 일어난 시각**. 스크랩 지연·통신 끊김 대비 (전송 시각과 분리)
- [ ] **멱등성 필수** — 같은 마일스톤이 자동 감지 + 수동 클릭으로 두 번 들어와도 한 번만 반영.
      `order_milestones(orderId, milestone)` UNIQUE
- [ ] `source`를 기록해 둔다 — 자동 감지 정확도를 나중에 측정할 유일한 근거
- [ ] 역행 방지: `DELIVERED` 이후 `PICKED_UP`이 늦게 도착해도 상태를 되돌리지 않는다

### 8.3 상태 전이를 실제로 흐르게 한다

```
ORDER_CONFIRMED ──상차 보고──▶ ORDER_PICKED_UP ──하차 보고──▶ ORDER_DELIVERED ──정산──▶ ORDER_COMPLETED
```

- [ ] **적재 판정을 상태에서 파생시킨다** — 새 술어 `isOnBoard(status)` = `CONFIRMED | PICKED_UP`
  - 🔴 **지금 없어서 생기는 문제**: 하차해도 서버는 계속 "만재"로 믿는다.
    합짐 필터가 좁은 채로 남아 **다음 짐을 못 잡는다**
  - `DELIVERED` 되는 순간 잔여 적재 용량이 회복되고 `allowedVehicleTypes`가 다시 넓어져야 한다
- [ ] `isTerminal`에 `ORDER_DELIVERED` 추가 (화면 "진행 중"에서 빠짐).
      정산은 DB 축이라 화면과 무관하게 진행된다
- [ ] `dispatchPhase` 연동: 모든 콜이 `PICKED_UP` → `DELIVERING`, 마지막 `DELIVERED` → `STANDBY`
- [ ] ⚠️ 상태값 추가가 아니라 **이미 정의된 값을 쓰는 것**이므로 DTO 변경 없음

### 8.4 🔴 통화 결과 = "신고값", 현장 = "실측값" — 둘을 나눠 기록한다

> 기사님: *"상하차지 도착해서 확인 가능(통화 내용과 비교 가능해야 함). 거짓된 통화로
> 확인되면 퀵사무실과 통화하여 이 콜의 수행 여부를 결정할 수 있어야 함.
> 도착해서 상하차 작업이 완료되어야 확정적으로 남은 공간이 픽스됨."*

한 정거장(stop)마다 **같은 항목을 두 번** 기록한다. 이 둘의 **차이가 곧 의사결정 근거**다.

| | 신고값 (declared) | 실측값 (actual) |
|---|---|---|
| 언제 | 상차 전 통화 | 현장 도착 후 |
| 신뢰도 | 화주 말 — 틀릴 수 있음 | 눈으로 확인 |
| 쓰임 | 합짐 판단 **예측** | 잔여 공간 **확정** |

- [ ] **차이가 크면 경고** — 신고 "박스 1개"인데 실제 "파렛트 3개"면 관제탑에 즉시 띄운다
- [ ] **`퀵사무실 통화` 액션** — 경고에서 바로 사무실 전화 + 결과 기록
      (`dispatcherPhone` 컬럼이 이미 있다)
- [ ] **수행 여부 결정** — 사무실 통화 후 `계속 수행` / `방출(ORDER_RELEASED)` 선택.
      방출 사유에 "신고 불일치" 기록 → 나중에 그 화주/사무실 신뢰도 데이터가 된다
- [ ] `places.rating` · `blacklistMemo` 에 누적 — 다음에 같은 곳 갈 때 미리 뜬다

#### 적재 용량의 3단계 신뢰도 🔴

지금은 **차종 하나로 추정**한다(`getRemainingCapacityTypes`). 실제로는 시점마다 확신도가 다르다.

| 시점 | 근거 | 상태 | 필터 반영 |
|---|---|---|---|
| 확정(KEEP) 직후 | 차종만 (`1t` → 30점) | 🔵 **추정** | 보수적(넓게 잡고 만재 가정) |
| 통화 후 | 신고된 짐 양 | 🟡 **예측** | 신고값 기준 재계산 |
| **상차 완료 후** | 실측 짐 양 | 🟢 **확정** | **여기서 픽스** |

- [ ] `capacityConfidence: 'ESTIMATED' | 'DECLARED' | 'CONFIRMED'` 를 세션에 둔다
- [ ] 관제탑에 신뢰도를 **표시**한다 — "잔여 15점(추정)" vs "잔여 15점(확정)".
      추정 상태에서 잡은 합짐은 현장에서 안 들어갈 수 있다는 걸 기사님이 알아야 한다
- [ ] 하차 완료 시 그 짐의 점수를 **되돌려준다** (8.3 `isOnBoard`)

#### 입력 UI — 통화 중 한 손으로 3초

> 기사님: *"어떤 UI로 만들지 고민이 필요"*

통화하면서 입력한다. **키보드를 띄우면 실패**한다. 큰 버튼 탭만으로 끝나야 한다.

- [ ] **크기·무게는 숫자가 아니라 "칸"으로** — 우리 시스템은 이미 점수제(1t=30점)를 쓴다.
      정확한 kg가 아니라 **적재 칸을 몇 개 먹는가**만 알면 된다
      ```
      짐 크기   [ 소 ][ 중 ][ 대 ][ 초과 ]      ← 1탭 (점수로 환산)
      개수      [ 1 ][ 2 ][ 3 ][ 5 ][ 10+ ]     ← 1탭
      상하차    [ 지게차 ][ 수작업 ][ 호이스트 ] ← 1탭  (소요 시간에 반영)
      ```
- [ ] 종류는 **최근 쓴 값 + 자주 쓰는 값**을 칩으로 (`itemDescription`에 이미
      "마대 1개" "박스 1개" "샘플 박스" 같은 값이 쌓이고 있다). 자유 입력은 선택
- [ ] 🆕 **적요에서 미리 채운다** — 실제 적요 예시가
      `"1시상차 6박스 카트가지고 고객님앞 갖다주세요"` 였다. 여기 이미
      **시각(1시) · 개수(6박스) · 상하차 방법(카트)** 이 다 들어 있다.
      3탭 하기 전에 파싱해서 회색으로 미리 채워두면 기사님은 **틀린 것만 고치면 된다**
- [ ] 🆕 **전화 버튼은 이미 데이터가 준비돼 있다** — `출발지 상세` 화면에
      `고객 / 부서 / 담당 / 전화1 / 전화2 / 위치`가 전부 있고 `LocationDetailInfo`가
      1:1로 매핑돼 있다. `places.phone1` 21건 저장 중. **노출만 하면 된다**
- [ ] **음성 메모 1버튼** — 통화 직후 10초 녹음. 타이핑 못 할 상황의 안전망
- [ ] 현장 확인 화면은 **같은 UI를 그대로** 띄우고 신고값을 회색으로 미리 채워둔다.
      다르면 그 칸만 다시 탭 → 차이가 자동 계산됨

### 8.5 착불(COD) 현금 수령 기록

> 기사님: *"인수증은 내가 물리적으로 전달하고 사무실에서 입금해 줄 것이다. 그건 받을 수 있는
> 이벤트가 없다. 다만 착불이라면 직접 현금을 수령하고 입력할 수 있어야 한다."*

- [ ] **정산 자동화는 하지 않는다.** 입금 이벤트를 받을 방법이 없으므로 시도하지 않는다.
      Phase 7.7의 "입금 기준 매출은 불가"가 여기서 확정된다
- [x] ~~인성앱 상세에 결제방법이 뜨는가~~ → **뜬다. 파서가 엉뚱한 곳을 보고 있었다** 🔴
  - 화면: `요금 : 40,000(신용)` — 결제방법이 **요금 값의 괄호 안**에 있다
  - 파서: `extractField(lines, "결제방법") || "지불" || "결제"` (`parser.ts:183`)
    → **존재하지 않는 필드명을 찾고 있어** 16건 전부 `null`
  - [ ] 수정: `요금\s*:\s*([\d,]+)\s*\(([^)]+)\)` 로 **금액과 결제방법을 함께** 추출
- [ ] 착불이면 하차 화면에 **`현금 수령` 입력**을 띄운다 (금액 + 수령 여부)
- [ ] 미수령 상태로 하차하면 경고 — 받아야 할 돈을 놓치는 건 되돌릴 수 없다
- [ ] 일 정산(7.9)에 **`오늘 수령한 현금`** 을 별도 줄로. 통장에 안 들어오는 돈이라 따로 봐야 한다

### 8.6 상차/하차 보고 자동 감지 (앱) — ✅ 화면 확보됨

> 기사님: *"우리 프로젝트에 `ex_images`의 상세페이지를 보면 값이 있고 추출하고 있는 것으로 안다."*
> → 확인 결과 **맞다.** `ex_images/인성/상세-확정(다른사람 못잡음, 취소+1).png` 에
> 상차·하차 보고 버튼이 그대로 찍혀 있다.

**확정 상세 화면의 실제 구성** (스크린샷 판독)

```
상태 : 배송          물품 :              [취소]
차량 : 다마스        탁송료 : 0
                     수수료 : 23%
요금 : 40,000(신용)                    ← 결제방법이 요금 괄호 안에 있다
구분 : 편도          형태 : 보통
[적요상세]   "1시상차 6박스 카트가지고 고객님앞 갖다주세요"
[인수증 전송]  현위치→상차지(직선)23.5KM / 상차지→하차지(직선)35.9KM
[의뢰지] [픽업]  오티디코퍼레이션/아크앤북동탄호수점
[출발지] [서명]  오티디코퍼레이션/... / 1시/           ← 🔴 상차 보고
[도착지] [서명]  서울강남구 / 역삼동 / 이희억            ← 🔴 하차 보고
[닫기] [카드 승인] [탁송]
```

- [ ] **상차 보고 = 출발지 `서명` 버튼 / 하차 보고 = 도착지 `서명` 버튼**.
      `인수증 전송` 버튼도 같은 화면에 있다 (물리 인수증과 별개로 앱 전송 경로가 존재)
- [ ] `상태 : 배송` 필드가 진행 상태를 그대로 보여준다 → **버튼 클릭을 감지할 필요 없이
      이 텍스트 변화만 읽어도 마일스톤을 알 수 있다.** 자동 감지 1단계가 훨씬 쉬워졌다
- [ ] 그래도 **관제웹 수동 클릭(0단계)을 먼저** 만든다 — 기사님이 지금 바로 쓸 수 있어야 하고,
      8.2가 진입점을 추상화하므로 나중에 `AUTO_SCRAPE`를 붙일 때 본체는 안 건드린다

- [ ] **0단계(지금) — 관제웹 수동**: 콜 카드에 `상차 완료` / `하차 완료` 버튼
- [ ] **1단계 — 감지만**: 기사님이 배차앱에서 보고를 누르면 화면 변화를 감지해 서버에 알림.
      우리가 누르지 않는다
- [ ] **2단계 — 알림**: 상차지 도착(GPS)했는데 일정 시간 보고가 없으면 관제탑에 리마인드
- [ ] **3단계 — 자동 터치**: 신뢰도가 검증된 뒤에만. `AUTO_SCRAPE` 정확도 로그가 근거
- [ ] `SCREEN_STATE_MACHINE.md` 확장 — 상차/하차 보고 화면 정의 추가
- [ ] ⚠️ 화물24시는 Phase 5(파서 복구)가 먼저다. 인성콜부터
- [ ] 🔜 **선행 조건: 인성앱 상차/하차 보고 화면 스크린샷 확보**

### 8.7 시간창(Time Window) 기반 경로 재최적화

- [ ] 현재 `optimizeWaypoints`는 **거리 기준 nearest-neighbor**다. 약속 시간 개념이 없다
- [ ] 약속 시간이 들어오면 순서가 달라져야 한다 — 가까워도 늦게 열리는 곳은 나중에
- [ ] **최소 구현부터**: 약속 시간 순 정렬 + **지각 위험 경고**(현재 ETA vs 약속 시간)
      본격 VRPTW는 그 다음. 경고만 있어도 기사님이 판단할 수 있다
#### 🔴 `requestedTime` 0건의 원인을 찾았다 (Q4 답)

기사님: *"리스트 화면에 급송/낼x시 등의 접두사가 붙는다."* — 별도 필드가 아니라 **텍스트 접두사**였다.
추적해 보니 **파이프가 마지막 한 칸에서 끊겨 있다.**

| 단계 | 상태 |
|---|---|
| 앱 `LocationTextAnalyzer`가 지역명 앞 접두사 추출 | ✅ 동작 (`"낼09시/"` → `"낼09시"`) |
| `InsungParser:157` · `Hwamul24Parser:141` 가 `scheduleText`에 담음 | ✅ |
| 앱 DTO `SharedModels.kt:62` → 서버 전송 | ✅ |
| `shared/index.ts:119` · `db.ts:189` 컬럼 | ✅ |
| **`OrderRepository.upsertOrder`의 INSERT 컬럼 목록** | ❌ **`scheduleText`가 빠져 있음** |
| 결과 | DB 16건 중 **저장 0건** |

- [ ] **㉠ `upsertOrder` INSERT에 `scheduleText` 추가** — 한 줄. 이것부터
- [ ] **㉡ `scheduleText` → 구조화된 시각 파서**
  > 기사님: *"'낼'이란 문자로 시작한다면 파싱이 필요하다. **주선사에서 임의로 쓰는 것이라
  > 부정확할 수 있고 자료 수집이 필요하다.**"*
  - ⚠️ **표기가 표준이 아니다.** 주선사마다 다르게 쓰므로 정규식을 미리 다 맞출 수 없다
  - [ ] **못 읽은 값을 버리지 말고 원문 그대로 남긴다** — `scheduleText`(원문) 와
        `requestedTime`(해석 결과)을 **둘 다** 저장. 해석 실패는 `null` + 원문 보존
  - [ ] **미해석 값 목록을 관제탑에 노출** — 며칠 모으면 실제 표기 분포가 보인다.
        그때 규칙을 추가한다 (추측으로 정규식을 늘리지 않는다)
  - [ ] 확실한 것부터: `"급송"` → 긴급 플래그(`isExpress`, 이미 있음),
        `"낼"` + 시각 → 다음 영업일, `"N일)HH시"` → 해당 일자
  - ⚠️ Phase 7.5의 시각 표준 위에서 해야 한다 ("낼"이 며칠인지는 영업일 기준으로 정해진다)
  - ⚠️ **잘못 해석하면 지각한다.** 확신이 없으면 시각을 만들지 말고 원문만 보여준다
- [ ] **㉢ `orderStops.requestedTime`에 저장** → 시간창 최적화의 입력이 된다
- [ ] `PinnedRouteCard.tsx:304`는 `scheduleText`를 **디버그 raw 텍스트로만** 찍고 있다 → 정식 표시로

### 8.8 🔄 Phase 7 결정을 되돌린다 — 매출 귀속을 완료 기준으로

Phase 7.3은 *"정산이 기사님의 버튼 습관에 의존하면 안 된다"* 는 이유로 **확정 시각** 기준을 택했다.
**기사님 말씀으로 그 전제가 무너졌다** — 하차 보고는 습관이 아니라 **배차망이 요구하는 필수 업무**이고,
Phase 8.2가 그 이벤트를 자동으로 받는다.

- [ ] 8.2 완료 후 → 매출 귀속을 **`DELIVERED` 시각의 영업일**로 전환
      (마감된 영업일이 소급 변경되지 않는다는 원칙 ㉢의 이점을 되찾는다)
- [ ] 8.2 이전까지는 **확정 시각 기준 유지** — 지금 완료 기준으로 바꾸면 매출이 비어 보인다
- [ ] 전환 시점을 코드에 남긴다: `REVENUE_BASIS = 'CAPTURED' | 'DELIVERED'` 설정값으로 두고
      데이터가 쌓인 뒤 전환. **두 기준의 차이를 실측한 뒤 결정**한다
- [ ] Phase 7.9 정산 화면의 `미완료 N건` 경고는 8.3 이후 **"적재 공간이 실제와 어긋남"** 경고로 승격

### 8.10 착수 순서

```
8.2 이벤트 단일화 ──▶ 8.3 상태 전이 ──┬─▶ 8.7 매출 귀속 전환 (Phase 7 의존)
       │                              └─▶ 8.5 자동 감지 (1단계부터)
       └─▶ 8.4 Call Sheet ──▶ 8.6 시간창 경로
```

- [ ] **8.2 + 8.3을 한 덩어리로 먼저.** 이것만으로 "하차했는데 만재로 남는" 문제가 풀린다
- [ ] 8.4는 관제탑 UI 작업이 크다. 전화 버튼(노출만)부터 잘라서 먼저
- [ ] 8.5 3단계(자동 터치)는 **기사님 승인 없이 진행하지 않는다**

### 8.11 확인 필요 ❓ (2026-08-10 기사님 답변 반영)

- [x] ~~인성앱 상차/하차 보고 화면~~ → **미확보. 관제웹 수동 클릭 먼저** (8.6-0단계)
- [x] ~~`requestedTime`이 왜 0건인지~~ → **`upsertOrder` INSERT에 `scheduleText` 누락** (8.7)
- [x] ~~짐 양 단위~~ → **점수제 "칸" 개념 + 3탭 UI** (8.4). 우리가 이미 쓰는 적재 점수와 맞물린다
- [x] ~~정산 흐름~~ → **입금 이벤트 없음. 자동화하지 않는다.** 착불 현금 수령만 기록 (8.5)
- [ ] 🆕 **인성앱 상세 화면에 "결제방법"이 실제로 표시되는가** — `paymentType` 파서는 있는데
      실측 16건 전부 `null`이다. 착불 여부를 모르면 8.5가 성립하지 않는다
- [x] ~~`scheduleText` 실제 값 샘플~~ → **기사님 확인: 주선사가 임의로 쓰는 비표준 표기.**
      추측으로 정규식을 짜지 말고 **원문 보존 + 미해석 목록 수집** 후 규칙 추가 (8.7-㉡)
- [x] ~~크기를 몇 점으로 환산할지~~ → **기사님 확인: 1t(30점) 기준 소=2 / 중=5 / 대=10 / 초과=30**
      `shared/vehicles.ts`의 차종 점수와 같은 축에 둔다 (오토바이 0 / 다마스 10 / 라보 15 / 1t 30)

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
| 2026-08-08 | 1.5 | 풀오토 자동 해제 수정(모드 보존/복원 + 데드맨 150초 + scrap 재시도) & P·Q 수정. tsc·jest·curl 통과 | ✅ 코드 |
| 2026-08-09 | — | **main이 컴파일 불가 상태였음 발견** — `3837f07`이 InsungParser의 ScreenTextNode import를 누락. 1줄 수정 후 `assembleDebug` 성공 | ✅ |
| 2026-08-09 | — | 앱 버전 마커 도입(`v1.1-phase1.5`, versionCode 2). 대시보드 상단 + 기동 로그에 표시 → 설치 버전 혼동 방지 | ✅ |
| 2026-08-09 | — | 실기기에 신규 APK 설치 완료(versionCode 1→2). ⚠️ 업데이트로 접근성 권한이 꺼지므로 재승인 필요 | ✅ |
| 2026-08-09 | — | 실기기 로그 분석에서 발견: 차종 축소 역설(S), 필터 로그 폭탄(T) | 📌 기록 |
| 2026-08-09 | 3 | **S 수정** — 적재 용량 점수제 도입, 함수 2개로 분리, 활성 콜 전체 합산. 단위 테스트 24개 추가(총 32개 통과) | ✅ 코드 |
| 2026-08-09 | 3 | **A1+A2 수정** — scrap 응답에서 destinationGroups 제외, 앱 로그 요약화, verbose를 BuildConfig.DEBUG 연동 | ✅ 코드 |
| 2026-08-09 | — | `tsx watch` 간헐적 미감지 발견(U). 서버 수동 재시작 필요 | 📌 기록 |
| 2026-08-09 | — | 버전 마커가 컴파일 타임 상수 인라인 때문에 옛 값을 표시(V). `AppInfo`로 런타임 조회 전환 후 해결 | ✅ |
| 2026-08-09 | — | 실기기에 v1.2-capacity+logdiet(build 3) 설치·검증 완료. 화면과 dumpsys 일치 확인 | ✅ |
| 2026-08-09 | 3 | **W 수정** — 재시작 복구 시 배차 상태를 데이터에서 파생(단계·합짐·차종·회랑) + 관제탑 배너. 테스트 7개 추가(총 39개) | ✅ 코드 |
| 2026-08-09 | — | **실기기 실전 검증**: S(적재 용량) 검산 일치 — 오토바이×3+다마스×2=20점, 남은 10점 → [오토바이·승용차·다마스], 1t 콜이 정확히 걸러짐. W(GATHERING·합짐·회랑442) 확인. A1 −47%(13,458→7,147B, 동일 조건). A2·P·V 동작 확인 | ✅ |
| 2026-08-09 | — | **X 수정** — 콜 전부 취소 시 정상 상태를 "카카오 연산 에러"로 표시하던 문구 분리 | ✅ 코드 |
| 2026-08-09 | U·R | `/api/health` 신설(부팅시각·git 커밋) + `isShared` 판정 데이터 파생 | ✅ |
| 2026-08-09 | 0.5 | 거짓 아키텍처 문서 3건 재작성 + API/소켓 명세 정정 + CLAUDE.md 갱신 | ✅ |
| 2026-08-09 | — | **프로덕션 SSH 실측** — IP가 `44.222.73.86`→`13.222.63.17`로 바뀌어 있었음(Y). EC2 `.env` 시크릿 정상, bypass 2회 사용·구글 로그인 0회 확인 | ✅ |
| 2026-08-09 | — | **자체 리뷰** — 기획 문서 대조. 내 코드 결함 3건(Z) 수정 + 대기열 시뮬레이션 제거 + 킬스위치 결정 문서화. 남은 땜빵 5건 기록 | ✅ |
| 2026-08-09 | — | **AA 수정** — 종료된 콜을 적재 중으로 세던 UI 버그(예약 7건 → 2건). GPS 상차 감지·귀가콜 플래그도 동일 원인이라 함께 수정 | ✅ |
| 2026-08-09 | 1 | **B·C-1·C-2 완료** — JWT 폴백 제거+부팅 가드, 무인증 `GET /api/scrap`(실측 327건 노출) 삭제, 전역 emit 제거. A(bypass)는 보류 | ✅ 코드 |
| 2026-08-09 | — | **BB 경로 재탐색 5건 수정** + **CC 부트스트랩 순서 통일**(`bootstrapUserSession` 신설, `isBootstrapping` 게이트 3곳, 키워드 생성처 4→1, filter-init 중복 제거). 4001 포트 스모크로 실측 검증 | ✅ |
| 2026-08-09 | — | **DD** 경로 요약줄 운임이 취소·방출 콜까지 합산하던 버그 수정(510,000원 과다 표시) + 거리 정밀도 통일 | ✅ |
| 2026-08-09 | — | **EE 중간 점검** — 임기응변 5종 정리(`routeComposer` 신설로 4벌 중복 제거 · 부트스트랩 땜빵 해체 · 인라인 require 4건 · 클라 `liveCalls` 단일화) + 리팩터링 중 발견한 회랑 미복귀 버그 수정. dispatchEngine 순 -96줄 | ✅ |
| 2026-08-10 | — | **Phase 8 기획 확정** — ex_images 스크린샷 판독으로 상차/하차 보고 버튼(출발지·도착지 `서명`) 확인, 결제방법이 `요금:40,000(신용)` 괄호 안에 있음을 발견. **FF 요금 폴백 파서가 40,000→40원으로 읽는 버그** 등록 | 📋 |
| 2026-08-10 | — | **FF 정정 + FF/GG/HH 수정** — 요금 축약형 휴리스틱이 `8000`을 800만원으로 읽던 1000배 버그, 결제방법 파싱 위치 오류, `scheduleText`·`postTime` 저장 누락. 파서 회귀 테스트 26개 추가(총 65개) | ✅ |
