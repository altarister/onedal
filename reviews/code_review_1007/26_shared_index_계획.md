# 26 shared/src/index.ts 나누기 — 계획서 (리팩터링만 · 승인 전)

맡긴 곳: [25 새 에이전트 안내](25_새에이전트_안내.md) §3 · §4. 기준 HEAD `14caff69`(안내서의 `ed4d3dcf` 뒤에 24 의 원달앱 커밋 하나 — shared 변화 없음).
**승인 전에는 코드 · 검사를 고치지 않는다.** 이 문서의 줄 번호는 모두 HEAD 의 `onedal-web/shared/src/index.ts`(2,271줄)다.

---

## 0. 이 안내서와 원천만으로 짐작해야 했던 곳

### 가. 원천에 없어 짐작한 것 (제가 정한 것 · 71 이 뒤집을 수 있게 적음)

| # | 무엇 | 제가 정한 것 | 까닭 |
|---|---|---|---|
| 가1 | 새 파일 이름 · 묶는 기준 | 주제별 13 파일(아래 2절 표) · 이름은 지금 있는 형제 파일과 겹치지 않게(`orderStatuses.ts` 가 있어 새 파일은 `callStatus.ts`) | 원천에 «어떻게 묶나» 기준이 없다. 서버 · 관제웹이 이미 쓰는 말(콜 상태 · 마일스톤 · 짐 신고 · 콜 필터 · 기기 · 화면 · 대기 시간)로 묶었다 |
| 가2 | 형제 파일 16개가 `import type … from './index'` 하는 것을 새 파일로 바꿀까 | **안 바꾼다** — 형제 파일은 한 줄도 안 만진다 | shared CLAUDE.md «타입만 주고받으면 안전하다» · 16개 모두 `import type` 이라 런타임 순환이 아니다. 바꾸면 고칠 파일이 16 늘고 얻는 동작은 0 |
| 가3 | 설명 대상과 떨어져 있는 문서 주석(아래 목록)을 어디로 옮기나 | **설명하는 선언 곁으로** 옮긴다 · 글자는 한 자도 안 바꾼다 | 원천에 기준이 없다. 지금 자리 그대로 옮기면 엉뚱한 파일의 엉뚱한 선언 위에 앉는다 |
| 가4 | 0단계 타입 검사(`@ts-expect-error`)를 누가 형 검사하나 | 서버 검사 파일 안에 둔다 — ts-jest 기본 설정이 검사 파일을 형 검사한다(`server/jest.config.js` 는 `createDefaultPreset`) | 서버 `tsconfig.json` 의 `include` 는 `src/**` 뿐이고, shared 에는 tsconfig 가 없고 `vitest run` 은 형 검사를 안 한다 — shared 에 둔 타입 검사 파일은 아무도 안 읽는다. **0단계 첫 변이로 «쓸데없는 `@ts-expect-error`» 가 jest 빨간불이 되는지 먼저 본다.** 안 되면 멈추고 71 에게 |
| 가5 | 커밋 한 개에 무엇을 담나 | 단계 하나 = 커밋 하나, **index.ts 와 그 단계의 새 파일을 같은 커밋에** | `audit:docs` ⑥ 은 «같은 차례에 바뀐 파일의 HEAD 판에 있던 줄»을 옮긴 줄로 봐 준다(`scripts/audit-docs.mjs` 나) — 새 파일만 따로 커밋하면 옮긴 주석의 경위 줄이 «늘었다»로 빨개진다 |
| 가6 | 운영센터 · 운행일지 타입 검사 | 단계마다 `ops` · `logbook` 도 형 검사한다(게이트 표에는 없음 · 이번 일만) | 두 앱도 `@onedal/shared` 를 읽는다. 이름 하나가 빠지면 거기서도 깨진다 |

설명 대상과 떨어진 문서 주석(가3) — 지금 자리 → 옮길 자리:
- 243-249 «이 오더에서 지금 보고할 수 있는 마일스톤» → `canReportMilestone`(383) 위
- 208 · 266 짧은 한 줄 설명(바로 밑 긴 설명과 같은 말) → 그 자리 그대로(같은 선언 위)
- 1177-1181 · 1207-1211 옛 설명 블록 → 각각 `deriveDispatchPhase` · `getEffectiveDetourRadius` 위 그대로(지금도 그 위 — 함께 옮김)
- 1465 «지금 화면이 콜에서 손을 뗀 상태인가» → `isListScreen`(1549) 위
- 1523-1526 «이 배차망에서 도는 모드» → `runningModeOf`(1545) 위
- 1846-1849 «관제탑으로 보내는 오더 스냅샷» → `OrderSyncPayload`(2050) 위
- 2120 «경로 위의 정거장 하나» → `RouteStopInfo`(2155) 위 · 2121-2126 «취소 예산 한 판의 크기» → `CANCEL_BUDGET_PER_ROUND`(2153) 위

### 나. 원천끼리 다른 것

| # | 한쪽 | 다른 쪽 | 제가 따른 것 |
|---|---|---|---|
| 나1 | 24 §7-1 «71 에게 21 승인 여부 · 0단계 방식 · 커밋 멈춤이 풀렸나 세 가지를 묻는다» | 25 §3 «21 은 승인되지 않은 참고 — 따르지 말고 새로 쓴다» | 25 (71 이 나중에 쓴 안내 · 24 의 3 · 4 · 7절은 참고만이라고 25 §2 가 정함) |
| 나2 | 25 §1 표 «메모리 — 이번 일에 닿는 것: … `page-flow-common-routine`» | 그 메모리는 배차망 페이지 흐름(리스트 → 상세 → 확정페이지) 이야기 · shared 파일 나누기와 닿는 자리를 못 찾았다 | 읽고 넘어감 — 닿는 곳이 있으면 71 이 짚어 주기 |
| 나3 | 원달앱 `models/SharedModels.kt:4` 주석 «웹 관제탑(onedal-web/shared/src/index.ts)과 1:1 동기화» | 나눈 뒤 `SimplifiedOfficeOrder` 는 `orderShapes.ts` 에 산다(index.ts 는 다시 내보내기만) | 원달앱은 안 만진다(25 §3) — 24 에게 알리고 기록만 |

### 다. 33 의 문서와 원천(코드)이 다른 것

| # | 33 문서 | 코드로 센 것 |
|---|---|---|
| 다1 | 24 §3 · 21 «index.ts 를 글자로 읽는 서버 검사 16» — 이름은 15개 | index.ts 를 읽는 서버 검사 파일은 **16**(33 목록 + `sharedReplies`). `sharedReplies` 는 index 에 남는 줄(`export * from './replies'`)을 읽어 **안 깨진다** → 바꿀 것 **15 파일 · 검사 줄 26곳**(3절 표) |
| 다2 | 21 «"없어야 한다" 다섯(filterReview 154 · 348 · previewCall · routeHolder · soloMinutes)» | **여섯** — `modeChoicesScreen:21`(«허락이 꺼졌습니다» 글자가 index 에 없다)도 옮기면 빈 index 를 읽고 거짓 초록 |
| 다3 | 21 «형제 파일 14개가 `./index` 에서 타입을 가져온다» | **16**: bleProtocol · cargoHints · cargoUnits · callSteps · cargoSpec · collectList · filterTally · join · modeTable · orderStatuses · networkPages · ops · pageRead · screenLabels · timing · verdict |
| 다4 | 21 «순환을 낳는 갈림 둘 — `HandlingMethod` · `OrderStatus`» → `cargoBasics.ts` 를 따로 뗌 | 둘 다 `import type` 이라 **런타임 순환이 아니다**(shared CLAUDE.md «타입만 주고받으면 안전»). 따로 뗄 까닭이 없다 |
| 다5 | 21 0단계 «shared 에 `typeShape.test-d.ts` 를 두고 `@ts-expect-error`» | shared 에는 형 검사를 도는 자리가 없다(가4) — 그 파일은 늘 초록이다 |
| 다6 | 21 «motionHold · waitTimes 값 → `expect(값).toBe(…)` 로 바꾼다» | 두 검사는 **이미** 값을 불러 본다(`motionHold:31` · `waitTimes:35`). 글자 줄은 같은 것을 두 번 보는 것이라 **지우기만** 하면 된다 |
| 다7 | 21 1단계 «형제 파일의 `./index` 가져오기를 새 파일로» | 가2 — 안 바꾼다 |

---

## 1. 지금은 이렇게 돈다

- `onedal-web/shared/package.json` 의 `main` · `types` 가 `src/index.ts` 다. 서버 · 관제웹 · 운영센터 · 운행일지는 모두 `@onedal/shared` 하나로 들여온다 — `shared/src/…` 깊은 경로로 들여오는 곳은 0.
- index.ts 는 두 가지를 한 파일에 든다.
  - **자기 몸통(약 1,800줄)**: 콜 상태 · 복구 창 · 마일스톤 · 짐 신고 · 콜 양식 타입 · 콜 필터 타입과 셈 · 배차 요청 타입 · 기기 모드 · 화면 종류 · 기기 판정 · 콜 목록 판단 · 단계 사유 · 동기화 봉투 · 대기 시간.
  - **다시 내보내기**: 형제 파일 40여 개의 `export *` 와 `orderStatuses` 의 이름 다섯.
- 몸통이 런타임으로 형제 파일을 부르는 곳은 여섯: `unitPoints`(cargoUnits) · `listReturnOf`(networkPages) · `businessDayKey`(timing) · `phoneModeOf`(allowance) · `LET_GO_STATUSES`(orderStatuses) · `isTargetApp` · `DEFAULT_TARGET_APP`(targetApps). 이 여섯 파일과 그들이 부르는 파일(vehicles · cargoHints · format) 어느 것도 index 의 **런타임 값**을 부르지 않는다 → 지금 런타임 순환 0.
- 들여올 때 계산되는 값: `RESTORABLE_STATUSES` · `IN_PROGRESS_STATUSES`(상태 목록에서 파생) · `ARRIVAL_REASONS`(비공개 `ROAD_TROUBLE` · `REASON_GROUPS_BY_STEP` 에서). 옮길 때 함께 간다.
- 원달앱(Kotlin)은 TS 파일을 안 읽는다 — 서버가 보내는 JSON 의 칸 이름만 본다. 파일을 나눠도 JSON 은 한 글자도 안 바뀐다.
- 그 순간 넷이 각각 무엇을 하나 — **나누기 전 · 뒤 같다**: 원달앱(같은 JSON 을 받고 보냄) · 관제앱(공급 소켓 그대로) · 서버(같은 함수 · 같은 값) · 관제웹(같은 이름을 같은 곳에서 들여옴).

## 2. 나눌 파일 (모두 있는 폴더 `shared/src` 안 · 새 폴더 없음)

| # | 새 파일 | 옮길 줄(HEAD index.ts) | 런타임으로 부르는 곳 |
|---|---|---|---|
| 1 | `callStatus.ts` 콜 상태 | 19-87 · 90(가져오기) · 92-161 · 406-423 · 435-444 | orderStatuses |
| 2 | `milestones.ts` 마일스톤 | 163-242 · 243-249(→ canReportMilestone 위) · 383-404 | 없음 |
| 3 | `cargoReport.ts` 짐 신고 | 250-381 (243-249 빼고) | cargoUnits |
| 4 | `orderShapes.ts` 콜 양식 | 6-14 · 452-826 | 없음 |
| 5 | `dispatchFilter.ts` 콜 필터 | 425-433 · 446-450 · 828-1231 | 없음 |
| 6 | `dispatchApi.ts` 배차 요청 · 응답 · 비상 보고 | 1233-1318 · 1599-1635 | 없음 |
| 7 | `deviceModes.ts` 기기 모드 · 잡은 방식 | 1320-1323 · 1326-1366 · 1369-1393 | 없음 |
| 8 | `screenKinds.ts` 화면 종류 | 1395-1463 · 1465 · 1549-1554 · 1556-1597 | networkPages |
| 9 | `deviceSession.ts` 기기 판정 · 기기 세션 | 1466-1547 (1465 · 1523-1526 빼고 · 1523-1526 은 runningModeOf 위로) · 1637-1813 · 2127-2151(FilterTally) | allowance |
| 10 | `callDeck.ts` 콜 목록 판단 | 1850-1940 | callStatus · timing |
| 11 | `arrivalReasons.ts` 단계 사유 | 1942-2019 | 없음 |
| 12 | `orderSync.ts` 동기화 봉투 · 취소 예산 | 1846-1849 · 2021-2126(2120-2126 은 각 선언 위로) · 2153-2160 | 없음 |
| 13 | `waitTimes.ts` 대기 시간 · 기본 초 | 2193-2263 | targetApps |

- 타입만 서로 쓴다(`import type`): 1 ← 2 · 4 · 10 / 4 ← 5 · 6 · 12 / 5 ← 6 / 7 · 8 ← 6 · 9 / 9 ← 6 …. 새 파일끼리 런타임으로 부르는 것은 10 → 1 하나뿐이다.
- 🔴 새 파일은 `./index` 를 **부르지 않는다**(타입도 새 파일 · 형제 파일에서 직접). 그래야 «새 파일 → index → 새 파일» 고리가 안 생긴다.
- **index.ts 에 남는 것**: 15 `export * from './paymentTypes'` · 89 orderStatuses 이름 다섯 · 1325 `deviceOffline` · 1368 `targetApps` · 1816-1844 · 2161-2191(주석째) · 2264-2271 의 `export *` · 새 파일 13개의 `export *`. 들여오는 줄(1-5 · 16-18 · 90)은 쓰는 파일로 간다.
- 함수 · 타입 · 상수의 **몸통 글자는 한 자도 안 바꾼다.** 새로 생기는 줄은 각 파일 맨 위 `import` 줄과 index 의 `export *` 줄뿐. 머리 주석을 새로 쓰지 않는다(옮긴 구획 머리 `━━━` 주석이 그대로 머리가 된다).

### 순위 검산 — 둘 이상 나란히

| | 가. 형제 파일은 그대로(제안) | 나. 형제 파일 16개의 `./index` 타입 가져오기도 새 파일로 |
|---|---|---|
| 고칠 파일 | index + 새 13 | index + 새 13 + 형제 16 |
| 런타임 동작 | 같음 | 같음 |
| 순환 | 타입 순환만 남음(무해) | 타입 순환도 0 |
| 다른 세션과 겹칠 위험 | 낮음 | 형제 16개 중 `networkPages` · `ops` 등을 다른 세션이 고칠 수 있다 |

→ **가.** 얻는 동작이 같고, 고칠 파일이 절반 아래다.

| | 가. 13 파일(제안) | 나. 21 의 12 파일 |
|---|---|---|
| 기기 판정 | 모드 · 화면 종류 · 세션 셋으로 | 둘(`deviceModes` · `deviceSession`)로 |
| 짐 | `cargoReport` 하나 | `cargoBasics` + `cargoReport`(다4 — 뗄 까닭 없음) |
| 동기화 · 필터 성적표 | `FilterTally` 는 쓰는 곳(`DeviceSession`) 곁 | `filterTally.ts`(형제 파일)를 고쳐 그 안으로 |

→ **가.** 형제 파일을 안 만지고(가2), 한 파일이 한 주제다.

## 3. 0단계 — index.ts 를 글자로 읽는 서버 검사 15 파일 · 26곳을 먼저 바꾼다

원칙(메모리 `no-new-source-text-checks` · `behavior-tests-not-source-text`): 기존 글자 검사가 리팩터로 깨지면 동작 검사 · 타입으로 바꿀 수 있나 먼저 본다. 새 글자 검사는 만들지 않는다.
바꾸는 모양 셋:
- **칸 있다** → 그 타입으로 값을 만들어 본다(`const f: Pick<AutoDispatchFilter, 'routeMode'> = { routeMode: true }` · 비워도 되는지는 `= {}`).
- **칸 없다** → `// @ts-expect-error` 를 붙여 그 칸을 읽는다 — 칸이 되살아나면 «쓸데없는 @ts-expect-error» 로 ts-jest 가 빨개진다.
- **값 · 함수** → `@onedal/shared` 에서 불러 `expect`.

| 검사 · 줄 | 지금 보는 글자 | 바꿀 모양 |
|---|---|---|
| phaseUi:586 | `export type CallTarget = 'DEST' \| 'HOME';` | `const t: CallTarget[] = ['DEST','HOME']` + `@ts-expect-error` 로 `'LOCAL'` 대입 |
| phaseUi:1165 | `excludedRegions?: string[]` | 칸 있다(AutoDispatchFilter) |
| cancelBudget:36 | `CANCEL_BUDGET_PER_ROUND` 이름 | `typeof CANCEL_BUDGET_PER_ROUND === 'number'` |
| cancelBudget:71 | `cancelRounds` 이름 | 칸 있다(OrderSyncPayload) |
| routeHolder:68-72 | 봉투에 `routePolyline` 없다 | 칸 없다(OrderSyncPayload) |
| pickupListGeo:182 | `pickupGroups?: Record<string, string[]>` | 칸 있다 |
| previewCall:58 · 63 | `isPreview?: boolean` 있고 `isPreview: boolean`(필수) 없다 | DispatchBasicRequest · DispatchDetailedRequest 를 `isPreview` 없이 만들고 · 넣어서도 만든다 |
| sidePanel:151 | `appFilterRowsOf` 몸통에 `APP_FILTER_KEYS` | 글자 줄을 지운다 — shared `appFilterRows.test.ts` «칸 순서는 APP_FILTER_KEYS 먼저»가 이미 동작으로 문다 |
| statusboardApi:81-87 | DeviceSession 에 `filterVersion?: string` · `filterVersionAt?: number` | 칸 있다(둘) |
| motionHold:32 | `MOTION_HOLD_SEC_DEFAULT = 10` | 글자 줄을 지운다 — 바로 위 31 이 값을 본다(다6) |
| soloMinutes:110 | index 에 `osrmSolo` 없다 | `osrmSoloDistanceKm` · `osrmSoloDurationMin` 칸 없다(PendingOrder · MyOrder · SecuredOrder — git 에서 지운 칸 이름) · timing.ts 글자 줄은 그대로 |
| filterReview:159 · 160 | `radiusDistanceKm?: number` 있고 `radiusScale?: number` 없다 | 칸 있다 · 칸 없다(AutoDispatchFilter) |
| filterReview:245 | `goalCity?: string` | 칸 있다(AutoDispatchFilter) |
| filterReview:355 | `localMode?: boolean` 없다 | 칸 없다(AutoDispatchFilter) · callNet.ts 글자 줄은 그대로 |
| filterReview:372 | `routeMode?: boolean` | 칸 있다 |
| modeChoicesScreen:21 | index 에 `modeHeldWhy` · `heldWhy` · «자동 잡기 허락이 꺼졌습니다» 없다 | 두 이름은 칸 없다(DeviceSession) · 글귀는 shared 판정 함수(`phoneLinkBadgeOf` · `workStageLabel`)가 내는 글에 없다로(동작) · 관제웹 · allowance.ts 글자 줄은 그대로 |
| modeChoicesScreen:31 | `return phoneModeOf(d) !== d.appliedMode;` | 동작: 허락 꺼진 폰(`mode: AUTO · autoAllowed: false · appliedMode: ALARM`)은 `isModeApplying` 거짓 · `appliedMode: AUTO` 면 참 |
| filterTally:91 · 108 | DeviceSession 에 `filterTally?:` · `filterTallyAt?: number` | 칸 있다(둘) |
| waitTimes:148 | `SAFE_CANCEL_SEC_DEFAULT = 30` | 글자 줄을 지운다 — 35 가 값을 본다(다6) · 서버 core/waitTimes.ts 글자 줄은 그대로 |
| reservationMode:28-30 | `ReservationMode` 셋 · `reservationMode?: ReservationMode` | 셋으로 값을 만들고 넷째 글자는 `@ts-expect-error` · 칸 있다 |
| reservationMode:50-52 | FilterTally 에 `reservation?: number` | 칸 있다 |
| appOrderShape:25 · serverFields() | SimplifiedOfficeOrder 칸 이름(글자로 뽑음) ↔ 원달앱 Kotlin | 서버 쪽만 타입으로: `Required<SimplifiedOfficeOrder>` 견본 하나를 두고 `Object.keys` — 칸이 빠지면 «없는 칸», 남으면 «남는 칸»으로 tsc 가 막는다. Kotlin 쪽 읽기는 그대로. 🔴 원달앱 소스를 읽는 검사라 **24 와 먼저 순서를 맞춘다**(25 §3) |

- 원달앱 소스도 읽는 검사 넷(previewCall · filterTally · waitTimes · appOrderShape)은 **고치기 전에 24 에게 «이 줄만 고친다»를 알린다** — 24 가 HijackService 를 나누며 같은 파일의 원달앱 경로 줄을 고칠 수 있다.
- 0단계는 `test:` 커밋 하나(검사 파일 15). index.ts 는 아직 안 만진다.

## 4. 단계 · «무엇이 참이면 끝인가»

일은 레포 밖 복사본(`git worktree add --detach <scratchpad>/wt HEAD`)에서 하고, 본 트리에는 `git diff` 패치로 옮겨 `git commit -m … -- <내 파일들>`(새 파일만 바로 앞에서 `git add`) · 커밋 직전 `git diff --cached --name-only` 를 제 목록과 견준다.

| 단계 | 하는 일 | 끝 |
|---|---|---|
| 0 | 3절 표 15 파일 | HEAD 코드로 서버 jest «Test Suites» passed = total · 서버 tsc 초록 · **첫 변이**: `AutoDispatchFilter` 에 `localMode?: boolean` 을 되살리면 filterReview 🔴(쓸데없는 @ts-expect-error) — 안 빨개지면 멈추고 71 에게(가4) · 바꾼 줄마다 변이 하나씩 🔴 뒤 되돌려 초록 |
| 1 | 새 파일 1 · 2 · 3 (콜 상태 · 마일스톤 · 짐 신고) | 아래 «단계마다 넷» |
| 2 | 4 · 5 (콜 양식 · 콜 필터) — 6 배차 요청은 3단계로(기기 모드 · 화면 종류 타입을 써서, 2단계에 옮기면 새 파일이 index 를 불러야 한다) | «단계마다 넷» |
| 3 | 6 · 7 · 8 · 9 (배차 요청 · 기기 모드 · 화면 종류 · 기기 세션) | «단계마다 넷» |
| 4 | 10 · 11 · 12 · 13 | «단계마다 넷» + index.ts 에 `export` 줄만 남음 + 기존 DB 사본 부팅 + `pnpm scenario` + 게이트 전부 → 71 에게 커밋 목록(71 이 drive e2e) |

**단계마다 넷** (그 단계 커밋 직전 한 번):
1. **잃은 줄 0** — HEAD index.ts 의 줄 묶음 = (지금 index.ts + 지금까지의 새 파일) 줄 묶음에서 새로 생긴 `import` · `export *` 줄만 뺀 것. 레포 밖 셈 스크립트로 센다.
2. **이름 같음** — `Object.keys(require('@onedal/shared')).sort()` 가 HEAD 와 같다(런타임 값) · HEAD index.ts 의 `export type|interface` 이름을 전부 `import type { … } from '@onedal/shared'` 하는 레포 밖 파일이 형 검사를 통과한다(타입).
3. **순환 0** — shared/src 의 런타임 가져오기(`import type` 뺌)로 그은 그래프에 고리가 없다(레포 밖 셈).
4. **게이트** — 서버 `npx tsc --noEmit` · 서버 `npx jest`(Test Suites 줄) · `pnpm test:web` · 관제웹 `npx tsc -b` · ops · logbook 형 검사(가6) · `pnpm lint:gate` · `audit:dead` · `audit:docs` · `audit:socket` · `tsx` 로 서버 부팅(순환은 tsc · jest 가 못 잡는다 — shared CLAUDE.md). 한 Bash 줄에서 차례로.
   - 못 잡는 것: 서버 tsc 는 shared 의 안 쓰는 들여오기(TS6133)를 못 잡는다 — 관제웹 · ops · logbook `tsc -b` 가 잡는다(2단계에서 실제로 잡힘) · 단계마다 셋 다.

## 5. 새 값 · DB 대조

새 설정값 · 새 저장 칸 · DB 변경 없음. 상수 값(`CANCEL_BUDGET_PER_ROUND = 10` · `SAFE_CANCEL_SEC_DEFAULT = 30` · `MOTION_HOLD_SEC_DEFAULT = 10` · `DEFAULT_DETOUR_RADIUS_KM = 5` …)은 글자 그대로 옮긴다 — DB 칸 `DEFAULT` 와의 관계도 그대로.

## 6. 기사님 하루에

| | 늘어남 · 줄어듦 |
|---|---|
| 좋은 콜 | 그대로 — 함수 몸통 · 상수 값 글자 그대로 · 원달앱이 받는 필터 JSON 그대로 |
| 노이즈 | 그대로 — 화면 · 알림 · 로그 그대로 |
| 기사님 손 | 그대로 — 화면 · 버튼 그대로 |

얻는 것은 구조뿐이다(2,271줄 한 파일 → 다시 내보내기만 하는 index + 주제별 13 파일). 이 셋 중 «그대로»가 아닌 줄이 생기면 그 줄은 빼고 기록만 한다.

## 7. 찾은 것 — 기록만 (고치지 않음 · 기사님께 안 올림)

- 원달앱 `SharedModels.kt:4` 주석이 «shared/src/index.ts 와 1:1» 이라 적는다 — 나눈 뒤에는 `orderShapes.ts`. 원달앱 파일이라 24 몫(나3).
- `getEffectiveDetourRadius`(index.ts 1219) 주석은 «호출부가 "경유 반경은 여기서만 정한다"는 계약을 지키고 있다»라 적는데 본 코드 호출부는 0(검사만 부름) — 주석과 코드가 다름 · 기록만.
- 나누기로 감사(audit:dead) 밖이던 이름 넷이 드러난다(입구 파일 index.ts 는 감사가 안 셈 · `audit-dead.mjs:155`): 검사만 부름 isSkipped · getEffectiveDetourRadius · ARRIVAL_REASONS · 아무도 안 부름 CAPTURED_VIA_LABEL — 71 «가»: 각 단계 커밋에서 TEST_ONLY_KEEP · KEEP 에 사유와 함께 · 지우지 않음.
- index.ts 안에 «하위 호환 · 폐기됨»이라 적힌 타입 둘(`PendingOrderPhase` 435-438 · `LoadState` 829-830)이 산다 — 부르는 곳이 있는지는 안 셌다. 이번 일은 옮기기만.

## 8. 기사님 몫 — 없음

운행 동작 · 화면 · 설정값 · 저장 칸 · 새 폴더 · 되돌릴 수 없는 일 없음. push 없음.
