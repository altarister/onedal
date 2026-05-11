# ⚠️ 1DAL 백엔드 엣지 케이스 및 예외 복구 시나리오

> **문서 상태**: v3.0 (코드 동기화)  
> **목적**: DB 락, 좀비 세션, 고스트 터치 방어 로직 명세.

---

## 1. 고스트 응답 방어 (Ghost Defense)

**상황**: 관제사 CANCEL 직후 앱이 새 콜을 열어서 이전 CANCEL을 오인.

**해결**: Piggyback 응답에 반드시 `orderId` 동봉. 앱이 ID 대조 후 불일치 시 폐기.

> 코드: [scrap.ts L128-134](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/scrap.ts#L128-L134)

---

## 2. SQLite Database Lock

**상황**: 초당 수십 번 `/api/scrap` 동시 DB 쓰기 시 `SQLITE_BUSY`.

**해결**: WAL 모드 + 비동기 Write Queue(`dbQueue`) + Repository UPSERT 패턴.

> 코드: [dbQueue.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/utils/dbQueue.ts), [OrderRepository.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/repositories/OrderRepository.ts)

---

## 3. 좀비 세션 방어

**상황**: 앱 강제 종료로 하트비트 중단, 서버 메모리에 찌꺼기 잔존.

**해결**: `touchDeviceSession()`이 `lastSeenMs` 갱신. 관제탑 UI가 1초마다 오프라인 판정.

> 코드: [devices.ts `touchDeviceSession()`](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/devices.ts)

---

## 4. 데스밸리 (30초 타임아웃)

**상황**: 관제사 판정이 30초 내 미도달 → 인성앱 자동 취소.

| 타이머 | 시간 | 동작 |
|--------|------|------|
| `WAITING_WARNING_MS` | 30초 | `deathvalley-warning` emit |
| `WAITING_TIMEOUT_MS` | 35초 | 미결재 시 `order-canceled` + 정리 |

KEEP 결재 완료 콜은 타임아웃되어도 절대 취소 안 함.

> 상수: [dispatchConfig.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/config/dispatchConfig.ts), 코드: [detail.ts L145-191](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts#L145-L191)

---

## 5. Piggyback ACK 순환

1. 서버 → 앱: `/api/scrap` 응답에 `decision` 탑재
2. 앱 → 서버: 다음 `/api/scrap`에서 `ackDecisionId`로 수신 확인
3. 서버: ACK 받으면 `pendingDecisions` 큐 삭제 + 타이머 정리

> 코드: [scrap.ts L100-118](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/scrap.ts#L100-L118)

---

## 6. 수동 배차(Manual Dispatch) Desync 3단계 방어 (Task 16)

**상황**: 관제탑(웹)과 기사(앱) 양쪽에서 동시에 수동으로 콜을 취소하거나 확정할 때 발생하는 상태 충돌 및 UI 꼬임 현상.

**해결 (3단계 방어)**:
1. **서버 진입점 검증**: `routes/confirm.ts`에서 결재 요청 시, 현재 세션에 해당 오더가 존재하는지 1차로 확인하여 이미 확정/취소된 과거 오더에 대한 뒤늦은 결재를 차단.
2. **Piggyback 무시**: 앱에서 관제사의 결재(Piggyback)를 수신하기 전에 기사가 수동으로 화면을 닫거나 확정 버튼을 누른 경우, 앱의 수동 조작을 우선시하고 뒤늦게 도착한 서버의 상태 전이 명령을 무시.
3. **상태 강제 동기화 (Force Sync)**: 양쪽 상태가 완전히 꼬였을 경우, 다음 1.0초 주기 `/api/scrap` 하트비트 시 서버가 가진 `myOrders` 리스트를 기준으로 앱의 화면 상태를 강제 초기화(Sync)합니다.
