# 🚥 1DAL 백엔드 합짐 상태 머신 (Dispatch State Machine)

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 기사님의 운행 상태에 따라 필터 기준과 라우팅 모드를 동적으로 전환하는 `StateMachine` 클래스 명세.

---

## 1. StateMachine 클래스 인터페이스

관제탑(React UI)에서 기사가 `dispatch-decision` (KEEP / CANCEL) 버튼을 클릭할 때마다 호출되며, 메모리 세션의 `activeFilter` 상태를 돌연변이(Mutate) 시킵니다.

```typescript
// src/core/engine/StateMachine.ts

export type DispatchPhase = 'STANDBY' | 'GATHERING' | 'DRIVING';

export interface StateTransitionResult {
    /** 필터 변경 발생 여부 (true일 경우 UI 소켓 브로드캐스팅 필요) */
    changed: boolean;
    /** 변경된 새 필터 객체 */
    newFilter?: AutoDispatchFilter;
    /** 롤백 등의 사유 메시지 */
    reason?: string;
}

export class StateMachine {
    /**
     * 오더가 확정(KEEP)되었을 때 상태를 전진시킵니다.
     * @param session 현재 유저의 메모리 세션
     * @param order 확정된 오더 정보
     * @returns 상태 변경 결과
     */
    public static advanceOnKeep(session: UserSession, order: MyOrder): StateTransitionResult {
        // ...
    }

    /**
     * 오더가 취소/방출(CANCEL)되었을 때 상태를 롤백시킵니다.
     * @param session 현재 유저의 메모리 세션
     * @param orderId 취소된 오더 ID
     * @returns 상태 변경 결과
     */
    public static rollbackOnCancel(session: UserSession, orderId: string): StateTransitionResult {
        // ...
    }
}
```

---

## 2. 상태별 상세 행동 스펙 (Behaviors)

### Phase 1: `STANDBY` (대기 상태)
기사님이 아무 콜도 잡지 않은 빈 차 상태입니다.
- **모드**: `isSharedMode = false`
- **필터 룰**: 
  - `minFare` 검사 활성화 (설정된 첫짐 하한가 미달 시 광속 기각)
  - `destinationKeywords` (목적지 회랑 필터) 무시
- **라우팅 알고리즘**: 카카오 **Solo 라우팅** 연산만 수행 (`kakaoSoloDistanceKm` 등).

### Phase 2: `GATHERING` (합짐 탐색 상태)
`STANDBY`에서 첫 콜을 잡은 직후(KEEP) 전환됩니다. 상차지로 이동 중이거나 아직 출발 전입니다.
- **모드**: `isSharedMode = true`
- **필터 룰**: 
  - `minFare` 검사 비활성화. 대신 `PricingEngine`의 수용 하한선(`minAcceptable`) 검사가 빡빡하게 적용.
  - 카카오 회랑 알고리즘에 의해 `destinationKeywords` 가 자동 부여되어, 엉뚱한 곳으로 가는 콜은 즉시 기각.
- **라우팅 알고리즘**: 카카오 **TSP 우회 동선(Detour) 라우팅**이 작동합니다.

### Phase 3: `DRIVING` (운행 중 상태)
짐을 싣고 고속도로 등에 진입한 상태입니다. (UI에서 기사가 수동 조작으로 진입)
- **특징**: `GATHERING`과 동일하게 작동하지만, 앱의 탐색 반경(`pickupRadius`)이 기사님의 실시간 현재 위치(GPS) 기준으로 좁혀져 "가는 길 동선"에 있는 콜만 사냥하게 됩니다.

---

## 3. 전이(Transition) 및 롤백(Rollback) 로직

### 3.1 `advanceOnKeep` (전진)
```typescript
const currentPhase = session.activeFilter.dispatchPhase;

if (currentPhase === 'STANDBY') {
    // 첫짐을 잡았음 -> GATHERING으로 전이
    const newFilter = {
        ...session.activeFilter,
        isSharedMode: true,
        dispatchPhase: 'GATHERING',
        destinationKeywords: calculateCorridor(order.routePolyline) // 회랑 추출
    };
    return { changed: true, newFilter };
} else {
    // GATHERING / DRIVING 유지 (추가 합짐)
    // 회랑 키워드만 새로운 폴리라인에 맞게 재계산
    return { 
        changed: true, 
        newFilter: { ...session.activeFilter, destinationKeywords: recalculate() } 
    };
}
```

### 3.2 `rollbackOnCancel` (롤백)
관제사가 콜을 방출할 경우 발생합니다.
```typescript
// 해당 콜 삭제 후, 내 퀵(myOrders)의 남은 콜 개수 확인
const remainingCalls = session.myOrders.filter(c => c.status === 'ORDER_CONFIRMED');

if (remainingCalls.length === 0) {
    // 텅 빔 -> STANDBY로 완전 롤백
    const newFilter = {
        ...session.activeFilter,
        isSharedMode: false,
        dispatchPhase: 'STANDBY',
        destinationKeywords: []
    };
    return { changed: true, newFilter, reason: "모든 콜이 취소되어 STANDBY 복귀" };
} else {
    // 본콜은 유지 중이므로 GATHERING 상태 유지, 회랑만 재계산
    return { changed: true, newFilter: recalculate(), reason: "서브콜 취소, 회랑 재계산" };
}
```
