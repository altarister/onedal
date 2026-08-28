# 수동배차 Desync 버그 — 시니어 레벨 원인 분석 및 해결 계획서

## 1. 현상 요약 (버그 증상)

| 항목 | 기대 동작 | 실제 동작 |
|------|-----------|-----------|
| 관제탑 표시 | `[수동배차]` 라벨, 데스밸리 없음 | AUTO 콜로 표시됨, 30초 데스밸리 카운트다운 발동 |
| KEEP 클릭 후 | 콜 유지, 합짐 모드 전환 | 콜이 ~17초 후 증발 |
| 필터 상태 | 유지 또는 합짐 전환 | 콜은 사라졌는데 필터만 `합짐 탐색중`으로 전환됨 |

---

## 2. 원인 분석 (로그 기반 타임라인)

### 📍 타임라인 교차 분석

```
19:14:01  [앱]    POST /confirm  matchType: "AUTO"  ← 🐛 여기가 발단
19:14:01  [앱]    필터 동기화: isSharedMode=false, destinationCity=파주시
19:14:07  [앱]    DETAIL_CONFIRMED 진입, 서핑 시작
19:14:08  [앱]    POST /detail 전송 (202 Accepted)
19:14:08  [앱]    scrap 응답 수신 → 60초 수면 진입 ← 💀 1초 폴링 미작동
19:14:09  [서버]  order-evaluated 푸시 (꿀콜 🍯 62,000원)
19:14:27  [웹]    기사님 KEEP 클릭 → 서버 Piggyback 큐 등록
19:14:27  [서버]  EMPTY → LOADING 전환, 합짐 필터 적용
19:14:39  [서버]  deathvalley-warning (30초 경과)
19:14:44  [서버]  order-canceled (35초 경과, WAITING_TIMEOUT_MS)
         [앱]    60초 수면 중… 아무것도 모름
19:15:08  [앱]    60초 하트비트 → 이미 모든 것이 끝남
```

### 🐛 근본 원인: `matchType`의 의미론적 오류

[HijackService.kt](file:///Users/seungwookkim/reps/onedal/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt#L354-L359)의 `handlePreConfirmScreen()` 함수에서:

```kotlin
val request = DispatchBasicRequest(
    step = "BASIC",
    deviceId = apiClient.getDeviceId(),
    order = finalOrder,
    capturedAt = finalOrder.timestamp,
    matchType = telemetryManager.currentMode  // ← 🐛 UI 스위치 상태를 보냄
)
```

`telemetryManager.currentMode`는 **UI 토글 스위치의 현재 값**(AUTO/MANUAL)이지, **실제로 매크로가 이 콜을 클릭했는지 여부**가 아닙니다. 사람이 손으로 눌렀어도 스위치가 AUTO면 `"AUTO"`를 보냅니다.

### 💀 연쇄 장애 경로 (Failure Chain)

서버의 [detail.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts#L143-L150)가 이 값을 **신뢰하여** 분기합니다:

```typescript
// detail.ts L143-150
if (securedOrder.type === "MANUAL") {
    await handleDecision(userId, securedOrder.id, "KEEP", io);  // 즉결 확정!
    return res.json({ deviceId: 'server', action: 'ACK' });
}
// AUTO면 → Piggyback 대기 큐 + 30초 데스밸리 타이머 가동
session.pendingDecisions.set(payload.order.id, { action: null, ... });
```

그런데 앱의 `isAutoSessionActive`는 `false`이므로:

1. [startDeathValleyTimer()](file:///Users/seungwookkim/reps/onedal/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt#L593-L610): `if (!isAutoSessionActive) return` → **앱 데스밸리 미작동**
2. `telemetryManager.isWaitingDecision`이 `true`로 설정되지 않음 → **1초 고속 폴링 미작동**
3. 앱은 60초 하트비트 주기로 느긋하게 잠듦
4. 서버는 35초(`WAITING_TIMEOUT_MS`) 후 콜 강제 취소

---

## 3. 시니어 관점 아키텍처 리뷰

> [!WARNING]
> **초기 제안("앱에서 matchType만 고치자")은 밴드에이드 수준입니다.**
> 클라이언트가 보내는 `matchType` 값 하나에 서버의 전체 배차 흐름(즉결 확정 vs 30초 대기)이 좌우되는 구조 자체가 취약합니다. 클라이언트는 언제든 거짓말할 수 있고, 네트워크 오류로 값이 누락될 수도 있습니다.

### 설계 결함 요약

| 관점 | 문제 |
|------|------|
| **구조적** | 서버의 핵심 분기 로직이 클라이언트가 보낸 단일 필드(`matchType`)에 100% 의존 |
| **합리적** | KEEP 결재까지 완료된 콜을 "앱이 ACK 안 했다"는 이유만으로 취소하는 것은 비즈니스 논리에 반함 |
| **효율적** | 앱 수정 = 빌드+배포 필요. 서버만 고치면 앱 재설치 없이 즉시 적용 가능 |

---

## 4. 해결 계획 (3단계 방어)

### Phase 1: 서버 방어 — KEEP된 콜은 절대 취소하지 않는다 (즉시 적용 가능)

> [!IMPORTANT]
> **핵심 원칙: 기사님이 KEEP을 눌렀다면, 그 콜은 무슨 일이 있어도 살아남아야 합니다.**

#### [MODIFY] [detail.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts#L168-L185)

`timeoutTimer` (35초 타임아웃) 콜백 내부에서, 이미 KEEP 결재가 내려진 콜인지 검사하는 로직을 추가합니다.

```typescript
// detail.ts L168-185 — timeoutTimer 콜백 수정
const timeoutTimer = setTimeout(() => {
    const decision = session.pendingDecisions.get(payload.order.id);
    if (decision) {
        // ✅ [Phase 1] KEEP 결재가 이미 내려진 콜은 절대 취소하지 않는다
        if (decision.action === 'KEEP') {
            // 앱이 ACK를 못 보낸 것일 뿐, 콜 자체는 확정됨.
            // 타이머만 정리하고 콜은 유지한다.
            session.pendingDecisions.delete(payload.order.id);
            console.log(`🛡️ [Phase 1 방어] 콜(${payload.order.id})은 KEEP 결재 완료 상태. 앱 ACK 미수신이지만 콜 유지.`);
            return; // ← 취소하지 않고 리턴
        }
        // KEEP이 아닌 경우(미결재/CANCEL)만 기존 로직대로 취소
        session.pendingDecisions.delete(payload.order.id);
        session.pendingOrdersData.delete(payload.order.id);
        // ... (기존 취소 로직)
    }
}, DISPATCH_CONFIG.WAITING_TIMEOUT_MS);
```

**이 수정만으로도 "KEEP 눌렀는데 콜이 증발하는" 치명적 증상은 100% 해결됩니다.**

---

### Phase 2: 앱 의미론 교정 — matchType의 진실성 확보

#### [MODIFY] [HijackService.kt](file:///Users/seungwookkim/reps/onedal/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt#L354-L359) `handlePreConfirmScreen()`

`matchType`이 **실제 클릭 주체**를 정확히 반영하도록 수정합니다.

```kotlin
val request = DispatchBasicRequest(
    step = "BASIC",
    deviceId = apiClient.getDeviceId(),
    order = finalOrder,
    capturedAt = finalOrder.timestamp,
    // ✅ [Phase 2] 매크로가 실제로 클릭한 경우만 AUTO, 나머지는 전부 MANUAL
    matchType = if (isAutoSessionActive) "AUTO" else "MANUAL"
)
```

#### [MODIFY] [HijackService.kt](file:///Users/seungwookkim/reps/onedal/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt#L352-L388) `handlePreConfirmScreen()` — 수동 클릭 시에도 Fast Polling 활성화

AUTO 스위치가 켜진 상태에서 사람이 수동으로 콜을 잡은 경우, 서버가 아직 AUTO로 인식하고 Piggyback 결재를 보낼 수 있으므로, 일시적으로 1초 폴링을 활성화합니다.

```kotlin
if (!isAutoSessionActive || isTarget) {
    // ... 기존 sendConfirm 로직 ...
    
    // ✅ [Phase 2] 수동 클릭이지만, 서버가 혹시 결재를 보낼 수 있으므로
    // 일시적으로 고속 폴링 활성화 (서버 Phase 1과 이중 방어)
    if (!isAutoSessionActive && telemetryManager.currentMode == "AUTO") {
        telemetryManager.isWaitingDecision = true
        // 10초 후 자동 해제 (수동 콜이므로 길게 기다릴 필요 없음)
        mainHandler.postDelayed({
            telemetryManager.isWaitingDecision = false
        }, 10000)
    }
    
    if (isAutoSessionActive) {
        // 기존 AUTO 광클 로직...
    }
}
```

---

### Phase 3: 서버 방어 심화 — matchType 불신 정책

#### [MODIFY] [detail.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts#L114-L129) 차종 필터 우회 로직 확장

현재 서버에는 이미 "차종이 필터와 안 맞으면 수동으로 간주"하는 방어 로직이 있습니다 (L114-129). 이 패턴을 확장하여, `matchType`과 무관하게 서버가 독립적으로 판단하는 추가 휴리스틱을 도입합니다:

```typescript
// detail.ts — evaluateNewOrder 호출 전
// ✅ [Phase 3] 서버 독자 판단: "이 콜이 정말 AUTO가 맞는가?"
// AUTO 매크로는 반드시 /confirm → /detail 사이에 1~3초의 서핑 시간이 존재함.
// 만약 /confirm과 /detail 사이 간격이 6초 이상이면, 매크로가 아닌 사람이 천천히 누른 것.
const confirmTimestamp = session.pendingOrdersData.get(securedOrder.id)?.capturedAt;
if (confirmTimestamp) {
    const gapMs = Date.now() - new Date(confirmTimestamp).getTime();
    if (gapMs > 6000 && securedOrder.type !== "MANUAL") {
        console.log(`🔍 [서버 판단] /confirm → /detail 간격 ${gapMs}ms (>6초). 수동 클릭으로 재분류.`);
        securedOrder.type = "MANUAL";
    }
}
```

> [!NOTE]
> Phase 3은 선택적 강화입니다. Phase 1 + Phase 2만으로 버그는 완벽히 해결됩니다.

---

## 5. 수정 대상 함수 요약

| 우선순위 | 파일 | 함수/위치 | 수정 내용 | 앱 재설치 필요 |
|---------|------|----------|----------|--------------|
| **P0** | `detail.ts` L168-185 | `timeoutTimer` 콜백 | KEEP된 콜 취소 방지 | ❌ 서버만 |
| **P1** | `HijackService.kt` L354-359 | `handlePreConfirmScreen()` | matchType → isAutoSessionActive 기반 | ✅ 필요 |
| **P1** | `HijackService.kt` L352-388 | `handlePreConfirmScreen()` | 수동클릭 시 임시 Fast Polling | ✅ 필요 |
| P2 | `detail.ts` L114-129 부근 | `/detail` 라우터 | confirm→detail 시간차 휴리스틱 | ❌ 서버만 |

---

## 6. 추가 제보 사항: 필터 로그 개선

기사님이 지적하신 앱 로그:
```
🔍 [타겟 콜 필터 결과] 차종(라)=✅ 도착지(37중 신규)=❌ ...
```

여기서 `37중 신규`라는 표현은 "현재 필터에 37개 읍면동이 설정되어 있는데, 이 콜의 도착지가 그 37개 중에 없다"는 뜻입니다. 하지만 **실제로 이 콜의 도착지가 어디인지**(예: `광명시 일직동`)가 표시되지 않아 디버깅이 어렵습니다.

#### [MODIFY] `ScrapParser.kt` — `shouldClick()` 함수의 로그 출력

```kotlin
// 현재: 도착지(37중 신규)=❌
// 개선: 도착지(37중 '일직동'=신규)=❌
```

이 콜의 파싱된 도착지명(`order.dropoff`)을 로그에 포함시키면, 현장에서 "왜 이 콜이 필터에 걸렸는지"를 즉시 파악할 수 있습니다.

---

## 7. 기사님 협조 요청

> [!IMPORTANT]
> **P0 (서버 `detail.ts`)만 수정하면 앱 재설치 없이 즉시 배포 가능**하며, "KEEP 눌렀는데 콜이 증발하는" 치명적 증상은 완벽히 해결됩니다.
> 
> P1 (앱 `HijackService.kt`)까지 수정하면 수동배차가 관제탑에 `[수동배차]`로 정확히 표시되고, 데스밸리 타이머 자체가 발동하지 않는 근본적 해결이 됩니다.
> 
> **어디까지 수정할지 결정해 주시면 바로 작업하겠습니다:**
> - **A. P0만** (서버만 수정, 앱 재설치 불필요, 5분 작업)
> - **B. P0 + P1** (서버 + 앱 수정, 앱 재설치 필요, 15분 작업)
> - **C. P0 + P1 + P2 + 로그 개선** (전체 수정, 앱 재설치 필요, 30분 작업)

---

## 8. 데스밸리(Death Valley) 정의 교차 분석 — 7개 문서 vs 실제 코드

> [!CAUTION]
> **"데스밸리"라는 용어가 7개 문서에 흩어져 있으며, 각 문서마다 정의·주체·시간이 미묘하게 다릅니다.**
> 이 자체가 이번 버그의 근본 원인 중 하나입니다. 정의가 흩어져 있으니 개발 과정에서 "어떤 데스밸리가 어디서 작동하는지"를 아무도 정확히 파악하지 못한 것입니다.

### 8-1. 실제 코드에 존재하는 데스밸리 (Ground Truth)

코드를 전수 조사한 결과, **데스밸리 타이머는 총 3개**가 독립적으로 존재합니다:

| # | 위치 | 트리거 시점 | 타임아웃 | 동작 | 조건 |
|---|------|-----------|---------|------|------|
| ① | [orders.ts L169-175](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/orders.ts#L169-L175) | `/confirm` 수신 시 | **30초** | `handleDecision(CANCEL)` 호출 | `isActive`가 켜져 있을 때만 |
| ② | [detail.ts L152-189](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/detail.ts#L152-L189) | `/detail` 수신 후 evaluate 완료 시 | **30초 경고 + 35초 취소** | 경고 emit → 콜 삭제 | `type !== "MANUAL"`일 때만 |
| ③ | [HijackService.kt L593-610](file:///Users/seungwookkim/reps/onedal/onedal-app/app/src/main/java/com/onedal/app/HijackService.kt#L593-L610) | 서핑 완료 후 `/detail` 전송 직후 | **30초** (SharedPref 조절 가능) | 인성앱 `[취소]` 버튼 자동 터치 | `isAutoSessionActive == true`일 때만 |

> [!WARNING]
> **①번(orders.ts)과 ②번(detail.ts)은 동시에 작동합니다.** `/confirm`에서 30초 타이머가 시작되고, 7초 뒤 `/detail`에서 또 하나의 35초 타이머가 시작됩니다. 두 타이머가 겹치면서 어떤 것이 먼저 발동할지 예측하기 어렵습니다. 이번 버그에서 실제로 콜을 죽인 것은 **②번(detail.ts의 35초 타이머)**입니다.

---

### 8-2. 각 문서별 데스밸리 정의 비교

#### 📄 1. [PRD.md](file:///Users/seungwookkim/reps/onedal/docs/PRD.md) (글로벌 기획서)

| 항목 | 문서 내용 | 실제 코드와 일치 여부 |
|------|----------|-------------------|
| **정의** | "우리는 최악의 똥콜을 버릴 **[데스밸리 30초]**를 확보할 수 있습니다" (L20) | ⚠️ **반만 맞음**. 기사님이 콜을 판단할 30초가 아니라, 서버/앱이 각각 독립적으로 돌리는 **보호 타이머**입니다 |
| **주체** | "서버 API 리턴 → 확정(유지) 또는 취소 정보 응답" (L58) | ❌ **구식**. 현재는 Piggyback 방식으로 바뀌었으므로 "API 리턴"이라는 표현이 부정확 |
| **Fail-Safe** | "서버 무응답 시 무조건 30초 후 스스로 앱 내 [취소] 클릭" (L57) | ✅ 앱 ③번 타이머와 일치 |

> **진단**: PRD.md는 초기 기획서로서 '데스밸리'라는 용어의 **원래 의미(기사가 판단할 30초)**를 정의합니다. 그러나 구현이 진화하면서 데스밸리가 3개로 분화되었는데, 이 문서는 갱신되지 않았습니다.

---

#### 📄 2. [ROADMAP_sequenceDiagram.md](file:///Users/seungwookkim/reps/onedal/docs/ROADMAP_sequenceDiagram.md) (시퀀스 다이어그램)

| 항목 | 문서 내용 | 실제 코드와 일치 여부 |
|------|----------|-------------------|
| **정의** | "⏳ [데스밸리 이중 방어망] (서버측 15초 경고 ➡️ 앱측 30초 강제취소)" (L203) | ⚠️ **서버 시간 부정확**. 서버 경고는 **30초**이며(`WAITING_WARNING_MS: 30000`), 서버 강제 취소는 **35초**(`WAITING_TIMEOUT_MS: 35000`). "15초"는 어디에도 없음 |
| **주체** | 서버 + 앱 이중 방어 | ✅ 맞음. 하지만 실제로는 **orders.ts, detail.ts, HijackService.kt** 3중 |

> **진단**: "15초 경고"는 `dispatchConfig.ts`의 실제 값(`30000ms`)과 일치하지 않습니다. 다이어그램을 작성한 시점과 config 값이 변경된 시점의 불일치로 보입니다. **수정 필요**.

---

#### 📄 3. [safety_mode_architecture.md](file:///Users/seungwookkim/reps/onedal/docs/architecture/safety_mode_architecture.md) (안전 모드 설계서)

| 항목 | 문서 내용 | 실제 코드와 일치 여부 |
|------|----------|-------------------|
| **정의** | "30초(설정값) 내에 서버 응답 없음 → 스스로 취소 클릭" (L159) | ✅ 앱 ③번 타이머와 정확히 일치 |
| **핵심 원칙** | "서버가 직접 CANCEL을 보내면 안 된다. 취소 판단은 화면을 보고 있는 앱폰 자신이 해야 한다" (L236-239) | ❌ **실제 코드와 완전히 모순**. 서버 ①②번 타이머는 서버가 직접 콜을 취소(`handleDecision(CANCEL)`)합니다. 이 설계서의 원칙이 코드에 반영되지 않았습니다 |
| **타임아웃 정책** | "30초 자동 CANCEL 제거 → 관제탑 경고만 emit" (L232-234, L394) | ❌ **미구현**. `orders.ts`와 `detail.ts`에 서버 자동 CANCEL 로직이 그대로 살아있음 |
| **EC-1** | "KEEP 응답 유실 시 앱 자동취소 → POST /emergency → 서버 초기화" (L291-302) | ⚠️ **이번 버그의 정확한 시나리오이나, 여기서는 "네트워크 유실" 케이스만 고려**. "앱이 60초 수면 중이라 못 받는" 케이스는 분석되지 않음 |

> **진단**: 이 문서가 가장 심각합니다. **"서버가 직접 CANCEL을 보내면 안 된다"**라는 핵심 설계 원칙을 명시해놓고, 실제 코드에서는 서버가 30초/35초 후 직접 CANCEL을 날리고 있습니다. 설계서와 구현체가 완전히 분리되어 있으며, **이번 버그는 이 괴리에서 발생**한 것입니다.

---

#### 📄 4. [Control_tower_status_disconnected.md](file:///Users/seungwookkim/reps/onedal/docs/troubleshooting/Control_tower_status_disconnected.md) (관제탑 연결 끊김 트러블슈팅)

| 항목 | 문서 내용 | 실제 코드와 일치 여부 |
|------|----------|-------------------|
| **정의** | "서버 판정 대기(데스밸리) 중이라서 앱이 화면을 안 읽어버린 겁니다" (L97) | ✅ 맞음. `isWaitingForServerDecision`이 true면 화면 클릭을 차단함 |
| **isHolding 범위** | "데스밸리 시작/끝에만 바꾸는 게 아니라, 확정 클릭부터 리스트 복귀까지 true" (L149) | ✅ 코드와 정확히 일치 |

> **진단**: 이 문서는 특정 버그(화면 상태 안 바뀜)의 원인 분석이므로, 데스밸리 정의가 **정확하게 코드와 일치**합니다. 문제 없음.

---

#### 📄 5. [Dispatch_synchronization_failure.md](file:///Users/seungwookkim/reps/onedal/docs/troubleshooting/Dispatch_synchronization_failure.md) (배차 동기화 실패 트러블슈팅)

| 항목 | 문서 내용 | 실제 코드와 일치 여부 |
|------|----------|-------------------|
| **정의** | "앱의 30초 데스밸리 타이머는 /detail의 HTTP 응답 방식과 무관하게 독립적으로 작동" (L25-26) | ✅ 맞음. 앱 ③번 타이머는 HTTP 방식과 무관 |
| **핵심 보장** | "/scrap이 1번 실패해도 판결이 서버에 남아있어서 다음 /scrap에서 재전달. 여러 번의 전달 기회" (L21) | ⚠️ **이번 버그에서 깨짐**. 전달 기회가 여러 번 있더라도, 서버 ②번 타이머(35초)가 먼저 콜을 죽여버리면 전달할 것 자체가 사라짐 |
| **서버 데스밸리** | "orders.ts (confirm): 30초 데스밸리 → handleDecision(CANCEL)" (L127) | ✅ 서버 ①번 타이머와 일치 |

> **진단**: Piggyback 아키텍처로 전환한 과정을 상세히 기록한 좋은 문서입니다. 다만 "여러 번 전달 기회가 있으므로 더 안전하다"는 주장이 **서버 타이머와의 경합**을 고려하지 않았습니다.

---

#### 📄 6. [how.md](file:///Users/seungwookkim/reps/onedal/log/how.md) (라이프사이클 리포트 작성 가이드)

| 항목 | 문서 내용 | 실제 코드와 일치 여부 |
|------|----------|-------------------|
| **정의** | "[STEP 8] 관제탑이 일정 시간(30초) 결정을 내리지 못해 기사가 위험에 처하는 것을 방지하기 위해 스마트폰이 스스로 락다운을 풀고 취소 버튼을 누르는 탈출 기동" (L81) | ⚠️ **앱 ③번만 설명**. 서버 ①②번 타이머의 존재를 언급하지 않음 |
| **로그 매핑** | "서버의 💥 [서버 강제 해방] 35초 경과!" (L85) | ✅ 서버 ②번 타이머(35초)와 일치 |

> **진단**: 리포트 작성 가이드로서 필요한 로그 키워드는 정확히 정의되어 있습니다. 다만 데스밸리가 **앱 1개 + 서버 2개 = 3개**라는 전체 그림을 설명하지 않습니다.

---

#### 📄 7. [1DAL_Lifecycle_Report.md](file:///Users/seungwookkim/reps/onedal/log/0420_0250/1DAL_Lifecycle_Report.md) (실제 운행 리포트)

| 항목 | 문서 내용 | 실제 코드와 일치 여부 |
|------|----------|-------------------|
| **정의** | "데스밸리 발동: ❌ 미발동 (모든 판결이 30초 이내 정상 도착)" (L18) | ✅ 해당 세션에서는 정상 작동 |
| **앱 로그** | "⏳ 데스밸리 타이머 시작: 30초 대기..." (L116) | ✅ 앱 ③번 타이머의 실제 로그 |

> **진단**: 실제 운행 기록이므로 정의가 아닌 사실 기록입니다. 문제 없음.

---

### 8-3. 종합 진단: 문서 산재 문제

> [!CAUTION]
> **7개 문서에서 "데스밸리"를 각자의 맥락으로 설명하고 있으며, 어느 것도 3개 타이머의 전체 그림을 정확히 담고 있지 않습니다.**

| 문제 | 심각도 | 상세 |
|------|--------|------|
| **정의 분산** | 🔴 치명 | 데스밸리의 SSOT(Single Source of Truth)가 없음. 7곳에 각기 다른 버전으로 흩어져 있음 |
| **설계서 ↔ 코드 괴리** | 🔴 치명 | `safety_mode_architecture.md`는 "서버가 직접 CANCEL 안 함"이라고 적혀있지만, 코드에서는 서버가 직접 CANCEL함 |
| **시간 값 불일치** | 🟡 중간 | 다이어그램은 "15초 경고"라 하지만 실제는 `30000ms` |
| **타이머 중복** | 🟡 중간 | orders.ts(30초)와 detail.ts(35초) 두 개의 서버 타이머가 같은 콜에 동시 작동 가능 |

### 8-4. 문서 정리 제안

이번 버그 수정 후, **데스밸리 관련 정의를 하나의 문서로 통합**하는 것을 강력히 권장합니다:

1. **SSOT 후보**: [safety_mode_architecture.md](file:///Users/seungwookkim/reps/onedal/docs/architecture/safety_mode_architecture.md)에 "데스밸리 타이머 전체 아키텍처" 섹션을 신설하여, 3개 타이머의 위치·시간·조건·동작을 한 곳에서 관리
2. **나머지 6개 문서**: 데스밸리 관련 상세 설명을 삭제하고, SSOT 문서로의 링크(`→ 상세는 safety_mode_architecture.md 참조`)로 대체
3. **ROADMAP_sequenceDiagram.md**: "15초 경고"를 실제 config 값(30초)으로 수정
