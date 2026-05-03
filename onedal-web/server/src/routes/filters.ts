import { Router } from "express";
import { requireAuth } from "../middlewares/authMiddleware";
import { getUserSession } from "../state/userSessionStore";
import { updateActiveFilter } from "../state/filterManager";

const router = Router();

// 사용자의 필터 조회 (메모리 activeFilter에서 — 동적 파생 배열 포함)
router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const session = getUserSession(userId);
        const f = session.activeFilter;

        res.json({
            isActive: f.isActive ?? false,
            isSharedMode: f.isSharedMode ?? false,
            // loadState 삭제됨
            driverAction: f.driverAction ?? 'WAITING',       // [V2]
            dispatchPhase: f.dispatchPhase ?? 'STANDBY',     // [V2]
            destinationCity: f.destinationCity ?? "",
            destinationRadiusKm: f.destinationRadiusKm ?? 0,
            corridorRadiusKm: f.corridorRadiusKm ?? 0,
            allowedVehicleTypes: f.allowedVehicleTypes ?? [],
            minFare: f.minFare ?? 0,
            maxFare: f.maxFare ?? 1000000,
            pickupRadiusKm: f.pickupRadiusKm ?? 10,
            excludedKeywords: f.excludedKeywords ?? [],
            destinationKeywords: f.destinationKeywords ?? []
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
        const result = updateActiveFilter(userId, req.body, io);
        res.json({ success: true, message: "Filters updated successfully", filter: result });
    } catch (e) {
        console.error("Filters PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
