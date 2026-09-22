# 1DAL — 참고 문서 (표 · 규칙 · 게이트)

루트 [CLAUDE.md](CLAUDE.md) 「일하는 순서」가 **일의 종류별로 여기 어느 장을 언제 읽는지** 정한다.
이 파일은 세션마다 자동으로 읽히지 않는다 — 그래서 CLAUDE.md 의 포인터가 🔴 필수다.
검사(`portsListed` · `layoutListed`)와 `pnpm audit:docs` 가 이 파일의 표를 원천으로 읽는다.

## 구성

| 앱                          | 역할                                                           | 스택                                            |
| --------------------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| `onedal-app/app/`           | 안드로이드 스캐너 — 배차앱 화면 스크래핑 + 자동 터치           | Kotlin, AccessibilityService, HttpURLConnection |
| `onedal-app/simulator-app/` | 배차망 시뮬레이터의 안드로이드 껍데기 (`com.onedal.simulator`) | Kotlin, WebView                                 |
| `onedal-web/server/`        | 판정 엔진 — 파싱·카카오 경로·요율 연산                         | Express 5, better-sqlite3, Socket.IO            |
| `onedal-web/client-app/`    | 관제탑 — 기사님이 KEEP/CANCEL 결재                             | Vite 8, React 19, Tailwind v4, Capacitor        |
| `onedal-web/logbook/`       | 운행일지 대시보드                                              | Vite + React                                    |
| `onedal-web/shared/`        | 서버·관제웹·운행일지가 함께 쓰는 규격과 순수 계산 (의존 0)     | TypeScript                                      |
| `onedal-sim/`               | 배차망 시뮬레이터 — 앱폰이 읽을 가짜 배차망 화면               | Vite 7, React 19                                |
| `onedal-map/`               | 지도 공장 — 콜 필터 그물이 쓰는 읍면동 폴리곤을 만든다         | Node · Python 스크립트                          |

앱이 아닌 자리: `ex_images/` 실물 캡처 · `.claude/skills/` 프로젝트 스킬 · `.claude/hooks/` Claude Code 훅 — 계획 우선(`plan-first.mjs`, 등록은 `.claude/settings.json`)

통신: 앱 → 서버는 REST(`POST /api/scrap`), 서버 → 앱은 **응답 꼬리에 명령을 싣는 피기백**.
서버 ↔ 관제탑만 Socket.IO. (모바일 웹소켓 끊김을 피하려는 의도된 설계)

> **규칙은 두 층에 있다.** 이 문서의 [이건 버그가 아니라 규칙이다](#이건-버그가-아니라-규칙이다--고치기-전에-읽을-것) 는
> **앱 경계를 넘는 것**만 담는다. 앱 안에서만 참인 것은 각 폴더의 `CLAUDE.md` 에 있다 —
> [onedal-app](onedal-app/CLAUDE.md) · [server](onedal-web/server/CLAUDE.md) ·
> [client-app](onedal-web/client-app/CLAUDE.md) · [shared](onedal-web/shared/CLAUDE.md) ·
> [onedal-web](onedal-web/CLAUDE.md)(검증 스크립트) · `onedal-sim` · `onedal-map` 은 CLAUDE.md 대신 **README 가 안내**다 — 고치기 전에 읽는다

## 포트

🔴 **포트의 원천은 이 표다** (기사님 지시). 번호를 한 파일로 모을 수는 없다 —
앱 Kotlin · vite 설정 · 배포 yml · PM2 설정이 각자 적어야 돈다. 그래서
`onedal-web/server/tests/rules/portsListed.test.ts` 가 **코드에 박힌 번호를 이 표와 대조한다** —
표에 없는 번호 · 표와 다른 범위 · 서로 겹치는 자리 · 코드가 안 쓰는 번호가 빨간불이다.

**번호를 바꿀 때**: 이 표를 먼저 고치고 `cd onedal-web/server && npx jest tests/rules/portsListed` 를 돌린다 —
옛 번호가 남은 곳이 전부 나온다.

| 포트 | 누가 듣나 | 정하는 곳 | 알아둘 것 |
|---|---|---|---|
| `4000` | 서버 (api) | `onedal-web/server/src/index.ts` | `PORT` 환경변수로 바꿀 수 있다 · 배포에서는 80 → 4000 으로 넘긴다 |
| `3000` | 관제웹 (vite 개발 서버) | `onedal-web/client-app/vite.config.ts` | `/api` 를 4000 으로 넘긴다 |
| `3001` | 운행일지 (vite 개발 서버) | `onedal-web/logbook/vite.config.ts` | `pnpm dev` 가 함께 띄운다 |
| `5173` | 배차망 시뮬레이터 | `onedal-sim/vite.config.ts` | 🔴 바꾸지 않는다 — 시뮬 앱(Kotlin)이 이 번호로 붙는다 |
| `4173` | 관제웹 `vite preview` (빌드 미리보기) | vite 기본값 | 개발에서는 안 띄운다 · 관제웹이 이 주소를 «개발 주소»로 안다 |
| `4012` | `pnpm scenario` 전용 서버 | `onedal-web/scripts/scenario.mjs` | 전용 DB · 끝나면 내린다 |
| `4014` | `pnpm drive` 전용 서버 | `onedal-web/scripts/drive.mjs` | 전용 DB · 끝나면 내린다 |
| `9300-9599` | `pnpm lab` 이 띄우는 크롬 조종 | `onedal-web/scripts/lab.mjs` | 띄울 때마다 번호가 다르다 (`9300 + pid % 300`) · `shot` 과 안 겹치게 뗐다 |
| `9600-9899` | `pnpm shot` 이 띄우는 크롬 조종 | `onedal-web/scripts/shot.mjs` | 띄울 때마다 번호가 다르다 (`9600 + pid % 300`) · `lab` 과 안 겹치게 뗐다 |

## 명령

| 목적                | 명령                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 로컬 기동 (web+api) | `cd onedal-web && pnpm dev`                                                                                                        |
| 서버 타입 체크      | `cd onedal-web/server && npx tsc --noEmit`                                                                                         |
| 서버 테스트         | `cd onedal-web/server && npx jest`                                                                                                 |
| 클라 타입 체크      | `cd onedal-web/client-app && npx tsc -b`                                                                                           |
| 앱 빌드             | `cd onedal-app && ./gradlew assembleDebug` (JDK: `export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`) |
| 앱 컴파일만         | `cd onedal-app && ./gradlew :app:compileDebugKotlin`                                                                               |
| **서버 정체 확인**  | `curl -s localhost:4000/api/health \| python3 -m json.tool`                                                                        |

로컬 개발 시 DB는 `server/local.db`(실서버는 `data.db`)로 자동 분리됨.

## 커밋 전 필수

`tsc --noEmit`(server) · `tsc -b`(client) · `npx jest` · `pnpm test:web` · `pnpm audit:dead` ·
`pnpm lint:gate` · 앱을 고쳤다면 `./gradlew :app:compileDebugKotlin :app:testDebugUnitTest`
— 전부 통과해야 커밋한다.
**건드린 것에 따라 더:** 콜 흐름(서버 `services/dispatchEngine.ts` · `routes/` 의 orders·detail·scrap · `state/`) → `pnpm scenario`
(판정 색·필터 계산만 고쳤으면 `jest` 로 충분) · 소켓 이벤트 → `pnpm audit:socket` ·
`shared/`·DB 스키마 → 기존 DB 사본으로 부팅 · 문서 → `pnpm audit:docs` · 경로·도착·궤적 → `pnpm drive`
(각 검사가 무엇을 잡고 못 잡는지는 [onedal-web/CLAUDE.md](onedal-web/CLAUDE.md) 스크립트 표)

> 🔴 **`npx jest` 는 서버 검사가 아니다** — 관제웹을 지키는 규칙 검사도 거기 산다.
> «관제웹만 고쳤으니 건너뛴다»가 안 된다. 게이트는 전부 돌린다.
> `jest` 결과는 `Test Suites:` 의 `passed` 와 `total` 이 같은지까지 본다 — 컴파일이 안 되는 검사 파일은 «실패»가 아니라 «없는 것»이 된다
> ([onedal-web/CLAUDE.md](onedal-web/CLAUDE.md) «jest 는 Test Suites 줄까지 본다»)

> 🔴 **수락 뒤 픽커 화면 캡처는 담지 않는다** — 남의 집 주소·동호수·전화번호·문 앞 사진이 가려지지 않았고, git 이력에 들어가면 지워도 남는다.
> `.gitignore` 가 `ex_images/카카오픽커/실물_2026/` 을 막는다 (수락 전 상세 화면은 된다)

> 🔴 **버그는 순서를 뒤집어 고친다** (기사님 지시) — 진단 → 잡았을 검사를 먼저 만들어
> **빨간불 확인** → 수정 → 초록불. 빨간불이 안 뜨면 진단이 틀린 것이다. 같은
> **클래스**가 두 번 나오면 그 클래스를 없앤다 —
> **그 모양이 다시 못 생기게 구조를 바꾸고, 검사로 잠근다** (검사만 더하면 한 건을 고친 것이다).

## "무엇이 실제로 돌고 있는가" 확인 (중요)

고쳤다고 믿었는데 옛 코드가 돌고 있어 잘못 판단한 일이 반복됐다. **검증 전에 확인한다.**

> 🔴 **서버는 2층이다** — `pnpm dev` 가 띄우는 것은 감시자(`tsx watch`, 부모)이고 실제 서버는 그 자식이다. 감시자는 소스가 바뀌면 자식만 갈아치운다. `Ctrl+C` 는 둘을 함께 죽인다(`trap 'kill 0'`). 끄고 나서도 `bootedAt` 으로 확인한다.

| 이걸 하면 | 같이 볼 것 | 안 맞으면 | 확인하는 법 |
|---|---|---|---|
| 서버 소스 · `shared/` 를 고침 | 떠 있는 서버 | 옛 코드로 돈다 | `curl localhost:4000/api/health` 의 `bootedAt` 이 고친 시각보다 늦은가. 커밋 번호는 서버를 띄운 터미널 또는 `onedal-web/server/logs/server-날짜.log` 의 `🧾 [BUILD]` 줄. ⚠️ 감시자는 `onedal-web/server/package.json` 의 `dev` 명령에 `--include` **둘**(`src`·`shared`)로 본다 — 하나로 줄이면 다른 쪽 변경을 놓친다 |
| 서버를 껐다 켬 | 감시자(부모) | 부모가 살아 있으면 옛 코드로 서버를 되살린다 | `pnpm dev` 가 겹쳐 뜨지 않게 막고, 죽일 PID 를 알려 준다 |
| `pnpm reset:calls` | 서버가 머릿속(메모리)에 들고 있는 콜 | DB 는 비었는데 화면에 콜이 남는다 | ✅ 비운 뒤 서버를 스스로 다시 띄운다 (`ledgerResetTogether` 검사) |
| 관제웹을 `localhost:4000` 으로 엶 | 서버가 내주는 옛 빌드(`client-app/dist`) | 옛 화면을 보고 판단한다 | `localhost:3000` 으로 연다 |
| 관제웹·앱이 붙은 서버 | 내 PC 서버 ↔ 실서버(라이브) | 내 PC 를 고치며 실서버 화면을 본다 | 내 PC 서버 로그에 `🔌 [소켓 연결]` 이 찍히는가 — 화면은 멀쩡한데 로그가 조용하면 다른 서버다 |
| 앱 코드를 고침 | 폰에 깔린 앱 | 옛 앱이 돈다 | 관제웹 오른쪽 곁 패널(현황판)의 «앱 버전» 칸, 또는 `adb shell dumpsys package com.onedal.app \| grep versionName` — 다르면 `adb install -r` |
| `client-app/.env` 에 `VITE_API_URL` 을 적음 | Vite 프록시 | 내 PC 에서 프록시가 깨진다 | 내 PC 에서는 비워 둔다 |

## 짝이 있는 것 — 이걸 건드리면 저것도 본다

한쪽만 고치면 갈라지는 것의 **색인**이다 (기사님 지시).
**까닭은 여기 쓰지 않는다** — 검사 파일 머리나 그 코드의 주석에 둔다. 여기엔 어디를 볼지만 적는다.

✅ 검사가 문다 · 🟡 사람이 본다
🔴 **짝을 새로 만들면 한 줄 더하고, 짝을 없애면 그 줄을 지운다.** 🟡 는 짝이 없어져도 아무도 모르니 더 챙긴다.
🔴 **일부러 둔 두 벌은 그 코드 주석에 «일부러»와 까닭을 적는다** — 까닭이 없는 두 벌은 복사로 보고 합칠 후보로 삼는다.

| 이걸 건드리면 | 같이 볼 곳 |
|---|---|
| 포트 번호 | ✅ `portsListed` |
| `onedal-web/scripts/*.mjs` | ✅ `scriptsListed` · ✅ `scriptHeader`(머리 다섯 줄 — 누가 · 언제 · 어디서 · 무엇을 · 왜) |
| 새 폴더 | ✅ `layoutListed` |
| 소켓 이벤트 이름 | ✅ `pnpm audit:socket` |
| 앱에 내려가는 필터 키 | ✅ `appFilterKeys` |
| 배차망별 대기 시간 (안전취소 · 픽커 상세) | ✅ `waitTimes` — DB 칸 · 설정 경로 · 원달앱 응답 · 서버 타이머 · 관제웹 · 원달앱이 한 줄로 이어졌나 |
| 개별콜 모양 (현황판 → 서버 → 시뮬레이터) | ✅ `simCallQueue` — 칸 이름 · 경로 · 개발 빌드만 |
| 앱이 올리는 콜 칸 | ✅ `intelColumns` |
| 앱 콜 양식 칸 이름 | ✅ `appOrderShape` |
| 콜 상태 목록 | ✅ `orderStatus` |
| 식별자 이름 | ✅ `identifierAscii` |
| 단계 → 마일스톤 | 🟡 `onedal-web/shared/src/callSteps.ts` 한 곳 |
| 콜 색 | 🟡 `onedal-web/client-app/src/styles/callPalette.ts` 한 곳 |
| 시간 계산 | 🟡 `onedal-web/shared/src/timing.ts` 한 곳 |
| 콜 필터의 지역 목록 계산 | 🟡 `pnpm net:compare` (그물 계산이 두 벌 — 지도 `callNet` ↔ 서버 turf) |
| `baseFilter` ↔ `activeFilter` | 🟡 `onedal-web/server/CLAUDE.md` |
| `destinationKeywords` · `customCityFilters` | ✅ `keepKeepsAliases` — 경유 한 벌은 `filterManager` 한 곳이 조립한다 (`onedal-web/server/CLAUDE.md`) |
| 서버 낱말 사전 `onedal-web/server/config/keywords_*.json` | 🟡 앱 `FALLBACK_NOISE_WORDS` (일부러 일부만) |
| 배차망 이름 | 🟡 `TargetApp.kt` |
| DB 스키마 · `onedal-web/shared/` | 🟡 기존 DB 사본으로 부팅 (빈 DB 는 문제를 숨긴다) · 빈 DB 로도 부팅 |
| 픽커 상세 화면 OCR 파서 | 🟡 앱 `PickerScreenOcr.kt` ↔ 서버 `pickerScreenOcr.ts` (두 검사가 같은 문제지를 문다) |


## 도메인 용어

용어의 원천은 `onedal-web/server/tests/rules/glossary.test.ts` 다 — 금지어와 바꿀 말이 거기 있고, 코드와 `CLAUDE.md`(`pnpm audit:docs` ③)에서 막는다.

> 🔴 **콜 필터와 판정 기준은 따로 돈다.** 콜 필터는 앱이 콜을 **집기 전**에 거르고,
> 판정 기준은 서버가 **집은 뒤** 색을 정한다. 판정 기준은 앱에 내려가지 않는다. «오늘만»은 콜 필터에만 있는 개념이다 — 버튼이 아니라, 필터 창에서 손댄 값이 메모리에만 남는 것.

## 이 문서 · 코드 주석에 무엇을 적나 — 「지금 지켜야 할 것」을 한 곳에만

루트 `CLAUDE.md` 는 **세션마다 통째로 읽히고**, 이 파일은 그 「일하는 순서」가 가리킬 때 읽힌다 — 어느 쪽이든 틀린 문장이 섞이면 매번 틀리게 가르친다.

- ✅ 적는다: 지금도 참인 **규칙 · 명령 · 경계**와 **까닭 한 줄** — 기사님 말씀은 한 마디로, 날짜 없이
- ✅ 지금도 빠지는 함정은 «🔴 하지 말 것 + 까닭 한 줄» (기준: 그 착각에 지금도 빠지는가)
- 🔴 안 적는다: **끝난 사연 · 이미 없어진 함정 · 날짜별 경위**(날짜 붙은 고침 표시 · 지난 상태 서술 · 사고 경위 · 날짜 붙은 인용 · 없어진 경로) → 커밋 메시지로
- 🔴 **까닭이 검사 파일·코드 주석·다른 문서에 있으면 옮겨 적지 않는다** — 어디를 볼지만 적는다. 두 곳에 적으면 한쪽만 고쳐진다
- 🔴 **숫자를 적지 않는다 — 세는 명령을 적는다** (예: `ls onedal-web/server/tests/rules/ | wc -l`). 적어 둔 건수·기본값은 반드시 낡는다
- **«왜»는 걷어내지 않는다** — 이유가 없으면 규칙이 귀찮은 관습으로 읽혀 넘기게 된다.
  가르는 기준은 하나: **그 착각에 지금도 빠지는가.** 빠지면 한 줄로 남기고, 이미 없어진 상태면 걷어낸다
- 🔴 **코드와 다른 문서를 근거로 일하지 않고, 코드에 없는 것을 «완료»로 쓰지 않는다** — `pnpm audit:docs` 는 없는 파일·식별자·링크를 잡지만 문장이 틀린 것은 못 잡는다
- 검사 파일 머리는 «무엇을 막나» 두세 줄
- 걷을 때: 그 파일을 읽는 검사를 `grep -rl <경로>` 로 모아 돌린다 ·
  주석까지 든 원문을 위치·길이로 자르는 검사를 만나면 주석을 걷어낸 원문(`codeOnly`)으로 바꾼다
- ✅ `pnpm audit:docs` ⑥ 이 문다 — CLAUDE.md · 이 파일 · 검증 스크립트에 경위가 있으면 빨간불. 그 밖의 코드 주석은 늘면 빨간불이고, 이미 쌓인 줄은 그 파일을 만질 때 줄인다

## 이건 버그가 아니라 규칙이다 ⚠️ 고치기 전에 읽을 것

이 레포에서 **한쪽만 다르게 둔 것은 대개 일부러다.** 빠뜨린 것처럼 보여도 고치기 전에 이유를 찾고, 못 찾으면 묻는다.
`onedal-web/server/tests/rules/dispatchRules.test.ts` 가 아래 일부를 검사한다 — 깨지면 먼저 내가 규칙을 어겼는지 본다.
코드 주석의 «규칙 ③»·«⑤-4» 같은 번호는 이 절을 가리킨다.

**① 콜을 버리는 것은 기사님만 한다**
- 서버는 콜을 스스로 버리거나 취소하지 않는다 — 조건이 나빠도 이유만 적어 관제웹에 보인다
- 기사님이 직접 누른 콜(`matchType: 'MANUAL'`)에는 안전취소 자동 취소를 걸지 않는다. 판정 색은 낸다

**② 안전장치는 빼지 않는다**
- 앱의 안전취소(잡은 뒤 정한 시간 안에 위약금 없이 취소)는 지우지 않는다 — 시간은 배차망마다 설정값(원천은 DB 칸의 `DEFAULT` · `waitTimes` 검사)이고, 픽커는 수락이 곧 계약이라 안전취소가 없다
- 서버가 앱에 보내는 명령(KEEP/CANCEL)은 **앱이 받았다고 답할 때까지** 지우지 않고, 명령마다 `orderId` 를 싣는다
- 서버는 앱의 요청을 붙잡고 기다리지 않는다 — 바로 응답하고, 명령은 **다음 응답 끝에 실어** 보낸다

**③ 값을 따로 저장하지 말고 원래 데이터에서 계산한다**
- 같은 계산을 두 곳에 두지 않는다 (→ 「짝이 있는 것」)
- 설정 기본값은 DB 에서 온다. 코드의 `?? 10` 같은 기본값은 **늘리지 않되, 지금 동작에 쓰이니 지우지도 않는다**
- **새 설정값의 기본값은 DB 칸의 `DEFAULT` 에 둔다.** 값이 정말 없으면 에러를 내지 않는다 — ⑤-2 대로 흔한 값으로 계산하고 화면에 «미확인». 필터가 통째로 비었을 때만 ④ «고장»으로 막는다
- 앱(Kotlin)의 기본값은 예외다 — 서버가 죽었을 때를 위해 일부러 둔다

**④ 가짜 값으로 동작을 바꾸지 않는다**
- 조건을 건너뛰려고 값을 덮어쓰지 않는다 (예: 반경을 `999` 로) — 조건문으로 건너뛴다
- 없는 숫자는 `0` 이 아니라 `null` 이다
- 필터가 비어 있으면 «전부 통과»가 아니라 «고장»으로 다룬다

**⑤ 앱은 넉넉하게 올리고, 서버는 꼼꼼히 가려 추천한다**
- **⑤-1** 요금은 앱이 이미 걸렀다 — 서버 판정은 «지금 경로에 붙이면 얼마나 돌아가나»를 잰다
- **⑤-2** 모르는 값은 불리하게 가정해 떨어뜨리지 않는다 — 흔한 값으로 계산하고 화면에 «미확인»이라 적는다
- **⑤-3** 판정 색(🔵🟢🟡)이 가장 중요하다 — 기사님은 색만 보고 1~2초 안에 누른다
  🔴 **운전 중에는 누르지 못한다** — 곁눈질 1~2초가 전부다. 화면은 먼발치에서 읽히게, 흐름은 입력이 없어도 일이 되게 설계한다
- **⑤-4** 새 설정값(설정·기준·임계값)은 **코드보다 먼저 아래 다섯을 정한다.** 하나라도 비면 코드를 시작하지 않고 묻는다.
  적는 곳은 **그 값의 DB 칸 옆 주석**(`onedal-web/server/src/db.ts`)이다 — 값과 까닭이 한 곳에 산다

  | | 정할 것 |
  |---|---|
  | ① 스키마 | 어느 테이블·칸에 사나 |
  | ② 값 | 기본값과 그 근거 |
  | ③ 시점 | 언제 읽고 언제 쓰나 |
  | ④ 화면 | 어디에 어떤 이름으로 보이고, 고칠 수 있나 |
  | ⑤ 읽는 곳 | 누가 읽고 **각자 무슨 질문의 답으로** 쓰나 — 읽는 곳이 둘이면 값을 둘로 갈라야 하는지 의심한다 |

- **⑤-5** 시간 계산은 `onedal-web/shared/src/timing.ts` 를 먼저 읽는다 — 약속은 «도착 시각»이고, **상차버퍼**(상차지에서 더 기다릴 수 있는 분)와 **경유버퍼**(배송 중 남는 분)는 다른 값이다. 새 상수를 만들지 않는다

**⑥ 콜 진행 6단계(`CALL_STEPS`)는 한 번에 한 단계씩만 넘긴다**

**⑦ 앱 안에서만 참인 구조적 특이점**(세션 두 층 · 취소를 세는 자리 · 체험 콜과 DB · 화면을 안 그리는 단위 테스트)은 [server](onedal-web/server/CLAUDE.md) · [client-app](onedal-web/client-app/CLAUDE.md) 의 `CLAUDE.md` 에 있다

## 지금은 테스트 단계다 — **마이그레이션을 고려하지 않는다**

기사님: *"지금 테스트라 기존 데이터에 대한 마이그레이션은 고려하지 않는다. 로컬 라이브 모두 다."*

- 스키마·상태값을 바꿀 때 **기존 행을 살리는 이전 코드를 짜지 않는다** — 필요하면 지우고 다시 만든다. `local.db` · `data.db` 둘 다
- ⚠️ 그래도 **기존 DB 로 서버는 떠야 한다** — 칸 추가는 `ensureColumns` 로 붙이고, 기존 DB 사본으로 부팅해 본다 (「커밋 전 필수」)
- 🔴 지우는 것은 **손으로, 의도적으로** 한다 — 서버가 켜질 때 조건을 보고 표를 지우는 코드를 새로 만들지 않는다
  (부팅 때 표를 만지는 남은 코드는 [server/CLAUDE.md](onedal-web/server/CLAUDE.md) «조건부 DROP TABLE»).
  콜만 비우는 `pnpm reset:calls` 는 묻지 않고 써도 된다. **DB 파일이나 표를 지우는 것은 묻는다**
- 🔴 **기사님이 «이제 라이브를 직접 쓴다»고 말하면 이 절은 끝난다** — 그때부터 데이터는 실제 매출 기록이라 이 절을 지우고 마이그레이션 규칙을 쓴다

## 관제앱은 **업무 단위**다 — 정산 단위가 아니다

- 관제웹(`client-app`)에서 콜은 **하차 완료(`ORDER_DELIVERED`)로 끝난다.** 돈을 받았는지(미수금·기름값·톨비·순이익)는
  운행일지(`onedal-web/logbook`)의 정산 화면이 따로 다룬다 (기사님 결정)
- 🔴 관제웹에 정산 개념을 넣지 않는다 — 정산이 남았다고 콜을 «아직 진행 중»으로 세면 적재·필터가 틀어진다
  (`TERMINAL_STATUSES` 에 `ORDER_DELIVERED` 가 들어 있는 이유)
- ⚠️ `ORDER_COMPLETED`(정산 완료)는 **지금 새로 만드는 곳이 없다** (옛 상태값 변환 V7 만 쓰고, 통계는 읽기만 한다) — 정산 화면이 생길 때 거기서 만든다

## 여럿이 한 작업 트리에서 일한다 ⚠️ 브랜치를 안 딴다

기사님이 일을 에이전트 여럿에게 나눠 맡기고, **한 화면에서 결과를 같이 보려고** 모두 같은 작업 트리(`main`)에서 일한다.

**① 🔴 `git add -A` 를 쓰지 않는다 — 고친 파일만 이름으로 담는다** (남의 작업이 내 커밋에 딸려 들어간 적이 있다)

```bash
git add <고친 파일들>
git status --short          # 담기 전에 눈으로
git diff --cached --stat    # 낯선 파일이 보이면 멈춘다
```

**② 폴더는 «담당»이 아니라 «충돌 표시»다 — 맡은 일은 끝까지 한다**

일을 나눴더니 «남의 폴더라 알리고 넘긴다»가 쌓여 **아무도 안 하는 일**이 생겼다. 그래서 기준은 폴더가 아니라 **맡은 일을 끝냈나**다.

- ✅ **맡은 일에 필요하면 어느 폴더든 내가 고친다** — 코드·주석·문서 전부. 서버와 앱이 같이 바뀌면 **올리는 순서**를 계획에 적는다
- 🔴 **넘기는 것은 한 경우뿐이다** — 그 파일을 **지금 다른 에이전트가 고치는 중**일 때
  (`git status` 에 내가 안 고친 변경이 그 파일에 있다). 그때만 기사님께 알린다
- 🔴 **보고에 «넘겼다»가 있으면 까닭을 댄다** — 누가 그 파일을 고치고 있었나. 까닭이 없으면 **안 한 것**이다
- 남의 폴더를 고쳤으면 커밋 메시지에 «왜 고쳤나»를 적는다

| 폴더 | 주로 일하는 쪽 (겹치면 먼저 말한다) |
|---|---|
| `onedal-web/**` (현황판 제외) | 관제웹 «프로젝트» — 실물 화면·서버·필터 |
| `onedal-web/client-app/src/statusboard/**` | 관제웹 «현황판» — 오른쪽 곁 패널 |
| `onedal-sim/**` + `onedal-app/simulator-app/**` | 배차망 시뮬레이터 |
| `onedal-app/app/**` | 안드로이드 스캐너 |

화면의 `<div id="project">` · `<div id="statusboard">`(`Dashboard.tsx`)는 표시일 뿐이다.

**②-1 자리 · 말하기 · 커밋**
- **내 자리는 기사님이 시작할 때 말씀하신다** — 말씀이 없으면 첫 일을 받기 전에 묻는다
- «겹치면 먼저 말한다»는 **기사님께** 말한다
- `git status` 에 내가 안 고친 변경이 있으면 **고치는 중인지 버려진 것인지 스스로 가리지 않는다** — 기사님께 묻는다
- **커밋은 알아서 해도 된다** — 게이트 초록 + 고친 파일만 이름으로 담았을 때. 🔴 `push` 는 승인을 받는다
- 🔴 **떠 있는 `pnpm dev` 를 끄거나 다시 켜기 전에 묻는다** — 모두가 같은 서버를 보고 있다.
  내 검증은 **따로 띄운다**: 기존 DB 사본 + 다른 포트 ([onedal-web/CLAUDE.md](onedal-web/CLAUDE.md) «기존 DB 사본으로 부팅»)

**③ 🔴 게이트가 빨간불이면 «내가 건드린 파일인가»부터 본다**
- 내 파일이면 고친다
- **남이 고치는 파일 때문이면 커밋을 멈추고 기사님께 알린다** — 그 파일은 손대지 않는다. «전부 통과해야 커밋»이 우선이다

🔴 커밋을 되돌리기(`git reset`) 전에 반드시 묻는다 — 그 위에서 일하던 다른 에이전트의 이력이 흔들린다

## 주석 점검 진행 중 — 끝나면 이 절을 지운다

코드 주석에서 경위 · 코드와 다른 말 · 부정어를 걷어 **지금 상태와 까닭 한 줄**만 남기는 일이다 (기사님 결정).
주석을 고치는 에이전트는 이 절을 따른다.

- **단위** — 파일 하나 = 한 차례 = 커밋 하나. 커밋 제목은 `chore(주석): <파일 경로>` 로 고정한다. 이 제목이 장부다 — 표를 따로 두지 않는다.
  고칠 것이 없던 파일도 같은 제목의 빈 커밋(`--allow-empty`)을 남긴다. 그래야 다음 파일 명령이 그 파일을 건너뛴다
- **순서** — shared → server → onedal-app → client-app → onedal-sim → logbook · map → 검사 파일(맨 뒤). 묶음 안은 경로 이름순
- **읽는 줄** — 아래 명령이 찾는 후보 줄(기사님 인용 · 날짜 · 지난 상태를 말하는 말 · «하지 않는다»·«말 것»). 줄마다 넷 중 하나로 판정한다
  - 🔴 코드와 다른 말 → 코드가 지금 하는 일로 다시 쓴다
  - 🟡 경위 → 지금 규칙과 까닭 한 줄만 남긴다. 기사님 인용이 **규칙 그 자체**(값 · 결정)면 남긴다
  - ⚫ 부정어 — «하지 않는다»·«말 것»만 있고 무엇을 해야 하는지가 없는 문장 → «무엇을 한다»로 다시 쓴다
  - ✅ 그대로
- **절차** — 판정 → 고친 사본을 VS Code 디프 탭으로 연다 → 기사님 «고쳐» → 그 파일을 읽는 검사(`grep -rl <경로>`)와 `pnpm audit:docs` → 커밋
- **게이트** — 이 절이 있는 동안은 「커밋 전 필수」의 예외다. 파일마다는 위 둘만 돌리고, 전체 게이트는 묶음이 끝날 때 한 번 돌린다 (기사님 결정)
- **못 잡는 것** — 후보 줄에 안 걸린 주석의 «코드와 다른 말»
- **다음 파일** — 이 명령이 낸다. 빈 줄을 내면 끝났다는 뜻이고, 그때 이 절을 지운다

```bash
W='기사님|20[0-9]{2}-[0-9]{2}-[0-9]{2}|예전|걷어|되살|없앴|지웠|신설|철거|였다|이었다|하지 않는다|말 것'
T='\.test\.tsx?$|/tests/|/src/test/'
for pass in code test; do for d in onedal-web/shared/src onedal-web/server onedal-app/app/src onedal-web/client-app/src onedal-sim onedal-web/logbook/src onedal-map; do
  git ls-files "$d" | grep -E '\.(ts|tsx|kt)$' | { if [ $pass = code ]; then grep -Ev "$T"; else grep -E "$T"; fi; } | sort
done; done | while read f; do grep -qE "$W" "$f" || continue
  git log -1 --oneline --grep="chore(주석): $f\$" | grep -q . || { echo "$f"; break; }; done
```
