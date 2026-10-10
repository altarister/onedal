# 1DAL 코드레벨 정밀 리뷰 결과 보고서 (Part 3)
## [합짐 동선 & 기하학 알고리즘 엔진] — 1인 트럭커 실전 생존 및 수익 극대화 관점

> **검토 일시**: 2026-09-17  
> **검토 대상**: 
> - `onedal-web/server/src/services/routeComposer.ts` (합짐 경유지 스마트 정렬 & Base/Merged TSP 연산)
> - `onedal-web/server/src/services/kakaoService.ts` (카카오 다중 경유지 API 통신 및 Base 캐시)
> - `onedal-web/server/src/utils/routeOptimizer.ts` (경유지 정렬 유틸)
> - `onedal-web/shared/src/timing.ts` (150% 타임라인 사다리, 출발 카운트다운, 버퍼 여유)
> - `onedal-web/shared/src/callNet.ts` (동선 사각형 그물망, 각도 및 법정동 지오메트리)
> 
> **검토 기준**: 기사 단독 1인 트럭 실전 운행 (1월 중순 ~ 4월 무사고·계정 생존·수익 극대화)

---

## Executive Summary (총평)

Part 3의 합짐 동선 및 기하학 엔진은 **"적은 주행거리와 시간으로 여러 콜을 묶어 최단 동선으로 최대의 매출을 낸다"**는 1DAL 프로젝트의 핵심 두뇌입니다. 기사님의 실제 주행 피드백(2026-08~09월 실측 데이터)이 코드 곳곳에 주석과 휴리스틱 규칙으로 매우 섬세하게 반영되어 있습니다.

그러나 **경도/위도(X/Y) 좌표 인자 뒤바뀜으로 인한 기하 연산 왜곡**, **배열 0건 시의 Null Pointer Exception**, **타임라인의 NaN 시간 전파로 인한 대시보드 화면 백화(White Screen of Death)** 등, 도로 위에서 기사의 안전과 배차 연속성을 치명적으로 위협하는 크리티컬 결함들이 식별되었습니다.

| 번호 | 심각도 | 위치 | 핵심 이슈 요약 |
| :--- | :---: | :--- | :--- |
| **C-1** | 🔴 **CRITICAL** | `routeComposer.ts:376, 379` | `haversineKm` 경도/위도(X, Y) 인자 반대 주입 → 북극점 초과 가상좌표로 인한 Base 캐시 왜곡 |
| **C-2** | 🔴 **CRITICAL** | `routeComposer.ts:422` | `calls.length === 0`일 때 `plan.origin` Null 참조로 서버 크래시 발생 |
| **M-1** | 🟠 **MAJOR** | `timing.ts:1242` & `pickBindingDeparture` | 비정상 날짜 파싱 시 `NaN` 시간 전파 → 대시보드 `new Date(NaN)` 파탈 크래시 (WSOD) |
| **M-2** | 🟠 **MAJOR** | `kakaoService.ts:413~415` | GPS 미수신 상태에서 단일 하차지만 남았을 때 `mergedWaypoints[0].x` Undefined 참조 에러 |
| **m-1** | 🟡 **MINOR** | `callNet.ts:69, 161` | 동/시군구 불일치 시 예외 Throw → 관제탑 렌더링 중단 위험 |

---

## 1. 🔴 CRITICAL 결함 정밀 분석

### 1-1. `routeComposer.ts:376, 379` — `haversineKm` 위도/경도 파라미터 반대 주입
- **문제 위치**: `onedal-web/server/src/services/routeComposer.ts:375~380`
- **현상 및 영향**:
  `geoService.ts:817`에 정의된 `haversineKm`의 함수 시그니처는 다음과 같습니다:
  ```typescript
  export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number
  ```
  첫 번째 인자는 `lat1`(위도 Y, 한국 기준 ~37.3°), 두 번째 인자는 `lng1`(경도 X, 한국 기준 ~127.2°)입니다.
  하지만 `reusableBase()` 함수에서는 다음과 같이 호출하고 있습니다:
  ```typescript
  // routeComposer.ts:376 & 379
  const hit = baseRouteCache.find(e =>
      e.key === key && haversineKm(origin.x, origin.y, e.origin.x, e.origin.y) <= BASE_CACHE_RADIUS_KM);
  
  const movedM = Math.round(haversineKm(origin.x, origin.y, hit.origin.x, hit.origin.y) * 1000);
  ```
  - `origin.x` (경도 ~127.0)가 `lat1` 자리에 들어가고, `origin.y` (위도 ~37.3)가 `lng1` 자리에 들어갑니다.
  - 지구 위도는 -90° ~ +90° 범위만 물리적으로 존재하는데, 127°가 위도로 입력되면서 `Math.cos(lat1)`과 `Math.sin(dLat/2)` 연산이 북극점을 넘어선 지구 밖 가상 공간의 거리로 계산됩니다.
  - 이로 인해 기사님이 50m만 이동했음에도 불구하고 거리가 수 킬로미터로 튀거나, 반대로 수 킬로미터를 이동했는데도 200m 이내(`BASE_CACHE_RADIUS_KM`)로 오판하여 엉뚱한 Base 경로를 재사용하게 됩니다.
  - 반면, 동일 파일의 545행(`orderByNearest`)에서는 `haversineKm(here.y, here.x, st.y, st.x)`로 정상 호출하고 있어 명백한 개발자의 인자 착오입니다.
- **개선 코드**:
```diff
--- a/onedal-web/server/src/services/routeComposer.ts
+++ b/onedal-web/server/src/services/routeComposer.ts
@@ -373,10 +373,10 @@ function baseCacheKey(
 function reusableBase(key: string | null, origin: Coord | null | undefined): any | null {
     if (!key || !origin) return null;   // 기점을 모르면 «200m 안»을 잴 수 없다 — 되쓰지 않는다
     const hit = baseRouteCache.find(e =>
-        e.key === key && haversineKm(origin.x, origin.y, e.origin.x, e.origin.y) <= BASE_CACHE_RADIUS_KM);
+        e.key === key && haversineKm(origin.y, origin.x, e.origin.y, e.origin.x) <= BASE_CACHE_RADIUS_KM);
     if (!hit) return null;
     const ageSec = Math.round((Date.now() - hit.at) / 1000);
-    const movedM = Math.round(haversineKm(origin.x, origin.y, hit.origin.x, hit.origin.y) * 1000);
+    const movedM = Math.round(haversineKm(origin.y, origin.x, hit.origin.y, hit.origin.x) * 1000);
     console.log(`🗄️ [base 되씀] ${ageSec}초 전에 잰 값 · 기점 ${movedM}m 이동 · 카카오 호출 1회 아낌`);
     return hit.base;
 }
```

---

### 1-2. `routeComposer.ts:422` — `calls` 빈 배열 시 `plan.origin` Null Dereference 서버 다운
- **문제 위치**: `onedal-web/server/src/services/routeComposer.ts:421~424` 및 `746~754`
- **현상 및 영향**:
  `composeMergedRoute`가 호출될 때 기존 보유 콜 목록 `calls`가 비어있는 상태(`calls.length === 0`)에서 후보 콜 `extra`만 들어오는 경우:
  `planMergedStops` 함수는 `calls`가 비어있으므로 `firstCall = null`, `mainPair = null`, `origin = null`을 반환합니다:
  ```typescript
  // routeComposer.ts:746~754
  const firstCall = calls.length > 0 ? calls[0] : null;
  const mainPair = firstCall ? toCoordPair(firstCall) : null;
  const origin = mainPair ? ... : null;
  return { origin, mergedDest, waypoints, orderedStops, skippedPickups };
  ```
  그리고 `composeMergedRoute` 421행에서 곧바로 이를 분해합니다:
  ```typescript
  // routeComposer.ts:421~424
  const result = await calculateDetourRoute(
      plan.origin.dropoff.x, plan.origin.dropoff.y, // 💥 TypeError: Cannot read properties of null (reading 'dropoff')
      plan.origin.pickup.x, plan.origin.pickup.y,
  ```
  - Node.js 메인 이벤트 루프에서 Unhandled Exception이 발생하여 서버 프로세스가 즉각 다운됩니다.
  - 기사님이 기존 콜을 모두 배송 완료 처리한 직후 새 콜의 경로를 시뮬레이션하거나 우회 판정을 요청할 때 즉시 발생할 수 있는 잠재적 시한폭탄입니다.
- **개선 코드**:
```diff
--- a/onedal-web/server/src/services/routeComposer.ts
+++ b/onedal-web/server/src/services/routeComposer.ts
@@ -397,7 +397,7 @@ export async function composeMergedRoute(params: ComposeMergedRouteParams) {
     const { calls, extra, origin, priority, carType } = params;
 
     const plan = planMergedStops(calls, extra, origin);
-    if (!plan) return null;
+    if (!plan || !plan.origin) return null;
 
     /**
      * 🧮 **후보를 뺀 «기존 전부» 경로를 같은 기점에서 함께 잰다** (기사님 실측 2026-08-26).
```

---

## 2. 🟠 MAJOR 결함 분석

### 2-1. `timing.ts:1242` & `pickBindingDeparture` — `NaN` 출발시각 전파 및 대시보드 WSOD
- **문제 위치**: `onedal-web/shared/src/timing.ts:1241~1243` & `1308~1315`
- **현상 및 영향**:
  1. `timing.ts:1241~1243`:
     ```typescript
     departByMs: actualMs == null && promisedUntil != null && st.driveMinutes != null
         ? Date.parse(promisedUntil) - (st.driveMinutes + mandatoryMin) * 60_000 : null,
     ```
     화주나 주선사 통화 메모, 또는 잘못 포맷된 시각 문자열이 `promisedUntil`에 들어올 경우 `Date.parse(promisedUntil)`은 `NaN`을 반환합니다.
  2. `NaN - number` 연산 결과는 `NaN`이 되므로 `departByMs`에 `NaN`이 저장됩니다.
  3. `pickBindingDeparture`에서 `e.departByMs == null` 검사는 `NaN`에 대해 `false`로 통과합니다 (`NaN == null`은 `false`).
  4. 첫 번째 원소의 `departByMs`가 `NaN`이면 `best`는 해당 `NaN` 원소를 잡게 되고, 이후 모든 비교(`e.departByMs < NaN`)는 `false`가 되어 `pickBindingDeparture`는 `departByMs: NaN`을 최종 반환합니다.
  5. 기사님의 태블릿 관제 UI인 `DepartureCountdown.tsx:106`에서:
     ```typescript
     soonest = {
         at: new Date(binding.departByMs!).toISOString(), // 💥 RangeError: Invalid time value
     ```
     React 렌더 트리 전체가 Uncaught Exception으로 파괴되며 **화면이 완전히 하얗게 꺼지는 WSOD (White Screen of Death)** 현상이 발생합니다. 고속도로 주행 중 관제 화면이 사망하면 기사는 극도의 안전 위협에 노출됩니다.
- **개선 코드**:
```diff
--- a/onedal-web/shared/src/timing.ts
+++ b/onedal-web/shared/src/timing.ts
@@ -1239,9 +1239,12 @@ export function deriveRouteTimeline(
             departPrevMs: prevDepartMs,
             promisedUntil,
             promiseConfirmed: !!declared,
-            departByMs: actualMs == null && promisedUntil != null && st.driveMinutes != null
-                ? Date.parse(promisedUntil) - (st.driveMinutes + mandatoryMin) * 60_000 : null,
+            departByMs: (() => {
+                if (actualMs != null || promisedUntil == null || st.driveMinutes == null) return null;
+                const t = Date.parse(promisedUntil);
+                return Number.isFinite(t) ? t - (st.driveMinutes + mandatoryMin) * 60_000 : null;
+            })(),
             lateMinutes,
             arrived: actualMs != null,
             dwellShiftMinutes: shiftMin,
         });
@@ -1309,7 +1312,7 @@ export function pickBindingDeparture(timeline: RouteTimelineEntry[]): RouteTime
     let best: RouteTimelineEntry | null = null;
     for (const e of timeline) {
-        if (e.departByMs == null) continue;
+        if (e.departByMs == null || !Number.isFinite(e.departByMs)) continue;
         if (!best || e.departByMs < best.departByMs!) best = e;
     }
     return best;
```

---

### 2-2. `kakaoService.ts:413~415` — GPS 미수신 + 단독 하차지 상황에서의 Undefined Index Crash
- **문제 위치**: `onedal-web/server/src/services/kakaoService.ts:413~416`
- **현상 및 영향**:
  ```typescript
  let mergedOriginX = driverLoc ? driverLoc.x : mergedWaypoints[0].x;
  let mergedOriginY = driverLoc ? driverLoc.y : mergedWaypoints[0].y;
  let wpArray = driverLoc ? mergedWaypoints : mergedWaypoints.slice(1);
  ```
  - 기사님의 앱이 터널, 지하 주차장 등으로 인해 GPS(`driverLoc`)를 일시적으로 보고하지 못하는 상태일 때,
  - 상차가 완료되어 하차지만 1건 남은 경우, `routeComposer.ts:721`의 `const mergedDest = ordered.pop()!`에 의해 `mergedWaypoints`(`waypoints`)는 빈 배열 `[]`이 됩니다.
  - 이 상태에서 `driverLoc`가 없으면 `mergedWaypoints[0].x`를 직접 읽으려 하다가 `TypeError: Cannot read properties of undefined (reading 'x')` 예외가 발생하여 카카오 경로 조회가 실패합니다.
- **개선 코드**:
```diff
--- a/onedal-web/server/src/services/kakaoService.ts
+++ b/onedal-web/server/src/services/kakaoService.ts
@@ -412,9 +412,9 @@ export async function calculateDetourRoute(
     // 스마트 정렬 시 driverLoc는 무조건 Origin으로 취급
-    let mergedOriginX = driverLoc ? driverLoc.x : mergedWaypoints[0].x;
-    let mergedOriginY = driverLoc ? driverLoc.y : mergedWaypoints[0].y;
+    let mergedOriginX = driverLoc?.x ?? mergedWaypoints[0]?.x ?? mainPickupX;
+    let mergedOriginY = driverLoc?.y ?? mergedWaypoints[0]?.y ?? mainPickupY;
     let wpArray = driverLoc ? mergedWaypoints : mergedWaypoints.slice(1);
```

---

## 3. 🟡 MINOR 및 기하학 알고리즘 개선 제언

### 3-1. `callNet.ts:69, 161` — 사전 불일치 시 `throw Error` 방어
- **문제 위치**: `onedal-web/shared/src/callNet.ts:69, 161`
- **내용**: `centroidOfDong`과 `cityCenter`에서 `DONG_CENTROIDS`에 없는 행정동이나 시군구가 인입되면 즉시 `throw new Error(...)`를 발생시킵니다.
- **제언**: 배차망의 콜 메모나 화주 입력 주소는 오타나 행정동/법정동 혼용(예: "화성시 동탄7동", "남양주시 다산1동")이 빈번합니다. Throw 대신 `null`을 반환하고 로깅 후 Fallback 처리하도록 보강하여 필터 파이프라인의 견고함을 확보해야 합니다.

---

## 4. Part 3 검토 총평 및 기사 운행 안전성 평가

- **합짐 탐욕 알고리즘 (Greedy Nearest with Hysteresis)**:
  - `routeComposer.ts`의 `orderByNearest`는 기사님의 실전 철학("카카오에 순번을 보냈으면 직전 순번을 따르고, 새 콜이 끼어들 때만 거리 20% 마진 내에서 번호 춤을 막는다")이 아주 훌륭하게 코드로 구현되어 있습니다.
- **Base 경로 캐싱 (`reusableBase`)**:
  - 초당 수십 건의 카카오 API 호출을 획기적으로 아껴 Rate Limit을 방어하는 핵심 장치이나, **`haversineKm` 위경도 반대 입력 결함**으로 인해 그 효과가 반감되고 있었습니다. 이 결함 수정을 통해 배차 탐색 속도와 안정성이 크게 향상될 것입니다.
- **150% 타임라인 사다리 (`timing.ts`)**:
  - 상차 도착 약속(콜 잡은 시각 + 20분)과 하차 배달 데드라인(상차 완료 + 배송 150%)이 일관된 단일 원천(Single Source of Truth)으로 철저하게 통제되어 있어, 타임라인 왜곡 위험이 없습니다. 단, `NaN` 전파 취약점만 완벽히 차단하면 됩니다.
  
---
**다음 단계 안내**:  
Part 3 [합짐 동선 & 기하학 알고리즘] 정밀 리뷰가 완료되었습니다.  
이제 마지막 단계인 **Part 4 [관제탑 클라이언트 UI & 실시간 통신 (`client-app`)]** 정밀 리뷰를 진행합니다.
