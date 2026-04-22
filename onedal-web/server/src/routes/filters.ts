import { Router } from "express";
import db from "../db";
import { requireAuth } from "../middlewares/authMiddleware";
import { getUserSession } from "../state/userSessionStore";
import { applyFilter } from "../state/filterManager";

const router = Router();

// 사용자의 필터 조회 (DB에서)
router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        let row = db.prepare("SELECT * FROM user_filters WHERE user_id = ?").get(userId) as any;
        
        if (!row) {
            db.prepare("INSERT INTO user_filters (user_id) VALUES (?)").run(userId);
            row = db.prepare("SELECT * FROM user_filters WHERE user_id = ?").get(userId) as any;
        }

        res.json({
            isActive: Boolean(row.is_active),
            isSharedMode: Boolean(row.is_shared_mode),
            loadState: row.load_state || 'EMPTY',
            destinationCity: row.destination_city || "",
            destinationRadiusKm: row.destination_radius_km || 10,
            corridorRadiusKm: row.corridor_radius_km || 1,
            allowedVehicleTypes: JSON.parse(row.allowed_vehicle_types || '[]'),
            minFare: row.min_fare || 0,
            maxFare: row.max_fare || 1000000,
            pickupRadiusKm: row.pickup_radius_km || 999,
            excludedKeywords: JSON.parse(row.excluded_keywords || '[]'),
            destinationKeywords: JSON.parse(row.destination_keywords || '[]')
        });
    } catch (e) {
        console.error("Filters GET 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

// 사용자의 필터 변경 — applyFilter() 중앙화
router.put("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const io = req.app.get("io");
        const result = applyFilter(userId, req.body, io);
        res.json({ success: true, message: "Filters updated successfully", filter: result });
    } catch (e) {
        console.error("Filters PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
