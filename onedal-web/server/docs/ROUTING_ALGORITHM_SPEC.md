# 🗺️ 1DAL 카카오 라우팅 및 TSP 알고리즘 명세서

> **문서 상태**: v3.0 (코드 동기화)  
> **SSOT 코드**: [kakaoService.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/services/kakaoService.ts), [routeOptimizer.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/utils/routeOptimizer.ts)

---

## 1. 설계 의도

기사의 동선을 최적화하기 위해 TSP(Traveling Salesperson Problem)로 경유지 순서를 정렬한 뒤, 카카오 모빌리티 API로 실제 도로 기반 거리/시간을 산출합니다.

---

## 2. TSP 정렬 알고리즘 (Greedy Nearest Neighbor)

카카오 API는 경유지 순서를 자동 정렬해주지 않으므로, 서버가 먼저 정렬합니다.

```mermaid
flowchart LR
    A["기사 현위치"] --> B["가장 가까운\n상차지 탐색"]
    B --> C["모든 상차지\n순회 완료"]
    C --> D["가장 가까운\n하차지 탐색"]
    D --> E["최종 도착지"]
    
    style A fill:#7c3aed,color:#fff
    style E fill:#10b981,color:#fff
```

**핵심 규칙**: 모든 짐을 실어야(Pickup 완료) 하차(Dropoff) 가능.

> 코드: [routeOptimizer.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/utils/routeOptimizer.ts)

### `optimizeWaypoints` 시그니처 (실제 코드)

```typescript
optimizeWaypoints(
    driverLoc: { x: number; y: number },
    allPickups: { x: number; y: number }[],
    allDropoffs: { x: number; y: number }[]
): { sortedPickups: Coordinate[], sortedDropoffs: Coordinate[] }
```

---

## 3. 카카오 라우팅 API 연동

### 3.1 단독 연산 (`calculateSoloRoute`)

상차지 → 하차지 직선 경로. STANDBY 모드에서 사용.

### 3.2 합짐 연산 (`calculateDetourRoute`)

TSP 정렬된 경유지를 포함한 우회 경로. GATHERING/DRIVING 모드에서 사용.
카카오 다중 경유지 API(`POST /v1/waypoints/directions`)로 최대 30개 Waypoints 지원.

> 코드: [kakaoService.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/services/kakaoService.ts)

---

## 4. OSRM Fallback 전략

카카오 API 리밋 도달 시 공개 OSRM 서버(`router.project-osrm.org`)로 자동 우회합니다.

> 코드: [osrmUtil.ts](file:///Users/seungwookkim/reps/onedal/onedal-web/server/src/routes/osrmUtil.ts)
