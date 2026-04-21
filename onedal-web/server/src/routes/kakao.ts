import { Router, Request, Response } from 'express';
import { requireAuth } from '../middlewares/authMiddleware';
import { mapVehicleToKakaoCarType } from '@onedal/shared';
import { compareDirections } from '../services/kakaoService';
import db from '../db';

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

/**
 * 프론트엔드(useKakaoRouting) → 서버 프록시 → 카카오 API
 * [P1 리팩토링] 기존 자체 fetch 로직을 kakaoService.compareDirections()에 위임
 */
router.post('/directions/compare', requireAuth, async (req: Request, res: Response) => {
    try {
        const { origin, destination, waypoints } = req.body as CompareRequest;

        console.log(`\n======================================================`);
        console.log(`[KAKAO API] 🚀 새로운 동선 계산 요청 수신`);
        console.log(`   - 기존 경로: [${origin.name}] ➡️ [${destination.name}]`);
        if (waypoints && waypoints.length > 0) {
            console.log(`   - 추가 경유: [${waypoints.map(w => w.name).join(' ➡️ ')}]`);
        } else {
            console.log(`   - 추가 경유: 없음 (단독 배차 검수)`);
        }
        console.log(`------------------------------------------------------`);

        // 유저 차종 매핑
        let mappedCarType = 1;
        if (req.user?.id) {
            const row = db.prepare("SELECT vehicle_type FROM user_settings WHERE user_id = ?").get(req.user.id) as any;
            if (row && row.vehicle_type) {
                mappedCarType = mapVehicleToKakaoCarType(row.vehicle_type);
            }
        }

        // [P1] kakaoService의 공용 함수에 위임 (기존 자체 fetch/headers/URL 구성 로직 전면 삭제)
        const result = await compareDirections(origin, destination, waypoints || [], mappedCarType);

        console.log(`[KAKAO API] 🟢 연산 완료!`);
        console.log(`   - 🧭 단독 기준 소요시간: ${Math.round(result.base.duration / 60)}분 (${(result.base.distance / 1000).toFixed(1)}km)`);
        if (waypoints && waypoints.length > 0) {
            console.log(`   - 🗺️ 합짐 경유 소요시간: ${Math.round(result.merged.duration / 60)}분 (${(result.merged.distance / 1000).toFixed(1)}km)`);
            const extMin = Math.round(result.diff.timeExtSeconds / 60);
            console.log(`   - ⚠️ 시간 패널티: ${extMin > 0 ? '+' : ''}${extMin}분 추가 소요`);
        }
        console.log(`======================================================\n`);

        res.json(result);

    } catch (error: any) {
        console.error("Kakao API fetch error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
