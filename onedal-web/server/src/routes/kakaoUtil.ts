/**
 * 카카오 모빌리티 API 공용 유틸리티
 * - orders.ts의 DETAILED 블록과 kakao.ts REST 프록시에서 중복되던 로직을 단일화
 */

interface RouteResult {
    duration: number;  // 총 소요 초
    distance: number;  // 총 이동거리 미터
    approachDuration?: number; // 현위치 -> 상차지 소요시간 (초)
    approachDistance?: number; // 현위치 -> 상차지 거리 (미터)
    raw?: any;
    polyline?: Array<{x: number; y: number}>; // 카카오 실제 도로 곡선 데이터
    sectionEtas?: string[]; // [추가] 각 구간 도착 시점(HH:mm) 배열
}

function extractPolyline(routes?: any[]): Array<{x: number; y: number}> {
    const polyline: Array<{x: number; y: number}> = [];
    if (!routes || !routes[0] || !routes[0].sections) {
        console.log(`🗺️ [extractPolyline] routes/sections 배열이 없습니다.`);
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

interface DetourResult {
    base: RouteResult;
    merged: RouteResult;
    timeDiffMin: number;
    distDiffKm: string;
}

const KAKAO_API_URL = "https://apis-navi.kakaomobility.com/v1/directions";

function getHeaders(apiKey: string) {
    return { "Authorization": `KakaoAK ${apiKey}`, "Content-Type": "application/json" };
}

/**
 * 단독 주행 연산 (본콜 첫짐)
 */
export async function calculateSoloRoute(
    apiKey: string,
    pickupX: number, pickupY: number,
    dropoffX: number, dropoffY: number,
    driverLoc?: { x: number, y: number } | null
): Promise<RouteResult> {
    let url = "";
    if (driverLoc) {
        url = `${KAKAO_API_URL}?origin=${driverLoc.x},${driverLoc.y}&destination=${dropoffX},${dropoffY}&waypoints=${pickupX},${pickupY}&priority=RECOMMEND&car_type=1`;
    } else {
        url = `${KAKAO_API_URL}?origin=${pickupX},${pickupY}&destination=${dropoffX},${dropoffY}&priority=RECOMMEND&car_type=1`;
    }
    
    const res = await fetch(url, { headers: getHeaders(apiKey) });
    const data = await res.json();
    if (!data.routes || data.routes.length === 0) {
        console.error(`❌ [Kakao API Error (Solo)] 경로 탐색 실패:`, JSON.stringify(data));
    }
    const summary = data?.routes?.[0]?.summary;
    const sections = data?.routes?.[0]?.sections;
    
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
        sectionEtas: calculateEtas(sections) // [추가] 첫콜에 대한 ETA 정보 제공
    };
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

/**
 * 합짐 우회 연산 (기존 본콜 대비 경유지 추가)
 */
export async function calculateDetourRoute(
    apiKey: string,
    baseDestX: number, baseDestY: number,     // 단독 본콜 하차지
    mainPickupX: number, mainPickupY: number, // 단독 본콜 상차지
    mergedDestX: number, mergedDestY: number, // 합짐 최종 하차지
    mergedWaypoints: Array<{ x: number; y: number }>, // 스마트 정렬된 경유지들
    driverLoc?: { x: number, y: number } | null
): Promise<DetourResult> {
    const headers = getHeaders(apiKey);

    let baseOriginX = mainPickupX;
    let baseOriginY = mainPickupY;
    let baseWaypoints = "";

    if (driverLoc) {
        baseOriginX = driverLoc.x;
        baseOriginY = driverLoc.y;
        baseWaypoints = `${mainPickupX},${mainPickupY}`; // 현위치에서 기존 상차지로 먼저 이동
    }

    // 1. 베이스(단독 본콜) 연산
    let baseUrl = `${KAKAO_API_URL}?origin=${baseOriginX},${baseOriginY}&destination=${baseDestX},${baseDestY}&priority=RECOMMEND&car_type=1`;
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
    
    // 카카오 다중 경유지 API (POST) URL
    const WAYPOINTS_API_URL = "https://apis-navi.kakaomobility.com/v1/waypoints/directions";
    
    const requestBody = {
        origin: { x: mergedOriginX.toString(), y: mergedOriginY.toString() },
        destination: { x: mergedDestX.toString(), y: mergedDestY.toString() },
        waypoints: wpArray.map((wp, i) => ({
            name: `wp${i}`,
            x: wp.x,
            y: wp.y
        })),
        priority: "RECOMMEND",
        car_type: 1
    };
    
    console.log(`\n🚙 [Kakao API Request] 스마트 합짐 우회 경로 요청 (다중 경유지 API)`);
    console.log(`   - Origin: ${mergedOriginX},${mergedOriginY} / Dest: ${mergedDestX},${mergedDestY}`);
    console.log(`   - Waypoints Count: ${wpArray.length}`);
    
    const mergedRes = await fetch(WAYPOINTS_API_URL, { 
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
    } else {
        console.log(`✅ [Kakao API Response] 폴리라인 길이 예상: (데이터 추출 중)`);
    }
    
    const mergedSummary = mergedData?.routes?.[0]?.summary;

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
 */
export async function geocodeAddress(apiKey: string, query: string): Promise<{x: number, y: number} | null> {
    try {
        if (!query || query === "미상") return null;

        // "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)빌딩명" 
        // 1. 괄호를 공백으로 치환하여 단어들이 서로 붙지 않게 정제
        const cleanQuery = query.replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();

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

        // 🌟 [최적화] 순차 호출이 아닌 '병렬 호출(Concurrent)' 로 전환하여 지연 시간(Latency)을 200ms 이하로 단축
        const promises = fallbackQueries.map((fq, index) => {
            const url = `https://dapi.kakao.com/v2/local/search/${fq.type}.json?query=${encodeURIComponent(fq.text)}`;
            return fetch(url, { headers: getHeaders(apiKey) })
                .then(res => res.json())
                .then(data => {
                    if (data.documents && data.documents.length > 0) {
                        return { 
                            index, 
                            result: { x: parseFloat(data.documents[0].x), y: parseFloat(data.documents[0].y) } 
                        };
                    }
                    return null;
                })
                .catch(() => null);
        });

        const results = await Promise.all(promises);
        
        // 우선순위(index)가 가장 높은(낮은 숫자) 성공 결과를 채택
        const validResults = results.filter(r => r !== null).sort((a, b) => a!.index - b!.index);
        if (validResults.length > 0) {
            return validResults[0]!.result;
        }

        // 모든 시도 실패
        console.log(`[GeoResolver] 카카오 좌표 변환 최종 실패: 원본=${query}`);
        return null;
    } catch (e) {
        console.error("카카오 지오코딩 에러:", e);
        return null;
    }
}
