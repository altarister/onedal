import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';

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
 * 주어진 카카오 경로(Polyline)에 맞춰 반경(radiusKm)만큼의 회랑(Corridor) 폴리곤을 시뮬레이션하고,
 * 그 회랑에 살짝이라도 걸치는(Intersect) 모든 읍/면/동 행정구역명 키워드를 추출해 반환합니다.
 */
export function getCorridorRegions(polyline: Array<{x: number; y: number}>, radiusKm: number): string[] {
    if (!mergedMapFeatureCollection || !mergedMapFeatureCollection.features) return [];
    if (!polyline || polyline.length < 2) return [];

    // 1. LineString 변환 (카카오 x:경도, y:위도 -> GeoJSON [lng, lat])
    const lineCoords = polyline.map(p => [p.x, p.y]);
    let lineFeature;
    try {
        lineFeature = turf.lineString(lineCoords);
    } catch(e) {
        console.error("🗺️ [GeoService] 유효하지 않은 Polyline 배열 형태입니다.", e);
        return [];
    }

    // 2. 경로 주변 두께(Buffer) 생성 -> 터널/회랑 폴리곤 완성
    let corridorPolygon;
    try {
        // Turf.js buffer 옵션 (단위: km)
        // 반경이 0이면 (인접동만 잡을 때) 아주 미세한 폭(0.1km)이라도 주어 선 자체의 Intersect 판정을 유리하게 할 수 있으나
        // 0인 경우라도 선형(Line) 자체와 각 동(Polygon)이 맞닿는지 검사하므로 정상 작동함
        const buffRadius = radiusKm <= 0 ? 0.05 : radiusKm; 
        corridorPolygon = turf.buffer(lineFeature, buffRadius, { units: 'kilometers' });
    } catch (e) {
        console.error("🗺️ [GeoService] Turf.js buffer 생성 에러:", e);
        return [];
    }
    if (!corridorPolygon) return [];

    // 3. 교차점 검사 (Intersect)
    const matchedRegionNames = new Set<string>();

    for (const feature of mergedMapFeatureCollection.features) {
        const props = feature.properties || {};
        // 전국 데이터베이스 프로퍼티 대응: 보통 EMD_KOR_NM, EMD_NM, ADM_DR_NM, name 등에 읍면동 이름이 들어있음
        const regionName = props.EMD_KOR_NM || props.EMD_NM || props.ADM_DR_NM || props.name;
        
        if (!regionName) continue;

        try {
            // corridor(경로 회랑)와 feature(행정구역 지도)가 1픽셀이라도 겹치면 T
            if (turf.booleanIntersects(corridorPolygon, feature.geometry)) {
                matchedRegionNames.add(regionName);
            }
        } catch(e) {
            continue; // GeoJSON 형식이 약간 이상한 폴리곤 에러 스킵
        }
    }

    return Array.from(matchedRegionNames);
}
