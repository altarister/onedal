/**
 * ⚰️ **이 파일은 돌지 않는다** — 2026-08-12 에 마운트를 뗐다 (`index.ts` 참조).
 *    `/api/filters` 로 오는 요청은 `index.ts` 의 404 가드가 잡는다.
 *    삭제는 기사님 확인 대상이라 todo 「🗑️ 삭제 대기」에 올려 두고 파일만 남겼다.
 *
 * ⚠️ 아래 주석들은 **살아 있는 API 처럼** 쓰여 있다. 파일을 직접 연 사람이
 *    반대로 읽지 않도록 이 묘비를 맨 위에 둔다 (2026-08-29).
 */
import { Router } from "express";
import { DEFAULT_DETOUR_RADIUS_KM } from "@onedal/shared";
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
            detourRadiusKm: f.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM,
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
