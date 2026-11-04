# shared/src 정리 계획 (초안 — 기사님 승인 전)

기사님 말씀: «한폴더씩 옮기고 테스트도 진행하자» · «불필요한파일과 중복인파일도 구분하면 좋겠다» · «쓰지는 않지만 잘 정리된 부분이 있다면 옮겨 두고 나중에 적용가능하도록 수정할수있게 투두리스트도 하나 만들자».

옮기기만 한다. 코드의 동작 · 이름은 바꾸지 않는다. 폴더마다 다음 커밋에서 파일 머리에 6하원칙(누가 · 언제 · 어디서 · 무엇을 · 어떻게 · 왜)을 적는다. 표 페이지 주소는 `/shared/폴더/파일` 이다. 할 일은 `shared_할일.md` 에 모은다.

## 1. 이 수정이 기사님 하루에 무엇을 하나

| | 영향 |
|---|---|
| 좋은 콜 | 그대로 |
| 노이즈 | 그대로 |
| 기사님 손 | 그대로 |

얻는 것은 파일을 찾기 쉬워지는 것이다. 틀리면 서버 · 관제웹이 안 뜨거나 검사가 깨지므로 폴더마다 게이트로 막는다.

## 2. 지금은 이렇게 돈다

- `shared/src` 한 폴더에 `.ts` 128개(검사 48개 포함) · 문제지 JSON 셋 · `theme.css` · 표 페이지 폴더가 있다.
- 바깥은 대개 `@onedal/shared`(`index.ts` 묶음)로 가져온다. 묶음 파일이 다시 내보내는 경로만 고치면 되는 곳이 많다.
- 경로를 글자로 적은 곳이 많다: 레포 전체 약 100개 파일 · 230~290줄(세는 범위에 따라 다르다 · 착수 때 폴더마다 다시 센다). 문서가 가장 많고, 그다음이 서버 검사 · 원달앱 검사 · 스크립트 · 시뮬레이터다.
- 글자로 안 잡히는 자리도 있다: `join(__dirname, '../../../shared/src', …)` 꼴 · 폴더 깊이가 바뀌는 `__dirname` 상대 경로 · `gen-pages.mjs` 의 한 층 `readdirSync`.
- `tsconfig` · vite alias · jest 설정은 `@onedal/shared` 한 곳이라 안 바뀐다.
- `gen-pages.mjs` 와 원달앱 검사(`NetworkPagesPairTest` 등)는 정의 표 파일을 경로로 읽는다.
- `orderStatuses.ts` · `paymentTypes.ts` · `targetApps.ts` · `deviceOffline.ts` 는 순환 참조를 막으려고 **일부러 떼어 둔 파일**이다. 중복이 아니다.

## 3. 폴더 나누기 (안)

| 폴더 | 파일 | 수 |
|---|---|---|
| `common/` | format · jsonArray · mask · logTags | 4 |
| `ops/` | ops · join · releases · flowViews · anomalyKinds | 5 |
| `map/` | mapTile · naviLink · sectionLine · routeReuse · callBands · roadsYeoju | 6 |
| `device/` | allowance · bleProtocol · deviceLink · deviceModes · deviceOffline · deviceSession · modeTable | 7 |
| `cargo/` | cargoHints · cargoReport · cargoSpec · cargoTags · cargoUnits · vehicles | 6 |
| `judge/` | judge · judgment · criteria · verdict · pricing · fuelCost · dryRun · stopImpact | 8 |
| `filter/` | dispatchFilter · filterArea · filterTally · phases · pickupList · regionMatch · adminDongMatch · adminDongs · dongCentroids · sigungu · callNet · trappedRegions · regionMatchCases.json | 13 |
| `time/` | timing · waitTimes | 2 |
| `call/` | orderShapes · orderStatuses · callStatus · callDeck · callSteps · callOptions · callTargetDay · dispatchApi · orderSync · milestones · stepRecords · stepTables · arrivalReasons · paymentTypes · replies · openBlocked · call-fields.table · call-status.table | 18 |
| `network/` | networkPages(공통 + 넷) · pageFields · pageRead · screenKinds · screenLabels · collectList · targetApps · screenCases.json · pageReadCases.json | 13 |
| `preview/` | 표 페이지 | — |

- `theme.css` 는 옮기지 않는다. CSS 경로로 셋이 가져오고 옮겨서 얻는 것이 없다.
- 표 파일 둘은 지금 아무 코드도 안 읽는다. `call/` 로 옮기되 할 일에 적는다.
- `index.ts` 는 맨 위에 남는다. 🔴 **폴더마다 묶음 파일을 만들지 않는다** — 폴더끼리 서로 부르는 고리가 있어, 묶음으로 부르면 서버가 안 뜬다. 파일끼리 직접 가져온다.
- 검사 파일은 대상 파일과 같은 폴더로 간다. 짝 없는 검사는 가져오는 파일을 따라간다: autoRadius · filterValueRows · reservedPickupRadius · destProgress · placeSido · filterFacts · nearGoalPickup → filter / deviceLabel → device / geocodeTarget · pagesDoc → network / isTimeText → time / naviLink.https → map / peakLoad → cargo / quickFold → judge. `index` 만 가져오는 appFilterRows · deviceQuiet · deviceStage · kakaoNaviLink · orderStatusLabel · phoneLinkBadge · index 는 맨 위에 둔다.

## 4. 순위 검산 — 어떻게 옮기나

| | 가. 한 폴더씩 (기사님 말씀) | 나. 한 번에 |
|---|---|---|
| 깨졌을 때 | 그 폴더만 보면 된다 · 되돌리기 쉽다 | 어디서 깨졌는지 찾기 어렵다 |
| 커밋 | 폴더마다 하나 | 하나 |
| 다른 일과 겹침 | 중간에 멈출 수 있다 | 끝날 때까지 다른 일을 못 한다 |
| 판정 | **가** | — |

## 5. 단계와 끝 조건

차례는 작고 덜 맞물린 것부터다: common → ops → map → device → cargo → judge → time → filter → call → network.

| 단계 | 하는 일 | 무엇이 참이면 끝인가 |
|---|---|---|
| 0 | 표 페이지 · 표 파일 · `vite.config.ts` 를 커밋한다(옮기기 전에 깨끗이) · 옮기는 도구를 만든다(폴더 표 → 상대 경로 다시 계산 · JSON · `?raw` · `import()` 포함) | 작업 트리가 깨끗하다 |
| 폴더마다 | 그 폴더를 쥔 세션이 없는지 세션마다 확인한다 · `git mv` · 가져오기 · 경로 글자 · 문서 경로를 **같은 커밋**에 · `read` 문처럼 고정 경로를 고친다 · 6하원칙은 다음 커밋 | 서버 tsc · 관제웹 tsc -b · 운영센터 · 운행일지 빌드 · jest(Test Suites 줄까지) · test:web · audit:dead · lint:gate · audit:docs · **tsx 로 기존 DB 사본 서버 부팅** · **관제웹 개발 서버 부팅** · 옮긴 파일의 옛 경로 grep 0 건 |
| 앱이 읽는 폴더 (common · device · filter · call · network) | 위 + gradle `:app:testDebugUnitTest` | 초록 |
| network | 위 + `pnpm gen:pages` · `gen:pages doc --check` · `gen-pages.mjs` 폴더 경로 · onedal-sim vitest | 생성 파일은 머리 주석의 경로 한 줄만 바뀐다 |
| 끝 | `shared/CLAUDE.md` 고침 · 표 페이지 확인 | 옛 경로 grep 0 건 |

**못 잡는 것:** 게이트는 실제 폰 동작을 안 본다. 옮기기만 하므로 폰 시험은 network 단계 뒤 한 번 한다. 실서버 배포는 기사님 말씀 뒤다.

## 6. 지금 DB 값 대조

DB 값 · 칸을 바꾸지 않는다.

## 7. 구분 (코드로 센 값 · 파일 안을 다 읽은 것은 아니다)

### 불필요 후보
| 파일 | 근거 | 처리 |
|---|---|---|
| `shared/src/local.db` | 0바이트 · git 무시 · 누가 shared 폴더에서 서버를 띄운 흔적으로 보임 · 읽는 곳 없음 | 지우기는 기사님 말씀 뒤 |

### 일부만 안 쓰는 파일 — `shared_할일.md`
파일 전체가 안 쓰이는 경우는 표 파일 둘을 빼면 찾지 못했다. 안 쓰는 내보내기가 많은 파일을 옮겨 두고 할 일로 적는다. 숫자는 «이 파일 밖에서 이름이 안 보이는 내보내기»로, 파일 안에서 쓰는 것과 타입도 포함한다.

### 중복이 아닌 것
`orderStatuses` · `paymentTypes` · `targetApps` · `deviceOffline` 은 잎 파일이다. 폴더로 옮겨도 `index` 를 값으로 가져오지 않으면 안전하다.

### 중복 후보
| 무엇 | 어디 | 처리 |
|---|---|---|
| 콜 상태 값 | `callStatus.ts` ↔ `call-status.table.ts` | 할 일 |
| 화면 칸 → 콜 칸 | `pageRead.ts` DETAIL_RECORD ↔ `call-fields.table.ts` | 할 일 |
| 단가 표 | `pricing.ts`(7개) ↔ 서버 `db.ts` · `settings.ts`(12개) | 할 일 |
| 차종 글자 맞추기 | `vehicles.ts` 별칭 · 세 표 ↔ 정의 표 낱말 ↔ 앱 코드 | 차종 계획 |

## 8. 정한 것

기사님 1가 2가 3가 4가 5가: 폴더 나누기 그대로 · `local.db` 지움 · 열 폴더 모두 먼저 · 주소 `/shared/폴더/파일` · 6하원칙은 폴더를 옮기며 함께 쓰고 커밋은 나눈다.
