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
| 앱 빌드 | `cd onedal-app && ./gradlew assembleDebug` |

로컬 개발 시 DB는 `server/local.db`(실서버는 `data.db`)로 자동 분리됨.
`client-app/.env`에 `VITE_API_URL`이 있으면 Vite 프록시가 깨지므로 로컬에서는 비워둘 것.

## 커밋 전 필수

`tsc --noEmit`(server + client) 와 `npx jest`가 통과해야 커밋한다. 실패 시 커밋 금지.

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

**❌ 코드와 다름 (Phase 0.5에서 재작성 예정)**
- `onedal-web/server/docs/SERVER_ARCHITECTURE.md` — "ESM 전환 완료"(실제 CommonJS), `RouteManager.ts`·`routes/confirm.ts` 없음, 파이프라인 기술 오류
- `onedal-app/docs/ANDROID_ARCHITECTURE.md` — "Compose 제거 완료"(실제 사용 중), `LocationTracker`·`FusedLocationProviderClient` 없음, 하트비트 "3초"(실제 60초)
- `onedal-app/docs/PLUGIN_INTERFACE_SPEC.md` — `BaseScrapParser`/`BaseAutomationEngine` 인터페이스가 실재하지 않음 (실제는 `IScrapParser`)

**🔄 진행 중인 정비 계획: [todo.md](todo.md)** — 작업 시작 전 반드시 확인

## 하지 말 것

- **승인 없이 배포하지 않는다.** `git push origin main`이 `onedal-web/**` 변경 시 **EC2 자동 배포를 트리거**한다 (`.github/workflows/deploy.yml`)
- 기사님 운행 시간(주간)에 서버를 배포하지 않는다
- `server/src/db.ts`의 조건부 `DROP TABLE` 마이그레이션 패턴을 새로 추가하지 않는다 (부팅 경로에서 데이터가 날아감)
- 파일·폴더 삭제 또는 이동 전에 반드시 확인을 받는다
- 코드에 들어가지 않은 것을 문서에 "완료"로 쓰지 않는다 (이미 두 번 발생한 문제)

## 작업 스타일

- 한국어로 대화한다
- 되돌릴 수 없는 작업 전에는 먼저 묻는다
- 이해가 안 되면 추측하지 말고 질문한다
- 논리적 근거를 제시하고 합의된 뒤에 코드를 수정한다
