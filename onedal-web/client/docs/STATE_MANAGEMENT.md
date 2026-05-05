# 🗃️ 1DAL 관제웹 — State Management Guide

> **문서 상태**: v1  
> **작성일**: 2026-05-05  
> **목적**: 관제웹의 상태 관리 구조를 정의하고, Zustand 도입 마이그레이션 가이드를 제공합니다.

---

## 1. 상태 분류 기준

관제웹의 모든 상태는 3가지 카테고리로 분류됩니다:

| 카테고리 | 특성 | 저장 위치 | 예시 |
|---------|------|-----------|------|
| **서버 소켓 상태** | 서버가 소켓으로 푸시. 읽기 위주 | Zustand Store | `activeRoute`, `filter`, `devices` |
| **UI 로컬 상태** | 컴포넌트 내부 상호작용 | `useState` (컴포넌트) | `isExpanded`, `processingId`, `activeTab` |
| **영구 저장 상태** | 브라우저 재시작 후에도 유지 | `localStorage` | `access_token`, `onedal-ui-theme`, `onedal_sound_volume` |

### 핵심 원칙
- **서버 소켓 상태** → Zustand 글로벌 스토어로 관리
- **UI 로컬 상태** → 해당 컴포넌트의 `useState`로 유지 (Zustand에 올리지 않음)
- **영구 저장 상태** → `localStorage` 직접 접근 (현재와 동일)

---

## 2. 현재 상태 구조 진단

### 문제: 상태 30개+가 흩어져 있음

| 파일 | useState 개수 | 문제 |
|------|-------------|------|
| `SettingsModal.tsx` | **30개** | 3개 탭의 설정값이 전부 한 컴포넌트에 집중 |
| `useOrderEngine.ts` | **6개** | `activeRoute`, `pendingOrders` 등 핵심 상태가 훅 안에 갇혀있음 |
| `PinnedRoute.tsx` | **4개** | `expandedIds`, `processingId` 등 UI 상태 (이건 적절) |
| `useFilterConfig.ts` | **2개** | `filter`, `baseFilter` — 전역 공유 필요 |

### SettingsModal의 30개 useState
```
vehicleType, defaultPriority, homeAddress, homeCoords, isGeocodingLoading,
geocodeError, destinationCity, destinationRadiusKm, corridorRadiusKm,
isActive, isLoading, volume,
vehicleRates, agencyFeePercent, maxDiscountPercent, minFare, maxFare,
pickupRadiusKm, excludedKeywords, newKeyword, isPricingLoading,
registeredDevices, isDevicesLoading, editingDeviceId, editingName,
pinCode, pinExpiresAt, pinRemainingSeconds, activeTab
```
→ **해결**: 컴포넌트 분해(Phase 3)로 각 탭이 자기 상태만 관리

---

## 3. Zustand 도입 후 구조

### 왜 Zustand인가?

1DAL의 핵심 데이터는 REST 응답이 아닌 **소켓 실시간 스트림**입니다:
- `useOrderEngine` → 소켓으로 `activeRoute` 수신
- `useFilterConfig` → 소켓으로 `filter-init/updated` 수신
- `useDevices` → 소켓으로 `telemetry-devices` 수신

Zustand는 이러한 **클라이언트 메모리 상태**를 관리하는 데 최적입니다.

### 스토어 설계

#### `stores/orderStore.ts`
```typescript
import { create } from 'zustand';
import type { SecuredOrder, SimplifiedOfficeOrder } from '@onedal/shared';

interface OrderState {
  activeRoute: SecuredOrder[];
  pendingOrders: SimplifiedOfficeOrder[];
  isConnected: boolean;
  // actions
  setActiveRoute: (orders: SecuredOrder[]) => void;
  addPendingOrder: (order: SimplifiedOfficeOrder) => void;
  removePendingOrder: (id: string) => void;
  setConnected: (connected: boolean) => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  activeRoute: [],
  pendingOrders: [],
  isConnected: false,
  setActiveRoute: (orders) => set({ activeRoute: orders }),
  addPendingOrder: (order) => set((s) => ({
    pendingOrders: [...s.pendingOrders, order]
  })),
  removePendingOrder: (id) => set((s) => ({
    pendingOrders: s.pendingOrders.filter(o => o.id !== id)
  })),
  setConnected: (connected) => set({ isConnected: connected }),
}));
```

#### `stores/filterStore.ts`
```typescript
interface FilterState {
  filter: AutoDispatchFilter | null;
  baseFilter: AutoDispatchFilter | null;
  setFilter: (filter: AutoDispatchFilter) => void;
  setBaseFilter: (filter: AutoDispatchFilter) => void;
  updateFilter: (partial: Partial<AutoDispatchFilter>) => void;
}
```

#### `stores/deviceStore.ts`
```typescript
interface DeviceState {
  devices: DeviceSession[];
  setDevices: (devices: DeviceSession[]) => void;
}
```

---

## 4. 마이그레이션 가이드

### 점진적 전환 전략

기존 훅을 **래퍼로 유지**하여 호환성을 보장합니다:

```typescript
// hooks/useOrderEngine.ts (마이그레이션 후)
// 소켓 이벤트 연결만 담당하고, 상태는 store에서 관리
export function useOrderEngine() {
  const store = useOrderStore();
  
  useEffect(() => {
    // 소켓 이벤트 → store 업데이트
    socket.on("sync-active-orders", (orders) => {
      store.setActiveRoute(orders);
    });
    // ...
  }, []);

  // 기존 반환값 유지 (하위 호환)
  return {
    activeRoute: store.activeRoute,
    pendingOrders: store.pendingOrders,
    isConnected: store.isConnected,
    handleDecision: (id, action) => socket.emit("decision", { orderId: id, action }),
    handleRecalculate: (id, priority) => socket.emit("recalculate-route", { orderId: id, priority }),
  };
}
```

### 전환 순서
1. Zustand 설치 + 빈 스토어 생성
2. `useOrderEngine` 내부의 `useState` → `useOrderStore` 교체 (반환값 동일)
3. `useFilterConfig` 내부의 `useState` → `useFilterStore` 교체
4. `useDevices` 내부의 `useState` → `useDeviceStore` 교체
5. 컴포넌트에서 직접 `useOrderStore()` 접근 가능하게 됨 (prop drilling 감소)
