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

⚠️ 빌드를 식별하는 값에 **컴파일 타임 상수(`BuildConfig.VERSION_NAME`)를 쓰지 말 것.**
호출부에 인라인되어 재컴파일이 생략되면 옛 값이 남는다. 런타임 조회(`AppInfo`)를 쓴다.

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

## 하지 말 것

- **승인 없이 배포하지 않는다.** `git push origin main`이 `onedal-web/**` 변경 시 **EC2 자동 배포를 트리거**한다 (`.github/workflows/deploy.yml`)
- 기사님 운행 시간(주간)에 서버를 배포하지 않는다
- `server/src/db.ts`의 조건부 `DROP TABLE` 마이그레이션 패턴을 새로 추가하지 않는다 (부팅 경로에서 데이터가 날아감)
- 파일·폴더 삭제 또는 이동 전에 반드시 확인을 받는다
- 코드에 들어가지 않은 것을 문서에 "완료"로 쓰지 않는다 (이미 세 번 발생한 문제).
  계획은 `todo.md`에, 구현된 것만 아키텍처 문서에 쓴다

## 작업 스타일

- 한국어로 대화한다
- 되돌릴 수 없는 작업 전에는 먼저 묻는다
- 이해가 안 되면 추측하지 말고 질문한다
- 논리적 근거를 제시하고 합의된 뒤에 코드를 수정한다
