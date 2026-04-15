import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import type { FeatureCollection, Polygon, MultiPolygon, Feature } from 'geojson';

let mergedMapFeatureCollection: FeatureCollection<Polygon | MultiPolygon> | null = null;

export function initGeoService() {
    try {
        const filePath = path.join(__dirname, '../../mapData/merged_map.geojson');
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed && parsed.type === 'FeatureCollection') {
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
export function getCorridorRegions(polyline: Array<{x: number; y: number}>, corridorRadiusKm: number, destinationRadiusKm?: number): { flat: string[], grouped: Record<string, string[]> } | null {
    if (!mergedMapFeatureCollection || !mergedMapFeatureCollection.features) return null;
    if (!polyline || polyline.length < 2) return null;

    // 1. LineString 변환 (카카오 x:경도, y:위도 -> GeoJSON [lng, lat])
    const lineCoords = polyline.map(p => [p.x, p.y]);
    let lineFeature;
    try {
        lineFeature = turf.lineString(lineCoords);
    } catch(e) {
        console.error("🗺️ [GeoService] 유효하지 않은 Polyline 배열 형태입니다.", e);
        return null;
    }

    // 2. 경로 주변 두께(Buffer) 생성 -> 터널/회랑 폴리곤 완성
    let corridorPolygon;
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
                if (unionResult) corridorPolygon = unionResult as any;
            }
        }
    } catch (e) {
        console.error("🗺️ [GeoService] Turf.js buffer 생성 에러:", e);
        return null;
    }
    if (!corridorPolygon) return null;

    // 3. 교차점 검사 (Intersect)
    const matchedRegionNames = new Set<string>();
    const groupedRegions: Record<string, Set<string>> = {};

    for (const feature of mergedMapFeatureCollection.features) {
        const props = feature.properties || {};
        const regionName = props.EMD_KOR_NM;
        const parentName = props.SIG_KOR_NM || "기타 지역";
        
        if (!regionName) continue;

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
    for (const [parent, set] of Object.entries(groupedRegions)) {
        resultGroups[parent] = Array.from(set).sort();
    }

    return {
        flat: Array.from(matchedRegionNames).sort(),
        grouped: resultGroups
    };
}
