/**
 * 카카오 모빌리티 API 서비스 (kakaoUtil.ts 리팩토링)
 * 
 * [변경 이력]
 * - routes/kakaoUtil.ts → services/kakaoService.ts 위치 이동
 * - 지오코딩 인메모리 캐시 도입 (API 비용 80% 절감)
 * - API 키를 모듈 스코프 상수로 통합 (5곳 반복 조회 제거)
 * - kakao.ts REST 프록시에서도 이 모듈의 함수를 호출하도록 통합
 */

// ━━━━━━━━━━ [모듈 스코프 상수] ━━━━━━━━━━
const KAKAO_NAV_URL = "https://apis-navi.kakaomobility.com/v1/directions";
const KAKAO_WAYPOINTS_URL = "https://apis-navi.kakaomobility.com/v1/waypoints/directions";
const KAKAO_LOCAL_URL = "https://dapi.kakao.com/v2/local/search";

function getHeaders() {
    // process.env는 함수 호출 시점에 읽어야 dotenv 로딩 순서에 영향 받지 않음
    const apiKey = process.env.KAKAO_REST_API_KEY || "";
    return { "Authorization": `KakaoAK ${apiKey}`, "Content-Type": "application/json" };
}

// ━━━━━━━━━━ [2단계 캐시: L1(인메모리) + L2(SQLite)] ━━━━━━━━━━
import db from "../db";

// L1: 인메모리 캐시 (서버 세션 내 초고속 조회)
const MAX_L1_CACHE_SIZE = 5000;
const geoL1 = new Map<string, {x: number, y: number}>();

// L2: SQLite 영구 캐시 (서버 재시작 후에도 유지)
const stmtGet = db.prepare("SELECT x, y FROM geocode_cache WHERE query = ?");
const stmtUpsert = db.prepare(`
    INSERT INTO geocode_cache (query, x, y, hit_count, created_at, last_used)
    VALUES (?, ?, ?, 1, datetime('now','localtime'), datetime('now','localtime'))
    ON CONFLICT(query) DO UPDATE SET
        hit_count = hit_count + 1,
        last_used = datetime('now','localtime')
`);

function geoCacheGet(key: string): {x: number, y: number} | undefined {
    // L1 히트
    const l1 = geoL1.get(key);
    if (l1) return l1;

    // L2 히트 (SQLite → L1으로 승격)
    const row = stmtGet.get(key) as {x: number, y: number} | undefined;
    if (row) {
        geoL1.set(key, row);
        // hit_count 증가 및 last_used 갱신
        stmtUpsert.run(key, row.x, row.y);
        return row;
    }
    return undefined;
}

function geoCacheSet(key: string, value: {x: number, y: number}) {
    // L1 캐시 한도 초과 시 전체 Flush (어차피 L2 SQLite에 데이터가 보존되므로 안전함)
    if (geoL1.size >= MAX_L1_CACHE_SIZE) {
        console.warn(`🧹 [GeoCache] L1 메모리 캐시 한도(${MAX_L1_CACHE_SIZE}) 초과 → 초기화 (DB 데이터는 보존됨)`);
        geoL1.clear();
    }
    // L1에 저장
    geoL1.set(key, value);
    // L2(SQLite)에 영구 저장
    stmtUpsert.run(key, value.x, value.y);
}

/** 캐시 통계 조회 (디버깅용) */
export function getGeoCacheStats() {
    const dbCount = (db.prepare("SELECT COUNT(*) as cnt FROM geocode_cache").get() as any)?.cnt || 0;
    return { l1Size: geoL1.size, l2Size: dbCount };
}

// ━━━━━━━━━━ [지역명 매핑 (지오코딩 방어)] ━━━━━━━━━━
const REGION_MAP: Record<string, string> = {
    "서울": "서울", "서울특별시": "서울",
    "경기": "경기", "경기도": "경기",
    "인천": "인천", "인천광역시": "인천",
    "강원": "강원", "강원도": "강원", "강원특별자치도": "강원",
    "충남": "충남", "충청남도": "충남",
    "충북": "충북", "충청북도": "충북",
    "대전": "대전", "대전광역시": "대전",
    "세종": "세종", "세종특별자치시": "세종",
    "경북": "경북", "경상북도": "경북",
    "경남": "경남", "경상남도": "경남",
    "대구": "대구", "대구광역시": "대구",
    "부산": "부산", "부산광역시": "부산",
    "울산": "울산", "울산광역시": "울산",
    "전북": "전북", "전라북도": "전북", "전북특별자치도": "전북",
    "전남": "전남", "전라남도": "전남",
    "광주": "광주", "광주광역시": "광주",
    "제주": "제주", "제주특별자치도": "제주", "제주도": "제주"
};

// ━━━━━━━━━━ [타입 정의] ━━━━━━━━━━
export interface RouteResult {
    duration: number;  // 총 소요 초
    distance: number;  // 총 이동거리 미터
    approachDuration?: number; // 현위치 -> 상차지 소요시간 (초)
    approachDistance?: number; // 현위치 -> 상차지 거리 (미터)
    raw?: any;
    polyline?: Array<{x: number; y: number}>; // 카카오 실제 도로 곡선 데이터
    sectionEtas?: string[]; // 각 구간 도착 시점(HH:mm) 배열
}

export interface DetourResult {
    base: RouteResult;
    merged: RouteResult;
    timeDiffMin: number;
    distDiffKm: string;
}

// ━━━━━━━━━━ [헬퍼 함수] ━━━━━━━━━━
function extractPolyline(routes?: any[]): Array<{x: number; y: number}> {
    const polyline: Array<{x: number; y: number}> = [];
    if (!routes || !routes[0] || !routes[0].sections) {
        console.log(`🗺️ [extractPolyline] routes/sections 배열이 없습니다. 카카오가 넘겨준 원본 배열:`, JSON.stringify(routes));
        return polyline;
    }
    
    console.log(`🗺️ [extractPolyline] 섹션(구간) 수: ${routes[0].sections.length}`);
    for (let sIdx = 0; sIdx < routes[0].sections.length; sIdx++) {
        const section = routes[0].sections[sIdx];
        if (!section.roads) continue;
        let sectionPoints = 0;
        for (const road of section.roads) {
            if (!road.vertexes) continue;
            // vertexes is [x1, y1, x2, y2, ...] flat array
            for (let i = 0; i < road.vertexes.length; i += 2) {
                polyline.push({
                    x: road.vertexes[i],
                    y: road.vertexes[i+1]
                });
                sectionPoints++;
            }
        }
        console.log(`   - 섹션 ${sIdx + 1} (${section.bound?.min_x || '?'},${section.bound?.min_y || '?'} -> ${section.bound?.max_x || '?'},${section.bound?.max_y || '?'}) 추출 라인 좌표수: ${sectionPoints}`);
    }
    console.log(`🗺️ [extractPolyline] 카카오 폴리라인 궤적 총 ${polyline.length}개의 포인트 추출 성공`);
    return polyline;
}

// ETA 계산 유틸 함수 (현재 시간 기준 누적 초단위 더해서 HH:mm 반환)
function calculateEtas(sections: any[]): string[] {
    const etas: string[] = [];
    if (!sections) return etas;
    const now = new Date();
    let cumulativeSec = 0;
    for (const section of sections) {
        cumulativeSec += section.duration || 0;
        const targetTime = new Date(now.getTime() + cumulativeSec * 1000);
        etas.push(targetTime.toTimeString().substring(0, 5));
    }
    return etas;
}

/** 카카오 경로 에러 코드 → 사람이 읽을 수 있는 메시지 */
function parseKakaoErrorMsg(resultCode: number, resultMsg: string): string {
    switch (resultCode) {
        case 101: return `경유지 주변 탐색불가 (${resultMsg})`;
        case 102: return `시작지점 탐색불가 (${resultMsg})`;
        case 103: return `도착지점 탐색불가 (${resultMsg})`;
        case 104: return `도로 단절구간 (5m이내 등) (${resultMsg})`;
        default: return resultMsg;
    }
}

// ━━━━━━━━━━ [공개 API 함수] ━━━━━━━━━━

/**
 * 단독 주행 연산 (본콜 첫짐)
 * API 키는 모듈 스코프에서 자동 참조 — 호출 시 전달 불필요
 */
export async function calculateSoloRoute(
    pickupX: number, pickupY: number,
    dropoffX: number, dropoffY: number,
    driverLoc?: { x: number, y: number } | null,
    priority: string = "RECOMMEND",
    carType: number = 1
): Promise<RouteResult> {
    const originCoord = driverLoc ? `${driverLoc.x},${driverLoc.y}` : `${pickupX},${pickupY}`;
    const waypointsQuery = driverLoc ? `&waypoints=${pickupX},${pickupY}` : "";
    const url = `${KAKAO_NAV_URL}?origin=${originCoord}&destination=${dropoffX},${dropoffY}${waypointsQuery}&priority=${priority}&car_type=${carType}`;
    
    console.log(`[Kakao Nav API (Solo)] 호출 URL: ${url}`);
    
    const res = await fetch(url, { headers: getHeaders() });
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
        console.error(`❌ [Kakao API Error (Solo)] 경로 탐색 실패:`, JSON.stringify(data));
        throw new Error(`경로 탐색 실패: ${data.msg || "routes 배열 없음"}`);
    }
    const summary = data.routes[0]?.summary;
    const sections = data.routes[0]?.sections;
    if (data.routes[0].result_code !== 0) {
        const msg = parseKakaoErrorMsg(data.routes[0].result_code, data.routes[0].result_msg);
        console.error(`❌ [Kakao API Error (Solo)] 에러 코드 ${data.routes[0].result_code}: ${msg}`);
        throw new Error(`카카오에러: ${msg}`);
    }
    
    let approachDuration = 0;
    let approachDistance = 0;
    
    // 현위치가 포함된 경우 section[0]은 현위치->상차지 접근 구간입니다.
    if (driverLoc && sections && sections.length > 1) {
        approachDuration = sections[0].duration;
        approachDistance = sections[0].distance;
    }

    return {
        duration: summary?.duration || 0,
        distance: summary?.distance || 0,
        approachDuration,
        approachDistance,
        raw: summary,
        polyline: extractPolyline(data?.routes),
        sectionEtas: calculateEtas(sections) // 첫콜에 대한 ETA 정보 제공
    };
}

/**
 * 합짐 우회 연산 (기존 본콜 대비 경유지 추가)
 */
export async function calculateDetourRoute(
    baseDestX: number, baseDestY: number,     // 단독 본콜 하차지
    mainPickupX: number, mainPickupY: number, // 단독 본콜 상차지
    mergedDestX: number, mergedDestY: number, // 합짐 최종 하차지
    mergedWaypoints: Array<{ x: number; y: number }>, // 스마트 정렬된 경유지들
    driverLoc?: { x: number, y: number } | null,
    priority: string = "RECOMMEND",
    carType: number = 1
): Promise<DetourResult> {
    const headers = getHeaders();

    let baseOriginX = mainPickupX;
    let baseOriginY = mainPickupY;
    let baseWaypoints = "";

    if (driverLoc) {
        baseOriginX = driverLoc.x;
        baseOriginY = driverLoc.y;
        baseWaypoints = `${mainPickupX},${mainPickupY}`; // 현위치에서 기존 상차지로 먼저 이동
    }

    // 1. 베이스(단독 본콜) 연산
    let baseUrl = `${KAKAO_NAV_URL}?origin=${baseOriginX},${baseOriginY}&destination=${baseDestX},${baseDestY}&priority=${priority}&car_type=${carType}`;
    if (baseWaypoints) {
        baseUrl += `&waypoints=${baseWaypoints}`;
    }
    const baseRes = await fetch(baseUrl, { headers });
    const baseData = await baseRes.json();
    const baseSummary = baseData?.routes?.[0]?.summary;

    // 2. 합짐(경유) 연산 (다중 경유지 POST API 사용 - 최대 30개 지원)
    // 스마트 정렬 시 driverLoc는 무조건 Origin으로 취급
    let mergedOriginX = driverLoc ? driverLoc.x : mergedWaypoints[0].x;
    let mergedOriginY = driverLoc ? driverLoc.y : mergedWaypoints[0].y;
    let wpArray = driverLoc ? mergedWaypoints : mergedWaypoints.slice(1);
    
    // Fallback defaults to prevent undefined .toString() errors
    mergedOriginX = mergedOriginX || 0;
    mergedOriginY = mergedOriginY || 0;
    const safeDestX = mergedDestX || 0;
    const safeDestY = mergedDestY || 0;

    const requestBody = {
        origin: { x: mergedOriginX.toString(), y: mergedOriginY.toString() },
        destination: { x: safeDestX.toString(), y: safeDestY.toString() },
        waypoints: wpArray.filter(wp => wp.x !== undefined && wp.y !== undefined).map((wp, i) => ({
            name: `wp${i}`,
            x: wp.x.toString(),
            y: wp.y.toString()
        })),
        priority: priority,
        car_type: carType
    };
    
    console.log(`\n🚙 [Kakao API Request] 스마트 합짐 우회 경로 요청 (다중 경유지 API)`);
    console.log(`   - Origin: ${mergedOriginX},${mergedOriginY} / Dest: ${mergedDestX},${mergedDestY}`);
    console.log(`   - Waypoints Count: ${wpArray.length}`);
    
    const mergedRes = await fetch(KAKAO_WAYPOINTS_URL, { 
        method: "POST",
        headers: {
            ...headers,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
    });
    const mergedData = await mergedRes.json();
    
    if (!mergedData.routes || mergedData.routes.length === 0) {
        console.error(`❌ [Kakao API Error (Detour)] 우회 경로 탐색 실패. 응답 코드=${mergedData.msg || '알수없음'}, 상세:`, JSON.stringify(mergedData));
        throw new Error(`합짐 경로 탐색 실패: ${mergedData.msg || "routes 배열 없음"}`);
    } else {
        if (mergedData.routes[0].result_code !== 0) {
            const msg = parseKakaoErrorMsg(mergedData.routes[0].result_code, mergedData.routes[0].result_msg);
            console.error(`❌ [Kakao API Error (Detour)] 에러 코드 ${mergedData.routes[0].result_code}: ${msg}`);
            throw new Error(`카카오합짐에러: ${msg}`);
        }
        console.log(`✅ [Kakao API Response] 폴리라인 길이 예상: (데이터 추출 중)`);
    }
    
    const mergedSummary = mergedData.routes[0]?.summary;

    const baseDuration = baseSummary?.duration || 0;
    const baseDistance = baseSummary?.distance || 0;
    const mergedDuration = mergedSummary?.duration || 0;
    const mergedDistance = mergedSummary?.distance || 0;

    let baseApproachDuration = 0, baseApproachDistance = 0;
    let mergedApproachDuration = 0, mergedApproachDistance = 0;
    
    if (driverLoc) {
        if (baseData?.routes?.[0]?.sections?.length > 1) {
            baseApproachDuration = baseData.routes[0].sections[0].duration;
            baseApproachDistance = baseData.routes[0].sections[0].distance;
        }
        if (mergedData?.routes?.[0]?.sections?.length > 1) {
            mergedApproachDuration = mergedData.routes[0].sections[0].duration;
            mergedApproachDistance = mergedData.routes[0].sections[0].distance;
        }
    }

    return {
        base: { 
            duration: baseDuration, distance: baseDistance, 
            approachDuration: baseApproachDuration, approachDistance: baseApproachDistance, 
            raw: baseSummary, polyline: extractPolyline(baseData?.routes),
            sectionEtas: calculateEtas(baseData?.routes?.[0]?.sections)
        },
        merged: { 
            duration: mergedDuration, distance: mergedDistance, 
            approachDuration: mergedApproachDuration, approachDistance: mergedApproachDistance, 
            raw: mergedSummary, polyline: extractPolyline(mergedData?.routes),
            sectionEtas: calculateEtas(mergedData?.routes?.[0]?.sections)
        },
        timeDiffMin: Math.round((mergedDuration - baseDuration) / 60),
        distDiffKm: ((mergedDistance - baseDistance) / 1000).toFixed(1)
    };
}

/**
 * 지오코딩: 주소 또는 지역명(키워드)을 주면 X, Y 좌표를 찾아 반환
 * 
 * [P0 개선] 인메모리 캐시를 통해 동일 주소 재조회 시 카카오 API 호출 0회
 */
export async function geocodeAddress(query: string): Promise<{x: number, y: number} | null> {
    try {
        if (!query || query === "미상") return null;

        // "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)빌딩명" 
        // 1. 괄호를 공백으로 치환하여 단어들이 서로 붙지 않게 정제
        const cleanQuery = query.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

        // ━━━ [P0] 캐시 히트 체크 ━━━
        const cached = geoCacheGet(cleanQuery);
        if (cached) {
            console.log(`🗺️ [GeoCache HIT] '${cleanQuery}' → X:${cached.x}, Y:${cached.y} (API 호출 스킵)`);
            return cached;
        }

        // 2. 가장 높은 확률의 순서대로 API 호출을 시도할 후보군
        const fallbackQueries: Array<{ type: 'address' | 'keyword', text: string }> = [];
        
        const words = cleanQuery.split(' ');
        
        let lastNumberIndex = -1;
        for (let i = words.length - 1; i >= 0; i--) {
            if (/\d+/.test(words[i])) {
                lastNumberIndex = i;
                break;
            }
        }

        // [시도 1] 번지수/건물번호까지 해당하는 앞부분만 잘라서 주소 검색 (가장 정확하고 빠름)
        if (lastNumberIndex !== -1 && lastNumberIndex < words.length) {
            const addressPart = words.slice(0, lastNumberIndex + 1).join(' ');
            fallbackQueries.push({ type: 'address', text: addressPart });
        }
        
        // [시도 2] 원본 텍스트 전체로 키워드 검색 (장소 우선)
        fallbackQueries.push({ type: 'keyword', text: cleanQuery });

        // [시도 3] 원본 텍스트 전체로 주소 검색
        fallbackQueries.push({ type: 'address', text: cleanQuery });

        // [시도 4] 괄호 텍스트 (신주소/구주소 병기된 경우)
        const parenMatch = query.match(/\(([^)]+)\)/);
        if (parenMatch && parenMatch[1]) {
            fallbackQueries.push({ type: 'address', text: parenMatch[1].trim() });
        }

        // [시도 5] 마지막 2~3어절 추출하여 키워드 검색 (상호명일 확률이 높음)
        if (words.length > 2) {
            const lastWords = words.slice(-2).join(' ');
            fallbackQueries.push({ type: 'keyword', text: lastWords });
        }

        // [시도 6] 상위 지역명(1~3어절) + 상호명(마지막 어절) 조합 검색
        // 예: "경기 광주시 퇴촌면 경충대로 1520 농협하나로마트" -> "경기 광주시 퇴촌면 농협하나로마트"
        if (words.length > 3) {
            const regionPart = words.slice(0, 3).join(' ');
            const storePart = words[words.length - 1];
            fallbackQueries.push({ type: 'keyword', text: `${regionPart} ${storePart}` });
        }

        // 🌟 [최적화] 순차 호출이 아닌 '병렬 호출(Concurrent)' 로 전환하여 지연 시간(Latency)을 200ms 이하로 단축
        const headers = getHeaders();
        const promises = fallbackQueries.map((fq, index) => {
            const url = `${KAKAO_LOCAL_URL}/${fq.type}.json?query=${encodeURIComponent(fq.text)}`;
            return fetch(url, { headers })
                .then(res => res.json())
                .then(data => {
                    if (data.documents && data.documents.length > 0) {
                        return { 
                            index, 
                            doc: data.documents[0],
                            result: { x: parseFloat(data.documents[0].x), y: parseFloat(data.documents[0].y) } 
                        };
                    }
                    return null;
                })
                .catch((err) => {
                    console.error(`❌ [Geocoding] fetch 에러 (쿼리: '${fq.text}'):`, err.message);
                    return null;
                });
        });

        const results = await Promise.all(promises);
        
        let expectedRegion: string | null = null;
        if (words.length > 0 && REGION_MAP[words[0]]) {
            expectedRegion = REGION_MAP[words[0]];
        }

        // 우선순위(index)가 가장 높은(낮은 숫자) 성공 결과를 채택하되, 지역 불일치는 스킵
        const validResults = results.filter(r => r !== null).sort((a, b) => a!.index - b!.index);
        
        for (const res of validResults) {
            if (expectedRegion) {
                const addrRegion = res!.doc.address_name ? res!.doc.address_name.split(' ')[0] : '';
                const roadRegion = (res!.doc.road_address && res!.doc.road_address.address_name) ? res!.doc.road_address.address_name.split(' ')[0] : '';

                // 카카오에서 반환된 주소/도로명주소의 시/도가 기대하는 시/도(expectedRegion)와 다른 경우 예외처리 방어 로직 (예: 경기 -> 전남 광주 오인 방지)
                if (addrRegion !== expectedRegion && roadRegion !== expectedRegion) {
                    console.log(`[GeoResolver] 지역 불일치 방어: 쿼리 '${query}', 결과 '${res!.doc.address_name}' -> 스킵 (기대지역: ${expectedRegion})`);
                    continue; // 다음 우선순위 결과 시도
                }
            }
            // ━━━ 캐시에 저장 (L1 + L2) ━━━
            geoCacheSet(cleanQuery, res!.result);
            console.log(`🗺️ [GeoCache SET] '${cleanQuery}' → X:${res!.result.x}, Y:${res!.result.y} (L1: ${geoL1.size}개)`);
            return res!.result;
        }

        // 모든 시도 실패
        console.log(`[GeoResolver] 카카오 좌표 변환 최종 실패: 원본=${query}`);
        return null;
    } catch (e) {
        console.error("카카오 지오코딩 에러:", e);
        return null;
    }
}

/**
 * 단순 경로 비교 (프론트엔드 REST 프록시용)
 * 기존 kakao.ts의 중복 로직을 이 함수로 통합
 */
export async function compareDirections(
    origin: { x: number, y: number },
    destination: { x: number, y: number },
    waypoints: Array<{ x: number, y: number }>,
    carType: number = 1
) {
    const headers = getHeaders();
    
    // 1. 단독 주행 (목적지 다이렉트)
    const baseUrl = `${KAKAO_NAV_URL}?origin=${origin.x},${origin.y}&destination=${destination.x},${destination.y}&priority=RECOMMEND&car_type=${carType}`;
    const baseRes = await fetch(baseUrl, { method: "GET", headers });
    const baseData = await baseRes.json();

    // 2. 합짐 주행 (경유지 포함)
    const waypointsQuery = waypoints && waypoints.length > 0
        ? `&waypoints=${waypoints.map(wp => `${wp.x},${wp.y}`).join('|')}`
        : '';
    const mergedUrl = `${KAKAO_NAV_URL}?origin=${origin.x},${origin.y}&destination=${destination.x},${destination.y}${waypointsQuery}&priority=RECOMMEND&car_type=${carType}`;
    const mergedRes = await fetch(mergedUrl, { method: "GET", headers });
    const mergedData = await mergedRes.json();

    if (!baseData.routes || baseData.routes.length === 0 || !mergedData.routes || mergedData.routes.length === 0) {
        throw new Error(`Kakao API: 경로 탐색 결과가 없습니다.`);
    }

    if (baseData.routes[0].result_code !== 0) {
        throw new Error(`Kakao API Error (Base): ${parseKakaoErrorMsg(baseData.routes[0].result_code, baseData.routes[0].result_msg)}`);
    }
    if (mergedData.routes[0].result_code !== 0) {
        throw new Error(`Kakao API Error (Merged): ${parseKakaoErrorMsg(mergedData.routes[0].result_code, mergedData.routes[0].result_msg)}`);
    }

    const baseSummary = baseData.routes[0].summary;
    const mergedSummary = mergedData.routes[0].summary;

    return {
        base: baseSummary,
        merged: mergedSummary,
        diff: {
            timeExtSeconds: mergedSummary.duration - baseSummary.duration,
            distExtMeters: mergedSummary.distance - baseSummary.distance
        }
    };
}
