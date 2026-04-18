import { Router } from "express";
import db from "../db";
import { requireAuth } from "../middlewares/authMiddleware";
import { getUserSession } from "../state/userSessionStore";

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

// 사용자의 필터 변경
router.put("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const payload = req.body;

        const updateStmt = db.prepare(`
            UPDATE user_filters 
            SET destination_city = COALESCE(@destinationCity, destination_city),
                destination_radius_km = COALESCE(@destinationRadiusKm, destination_radius_km),
                corridor_radius_km = COALESCE(@corridorRadiusKm, corridor_radius_km),
                allowed_vehicle_types = COALESCE(@allowedVehicleTypes, allowed_vehicle_types),
                min_fare = COALESCE(@minFare, min_fare),
                max_fare = COALESCE(@maxFare, max_fare),
                pickup_radius_km = COALESCE(@pickupRadiusKm, pickup_radius_km),
                excluded_keywords = COALESCE(@excludedKeywords, excluded_keywords),
                destination_keywords = COALESCE(@destinationKeywords, destination_keywords),
                is_active = COALESCE(@isActive, is_active),
                is_shared_mode = COALESCE(@isSharedMode, is_shared_mode)
            WHERE user_id = @userId
        `);
        
        const params = {
            userId,
            destinationCity: payload.destinationCity ?? null,
            destinationRadiusKm: payload.destinationRadiusKm ?? null,
            corridorRadiusKm: payload.corridorRadiusKm ?? null,
            allowedVehicleTypes: payload.allowedVehicleTypes ? JSON.stringify(payload.allowedVehicleTypes) : null,
            minFare: payload.minFare ?? null,
            maxFare: payload.maxFare ?? null,
            pickupRadiusKm: payload.pickupRadiusKm ?? null,
            excludedKeywords: payload.excludedKeywords ? JSON.stringify(payload.excludedKeywords) : null,
            destinationKeywords: payload.destinationKeywords ? JSON.stringify(payload.destinationKeywords) : null,
            isActive: payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : null,
            isSharedMode: payload.isSharedMode !== undefined ? (payload.isSharedMode ? 1 : 0) : null
        };
        
        const result = updateStmt.run(params);

        if (result.changes === 0) {
            db.prepare("INSERT OR IGNORE INTO user_filters (user_id) VALUES (?)").run(userId);
            updateStmt.run(params);
        }

        // 메모리 세션 동기화
        const session = getUserSession(userId);
        if (payload.isActive !== undefined) session.activeFilter.isActive = payload.isActive;
        if (payload.isSharedMode !== undefined) session.activeFilter.isSharedMode = payload.isSharedMode;
        if (payload.destinationCity !== undefined) session.activeFilter.destinationCity = payload.destinationCity;
        if (payload.destinationRadiusKm !== undefined) session.activeFilter.destinationRadiusKm = payload.destinationRadiusKm;
        if (payload.corridorRadiusKm !== undefined) session.activeFilter.corridorRadiusKm = payload.corridorRadiusKm;
        if (payload.allowedVehicleTypes !== undefined) session.activeFilter.allowedVehicleTypes = payload.allowedVehicleTypes;
        if (payload.minFare !== undefined) session.activeFilter.minFare = payload.minFare;
        if (payload.maxFare !== undefined) session.activeFilter.maxFare = payload.maxFare;
        if (payload.pickupRadiusKm !== undefined) session.activeFilter.pickupRadiusKm = payload.pickupRadiusKm;
        if (payload.excludedKeywords !== undefined) session.activeFilter.excludedKeywords = payload.excludedKeywords;
        if (payload.destinationKeywords !== undefined) session.activeFilter.destinationKeywords = payload.destinationKeywords;
        
        // io로 쏴주기
        const io = req.app.get("io");
        if (io) {
            io.to(userId).emit("filter-updated", session.activeFilter);
        }

        res.json({ success: true, message: "Filters updated successfully", filter: session.activeFilter });
    } catch (e) {
        console.error("Filters PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
