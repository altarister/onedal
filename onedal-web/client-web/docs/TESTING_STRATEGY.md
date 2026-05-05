# 🧪 1DAL 관제웹 — Testing Strategy

> **문서 상태**: v1  
> **작성일**: 2026-05-05  
> **목적**: 관제웹의 테스트 범위, 도구, 작성 규칙을 정의합니다.

---

## 1. 테스트 범위 정의

### ✅ 테스트하는 것 (Layer 1: 순수 로직)

| 대상 | 파일 | 이유 |
|------|------|------|
| 상태 판별 함수 | `orderConstants.ts` | `isTerminal()`, `isEvaluating()` — 오판 시 UI 전체에 영향 |
| TSP 경로 최적화 | `routeOptimizer.ts` | 상차/하차 순서 결정 로직 — 오류 시 비효율 경로 안내 |
| 거리/시간 계산 | `routeUtils.ts` | `getDistanceKm()`, `getMinuteDiff()`, `getAddressLabel()` |
| 공유 타입 상수 | `shared/src/index.ts` | `deriveDispatchPhase()`, `getEffectiveCorridorRadius()` |

### ❌ 테스트하지 않는 것

| 대상 | 이유 |
|------|------|
| UI 컴포넌트 렌더링 | Testing Library + jsdom 셋업 비용 대비 ROI 낮음 (컴포넌트 15개) |
| 소켓 이벤트 핸들러 | 실제 소켓 연결 필요. E2E 영역 |
| Canvas 렌더링 | Canvas 2D API 모킹이 복잡하고 시각적 검증이 불가능 |
| E2E 플로우 | CI 인프라 필요. 현재 단계에서 과함 |

---

## 2. 도구: Vitest

### 왜 Vitest인가?
- Vite 프로젝트에서 **설정 0줄**로 바로 사용 가능
- Jest와 100% 호환되는 API (`describe`, `it`, `expect`)
- ESM 네이티브 지원 (Vite와 동일한 번들러 사용)

### 설치
```bash
pnpm add -D vitest
```

### 설정 (`vitest.config.ts`)
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',  // 순수 로직 테스트이므로 jsdom 불필요
  },
});
```

### 실행
```bash
npx vitest run        # 1회 실행
npx vitest            # watch 모드
```

---

## 3. 테스트 대상 함수 목록

### `lib/orderConstants.ts`
```typescript
// 테스트 케이스 예시
describe('isTerminal', () => {
  it('ORDER_COMPLETED는 터미널 상태', () => {
    expect(isTerminal('ORDER_COMPLETED')).toBe(true);
  });
  it('ORDER_CONFIRMED는 터미널이 아님', () => {
    expect(isTerminal('ORDER_CONFIRMED')).toBe(false);
  });
  it('undefined는 터미널이 아님', () => {
    expect(isTerminal(undefined)).toBe(false);
  });
});
```

### `lib/routeOptimizer.ts`
```typescript
describe('optimizeRouteOrder', () => {
  it('가장 가까운 상차지부터 방문 (TSP Nearest Neighbor)', () => {
    // 현위치(0,0)에서 가까운 순: B(1,1) → A(5,5)
    const result = optimizeRouteOrder(pickups, dropoffs, {x:0, y:0});
    expect(result[0].routeId).toBe('order-B');
  });
  it('좌표 없는 포인트는 제외', () => {
    // pickupX/Y가 undefined인 경우 건너뛰기
  });
});
```

### `lib/routeUtils.ts`
```typescript
describe('getDistanceKm', () => {
  it('서울-부산 약 325km', () => {
    const d = getDistanceKm(37.5665, 126.978, 35.1796, 129.0756);
    expect(d).toBeGreaterThan(320);
    expect(d).toBeLessThan(330);
  });
});

describe('getAddressLabel', () => {
  it('동 단위 추출', () => {
    expect(getAddressLabel('경기 성남시 분당구 정자동')).toBe('정자동');
  });
  it('구 단위 폴백', () => {
    expect(getAddressLabel('서울 강남구')).toBe('강남구');
  });
});
```

---

## 4. 테스트 작성 컨벤션

### 파일 위치
테스트 파일은 대상 파일과 **같은 디렉토리**에 배치:
```
lib/
├── routeUtils.ts
├── routeUtils.test.ts     ← 여기
├── routeOptimizer.ts
└── routeOptimizer.test.ts ← 여기
```

### 네이밍 규칙
- 파일: `{대상파일명}.test.ts`
- describe: 함수명 또는 모듈명
- it: 한국어로 기대 동작 서술 (예: `'ORDER_COMPLETED는 터미널 상태'`)

### 모킹 가이드
- **순수 함수**: 모킹 불필요 (입력 → 출력만 검증)
- **소켓/API**: 현재 테스트 범위에서 제외. 추후 필요 시 `vi.mock()` 활용
