import fs from 'fs';
import path from 'path';
import { getActiveCalls } from '../core/helpers';
import type { MyOrder } from '@onedal/shared';
/**
 * 배럴(`@turf/turf`) 대신 **쓰는 것만** 가져온다.
 *
 * 배럴은 클러스터링·보간 등 이 프로젝트가 안 쓰는 모듈까지 전부 끌고 오는데,
 * 그 중 하나가 node_modules 안에 TypeScript 원본을 담고 있어 **jest 가 파싱 단계에서 죽었다.**
 * (`tsx`·`tsc` 는 멀쩡히 도는데 jest 만 못 읽어서 지리 테스트를 못 쓰고 있었다)
 */
import bbox from '@turf/bbox';
import booleanIntersects from '@turf/boolean-intersects';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import buffer from '@turf/buffer';
import centroid from '@turf/centroid';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import simplify from '@turf/simplify';
import union from '@turf/union';
import { featureCollection, lineString, point } from '@turf/helpers';

const turf = {
    bbox, booleanIntersects, booleanPointInPolygon, buffer, centroid,
    featureCollection, lineString, nearestPointOnLine, point, simplify, union,
};
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
                // 중심점도 여기서 한 번만 구한다. 요청마다 1239개를 다시 계산하면
                // 그것만으로 100ms 가 나간다 (2026-08-12 실측)
                f.centroid = turf.centroid(f);
                /**
                 * 버퍼링용 **간소화 사본** (약 200m 오차).
                 *
                 * `turf.buffer` 는 꼭짓점 수에 비례해 비싸고, **반경이 작을수록 더 비싸다** —
                 * 작은 버퍼는 원본의 해안선 같은 디테일을 그대로 물고 나오기 때문이다.
                 * 실측: `용인 1km` 42개 동 버퍼링에 **1415ms**, 10km 는 530ms.
                 *
                 * 필터의 최소 단위가 읍/면/동이라 200m 오차는 결과를 바꾸지 않는다.
                 * 간소화 후: 같은 연산이 **13ms** 다 (100배). 회랑 계산이 이미 쓰던 수법이다.
                 */
                try { f.simplified = turf.simplify(f, { tolerance: 0.002, highQuality: false }); }
                catch { f.simplified = f; }
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
 * 시/구 이름 하나에서 **앱이 도착지 텍스트에서 찾아볼 별칭들**을 만든다.
 *
 * 앱의 2단계 필터는 "시가 맞고 **동도** 맞아야 통과"로 판정한다
 * (`InsungParser.kt` 의 `hasCityAlias && hasDongMatch`).
 * 배차망이 `파주시` 로 쓸지 `파주` 로 쓸지 모르니 둘 다 넣는다.
 *
 * 🔴 예전에는 이 로직이 `getCorridorRegions`(합짐) 안에만 있었다.
 *    그래서 **첫짐 모드에서는 `customCityFilters` 가 빈 배열**이었고,
 *    앱의 2단계 필터가 `isNotEmpty()` 조건에 걸려 아예 돌지 않았다 —
 *    동 이름 하나만 보고 판정한 것이다.
 *
 *    수도권 안에만 **같은 이름의 동이 97개** 있다. 그래서 파주 필터에
 *    `신촌동`(서울 서대문구 · 성남 수정구에도 있다) · `당하동`(인천 서구) ·
 *    `군내면`(포천시) 콜이 그대로 통과했다. 회랑 밖인데 꿀콜로 보인 것이다.
 */
export function cityAliases(parentName: string): string[] {
    const out = new Set<string>([parentName]);

    // 예: 광주시 → 광주, 송파구 → 송파
    if (/[시군구]$/.test(parentName)) out.add(parentName.slice(0, -1));

    // 특수 룰: 광주광역시와 헷갈리지 않도록 경기 광주는 앞에 도를 붙인 표기도 받는다
    if (parentName === '광주시') {
        out.add('경기 광주');
        out.add('경기 광주시');
        out.add('경광주');
    }
    return Array.from(out);
}

/**
 * 주어진 카카오 경로(Polyline)에 맞춰 반경(corridorRadiusKm)만큼의 회랑(Corridor) 폴리곤을 시뮬레이션하고,
 * 하차 거점(마지막 좌표)에 대해 (destinationRadiusKm)만큼의 넓은 원 폴리곤을 시뮬레이션하여 두 폴리곤을 합병한 뒤,
 * 그 영역에 찍힌 모든 읍/면/동 행정구역명 키워드를 추출해 반환합니다.
 */
export interface CorridorRegions {
    flat: string[];
    grouped: Record<string, string[]>;
    customCityFilters: string[];
    /**
     * 동마다 **경로 몇 km 지점인가** (출발점 기준 누적 거리).
     *
     * 🔴 이게 있으면 이동할 때 회랑을 **다시 그리지 않아도 된다.**
     *    지나온 구간 제거가 "숫자 비교"가 되기 때문이다 — 실측 173ms → 0.14ms.
     *    키워드와 **같은 입력에서 같이** 만든다. 따로 만들면 갈라진다(회랑 4벌 사고).
     */
    progressKm: Record<string, number>;
}

export function getCorridorRegions(polyline: Array<{x: number; y: number}>, corridorRadiusKm: number, destinationRadiusKm?: number): CorridorRegions | null {
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
    /**
     * 동마다 "경로 몇 km 지점인가". **이미 도는 루프에 얹는다** — 따로 돌면 두 벌이 된다.
     *
     * 중심점을 경로에 스냅한 뒤 **동의 크기만큼 더한다.** 넓은 동이면 중심점을 지났어도
     * 아직 그 안에 있을 수 있어서, 그대로 쓰면 **잡을 수 있는 콜을 일찍 버린다.**
     * 늦게 빼는 쪽이 안전하다.
     */
    const progressKm: Record<string, number> = {};

    for (const feature of mergedMapFeatureCollection.features) {
        const props = feature.properties || {};
        const regionName = props.EMD_KOR_NM;
        const parentName = props.intel?.parentName || props.SIG_KOR_NM || "기타 지역";
        
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

                // 진행도 — 부팅 때 캐시해 둔 centroid/bbox 를 쓴다 (여기서 다시 계산하지 않는다)
                const c = (feature as any).centroid;
                if (c) {
                    try {
                        const snapped = turf.nearestPointOnLine(lineFeature as any, c);
                        const at = (snapped.properties?.location as number) ?? 0;
                        // 동의 반지름(bbox 대각선 절반)만큼 여유 — 늦게 빼기 위해
                        const fb = feature.bbox;
                        const pad = fb ? haversineKm(fb[1], fb[0], fb[3], fb[2]) / 2 : 0;
                        const prev = progressKm[regionName];
                        const val = at + pad;
                        // 같은 이름의 동이 여럿이면 **가장 늦은 것**을 남긴다 (역시 늦게 빼기 위해)
                        if (prev === undefined || val > prev) progressKm[regionName] = val;
                    } catch { /* 스냅 실패는 진행도만 비운다 — 그 동은 안 빠질 뿐이다 */ }
                }
            }
        } catch(e) {
            continue; // GeoJSON 형식이 약간 이상한 폴리곤 에러 스킵
        }
    }

    const resultGroups: Record<string, string[]> = {};
    const customCitySet = new Set<string>();

    for (const [parent, set] of Object.entries(groupedRegions)) {
        resultGroups[parent] = Array.from(set).sort();
        for (const alias of cityAliases(parent)) customCitySet.add(alias);
    }

    return {
        flat: Array.from(matchedRegionNames).sort(),
        grouped: resultGroups,
        customCityFilters: Array.from(customCitySet),
        progressKm,
    };
}

/** 필터가 앱에 실어 보내는 지역 정보 한 벌 — 동 목록 · 시별 묶음 · 시 별칭 */
export interface CityRegions {
    flat: string[];
    grouped: Record<string, string[]>;
    customCityFilters: string[];
}

/** 시별 묶음에서 별칭을 뽑아 붙인다 — 합짐(회랑)과 첫짐이 **같은 규칙**을 쓰게 하는 지점 */
function withAliases(flat: string[], grouped: Record<string, string[]>): CityRegions {
    const aliases = new Set<string>();
    for (const parent of Object.keys(grouped)) {
        for (const a of cityAliases(parent)) aliases.add(a);
    }
    return { flat, grouped, customCityFilters: Array.from(aliases) };
}

/**
 * 지금 GPS 가 **경로 몇 km 지점인가** (출발점 기준 누적 거리).
 *
 * 이동할 때마다 도는 유일한 지리 연산이다 — 실측 0.14ms.
 * 경로에서 멀리 벗어나 있어도 가장 가까운 점으로 스냅되므로 값은 늘 나온다.
 */
export function progressAlongPolyline(
    polyline: Array<{ x: number; y: number }>,
    gps: { x: number; y: number },
): number | null {
    if (!polyline || polyline.length < 2) return null;
    try {
        const line = turf.lineString(polyline.map(p => [p.x, p.y]));
        const snapped = turf.nearestPointOnLine(line, turf.point([gps.x, gps.y]));
        return (snapped.properties?.location as number) ?? null;
    } catch {
        return null;
    }
}

/**
 * [첫짐 전용] 선택한 도시의 읍/면/동을 radiusKm 만큼 확장하고,
 * 그 안에 **중심점이 들어오는** 전국 읍/면/동을 수집합니다.
 * (BBox 고속 필터링 + Set 중복제거 적용)
 *
 * ⚠️ 예전에는 "1픽셀이라도 걸치면" 이었다. 아래 판정부의 주석 참고.
 */
export function getCityRegionsWithRadius(cityName: string, radiusKm: number): CityRegions {
    if (!mergedMapFeatureCollection || !mergedMapFeatureCollection.features) {
        return { flat: [], grouped: {}, customCityFilters: [] };
    }

    // 1. 타겟 도시(cityName)에 속한 읍/면/동 피처 모두 찾기
    const cityFeatures = mergedMapFeatureCollection.features.filter((f: any) => {
        const pName = f.properties?.intel?.parentName || f.properties?.SIG_KOR_NM || "";
        return pName.includes(cityName);
    });

    if (cityFeatures.length === 0) {
        return { flat: [], grouped: {}, customCityFilters: [] };
    }

    // 반경 확장이 필요 없는 경우 (0km), 타겟 도시의 지역만 바로 반환
    if (!radiusKm || radiusKm <= 0) {
        const flatSet = new Set<string>();
        const grouped: Record<string, Set<string>> = {};
        for (const f of cityFeatures) {
            const regionName = f.properties?.EMD_KOR_NM;
            const parentName = f.properties?.intel?.parentName || f.properties?.SIG_KOR_NM || "기타 지역";
            if (regionName) {
                flatSet.add(regionName);
                if (!grouped[parentName]) grouped[parentName] = new Set<string>();
                grouped[parentName].add(regionName);
            }
        }
        
        const resultGroups: Record<string, string[]> = {};
        for (const [p, s] of Object.entries(grouped)) resultGroups[p] = Array.from(s).sort();
        
        return withAliases(Array.from(flatSet).sort(), resultGroups);
    }

    // 2. 타겟 도시의 각 읍/면/동을 개별적으로 Buffer 확장
    const bufferedPolygons: any[] = [];
    for (const cf of cityFeatures) {
        try {
            // 간소화 사본으로 버퍼링한다 (부팅 때 만들어 둔 것 — 위 initGeoService 주석 참고)
            const bp = turf.buffer((cf as any).simplified || cf, radiusKm, { units: 'kilometers' });
            if (bp) {
                bp.bbox = turf.bbox(bp); // 확장된 폴리곤의 BBox 선계산
                bufferedPolygons.push(bp);
            }
        } catch (e) {
            continue; // 에러난 피처 무시
        }
    }

    /**
     * 확장 영역 **전체를 감싸는 사각형** 하나. 대부분의 동은 이것 하나로 떨어져 나가
     * 아래 폴리곤별 검사를 아예 안 탄다.
     *
     * 반경이 **작을수록** 이게 중요하다. 버퍼가 작으면 결과 폴리곤이 원본의 복잡한
     * 꼭짓점을 그대로 물고 있어 점-포함 판정이 비싸다 —
     * 실측에서 `용인 1km`(993ms)가 `용인 10km`(405ms)보다 느렸던 이유다.
     */
    let outerBbox: number[] | null = null;
    for (const bp of bufferedPolygons) {
        const b = bp.bbox as number[] | undefined;
        if (!b) continue;
        outerBbox = outerBbox
            ? [Math.min(outerBbox[0], b[0]), Math.min(outerBbox[1], b[1]),
               Math.max(outerBbox[2], b[2]), Math.max(outerBbox[3], b[3])]
            : [...b];
    }

    // 3. 전체 지도에서 BBox + 중심점 포함 검사
    const flatSet = new Set<string>();
    const grouped: Record<string, Set<string>> = {};

    for (const feature of mergedMapFeatureCollection.features) {
        const regionName = feature.properties?.EMD_KOR_NM;
        const parentName = feature.properties?.intel?.parentName || feature.properties?.SIG_KOR_NM || "기타 지역";
        if (!regionName) continue;

        // 원본 도시의 폴리곤이면 볼 필요 없이 무조건 포함
        if (parentName.includes(cityName)) {
            flatSet.add(regionName);
            if (!grouped[parentName]) grouped[parentName] = new Set<string>();
            grouped[parentName].add(regionName);
            continue;
        }

        // 4. 이 동의 **중심점**이 확장 영역 안에 있는가
        const centroid = (feature as any).centroid;
        if (!centroid) continue;
        const [cx, cy] = centroid.geometry.coordinates as [number, number];

        // 바깥 사각형 한 번으로 대부분을 떨어뜨린다
        if (outerBbox && (cx < outerBbox[0] || cx > outerBbox[2] || cy < outerBbox[1] || cy > outerBbox[3])) continue;

        let isMatched = false;
        {
            for (const bp of bufferedPolygons) {
                const bb = bp.bbox;
                if (!bb) continue;
                // 폴리곤별 BBox 로 한 번 더 거른다 (중심점 기준)
                if (cx < bb[0] || cx > bb[2] || cy < bb[1] || cy > bb[3]) {
                    continue;
                }
                /**
                 * 🔴 2026-08-12 — **`booleanIntersects` 에서 중심점 판정으로 바꿨다.**
                 *
                 * 예전에는 동이 반경에 **손톱만큼만 닿아도** 통째로 편입됐다.
                 * 동 하나가 수 km 라, 반경 10km 라고 해 놓고 훨씬 바깥 동네가 들어왔다.
                 *
                 * 실측 (2026-08-12):
                 *   용인  1km   84개 → **56개**
                 *   용인 10km  299개 → 266개
                 *   파주 10km  140개 → 122개
                 *
                 * "반경 10km" 는 **10km 안에 있는** 동네라는 뜻이지
                 * **10km 선에 닿는** 동네라는 뜻이 아니다. 기사님이 필터를 못 믿게 된
                 * 이유의 하나다 — 숫자를 줄여도 목록이 기대만큼 안 줄었다.
                 *
                 * (참고: 도시 경계를 union 한 뒤 한 번만 버퍼링해 보는 것도 재 봤는데
                 *  결과가 **완전히 동일**하고 5배 느렸다. buffer 는 union 에 분배되므로
                 *  당연한 결과였다 — 부풀림의 원인은 버퍼 방식이 아니라 이 판정이었다)
                 */
                try {
                    if (turf.booleanPointInPolygon(centroid, bp)) {
                        isMatched = true;
                        break;
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

    return withAliases(Array.from(flatSet).sort(), resultGroups);
}

/**
 * ~~`trimCorridorByProgress`~~ — **삭제했다** (2026-08-14).
 *
 * 이동할 때마다 회랑을 통째로 다시 그리던 함수다(실측 173ms). 그 비용 때문에 2km 마다만
 * 돌렸고, 정작 `getActivePolyline` 이 죽어 있어서 **한 번도 실행되지 않았다.**
 *
 * 지금은 회랑을 만들 때 동마다 진행도를 같이 기록하고(`CorridorRegions.progressKm`),
 * 이동 시에는 그 숫자만 비교한다 — `filterManager.applyTraveledTrim` (0.14ms).
 * 같은 일을 하는 두 번째 구현을 남겨 두지 않는다.
 */


// ═══ GPS 헬퍼 함수 ═══

/** Haversine 공식으로 두 GPS 좌표 간 거리(km) 계산 */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 지금 달리고 있는 경로의 폴리라인.
 *
 * 🔴 2026-08-14 **되살렸다.** 예전에는 `session.subCalls` / `session.mainCallState` 를 읽었는데,
 *    그 두 필드는 V2 리팩터링에서 `myOrders` 한 배열로 합쳐지며 사라졌다. 그래서 이 함수는
 *    **항상 null 을 반환했고**, 지나온 구간 제거가 **한 번도 실행되지 않았다.**
 *    (달리는 내내 이미 지나친 동네의 콜이 필터에 걸려 있었다는 뜻이다)
 *
 * 회랑을 만드는 `syncCorridorFilter` 와 **같은 기준**을 쓴다 — 마지막 활성 콜의 경로.
 * 다르면 "회랑을 만든 경로"와 "진행도를 재는 경로"가 어긋나 엉뚱한 동이 빠진다.
 */
export function getActivePolyline(session: { myOrders: MyOrder[] }): Array<{x: number; y: number}> | null {
    const active = getActiveCalls(session);
    if (active.length === 0) return null;
    const poly = active[active.length - 1]?.routePolyline;
    return poly && poly.length >= 2 ? poly : null;
}


/**
 * 마지막 하차지 좌표 추출
 *
 * 🚨 TODO(미구현) — Phase 4에서 복구 예정
 * getActivePolyline과 동일하게 삭제된 필드(`subCalls`/`mainCallState`)를 참조하므로
 * **항상 null을 반환**합니다. 하차지 500m 도착 감지가 동작하지 않는 원인입니다.
 */
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
export function processDriverMovement(
    userId: string,
    lat: number,
    lng: number,
    session: any,
    applyFilterCb: (uid: string, filter: any) => void,
    /**
     * 지나온 구간을 뺄 때 부른다 — **필터 변경 경로와 통로를 나눈다.**
     *
     * 🔴 처음에는 `applyFilterCb(userId, {})` 로 파생 재계산을 트리거했는데, 그 안에
     *    *"도착 도시가 비어 있으면 키워드를 지운다"* 는 가지가 있다. 도시를 안 고른 채
     *    운행하면 **0.5km 마다 회랑이 통째로 지워진다** — 빈 필터는 고장이라 사냥이 멈춘다.
     *    지나온 구간 제거는 파생을 다시 돌 이유가 없다. 전용 통로로 간다 (더 싸기도 하다).
     */
    trimTraveledCb?: (uid: string) => void,
) {
    if (!lat || !lng) return;
    
    const currentGPS = { x: lng, y: lat }; // 카카오 좌표계 (x=경도, y=위도)

    // 마스터 GPS 위치를 세션에 저장 (지도 렌더링 및 카카오 길찾기 Origin으로 사용됨)
    session.driverLocation = currentGPS;
    session.dashboardLocation = currentGPS;

    // [V2] dispatchPhase 기반으로 체크
    const isDelivering = session.activeFilter.dispatchPhase === 'DELIVERING';
    if (isDelivering) {
        /**
         * [1] 지나온 구간 제거 — **0.5km 마다.**
         *
         * 🔴 2026-08-14 에 방식을 바꿨다. 예전에는 여기서 회랑을 **통째로 다시 그렸고**
         *    (`trimCorridorByProgress`, 실측 **173ms**) 그 비용 때문에 2km 로 띄엄띄엄 돌렸다.
         *
         *    이제 회랑을 만들 때 동마다 **경로 몇 km 지점인지**를 같이 기록해 두므로
         *    (`CorridorRegions.progressKm`), 지나온 구간 제거는 **숫자 비교**다 — 0.14ms.
         *    1200배 싸졌으니 촘촘히 돌려도 된다. 촘촘할수록 필터가 실제 위치에 가깝다.
         *
         *    실제 제거는 `filterManager.applyTraveledTrim` 한 곳에서만 한다
         *    (동 목록·시 묶음·별칭을 **한 벌로** 줄여야 하므로). 여기서는 방아쇠만 당긴다.
         *    ⚠️ 필터 변경(`applyFilterCb`)과 **다른 통로**다 — 이유는 인자 주석에 있다.
         */
        const lastTrim = (session as any).lastTrimGPS as { x: number; y: number } | undefined;
        const dist = lastTrim ? haversineKm(lastTrim.y, lastTrim.x, lat, lng) : Infinity;

        if (dist > 0.5 && trimTraveledCb && getActivePolyline(session)) {
            (session as any).lastTrimGPS = currentGPS;
            trimTraveledCb(userId);
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
            const sigName = (feature.properties as any)?.intel?.parentName || (feature.properties as any)?.SIG_KOR_NM;
            if (sigName) return sigName;
        }
    }
    return null;
}

/**
 * 도착 목표로 고를 수 있는 **시/군 목록**을 지도 데이터에서 만든다.
 *
 * 🔴 2026-08-12 — 예전에는 관제웹이 7개를 손으로 적어 두고 있었다.
 *    기사님: *"7개를 임의로 내가 넣어 둔 거 같아. 시나 혹은 도 정도의 범위로 가져와야 할 듯."*
 *
 *    게다가 저장값(`파주`)과 선택지(`파주시`)가 안 맞아 브라우저가 조용히 **첫 항목**을 보여줬다.
 *    화면은 `용인시`인데 실제 필터는 파주였다 — 화면이 거짓말을 한 것이다.
 *    (서버 검색은 `includes` 라 `파주` 로도 잘 돌아서 아무도 몰랐다)
 *
 * ══ 어떤 단위로 묶는가 ══
 *
 * 지도 데이터의 `parentName` 은 표기가 세 갈래다.
 *   `서울 강남구` · `인천 중구` · `파주시` · `수원시 권선구`
 * 기사님이 고르는 단위는 **시**다. 그래서
 *   서울·인천 → 광역시 하나로 (`서울` 이면 25개 구 전부)
 *   경기       → 시/군 단위로 (`수원시` 면 4개 구 전부)
 * 이렇게 묶으면 `getCityRegionsWithRadius` 의 `includes` 검색과 그대로 맞물린다.
 */
export function getSelectableCities(): { sido: string; cities: string[] }[] {
    if (!mergedMapFeatureCollection?.features) return [];

    const bySido = new Map<string, Set<string>>();
    for (const f of mergedMapFeatureCollection.features) {
        const parent = (f.properties as any)?.intel?.parentName as string | undefined;
        if (!parent) continue;

        const head = parent.split(' ')[0];
        // 광역시는 그 자체가 하나의 선택지다 (구까지 나누면 25개가 쏟아진다)
        const isMetro = head === '서울' || head === '인천';
        const sido = isMetro ? head : '경기';
        const city = isMetro ? head : head;   // 경기는 head 가 이미 시/군 이름이다

        if (!bySido.has(sido)) bySido.set(sido, new Set());
        bySido.get(sido)!.add(city);
    }

    // 광역시 먼저, 그 다음 경기 (가나다순)
    const order = ['서울', '인천', '경기'];
    return order
        .filter(s => bySido.has(s))
        .map(sido => ({ sido, cities: Array.from(bySido.get(sido)!).sort((a, b) => a.localeCompare(b, 'ko')) }));
}
