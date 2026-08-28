# 1DAL 배차 동기화 장애: 구조적 해결 계획서 v2

> 배민 시니어 엔지니어 관점의 아키텍처 리뷰

---

## 질문에 대한 답변

### Q1. "원래 이 코드를 만든 이유가 있는데, 그것까지 해결되는 거야?"

원래 Long-Polling을 넣은 이유 2가지를 정확히 이해했습니다:

**이유 A**: 콜을 잡고 웹에 표시했는데, 관제사가 인지 못하고 있다가 인성앱의 취소 시간(~1분)이 넘어가서 취소 자체가 불가능해지는 것을 방지
**이유 B**: 앱은 콜을 잡았는데, 통신 오류로 관제탑의 KEEP/CANCEL 명령이 앱까지 도달하지 못해서 취소 시간이 지나버리는 것을 방지

**결론: Piggyback 방식이 두 이유 모두 더 잘 해결합니다.** 아래 비교표를 봐주세요:

| 시나리오 | Long-Polling (현재) | Piggyback (제안) |
|----------|---------------------|------------------|
| **이유 A: 관제사가 늦게 인지** | 관제사가 30초 안에 결재 안 하면 서버 타임아웃(35초) → 앱에 408 → 앱 데스밸리 → 강제 취소. **보호됨** | 동일하게 보호. 관제사가 안 봐도 앱의 30초 데스밸리가 독립적으로 작동하여 강제 취소. **동일하게 보호됨** |
| **이유 B: 통신 오류로 명령 미도달** | HTTP 연결이 중간에 끊기면 **그 응답은 영원히 유실**. 앱의 30초 데스밸리가 유일한 안전장치 | `/scrap`이 1번 실패해도 판결이 서버에 남아있어서 **다음 `/scrap`에서 재전달**. 여러 번의 전달 기회가 있음. **더 안전함** |
| **오늘 발생한 버그: Ghost Response** | 오더A의 408 응답이 오더B 화면에서 실행됨 💥 | `/scrap` 응답에 `orderId`가 명시되어 있으므로 **절대 다른 오더에 오적용 불가** ✅ |

> [!TIP]
> **핵심 포인트**: 앱의 30초 데스밸리 타이머는 `/detail`의 HTTP 응답 방식과 무관하게 독립적으로 작동합니다.
> 즉, `/detail`을 즉시 202로 응답해도 앱의 데스밸리 보호 기능은 그대로 유지됩니다.
> 오히려 Long-Polling의 "1번 기회 → 실패하면 끝" 보다 Piggyback의 "매 `/scrap`마다 재전달 기회"가 더 안전합니다.

---

### Q2. "Piggyback 1회 보장 문제" — 쉽게 설명

택배에 비유하겠습니다:

**현재 방식 (Long-Polling)**:
```
관제사가 "이 콜 취소해" 라고 적은 편지를 택배기사(HTTP 응답)에게 줌
→ 택배기사가 기사님 집(앱) 앞에서 35초 기다림
→ 기사님이 문을 열면 편지 전달 (성공)
→ 기사님이 문을 안 열면 편지를 버리고 감 (유실) 💥
→ 편지는 1통뿐이라 다시 보낼 방법이 없음
```

**Piggyback 방식**:
```
관제사가 "이 콜 취소해" 라고 적은 편지를 우체통(서버 메모리)에 넣음
→ 앱이 매번 /scrap을 보낼 때마다 우체통을 확인
→ 편지가 있으면 가져감 (성공)
→ 이번에 못 가져가도 편지는 우체통에 그대로 남아있음
→ 다음에 다시 가져갈 수 있음 ✅
```

**"1회 보장 문제"란:** 앱이 `/scrap` 응답에서 판결을 받았는데, 네트워크 오류로 그 응답 자체를 못 받으면?
- 서버가 "아 한번 보냈으니 우체통에서 지우자" → 판결 영구 유실 ❌
- 서버가 "앱이 '받았어요' 할 때까지 우체통에 계속 남겨두자" → 다음 `/scrap`에서 재전달 ✅

**제 추천:** 후자입니다. 서버는 앱이 확인할 때까지 판결을 삭제하지 않습니다.
구현은 간단합니다 — 앱이 다음 `/scrap` 요청 body에 `"ackDecisionId": "오더ID"`를 달아서 보내면,
서버가 그때 `pendingDecisions`에서 삭제합니다.

---

### Q3. "서버가 바로 판결하는 경우는 뭐지? 지금은 어떻게 보내고 있는데?"

현재 코드([detail.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts))에서 **서버가 즉시 판결하는 3가지 경우**가 있습니다:

| 경우 | 코드 위치 | 현재 동작 |
|------|-----------|-----------|
| ① MANUAL 모드 (기사님이 직접 눌러서 잡은 콜) | L137-139 | 즉시 `KEEP` + HTTP 응답 `ACK` |
| ② 차종 불일치 (1t 필터인데 다마스 콜이 들어옴) | L107-123 | 즉시 HTTP 응답 `CANCEL` |
| ③ 다른 기기가 이미 평가 중 | L99-105 | 즉시 HTTP 응답 `CANCEL` |

**AUTO 모드**에서는 위 3가지에 해당하지 않으면, 관제사가 결재할 때까지 **HTTP를 물고 기다립니다**. 현재 흐름:

```
[AUTO 모드 — 현재]
06:16:24  앱: 꿀콜 발견! /confirm 전송
06:16:24  서버: "상세 긁어와" 즉시 응답
06:16:25  앱: 무인서핑 완료, /detail 전송
06:16:28  서버: 카카오 연산 완료 → '꿀' 판정 → 관제탑 웹에 표시
          ┌─ 여기서 HTTP 응답을 "물고" 있음 ─┐
          │  관제사가 KEEP 또는 CANCEL       │
          │  클릭하기를 기다리는 중...        │
          └────────────────────────────────┘
06:16:55  앱: 30초 지남! 데스밸리 발동 → 강제 취소 💥
```

> [!WARNING]
> **문제가 보이시나요?** 서버는 06:16:28에 이미 '꿀'이라고 판정했습니다.
> 그런데 관제사가 27초간 KEEP을 안 눌렀기 때문에 결국 데스밸리로 취소됐습니다.
> **만약 서버가 '꿀'이면 자동으로 KEEP을 내렸다면, 이 콜은 살아있었을 겁니다.**

이것이 "AUTO 모드에서의 판결 불필요"의 의미입니다. AUTO 모드에서는:
- **꿀/콜** → 서버가 자동 KEEP (관제사 결재 불필요)
- **똥** → 서버가 자동 CANCEL (관제사 결재 불필요)
- **경로 연산 실패** → 서버가 안전하게 자동 CANCEL

> [!IMPORTANT]
> **이건 별도 기능이므로 이번 계획에는 포함하지 않겠습니다.**
> 지금은 동기화 장애 해결에만 집중하고, AUTO 자동 판결은 다음 단계로 진행하시겠습니까?

---

## 근본 원인 분석 (4가지 구조적 결함)

### 결함 #1: HTTP Long-Polling 안티패턴

`/detail`이 앱의 HTTP 요청을 **최대 35초** 물고 있습니다:

```
앱 ──POST /detail──▶ 서버 (res 객체를 pendingDetailRequests에 저장)
                        │ ... 30~35초 대기 ...
                        ◀── 관제탑 Decision 또는 Timeout ──
```

배민/쿠팡 같은 실시간 배차 시스템은 **요청 즉시 응답 + 별도 채널 판결 전달**이 표준입니다.
HTTP 연결을 30초 이상 잡고 있으면 TCP keepalive, 프록시, 클라이언트 타임아웃 등
제어 불가능한 외부 요인에 노출됩니다.

### 결함 #2: orderId 미검증

앱이 `/detail` 응답을 받으면 **어떤 오더의 응답인지 확인하지 않고** 현재 화면에서 바로 실행합니다.
이것이 "오더A의 408이 오더B 화면에서 실행되는" 직접 원인입니다.

### 결함 #3: 이중 타이머 경쟁

- `orders.ts` (confirm): 30초 데스밸리 → `handleDecision(CANCEL)`
- `detail.ts`: 30초 경고 + 35초 강제 해제 → 408 응답 + 캐시 삭제

두 타이머가 **같은 리소스를 경쟁적으로 정리**하며, 실행 순서가 보장되지 않습니다.
Emergency가 도착해도 이미 타이머가 캐시를 지워버려서 "삭제할 내용 없음" 이 발생합니다.

### 결함 #4: 타이머 좀비

`setTimeout` ID를 저장하지 않으므로, 오더가 소멸해도 타이머를 취소할 수 없습니다.

---

## 해결 방향: 즉시 응답 + Piggyback 판결

```
[변경 후]
앱 ──POST /detail──▶ 서버: 즉시 202 응답 {"orderId": "xxx", "status": "evaluating"}
                        │
앱 ──POST /scrap──▶  서버: 평소처럼 필터/GPS 응답 + decision: null (아직 미결)
앱 ──POST /scrap──▶  서버: 관제사가 KEEP 클릭 → decision: {"orderId":"xxx","action":"KEEP"}
앱: orderId 일치 확인 → KEEP 실행 ✅
```

---

## 상세 구현 계획

### Phase 1: 서버 변경 (앱 수정 없이도 하위 호환)

#### [MODIFY] [userSessionStore.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/state/userSessionStore.ts)

```diff
 export interface UserSession {
     mainCallState: SecuredOrder | null;
     subCalls: SecuredOrder[];
-    pendingDetailRequests: Map<string, any>;
+    pendingDecisions: Map<string, { action: 'KEEP' | 'CANCEL' | null; evaluatedAt: number }>;
+    activeTimers: Map<string, NodeJS.Timeout>;
     pendingOrdersData: Map<string, SecuredOrder>;
     deviceEvaluatingMap: Map<string, string>;
     activeFilter: AutoDispatchFilter;
     driverLocation: { x: number; y: number } | null;
 }
```

- `pendingDetailRequests` (Express Response 객체 저장) → `pendingDecisions` (순수 데이터)
- `activeTimers` 추가: Emergency/Decision 발생 시 `clearTimeout`으로 확실히 제거

---

#### [MODIFY] [detail.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts) — 핵심 변경

**현재 (Long-Polling):**
```typescript
// L142: HTTP 응답 객체를 물고 있음
session.pendingDetailRequests.set(payload.order.id, res);
// L144-177: 30초 경고 + 35초 강제 해제 (취소 불가능한 setTimeout 2개)
```

**변경 후 (즉시 응답):**
```typescript
// 즉시 202 응답 — HTTP 연결을 물지 않음
res.status(202).json({
    success: true,
    orderId: payload.order.id,
    message: "상세 수신 완료. 판결은 /api/scrap 응답으로 전달됩니다."
});

// 판결 대기 상태 저장 (Express Response가 아닌 순수 데이터)
session.pendingDecisions.set(payload.order.id, {
    action: null,  // 아직 미결
    evaluatedAt: Date.now()
});

// 타이머를 ID와 함께 저장 (취소 가능)
const warningTimer = setTimeout(() => { ... deathvalley-warning ... }, 30000);
const timeoutTimer = setTimeout(() => {
    // 미결이면 자동 CANCEL 판결 저장
    const decision = session.pendingDecisions.get(payload.order.id);
    if (decision && decision.action === null) {
        decision.action = 'CANCEL';
        // → 다음 /scrap 응답에서 앱에 전달됨
    }
}, 35000);

// 타이머 ID 저장 (나중에 clearTimeout 가능)
session.activeTimers.set(`${payload.order.id}_warning`, warningTimer);
session.activeTimers.set(`${payload.order.id}_timeout`, timeoutTimer);
```

---

#### [MODIFY] [scrap.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/scrap.ts) — Piggyback 판결 전달

```typescript
// 기존 응답 구조에 decision 필드 추가
const currentEvaluatingId = session.deviceEvaluatingMap.get(deviceId);
let decisionPayload = null;

if (currentEvaluatingId) {
    const pending = session.pendingDecisions.get(currentEvaluatingId);
    if (pending?.action) {
        decisionPayload = {
            orderId: currentEvaluatingId,
            action: pending.action
        };
        // ack가 올 때까지 삭제하지 않음 (at-least-once)
    }
}

// 앱이 이전 판결을 확인했으면 정리
const ackId = req.body.ackDecisionId;
if (ackId) session.pendingDecisions.delete(ackId);

res.json({
    apiStatus: { ... },
    dispatchEngineArgs: { ... },
    decision: decisionPayload  // ← 새로 추가
});
```

---

#### [MODIFY] [dispatchEngine.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/services/dispatchEngine.ts)

`handleDecision()` 함수 변경:
```diff
 export async function handleDecision(userId: string, orderId: string, action: 'KEEP' | 'CANCEL', io: any) {
     const session = getUserSession(userId);
-    const heldRes = session.pendingDetailRequests.get(orderId);
-    if (heldRes && !heldRes.headersSent) {
-        session.pendingDetailRequests.delete(orderId);
-        const deviceResponse = { deviceId: 'server', action };
-        heldRes.json(deviceResponse);
-    }
+    // HTTP 직접 응답 대신 → pendingDecisions에 상태 저장
+    const pending = session.pendingDecisions.get(orderId);
+    if (pending) {
+        pending.action = action;
+    }
+
+    // 관련 타이머 정리
+    const warningTimer = session.activeTimers.get(`${orderId}_warning`);
+    const timeoutTimer = session.activeTimers.get(`${orderId}_timeout`);
+    if (warningTimer) { clearTimeout(warningTimer); session.activeTimers.delete(`${orderId}_warning`); }
+    if (timeoutTimer) { clearTimeout(timeoutTimer); session.activeTimers.delete(`${orderId}_timeout`); }
```

---

#### [MODIFY] [emergency.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/emergency.ts)

```diff
-    if (session.pendingDetailRequests.has(targetOrderId)) {
-        const heldRes = session.pendingDetailRequests.get(targetOrderId);
-        session.pendingDetailRequests.delete(targetOrderId);
-        if (heldRes && !heldRes.headersSent) {
-            heldRes.status(408).json({ error: "Emergency Timeout Cleaned" });
-        }
-    }
+    // 미결 판결 제거
+    session.pendingDecisions.delete(targetOrderId);
+
+    // 관련 타이머 모두 정리
+    for (const suffix of ['_warning', '_timeout']) {
+        const timer = session.activeTimers.get(`${targetOrderId}${suffix}`);
+        if (timer) { clearTimeout(timer); session.activeTimers.delete(`${targetOrderId}${suffix}`); }
+    }
```

---

### Phase 2: 앱 변경 (안드로이드)

#### `/scrap` 응답에서 `decision` 필드 파싱

```kotlin
val decision = scrapResponse.optJSONObject("decision")
if (decision != null) {
    val orderId = decision.getString("orderId")
    val action = decision.getString("action")

    // 핵심: 현재 내가 물고 있는 오더와 일치하는지 검증
    if (orderId == currentHoldingOrderId) {
        Log.i("1DAL", "✅ 판결 수신: $orderId → $action")
        executeDecision(action)
        // 다음 /scrap에 ack 전송
        nextScrapBody.put("ackDecisionId", orderId)
    } else {
        Log.w("1DAL", "⚠️ 판결 무시 (현재 오더 불일치): $orderId ≠ $currentHoldingOrderId")
    }
}
```

#### 데스밸리 타이머는 변경 없음

앱의 30초 데스밸리는 **그대로 유지**합니다.
이것은 "서버/네트워크가 전부 죽어도 기사님을 보호하는 최후의 안전장치"이므로 절대 제거하면 안 됩니다.

---

## 하위 호환성 (서버 먼저 배포 시)

| 서버 | 앱 | 동작 |
|------|-----|------|
| **신규** (즉시 202) | **구 앱** | 앱이 202를 받으면 `action` 없으므로 무시. 데스밸리 30초 기다림 → Emergency → 서버 정리. **현재와 동일하게 안전** |
| **신규** (즉시 202) | **신 앱** (Piggyback 소비) | `/scrap` 응답으로 판결 수신. orderId 검증 후 실행. **완전한 정상 동작** |

---

## 변경 범위

| 파일 | 변경 | 영향도 |
|------|------|--------|
| `userSessionStore.ts` | `pendingDetailRequests` → `pendingDecisions` + `activeTimers` | 🟡 타입 변경 |
| `detail.ts` | Long-Polling → 즉시 202 + 취소 가능한 타이머 | 🔴 핵심 |
| `scrap.ts` | `decision` Piggyback + `ackDecisionId` 처리 | 🟡 추가 |
| `dispatchEngine.ts` | `heldRes.json()` → `pendingDecisions.action = action` + `clearTimeout` | 🟡 변경 |
| `emergency.ts` | heldRes 정리 → pendingDecisions 삭제 + clearTimeout | 🟢 단순화 |
| `orders.ts` (confirm) | 서버 데스밸리 타이머를 activeTimers에 등록 | 🟢 추가 |
| **Android App** | `/scrap` 응답 `decision` 파싱 + orderId 검증 + ackDecisionId 전송 | 🔴 핵심 |

## 검증 계획

### 자동 테스트
1. 시뮬레이터로 연속 3콜 자동 배차 → 각 콜의 orderId가 올바르게 매칭되는지 확인
2. 서버 강제 재시작 시 앱 데스밸리가 정상 작동하는지 확인

### 수동 검증
- 관제탑 KEEP/CANCEL 후 다음 `/scrap` 주기에 판결 도달 확인
- Lifecycle Report 생성으로 전체 흐름 검증

## Open Questions

> [!IMPORTANT]
> **AUTO 모드 자동 판결 (꿀→KEEP, 똥→CANCEL)은 이번 범위에 포함할까요?**
> 이 기능이 있으면 관제사가 안 봐도 서버가 알아서 판결하므로 데스밸리에 빠지는 확률이 크게 줄어듭니다.
> 단, 이 기능은 동기화 장애 해결과는 독립적이므로 별도 Phase로 분리해도 됩니다.
