import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import type { FeatureCollection, Polygon, MultiPolygon, Feature } from 'geojson';

let mergedMapFeatureCollection: FeatureCollection<Polygon | MultiPolygon> & { features: Array<Feature<Polygon | MultiPolygon> & { bbox?: number[] }> } | null = null;

export function initGeoService() {
    try {
        const filePath = path.join(__dirname, '../../mapData/merged_map.geojson');
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed && parsed.type === 'FeatureCollection') {
            // [최적화] 서버 로딩 시점에 전국 읍면동 폴리곤의 Bounding Box를 미리 계산하여 메모리에 저장
            parsed.features.forEach((f: any) => {
                f.bbox = turf.bbox(f);
            });
            mergedMapFeatureCollection = parsed;
            console.log(`🗺️ [GeoService] 전국 자치구/읍면동 폴리곤 로드 성공 (총 ${parsed.features?.length || 0}개 방어구역)`);
        } else {
            console.warn(`🗺️ [GeoService] merged_map.geojson 형식이 올바른 FeatureCollection이 아닙니다.`);
        }
    } catch (e) {
        console.error(`🗺️ [GeoService] GeoJSON 지도 데이터 로드 실패 (mapData/merged_map.geojson 확인 요망):`, e);
    }
}

/**
 * 주어진 카카오 경로(Polyline)에 맞춰 반경(corridorRadiusKm)만큼의 회랑(Corridor) 폴리곤을 시뮬레이션하고,
 * 하차 거점(마지막 좌표)에 대해 (destinationRadiusKm)만큼의 넓은 원 폴리곤을 시뮬레이션하여 두 폴리곤을 합병한 뒤,
 * 그 영역에 찍힌 모든 읍/면/동 행정구역명 키워드를 추출해 반환합니다.
 */
export function getCorridorRegions(polyline: Array<{x: number; y: number}>, corridorRadiusKm: number, destinationRadiusKm?: number): { flat: string[], grouped: Record<string, string[]>, customCityFilters: string[] } | null {
    if (!mergedMapFeatureCollection || !mergedMapFeatureCollection.features) return null;
    if (!polyline || polyline.length < 2) return null;

    // 1. LineString 변환 (카카오 x:경도, y:위도 -> GeoJSON [lng, lat])
    const lineCoords = polyline.map(p => [p.x, p.y]);
    let lineFeature;
    try {
        const rawLine = turf.lineString(lineCoords);
        // 🚀 [최적화] Douglas-Peucker 알고리즘: 점 1000개짜리 궤적을 10개 수준으로 대폭 압축 (Tolerance: 약 200m)
        // 궤적 주변 반경을 어차피 5~10km 단위로 넓게 잡으므로, 200m 오차는 연산 결과에 영향을 주지 않으면서 속도만 수백 배 상승시킴
        lineFeature = turf.simplify(rawLine, { tolerance: 0.002, highQuality: false });
    } catch(e) {
        console.error("🗺️ [GeoService] 유효하지 않은 Polyline 배열 형태입니다.", e);
        return null;
    }

    // 2. 경로 주변 두께(Buffer) 생성 -> 터널/회랑 폴리곤 완성
    let corridorPolygon: any;
    try {
        const buffRadius = corridorRadiusKm <= 0 ? 0.05 : corridorRadiusKm; 
        corridorPolygon = turf.buffer(lineFeature, buffRadius, { units: 'kilometers' });

        // [신규] 하차 거점 주변 반경(destinationRadiusKm) 합병
        if (destinationRadiusKm && destinationRadiusKm > 0 && lineCoords.length > 0) {
            const lastCoord = lineCoords[lineCoords.length - 1];
            const destFeature = turf.point(lastCoord);
            const destPolygon = turf.buffer(destFeature, destinationRadiusKm, { units: 'kilometers' });
            
            // 회랑 폴리곤과 하차 반경 폴리곤을 하나로 합침
            const polygons: Feature<Polygon | MultiPolygon>[] = [];
            if (corridorPolygon) polygons.push(corridorPolygon as Feature<Polygon | MultiPolygon>);
            if (destPolygon) polygons.push(destPolygon as Feature<Polygon | MultiPolygon>);
            
            if (polygons.length > 0) {
                const fc = turf.featureCollection(polygons);
                const unionResult = turf.union(fc);
                if (unionResult) corridorPolygon = unionResult;
            }
        }
    } catch (e) {
        console.error("🗺️ [GeoService] Turf.js buffer 생성 에러:", e);
        return null;
    }
    if (!corridorPolygon) return null;

    // 🚀 [최적화] 완성된 최종 회랑 폴리곤의 Bounding Box를 우선 계산
    const corridorBbox = turf.bbox(corridorPolygon);

    // 3. 교차점 검사 (Intersect)
    const matchedRegionNames = new Set<string>();
    const groupedRegions: Record<string, Set<string>> = {};

    for (const feature of mergedMapFeatureCollection.features) {
        const props = feature.properties || {};
        const regionName = props.EMD_KOR_NM;
        const parentName = props.SIG_KOR_NM || "기타 지역";
        
        if (!regionName) continue;

        // 🚀 [최적화] BBox 선행 검사: 무거운 폴리곤 교차 연산 전에, 사각형 테두리가 겹치는지 먼저 확인. 안 겹치면 즉시 스킵하여 연산량 90% 소거.
        if (feature.bbox) {
            const fbbox = feature.bbox;
            if (corridorBbox[0] > fbbox[2] || corridorBbox[2] < fbbox[0] ||
                corridorBbox[1] > fbbox[3] || corridorBbox[3] < fbbox[1]) {
                continue;
            }
        }

        try {
            // corridor(경로 회랑)와 feature(행정구역 지도)가 1픽셀이라도 겹치면 T
            if (turf.booleanIntersects(corridorPolygon, feature.geometry)) {
                matchedRegionNames.add(regionName);
                if (!groupedRegions[parentName]) {
                    groupedRegions[parentName] = new Set<string>();
                }
                groupedRegions[parentName].add(regionName);
            }
        } catch(e) {
            continue; // GeoJSON 형식이 약간 이상한 폴리곤 에러 스킵
        }
    }

    const resultGroups: Record<string, string[]> = {};
    const customCitySet = new Set<string>();

    for (const [parent, set] of Object.entries(groupedRegions)) {
        resultGroups[parent] = Array.from(set).sort();
        
        // 🚀 자동 약어 생성 엔진: 앱의 2단계 필터링(customCityFilters)에 사용될 지역명 폭탄 생성
        customCitySet.add(parent);
        
        // 예: 광주시 -> 광주, 송파구 -> 송파
        if (parent.endsWith('구') || parent.endsWith('시') || parent.endsWith('군')) {
            const shortName = parent.slice(0, -1);
            customCitySet.add(shortName);
            
            // 특수 룰: 경기 광주시 -> '경기 광주시', '경기 광주', '경광주'
            if (parent === '광주시') {
                customCitySet.add('경기 광주');
                customCitySet.add('경기 광주시');
                customCitySet.add('경광주');
            }
        }
    }

    return {
        flat: Array.from(matchedRegionNames).sort(),
        grouped: resultGroups,
        customCityFilters: Array.from(customCitySet)
    };
}

/**
 * [첫짐 전용] 선택한 도시의 모든 읍/면/동 외곽을 radiusKm만큼 확장한 후,
 * 그 확장된 테두리 안에 1픽셀이라도 걸치는 전국 인근 읍/면/동을 전부 수집합니다.
 * (BBox 고속 필터링 + Set 중복제거 적용)
 */
export function getCityRegionsWithRadius(cityName: string, radiusKm: number): { flat: string[], grouped: Record<string, string[]> } {
    if (!mergedMapFeatureCollection || !mergedMapFeatureCollection.features) {
        return { flat: [], grouped: {} };
    }

    // 1. 타겟 도시(cityName)에 속한 읍/면/동 피처 모두 찾기
    const cityFeatures = mergedMapFeatureCollection.features.filter((f: any) => 
        f.properties?.SIG_KOR_NM?.includes(cityName)
    );

    if (cityFeatures.length === 0) {
        return { flat: [], grouped: {} };
    }

    // 반경 확장이 필요 없는 경우 (0km), 타겟 도시의 지역만 바로 반환
    if (!radiusKm || radiusKm <= 0) {
        const flatSet = new Set<string>();
        const grouped: Record<string, Set<string>> = {};
        for (const f of cityFeatures) {
            const regionName = f.properties?.EMD_KOR_NM;
            const parentName = f.properties?.SIG_KOR_NM || "기타 지역";
            if (regionName) {
                flatSet.add(regionName);
                if (!grouped[parentName]) grouped[parentName] = new Set<string>();
                grouped[parentName].add(regionName);
            }
        }
        
        const resultGroups: Record<string, string[]> = {};
        for (const [p, s] of Object.entries(grouped)) resultGroups[p] = Array.from(s).sort();
        
        return { flat: Array.from(flatSet).sort(), grouped: resultGroups };
    }

    // 2. 타겟 도시의 각 읍/면/동을 개별적으로 Buffer 확장
    const bufferedPolygons: any[] = [];
    for (const cf of cityFeatures) {
        try {
            const bp = turf.buffer(cf, radiusKm, { units: 'kilometers' });
            if (bp) {
                bp.bbox = turf.bbox(bp); // 확장된 폴리곤의 BBox 선계산
                bufferedPolygons.push(bp);
            }
        } catch (e) {
            continue; // 에러난 피처 무시
        }
    }

    // 3. 전체 지도에서 BBox + Intersect 검사
    const flatSet = new Set<string>();
    const grouped: Record<string, Set<string>> = {};

    for (const feature of mergedMapFeatureCollection.features) {
        const regionName = feature.properties?.EMD_KOR_NM;
        const parentName = feature.properties?.SIG_KOR_NM || "기타 지역";
        if (!regionName) continue;

        // 원본 도시의 폴리곤이면 볼 필요 없이 무조건 포함
        if (parentName.includes(cityName)) {
            flatSet.add(regionName);
            if (!grouped[parentName]) grouped[parentName] = new Set<string>();
            grouped[parentName].add(regionName);
            continue;
        }

        // 4. BBox 검사 후 Intersect 검사 (O(N*M)이지만 N이 크고 M이 작아 매우 빠름)
        let isMatched = false;
        if (feature.bbox) {
            const fb = feature.bbox;
            for (const bp of bufferedPolygons) {
                const bb = bp.bbox;
                if (!bb) continue;
                // BBox 충돌 검사 (빠른 제외)
                if (bb[0] > fb[2] || bb[2] < fb[0] || bb[1] > fb[3] || bb[3] < fb[1]) {
                    continue;
                }
                // BBox 충돌 시 정밀 교차 검사
                try {
                    if (turf.booleanIntersects(bp, feature.geometry)) {
                        isMatched = true;
                        break; // 하나라도 교차하면 이 지역은 편입됨
                    }
                } catch(e) { }
            }
        }

        if (isMatched) {
            flatSet.add(regionName);
            if (!grouped[parentName]) grouped[parentName] = new Set<string>();
            grouped[parentName].add(regionName);
        }
    }

    const resultGroups: Record<string, string[]> = {};
    for (const [p, s] of Object.entries(grouped)) resultGroups[p] = Array.from(s).sort();

    return { flat: Array.from(flatSet).sort(), grouped: resultGroups };
}

/**
 * GPS 진행도에 따라 이미 지나간 구간의 키워드를 자동 제거합니다.
 * 
 * 1. 현재 GPS에서 폴리라인 위 가장 가까운 점을 찾고
 * 2. 그 점 이후의 폴리라인만 남겨서
 * 3. 남은 폴리라인으로 회랑을 재계산합니다.
 * 
 * @returns null이면 재계산 불필요 (이미 거의 도착 등)
 */
export function trimCorridorByProgress(
    fullPolyline: Array<{x: number; y: number}>,
    currentGPS: {x: number; y: number},
    corridorRadiusKm: number,
    destinationRadiusKm?: number
) {
    if (!fullPolyline || fullPolyline.length < 2) return null;

    try {
        // 1. 현재 GPS에서 폴리라인 위 가장 가까운 점 찾기
        const lineCoords = fullPolyline.map(p => [p.x, p.y]);
        const line = turf.lineString(lineCoords);
        const point = turf.point([currentGPS.x, currentGPS.y]);
        const snapped = turf.nearestPointOnLine(line, point);

        // 2. 가까운 점 이후의 폴리라인만 남기기
        const idx = snapped.properties?.index || 0;
        const remainingPolyline = fullPolyline.slice(idx);

        if (remainingPolyline.length < 2) return null; // 거의 도착

        // 3. 남은 폴리라인으로 회랑 재계산
        const result = getCorridorRegions(remainingPolyline, corridorRadiusKm, destinationRadiusKm);
        if (result) {
            console.log(`🔄 [GPS Trim] 폴리라인 ${fullPolyline.length}점 → ${remainingPolyline.length}점, 키워드 ${result.flat.length}개`);
        }
        return result;
    } catch (e) {
        console.error("🔄 [GPS Trim] 에러:", e);
        return null;
    }
}

// ═══ GPS 헬퍼 함수 ═══

/** Haversine 공식으로 두 GPS 좌표 간 거리(km) 계산 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 현재 활성 경로의 폴리라인 추출 (합짐 경로 우선, 없으면 본콜) */
export function getActivePolyline(session: any): Array<{x: number; y: number}> | null {
    // 서브콜의 마지막 폴리라인(합짐 경로)이 있으면 우선
    if (session.subCalls?.length > 0) {
        const lastSub = session.subCalls[session.subCalls.length - 1];
        if (lastSub.routePolyline) return lastSub.routePolyline;
    }
    // 없으면 본콜 폴리라인
    if (session.mainCallState?.routePolyline) return session.mainCallState.routePolyline;
    return null;
}

/** 마지막 하차지 좌표 추출 */
export function getLastDropoffCoord(session: any): {x: number; y: number} | null {
    // 서브콜이 있으면 마지막 서브콜의 하차지
    if (session.subCalls?.length > 0) {
        const lastSub = session.subCalls[session.subCalls.length - 1];
        if (lastSub.dropoffX && lastSub.dropoffY) return { x: lastSub.dropoffX, y: lastSub.dropoffY };
    }
    // 없으면 본콜의 하차지
    if (session.mainCallState?.dropoffX && session.mainCallState?.dropoffY) {
        return { x: session.mainCallState.dropoffX, y: session.mainCallState.dropoffY };
    }
    return null;
}

/** 
 * [마스터 GPS 처리] 관제웹에서 보내온 실시간 GPS(또는 시뮬레이션 GPS)를 기반으로
 * 1. 현재 세션의 위치를 업데이트
 * 2. 2km 이상 이동 시 회랑(Corridor Trim) 동적 축소 계산 및 필터 갱신
 * 3. 마지막 하차지 500m 이내 도착 시 ARRIVED 상태로 전환
 */
export function processDriverMovement(userId: string, lat: number, lng: number, session: any, applyFilterCb: (uid: string, filter: any) => void) {
    if (!lat || !lng) return;
    
    const currentGPS = { x: lng, y: lat }; // 카카오 좌표계 (x=경도, y=위도)

    // 마스터 GPS 위치를 세션에 저장 (지도 렌더링 및 카카오 길찾기 Origin으로 사용됨)
    session.driverLocation = currentGPS;
    session.dashboardLocation = currentGPS;

    // [V2] dispatchPhase 기반으로 체크
    const isDelivering = session.activeFilter.dispatchPhase === 'DELIVERING';
    if (isDelivering) {
        // [1] Corridor Trim: 2km 이상 이동 시에만 트리거 (CPU 보호)
        const lastTrim = (session as any).lastTrimGPS as { x: number; y: number } | undefined;
        const dist = lastTrim ? haversineKm(lastTrim.y, lastTrim.x, lat, lng) : Infinity;

        if (dist > 2) { // 2km 이상 이동
            const polyline = getActivePolyline(session);
            if (polyline && polyline.length >= 2) {
                const trimmed = trimCorridorByProgress(
                    polyline, currentGPS,
                    session.activeFilter.corridorRadiusKm || 0,
                    session.activeFilter.destinationRadiusKm
                );
                if (trimmed) {
                    applyFilterCb(userId, { destinationKeywords: trimmed.flat });
                    console.log(`🔄 [GPS Trim] ${dist.toFixed(1)}km 이동 → 키워드 ${trimmed.flat.length}개로 축소`);
                }
                (session as any).lastTrimGPS = currentGPS;
            }
        }

        // [2] 도착 감지: 마지막 하차지 500m 이내 도달 시
        const lastDropoff = getLastDropoffCoord(session);
        if (lastDropoff && haversineKm(lat, lng, lastDropoff.y, lastDropoff.x) < 0.5) {
            applyFilterCb(userId, { 
                driverAction: 'UNLOADING',    // [V2] 하차 중으로 자동 전환
            });
            console.log(`🏁 [도착 감지] 하차지 500m 이내 도달`);
            // 도착 알림은 socketHandlers 쪽에서 io.to().emit()으로 발송하도록 콜백 체계 활용 (또는 applyFilterCb 안에서 이벤트 발생 가능)
        }
    }
}

/**
 * [역지오코딩] 좌표(위도, 경도)를 받아서 해당 위치의 시/군/구 이름을 반환합니다.
 * 전국 읍면동 폴리곤(merged_map.geojson)과 point-in-polygon으로 대조합니다.
 * @returns 시/군/구 이름 (예: "파주시") 또는 null
 */
export function reverseGeocodeToRegion(lat: number, lng: number): string | null {
    if (!mergedMapFeatureCollection || !mergedMapFeatureCollection.features) return null;
    
    const point = turf.point([lng, lat]); // GeoJSON: [경도, 위도]

    for (const feature of mergedMapFeatureCollection.features) {
        // BBox 1차 필터 (고속)
        if (feature.bbox) {
            const [minLng, minLat, maxLng, maxLat] = feature.bbox;
            if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
        }
        // Point-in-Polygon 정밀 검사
        if (turf.booleanPointInPolygon(point, feature as any)) {
            const sigName = (feature.properties as any)?.SIG_KOR_NM;
            if (sigName) return sigName;
        }
    }
    return null;
}
