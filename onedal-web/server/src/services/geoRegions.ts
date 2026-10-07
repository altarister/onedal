/**
 * 🗺️ **지역 셈** — 경로 둘레(경유) · 도시 둘레 · 영역에 걸친 읍면동 · 상차 목록 · 도착 목표 합치기. 지도 자료(geoService)를 읽어 동 목록을 낸다.
 * 🔴 이 파일은 위(geoMotion)를 가져오지 않는다 — 방향: geoMotion · geoRegions → geoService(지도 읽기 · 이름).
 * 바깥 일을 하는 함수: 없음 (모두 값만 받는다 — 지도 자료는 부팅 때 한 번 읽은 것 · getDetourRegions 는 그리기 실패를 오류 로그로 남긴다)
 */
import { haversineKm, isPickupListName, cityCenter, distToLineKm, aheadOf, isAheadOf, lineFromPoint, netAreaTesterOf } from '@onedal/shared';
import type { NetPoint, NetParams } from '@onedal/shared';
import type { Polygon, MultiPolygon, Feature } from 'geojson';
import { cityAliases, isUniqueDistrictName, mergedMapFeatureCollection, turf } from "./geoService";

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
     *    안전 방향이라 트림에는 맞다. 동의 실제 경로상 자리는 아래 `orderKm` 이 말한다.
     */
    progressKm: Record<string, number>;
    /**
     * 동마다 **경로 몇 km 지점인가 — 동의 실제 자리** (순수 스냅점 · pad 없음 · Infinity 없음).
     *
     * 띠로만 든 동의 지나온 구간 빼기 진행도가 이 값을 읽는다(`filterNet` netKeywordsOf 의 `touch`).
     * 트림용 `progressKm` 은 pad · 하차원 Infinity 로 부풀려 있어 동의 자리를 말하지 못한다 — 한 값이 두 사실을 답하지 않게 둘로 둔다.
     *
     * 같은 이름의 동이 여럿이면 **경로에 가장 가까운 것**을 남긴다 — 목록에 든 이유가
     * 경로와의 근접이므로, 자리의 주인공도 그 동이다 (트림은 반대로 «가장 늦은 것»).
     */
    orderKm: Record<string, number>;
}

export function getDetourRegions(
    polyline: Array<{x: number; y: number}>,
    detourRadiusKm: number,
    destinationRadiusKm?: number,
    /**
     * ✂️ **도려낼 현위치 원 — 하차 조각 전용** (기사님 그림).
     *    하차 영역은 «띠 ∪ 마름모 ∪ 목적지 원 **−** 현위치 원»이다. 그물(`callNet.lineZoneOf`)이
     *    같은 도려내기를 하므로 여기도 해야 «목록만 더 넓은» 자리가 안 생긴다 (규칙 ③).
     */
    excludeCircle?: { lng: number; lat: number; km: number },
): DetourRegions | null {
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

    /**
     * ✂️ **띠의 끝은 둥글지 않고 딱 잘린다** (기사님 지적).
     *
     * 🔴 `turf.buffer` 는 선분 끝에 **반원**을 붙인다. 그대로 두면 라인 시작(출발 자리) 뒤가
     *    띠 반경만큼 경유가 되어, 그물·걸친 동에서 이미 잘라낸 뒤쪽 동이 **여기서 다시 들어온다.**
     *    「도척에서 잡아 경안동에 내리는」 역방향 콜이 그렇게 통과했다.
     * 🔴 자름은 상차 목록 · 지도 · 하차 그물이 쓰는 **그 함수**다 (`aheadOf`·`isAheadOf` · 규칙 ③) —
     *    띠 계산이 두 벌이면 한쪽만 고쳐진다.
     * ⚠️ 판정은 **동 통째로 뒤일 때만** 버린다 (bbox 네 꼭짓점이 전부 뒤). 한 점이라도 앞이면 남긴다 —
     *    넓은 읍·면이 자른 선에 걸치면 그 앞부분은 경유가 맞다 (규칙 ⑤ «넉넉하게»).
     */
    const aheadCut = lineCoords.length >= 2 ? aheadOf(lineCoords as Array<[number, number]>, detourRadiusKm) : null;
    const cornersOf = (fb: number[]): Array<[number, number]> =>
        [[fb[0], fb[1]], [fb[2], fb[1]], [fb[0], fb[3]], [fb[2], fb[3]]];
    const wholeBehind = (fb?: number[]): boolean => {
        if (!aheadCut || !fb) return false;
        return !cornersOf(fb).some(([lng, lat]) => isAheadOf({ lng, lat }, aheadCut));
    };
    /**
     * ✂️ **현위치 원 안은 경유가 아니다 — 통째로 들었을 때만 버린다** (기사님 그림).
     *
     * 기사님: *"내 주위에 녹색이 있고, 파랑과 접경에 보라색 지역이 있고, 그 이후 목적지 방향으로 파란 점."*
     * 곧 원 안은 **상차만**, 경계에 걸친 동만 «둘 다», 그 밖이 하차다.
     * 🔴 걸친 동까지 버리면 «싣고 조금 앞에 내리는» 가까운 콜이 통째로 막힌다 — 경계는 남긴다 (규칙 ⑤).
     */
    const wholeInSrc = (fb?: number[]): boolean => {
        if (!excludeCircle || !fb) return false;
        return cornersOf(fb).every(([lng, lat]) => haversineKm({ lat, lng }, excludeCircle) <= excludeCircle.km);
    };

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
     * 🔴 **하차지 주변으로 들어온 동은 트림에서 빼지 않는다** (실측으로 발견).
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

        /* ✂️ 라인 시작에서 경로와 직각으로 자른 선 — 통째로 뒤면 가는 길이 아니다 (위 `wholeBehind`) */
        if (wholeBehind(feature.bbox)) continue;
        /* ✂️ 현위치 원 안에 통째로 든 동은 상차지다 — 하차 조각에서 도려낸다 (위 `wholeInSrc`) */
        if (wholeInSrc(feature.bbox)) continue;

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
                        const pad = fb ? haversineKm({ lat: fb[1], lng: fb[0] }, { lat: fb[3], lng: fb[2] }) / 2 : 0;
                        const prev = progressKm[regionName];
                        // 하차지 원 안(또는 걸친) 동이면 영원히 남긴다
                        const inDest = destCenter
                            && haversineKm({ lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0] }, { lat: destCenter[1], lng: destCenter[0] })
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
         * 🏙️ **구 이름도 목록에 싣는다 — 진행도는 비운 채로** (기사님 지적).
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
             * ⚠️ **도착 목록에도 넣어야 앱까지 간다.** 원달앱은 하차 목록(`destinationKeywords`)만 본다 —
             *    지나온 구간을 뺄 때 목록과 진행도가 **한 벌로** 줄어야 하므로 진행도에도 넣는다.
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

/** 격자 한 칸(km) — 영역 안에 찍는 점 간격. 원(반경 수 km)을 30×30 남짓으로 찍는다 */
const PICKUP_GRID_KM = 0.3;

/**
 * 📍 **영역에 걸친 읍·면·동 — 시·군·구로 묶어서** — 기사님 규칙 «영역에 지역이 걸치고 있으면 들어간다».
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
    const test = inArea ?? ((p: { lng: number; lat: number }) => haversineKm(center, p) <= km);
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
 * 🔵 **먼 목적지 하차 조각에 걸친 읍·면·동 — 시·군·구로 묶어서** (기사님 «영역에 지역이 걸치고 있으면 들어가는거야»).
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

/** 🎯 **원에 걸친 읍·면·동 — 시·군·구로 묶어서** — 가까이 온 목적지의 하차 목록 (`filterNet.netKeywordsOf`) */
export function regionsTouchingCircleGrouped(center: { lng: number; lat: number }, km: number): Record<string, string[]> {
    return regionsTouchingAreaGrouped(circleArea(center, km));
}

/**
 * ✂️ **현위치에서 «남은 길이 가는 쪽»으로 그은 직각선** — 그 뒤는 지나온 곳이다.
 *
 * 방향은 **잘라 온 라인의 첫 점에서 끝점까지** 잇는 직선이다. 남은 길 전체의 방향이라
 * 한 구간에 흔들리지 않는다.
 *
 * 🔴 **마지막 한 구간에서 뽑지 않는다** — 라인의 끝자락은 골목이라 초 단위로 방향이 바뀌고,
 *    목적지에 가까워 남은 길이 짧아지면 그 한 구간이 방향을 지배한다.
 *    실측: 양재에서 서울로 가는 중 상차 영역이 목적지 반대편 남서쪽 반원이 되어 역삼동(3.3km)이 빠졌다.
 * 🔴 **남은 길이 없으면 `null`** — 자르지 않는다. 지어내지 않는다 (규칙 ④).
 */
function cutTowardGoal(band: Array<[number, number]>):
    { start: { lng: number; lat: number }; dir: { x: number; y: number } } | null {
    if (band.length < 2) return null;
    const a = band[0], b = band[band.length - 1];
    const KX = 111.32 * Math.cos((a[1] * Math.PI) / 180), KY = 110.574;
    const dx = (b[0] - a[0]) * KX, dy = (b[1] - a[1]) * KY;
    const len = Math.hypot(dx, dy);
    return len > 0.01 ? { start: { lng: a[0], lat: a[1] }, dir: { x: dx / len, y: dy / len } } : null;
}

/**
 * 🟢 **상차 목록 — 켜진 조각을 전부 겹친 영역에 걸친 읍·면·동**.
 *
 * 조각은 부르는 쪽이 shared `pickupPartsOf` 로 정한다. 여기서는 **겹치기(∩)만** 한다 —
 * 무엇을 켤지 다시 판단하지 않는다. 판단이 두 곳이면 갈라진다 (규칙 ③).
 *
 * | 조각 | 판정 |
 * |---|---|
 * | 현위치 원 | 늘 — 격자도 이 원을 감싼 사각형에서만 찍는다 |
 * | 라인 띠 | 현위치부터 앞으로만 (`lineFromPoint` — 방향으로 자르지 않는다) |
 * | 목적지 원 | 가까이 온 목적지들의 원을 **더한 것**(∪) 안에 드나 |
 *
 * 🔴 **좌표를 모르는 시는 그냥 뺀다** — 원을 지어내지 않는다 (규칙 ④). 가까이 온 목적지가 있는데
 *    전부 좌표를 모르면 목적지 원 조건이 아예 안 걸린다.
 * 🔴 **목적지 원 여럿은 더한다(∪)** — 겹치면(∩) 두 원이 안 만날 때 영역이 비고, 빈 목록은 «고장»이다.
 * 🔴 **«경로 몇 km»를 안 본다** — 되돌아가는 경로에서 다시 지날 동이 빠지던 자리다.
 * 세션을 모른다 — `filterNet.rebuildPickupList` 가 값을 넘기고, 검사가 실제 지도로 이 함수를 부른다.
 */
export function pickupListFor(o: {
    me: { x: number; y: number };
    radii: { pickupRadiusKm: number; detourRadiusKm: number; destinationRadiusKm?: number };
    line: Array<{ x: number; y: number }> | null;
    parts: { line: boolean; goalCities: readonly string[] };
}): { list: string[]; grouped: Record<string, string[]> } {
    /**
     * ✂️ **띠는 «얼마나 왔나»로 자른다** — 라인을 내 자리에서 끊고(`lineFromPoint`) 그 뒤만 쓴다.
     *    라인 끝을 지나 앞이 없으면 «라인 없음» — 그 조각만 빠진다.
     *
     * 🔴 **자름선의 방향은 «남은 길 전체»다 — 마지막 한 구간에서 가져오지 않는다** (기사님 확정).
     *
     * 두 겹이 다 필요하다. 라인을 끊어 지나온 **길**을 버리고, 자름선으로 띠의 **둥근 끝**이 덮는 면을 버린다.
     * 끊기만 하면 시작점 둘레로 반경만큼 부풀어 곤지암에서 6km 뒤 초월읍이 다시 든다 («뒤를 자르는 Cap»).
     *
     * 방향을 **마지막 한 구간**에서 뽑으면 골목이 영역을 통째로 돌린다 — 그 까닭과 실측은 `cutTowardGoal` 머리에.
     */
    const full = o.line && o.line.length >= 2 ? o.line.map(p => [p.x, p.y] as [number, number]) : null;
    const band = o.parts.line && full ? lineFromPoint(full, { lng: o.me.x, lat: o.me.y }) : [];
    const useBand = band.length >= 2;

    /* 🎯 가까이 온 목적지들의 시내 좌표 — 지도에 없는 시는 뺀다 (지어내지 않는다) */
    const goalPts: Array<{ lng: number; lat: number }> = [];
    for (const city of o.parts.goalCities) {
        try {
            const c = cityCenter(city);
            if (Number.isFinite(c.lng) && Number.isFinite(c.lat)) goalPts.push({ lng: c.lng, lat: c.lat });
        } catch { /* 지도에 없는 시 — 그 원은 없는 것으로 둔다 */ }
    }
    const rGoal = o.radii.destinationRadiusKm ?? 0;
    const r = o.radii.pickupRadiusKm;

    /** ✂️ 현위치에서 **남은 길이 가는 쪽**으로 그은 직각선 — 그 뒤는 띠의 둥근 끝이 덮어도 상차 영역이 아니다 */
    const cut = useBand ? cutTowardGoal(band) : null;

    const inMe = (p: { lng: number; lat: number }) => haversineKm(o.me, p) <= r;
    const inBand = (p: { lng: number; lat: number }) =>
        distToLineKm(p, band) <= o.radii.detourRadiusKm && (!cut || isAheadOf(p, cut));
    const inGoal = (p: { lng: number; lat: number }) =>
        goalPts.some(g => haversineKm(g, p) <= rGoal);

    /* 🔴 켜진 조각을 **전부 겹친다**(∩) */
    const inArea = (p: { lng: number; lat: number }) =>
        inMe(p) && (!useBand || inBand(p)) && (goalPts.length === 0 || inGoal(p));

    /* 격자 — 영역은 늘 현위치 원 안이라 원을 감싼 사각형만 찍으면 된다 (`circleArea`) */
    /* 🗂️ 시 · 군 · 구로 묶어서도 낸다 — 관제웹 지도 «동 점»이 같은 이름의 다른 동을 가르게 (`dongDotsOf`) */
    const grouped = Object.fromEntries(Object.entries(regionsTouchingAreaGrouped(circleArea({ lng: o.me.x, lat: o.me.y }, r, inArea)))
        .map(([region, names]) => [region, names.filter(isPickupListName)] as [string, string[]])
        .filter(([, names]) => names.length > 0));
    return { list: [...new Set(Object.values(grouped).flat())].sort(), grouped };
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
                 * 🔴 **`booleanIntersects`(걸침)가 아니라 중심점으로 판정한다.**
                 *
                 * 걸침으로 판정하면 동이 반경에 **손톱만큼만 닿아도** 통째로 편입된다.
                 * 동 하나가 수 km 라, 반경 10km 라고 해 놓고 훨씬 바깥 동네가 들어온다.
                 *
                 * 실측(걸침 → 중심점):
                 *   용인  1km   84개 → **56개**
                 *   용인 10km  299개 → 266개
                 *   파주 10km  140개 → 122개
                 *
                 * "반경 10km" 는 **10km 안에 있는** 동네라는 뜻이지
                 * **10km 선에 닿는** 동네라는 뜻이 아니다. 걸침이면 숫자를 줄여도
                 * 목록이 기대만큼 안 줄어, 기사님이 필터를 못 믿게 된다.
                 *
                 * (참고: 도시 경계를 union 한 뒤 한 번만 버퍼링해 보는 것도 재 봤는데
                 *  결과가 **완전히 동일**하고 5배 느렸다. buffer 는 union 에 분배되므로
                 *  당연하다 — 부풀림의 원인은 버퍼 방식이 아니라 판정 방식이다)
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
 * ~~`trimCorridorByProgress`~~ — **삭제했다**.
 *
 * 이동할 때마다 경유를 통째로 다시 그리던 함수다(실측 173ms). 그 비용 때문에 2km 마다만
 * 돌렸고, 정작 `getActivePolyline` 이 죽어 있어서 **한 번도 실행되지 않았다.**
 *
 * 지금은 경유를 만들 때 동마다 진행도를 같이 기록하고(`DetourRegions.progressKm`),
 * 이동 시에는 그 숫자만 비교한다 — `filterNet.applyTraveledTrim` (0.14ms).
 * 같은 일을 하는 두 번째 구현을 남겨 두지 않는다.
 */


// ═══ GPS 헬퍼 함수 ═══

/* 📏 두 지점 거리는 shared haversineKm 하나(공통 함수 3) — 여기 숫자 넷 함수는 두지 않는다 */

/**
 * 🎯 **경유에 도착 목표를 합친다** (기사님 확정).
 *
 * 기사님: *"내가 노선을 선택했을때 여주시로 갈꺼고 … 가남→세종대왕면, 가남→점동면
 * 둘다 콜이 올라와야 한다고 난 보는데."*
 *
 * 경유 지명만 `destinationKeywords` 에 두면 기사님이 고른 도착 목표가 판정에서 사라진다 —
 * 가남→세종대왕면(경유 안)은 잡히고 가남→점동면(경유 밖)은 막힌다. 둘 다 여주시인데 갈린다.
 *
 * 🔴 **노선인 동안 도착 목표는 안 바뀐다.** 그래서 합짐·주행중에 따로 저장하지 않고
 *    **첫짐에서 파생**한다 (규칙 ③ — 두 벌이 되면 갈라진다).
 *
 * ⚠️ 이 합집합은 **하차지만** 연다 — 상차지는 상차 목록(`pickupKeywords` · 내 위치 둘레)이 따로 거른다.
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
        //    (시 별칭 ∧ 동)에서 그 시를 통째로 막는다 (투트랙 사고).
        customCityFilters: Array.from(new Set([...detour.customCityFilters, ...city.customCityFilters])),
    };
}
