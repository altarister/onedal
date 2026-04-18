import { Router } from "express";
import db from "../db";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

// 사용자의 설정 조회
router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        let row = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId) as any;
        
        if (!row) {
            db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
            row = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId) as any;
        }

        res.json({
            carType: row.car_type,
            carFuel: row.car_fuel,
            carHipass: !!row.car_hipass,
            fuelPrice: row.fuel_price,
            fuelEfficiency: row.fuel_efficiency,
            defaultPriority: row.default_priority,
            avoidToll: !!row.avoid_toll
        });
    } catch (e) {
        console.error("Settings GET 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

// 사용자의 설정 변경
router.put("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const payload = req.body;

        const updateStmt = db.prepare(`
            UPDATE user_settings 
            SET car_type = COALESCE(@carType, car_type),
                car_fuel = COALESCE(@carFuel, car_fuel),
                car_hipass = COALESCE(@carHipass, car_hipass),
                fuel_price = COALESCE(@fuelPrice, fuel_price),
                fuel_efficiency = COALESCE(@fuelEfficiency, fuel_efficiency),
                default_priority = COALESCE(@defaultPriority, default_priority),
                avoid_toll = COALESCE(@avoidToll, avoid_toll)
            WHERE user_id = @userId
        `);
        
        const result = updateStmt.run({
            userId,
            carType: payload.carType ?? null,
            carFuel: payload.carFuel ?? null,
            carHipass: payload.carHipass !== undefined ? (payload.carHipass ? 1 : 0) : null,
            fuelPrice: payload.fuelPrice ?? null,
            fuelEfficiency: payload.fuelEfficiency ?? null,
            defaultPriority: payload.defaultPriority ?? null,
            avoidToll: payload.avoidToll !== undefined ? (payload.avoidToll ? 1 : 0) : null
        });

        if (result.changes === 0) {
            db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(userId);
            updateStmt.run({
                userId,
                carType: payload.carType ?? null,
                carFuel: payload.carFuel ?? null,
                carHipass: payload.carHipass !== undefined ? (payload.carHipass ? 1 : 0) : null,
                fuelPrice: payload.fuelPrice ?? null,
                fuelEfficiency: payload.fuelEfficiency ?? null,
                defaultPriority: payload.defaultPriority ?? null,
                avoidToll: payload.avoidToll !== undefined ? (payload.avoidToll ? 1 : 0) : null
            });
        }

        res.json({ success: true, message: "Settings updated successfully" });
    } catch (e) {
        console.error("Settings PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
