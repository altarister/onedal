# ⚠️ 1DAL 백엔드 엣지 케이스 및 예외 복구 시나리오

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 시스템 붕괴를 막기 위한 DB 락, 좀비 세션, 고스트 터치 방어 로직 명세.

---

## 1. 고스트 응답 방어 (Ghost Defense)

**상황**: 관제사가 화면에서 `[CANCEL]`을 누른 직후, 0.1초 차이로 앱에서 **새로운 콜** 상세 화면을 캡처하여 보냄. 앱은 서버의 이전 응답(`CANCEL`)을 새 콜에 대한 응답으로 오인하여 잘못된 [취소] 버튼을 눌러버림.

**해결 (코드 명세)**: 서버는 결재 응답 시 반드시 `orderId`를 동봉하며, 안드로이드 앱(`HijackService`)은 이를 대조합니다.

```typescript
// 서버 측 (src/routes/scrap.ts)
if (session.pendingDecisions.has("1DAL-NEW")) {
    const decision = session.pendingDecisions.get("1DAL-NEW")!;
    // 응답에 결재 액션과 함께 타겟 orderId를 강제 삽입
    resBody.decisions.push({ orderId: "1DAL-NEW", action: decision.action });
    session.pendingDecisions.delete("1DAL-NEW");
}
```

```kotlin
// 앱 측 (HijackService.kt 콜백)
telemetryManager.decisionCallback = { receivedOrderId, action ->
    // 수신한 ID와 내 폰에 현재 띄워진 오더 ID가 다르면 무시! (Ghost Defense)
    if (receivedOrderId != session.currentOrderId) {
        AppLogger.e("Ghost Defense 발동! 엉뚱한 결재 폐기됨")
        return@decisionCallback
    }
    executeDecisionImmediately(action) // ID가 일치할 때만 타격
}
```

---

## 2. SQLite Database Lock (동시성 제어)

**상황**: 초당 수십 번 호출되는 `POST /api/scrap` 하트비트가 동시에 `UPDATE orders`를 시도할 경우 `SQLITE_BUSY` 에러 발생.

**해결**: DB 트랜잭션 타임아웃 셋팅과 함께 Repository 단에서 재시도(Retry) 로직 구현.

```typescript
// src/repositories/OrderRepository.ts

export class OrderRepository {
    public static upsertOrder(order: MyOrder, retries = 3): boolean {
        try {
            db.prepare(`
                INSERT INTO orders (id, status, ...) VALUES (?, ?, ...)
                ON CONFLICT(id) DO UPDATE SET status = excluded.status
            `).run(order.id, order.status);
            return true;
        } catch (err) {
            if (err.code === 'SQLITE_BUSY' && retries > 0) {
                // 100ms 대기 후 재시도
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
                return this.upsertOrder(order, retries - 1);
            }
            console.error("DB Lock 최종 실패:", err);
            return false; // DB 저장이 실패해도 메모리(Session)에 있으므로 치명적이지 않음
        }
    }
}
```

---

## 3. 좀비 세션 클리너 (Zombie Session Garbage Collection)

**상황**: 안드로이드 앱이 터널 진입, 강제 종료 등으로 인해 `/api/scrap` 하트비트를 보내지 못함. 하지만 서버 메모리엔 그 기기가 결재 대기 중이던 오더들이 계속 쌓여있어 RAM이 터짐.

**해결**: `setInterval` 을 이용한 세션 클리너가 10초마다 작동하여 오프라인 기기의 찌꺼기를 청소.

```typescript
// src/state/userSessionStore.ts

setInterval(() => {
    const now = Date.now();
    for (const [deviceId, session] of deviceSessions.entries()) {
        const lastSeenDiff = now - session.lastSeenMs;
        
        // 20초 초과 시 좀비(Zombie)로 판정
        if (lastSeenDiff > DISPATCH_CONFIG.ZOMBIE_SESSION_TIMEOUT_MS) {
            console.log(`[GC] 기기 ${deviceId} 오프라인 판정. 진행중인 큐 초기화.`);
            
            // 대기 중이던 Pending 오더 파기
            session.pendingOrdersData.clear();
            session.pendingDecisions.clear();
            
            // 필터를 초기화하여 앱이 다시 켜졌을 때 즉각 STANDBY로 시작하게 유도
            session.activeFilter.dispatchPhase = 'STANDBY';
            session.activeFilter.isSharedMode = false;
        }
    }
}, 10000);
```
