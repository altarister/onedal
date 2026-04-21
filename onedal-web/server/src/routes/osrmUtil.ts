export interface RouteGeometry {
  coordinates: [number, number][]; // LineString 형태의 여러 점들
  totalDistanceKm: number;          // 실제 주행 거리
  durationSeconds: number;          // 예상 주행 시간
  roadNames?: string[];             // 주행 도로명 리스트 (수도권제1순환고속도로 등)
}

// OSRM API 응답을 메모리에 저장하는 캐시 (LRU 방식 시뮬레이션용, 최대 100개 제한)
const osrmCache = new Map<string, RouteGeometry>();

/**
 * [Main API] OSRM 공용 서버를 통한 진짜 주행 궤적 및 주행 거리 요청.
 * @param waypoints 출발지 -> 상차1.. -> 하차1.. 순서의 연속된 좌표 배열
 */
export async function fetchRealWorldRoute(waypoints: Array<{ name?: string, centroid?: [number, number] }>): Promise<RouteGeometry | null> {
  // 최소 2개의 좌표가 필요
  const validPoints = waypoints.filter(wp => !!wp.centroid);
  if (validPoints.length < 2) {
    return null;
  }

  // OSRM API format: {lon},{lat};{lon},{lat}...
  const coordinatesStr = validPoints.map(wp => `${wp.centroid![0]},${wp.centroid![1]}`).join(';');
  
  // 캐시 확인 로직: 동일한 좌표 나열로 요청한 캐시가 있으면 네트워크 통신 없이 즉시 반환
  if (osrmCache.has(coordinatesStr)) {
    return osrmCache.get(coordinatesStr)!;
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesStr}?overview=full&geometries=geojson&steps=true`;

  try {
    const controller = new AbortController();
    const timerIds = setTimeout(() => controller.abort(), 4500); // 4.5초 타임아웃 (서버 응답 대기)

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timerIds);

    if (!response.ok) {
      throw new Error(`OSRM 통신 실패: ${response.status}`);
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      throw new Error(`OSRM 라우팅 불가 구역: ${data.code}`);
    }

    const route = data.routes[0];
    const geometry = route.geometry; // GeoJSON LineString
    const distanceMeters = route.distance;
    const durationSec = route.duration;

    // 도로명 추출 (고유한 텍스트만)
    const roadNamesSet = new Set<string>();
    if (route.legs) {
      route.legs.forEach((leg: any) => {
        if (leg.steps) {
          leg.steps.forEach((step: any) => {
            if (step.name && step.name.trim() !== "") {
              roadNamesSet.add(step.name);
            }
            if (step.ref && step.ref.trim() !== "") { // 88, 100 같은 국도/고속도로 번호 표기
              roadNamesSet.add(step.ref);
            }
          });
        }
      });
    }
    
    // 단순 교차로(intersection) 등 무의미한 이름 제외
    const filteredRoadNames = Array.from(roadNamesSet).filter(r => 
      !r.toLowerCase().includes('intersection') &&
      !r.toLowerCase().includes('turn')
    );

    const result: RouteGeometry = {
      coordinates: geometry.coordinates as [number, number][],
      totalDistanceKm: distanceMeters / 1000,
      durationSeconds: durationSec,
      roadNames: filteredRoadNames,
    };

    // 캐시 저장 (메모리 누수 방지를 위해 최대 100개로 제한)
    if (osrmCache.size > 100) {
      const firstKey = osrmCache.keys().next().value;
      if (firstKey) osrmCache.delete(firstKey);
    }
    osrmCache.set(coordinatesStr, result);

    return result;
  } catch (error: any) {
    console.warn('[OSRM Route Warning] 외부 통신 실패. 궤적 그리기를 포기하고 에러를 던집니다.', error.message);
    throw error;
  }
}
