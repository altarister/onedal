# shared 할 일

`shared/src` 를 옮기며 찾은 것을 모은다. 지금 코드는 바꾸지 않는다. 고칠 때 파일 안을 읽고 하나씩 정한다.

## 콜 기준을 코드와 잇기

- [ ] `call-status.table.ts` 와 `callStatus.ts` 를 잇는다 — 이름 · 차례가 어긋나면 검사가 문다(지금 안전취소 · 방출(기사님) 차례가 다르다).
- [ ] `call-fields.table.ts` 와 `pageRead.ts` DETAIL_RECORD 를 한 벌로 한다.
- [ ] 표의 칸 이름이 `orderShapes.ts` · `db.ts` 에 있는지 검사한다.
- [ ] 픽커 견본 글을 실물 상세 글로 바꾼다.
- [ ] 콜 상태 값의 원천을 정한다(`callStatus.ts` 또는 표) — 둘 다 원천이면 두 벌로 남는다. `callStatus.ts` 안의 차례도 세 가지다(타입 · 목록 · 이름표).
- [ ] `index` 를 안 가져오는 잎 파일 넷을 검사로 묶을지 정한다.
- [ ] `server/tests/rules/autoRadius.test.ts` 주석이 없는 파일(`shared/src/filter/autoRadius.test.ts`)을 가리킨다.

## 안 쓰는 파일

- [ ] `map/roadsYeoju.ts` — 값 `YEOJU_ROADS` 를 부르는 코드가 없다(죽은 코드 검사의 예외 목록에만 있다). 카카오 길찾기 실측 자료라 옮겨 두었다. 쓸지 지울지 정한다.

## 안 쓰는 내보내기

«파일 밖에서 이름이 안 보이는 것»이다. 파일 안에서 쓰는 것이 있고, 배열이 타입의 원천이면 남긴다. 지우기 전에 확인한다.

| 파일 | 이름 |
|---|---|
| `callNet.ts` | RouteStop, GoalVerdict, GoalsVerdict, NetPass |
| `cargoReport.ts` | CargoSize, CARGO_SIZE_POINTS, CargoReportKind |
| `cargoSpec.ts` | CARGO_SOURCES, CargoSource, SourcedCargo, CargoRecord, CargoDerived, CargoMismatch |
| `deviceOffline.ts` | DEVICE_OFFLINE_REASONS_APP, DEVICE_OFFLINE_REASONS_SERVER, DEVICE_OFFLINE_REASONS |
| `dispatchApi.ts` | DetourRouteData, EdgeDeviceTelemetry, WhoConfirmed, TimeoutAction, DispatchConfirmResponse |
| `dispatchFilter.ts` | DriverAction, DispatchPhase, LoadState |
| `naviLink.ts` | NaviPoint, KAKAO_NAVI_MAX_VIA, KakaoNaviLinkInput |
| `networkPages.ts` | NetworkFieldSpec, Presence, NetworkVehicleWord |
| `orderShapes.ts` | EVENT_TYPES, EventType, QuickFoldFields, SettlementInfo |
| `replies.ts` | FlowSum, FlowsViewerCell, FlowsAdminCell |
| `screenLabels.ts` | ScreenLabel, INSUNG_SCREEN_LABELS, HWAMUL24_SCREEN_LABELS, DeviceScreenBadge |
| `stepTables.ts` | STEP_STATUSES, StepStatus, ColumnDef, StepTable |
| `timing.ts` | ArrivalSlot, dropoffDeadlineFromPickup, TimingOrderFields, DeadlineRules, StopTimeView, RouteBufferMin |

## 검사에서만 쓰는 내보내기가 많은 파일

검사만 부르는 함수는 본 코드가 안 쓴다는 뜻이다. 쓸 자리가 있는지, 남길지 본다.

| 파일 | 이름 (앞 여섯) |
|---|---|
| `bleProtocol.ts` | BLE_UUIDS, BLE_MAX_WRITE, BLE_BREATH_MS, BLE_SILENT_MS |
| `callNet.ts` | judgeTwoStage, orderStopsGreedy, quadTesterOf |
| `criteria.ts` | MONEY, LABOR, DRIVE, PromiseFacts, PROMISE, SpaceFacts |
| `timing.ts` | DWELL_UNKNOWN_PICKUP_MINUTES, DWELL_UNKNOWN_DROPOFF_MINUTES, buildArrivalSlots, computeSlackMinutes, allowedDetourMinutes, describeSlack |
| `waitTimes.ts` | SAFE_CANCEL_SEC_DEFAULT, PICKER_ALARM_DETAIL_SEC_DEFAULT, ISFLEX_ALARM_DETAIL_SEC_DEFAULT |

## 콜 칸 표에 칸이 없는 값

정의 표에는 읽는 자리가 있지만 콜 칸 표에 바로 맞는 칸을 이번에 확정하지 못한 값이다. 칸을 새로 만들지는 기사님과 합의한 뒤 정한다.

- 약속 · 마감 시각: 픽커 상세 «○까지 픽업» · «○까지 배송» · 인성플랙스 도착지 앞 마감 앞글자 · 화물24시 하차 배지 앞 시각(뜻 확인 전) · 인성 도착지 칸 앞글자(지금 버림).
- 운행 단계: 픽커 내 오더 줄 머리 · 운행 시트 머리.

## 콜 칸 표를 만들며 찾은 것 (고치지 않음)

- **화물24시 적요가 관제웹까지 안 가는 것으로 읽힌다.** 원달앱은 화물 글을 뽑지만 로그와 예약 계산에만 쓰고 콜에 싣지 않는다(`Hwamul24Parser.kt:212-265`). 서버도 화물정보 칸을 제외어 찾기에만 쓴다. 코드로 읽은 것이고 돌려 보지 않았다.
- **조합 규칙이 코드 여러 곳에 흩어져 있다.** 칸을 잘라 읽는 법은 정의 표에 있지만 «무엇을 조합해 적요로 넣나»는 `pageRead.ts` 와 배차망 파서에 있다.
