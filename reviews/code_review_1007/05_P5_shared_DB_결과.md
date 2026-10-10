# P5 shared · DB — 결과 (찾은 것 + 고침 계획)

계획서: [코드레벨의_정밀리뷰_실행계획.md](코드레벨의_정밀리뷰_실행계획.md) P5 · 무게는 Q1 · Q2 · Q5 · Q8.
코드는 고치지 않았다.

## 1. 읽을 목록

| 파일 | 줄 | 읽음 |
|---|---|---|
| `shared/src/index.ts` | 2,332 | 부분(상태 목록 · 파생 함수 · export 줄) |
| `shared/src/*.ts` 중 `./index` 를 되읽는 파일 | — | 전수 grep(순환 참조) |
| `server/src/db.ts` | 1,215 | 부분(CHECK · DROP · 머리 규칙) |
| 손으로 적은 상태 목록 | — | 레포 전수 grep(shared · server · client-app · ops) |
| `networkPages.ts` · `modeTable.ts` · `allowance.ts` · `screenLabels.ts` · `bleProtocol.ts` | — | 이전 리뷰(46 · 48 · 50)에서 읽음 · 짝 검사 있음 |

## 2. 한 줄 결론

shared 는 «파생 · 한 곳» 규칙이 대체로 지켜진다. 남은 것은 **«취소 · 방출» 상태를 손으로 적은 목록 넷**과 **런타임 값을 `./index` 에서 되읽는 순환 참조 둘**이다.

## 3. 찾은 것

| ID | 관점 | 꼴 | 파일:줄 | 코드로 본 것 | 판단 | 확인 | 검사가 무나 | 운행 영향 | 무게 |
|---|---|---|---|---|---|---|---|---|---|
| P5-01 | Q1 · Q8 | A | `shared/src/index.ts:94-96`(isLetGoStatus) · `shared/src/callTargetDay.ts:33`(UNDONE_STATUSES) · `server/src/core/simScenario.ts:130`(CANCELED) · `server/src/repositories/OrderRepository.ts:242`(SQL `IN (...)`) · 관제웹 `lib/finishedCalls.ts:51-53` · `components/layout/Drawer.tsx:64-69`(whyOf — ORDER_STATUS_LABEL 과 말이 다름: «내가 방출 / 방출(기사님)» · «사무실이 뺌 / 방출(사무실)») | «취소 · 방출» 세 상태를 여섯 곳에서 손으로 적는다(c6 가 관제웹 둘 더 찾음) | shared CLAUDE «목록을 손으로 나열하지 않고 파생시킨다»와 다르다. 새 종결 상태(예: 상대 취소)가 생기면 넷이 갈라져 복귀콜 셈 · 종료 시각 · 시뮬 셈이 서로 다른 답을 낸다 | grep | 안 묾(`orderStatusLabel` 은 이름표만) | 노이즈 · 손(셈이 틀림) — 새 상태가 생길 때 | 중간 |
| P5-02 | Q1 | — | `shared/src/pageRead.ts:2` · `shared/src/screenLabels.ts:1` | `./index` 에서 런타임 값(PAYMENT_TYPES · TARGET_APP_LABEL · DEVICE_OFFLINE_LABEL)을 가져오고, `index.ts` 는 두 파일을 `export *` 한다 | 지금은 함수 안에서만 써서 돈다. 누가 모듈 맨 위에서 쓰는 순간 «Cannot access before initialization»으로 서버 부팅이 멈춘다(shared CLAUDE 함정) — tsc · jest 는 못 잡는다 | grep · 쓰는 자리가 함수 안임을 확인 | 안 묾 | 부팅 — 고치는 날에만 | 낮음 |
| P5-03 | Q1 | — | `shared/src/index.ts`(2,332) | 상태 · 필터 · 차종 · 화면 · 시간 · 판정 · 모드 · 기기 등이 한 파일 | 세 앱이 함께 흔들리는 경계라 한 파일에 몰리면 고칠 때 범위를 못 본다. 나눌 자리: 콜 상태(orderStatus) · 필터(filter) · 기기 · 모드(device) 셋으로 떼고 index 는 다시 내보내기만 | 줄 셈 | — | 손 | 중간 |
| P5-04 | Q1 | — | `server/src/db.ts:42-62`(`dropStaleCheck`) | 표를 지우고 다시 만드는 함수가 남아 있고 아무 데서도 안 부른다(server CLAUDE 도 «지금 안 부른다») | `DROP TABLE` 을 품은 안 쓰는 함수 — 누가 다시 부르면 데이터 사고 자리. `audit:dead` 는 export 아닌 함수를 안 봐서 안 잡는다 | grep(정의 · 주석 둘뿐) | — | 데이터 — 다시 부를 때 | 낮음 |
| P5-06 | Q1 | A | `dispatchEngine.ts:471` · `socketHandlers.ts:544` · 관제웹 `JudgmentSeat:123` · `PinnedRoute:28` · `PinnedRouteCard:50` · `StageView:69` · `useOrderEngine:371` | 결재 종류 타입 `'ORDER_CONFIRMED' \| 'SAFE_CANCEL' \| 'ORDER_RELEASED_BY_ME' \| 'ORDER_RELEASED_BY_OFFICE'` 를 일곱 곳에서 손으로 적음 | shared 에 이름 하나가 없다 — 새 결재 종류가 생기면 일곱을 다 찾아야 한다(c6) | grep | — | 손 | 낮음 |
| P5-07 | Q1 · Q8 | — | `db.ts:24-26`(머리 규칙 «enum 성 칸에 CHECK 를 걸지 않는다») vs `:79`(users.role) · `:216`(app_releases.app) · `:304`(default_priority) · `:643`(order_judgments.color 꿀/보통/똥/사고) | 규칙과 남은 CHECK 넷이 다르다 | role · app 은 값이 늘 일이 드물어 «예외 — 까닭 한 줄»이면 된다. color 는 기사님 «판정 색은 새로 만든다»(DB judgment config)로 바뀔 수 있는 칸이라, 색이 늘면 기존 표가 새 색을 조용히 거부한다 — server CLAUDE 함정 그대로(c6) | grep | shared 판정 색 목록과 짝 검사 — P3 에서 확인 | 판정 장부 — 색이 바뀔 때 | 낮음(color 는 중간) |
| P5-05 | — | — | — | ~~내일 상차 목록 두 곳~~ — 거둠(P0 측정 섞임 · e48ae3be) | — | — | — | — | — |

## 4. 고침 계획

| ID | 어느 자리를 무엇으로 | 새 검사 | 🔴 기사님 결정 | 다른 파트와 얽힘 | 크기 |
|---|---|---|---|---|---|
| P5-01 | **방향은 거꾸로**: shared 에 `LET_GO_STATUSES`(세 상태)를 원천으로 두고 `TERMINAL_STATUSES = [ORDER_DELIVERED, ORDER_COMPLETED, ...LET_GO]` 로 파생(TERMINAL 에는 COMPLETED 도 있어 «TERMINAL − 하차 완료»로 만들면 완료 콜을 무른 콜로 셈 · c6). isLetGoStatus · UNDONE_STATUSES · CANCELED · SQL 자리표 · 관제웹 finishedCalls · Drawer whyOf 가 그것과 ORDER_STATUS_LABEL 을 쓴다 | «취소 · 방출» 세 이름을 나란히 적은 줄 0(구조 규칙) + LET_GO ⊂ TERMINAL + «COMPLETED · DELIVERED 는 LET_GO 아님» 한 칸(변이로 확인) | 🔴 관제웹 화면 바뀜(서랍 «왜 끝났나» 글자가 ORDER_STATUS_LABEL 로 맞춰짐) | P2 · P6 · P8 | 작음 |
| P5-02 | 두 파일이 원천 파일에서 직접 가져오게(PAYMENT_TYPES · TARGET_APP_LABEL 이 사는 파일) — 원천이 index.ts 안이면 그 상수를 작은 파일로 떼기 | shared 안에서 `from './index'` 런타임 가져오기 0(구조 규칙) | — | — | 작음 |
| P5-03 | index.ts 를 셋으로 떼고 다시 내보내기 | 동작 무변화 — 게이트 + 기존 DB 사본 부팅 | — | P1 · P2 · P6(가져오는 곳 전부) | 큼 |
| P5-04 | `dropStaleCheck` 지우기 — **P5-07 을 정한 뒤로 미룸**(color CHECK 를 뗄 때 같은 길이 다시 필요할 수 있음 · c6) | — | 🔴 지우기 | P5-07 | 작음 |
| P5-06 | shared 에 `DecisionStatus` 타입 하나 · 일곱 자리가 그것을 씀(타입이라 동작 같음 · 새 종류가 생기면 tsc 가 빠진 곳을 짚음) | tsc | — | P2 · P6 | 작음 |
| P5-07 | role · app 은 db.ts 머리에 «예외 — 까닭» 한 줄 · color 는 shared 판정 색 목록과 짝 검사 → 색이 늘 길이 정해지면 행 복사 뒤 CHECK 떼기(dropStaleCheck 와 같은 길) | color 짝 검사(shared 색 목록 = CHECK 목록) | 🔴 판정 색 체계(기사님 «판정 색은 새로 만든다»)와 함께 | P3 · P5-04 | 작음 |
| P5-05 | 거둠 | — | — | — | — |

- 차례(c6): P5-03(index.ts 떼기)은 P5-01 · P5-06 · P5-07 이 끝난 뒤 — 손 목록이 정리되면 옮길 줄이 준다.

## 5. 못 잡는 것

- 원달앱(Kotlin) 쪽의 손 목록은 P1 일꾼 몫(원달앱은 shared 를 못 가져와 손 목록이 필요할 수 있다 — 짝 검사가 있는지 P1 에서).
- 기존 DB 사본 부팅은 고칠 때 한다.
