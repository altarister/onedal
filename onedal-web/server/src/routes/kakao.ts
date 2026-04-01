import { Router, Request, Response } from 'express';

const router = Router();

interface Point {
    x: number;
    y: number;
    name?: string;
}

interface CompareRequest {
    origin: Point;
    destination: Point;
    waypoints: Point[];
}

router.post('/directions/compare', async (req: Request, res: Response) => {
    try {
        const { origin, destination, waypoints } = req.body as CompareRequest;
        const apiKey = process.env.KAKAO_REST_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: "KAKAO_REST_API_KEY is not configured on the server." });
        }

        const KAKAO_API_URL = "https://apis-navi.kakaomobility.com/v1/directions";
        const headers = {
            "Authorization": `KakaoAK ${apiKey}`,
            "Content-Type": "application/json"
        };

        // 1. 단독 주행 (목적지 다이렉트)
        const baseUrl = `${KAKAO_API_URL}?origin=${origin.x},${origin.y}&destination=${destination.x},${destination.y}&priority=RECOMMEND&car_type=1`;
        const baseRes = await fetch(baseUrl, {
            method: "GET",
            headers
        });
        const baseData = await baseRes.json();

        // 2. 합짐 주행 (경유지 포함)
        const waypointsQuery = waypoints && waypoints.length > 0
            ? `&waypoints=${waypoints.map(wp => `${wp.x},${wp.y}`).join('|')}`
            : '';
        const mergedUrl = `${KAKAO_API_URL}?origin=${origin.x},${origin.y}&destination=${destination.x},${destination.y}${waypointsQuery}&priority=RECOMMEND&car_type=1`;
        
        const mergedRes = await fetch(mergedUrl, {
            method: "GET",
            headers
        });
        const mergedData = await mergedRes.json();

        // 카카오 API 응답에서 요약 정보 추출 (초 단위 시간, 미터 단위 거리)
        const baseSummary = baseData?.routes?.[0]?.summary;
        const mergedSummary = mergedData?.routes?.[0]?.summary;

        if (!baseSummary || !mergedSummary) {
            console.error("Kakao API Response Error:", baseData, mergedData);
            return res.status(500).json({ error: "Failed to parse Kakao API response", baseData, mergedData });
        }

        // 결과 계산
        const timeDiffSeconds = mergedSummary.duration - baseSummary.duration;
        const distDiffMeters = mergedSummary.distance - baseSummary.distance;

        res.json({
            base: baseSummary,
            merged: mergedSummary,
            diff: {
                timeExtSeconds: timeDiffSeconds,
                distExtMeters: distDiffMeters
            }
        });

    } catch (error: any) {
        console.error("Kakao API fetch error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
