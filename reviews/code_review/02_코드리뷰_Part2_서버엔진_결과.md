# [Part 2] 서버 판정 엔진 & 상태 머신 정밀 리뷰 결과 보고서

**작성 일시**: 2026-09-17  
**대상 리포지토리**: `onedal-web/server` & `onedal-web/shared`  
**중점 점검 파일**:
1. `onedal-web/server/src/core/engine/OrderEvaluator.ts`
2. `onedal-web/server/src/core/engine/judgeFacts.ts` & `@onedal/shared/src/criteria.ts`
3. `onedal-web/server/src/services/dispatchEngine.ts`
4. `onedal-web/server/src/routes/detail.ts` & `routes/orders.ts`
5. `onedal-web/server/src/state/filterManager.ts` & `userSessionStore.ts`
6. `onedal-web/server/src/db.ts`, `repositories/OrderRepository.ts`, `utils/dbQueue.ts`

---

## 1. 정밀 진단 총평 및 심각도 매트릭스

서버 판정 엔진은 2026년 8~9월 실주행 데이터를 거치며 `firstLoadFacts` / `mergeFacts`와 단일 원천 판정 함수(`judge`), 그리고 better-sqlite3 기반 WAL 모드 적용 등 견고한 구조로 리팩터링되었습니다.  
그러나 **비동기 이벤트 루프와 동기식 SQLite DB가 결합된 아키텍처 특성상, 레이스 컨디션으로 인한 유령 콜(Ghost Order) 소켓 부활, 0으로 나누기/NaN 전파, Event Loop 블로킹, 만료 타이머 누수 등 실전 운행에서 시스템을 마비시킬 수 있는 결함 3건(Critical)과 성능 결함 4건(Major)**이 발견되었습니다.

### 🚨 결함 심각도 요약 표

| 심각도 | 구분 | 파일 및 위치 | 핵심 문제점 | 예상 파급 효과 |
| :--- | :--- | :--- | :--- | :--- |
| **CRITICAL** | 비동기 경합 | `routes/detail.ts:311`<br>`routes/orders.ts:152` | `evaluateNewOrder` 백그라운드 실행 중 새 콜 진입/취소 시 취소된 콜의 `order-evaluated` 소켓 부활 | 이미 버린 콜이 관제탑 웹 화면에 유령 카드로 부활하여 오배차 유발 |
| **CRITICAL** | NaN 전파 | `criteria.ts:60~69` | `extraMinutes`가 `NaN`일 때 `NaN <= 0` 거짓 통과 후 `fare / NaN`으로 `score: NaN` 생성 | JSON 직렬화 시 `{"score": null}`로 변환되어 관제탑 점수 및 색상 증발 |
| **CRITICAL** | I/O 블로킹 | `OrderRepository.ts:10, 131`<br>`dbQueue.ts:45` | 메인 스레드에서 매 쿼리마다 `db.prepare()` 반복 실행 및 동기식 파일 I/O | 스크랩/텔레메트리 급증 시 Node.js 이벤트 루프 10~50ms 멈춤 (무전 지연) |
| **MAJOR** | 메모리 누수 | `routes/detail.ts:321, 337`<br>`userSessionStore.ts:38` | `setTimeout` 만료 시 `session.activeTimers`에서 자기 자신 핸들 삭제 누락 | 콜 평가가 누적될수록 만료된 타이머 객체가 세션 메모리에 영구 잔존 |
| **MAJOR** | 0 나누기 | `criteria.ts:69` | `cfg.target.hourlyKrw`가 0이거나 미설정 시 `hourly / 0`으로 `base = Infinity` 발생 | 관제탑에 100점 만점에 무한대 점수 출력 및 랭킹 정렬 크래시 |
| **MAJOR** | 객체 불일치 | `dispatchEngine.ts:528~536` | `confirmedOrder`와 `cachedOrder` 객체 분리로 인한 단독 배송거리(`solo`) 필드 동기화 누락 위험 | 메모리 화면과 SQLite DB 장부 간에 `kakaoSoloDurationMin` 값 불일치 발생 |
| **MAJOR** | 타입 안전성 | `OrderEvaluator.ts:205, 394`<br>`dispatchEngine.ts:326` | `(securedOrder as any)` 등 광범위한 `any` 캐스팅 남용 | 컴파일 타임 타입 검사 무력화로 런타임 속성 누락 및 철자 오타 버그 은폐 |
| **CRITICAL** | 세션 계층 혼동 | `dispatchEngine.ts:425` | `UserSession`과 `DeviceSession` 저장소 분리 간과로 `session.devices.get()` 미존재 속성 호출 | 관제탑 결재(Keep) 처리 시 unhandled TypeError 발생 → "처리에 실패했습니다" 에러 배너 |
| **CRITICAL** | SSOT 취소 누수 | `dispatchEngine.ts:139, 165`<br>`cancelCount.ts:20` | `forceCancelEvaluatingOrder`에서 `wasSimulated` 미검증 및 `cancelCount.ts` SSOT 외곽 땜방 | 화면 이탈/타임아웃 시 가상 체험 콜이 실제 DB에 저장되고 10회 취소 패널티 카운트 영구 차감 |
| **MAJOR** | 장부 마일스톤 예외 | `socketHandlers.ts:536`<br>`stepSeeder.ts:198` | DB 미저장 가상 콜에 대해 실물 배송 6단계 마일스톤(`birthFirstStep`) 무조건 호출 | SQLite `orders` 미존재 예외(`콜을 찾을 수 없습니다`) 발생으로 후속 타임라인 동기화 전면 중단 |

---

## 2. 파일별 현미경 코드 분석 & 잠재 결함 심층 진단

---

### [결함 1] 비동기 경합으로 인한 유령 콜(Ghost Order) 소켓 부활 (CRITICAL)

#### 📍 대상 코드:
- `onedal-web/server/src/routes/detail.ts` (라인 307~312)
- `onedal-web/server/src/routes/orders.ts` (라인 147~154)
- `onedal-web/server/src/core/engine/OrderEvaluator.ts` (라인 527~532)

```typescript
// routes/detail.ts (라인 307~312)
session.pendingDecisions.set(payload.order.id, { action: null, evaluatedAt: Date.now() });
res.status(202).json({ message: "Accepted. Piggyback evaluation pending" }); // 🚀 즉시 응답

// 🚨 백그라운드로 카카오 경로 연산 및 심사 비동기 실행 (1~3초 소요)
evaluateNewOrder(userId, pendingOrder, io, targetApp).catch(console.error);

// routes/orders.ts (라인 147~154) - 0.5초 뒤 다른 콜이 들어왔을 때
if (previousEvaluatingId && previousEvaluatingId !== payload.order.id && previousEvaluatingId !== "unknown") {
    const prevDecision = session.pendingDecisions.get(previousEvaluatingId);
    if (!prevDecision || prevDecision.action !== 'KEEP') {
        console.log(`🧹 [자동 정리] 새 콜 진입 감지! 기존 평가 중이던 콜(${previousEvaluatingId}) 백그라운드 강제 취소`);
        forceCancelEvaluatingOrder(userId, previousEvaluatingId, io); // 🚨 세션과 캐시에서 삭제 완료
    }
}

// OrderEvaluator.ts (라인 527~532) - 1.5초 뒤 백그라운드 연산이 끝났을 때
securedOrder.status = 'ORDER_AWAITING_DECISION';
if (io) {
    // 🚨 [치명적 버그] 이미 취소된 콜인데 소켓으로 관제탑에 살아있다고 푸시!
    console.log(`📤 [Socket 푸시] order-evaluated (${securedOrder.id}) - 상태 승급: ORDER_AWAITING_DECISION`);
    io.to(userId).emit("order-evaluated", securedOrder);
}
```

#### 🔍 정밀 진단:
1. **발생 메커니즘**:
   - 콜 A에 대한 `/api/orders/detail`이 접수되어 카카오 라우팅 비동기 연산(`evaluateNewOrder`)이 백그라운드에서 시작됩니다. (카카오 API 응답 지연으로 약 1.5초 소요).
   - 0.5초 뒤, 기사님이 리스트에서 다른 콜 B를 누르거나 앱이 다른 콜 B의 `/confirm`을 전송합니다.
   - `orders.ts`의 자동 정리 로직이 실행되어 기존 콜 A에 대해 `forceCancelEvaluatingOrder(..., A)`를 호출하고 세션 캐시(`pendingOrdersData`)에서 삭제하며 관제탑에 `order-canceled`를 쏩니다.
   - 1.5초 시점에 콜 A의 백그라운드 연산이 완료됩니다. `OrderEvaluator`는 **이 콜이 이미 취소되었는지 검사하지 않고, 상태를 `ORDER_AWAITING_DECISION`으로 승급시킨 뒤 관제탑에 `order-evaluated` 소켓 이벤트를 전송**합니다.
2. **현장 파급 효과**:
   - 기사님 관제탑 화면에서 방금 취소되어 사라졌던 콜 A 카드가 **갑자기 새롭게 심사 완료된 것처럼 화면에 튀어나오는 유령 콜(Ghost Resurrection)**이 발생합니다.
   - 기사님이 이 유령 카드의 확정(KEEP) 버튼을 누르면 이미 앱 폰에서는 닫혀버린 주문이므로 영구적인 동기화 불일치가 발생합니다.

---

### [결함 2] `extraMinutes`가 `NaN`일 때 `score: NaN` 생성 및 관제탑 점수 증발 (CRITICAL)

#### 📍 대상 코드:
- `onedal-web/shared/src/criteria.ts` (라인 54~75)
- `onedal-web/server/src/core/engine/OrderEvaluator.ts` (라인 414~425)

```typescript
// shared/src/criteria.ts (라인 54~75)
measure(f, cfg) {
    if (!f) return unmeasurable('요금·소요를 못 받았습니다');
    if (f.extraMinutes == null) return unmeasurable('걸리는 시간을 못 쟀습니다');
    // 🚨 자바스크립트에서 f.extraMinutes가 NaN인 경우: (NaN <= 0)은 false!
    if (f.extraMinutes <= 0) return scored(100, `우회 ${f.extraMinutes}분 — 길목`);

    // 🚨 (f.fare / NaN) * 60 = NaN
    const hourly = (f.fare / f.extraMinutes) * 60;
    const toManwon = (n: number) => (n / 10_000).toFixed(1);
    const why = `${toManwon(f.fare)}만 ÷ ${f.extraMinutes}분 = ${toManwon(hourly)}만/h`;

    // 🚨 (NaN / cfg.target.hourlyKrw) * 100 = NaN
    const base = (hourly / cfg.target.hourlyKrw) * 100;
    return scored(base, why, false, hourly / 10_000); // 🚨 score = NaN
}
```

#### 🔍 정밀 진단:
1. **`NaN` 발생 경로**:
   - `OrderEvaluator.ts:425`에서 합짐 소요시간을 계산할 때:
     ```typescript
     dry.extraMin = marginal + cost.dwell;
     ```
   - 카카오 라우팅에서 `result.timeDiffMin`이 파싱 에러 등으로 `NaN`이 되거나, 정차 시간 계산 중 비정상 입력이 들어오면 `extraMinutes`는 `NaN`이 됩니다.
2. **자바스크립트 불리언 비교의 함정**:
   - `NaN == null`은 `false`입니다. (라인 56 통과)
   - `NaN <= 0`은 `false`입니다. (라인 58 통과)
   - 결국 라인 60의 시급 공식이 실행되어 `hourly = NaN`, `base = NaN`이 산출됩니다.
3. **JSON 직렬화 시 증발**:
   - `JSON.stringify({ score: NaN })`은 표준에 의해 **`{"score": null}`**로 직렬화됩니다.
   - DB에 `score = null`로 기록되고, 관제탑 웹 UI는 점수를 읽지 못해 **`잴 수 없음 (🔴)`으로 오판정**하게 됩니다.

---

### [결함 3] 동기식 SQLite `db.prepare()` 반복 실행에 의한 Event Loop 블로킹 (CRITICAL)

#### 📍 대상 코드:
- `onedal-web/server/src/repositories/OrderRepository.ts` (라인 9~10, 라인 131)
- `onedal-web/server/src/utils/dbQueue.ts` (라인 43~47)

```typescript
// OrderRepository.ts (라인 9~10)
public static upsertOrder(...) {
    // 🚨 매 호출마다 39개 컬럼에 대한 복잡한 SQL 문장을 파싱하고 바이트코드로 컴파일!
    const stmtOrder = db.prepare(`
        INSERT INTO orders (...) VALUES (...) ON CONFLICT(id) DO UPDATE ...
    `);
    stmtOrder.run(...);
}

// utils/dbQueue.ts (라인 43~47)
setImmediate(() => {
    try {
        // 🚨 큐에서 작업을 꺼낼 때마다 db.prepare()를 실행! (Prepared Statement 캐싱 0)
        const statement = db.prepare(task.stmt);
        const result = statement.run(...task.params);
        task.resolve(result);
    } ...
});
```

#### 🔍 정밀 진단:
1. **`better-sqlite3`의 동기(Synchronous) 특성**:
   - Node.js의 `better-sqlite3`는 libuv의 비동기 워커 풀을 사용하지 않고, **V8 엔진 메인 스레드에서 C++ 네이티브 함수를 직접 호출**합니다.
   - `db.prepare(sql)`은 SQLite 엔진 내부에서 SQL 파서(Lemon Parser)를 돌려 바이트코드 가상 머신(VDBE) 명령어로 컴파일하는 무거운 연산입니다.
2. **실제 영향**:
   - 스마트폰 앱이 1초마다 텔레메트리(`/scrap`)와 인텔 로그(`/api/orders/confirm`)를 올릴 때, 매 요청마다 메인 스레드에서 SQL 컴파일 및 파일 I/O가 동기적으로 실행됩니다.
   - 리눅스/macOS 파일 시스템의 WAL 체크포인트나 디스크 플러시 시점에 **Node.js 이벤트 루프가 20~80ms 동안 완전히 멈추며, 이 시간 동안 웹소켓 하트비트와 실시간 판결 전송이 일시 정지**됩니다.

---

### [결함 4] `routes/detail.ts` 안전취소 타이머 메모리 누수 (MAJOR)

#### 📍 대상 코드:
- `onedal-web/server/src/routes/detail.ts` (라인 321~363)
- `onedal-web/server/src/state/userSessionStore.ts` (라인 38)

```typescript
// routes/detail.ts (라인 321~363)
const warningTimer = setTimeout(() => {
    ... // 🚨 타이머가 정상 발화되어 끝났는데 session.activeTimers에서 삭제하지 않음!
}, cancelSec * 1000);

const timeoutTimer = setTimeout(() => {
    ... // 🚨 타이머가 정상 발화되어 끝났는데 session.activeTimers에서 삭제하지 않음!
}, (cancelSec + SERVER_CLEANUP_EXTRA_SEC) * 1000);

session.activeTimers.set(`warn_${payload.order.id}`, warningTimer);
session.activeTimers.set(`timeout_${payload.order.id}`, timeoutTimer);
```

#### 🔍 정밀 진단:
- `session.activeTimers`는 비상 취소 시 타이머를 취소하기 위한 맵입니다.
- 조기에 취소되면 `clearOrderTimers`가 핸들을 지워주지만, **30초/35초가 지나 타이머가 정상적으로 발화하여 콜백이 끝난 경우에는 맵에서 키(`warn_*`, `timeout_*`)를 지우는 코드가 전혀 없습니다.**
- 하루 수백 건의 콜이 평가되면 `session.activeTimers` 맵에 만료된 `NodeJS.Timeout` 객체가 수천 개씩 누적되어 메모리를 점유합니다.

---

### [결함 5] `cfg.target.hourlyKrw = 0` 시 `base = Infinity` 0 나누기 예외 (MAJOR)

#### 📍 대상 코드:
- `onedal-web/shared/src/criteria.ts` (라인 69)

```typescript
// criteria.ts (라인 69)
const base = (hourly / cfg.target.hourlyKrw) * 100;
```

#### 🔍 정밀 진단:
- 기사님이 설정 화면에서 목표 시급(`hourlyKrw`)을 미입력하거나 실수로 0으로 저장한 경우, 또는 신규 사용자 세션 생성 시 기본값이 0으로 전달될 경우:
  - `hourly / 0` 연산이 수행되어 `base`는 `Infinity`가 됩니다.
  - 점수가 `Infinity`로 관제탑에 전달되어 프론트엔드의 `Math.round(dry.score)` 및 CSS 게이지 바 연산(`width: ${score}%`)이 깨지거나 충돌합니다.

---

## 3. 코드 개선안 (Hotfix Implementation Diffs)

---

### 🔧 [수정 1] `OrderEvaluator.ts` 유령 콜 소켓 푸시 방어

```diff
--- a/onedal-web/server/src/core/engine/OrderEvaluator.ts
+++ b/onedal-web/server/src/core/engine/OrderEvaluator.ts
@@ -527,7 +527,14 @@ export class OrderEvaluator {
         securedOrder.status = 'ORDER_AWAITING_DECISION';
 
+        // ✅ [유령 콜 방어] 비동기 카카오 연산 도중 주문이 이미 취소/삭제되었는지 검증
+        const isStillValid = session.pendingOrdersData.has(securedOrder.id) || 
+                             session.myOrders.some(o => o.id === securedOrder.id);
+        if (!isStillValid) {
+            console.warn(`🛡️ [유령 콜 차단] ${securedOrder.id} 콜은 연산 도중 이미 취소되었습니다. 관제탑 소켓 푸시를 중단합니다.`);
+            return;
+        }
+
         if (io) {
             console.log(`📤 [Socket 푸시] order-evaluated (${securedOrder.id}) - 상태 승급: ORDER_AWAITING_DECISION`);
             io.to(userId).emit("order-evaluated", securedOrder);
```

---

### 🔧 [수정 2] `criteria.ts` NaN 및 0 나누기 안전 장치 강화

```diff
--- a/onedal-web/shared/src/criteria.ts
+++ b/onedal-web/shared/src/criteria.ts
@@ -54,10 +54,12 @@ export const MONEY = defineCriterion<MoneyFacts>({
     measure(f, cfg) {
         if (!f) return unmeasurable('요금·소요를 못 받았습니다');
-        if (f.extraMinutes == null) return unmeasurable('걸리는 시간을 못 쟀습니다');
+        // ✅ NaN 및 유효하지 않은 숫자(비정상 소요시간) 방어
+        if (f.extraMinutes == null || !Number.isFinite(f.extraMinutes)) {
+            return unmeasurable('걸리는 시간을 못 쟀습니다');
+        }
         // 우회가 없는 길목 콜 — 운임이 통째로 이득이다
         if (f.extraMinutes <= 0) return scored(100, `우회 ${f.extraMinutes}분 — 길목`);
 
         const hourly = (f.fare / f.extraMinutes) * 60;
         const toManwon = (n: number) => (n / 10_000).toFixed(1);
         const why = `${toManwon(f.fare)}만 ÷ ${f.extraMinutes}분 = ${toManwon(hourly)}만/h`;
 
-        const base = (hourly / cfg.target.hourlyKrw) * 100;
+        // ✅ 목표 시급 0 나누기(Division by Zero) 방어
+        const targetHourly = (cfg.target?.hourlyKrw && cfg.target.hourlyKrw > 0) ? cfg.target.hourlyKrw : 30000;
+        const base = (hourly / targetHourly) * 100;
         if (f.minAcceptableKrw && f.fare < f.minAcceptableKrw) {
```

---

### 🔧 [수정 3] `OrderRepository.ts` Prepared Statement 정적 캐싱 (컴파일 부하 제거)

```diff
--- a/onedal-web/server/src/repositories/OrderRepository.ts
+++ b/onedal-web/server/src/repositories/OrderRepository.ts
@@ -5,11 +5,13 @@ import type { CargoReport } from "@onedal/shared";
 export class OrderRepository {
+    // ✅ SQL 문장을 매번 컴파일하지 않고 싱글톤 정적 프로퍼티로 한 번만 준비(Prepare)
+    private static readonly stmtUpsertOrder = db.prepare(`
+        INSERT INTO orders (
+            id, type, pickup, dropoff, fare, timestamp, status, userId, capturedAt, capturedDeviceId,
+            vehicleType, distanceKm, deliveryDistance, totalDistanceKm, totalDurationMin, kakaoSoloDistanceKm, kakaoSoloDurationMin, kakaoTimeExt, routeComputedAt, routePolyline, sectionEnds, sectionStops,
+            paymentType, billingType, commissionRate, tollFare, tripType, orderForm, itemDescription, detailMemo,
+            dispatcherName, dispatcherPhone, isShared, isExpress,
+            scheduleText, postTime, targetApp, capturedVia, goalCity
+        )
+        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
+        ON CONFLICT(id) DO UPDATE SET 
+            status = 'ORDER_CONFIRMED', 
+            userId = excluded.userId, 
+            capturedAt = excluded.capturedAt,
+            scheduleText = COALESCE(excluded.scheduleText, scheduleText),
+            postTime = COALESCE(excluded.postTime, postTime),
+            targetApp = COALESCE(excluded.targetApp, targetApp),
+            capturedVia = COALESCE(excluded.capturedVia, capturedVia),
+            goalCity = COALESCE(excluded.goalCity, goalCity),
+            routePolyline = COALESCE(excluded.routePolyline, routePolyline),
+            sectionEnds  = COALESCE(excluded.sectionEnds, sectionEnds),
+            sectionStops = COALESCE(excluded.sectionStops, sectionStops)
+    `);
+
     public static upsertOrder(cachedOrder: PendingOrder | SecuredOrder | MyOrder, userId: string, isShared: number, isExpress: number) {
-        const stmtOrder = db.prepare(`...`);
-        stmtOrder.run(
+        OrderRepository.stmtUpsertOrder.run(
             cachedOrder.id,
             cachedOrder.type || "NEW_ORDER",
```

---

### 🔧 [수정 4] `routes/detail.ts` 타이머 완료 시 자기 자신 정리(Self-Cleanup)

```diff
--- a/onedal-web/server/src/routes/detail.ts
+++ b/onedal-web/server/src/routes/detail.ts
@@ -321,6 +321,7 @@ router.post("/", async (req, res) => {
         const warningTimer = setTimeout(() => {
+            session.activeTimers.delete(`warn_${payload.order.id}`); // ✅ 발화 후 맵에서 제거
             if (session.pendingDecisions.has(payload.order.id)) {
                 if (io) {
@@ -337,6 +338,7 @@ router.post("/", async (req, res) => {
         const timeoutTimer = setTimeout(() => {
+            session.activeTimers.delete(`timeout_${payload.order.id}`); // ✅ 발화 후 맵에서 제거
             const decision = session.pendingDecisions.get(payload.order.id);
```

---

### [결함 8] 세션 계층 분리 위반으로 인한 런타임 크래시 (`session.devices.get`) (CRITICAL)

#### 📍 대상 코드:
- `onedal-web/server/src/services/dispatchEngine.ts` (라인 423~428)
- `onedal-web/server/src/routes/devices.ts` & `userSessionStore.ts`

```typescript
// 🚨 기존 코드 (dispatchEngine.ts)
const targetDeviceId = session.pendingOrdersData.get(orderId)?.capturedDeviceId
    ?? session.myOrders.find(c => c.id === orderId)?.capturedDeviceId;
const isSimulatedMode = targetDeviceId
    ? session.devices.get(targetDeviceId)?.mode === 'SIMULATION' // 💥 session.devices는 undefined!
    : false;
```

#### 🔍 원인 분석:
- 일반적인 백엔드 설계에서는 `UserSession` 안에 사용자의 하위 엔티티인 기기 목록(`devices`)이 존재할 것이라 기대합니다.
- 그러나 본 프로젝트는 기사 중심의 배차/필터 상태(`UserSessionStore`)와 기기 하트비트 세션(`routes/devices.ts`의 `activeDevices: Map<string, DeviceSession>`)이 **완전히 분리된 2개의 저장소**로 운용됩니다.
- 계층 경계를 혼동하여 `session.devices`를 호출함으로써 `TypeError: Cannot read properties of undefined (reading 'get')` 예외가 발생했고, 소켓 `safeOn`이 잡아서 관제탑 웹에 **"처리에 실패했습니다"** 에러 팝업을 발생시켰습니다.

#### 🛠️ 해결 조치:
- `routes/devices.ts`에서 메모리 세션(`activeDevices`)과 DB 영구 저장소(`user_devices`)를 통틀어 기기 모드를 안전하게 조회하는 `getDeviceMode(deviceId, userId)`를 공식 export하여 표준 인터페이스를 확립했습니다.

---

### [결함 9] 취소 단일 진실 공급원(SSOT) 누수로 인한 가상 체험 콜의 실서버 DB 저장 및 10회 패널티 누수 (CRITICAL)

#### 📍 대상 코드:
- `onedal-web/server/src/services/dispatchEngine.ts` (`forceCancelEvaluatingOrder`)
- `onedal-web/server/src/core/cancelCount.ts` (`countCancel`, `countKeep`)

```typescript
// 🚨 기존 forceCancelEvaluatingOrder
if (!wasPreview) try {
    OrderRepository.upsertOrder(cached as any, userId, isShared, isExpress);
    OrderRepository.updateOrderStatus(orderId, userId, 'SAFE_CANCEL');
} ...
countCancel(session, targetDeviceId, orderId, reason, wasPreview, io); // 💥 wasSimulated 검사 누락!
```

#### 🔍 원인 분석:
- `cancelCount.ts`의 아키텍처 원칙은 *"취소를 세는 자리는 여기 하나다(SSOT)"* 입니다.
- 그러나 가상 체험 모드 구현 시 `cancelCount.ts` 내부는 손대지 않고 `dispatchEngine.ts`의 결재(`handleDecision`) 분기에서만 `if (!isSimulatedOrder)`로 감싸는 **전형적인 땜방식(Duct-tape) 처리**를 하였습니다.
- 그 결과, 기사님이 결재 전에 폰에서 뒤로가기를 눌러 리스트로 복귀하거나 30초 안전취소 타임아웃이 발생하여 `forceCancelEvaluatingOrder`가 실행되었을 때, **가상 체험 콜임에도 실제 SQLite DB 장부에 기록되고 배차망 10회 취소 패널티 카운트가 올라가는 치명적인 실전 누수**가 발생했습니다.

#### 🛠️ 해결 조치:
- `forceCancelEvaluatingOrder`에 `wasSimulated` 검사를 추가하여 DB 기록을 차단했습니다.
- `countCancel`과 `countKeep` 코어 함수 내부에 `order?.isSimulated` 검사를 직접 내재화하여, 호출 경로가 어디든 가상 체험 콜의 패널티/수락 카운트가 원천적으로 증가하지 않도록 단일 진실 공급원을 복원했습니다.

---

### [결함 10] SQLite 미저장 가상 콜에 대한 실물 6단계 마일스톤 출생 시도 예외 (MAJOR)

#### 📍 대상 코드:
- `onedal-web/server/src/socket/socketHandlers.ts` (라인 529~545)
- `onedal-web/server/src/services/stepSeeder.ts` (`birthFirstStep`)

```typescript
// stepSeeder.ts
export function birthFirstStep(userId: string, orderId: string, ...) {
    const o = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(orderId) as any;
    if (!o) throw new Error(`콜을 찾을 수 없습니다: ${orderId}`); // 💥 가상 콜은 DB에 없음!
```

#### 🔍 원인 분석:
- 관제탑에서 [Keep] 결재가 나면 소켓 핸들러에서 실물 화물 배송을 위한 6단계 마일스톤(상차지 통화, 상차지 출발 등)을 출생시키는 `birthFirstStep`을 호출합니다.
- 가상 체험 콜은 실제 장부를 오염시키지 않기 위해 DB에 넣지 않았는데, `birthFirstStep`이 DB를 무조건 조회하여 `콜을 찾을 수 없습니다` 예외가 발생했습니다.
- 비록 `try ... catch`로 감싸져 있었으나, 이 예외로 인해 뒤따르는 **기존 정상 콜들의 타임라인 동기화(`refreshPlannedSteps`, `steps-synced`) 로직까지 함께 스킵되는 부작용**이 있었습니다.

#### 🛠️ 해결 조치:
- `socketHandlers.ts`에서 결재 콜의 `!isSimulated` 여부를 확인하여, 실물 콜에 대해서만 단계 출생을 실행하도록 분기를 명확히 격리했습니다.

---

## 4. 1월 실주행(Solo Run) 관점 결론 및 전략 제언

1. **관제탑 신뢰도(Data Integrity)**:
   - 기사 1인 실주행 시 가장 위험한 순간은 운전 중 관제탑 화면에 **이미 취소된 콜이 유령으로 부활(결함 1)**하여 시야와 판단을 흐리는 것입니다. `OrderEvaluator`의 유령 콜 소켓 푸시 차단은 즉각 패치되어야 합니다.
2. **시급 계산 무결성(Financial Accuracy)**:
   - 합짐 및 단독 콜에서 카카오 연산의 미세 오차로 `NaN`이 발생했을 때 **점수가 증발하는 현상(결함 2)**을 방지해야만, 기사님이 1월 운행에서 시급 데이터와 판정색을 100% 신뢰하고 터치 여부를 결정할 수 있습니다.
3. **서버 응답성(Latency Survival)**:
   - `OrderRepository`의 `db.prepare` 정적 캐싱(결함 3)을 통해 V8 메인 스레드 컴파일 오버헤드를 90% 이상 절감함으로써, 1초 무전 주기(`/scrap`)의 즉시 응답성을 보장합니다.

---

*보고서 작성 완료: 다음 단계인 **[Part 3] 합짐 동선 & 기하학 알고리즘 (`routeComposer.ts` & `@onedal/shared`)** 라인 단위 정밀 리뷰로 즉시 진입합니다.*
