/**
 * /api/logbook/gps-track 라우터 — **궤적의 읽기 입구** (2026-08-28)
 *
 * `gps_tracks` 는 이날까지 쓰기 전용이었다 — INSERT 와 7일 정리뿐, SELECT 가 서버
 * 어디에도 없어서 «궤적에 콜이 붙는가» 확인조차 EC2 에 들어가 node -e 를 손으로 짰다.
 *
 * 인증된 사용자의 본인 궤적만 조회한다 (다른 logbook 라우트와 같은 규칙).
 *
 *   GET /api/logbook/gps-track              궤적이 붙은 콜 목록 (콜별 점 수·구간)
 *   GET /api/logbook/gps-track?orderId=<id> «이 콜의 궤적» — 점 전체 + 요약(공백·상하차 구분)
 *                                           id 는 앞부분만 줘도 된다 (8자 이상)
 *
 * ⚠️ 궤적은 «기록»이지 «판정 입력»이 아니다 — 이 라우트는 읽기만 한다.
 */

import { Router } from "express";
import { requireAuth } from "../../middlewares/authMiddleware";
import db from "../../db";
import { trackOfOrder, trackSegmentsOf, summarizeTrack } from "../../services/gpsTrackStore";

const router = Router();

router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        const orderIdParam = String(req.query.orderId ?? "").trim();

        // ── 목록 — 어느 콜의 궤적이 있나 ──
        if (!orderIdParam) {
            const segments = trackSegmentsOf(userId).map(s => {
                const o = db.prepare(
                    `SELECT status, pickup, dropoff, fare FROM orders WHERE id = ?`
                ).get(s.orderId) as any;
                // 콜이 지워졌어도 궤적 행은 남는다 — 지어내지 않고 비운 채로 보낸다 (규칙 ④)
                return { ...s, order: o ?? null };
            });
            const total = db.prepare(
                `SELECT COUNT(*) AS c FROM gps_tracks WHERE user_id = ?`
            ).get(userId) as any;
            return res.json({ totalPoints: total.c, segments });
        }

        // ── «이 콜의 궤적» — 앞부분 일치 허용 (확인 작업은 늘 짧은 id 로 한다) ──
        if (orderIdParam.length < 8) {
            return res.status(400).json({ error: "orderId 는 8자 이상 주세요 (앞부분 일치)" });
        }
        const matches = db.prepare(
            `SELECT id, status, pickup, dropoff, fare FROM orders
             WHERE userId = ? AND id LIKE ? LIMIT 2`
        ).all(userId, `${orderIdParam}%`) as any[];
        if (matches.length === 0) return res.status(404).json({ error: "그 콜이 없습니다" });
        if (matches.length > 1) return res.status(400).json({ error: "id 앞부분이 겹칩니다 — 더 길게 주세요" });

        const order = matches[0];
        const points = trackOfOrder(userId, order.id);
        return res.json({ order, points, summary: summarizeTrack(points) });
    } catch (error) {
        console.error("❌ [Logbook GpsTrack] 궤적 조회 실패:", error);
        res.status(500).json({ error: "궤적 조회 중 오류가 발생했습니다." });
    }
});

export default router;
