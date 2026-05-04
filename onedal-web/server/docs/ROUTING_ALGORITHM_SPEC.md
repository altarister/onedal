# 🗺️ 1DAL 카카오 라우팅 및 TSP 알고리즘 명세서

> **문서 상태**: v2.0 (상세 확장판)  
> **목적**: 기사 동선 최적화를 위한 TSP(Traveling Salesperson Problem) 정렬 알고리즘 및 카카오 API 연동 스펙.

---

## 1. TSP(경유지 최적화) 알고리즘 (Greedy Approach)

카카오 API는 출발지, 도착지 외에 최대 5개의 경유지(Waypoints)를 지원합니다. 하지만 경유지 순서를 스스로 정해주지는 않기 때문에 서버에서 **Greedy Nearest Neighbor** 알고리즘으로 상/하차 순서를 먼저 정렬해야 합니다.

```typescript
// src/utils/routeOptimizer.ts

interface Coordinate { x: number; y: number; id: string; type: 'PICKUP' | 'DROPOFF' }

export function optimizeWaypoints(
    driverLoc: Coordinate, 
    pickups: Coordinate[], 
    dropoffs: Coordinate[]
): { sortedWaypoints: Coordinate[], finalDestination: Coordinate } {
    
    const sorted: Coordinate[] = [];
    const remainingPickups = [...pickups];
    const remainingDropoffs = [...dropoffs];

    let currentLocation = driverLoc;

    // 1단계: 모든 짐을 실어야(Pickup)만 하차(Dropoff)가 가능하다는 룰.
    while (remainingPickups.length > 0) {
        // 현 위치에서 가장 가까운 상차지 탐색 (유클리디안 거리 사용)
        const nearestIndex = findNearestIndex(currentLocation, remainingPickups);
        const nextStop = remainingPickups.splice(nearestIndex, 1)[0];
        
        sorted.push(nextStop);
        currentLocation = nextStop; // 현 위치 이동
    }

    // 2단계: 짐을 다 실었으면 가장 가까운 곳부터 하차 시작
    while (remainingDropoffs.length > 0) {
        const nearestIndex = findNearestIndex(currentLocation, remainingDropoffs);
        const nextStop = remainingDropoffs.splice(nearestIndex, 1)[0];
        
        sorted.push(nextStop);
        currentLocation = nextStop;
    }

    // 마지막 배열 값은 최종 도착지(Destination), 나머지는 Waypoints
    const finalDestination = sorted.pop()!;
    
    return { sortedWaypoints: sorted, finalDestination };
}
```

---

## 2. 카카오 다중 경유지 라우팅 API (`KakaoService`)

위에서 도출된 `sortedWaypoints`를 카카오 모빌리티 `directions` API에 파라미터로 넘겨 우회 경로를 산출합니다.

```typescript
// src/services/kakaoService.ts

export class KakaoService {
    /**
     * 본콜과 서브콜을 모두 아우르는 우회 동선(Detour)을 카카오 API로 연산합니다.
     */
    public async calculateDetourRoute(
        startLoc: Coordinate, 
        destLoc: Coordinate, 
        waypoints: Coordinate[]
    ): Promise<RoutingResult> {
        
        const originStr = `${startLoc.x},${startLoc.y}`;
        const destStr = `${destLoc.x},${destLoc.y}`;
        // 카카오 API 경유지 포맷: X,Y|X,Y|X,Y
        const waypointsStr = waypoints.map(w => `${w.x},${w.y}`).join('|');

        try {
            const response = await axios.get('https://apis-navi.kakaomobility.com/v1/directions', {
                headers: { 'Authorization': `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
                params: {
                    origin: originStr,
                    destination: destStr,
                    waypoints: waypointsStr,
                    priority: 'RECOMMEND', // 최단경로 설정
                    car_type: 4 // 화물차(1t) 코드
                }
            });

            const summary = response.data.routes[0].summary;
            return {
                distanceKm: summary.distance / 1000,
                durationMin: Math.round(summary.duration / 60),
                polyline: this.extractPolyline(response.data.routes[0])
            };
        } catch (error) {
            throw new Error(`Kakao API 실패: ${error.message}`);
        }
    }
}
```

---

## 3. OSRM Fallback 전략

카카오 API 리밋에 도달하면 `calculateDetourRoute` 내부 `catch` 블록에서 공개 OSRM 서버로 즉각 우회합니다.

```typescript
// src/services/osrmUtil.ts

export async function fetchOSRMRoute(start: Coordinate, dest: Coordinate, waypoints: Coordinate[]) {
    // OSRM 좌표 규격: Lng,Lat;Lng,Lat
    const coords = [start, ...waypoints, dest].map(c => `${c.x},${c.y}`).join(';');
    const url = `http://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const response = await axios.get(url);
    return {
        distanceKm: response.data.routes[0].distance / 1000,
        durationMin: Math.round(response.data.routes[0].duration / 60),
        polyline: response.data.routes[0].geometry.coordinates // OSRM용 폴리라인 리턴
    };
}
```
