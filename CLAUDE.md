# 1DAL

인성콜 / 화물24시 배차망에서 조건에 맞는 콜(꿀콜)을 자동 선점하고, 서버가 수익성을 판정해
기사님이 최종 결재하는 AI 배차 관제 시스템.

## 구성 (3-앱 MSA)

| 앱 | 역할 | 스택 |
|---|---|---|
| `onedal-app/` | 안드로이드 스캐너 — 배차앱 화면 스크래핑 + 자동 터치 | Kotlin, AccessibilityService, HttpURLConnection |
| `onedal-web/server/` | 판정 엔진 — 파싱·카카오 경로·요율 연산 | Express 5, better-sqlite3, Socket.IO (port 4000) |
| `onedal-web/client-app/` | 관제탑 — 기사님이 KEEP/CANCEL 결재 | Vite 6, React 19, Tailwind v4, Capacitor (port 3000) |
| `onedal-web/logbook/` | 운행일지 대시보드 | Vite + React |
| `onedal-web/shared/` | `@onedal/shared` 공통 DTO (앱 ↔ 서버 규격) | TypeScript |

통신: 앱 → 서버는 REST(`POST /api/scrap`), 서버 → 앱은 **응답 꼬리에 명령을 싣는 피기백**.
서버 ↔ 관제탑만 Socket.IO. (모바일 웹소켓 끊김을 피하려는 의도된 설계)

> **규칙은 두 층에 있다.** 이 문서의 [이건 버그가 아니라 규칙이다](#이건-버그가-아니라-규칙이다--고치기-전에-읽을-것) 는
> **앱 경계를 넘는 것**만 담는다. 앱 안에서만 참인 것은 각 폴더의 `CLAUDE.md` 에 있다 —
> [onedal-app](onedal-app/CLAUDE.md) · [server](onedal-web/server/CLAUDE.md) · [client-app](onedal-web/client-app/CLAUDE.md)

## 명령

| 목적 | 명령 |
|---|---|
| 로컬 기동 (web+api) | `cd onedal-web && pnpm dev` |
| 서버 타입 체크 | `cd onedal-web/server && npx tsc --noEmit` |
| 서버 테스트 | `cd onedal-web/server && npx jest` |
| 클라 타입 체크 | `cd onedal-web/client-app && npx tsc -b` |
| 앱 빌드 | `cd onedal-app && ./gradlew assembleDebug` (JDK: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`) |
| 앱 컴파일만 | `cd onedal-app && ./gradlew :app:compileDebugKotlin` |
| **서버 정체 확인** | `curl -s localhost:4000/api/health \| python3 -m json.tool` |

로컬 개발 시 DB는 `server/local.db`(실서버는 `data.db`)로 자동 분리됨.
`client-app/.env`에 `VITE_API_URL`이 있으면 Vite 프록시가 깨지므로 로컬에서는 비워둘 것.

## 커밋 전 필수

`tsc --noEmit`(server) · `tsc -b`(client) · `npx jest` · **`./gradlew :app:compileDebugKotlin`**(앱 코드를 고쳤다면)
이 전부 통과해야 커밋한다. 실패 시 커밋 금지.

**콜 흐름(상태·복구·적재·정산)을 건드렸다면** `cd onedal-web && pnpm scenario`.
실제 서버를 띄워 콜 생애를 끝까지 돌린다. 2026-08-11 에 배포하면 안 되는 결함 6건이
`tsc`·`jest`·`vite build`·`audit:socket` 을 **전부 통과한 채로** 숨어 있었고
이걸 돌려서만 나왔다 (상차한 콜이 새로고침에 사라짐 · 짐 신고 무시 · 불일치 경고 미발생 · 착불 미기록).

**소켓 이벤트를 추가·변경했다면** `cd onedal-web && pnpm audit:socket` 도 함께.
서버 emit ↔ 관제웹 on 을 대조해 한쪽만 고친 것을 잡는다.
(2026-08-10 이 검사로 `handler-error` 미수신, `settings-updated` 미발신을 찾았다)

**`shared/` 나 DB 스키마를 고쳤다면 스모크로 부팅까지 확인한다.**
`tsc`·`jest` 는 통과하는데 런타임에서만 터지는 두 부류가 있다.
  · `shared` 순환 참조 → `ReferenceError: Cannot access '…' before initialization` (부팅 불가)
  · `CREATE TABLE IF NOT EXISTS` 는 **기존 테이블에 컬럼을 추가하지 않는다** → `no such column`
    ⚠️ 빈 DB 가 아니라 **기존 DB 사본**으로 확인해야 드러난다

> 앱 컴파일이 필수인 이유: 2026-08-09에 `main`이 컴파일조차 안 되는 상태였다는 걸
> 뒤늦게 발견했다(`InsungParser`의 import 누락). 서버는 tsc로 매번 확인하는데
> 앱은 검증 수단이 없어 아무도 몰랐다.

## "무엇이 실제로 돌고 있는가" 확인 (중요)

이 프로젝트에서 반복적으로 시간을 잡아먹은 문제다. 고쳤다고 생각했는데 옛 코드가 돌고 있어
잘못된 결론을 내리는 일이 하루에 여러 번 있었다. 검증 전에 항상 확인할 것.

| 대상 | 확인 방법 | 어긋났을 때 |
|---|---|---|
| 서버 | `curl localhost:4000/api/health` → `bootedAt`, `git.commit` | `tsx watch`가 변경을 놓친 것. `Ctrl+C` 후 `pnpm dev` |
| 앱 | 대시보드 상단 `📦 v...` 또는 `adb shell dumpsys package com.onedal.app \| grep versionName` | `adb install -r` 재설치 |
| 관제웹 | `localhost:3000`으로 접속 | `localhost:4000`은 옛 `dist/` 빌드가 뜬다 |


## 도메인 용어

- **꿀콜 / 똥콜** — 수익성이 좋은 / 나쁜 콜
- **선빵, 광클** — 경쟁 기사보다 먼저 확정 버튼을 누르는 것
- **데스밸리** — 확정 후 패널티 없이 취소할 수 있는 30초. 이 사이에 서버가 수익성을 판정
- **합짐** — 기존 경로에 다른 콜을 경유지로 병합
- **회랑(Corridor)** — 주행 경로 주변 반경 안의 읍/면/동만 필터로 통과시키는 것
- **피기백(Piggyback)** — HTTP 응답 본문 꼬리에 서버 명령(KEEP/CANCEL, 새 필터)을 실어 보냄
- **dispatchPhase** — `STANDBY`(첫짐 탐색) → `GATHERING`(합짐 수집) → `DELIVERING`(운행 중)
  - ⚠️ 일부 문서의 `DRIVING`은 오기. 실제 enum 값은 **`DELIVERING`**

## 문서 신뢰도 ⚠️ 중요

2026-08-07 전수 대조 결과. **코드와 다른 문서를 근거로 작업하지 말 것.**

**✅ 코드와 일치 (신뢰 가능)**
`onedal-app/docs/EDGE_CASES.md` (방어 로직 10/10 일치 — 이 레포 최고 품질) ·
`onedal-app/docs/SHARED_PREFERENCES_SPEC.md` · `onedal-app/docs/SCREEN_STATE_MACHINE.md` ·
`onedal-app/docs/API_SPEC.md` · `onedal-web/server/docs/DISPATCH_STATE_MACHINE.md` ·
`onedal-web/server/docs/ENV_CONFIG_SPEC.md` · `onedal-web/client-app/docs/STATE_MANAGEMENT.md`

**✅ 2026-08-09 재작성 완료 (이제 신뢰 가능)**
- `onedal-web/server/docs/SERVER_ARCHITECTURE.md` (v4.0)
- `onedal-app/docs/ANDROID_ARCHITECTURE.md` (v2.0)
- `onedal-app/docs/PLUGIN_INTERFACE_SPEC.md` (v2.0)
- `onedal-web/server/docs/API_SPEC.md` (v3.1) · `onedal-web/client-app/docs/SOCKET_EVENT_MAP.md` (v2)

> 세 문서는 계획을 완료로 기술해 존재하지 않는 파일·인터페이스를 안내하고 있었다.
> 재작성본에는 각 문서 상단에 **"무엇이 사실이 아니었는지"** 를 남겨 같은 실수를 방지한다.

**🔄 진행 중인 정비 계획: [todo.md](todo.md)** — 작업 시작 전 반드시 확인

## 이건 버그가 아니라 규칙이다 ⚠️ 고치기 전에 읽을 것

**반복된 사고의 형태는 늘 같다 — 일부러 비대칭으로 둔 것을 "빠뜨린 것"으로 읽고 고쳤다.**
이 레포에서 비대칭은 대개 결정이다. **비대칭을 발견하면 고치기 전에 "왜 비대칭인가"의 답을 찾고,
못 찾으면 묻는다.**

규칙은 `server/tests/rules/dispatchRules.test.ts` 가 강제한다. 그 테스트가 깨졌다면
먼저 **"내가 규칙을 어긴 건 아닌가"** 를 의심할 것.

**① 콜의 주인은 기사님이다**
- 서버는 콜을 **자동으로 버리지 않는다.** 요율 미달이어도 사유만 표시하고 기사님이 판단
- **MANUAL 콜은 심사하지 않는다** — 기사님 의도다. 데스밸리도 LIST 이탈 정리도 없는 건 설계다
- **KEEP 된 콜은 절대 취소하지 않는다**
- 역할 분담: 앱은 *"일단 잡아와라"*, 서버는 *"수익성을 판단한다"*, 기사님이 *"최종 결재한다"*

**② 안전장치는 겹쳐 둔다, 빼지 않는다**
- 앱의 30초 데스밸리는 **최후의 안전장치다. 절대 제거하지 않는다**
- 서버는 앱이 **ACK 할 때까지 판결을 지우지 않는다** (한 번 보내고 지우면 유실 시 영구 유실)
- 판결에는 **orderId 를 반드시 싣고** 앱이 대조한다 (오더A 응답이 오더B에 적용되던 사고)
- 타이머는 **ID 를 저장해 취소 가능하게** 한다 (좀비 타이머)
- HTTP 를 **물고 기다리지 않는다** — 즉시 응답 + 피기백

**③ 상태를 저장하지 말고 데이터에서 파생시킨다**
- **파생값을 만들었으면 그 입력도 한 곳에서 만든다** (같은 사고 3회: 회랑 4벌·상태목록 3벌·시별칭)
- 어제 상태가 오늘 되살아나지 않는다 (영업일 전환)
- **기본값의 단일 출처는 DB.** 서버·관제웹은 자체 폴백을 갖지 않는다. 앱만 오프라인 안전망

**④ 데이터를 변조해서 동작을 바꾸지 않는다**
- 합짐이라고 상차반경을 `999km` 로 덮어쓰지 않는다 — **룰로 건너뛴다**
- 없는 숫자를 지어내지 않는다 (`0` 이 아니라 `null`)
- **빈 필터는 "제한 없음"이 아니라 "고장"이다**

**⑤ 시퀀스를 압축하지 않는다**
- 콜 처리는 **6단계**다. 한 번에 두 단계를 건너뛰지 않는다
  (기사님: *"두 개를 한 번에 가는 건 기준이 흔들린다"*)

## 하지 말 것

- **승인 없이 배포하지 않는다.** `git push origin main`이 `onedal-web/**` 변경 시 **EC2 자동 배포를 트리거**한다 (`.github/workflows/deploy.yml`)
- 기사님 운행 시간(주간)에 서버를 배포하지 않는다
- 파일·폴더 삭제 또는 이동 전에 반드시 확인을 받는다
- 코드에 들어가지 않은 것을 문서에 "완료"로 쓰지 않는다 (**이미 네 번 발생**).
  계획은 `todo.md`에, 구현된 것만 아키텍처 문서에 쓴다
  > 네 번째: `safety_mode_architecture.md` 가 Phase 3(서버의 matchType 불신)을 현재형으로
  > 적어 뒀는데 코드에 없었다. 없는 방어를 믿은 채로 2026-08-12 유령 콜 사고가 났다

## 작업 스타일

- 한국어로 대화한다
- 되돌릴 수 없는 작업 전에는 먼저 묻는다
- 이해가 안 되면 추측하지 말고 질문한다
- 논리적 근거를 제시하고 합의된 뒤에 코드를 수정한다
