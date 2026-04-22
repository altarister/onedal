import fs from "fs";
import path from "path";

interface GeoFeature {
    properties: {
        code: string;
        name: string;
        SIG_KOR_NM: string;
        EMD_KOR_NM: string;
    };
}

interface GeoJSON {
    features: GeoFeature[];
}

let geoData: GeoJSON | null = null;

/**
 * GeoJSON을 메모리에 한 번만 로드합니다 (20MB → RAM 적재, 이후 0.01초 조회)
 */
function loadGeoData(): GeoJSON {
    if (geoData) return geoData;
    
    const filePath = path.join(__dirname, "..", "mapData", "merged_map.geojson");
    const raw = fs.readFileSync(filePath, "utf-8");
    geoData = JSON.parse(raw) as GeoJSON;
    console.log(`🗺️ [GeoResolver] ${geoData.features.length}개 읍면동 데이터 로드 완료`);
    return geoData;
}

/**
 * 도시명(예: "용인시")에 속한 모든 읍/면/동 이름을 배열로 반환합니다.
 * SIG_KOR_NM 필드에 도시명이 포함된 feature를 필터링합니다.
 * 
 * @param cityName 도시명 (예: "용인시", "수원시", "광주시")
 * @returns 읍면동 이름 배열 (예: ["마평동", "역북동", ...])
 */
export function getRegionsByCity(cityName: string): string[] {
    const data = loadGeoData();
    
    const regions = data.features
        .filter(f => f.properties?.SIG_KOR_NM?.includes(cityName))
        .map(f => f.properties.EMD_KOR_NM)
        .filter(Boolean);
    
    // 중복 제거 후 정렬
    const unique = [...new Set(regions)].sort();
    
    console.log(`🗺️ [GeoResolver] "${cityName}" → ${unique.length}개 읍면동 조회됨`);
    return unique;
}

/**
 * 도시명에 속한 읍/면/동을 '구' 단위(SIG_KOR_NM)로 그룹핑하여 반환합니다.
 */
export function getGroupedRegionsByCity(cityName: string): Record<string, string[]> {
    const data = loadGeoData();
    const groups: Record<string, Set<string>> = {};
    
    data.features.forEach(f => {
        const sig = f.properties?.SIG_KOR_NM;
        const emd = f.properties?.EMD_KOR_NM;
        if (sig && emd && sig.includes(cityName)) {
            if (!groups[sig]) groups[sig] = new Set();
            groups[sig].add(emd);
        }
    });

    const result: Record<string, string[]> = {};
    for (const [sig, set] of Object.entries(groups)) {
        result[sig] = Array.from(set).sort();
    }
    return result;
}
