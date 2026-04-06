/**
 * 카카오 모빌리티 API 공용 유틸리티
 * - orders.ts의 DETAILED 블록과 kakao.ts REST 프록시에서 중복되던 로직을 단일화
 */

interface RouteResult {
    duration: number;  // 초
    distance: number;  // 미터
    raw?: any;
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
    dropoffX: number, dropoffY: number
): Promise<RouteResult> {
    const url = `${KAKAO_API_URL}?origin=${pickupX},${pickupY}&destination=${dropoffX},${dropoffY}&priority=RECOMMEND&car_type=1`;
    const res = await fetch(url, { headers: getHeaders(apiKey) });
    const data = await res.json();
    const summary = data?.routes?.[0]?.summary;
    return {
        duration: summary?.duration || 0,
        distance: summary?.distance || 0,
        raw: summary
    };
}

/**
 * 합짐 우회 연산 (기존 본콜 대비 경유지 추가)
 */
export async function calculateDetourRoute(
    apiKey: string,
    originX: number, originY: number,
    destX: number, destY: number,
    waypoints: Array<{ x: number; y: number }>
): Promise<DetourResult> {
    const headers = getHeaders(apiKey);

    // 1. 베이스(단독) 연산
    const baseUrl = `${KAKAO_API_URL}?origin=${originX},${originY}&destination=${destX},${destY}&priority=RECOMMEND&car_type=1`;
    const baseRes = await fetch(baseUrl, { headers });
    const baseData = await baseRes.json();
    const baseSummary = baseData?.routes?.[0]?.summary;

    // 2. 합짐(경유) 연산
    const wpQuery = waypoints.map(wp => `${wp.x},${wp.y}`).join('|');
    const mergedUrl = `${KAKAO_API_URL}?origin=${originX},${originY}&destination=${destX},${destY}&waypoints=${wpQuery}&priority=RECOMMEND&car_type=1`;
    const mergedRes = await fetch(mergedUrl, { headers });
    const mergedData = await mergedRes.json();
    const mergedSummary = mergedData?.routes?.[0]?.summary;

    const baseDuration = baseSummary?.duration || 0;
    const baseDistance = baseSummary?.distance || 0;
    const mergedDuration = mergedSummary?.duration || 0;
    const mergedDistance = mergedSummary?.distance || 0;

    return {
        base: { duration: baseDuration, distance: baseDistance, raw: baseSummary },
        merged: { duration: mergedDuration, distance: mergedDistance, raw: mergedSummary },
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

        // "경기 화성시 안녕동 158-95(경기 화성시 안녕남로119번길 25)빌딩명" 처럼 괄호가 포함된 경우 제거
        const noParenQuery = query.replace(/\(.*?\)/g, '').split('+')[0].trim();

        // [시도 1] 정제된 전체 텍스트로 주소 검색
        let url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(noParenQuery)}`;
        let res = await fetch(url, { headers: getHeaders(apiKey) });
        let data = await res.json();
        
        if (data.documents && data.documents.length > 0) {
            return {
                x: parseFloat(data.documents[0].x),
                y: parseFloat(data.documents[0].y)
            };
        }
        
        // [시도 2] 위의 텍스트로 키워드 검색 시도
        url = `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(noParenQuery)}`;
        res = await fetch(url, { headers: getHeaders(apiKey) });
        data = await res.json();
        
        if (data.documents && data.documents.length > 0) {
            return {
                x: parseFloat(data.documents[0].x),
                y: parseFloat(data.documents[0].y)
            };
        }

        // [시도 3] 건물명(KGIT센터 등)이 섞여서 주소를 못 찾는 경우 대비:
        // 보통 '시 구 동 번지' 형태이므로, 띄어쓰기 기준으로 맨 앞 4개 단어만 추출해서 다시 주소 검색 시도
        const words = noParenQuery.split(' ');
        if (words.length > 3) {
            const shortQuery = words.slice(0, 4).join(' '); // "서울 마포구 상암동 1601" 까지만
            url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(shortQuery)}`;
            res = await fetch(url, { headers: getHeaders(apiKey) });
            data = await res.json();
            if (data.documents && data.documents.length > 0) {
                return {
                    x: parseFloat(data.documents[0].x),
                    y: parseFloat(data.documents[0].y)
                };
            }
        }

        // 모든 시도 실패
        console.log(`[GeoResolver] 카카오 좌표 변환 최종 실패: 원본=${query}`);
        return null;
    } catch (e) {
        console.error("카카오 지오코딩 에러:", e);
        return null;
    }
}
