import fs from 'fs';
import path from 'path';
import { getActiveCalls } from '../core/helpers';
import { planArrivalStops, type ArrivalStop } from './routeComposer';
import type { MyOrder } from '@onedal/shared';
import { DEFAULT_JUDGMENT, isPickupListName, pickupShapeOf, distToLineKm, netAreaTesterOf } from '@onedal/shared';
import type { GoalZone, NetPoint, NetParams } from '@onedal/shared';
/**
 * 🔴 **타입만 가져온다** (`import type`). 런타임 값을 가져오면 순환 참조가 되어 부팅이 막힌다.
 *    예전에 이 파라미터가 `any` 라, 세션에서 사라진 필드를 읽는 함수가 **몇 달째 null 만
 *    반환하는데도 아무도 몰랐다** (`getActivePolyline`·`getLastDropoffCoord`, 2026-08-14).
 */
import { shouldStoreGpsPoint, bufferGpsPoint, type GpsPoint } from './gpsTrackStore';
import type { UserSession } from '../state/userSessionStore';
import { SettingsRepository } from '../repositories/SettingsRepository';
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
                 * 간소화 후: 같은 연산이 **13ms** 다 (100배). 경유 계산이 이미 쓰던 수법이다.
                 */
                try { f.simplified = turf.simplify(f, { tolerance: 0.002, highQuality: false }); }
                catch { f.simplified = f; }
            });
            mergedMapFeatureCollection = parsed;
            adminNameSet = null;   // 지도가 다시 로드되면 지명 사전도 다시 만든다
            districtNameCount = null;   // 구 이름 유일성도 같은 이유로 다시 센다
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
 * 🔴 예전에는 이 로직이 `getDetourRegions`(합짐) 안에만 있었다.
 *    그래서 **첫짐 모드에서는 `customCityFilters` 가 빈 배열**이었고,
 *    앱의 2단계 필터가 `isNotEmpty()` 조건에 걸려 아예 돌지 않았다 —
 *    동 이름 하나만 보고 판정한 것이다.
 *
 *    수도권 안에만 **같은 이름의 동이 97개** 있다. 그래서 파주 필터에
 *    `신촌동`(서울 서대문구 · 성남 수정구에도 있다) · `당하동`(인천 서구) ·
 *    `군내면`(포천시) 콜이 그대로 통과했다. 경유 밖인데 꿀콜로 보인 것이다.
 */
export function cityAliases(parentName: string): string[] {
    const out = new Set<string>([parentName]);

    // 예: 광주시 → 광주, 송파구 → 송파
    if (/[시군구]$/.test(parentName)) out.add(parentName.slice(0, -1));

    /**
     * 🏙️ **구 단독형** — 배차망 리스트가 그렇게 준다 (기사님 지적 2026-08-23).
     *
     * `성남시 분당구` 의 별칭이 `성남시 분당구`·`성남시 분당` 뿐이라, 리스트 카드에
     * **`분당구`** 라고만 뜨는 콜은 **어느 쪽도 안 맞았다.** 실측에서 합짐 국면의
     * 구 단위 콜이 전멸했다 — `분당구`·`동작구`·`단원구`·`강동구` 전부 ❌.
     *
     * 첫짐(파주 목적지)은 동·읍·면뿐이라 안 걸렸다. **합짐은 경로가 서울·성남을
     * 지나므로** 그 지역 콜을 통째로 놓쳤다.
     *
     * ⚠️ **이름이 겹치는 구는 넣지 않는다.** `중구` 는 서울에도 인천에도 있어서,
     *    단독형을 실으면 서울 중구를 지날 때 인천 중구 콜을 잡는다.
     *    잘못 잡으면 배차망 취소 횟수(10회)를 쓴다 — *"안 잡는 것과 잡고 나서
     *    버리는 것은 전혀 다르다"* (`RouteOrderFilter`).
     *    판단은 **지도에서 센다** — 손으로 적은 목록을 두지 않는다 (규칙 ⑤-4 ②).
     */
    const tail = parentName.split(' ').pop() ?? '';
    if (tail !== parentName && /구$/.test(tail) && isUniqueDistrictName(tail)) {
        out.add(tail);
        out.add(tail.slice(0, -1));   // 분당구 → 분당 (리스트가 줄여 쓰는 경우)
    }

    // 특수 룰: 광주광역시와 헷갈리지 않도록 경기 광주는 앞에 도를 붙인 표기도 받는다
    if (parentName === '광주시') {
        out.add('경기 광주');
        out.add('경기 광주시');
        out.add('경광주');
    }
    return Array.from(out);
}

/**
 * 🏙️ **이 구 이름이 지도 안에서 유일한가** — 부팅 때 한 번 세어 캐시한다.
 *
 * 겹치면(서울 중구 / 인천 중구) 단독형을 못 쓴다. 목록을 상수로 적어 두면
 * 지도가 넓어질 때 조용히 틀리므로 **데이터에서 파생시킨다** (규칙 ③).
 */
let districtNameCount: Map<string, number> | null = null;
function isUniqueDistrictName(district: string): boolean {
    /**
     * 🔴 **방위 이름은 지도를 보기 전에 거른다** (2026-08-23 실측).
     *
     * 지도(`merged_map.geojson`)는 **수도권만** 담는다. 그래서 세어 보면 `서구`(인천)가
     * "유일"로 나오는데, 실제로는 대전·광주·부산·대구에도 있다 —
     * **없는 데이터를 근거로 유일하다고 판정하는 것**이다.
     *
     * 이름 자체가 답을 갖고 있다: `구` 를 떼고 **한 글자**면 방위·중심을 가리키는 말이지
     * 고유명이 아니다 (`서`·`동`·`남`·`북`·`중`). 손으로 목록을 적지 않아도 갈린다.
     */
    if (district.length <= 2) return false;

    if (!districtNameCount) {
        districtNameCount = new Map();
        const parents = new Set<string>();
        for (const f of mergedMapFeatureCollection?.features ?? []) {
            const props: any = f.properties || {};
            parents.add(props.intel?.parentName || props.SIG_KOR_NM || '');
        }
        for (const p of parents) {
            const t = p.split(' ').pop() ?? '';
            if (t && t !== p && /구$/.test(t)) districtNameCount.set(t, (districtNameCount.get(t) ?? 0) + 1);
        }
    }
    return districtNameCount.get(district) === 1;
}

/**
 * 주어진 카카오 경로(Polyline)에 맞춰 반경(detourRadiusKm)만큼의 경유(Detour) 폴리곤을 시뮬레이션하고,
 * 하차 거점(마지막 좌표)에 대해 (destinationRadiusKm)만큼의 넓은 원 폴리곤을 시뮬레이션하여 두 폴리곤을 합병한 뒤,
 * 그 영역에 찍힌 모든 읍/면/동 행정구역명 키워드를 추출해 반환합니다.
 */
export interface DetourRegions {
    flat: string[];
    grouped: Record<string, string[]>;
    customCityFilters: string[];
    /**
     * 동마다 **경로 몇 km 지점인가** (출발점 기준 누적 거리) — **트림 전용**.
     *
     * 🔴 이게 있으면 이동할 때 경유를 **다시 그리지 않아도 된다.**
     *    지나온 구간 제거가 "숫자 비교"가 되기 때문이다 — 실측 173ms → 0.14ms.
     *    키워드와 **같은 입력에서 같이** 만든다. 따로 만들면 갈라진다(경유 4벌 사고).
     *
     * ⚠️ 동의 반지름(pad)을 더하고, 하차원 안이면 Infinity 다 — «늦게 빼기 위한»
     *    안전 방향이라 트림에는 맞다. **순서 판정에 쓰면 지리가 뒤집힌다** — 그건
     *    아래 `orderKm` 의 일이다 (버그 대장 #78).
     */
    progressKm: Record<string, number>;
    /**
     * 동마다 **경로 몇 km 지점인가 — 순서 전용** (순수 스냅점 · pad 없음 · Infinity 없음).
     *
     * 🔴 #78 (2026-08-30): 한 값(progressKm)이 두 사실(트림 안전 시점 / 경로상 위치)을
     *    답하다가 순서가 뒤집혔다 — 곤지암읍은 pad(수 km)가 하차원 판정까지 부풀려
     *    «Infinity → 경로 끝(19.2km)»이 됐고, 실제 6km 길목이 경로 끝보다 뒤가 되어
     *    성당→이천제일(순방향)이 "2.2km 후진"으로 차단됐다 (#76 «한 값이 여러 사실» 동형).
     *
     * 같은 이름의 동이 여럿이면 **경로에 가장 가까운 것**을 남긴다 — 목록에 든 이유가
     * 경로와의 근접이므로, 순서의 주인공도 그 동이다 (트림은 반대로 «가장 늦은 것»).
     */
    orderKm: Record<string, number>;
}

export function getDetourRegions(polyline: Array<{x: number; y: number}>, detourRadiusKm: number, destinationRadiusKm?: number): DetourRegions | null {
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

    // 2. 경로 주변 두께(Buffer) 생성 -> 터널/경유 폴리곤 완성
    let detourPolygon: any;
    try {
        const buffRadius = detourRadiusKm <= 0 ? 0.05 : detourRadiusKm; 
        detourPolygon = turf.buffer(lineFeature, buffRadius, { units: 'kilometers' });

        // [신규] 하차 거점 주변 반경(destinationRadiusKm) 합병
        if (destinationRadiusKm && destinationRadiusKm > 0 && lineCoords.length > 0) {
            const lastCoord = lineCoords[lineCoords.length - 1];
            const destFeature = turf.point(lastCoord);
            const destPolygon = turf.buffer(destFeature, destinationRadiusKm, { units: 'kilometers' });
            
            // 경유 폴리곤과 하차 반경 폴리곤을 하나로 합침
            const polygons: Feature<Polygon | MultiPolygon>[] = [];
            if (detourPolygon) polygons.push(detourPolygon as Feature<Polygon | MultiPolygon>);
            if (destPolygon) polygons.push(destPolygon as Feature<Polygon | MultiPolygon>);
            
            if (polygons.length > 0) {
                const fc = turf.featureCollection(polygons);
                const unionResult = turf.union(fc);
                if (unionResult) detourPolygon = unionResult;
            }
        }
    } catch (e) {
        console.error("🗺️ [GeoService] Turf.js buffer 생성 에러:", e);
        return null;
    }
    if (!detourPolygon) return null;

    // 🚀 [최적화] 완성된 최종 경유 폴리곤의 Bounding Box를 우선 계산
    const detourBbox = turf.bbox(detourPolygon);

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
    const orderKm: Record<string, number> = {};
    // 순서용 동명이인 판정에만 쓴다 — 스냅점이 경로에서 얼마나 떨어져 있었나
    const orderSnapDistKm: Record<string, number> = {};

    /**
     * 🔴 **하차지 주변으로 들어온 동은 트림에서 빼지 않는다** (2026-08-14 실측으로 발견).
     *
     * 하차지 반경은 *경로* 조건이 아니라 *목적지* 조건이다 — "도착지 근처에서 마지막으로
     * 하나 더 줍자". 그런데 진행도로 자르면 **도착이 가까울수록 그 동네들이 먼저 사라진다.**
     * 시뮬레이션에서 경로 끝에 다다르자 경유가 1개까지 줄었다. 정확히 필요한 순간에 사라진 것이다.
     *
     * 그래서 진행도를 `Infinity` 로 준다 — 어디까지 가도 안 빠진다.
     * (하차지 원의 중심은 경로의 마지막 점이다. 위 버퍼 합병이 쓰는 좌표와 같아야 어긋나지 않는다)
     */
    const destCenter = (destinationRadiusKm && destinationRadiusKm > 0 && lineCoords.length > 0)
        ? lineCoords[lineCoords.length - 1]
        : null;

    for (const feature of mergedMapFeatureCollection.features) {
        const props = feature.properties || {};
        const regionName = props.EMD_KOR_NM;
        const parentName = props.intel?.parentName || props.SIG_KOR_NM || "기타 지역";
        
        if (!regionName) continue;

        // 🚀 [최적화] BBox 선행 검사: 무거운 폴리곤 교차 연산 전에, 사각형 테두리가 겹치는지 먼저 확인. 안 겹치면 즉시 스킵하여 연산량 90% 소거.
        if (feature.bbox) {
            const fbbox = feature.bbox;
            if (detourBbox[0] > fbbox[2] || detourBbox[2] < fbbox[0] ||
                detourBbox[1] > fbbox[3] || detourBbox[3] < fbbox[1]) {
                continue;
            }
        }

        try {
            // detour(경로 경유)와 feature(행정구역 지도)가 1픽셀이라도 겹치면 T
            if (turf.booleanIntersects(detourPolygon, feature.geometry)) {
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
                        // 하차지 원 안(또는 걸친) 동이면 영원히 남긴다
                        const inDest = destCenter
                            && haversineKm(c.geometry.coordinates[1], c.geometry.coordinates[0], destCenter[1], destCenter[0])
                               <= (destinationRadiusKm as number) + pad;
                        const val = inDest ? Infinity : at + pad;
                        // 같은 이름의 동이 여럿이면 **가장 늦은 것**을 남긴다 (역시 늦게 빼기 위해)
                        if (prev === undefined || val > prev) progressKm[regionName] = val;

                        // 순서용은 순수 스냅점 — pad·Infinity 없음 (#78 · 인터페이스 주석 참고).
                        // 동명이인은 경로에 가장 가까운 것이 이긴다
                        const snapDist = (snapped.properties?.dist as number) ?? Infinity;
                        const prevDist = orderSnapDistKm[regionName];
                        if (prevDist === undefined || snapDist < prevDist) {
                            orderKm[regionName] = at;
                            orderSnapDistKm[regionName] = snapDist;
                        }
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

        /**
         * 🏙️ **구 이름도 목록에 싣는다 — 진행도는 비운 채로** (기사님 지적 2026-08-23).
         *
         * 배차망 리스트는 서울·성남·안산 같은 대도시를 **구**로 표시하는데, 경유 목록은
         * 읍/면/동만 담고 있어 그 콜이 전멸했다 (`분당구`·`동작구`·`단원구`·`강동구` ❌).
         * 앱은 도착 목록을 `destinationKeywords ∪ progressKm 키` 로 만들므로,
         * **여기 실으면 리스트·상세 양쪽에서 한 번에 산다** (앱은 안 고쳐도 된다).
         *
         * 🔴 값은 **`null`(순서 미상)** 이다. 구는 넓어서 *"경로 몇 km 지점"* 이 하나로
         *    안 정해진다 — 0 이나 평균을 넣으면 **없는 숫자를 지어내는 것**이고(규칙 ④),
         *    그 숫자로 역주행 판정이 돌아 멀쩡한 콜이 막힌다. 앱의 `RouteOrderFilter` 는
         *    `null` 을 *"모르면 통과"* 로 이미 다룬다 — 경로 위에 있다는 것만 알리고
         *    정밀한 구분은 서버가 전체 주소로 한다 (규칙 ⑤).
         *
         * ⚠️ 동 이름을 덮지 않는다. 같은 글자의 동이 있으면 그쪽 숫자가 이긴다.
         */
        const tail = parent.split(' ').pop() ?? '';
        if (tail !== parent && /구$/.test(tail) && isUniqueDistrictName(tail) && !(tail in progressKm)) {
            (progressKm as Record<string, number | null>)[tail] = null;
            /**
             * ⚠️ **도착 목록에도 넣어야 앱까지 간다.** `buildAppOrderKm` 은
             *    `destinationKeywords` 를 **돌면서** 진행도를 뽑는다 — 지나온 구간을 뺄 때
             *    목록과 진행도가 **한 벌로** 줄어야 하기 때문이다. 여기만 넣고 목록에서
             *    빠뜨리면 앱은 구 이름을 영영 못 본다.
             *    (트림 규칙 ①*"진행도를 모르는 동은 남긴다"* 라 구는 안 빠진다)
             */
            matchedRegionNames.add(tail);
        }
    }

    return {
        flat: Array.from(matchedRegionNames).sort(),
        grouped: resultGroups,
        customCityFilters: Array.from(customCitySet),
        progressKm,
        orderKm,
    };
}

/** 필터가 앱에 실어 보내는 지역 정보 한 벌 — 동 목록 · 시별 묶음 · 시 별칭 */
export interface CityRegions {
    flat: string[];
    grouped: Record<string, string[]>;
    customCityFilters: string[];
}

/** 시별 묶음에서 별칭을 뽑아 붙인다 — 합짐(경유)과 첫짐이 **같은 규칙**을 쓰게 하는 지점 */
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
    return snapToRoute(polyline, gps)?.progressKm ?? null;
}

/**
 * 🛣️ **부여받은 경로에 지금 자리를 대 본다 — «어디쯤»과 «얼마나 벗어났나»를 함께 낸다.**
 *
 * 기사님(2026-09-12 밤): *"카카오 라인과 내 궤적이 같이 있어야 **얼마나 잘못 갔는지**
 * 확인할 수 있을 것 같아."* — `gps_tracks` 를 만든 원래 이유가 그것이다
 * (2026-08-26: *"네비게이션이 가리키는 경로를 놓쳐서 지나치면 얼마나 우회하게 되는 건지…
 * 부여받은 경로와 현실의 주행 궤적을 매칭해야 차이를 확인할 수 있을 듯"*).
 *
 * 🔴 **재료는 이미 있었고 절반을 버리고 있었다.** `nearestPointOnLine` 은 스냅한 점의
 *    **진행도(`location`)와 떨어진 거리(`dist`)를 한 번에** 준다. 그런데 위 함수가
 *    진행도만 꺼내 쓰고 거리를 버렸다 — 「얼마나 벗어났나」를 답할 값이 매 좌표마다
 *    손에 들어왔다가 사라진 셈이다. 한 번 계산해서 둘 다 돌려준다 (규칙 ③).
 *
 * ⚠️ **경로를 벗어나도 값은 늘 나온다** — 가장 가까운 점으로 스냅되기 때문이다.
 *    그래서 «벗어났나»는 `offRouteKm` 이 답하지 `progressKm` 이 답하지 않는다.
 * ⚠️ 실측 0.14ms. 이동할 때마다 도는 유일한 지리 연산이다.
 */
export function snapToRoute(
    polyline: Array<{ x: number; y: number }> | null | undefined,
    gps: { x: number; y: number },
): { progressKm: number; offRouteKm: number } | null {
    if (!polyline || polyline.length < 2) return null;
    try {
        const line = turf.lineString(polyline.map(p => [p.x, p.y]));
        const snapped = turf.nearestPointOnLine(line, turf.point([gps.x, gps.y]));
        const progressKm = snapped.properties?.location as number | undefined;
        const offRouteKm = snapped.properties?.dist as number | undefined;
        if (progressKm == null || offRouteKm == null) return null;   // 모르면 모른다 (규칙 ④)
        return { progressKm, offRouteKm };
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
/**
 * 🧪 **지금 지도가 담고 있는 것** — 판 점검(`/api/sim/preflight`)이 읽는다 (2026-09-06).
 * 「1,968개」인지 「1,239개」인지가 충청 확장이 실렸는지를 한 줄로 말해 준다.
 */
export function mapCoverage(): { features: number; sido: string[] } {
    const fs = mergedMapFeatureCollection?.features ?? [];
    const sido = new Set<string>();
    for (const f of fs) sido.add(String((f.properties as any)?.code ?? '').slice(0, 2));
    sido.delete('');
    return { features: fs.length, sido: [...sido].sort() };
}

/** 격자 한 칸(km) — 영역 안에 찍는 점 간격. 원(반경 수 km)을 30×30 남짓으로 찍는다 */
const PICKUP_GRID_KM = 0.3;

/**
 * 📍 **영역에 걸친 읍·면·동 — 시·군·구로 묶어서** — 기사님 규칙 «영역에 지역이 걸치고 있으면 들어간다» (2026-09-15).
 *
 * «걸침»을 둘로 잡는다 — 하나만 맞아도 넣는다:
 *   ① 영역 안 격자 점(`PICKUP_GRID_KM`)이 동 안에 있다 — 동이 영역을 넓게 덮을 때 (동 꼭짓점은 전부 영역 밖일 수 있다)
 *   ② 동 테두리 꼭짓점이 영역 안에 있다 — 격자보다 얇게 걸친 동 (①만 보면 빠진다)
 * ⚠️ 둘 다 놓치는 것: 동 테두리의 한 변이 꼭짓점 없이 영역 가장자리를 0.3km 보다 얇게 스치는 경우뿐이다.
 * 간소화 사본(`simplified` · 200m)과 사각형(`bbox`)으로 먼저 거른다 (`getDetourRegions` 와 같은 최적화).
 * 묶는 이름은 `getCityRegionsWithRadius` 와 같은 칸(`intel.parentName` · `SIG_KOR_NM`) — 시 별칭(`cityAliases`)이 이 이름으로 만들어진다.
 */
export function regionsTouchingAreaGrouped(area: {
    /** 영역을 감싼 사각형 [서, 남, 동, 북] */
    bbox: [number, number, number, number];
    inArea: (p: { lng: number; lat: number }) => boolean;
    /** 영역 안 격자 점 */
    points: Array<{ lng: number; lat: number }>;
}): Record<string, string[]> {
    if (!mergedMapFeatureCollection || !mergedMapFeatureCollection.features) return {};
    const [minX, minY, maxX, maxY] = area.bbox;
    const groups: Record<string, Set<string>> = {};
    const vertexInArea = (geom: any): boolean => {
        const rings: number[][][] = geom?.type === 'Polygon' ? geom.coordinates
            : geom?.type === 'MultiPolygon' ? (geom.coordinates as number[][][][]).flat() : [];
        for (const ring of rings) for (const [x, y] of ring) {
            if (x < minX || x > maxX || y < minY || y > maxY) continue;
            if (area.inArea({ lng: x, lat: y })) return true;
        }
        return false;
    };
    for (const feature of mergedMapFeatureCollection.features as any[]) {
        const name = feature.properties?.EMD_KOR_NM;
        if (!name) continue;
        const parent = feature.properties?.intel?.parentName || feature.properties?.SIG_KOR_NM || '기타 지역';
        if (groups[parent]?.has(name)) continue;
        const fb = feature.bbox ?? turf.bbox(feature);
        if (fb[2] < minX || fb[0] > maxX || fb[3] < minY || fb[1] > maxY) continue;
        const shape = feature.simplified ?? feature;
        let hit = vertexInArea(shape.geometry ?? shape);
        if (!hit) for (const p of area.points) {
            if (p.lng < fb[0] || p.lng > fb[2] || p.lat < fb[1] || p.lat > fb[3]) continue;
            try {
                if (turf.booleanPointInPolygon(turf.point([p.lng, p.lat]), shape)) { hit = true; break; }
            } catch { /* 형식이 이상한 폴리곤은 건너뛴다 */ }
        }
        if (hit) (groups[parent] ??= new Set()).add(name);
    }
    return Object.fromEntries(Object.entries(groups).map(([parent, names]) => [parent, [...names].sort()]));
}

/**
 * ⭕ **원 하나의 영역 재료** — 원을 감싼 사각형 · 그 안 격자 점 · 판정. `inArea` 를 주면 원 안에서 그 판정으로 점을 거른다 (원 ∩ 라인).
 *    상차 목록(`pickupListFor`)과 가까이 온 목적지의 하차 목록(`regionsTouchingCircleGrouped`)이 함께 쓴다.
 */
function circleArea(center: { lng: number; lat: number }, km: number, inArea?: (p: { lng: number; lat: number }) => boolean) {
    const KX = 111.32 * Math.cos((center.lat * Math.PI) / 180), KY = 110.574;
    const test = inArea ?? ((p: { lng: number; lat: number }) => haversineKm(center.lat, center.lng, p.lat, p.lng) <= km);
    const bbox: [number, number, number, number] = [center.lng - km / KX, center.lat - km / KY, center.lng + km / KX, center.lat + km / KY];
    const points: Array<{ lng: number; lat: number }> = [];
    const dy = PICKUP_GRID_KM / KY, dx = PICKUP_GRID_KM / KX;
    for (let y = bbox[1]; y <= bbox[3]; y += dy) for (let x = bbox[0]; x <= bbox[2]; x += dx) {
        const p = { lng: x, lat: y };
        if (test(p)) points.push(p);
    }
    return { bbox, inArea: test, points };
}

/**
 * 🔵 **먼 목적지 하차 조각에 걸친 읍·면·동 — 시·군·구로 묶어서** (기사님 2026-09-15 «영역에 지역이 걸치고 있으면 들어가는거야»).
 *
 * 판정은 그물과 같은 `callNet.netAreaTesterOf` · 걸침은 `regionsTouchingAreaGrouped`(격자 점 ∪ 동 꼭짓점).
 * 그물(`netForGoal`)은 동을 중심점 하나로 담아 원 · 마름모 가장자리에 걸친 넓은 읍 · 면이 빠졌다 — 그것을 더한다.
 * ⚠️ 조각을 감싼 사각형이 넓어(마름모 · 라인) 격자를 **성기게** 찍는다 — 한 변 최대 약 150칸. 격자보다 얇게 걸친 동은 꼭짓점 판정이 잡는다.
 */
export function regionsTouchingNetGrouped(o: {
    goal: NetPoint;
    anchor: NetPoint;
    me: NetPoint | null;
    line: Array<[number, number]> | null;
    lastDrop: NetPoint | null;
    params: NetParams;
    lineRadiusKm: number;
}): Record<string, string[]> {
    const inArea = netAreaTesterOf(o.goal, { line: o.line, lineRadiusKm: o.lineRadiusKm, lastDrop: o.lastDrop, params: o.params, anchor: o.anchor, me: o.me });
    const pts = [o.goal, o.anchor, ...(o.me ? [o.me] : []), ...(o.lastDrop ? [o.lastDrop] : []),
        ...(o.line ?? []).map(([lng, lat]) => ({ lng, lat }))];
    const lat0 = pts.reduce((sum, p) => sum + p.lat, 0) / pts.length;
    const KX = 111.32 * Math.cos((lat0 * Math.PI) / 180), KY = 110.574;
    const pad = Math.max(o.params.quadRadiusKm, o.params.srcDiamKm / 2, o.params.dstDiamKm / 2, o.lineRadiusKm) + 0.5;
    const bbox: [number, number, number, number] = [
        Math.min(...pts.map(p => p.lng)) - pad / KX, Math.min(...pts.map(p => p.lat)) - pad / KY,
        Math.max(...pts.map(p => p.lng)) + pad / KX, Math.max(...pts.map(p => p.lat)) + pad / KY,
    ];
    const stepKm = Math.max(PICKUP_GRID_KM, Math.max((bbox[2] - bbox[0]) * KX, (bbox[3] - bbox[1]) * KY) / 150);
    const points: Array<{ lng: number; lat: number }> = [];
    const dy = stepKm / KY, dx = stepKm / KX;
    for (let y = bbox[1]; y <= bbox[3]; y += dy) for (let x = bbox[0]; x <= bbox[2]; x += dx) {
        const p = { lng: x, lat: y };
        if (inArea(p)) points.push(p);
    }
    return regionsTouchingAreaGrouped({ bbox, inArea, points });
}

/** 🎯 **원에 걸친 읍·면·동 — 시·군·구로 묶어서** — 가까이 온 목적지의 하차 목록 (`filterManager.netKeywordsOf` · 필터.md «하차 영역») */
export function regionsTouchingCircleGrouped(center: { lng: number; lat: number }, km: number): Record<string, string[]> {
    return regionsTouchingAreaGrouped(circleArea(center, km));
}

/**
 * 📋 **상차 목록을 계산한다 — 한 곳** (기사님 확정 2026-09-15 · `docs/지금/필터.md` «상차 영역»).
 *
 * 모양은 shared `pickupShapeOf` — 살아 있는 목적지 중 하나라도 운행 뒤가 아니면 **현위치 영역 전체**,
 * 전부 운행 뒤면 **현위치 영역 ∩ 라인 영역**. 관제웹 «상차» 레이어가 같은 함수로 그린다 (규칙 ③).
 * 그 영역에 **걸친** 읍·면·동이 목록이다 (`regionsTouchingAreaGrouped`).
 * 🔴 운행 뒤인데 라인이 없으면 현위치 영역 전체로 본다 — 라인을 지어내지 않는다 (규칙 ④ · 지도와 같다).
 * 🔴 «경로 몇 km»를 안 본다 — 되돌아가는 경로에서 다시 지날 동이 빠지던 D3 가 이 계산에는 없다.
 * 세션을 모른다 — 서버 `filterManager.rebuildPickupList` 가 값을 넘기고, 검사가 실제 지도로 이 함수를 부른다.
 */
export function pickupListFor(o: {
    me: { x: number; y: number };
    radii: { pickupRadiusKm: number; detourRadiusKm: number };
    line: Array<{ x: number; y: number }> | null;
    zones: ReadonlyArray<GoalZone>;
}): { list: string[]; grouped: Record<string, string[]>; shape: 'me' | 'meLine' | null } {
    const want = pickupShapeOf(o.zones);
    if (!want) return { list: [], grouped: {}, shape: null };   // 목적지가 없다 — 빈 목록은 고장으로 막힌다 (`callFilterBlocker`)
    const line = o.line && o.line.length >= 2 ? o.line.map(p => [p.x, p.y] as [number, number]) : null;
    const shape = want === 'meLine' && line ? 'meLine' : 'me';
    const r = o.radii.pickupRadiusKm;
    const inMe = (p: { lng: number; lat: number }) => haversineKm(o.me.y, o.me.x, p.lat, p.lng) <= r;
    const inArea = shape === 'meLine'
        ? (p: { lng: number; lat: number }) => inMe(p) && distToLineKm(p, line!) <= o.radii.detourRadiusKm
        : inMe;

    /* 격자 — 영역은 늘 현위치 원 안이라 원을 감싼 사각형만 찍으면 된다 (`circleArea`) */
    /* 🗂️ 시 · 군 · 구로 묶어서도 낸다 — 하차 목록이 같은 이름의 다른 동을 안 빼게 (`mergeDropoffGroups` · 코드 리뷰 2026-09-15) */
    const grouped = Object.fromEntries(Object.entries(regionsTouchingAreaGrouped(circleArea({ lng: o.me.x, lat: o.me.y }, r, inArea)))
        .map(([region, names]) => [region, names.filter(isPickupListName)] as [string, string[]])
        .filter(([, names]) => names.length > 0));
    return { list: [...new Set(Object.values(grouped).flat())].sort(), grouped, shape };
}

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
 * 이동할 때마다 경유를 통째로 다시 그리던 함수다(실측 173ms). 그 비용 때문에 2km 마다만
 * 돌렸고, 정작 `getActivePolyline` 이 죽어 있어서 **한 번도 실행되지 않았다.**
 *
 * 지금은 경유를 만들 때 동마다 진행도를 같이 기록하고(`DetourRegions.progressKm`),
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
 * 경유를 만드는 `syncDetourFilter` 와 **같은 기준**을 쓴다 — 마지막 활성 콜의 경로.
 * 다르면 "경유를 만든 경로"와 "진행도를 재는 경로"가 어긋나 엉뚱한 동이 빠진다.
 */
export function getActivePolyline(session: { myOrders: MyOrder[] }): Array<{x: number; y: number}> | null {
    const active = getActiveCalls(session);
    if (active.length === 0) return null;
    const poly = active[active.length - 1]?.routePolyline;
    return poly && poly.length >= 2 ? poly : null;
}


/**
 * 마지막 하차지 좌표 — **도착 감지의 기준점.**
 *
 * 🔴 2026-08-14 **되살렸다.** `getActivePolyline` 과 같은 병이었다 —
 *    `session.subCalls` / `mainCallState` 는 V2 리팩터링에서 사라진 필드라 **늘 null 을
 *    반환했고**, 그래서 하차지 500m 도착 감지가 **한 번도 동작하지 않았다.**
 *    (`driverAction` 이 `UNLOADING` 으로 자동 전환되는 일이 없었다는 뜻이다)
 *
 * 기준은 **경로의 마지막 점**이다. 경유가 하차지 반경을 그릴 때 쓰는 좌표와 같아야
 * "도착했다"와 "도착지 주변이다"가 어긋나지 않는다.
 * 경로가 아직 없으면 콜에 실려 온 하차지 좌표로 물러선다.
 */
export function getLastDropoffCoord(session: { myOrders: MyOrder[] }): {x: number; y: number} | null {
    const active = getActiveCalls(session);
    if (active.length === 0) return null;

    const last = active[active.length - 1];
    const poly = last?.routePolyline;
    if (poly && poly.length > 0) {
        const end = poly[poly.length - 1];
        return { x: end.x, y: end.y };
    }
    if (last?.dropoffX != null && last?.dropoffY != null) {
        return { x: last.dropoffX, y: last.dropoffY };
    }
    return null;
}


/** 
 * [마스터 GPS 처리] 관제웹에서 보내온 실시간 GPS(또는 시뮬레이션 GPS)를 기반으로
 * 1. 현재 세션의 위치를 업데이트
 * 2. 2km 이상 이동 시 경유(Detour Trim) 동적 축소 계산 및 필터 갱신
 * 3. 마지막 하차지 500m 이내 도착 시 ARRIVED 상태로 전환
 */
/** 이만큼 움직였을 때만 위치를 남긴다 (기사님 결정: "이동이 있을 때만") */
const GPS_LOG_MIN_KM = 0.2;

/**
 * 이 속도를 넘으면 **트럭이 낸 속도가 아니다** — 위치가 튄 것이다.
 * 2026-08-14 이전에 `11669km/h` 가 실제로 찍혔다(위치 파이프가 둘이라 서로 다른 좌표가 번갈아 갔다).
 *
 * ⚠️ **시뮬레이터에는 쓰지 않는다.** 개발용 시뮬레이터는 15배속이라 매 틱이 이 속도를 넘는다 —
 *    그대로 두면 로그가 거짓 경보로 뒤덮여 진짜 사건이 묻힌다 (만들자마자 실측으로 확인했다).
 */
const IMPLAUSIBLE_SPEED_KMH = 200;

/**
 * 한 번에 이만큼 건너뛰면 **어느 출처든 순간이동이다.**
 * 2026-08-14 실측: 합짐 하나를 내리자 시뮬레이터가 파주 → 광주 원점으로 **52.6km** 를 한 틱에
 * 건너뛰었다. 정상 틱은 0.1~0.6km 다.
 * (터널을 나온 실 GPS 는 오래 끊겼다 다시 잡히므로 아래 시간 조건으로 걸러진다)
 */
const GPS_JUMP_MIN_KM = 5;
const GPS_JUMP_MAX_GAP_S = 30;

/**
 * 🔴 **속도를 재려면 표본이 커야 한다** (2026-08-26 실측).
 *
 * 2회차 주행 로그의 「위치 점프」 **70줄 중 43줄이 `0.0km 를 0.0초에`** 였다.
 * 1m 움직인 것을 `46395km/h` 로 경고한다 — `속도 = 거리 ÷ 시간` 인데 시간이 0에
 * 가까우면 거리가 아무리 작아도 속도가 폭발하기 때문이다(`elapsedS` 바닥이 0.001초).
 *
 * 그래서 **진짜 점프와 구분이 안 됐다.** 궤적을 그 줄에서 복원하려다 실제로 한 번
 * 오독했다. 경고가 너무 자주 울리면 경고가 아니다.
 *
 * ⚠️ 이건 **로그 문턱**이지 `speedKmh` 를 바꾸는 게 아니다 — 그 값은 도착 감지가
 *    쓰고 있고, 지금 손대면 감지가 흔들린다 (2회차에 이미 5곳 중 3곳을 놓쳤다).
 */
const SPEED_SAMPLE_MIN_KM = 0.05;
const SPEED_SAMPLE_MIN_S = 1;

/**
 * 이 틱의 속도를 «믿을 수 있는가» — 순수 계산이라 폰 없이 검사된다.
 * 표본이 작으면(50m 미만 · 1초 미만) 속도는 의미가 없다.
 */
export function isSpeedSampleUsable(movedKm: number, elapsedS: number): boolean {
    return movedKm >= SPEED_SAMPLE_MIN_KM && elapsedS >= SPEED_SAMPLE_MIN_S;
}

/**
 * 도착 감지 파라미터 (근거: docs/기록/결정_이력.md «도착은 GPS 가 찍는다»)
 *
 * · RADIUS_KM 0.5 — 기존값 유지. 주차 위치·GPS 오차 감안 (바꿀 실측 근거가 아직 없다)
 * · STILL_KMH 5 · HOLD_SEC 30 — "통과"와 "도착"을 가른다. 정거장 옆 도로를 지나가는
 *   것만으로 500m 안에 반드시 들어오므로, **실 GPS 는 근접+정지 30초**여야 도착이다.
 *   ⚠️ 신호 대기(60~120초)는 못 거른다 — 오발 시 undo 로 뒤집는다 (자동은 ARRIVED_* 뿐이라
 *   상태 피해가 없다). L4 실측으로 빈도를 보고 조정한다.
 * · 시뮬(`mock`)은 15배속이라 "정지"가 없다 — 근접만으로 판정 (안 가르면 L4 검증 불가)
 * · NOTICE_KM 3 — 근접 예고(도착전 통화). 시내 ~35km/h 로 약 5분 (용어집 §10)
 */
export const GPS_ARRIVAL = {
    RADIUS_KM: 0.5,
    STILL_KMH: 5,
    HOLD_SEC: 30,
    NOTICE_KM: 3,
    /**
     * 🚚 **떠남 판정(옛 규칙)** — 하차지에 **도착이 찍힌 뒤** 이만큼 멀어지면 «내리고 갔다».
     *    (기사님 확정 2026-08-25: *"2km 로 정하고 진행해 보자"*)
     *
     * ⚠️ 2026-09-03 부터 **지나침 판정**(`evaluatePassTick` · 진입 300m → 이탈 400m)이
     *    상차·하차 둘 다를 **도착과 무관하게** 처리한다. 이 2km 규칙은 그보다 늦게
     *    걸리므로 사실상 예비다 — 지나침이 먼저 찍으면 여기는 할 일이 없다.
     *
     * 기사님: *"곤지암과 부발에서 멀어진 거면 하차를 했는데 버튼을 못 누른 걸로 봐야
     * 하지 않을까… 운행 중에 클릭 못 할 거라 말이지."*
     *
     * 🔴 2026-08-25 실측이 근거다. GPS 는 상차지 도착 3건·하차지 도착 3건을 다 찍었는데
     *    **손으로 눌러야 하는 네 단계(통화·상차완료·하차통화·하차완료)는 전부 비어 있었다.**
     *    적재가 90박스로 남아 다음 콜이 차종에서 막혔다 — 어제 실주행의 «안전취소 24건»과
     *    같은 모양이다 (운전 중에는 아무것도 못 누른다).
     *
     * ⚠️ **되돌릴 수 없는 기록이 아니다.** 단계 표는 `UNIQUE(orderId)` + `INSERT OR REPLACE`
     *    라 나중에 그 단계에서 고칠 수 있고, 하차 완료된 콜은 `TERMINAL_STATUSES` 라
     *    적재·경로 계산에서 빠져 **다른 콜과 관계가 끊긴다**. 고쳐도 남에게 번지지 않는다.
     */
    DEPARTED_KM: 2,
} as const;

/**
 * 📍 **이 시간 넘게 좌표가 안 오면 «지금 위치»가 아니다** (기사님 실측 2026-08-25).
 *
 * 기사님: *"경로가 이상하게 그리는건 이유가 뭐야?"*
 *
 * 14:24 에 모의 주행이 **여주**에서 끝났는데, 4시간 25분 뒤 **광주**에서 콜을 잡을 때도
 * 서버가 그 여주 좌표를 현위치로 믿었다. 경로 요청 origin 이 세 번 다 소수점 14자리까지
 * 같았다 — 접근 구간이 **40km 뒤로** 잡혀 지도가 그렇게 그려졌다.
 * 실 운행에서도 터널·실내 주차장에서 GPS 가 끊기면 같은 형태로 난다.
 *
 * ── 값의 근거 ──
 * 관제웹이 붙어 있으면 위치는 **초 단위**로 온다. 5분간 한 번도 안 왔다면 그건
 * «잠깐 튄 것»이 아니라 **연결이 끊긴 것**이다. 그리고 5분이면 차가 최대 8km 움직여
 * 접근 구간(현위치 → 상차지)이 이미 무의미해진다.
 */
export const DRIVER_LOCATION_STALE_MS = 5 * 60 * 1000;

/**
 * 낡은 현위치를 **비운다** — 판단하는 곳은 여기 하나뿐이다 (규칙 ③).
 *
 * 비우면 이미 있는 «내 주소로 메우기» 길이 받고, 화면이 «내 주소 기준»이라고 말한다
 * (`originIsFallbackLEGACY`). 없는 값을 지어내지 않는다 (규칙 ④).
 *
 * ⚠️ **타이머를 두지 않는다.** 읽는 순간 빼기 한 번이다 — 타이머는 좀비가 되고(규칙 ②),
 *    5분마다 깨어나도 «4분 59초»와 «9분 59초»를 똑같이 취급해 오히려 부정확하다.
 * ⚠️ **받은 시각을 모르면 건드리지 않는다** — 없는 값으로 지우지 않는다 (규칙 ④).
 */
/**
 * 📍 **«지금 기점» — 저장하지 않고 물을 때 고른다** (기사님 지시 2026-09-12).
 *
 * 기사님: *"함수가 함수를 부르는 것이 이상해. **상태가 바뀌면 거기에 따라 알아서
 * 바뀌어야 하는 거 아냐?** 함수가 여러 가지 일을 하는 것이 별로야."*
 *
 * ── 전에는 어땠나 ──
 * 세션에 «지금 위치»를 **써 두고**, 조건이 어긋나면 **지웠다.** 지우는 손이 넷이었다:
 * 낡았을 때(`dropStaleLocation`) · 빈 차인데 가짜일 때(`dropOffDutyMockLocation`) ·
 * 주행이 끝났을 때(`clearMockLocation` ← 소켓 `mock-driving-ended`) ·
 * 그리고 비운 뒤 메우는 손(`ensureDriverOrigin`). 넷이 같은 질문에 각자 답했다.
 *
 * 🔴 **그래서 2026-09-12 에 «반만 고침»이 났다.** 아침에 「콜 쥔 동안엔 안 걷는다」로
 *    조건을 바꾸며 읽는 자리만 고치고 주행이 끝나는 자리를 놓쳤다. 콜 셋을 쥔 채
 *    경로 끝에 닿자 위치가 집으로 튀어 **경로 순서가 뒤집히고 버퍼가 −23분**이 됐다
 *    (실측 14:38 · `1초월읍상·2곤지암읍상` → `1사음동상·2중리동하`).
 *
 * ── 지금은 ──
 * 세션에는 **«마지막으로 받은 좌표»(`lastFix`)만** 남는다. 아무도 안 지운다.
 * «지금 기점»은 물을 때마다 여기서 고른다 — 상태가 바뀌면 **다음 답이 저절로 달라진다.**
 * 「언제 지울까」라는 질문이 사라졌으므로 반만 고칠 자리도 없다 (규칙 ③).
 *
 * 🔴 **셋 중 하나라도 어긋나면 집 주소를 쓴다** — 그리고 `isFallback` 으로 **그 사실을 말한다.**
 *    추정으로 계산했다는 것을 숨기지 않는다 (규칙 ⑤-2).
 *   ① 좌표가 없다
 *   ② 낡았다 — 5분 넘은 좌표는 «지금»이 아니다 (2026-08-25 실측: 4시간 25분 전 여주
 *      좌표를 «지금»으로 믿어 접근 구간을 40km 뒤로 그렸다)
 *   ③ **빈 차(STANDBY)인데 가짜다** — 모의 좌표는 콜을 쥔 동안에만 «지금 위치»다.
 *      2026-08-14 에 시뮬이 파주에서 멈춘 뒤 남은 좌표로 다음 콜 경로가
 *      «파주 → 광주 → 파주» 156km 로 그려졌다.
 *      ⚠️ **실 GPS 에는 이 제한이 없다** — 차를 세워 둬도 기사님은 진짜 거기 계신다.
 */
export interface DriverOrigin {
    x: number;
    y: number;
    /** 📍 이 좌표가 어디서 왔나 — 화면이 적을 말 (`home` 은 «대신 쓰는 중»이다) */
    source: 'gps' | 'mock' | 'manual' | 'home';
    /** 🏠 집 주소로 대신한 것인가 — «추정으로 쟀다»를 화면이 말할 수 있게 */
    isFallback: boolean;
}

/**
 * 🎭 **모의 GPS 소켓이 이만큼 조용하면 «모의 주행이 멈췄다»** — 관제웹 두 곳이 겹칠 때 임자를 넘기는 기준과 같은 값이다
 *    (`socketHandlers` 의 «모의 GPS 는 한 소켓만») · `originOf` ③ 이 «돌고 있는 모의 주행»을 가르는 데도 쓴다.
 */
export const MOCK_GPS_OWNER_QUIET_MS = 5_000;

export function originOf(
    session: {
        /** 🔑 세션이 제 주인을 안다 — 부르는 쪽이 userId 를 또 들고 다니지 않게 (규칙 ③) */
        userId: string;
        lastFix: { x: number; y: number } | null;
        lastFixAt: number | null;
        lastFixIsMock?: boolean;
        lastFixSource?: 'gps' | 'mock' | 'manual';
        activeFilter?: { dispatchPhase?: string | null };
        /** 🎭 모의 GPS 소켓 임자 — 마지막으로 보낸 시각이 «모의 주행이 지금 돌고 있나»를 답한다 */
        mockGpsOwner?: { at: number } | null;
    },
    nowMs: number = Date.now(),
): DriverOrigin | null {
    const fix = session.lastFix;
    const fresh = !!fix && session.lastFixAt != null && nowMs - session.lastFixAt <= DRIVER_LOCATION_STALE_MS;
    /* 🔴 가짜 좌표는 **콜을 쥔 동안에만** «지금 위치»다 (기사님 *"출발을 해야 상차를 하지"*) */
    const phase = session.activeFilter?.dispatchPhase;
    const onDuty = phase === 'DELIVERING' || phase === 'GATHERING';
    /**
     * 🎭 **돌고 있는 모의 주행은 빈 차여도 믿는다** (2026-09-15 다섯 번째 바퀴 · onedal-49 합의).
     *    ③ 이 막으려던 것은 «멈춘 뒤 남은» 모의 좌표다(파주 156km). 모의 주행은 경로 끝에서도 좌표를 계속 보내므로(#133)
     *    임자가 5초 안에 보냈으면 지금 돌고 있다 — 이천에서 빈 차로 서 있는데 상차 목록을 집 둘레로 재지 않는다.
     */
    const mockRunning = !!session.mockGpsOwner && nowMs - session.mockGpsOwner.at <= MOCK_GPS_OWNER_QUIET_MS;
    const mockUsable = !session.lastFixIsMock || onDuty || mockRunning;

    if (fix && fresh && mockUsable) {
        return { x: fix.x, y: fix.y, source: session.lastFixSource ?? 'gps', isFallback: false };
    }

    const home = SettingsRepository.getHomeLocation(session.userId);
    if (!home) return null;   // 🔴 지어내지 않는다 — 없으면 없다고 답한다 (규칙 ④)
    return { x: home.x, y: home.y, source: 'home', isFallback: true };
}

/**
 * 📍 **마지막으로 아는 자리 — «내가 지금 어디 있나»의 답** (2026-09-12 · 기사님 확정).
 *
 * ── `originOf` 와 무엇이 다른가 ──
 * 한 값이 **두 질문에 답하고 있었다** (규칙 ⑤-4 ⑤):
 *
 * | 질문 | 답하는 함수 | 모를 때 |
 * |---|---|---|
 * | 경로를 **어디서부터 짤까** | `originOf` | **집**을 넣는다 — 출발점이 없으면 계산이 안 된다 |
 * | 내가 **지금 어디 있나** | 이 함수 | **모른다**(`null`) — 지어내지 않는다 (규칙 ④) |
 *
 * 🔴 **낡아도 집으로 바꾸지 않는다.** 터널·주차장에서 5분 끊긴 것뿐인데 지도가 집으로
 *    날아가면, 운전 중 1~2초 흘끗 보는 화면이 통째로 튄다. **그물은 더 심하다** —
 *    이천에 있는데 파주 콜이 올라온다 (기사님 확정: 지도·그물 둘 다 «마지막 실제 위치»).
 * 🔴 **낡았다는 사실은 버리지 않고 «표시»로 싣는다** — `isStale`·`ageMs`.
 *    화면이 «12분 전 위치»라고 적을 수 있어야 숫자가 거짓말을 안 한다 (규칙 ⑤-2).
 * ⚠️ **`originOf` 의 5분 규칙은 그대로다.** 그것은 실제 사고에서 나온 방어이고
 *    (여주 4시간 25분 · `staleDriverLocation.test.ts`), 그 질문에는 옳은 답이다.
 */
export interface LastKnownPosition {
    x: number; y: number;
    /** 받은 시각 (ms) */ at: number;
    /** 얼마나 묵었나 (ms) — 화면이 «N분 전»을 적는 재료 */ ageMs: number;
    /** `originOf` 가 «기점으로 쓰기엔 낡았다»고 볼 만큼인가 */ isStale: boolean;
    source: 'gps' | 'mock' | 'manual';
}

export function lastKnownPositionOf(
    session: {
        lastFix: { x: number; y: number } | null;
        lastFixAt: number | null;
        lastFixSource?: 'gps' | 'mock' | 'manual';
    },
    nowMs: number = Date.now(),
): LastKnownPosition | null {
    const fix = session.lastFix;
    /* 🔴 **시각을 모르면 없는 것으로 본다** — 나이를 못 재면 «신선하다»고 우길 수 없다 */
    if (!fix || session.lastFixAt == null) return null;
    const ageMs = nowMs - session.lastFixAt;
    return {
        x: fix.x, y: fix.y,
        at: session.lastFixAt,
        ageMs,
        isStale: ageMs > DRIVER_LOCATION_STALE_MS,
        source: session.lastFixSource ?? 'gps',
    };
}

/**
 * 도착 판정 한 틱 — **순수 함수** (L2 검증용).
 * 속도를 모르면(null) 정지로 치지 않는다 — 없는 숫자를 지어내지 않는다 (규칙 ④).
 */
/**
 * 🚚 **지나침 판정 한 틱 — 순수 함수** (기사님 확정 2026-09-03).
 *
 * 기사님: *"운전중에 그걸 누르는건 너무 위험하다. 실 업무를 진행하면 도착을 못 읽는 경우가
 * 있을 거야. 지나온 목적지를 벗어나면 도착과 상차완료를 순차적으로 종료시켜 주는 것이 맞다."*
 *
 * ── 도착 감지로는 왜 부족한가 ──
 * 도착은 «500m + 정지 30초»다. 안 서고 지나치면 **사슬이 첫 칸부터 시작을 못 한다** —
 * 도착이 없으니 떠남 감시도 안 걸린다. 그래서 이 판정은 **도착과 무관하게 혼자 선다.**
 *
 * 🔴 **들어온 적이 없으면 절대 안 찍는다.** 안 그러면 남의 정거장을 스쳐만 가도 찍힌다.
 * 🔴 **이탈 거리가 진입보다 크지 않으면 안 찍는다** — 설정이 뒤집히면 들어오자마자 찍힌다.
 */
export function evaluatePassTick(
    distKm: number,
    nearKm: number,
    awayKm: number,
    entered: boolean,
): { entered: boolean; passed: boolean } {
    const nowEntered = entered || distKm <= nearKm;
    const sane = awayKm > nearKm;
    return { entered: nowEntered, passed: sane && nowEntered && distKm >= awayKm };
}

export function evaluateArrivalTick(
    heldSinceMs: number | null,
    distKm: number,
    speedKmh: number | null,
    source: string,
    nowMs: number,
    /** ⏸️ 모의 주행이 «서 있다»(정차 연기)고 보냈나 — 실 GPS 는 속도로 잰다 */
    stopped?: boolean,
): { fire: boolean; heldSinceMs: number | null } {
    if (distKm >= GPS_ARRIVAL.RADIUS_KM) return { fire: false, heldSinceMs: null };
    /* 🎭 모의 좌표는 «서 있다»고 온 틱에 곧바로 — 30초는 안 기다린다(정차 연기 12초). 달리는 틱엔 안 찍는다 (2026-09-15 여섯 번째 바퀴 ·
       옛 «근접만으로»는 달리는 중에 도착이 찍혀 시트 마중이 주행 신호에 1초 만에 내려갔다 · gpsArrival.test) */
    if (source === 'mock') return { fire: !!stopped, heldSinceMs: null };
    const still = speedKmh != null && speedKmh < GPS_ARRIVAL.STILL_KMH;
    if (!still) return { fire: false, heldSinceMs: null };
    const since = heldSinceMs ?? nowMs;
    return { fire: (nowMs - since) / 1000 >= GPS_ARRIVAL.HOLD_SEC, heldSinceMs: since };
}

export function processDriverMovement(
    userId: string,
    lat: number,
    lng: number,
    session: UserSession,
    applyFilterCb: (uid: string, filter: any) => void,
    /**
     * 지나온 구간을 뺄 때 부른다 — **필터 변경 경로와 통로를 나눈다.**
     *
     * 🔴 처음에는 `applyFilterCb(userId, {})` 로 파생 재계산을 트리거했는데, 그 안에
     *    *"도착 도시가 비어 있으면 키워드를 지운다"* 는 가지가 있다. 도시를 안 고른 채
     *    운행하면 **0.5km 마다 경유가 통째로 지워진다** — 빈 필터는 고장이라 콜 잡기가 멈춘다.
     *    지나온 구간 제거는 파생을 다시 돌 이유가 없다. 전용 통로로 간다 (더 싸기도 하다).
     */
    trimTraveledCb?: (uid: string) => void,
    /** 좌표 출처 (`native` · `browser` · `mock`) — 관제웹 `gpsBridge` 가 실어 보낸다 */
    source?: string,
    /** 도착 확정 시 (마일스톤 기록·알림은 socketHandlers 가 한다 — 여기는 io 를 모른다) */
    onArrival?: (uid: string, stop: ArrivalStop) => void,
    /** 근접 예고(3km) 시 — 도착전 통화 알림 */
    onApproaching?: (uid: string, stop: ArrivalStop, distKm: number) => void,
    /** 하차지에서 2km 멀어졌을 때 — 하차 완료로 넘긴다 */
    onDeparted?: (uid: string, orderId: string) => void,
    /** 🚚 정거장을 **지나쳤을** 때 — 도착·완료를 순차로 찍는다 (2026-09-03) */
    onPassed?: (uid: string, stop: ArrivalStop) => void,
    /**
     * 🎭 **모의 주행 배속** — 궤적에 «실제 속도»를 남기려고 받는다 (현황판 실측 2026-09-12).
     *
     * 현황판: *"**배속이 차의 속도로 기록되고 있습니다.** 마지막 판 속도 최저 0 · 최고
     * 39,415 · 평균 4,251 km/h … 나중에 궤적을 다시 읽을 때 아무 판단도 못 합니다 —
     * 「여기서 막혔나」를 속도로 보는데 전부 4,000km/h입니다."*
     *
     * 🔴 **배속은 «시간을 빨리 돌리는 것»이지 «차가 빨라지는 것»이 아니다.** 그래서
     *    궤적에는 나눈 값을 남긴다. 안 오면 1 — 실 GPS 는 그대로다.
     * ⚠️ **도착 감지가 쓰는 `speedKmh` 는 안 건드린다** — 그 값은 판정 입력이고, 모의는
     *    애초에 속도를 안 본다(`source === 'mock'` 이면 바로 발화). 나누는 것은 **기록뿐**이다.
     */
    speedMultiplier?: number,
    /**
     * ⏸️ **«지금 서 있다»** (현황판 실측 2026-09-12). 오면 궤적 문턱(50m·15초)을 건너뛴다.
     *
     * 🔴 정지는 «사건이 없는 것»이 아니라 «같은 자리에 있다»는 **사실**이다.
     *    그 논리가 `gpsBridge` 에만 있고 **저장에는 없어서**, 정차 18초 동안 6초마다
     *    좌표를 보내도 **한 점도 안 남았다** (제자리 구간 0건 · 최소 걸음 51m).
     */
    stopped?: boolean,
) {
    if (!lat || !lng) return;
    
    const currentGPS = { x: lng, y: lat }; // 카카오 좌표계 (x=경도, y=위도)

    // 마스터 GPS 위치를 세션에 저장 (지도 렌더링 및 카카오 길찾기 Origin으로 사용됨)
    //
    // 🔴 `dashboardLocation` 에도 같은 값을 넣고 있었는데 **읽는 곳이 한 군데도 없었다.**
    //    선언에도 없는 필드였다 (`pnpm audit:dead` 가 잡았다). 죽은 저장이라 지웠다.
    /**
     * 🔴 **서버가 받은 위치를 남긴다** (2026-08-14 신설).
     *
     * 그전까지 이 줄은 **검증도 로그도 없이** 덮어쓰기만 했다. 위치는 경유·도착 감지·경로의
     * **공통 입력**인데 무엇이 들어왔는지 기록이 없어, D 그룹(시뮬레이터 순간이동 · 파이프 둘 ·
     * 11669km/h)은 확인 자체가 불가능했다. 진행도 로그는 설계상 단조라 증거가 못 된다.
     *
     * 기사님 결정: **이동이 있을 때만** 남긴다(㉮). 매초 찍으면 파일이 부푼다.
     * 다만 **말이 안 되는 점프는 조용해도 남긴다** — 그게 찾으려는 바로 그 사건이다.
     */
    const prev = session.lastFix;
    const prevAt = session.lastGpsAt;
    const src = source || '알수없음';
    /** 도착 감지가 같이 쓴다 — 속도를 모르면 null (지어내지 않는다) */
    let speedKmh: number | null = null;
    /** 점프 틱은 도착 판단을 건너뛴다 — 위치를 믿을 수 없다 */
    let jumped = false;

    // 첫 좌표는 비교 대상이 없다. 시간을 모르면 속도도 지어내지 않는다 (규칙 ④)
    if (prev && prevAt) {
        const movedKm = haversineKm(prev.y, prev.x, currentGPS.y, currentGPS.x);
        const elapsedS = Math.max(0.001, (Date.now() - prevAt) / 1000);
        const kmh = (movedKm / elapsedS) * 3600;
        speedKmh = kmh;

        const teleported = movedKm >= GPS_JUMP_MIN_KM && elapsedS < GPS_JUMP_MAX_GAP_S;
        // 🔴 표본이 작으면 속도가 거짓말한다 — 경고를 울리지 않는다 (위 주석)
        const tooFast = src !== 'mock' && isSpeedSampleUsable(movedKm, elapsedS)
            && kmh > IMPLAUSIBLE_SPEED_KMH;
        jumped = teleported || tooFast;

        if (teleported || tooFast) {
            console.log(`🚨 [위치 점프] ${movedKm.toFixed(1)}km 를 ${elapsedS.toFixed(1)}초에 ` +
                `(${Math.round(kmh)}km/h · 출처 ${src}) — ${prev.x.toFixed(4)},${prev.y.toFixed(4)} → ` +
                `${currentGPS.x.toFixed(4)},${currentGPS.y.toFixed(4)}`);
        } else if (movedKm >= GPS_LOG_MIN_KM) {
            console.log(`📍 [위치] ${currentGPS.x.toFixed(4)},${currentGPS.y.toFixed(4)} ` +
                `· ${(movedKm * 1000).toFixed(0)}m 이동 · ${Math.round(kmh)}km/h · 출처 ${src}`);
        } else if (stopped) {
            /* ⏸️ 서 있는 것도 «사실»이라 남긴다 — 안 찍으면 «좌표가 왔는지»를 되짚을 수 없다 */
            console.log(`⏸️ [정차] ${currentGPS.x.toFixed(4)},${currentGPS.y.toFixed(4)} · 같은 자리 · 출처 ${src}`);
        }
    }
    /**
     * 🛰️ **궤적을 남긴다** (기사님 확정 2026-08-26).
     *
     * 여기가 좌표가 들어오는 **유일한 문**이라 저장도 여기서 한다 (규칙 ③).
     * 문턱(50m·15초)과 일괄 쓰기는 `gpsTrackStore` 가 판단한다 — 이 함수는 부르기만 한다.
     *
     * 🔴 **점프 틱도 남긴다.** 그게 찾으려는 바로 그 사건이다 (위 로그 규칙과 같은 뜻).
     * ⚠️ 저장은 «기록»이지 판정 입력이 아니다 — 실패해도 콜 잡기를 멈추지 않는다.
     */
    {
        const lastPt = session.lastTrackPoint ?? null;
        const nowPt = { x: currentGPS.x, y: currentGPS.y, atMs: Date.now() };
        if (shouldStoreGpsPoint(lastPt, nowPt, stopped)) {
            // 🧭 «그때 어느 콜을 향하고 있었나»를 함께 싣는다 — 경로 대조의 열쇠
            /* 🎭 배속으로 나눈 «실제 속도»를 남긴다 — 판정이 쓰는 `speedKmh` 는 그대로다 */
            const mult = speedMultiplier && speedMultiplier > 0 ? speedMultiplier : 1;
            const realSpeed = speedKmh != null ? Math.round(speedKmh / mult) : null;
            bufferGpsPoint(userId, gpsPointOf(session, currentGPS, nowPt.atMs, src, realSpeed, mult));
            session.lastTrackPoint = nowPt;
        }
    }

    session.lastGpsAt = Date.now();

    session.lastFix = currentGPS;
    session.lastFixAt = Date.now();   // 낡음을 재려면 «언제 받았나»가 있어야 한다
    session.lastFixIsMock = src === 'mock';   // 가짜는 운행 국면 밖에서 못 산다
    /**
     * 📍 **온 그대로 적는다** (2026-09-12 · 현황판 담당 요청 ①).
     *    여기가 좌표가 들어오는 **유일한 문**이라 출처도 여기서 남긴다 (규칙 ③).
     *    ⚠️ 모르는 말이 오면 «모른다»로 둔다 — `gps` 로 지어내면 화면이 거짓말한다 (규칙 ④).
     */
    session.lastFixSource =
        src === 'mock' || src === 'manual' ? src
        : src === 'native' || src === 'browser' || src === 'real' ? 'gps'
        : undefined;

    // [V2] dispatchPhase 기반으로 체크
    const isDelivering = session.activeFilter.dispatchPhase === 'DELIVERING';
    if (isDelivering) {
        /**
         * [1] 지나온 구간 제거 — **0.5km 마다.**
         *
         * 🔴 2026-08-14 에 방식을 바꿨다. 예전에는 여기서 경유를 **통째로 다시 그렸고**
         *    (`trimCorridorByProgress`, 실측 **173ms**) 그 비용 때문에 2km 로 띄엄띄엄 돌렸다.
         *
         *    이제 경유를 만들 때 동마다 **경로 몇 km 지점인지**를 같이 기록해 두므로
         *    (`DetourRegions.progressKm`), 지나온 구간 제거는 **숫자 비교**다 — 0.14ms.
         *    1200배 싸졌으니 촘촘히 돌려도 된다. 촘촘할수록 필터가 실제 위치에 가깝다.
         *
         *    실제 제거는 `filterManager.applyTraveledTrim` 한 곳에서만 한다
         *    (동 목록·시 묶음·별칭을 **한 벌로** 줄여야 하므로). 여기서는 방아쇠만 당긴다.
         *    ⚠️ 필터 변경(`applyFilterCb`)과 **다른 통로**다 — 이유는 인자 주석에 있다.
         */
        const lastTrim = session.lastTrimGPS;
        const dist = lastTrim ? haversineKm(lastTrim.y, lastTrim.x, lat, lng) : Infinity;

        if (dist > 0.5 && trimTraveledCb && getActivePolyline(session)) {
            session.lastTrimGPS = currentGPS;
            trimTraveledCb(userId);
        }

    }

    /**
     * [2] 도착 감지 — **다음 정거장 하나만** 본다 (2026-08-17 재설계).
     *
     * 🔴 예전에는 마지막 하차지 1곳만 봤고, 멈춤 조건이 없어 500m 안에서 **매 틱 발화**했다
     *    (실측: 1초 4연발 + 매번 filter 재계산). 이제:
     *    · 정거장 목록은 `planArrivalStops`(routeComposer) — 경로가 가리키는 순서 그대로.
     *      감시가 자기 순서를 만들면 경로와 갈라진다
     *    · 한 정거장당 발화 1회 (`arrivalFired`) · 점프 틱은 판단하지 않는다
     *    · DELIVERING 게이트 밖이다 — 출발 버튼 전에 상차지에 닿는 경우도 실재한다
     */
    /**
     * ⏸️ **같은 자리 재전송은 도착 감지에게 «새 정보»가 아니다** (기사님 실측 2026-09-12 · 넷째).
     *
     * 🔴 **내가 낸 사고다.** 정차를 궤적에 남기려고 «서 있는 동안 매초 보내기»로 바꿨더니,
     *    그 좌표를 **도착 감지도 같이 먹었다.** 모의 주행은 500m 근접만으로 즉시 발화하고
     *    `nextStopOf` 는 «아직 안 찍힌 다음 정거장»을 주므로, 한 자리에서
     *
     *        틱1 정거장A 도착 → 틱2 next=B(도 500m 안) → 틱3 next=C …
     *
     *    이 **연쇄로 터졌다.** 기사님 콜은 2.5~5.6km 짜리 시내 콜이라 정거장들이 서로
     *    500m 안에 겹쳐 있었다 — 잡은 콜 여섯이 20초~2분 만에 전부 하차 완료로 끝났다.
     *    예전에는 6초에 한 번 와서 그 사이 15배속으로 9km 를 움직였으니 안 터졌을 뿐,
     *    **원래 있던 구멍**이다.
     *
     * 🔴 **한 값을 두 곳이 다른 질문으로 읽는다** (규칙 ⑤-4 ⑤) —
     *    궤적은 *«거기 있었나»*, 도착 감지는 *«새로 왔나»*. 같은 자리는 **뒤 질문의 답이 아니다.**
     * ⚠️ 정거장에 **닿는** 그 틱은 좌표가 새 자리라 그대로 통과한다 — 도착은 정상으로 찍힌다.
     * ⚠️ 실 GPS 는 좌표가 미세하게 흔들려 여기 안 걸린다 (모의 주행에서만 완전히 같다).
     */
    const samePlace = !!prev && prev.x === currentGPS.x && prev.y === currentGPS.y;
    if (samePlace) return;

    watchArrival(userId, session, currentGPS, speedKmh, jumped, src, stopped, applyFilterCb, onArrival, onApproaching, onDeparted, onPassed);
}

/** 정거장 키 — 발화·예고 플래그의 단위 */
export const stopKeyOf = (st: ArrivalStop) => `${st.orderId}:${st.stopType}`;

/**
 * 🎯 **지금 «도착»으로 찍을 수 있는 정거장들 — 순서를 보지 않는다** (2026-09-12 밤).
 *
 * ── 왜 갈랐나 ──
 * `nextStopOf` 하나가 **성질이 다른 두 질문**에 답하고 있었다 (규칙 ⑤-4 ⑤):
 *
 * | 질문 | 순서가 필요한가 |
 * |---|---|
 * | «어디로 **가고 있나**» — 궤적 이름표 · 근접 예고 | **필요하다** |
 * | «지금 어디에 **닿았나**» — 도착 감지 · 지나침 감시 | **필요 없다.** 거리만 있으면 된다 |
 *
 * 뒤엣것이 순서에 매여 있어서, 순서가 흔들리면 **도착이 통째로 흔들렸다.**
 * 기사님 실측 2026-09-12: 한 정거장이 36초 사이에 ⑴ → ⑷ → ⑴ 로 오갔다
 * (굽은 길에서 직선거리 탐욕법이 뒤집힌다 — `orderByNearest` 주석).
 *
 * 🔴 **가장 위험한 것은 스톱워치다.** 실 GPS 는 «500m 안 + 5km/h↓» 가 **30초** 이어져야
 *    도착으로 찍는데, 보는 정거장이 바뀌면 그 30초가 0으로 되돌아갔다. 정거장 앞에서
 *    순서가 2초마다 흔들리면 **30초가 영영 안 찬다.**
 *    ⚠️ **모의 주행으로는 절대 못 본다** — `evaluateArrivalTick` 이 `source === 'mock'`
 *       이면 근접만으로 즉시 발화한다. 게이트가 아무리 초록이어도 이 갈래는 안 돈다.
 *       **실 GPS 에서만 드러나는 결함**이라 판을 나가기 전에 없앤다.
 * 🔴 **2026-09-01 의 실패도 여기서 풀린다.** 그때 순서를 얼렸더니 «도착 하나가 아예
 *    안 찍혔다» — 얼리기가 나빠서가 아니라 **도착 감시가 순서에 매여 있어서**
 *    그 정거장이 «다음»이 될 차례가 안 왔던 것이다. 순서를 떼면 그 문이 열린다.
 *
 * ── 🔒 떼지 않는 것: «제 짐을 싣기 전에는 못 내린다» ──
 * 이것은 **순서에서 오는 규칙이 아니라 물리에서 오는 규칙**이다. 지금까지는
 * `orderByNearest` 가 그 하차지를 아예 후보에서 빼 주어 덤으로 지켜졌는데,
 * 순서를 떼면 그 보호도 함께 떨어진다 — **짐도 없이 하차지를 스쳐 지난 것이
 * 도착으로 찍히고, 이어서 지나침이 완료까지 찍는다.**
 *
 * 실측(어드민 2026-09-12 · 오늘 궤적 1,294점): **아직 안 실은 콜의 하차지가 500m 안이던
 * 점이 22개** 있었고 그중 셋은 **0m**(시뮬이 거기 정차)였다. 지금 코드가 그것을 옳게
 * 막고 있었고, 그 콜들은 나중에 제대로 하차 도착이 찍혔다. 그래서 그 규칙만 여기 옮긴다.
 *
 * 판단은 목록 자체가 답한다 — `planArrivalStops` 는 **다녀온 정거장을 빼고** 주므로,
 * 같은 콜의 `pickup` 이 목록에 **남아 있으면** 아직 안 실은 것이다 (규칙 ③ — 따로 세지 않는다).
 */
export function arrivalCandidates(
    /** `planArrivalStops` 결과 — **목록만** 쓴다. 순서는 보지 않는다 */
    stops: ArrivalStop[],
    /** 이미 찍은 정거장 (`arrivalFired`) */
    fired: ReadonlySet<string>,
): ArrivalStop[] {
    /** 🔒 아직 상차지가 목록에 남아 있는 콜 = 짐을 안 실었다 */
    const notLoaded = new Set(
        stops.filter(s => s.stopType === 'pickup').map(s => s.orderId));
    return stops.filter(st =>
        !fired.has(stopKeyOf(st))
        && (st.stopType === 'pickup' || !notLoaded.has(st.orderId)));
}

/**
 * 🧭 **«지금 향하는 정거장» — 원천은 여기 하나다** (2026-08-28).
 *
 * 도착 감지와 궤적 저장이 **같은 답**을 봐야 한다. 두 벌이 되면 궤적이 가리키는 콜과
 * 도착이 찍히는 콜이 갈라진다 — 이 레포가 반복해 당한 사고 클래스다
 * (경유 4벌 · 상태목록 3벌 · 시별칭, 규칙 ③).
 *
 * 활성 콜이 없거나 남은 정거장이 없으면 `null` — **지어내지 않는다** (규칙 ④).
 */
function nextStopOf(
    session: Pick<UserSession, 'myOrders' | 'arrivalFired'>,
    gps: { x: number; y: number },
): ArrivalStop | null {
    const active = getActiveCalls(session as any);
    if (active.length === 0) return null;
    const stops = planArrivalStops(active, gps);
    return stops.find(st => !session.arrivalFired.has(stopKeyOf(st))) ?? null;
}

/**
 * 🛰️ **저장할 좌표 한 점을 만든다 — «그때 어느 콜이었나»를 함께 싣는다.**
 *
 * 🔴 3회차 주행(2026-08-28)에서 드러난 구멍을 메운다. `gps_tracks.order_id` 칸은
 *    처음부터 있었는데 **채우는 쪽을 안 이어서** 1,894점 전부가 비어 있었다.
 *    그러면 *"부여받은 경로 ↔ 실제 궤적"* 대조가 안 된다 — **합짐을 여럿 싣고 있으면
 *    시각만으로는 어느 콜 구간인지 못 가리기 때문**이고, 그게 이 제품의 핵심 상황이다.
 *
 * 순수 함수로 떼어 둔 이유: 폰 없이 검사할 수 있어야 이 이음새가 다시 안 끊긴다.
 */
export function gpsPointOf(
    session: Pick<UserSession, 'myOrders' | 'arrivalFired'>,
    gps: { x: number; y: number },
    atMs: number,
    src: string,
    speedKmh: number | null,
    /** 🎭 모의 배속 — 위 속도는 **이미 나눈 값**이고, 이것은 «얼마로 돌렸나»를 남긴다 */
    speedMultiplier: number = 1,
): GpsPoint & { stopType: 'pickup' | 'dropoff' | null } {
    const next = nextStopOf(session, gps);
    /**
     * 🛣️ **부여받은 경로에 대 본다 — «얼마나 벗어났나»를 점마다 남긴다** (기사님 지시 2026-09-12 밤).
     *
     * 기사님: *"카카오 라인과 내 궤적이 같이 있어야 **얼마나 잘못 갔는지** 확인할 수 있을 것 같아."*
     * 🔴 **경로를 모르면 `null` 이다** — 0 은 «경로 위에 정확히 있다»는 뜻이라 «경로가
     *    없었다»와 섞이면 나중에 못 가른다 (규칙 ④).
     * ⚠️ 여기서 재는 이유: 이 함수는 **궤적을 남길 때만** 불린다(50m·15초 문턱 뒤).
     *    매 좌표마다 지리 연산을 더하지 않는다.
     */
    const snapped = snapToRoute(getActivePolyline(session), gps);
    return {
        x: gps.x, y: gps.y, atMs, source: src,
        speedKmh: speedKmh != null && Number.isFinite(speedKmh) ? Math.round(speedKmh) : null,
        /* 🔴 **속도와 배속을 한 칸에 섞지 않는다** — «실제로 얼마로 달렸나»와 «얼마로 돌렸나»는
           다른 질문이다 (규칙 ⑤-4 ⑤). 실 GPS 는 늘 1 이다 */
        speedMultiplier,
        orderId: next?.orderId ?? null,
        stopType: next?.stopType ?? null,
        offRouteM: snapped ? Math.round(snapped.offRouteKm * 1000) : null,
        progressKm: snapped ? Math.round(snapped.progressKm * 100) / 100 : null,
    };
}

function watchArrival(
    userId: string,
    session: UserSession,
    gps: { x: number; y: number },
    speedKmh: number | null,
    jumped: boolean,
    src: string,
    /** ⏸️ 모의 주행이 «서 있다»고 보냈나 — 모의 도착은 이 틱에만 찍힌다 (`evaluateArrivalTick`) */
    stopped: boolean | undefined,
    applyFilterCb: (uid: string, filter: any) => void,
    onArrival?: (uid: string, stop: ArrivalStop) => void,
    onApproaching?: (uid: string, stop: ArrivalStop, distKm: number) => void,
    /** 하차지에서 멀어졌다 — «내리고 갔다»로 본다 (기사님 확정 2026-08-25) */
    onDeparted?: (uid: string, orderId: string) => void,
    /** 🚚 정거장을 지나쳤다 — 도착·완료를 순차로 찍는다 (기사님 확정 2026-09-03) */
    onPassed?: (uid: string, stop: ArrivalStop) => void,
) {
    const active = getActiveCalls(session);
    if (active.length === 0) return;
    if (jumped) {
        // 위치를 못 믿는 틱 — 정지 유지도 끊는다 (점프 후 좌표로 30초를 세면 거짓 도착이 된다)
        session.arrivalHeld.clear();
        return;
    }

    /**
     * 🚚 **떠남 감지** — 하차지에 도착했다가 멀어지면 «내리고 갔다»로 본다.
     *
     * 도착만 보고 떠남을 안 보면, 운전 중이라 버튼을 못 누른 콜이 계속 실려 있는 것으로
     * 남아 **적재가 안 풀린다** (2026-08-25 실측: 하차 도착 3건 · 하차 완료 0건).
     *
     * 🔴 되돌아와도 다시 안 걸린다 — 여기서 지운 뒤에는 `departWatch` 에 없고,
     *    하차 완료된 콜은 `getActiveCalls` 에서 빠져 감시 대상 자체가 아니다.
     */
    if (session.departWatch.size > 0 && onDeparted) {
        for (const [key, w] of [...session.departWatch]) {
            const away = haversineKm(gps.y, gps.x, w.y, w.x);
            if (away >= GPS_ARRIVAL.DEPARTED_KM) {
                session.departWatch.delete(key);
                console.log(`🚚 [떠남 감지] 하차지에서 ${away.toFixed(1)}km 멀어졌습니다 — ` +
                    `내리고 간 것으로 봅니다 (${w.orderId.slice(0, 8)})`);
                onDeparted(userId, w.orderId);
            }
        }
    }

    /**
     * 🚚 **지나침 이탈** — 진입했던 정거장에서 설정 거리만큼 멀어지면 도착·완료를 순차로 찍는다.
     * 🔴 «다음 정거장»과 무관하게 **감시 목록 전체**를 돈다 — 도착이 먼저 찍혀 그 정거장이
     *    «다녀온 곳»이 되어도 여기는 계속 본다 (그러지 않으면 완료를 영영 못 찍는다).
     */
    if (session.passWatch.size > 0 && onPassed) {
        const passCfg = session.judgment?.pass ?? DEFAULT_JUDGMENT.pass;
        for (const [k, w] of [...session.passWatch]) {
            const away = haversineKm(gps.y, gps.x, w.y, w.x);
            const t = evaluatePassTick(away, passCfg.nearM / 1000, passCfg.awayM / 1000, w.entered);
            // 아직 진입 반경 안에 못 들어왔다면 여기서 «들어왔다»만 갱신한다
            if (t.entered && !w.entered) { w.entered = true; }
            if (t.passed) {
                session.passWatch.delete(k);
                console.log(`🚚 [지나침] ${w.stopType === 'pickup' ? '상차지' : '하차지'}에서 ` +
                    `${(away * 1000).toFixed(0)}m 멀어졌습니다 — 도착·완료를 순차로 찍습니다 (${w.orderId.slice(0, 8)})`);
                onPassed(userId, { orderId: w.orderId, stopType: w.stopType, x: w.x, y: w.y } as ArrivalStop);
            }
        }
    }

    /**
     * 🧭 **정거장 목록은 한 번만 만든다** — 순서를 쓰는 쪽과 거리를 쓰는 쪽이 **같은 목록**을
     *    본다 (규칙 ③). 이 함수는 GPS 매 틱이 부르므로 두 번 만들면 값도 비용도 두 벌이 된다.
     */
    const stops = planArrivalStops(getActiveCalls(session), gps);
    if (stops.length === 0) return;

    /**
     * 📣 **근접 예고는 «어디로 가고 있나»의 답이라 순서를 본다** (도착전 통화 시점).
     *    도착·지나침과 달리 이쪽은 **다음에 갈 곳 하나**를 가리켜야 뜻이 있다.
     */
    const next = stops.find(st => !session.arrivalFired.has(stopKeyOf(st))) ?? null;
    if (next) {
        const nKey = stopKeyOf(next);
        const nDist = haversineKm(gps.y, gps.x, next.y, next.x);
        if (nDist < GPS_ARRIVAL.NOTICE_KM && !session.arrivalNoticed.has(nKey)) {
            session.arrivalNoticed.add(nKey);
            console.log(`📣 [근접 예고] 다음 정거장(${next.stopType === 'pickup' ? '상차지' : '하차지'}) ` +
                `${nDist.toFixed(1)}km 앞 — 도착전 통화 시점`);
            onApproaching?.(userId, next, nDist);
        }
    }

    /**
     * 🎯 **도착·지나침은 «거리»가 정한다 — 순서를 보지 않는다** (2026-09-12 밤 · 1단계).
     *
     * 🔴 예전에는 «순서상 첫 정거장» 하나만 봤다. 그런데 그 순서는 굽은 길에서 뒤집히므로
     *    (`orderByNearest` — 직선거리 탐욕법), **순서가 흔들리면 도착이 통째로 흔들렸다.**
     *    500m 안에 들어왔으면 목록에서 몇 번째든 도착이다 — 거리는 순서를 안 본다.
     * 🔴 **2026-09-01 의 실패가 여기서 풀린다.** 그때 순서를 얼렸더니 «도착 하나가 아예
     *    안 찍혔다» — 얼리기가 나빠서가 아니라 **도착 감시가 순서에 매여** 그 정거장이
     *    «다음»이 될 차례가 안 왔던 것이다. 이 고침이 ③(순서 잣대 교체)의 문을 연다.
     * 🔒 **적재 규칙만은 그대로 지킨다** — 짐을 안 실은 콜의 하차지는 후보가 아니다
     *    (`arrivalCandidates`). 그건 순서에서 오는 규칙이 아니라 **물리**다.
     *    어드민 실측(오늘 궤적 1,294점): 그런 점이 **22개**, 그중 셋은 **0m**(거기 정차)였다.
     */
    const pass = session.judgment?.pass ?? DEFAULT_JUDGMENT.pass;
    for (const st of arrivalCandidates(stops, session.arrivalFired)) {
        const key = stopKeyOf(st);
        const distKm = haversineKm(gps.y, gps.x, st.y, st.x);
        const label = st.stopType === 'pickup' ? '상차지' : '하차지';

        /**
         * 🚚 **지나침 판정** — 안 서고 지나쳐도 도착·완료를 대신 찍는다 (기사님 확정 2026-09-03).
         *
         * 🔴 도착(500m + 정지 30초)과 **무관하게 혼자 선다.** 실 업무에서는 안 서고 지나치는
         *    일이 흔한데, 그러면 도착이 안 찍히고 → 떠남 감시도 안 걸려 → 사슬이 통째로 멈춘다.
         * 🔴 거리 둘은 **판정 기준 탭에서 고친다** (`user_judgment.pass_near_m`·`pass_away_m`).
         */
        if (evaluatePassTick(distKm, pass.nearM / 1000, pass.awayM / 1000, false).entered
            && !session.passWatch.has(key)) {
            session.passWatch.set(key, { orderId: st.orderId, stopType: st.stopType, x: st.x, y: st.y, entered: true });
            console.log(`👣 [지나침 감시 시작] ${label} ${(distKm * 1000).toFixed(0)}m — ` +
                `${pass.awayM}m 벗어나면 도착·완료를 찍습니다 (${st.orderId.slice(0, 8)})`);
        }

        /* ⏱️ 스톱워치는 **정거장마다** — 다른 곳이 끼어들어도 이 30초가 안 끊긴다 */
        const tick = evaluateArrivalTick(session.arrivalHeld.get(key) ?? null, distKm, speedKmh, src, Date.now(), stopped);
        session.arrivalHeld.set(key, tick.heldSinceMs);
        if (!tick.fire) continue;

        session.arrivalFired.add(key);      // 🔴 한 번 찍으면 이 정거장은 끝 — 4연발의 해답
        session.arrivalHeld.delete(key);    //    찍힌 뒤에는 «서 있던 시간»을 들고 있을 이유가 없다
        console.log(`🏁 [도착 감지] ${label} ${GPS_ARRIVAL.RADIUS_KM * 1000}m 이내 (출처 ${src}) — 1회 발화`);

        if (st.stopType === 'dropoff') {
            applyFilterCb(userId, {
                driverAction: 'UNLOADING',    // 하차 중으로 자동 전환 (이제 1회만)
            });
            // 🚚 여기서부터 «멀어지는지»를 본다 — 2km 벗어나면 내리고 간 것으로 친다 (옛 규칙·예비)
            session.departWatch.set(key, { orderId: st.orderId, x: st.x, y: st.y });
        }
        /**
         * 🚚 **도착이 찍힌 정거장도 지나침 감시에 넣는다** (2026-09-03 실측으로 메운 구멍).
         *
         * 🔴 진입(300m) 등록은 위 조건이 볼 때만 일어난다. 그런데 도착이 먼저 찍히면
         *    그 정거장은 그 순간 **«다녀온 곳»이 되어 후보에서 빠진다** — 등록 기회를
         *    영영 잃는다. 시뮬(mock)은 500m 근접만으로 도착이 찍히므로 **늘 그렇게 된다**
         *    (12:34~12:36 실측: 상차지 도착 3건이 다 찍혔는데 지나침은 한 번도 안 걸렸다).
         */
        if (!session.passWatch.has(key)) {
            /**
             * 🔴 **`entered` 를 지금 거리로 정직하게 적는다.** 도착 반경(500m)이 진입(300m)보다
             *    넓어서, 도착만으로 «들어왔다»로 치면 450m 에서 도착한 콜이 **다음 틱에 400m
             *    이탈**로 곧바로 완료가 된다 — 짐을 싣기도 전에.
             */
            session.passWatch.set(key, {
                orderId: st.orderId, stopType: st.stopType, x: st.x, y: st.y,
                entered: distKm <= pass.nearM / 1000,
            });
        }
        onArrival?.(userId, st);
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

// ─────────────────────────────────────────────────────────────
// 🗺️ 전국 지명 사전 — 키워드 트랩 계산 (regionMatch 사전 확장 · 2026-08-22 기사님 확정 ④)
//
// "남동"(광주 인근 동)이 "인천 남동구" 에 contains 로 걸려 인천행이 복귀행 필터를
// 통과한 사고의 원천 수리다. 동 이름(EMD_KOR_NM)과 상위 지명 낱말(parentName)을
// 사전으로 모아, 키워드로 시작하는 **더 긴 다른 지명**을 트랩으로 계산한다.
// 트랩은 필터 파생 때 함께 만들어 피기백(keywordTraps)에 실린다.
// ─────────────────────────────────────────────────────────────
let adminNameSet: Set<string> | null = null;
function allAdminNames(): Set<string> {
    if (adminNameSet) return adminNameSet;
    const s = new Set<string>();
    for (const f of mergedMapFeatureCollection?.features ?? []) {
        const props: any = f.properties || {};
        if (props.EMD_KOR_NM) s.add(String(props.EMD_KOR_NM));
        const parent = props.intel?.parentName || props.SIG_KOR_NM;
        if (parent) for (const tok of String(parent).split(' ')) if (tok) s.add(tok);
    }
    adminNameSet = s;
    return s;
}

/** 키워드마다 "그 이름으로 시작하는 더 긴 지명"(트랩) — 없는 키워드는 키를 만들지 않는다 */
export function trapsForKeywords(keywords: string[]): Record<string, string[]> {
    const names = allAdminNames();
    const out: Record<string, string[]> = {};
    for (const k of keywords) {
        if (!k) continue;
        const traps: string[] = [];
        for (const n of names) if (n !== k && n.startsWith(k)) traps.push(n);
        if (traps.length) out[k] = traps;
    }
    return out;
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

/**
 * 🎯 **경유에 도착 목표를 합친다** (기사님 확정 2026-08-25).
 *
 * 기사님: *"내가 노선을 선택했을때 여주시로 갈꺼고 … 가남→세종대왕면, 가남→점동면
 * 둘다 콜이 올라와야 한다고 난 보는데."*
 *
 * 콜을 하나 잡으면 경유 지명이 `destinationKeywords` 를 **덮어써서** 기사님이 고른
 * 도착 목표가 판정에서 사라졌다. 화면에는 «여주시」가 그대로 남아 있는데도 —
 * 실측 2026-08-25: 가남→세종대왕면(경유 안)은 잡히고 가남→점동면(경유 밖)은 막혔다.
 * 둘 다 여주시인데 갈렸다.
 *
 * 🔴 **노선인 동안 도착 목표는 안 바뀐다.** 그래서 합짐·주행중에 따로 저장하지 않고
 *    **첫짐에서 파생**한다 (규칙 ③ — 두 벌이 되면 갈라진다).
 *
 * ⚠️ 이 합집합은 **하차지만** 연다. 상차지는 끝까지 경로 위여야 하므로
 *    `buildAppOrderKm` 이 경유에 있는 동만 `progressKm` 으로 내보낸다.
 *    안 그러면 앱이 «순서 미상 — 통과» 로 읽어 **점동면에서 싣는 콜**을 허용한다
 *    (2026-08-18 파주 사고: 78km 뒤로 돌아가 싣는 콜이 통과했다).
 */
export function unionRegions(
    detour: { flat: string[]; grouped: Record<string, string[]>; customCityFilters: string[] },
    destinationCity: string,
    radiusKm: number,
) {
    if (!destinationCity) return detour;
    const city = getCityRegionsWithRadius(destinationCity, radiusKm);
    if (!city || city.flat.length === 0) return detour;

    const grouped: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(detour.grouped)) grouped[k] = [...v];
    for (const [k, v] of Object.entries(city.grouped)) {
        grouped[k] = Array.from(new Set([...(grouped[k] ?? []), ...v])).sort();
    }
    return {
        flat: Array.from(new Set([...detour.flat, ...city.flat])).sort(),
        grouped,
        // 🔴 별칭은 **둘 다** 남긴다. 경유 쪽 시가 빠지면 앱의 2단계 필터가
        //    (시 별칭 ∧ 동)에서 그 시를 통째로 막는다 (2026-08-12 투트랙 사고).
        customCityFilters: Array.from(new Set([...detour.customCityFilters, ...city.customCityFilters])),
    };
}
