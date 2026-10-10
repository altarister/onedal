# 21 shared/src/index.ts 나누기 — 줄별 계획 (리팩터링만)

재료: 기사님 10-08 «새 기능은 넣지 말고 그냥 리팩터링만» · onedal-71 배정 · [12 D13 2판](12_D13_계획.md) 규칙(«누가 누구를 부르나»로 층 · 옮기기만 · 잃은 줄 0 · 그 파일을 적은 검사 먼저 세기 · 기존 DB 사본 부팅 · 순환 0 · 다시 내보내기는 shared `index.ts` 만 예외) · 10-08 HEAD(74dcd243)를 서브에이전트가 다시 읽음. **⏸️ 기사님이 «오늘 일 보관 · main 되돌리기»를 정하실 때까지 코드는 안 고친다 — 계획서만.**

## 기사님 하루에 (⑤)

| | 늘어남 · 줄어듦 |
|---|---|
| 좋은 콜 | 0 — 옮기기만 · 함수 몸통 글자 그대로 |
| 노이즈 | 0 — 화면 · 알림 그대로 |
| 기사님 손 | 0 — 화면 그대로 |

얻는 것은 구조다: 2,271줄 한 파일 → 12 파일 · 한 방향 종속 · 형제 파일 14개가 `./index` 를 거꾸로 부르던 것을 아래 파일에서 바로 가져옴. 그렇지 않은 줄이 생기면 그 줄은 빼고 기록만 한다.

## 지금 이렇게 돈다

- `index.ts` 가 타입 · 상수 · 셈 함수를 한 파일에 든다(오더 상태 · 마일스톤 · 화물 · 오더 DTO · 필터 · 기기 모드 · 기기 판정 · 콜 덱 · 도착 사유 · 동기화 DTO · 대기 시간) + 형제 파일 `export *` 묶음.
- 형제 파일 14개가 `./index` 에서 타입을 가져온다(모두 `import type` 이라 런타임 순환은 없지만 층이 거꾸로): callSteps · timing(CargoReport) · cargoUnits · cargoSpec · cargoHints(HandlingMethod) · orderStatuses(OrderStatus) · collectList · join · networkPages · modeTable(TargetAppType) · bleProtocol · modeTable(DeviceModeType) · screenLabels(ScreenContextType) · filterTally(FilterTally) · ops(여럿) · pageRead · verdict(오더 DTO).
- import 때 계산되는 값: `RESTORABLE_STATUSES`(114) · `IN_PROGRESS_STATUSES`(118)는 `ALL` · `EVALUATING` · `TERMINAL` 에 기대 · `ARRIVAL_REASONS`(2017)는 비공개 `ROAD_TROUBLE` · `REASON_GROUPS_BY_STEP`(1975 · 1977)과 함께. `export default` · `declare` · 최상위 `let` · 부수효과 없음.

## 나눌 파일 (아래층 → 위층 · 아래는 위를 모른다)

| # | 새 파일 | 옮길 줄(지금 index.ts) | 기대는 곳 |
|---|---|---|---|
| 1 | `orderStatus.ts` | 6-14 · 24-87 (EVENT_TYPES · OrderStatus · ORDER_STATUS_LABEL …) | 없음 |
| 2 | `cargoBasics.ts` | 259-295 (CARGO_SIZES · HANDLING_METHODS …) | 없음 |
| 3 | `deviceModes.ts` | 1323 · 1352-1366 · 1381-1466 (DEVICE_MODES · ScreenContextType · LIST_SCREENS …) | 없음 |
| 4 | `statusSets.ts` | 93-175 · 407-450 (TERMINAL · RESTORABLE · 셈 · DispatchPhase …) | 1 · orderStatuses |
| 5 | `milestones.ts` | 177-257 · 383-405 | 1 |
| 6 | `cargoReport.ts` | 296-381 | 2 · cargoUnits |
| 7 | `orderDto.ts` | 453-829 (SecuredOrder · MyOrder …) | 1 · 4 · paymentTypes |
| 8 | `dispatchFilter.ts` | 830-1321 (AutoDispatchFilter · callFilterBlocker · 배차 API 타입) | 4 · vehicles |
| 9 | `deviceSession.ts` | 1481-1813 (기기 판정 · DeviceSession) | 3 · 8 · allowance · networkPages · deviceOffline · targetApps · `filterTally` |
| 10 | `callDeck.ts` | 1857-2027 (콜 덱 · 도착 사유) | 4 · timing |
| 11 | `orderSync.ts` | 2029-2159 − FilterTally | 7 |
| 12 | `waitTimes.ts` | 2204-2263 | targetApps |

- `FilterTally`(2131-2151)는 `filterTally.ts` 안으로 — 9 가 쓰고, 그 파일의 `./index` 거꾸로 부름도 함께 없어진다.
- 순환을 낳는 갈림 둘: `HandlingMethod` 를 쓰는 형제(cargoUnits 등)는 **2** 에서 가져와야 한다(6 은 cargoUnits 를 부름) · `OrderStatus` 를 쓰는 orderStatuses 는 **1** 에서(4 는 orderStatuses 를 부름).
- `index.ts` 에 남는 것: 89-90 명시 재수출(`export *` 로 바꾸면 orderStatuses 의 다른 이름까지 노출) · 기존 `export *` 묶음 · 새 파일 열둘의 `export *`. 지금 이름 겹침 0(겹치면 TS2308 로 조용히 빠짐 — 단계마다 tsc 로 확인).

## 🔴 index.ts 를 글자로 읽는 검사 16 — 옮기기 전에 먼저

모두 `server/tests/rules`: appOrderShape · cancelBudget · filterTally · filterReview · phaseUi · pickupListGeo · previewCall · routeHolder · statusboardApi · reservationMode · sidePanel · modeChoicesScreen · motionHold · waitTimes · soloMinutes (+ filterReview 줄 넷). «없어야 한다»(`not.toMatch`) 다섯(filterReview 154 · 348 · previewCall · routeHolder · soloMinutes)은 옮긴 뒤 빈 index.ts 를 읽고 **거짓 초록**이 된다.

D13 규칙 «경로만 고친 것 다섯 넘으면 멈춤»에 걸린다(16) → 경로만 고치지 않고 먼저 바꾼다:
- **«칸이 있다 · 없다»(타입 모양)** — 기사님 «새 규칙은 동작 검사와 타입 파생으로» 대로 **타입 검사**로: shared 에 `typeShape.test-d.ts`(또는 server tsc 가 읽는 `.ts`)를 두고 `const f: AutoDispatchFilter = {...}` 로 있어야 할 칸을 쓰고, 없어야 할 칸은 `// @ts-expect-error` 로 읽는다 — 칸이 다시 생기면 tsc 가 «기대한 오류가 없다»로 빨개진다. 옮기기 전 HEAD 에서 tsc 초록 · 변이(칸을 되살림) 🔴.
- **«상수 값»**(motionHold `= 10` · waitTimes `= 30` · cancelBudget) — 값을 가져와 `expect(MOTION_HOLD_SEC_DEFAULT).toBe(10)` 동작으로.
- **«함수 몸통 글자»**(sidePanel · modeChoicesScreen) — 함수를 불러 결과로.
- **원달앱 Kotlin 대조**(appOrderShape — SimplifiedOfficeOrder 칸 ↔ Kotlin 모델)는 두 언어 대조라 타입으로 못 바꾼다 → 경로만 `orderDto.ts` 로(하나).
- 이 바꿈은 `test:` 커밋으로 **옮기기 전에** 먼저(각 검사 HEAD 초록 · 변이 🔴).

## 단계 · «무엇이 참이면 끝인가»

0. `test:` — 위 16 검사를 타입 · 동작으로(경로만은 appOrderShape 하나). 끝: HEAD 에서 server tsc · jest 초록 · 바꾼 검사마다 변이 🔴.
1. 아래층 셋(1 · 2 · 3)을 옮기고 형제 파일의 `./index` 가져오기를 새 파일로. 끝: 옮긴 줄 대조 «잃은 줄 0 · 새 줄은 import · export · 머리 주석뿐» · shared · 서버 · 관제웹 tsc · jest · test:web · 순환 0.
2. 4 · 5 · 6. 끝: 같은 셋.
3. 7 · 8 · `FilterTally` → filterTally.ts. 끝: 같은 셋.
4. 9 · 10 · 11 · 12. 끝: 같은 셋 + `index.ts` 에 남은 것이 재수출 · `export *` 뿐 + 기존 DB 사본 부팅(서버) + scenario.
- 단계마다 서버 jest 전체(«관제웹만 고쳐도 서버 jest» 메모) · 레포 밖 복사본에서.

## 기사님 몫 — 없음

동작 · 화면 · 설정값 · 저장 칸 · 새 폴더 없음(새 파일은 있는 폴더 `shared/src` 안). 단 ⏸️ 기사님 «보관 · 되돌리기» 결정 뒤에 시작.
