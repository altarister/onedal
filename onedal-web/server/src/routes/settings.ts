import { Router } from "express";
import db from "../db";
import { requireAuth } from "../middlewares/authMiddleware";
import { geocodeAddress } from "../services/kakaoService";
import { getGroupedRegionsByCity } from "../geoResolver";
import { applyFilter } from "../state/filterManager";

const router = Router();

// 사용자의 설정 조회
router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        let row = db.prepare(`
            SELECT s.*, f.destination_city, f.destination_radius_km, f.corridor_radius_km 
            FROM user_settings s 
            LEFT JOIN user_filters f ON s.user_id = f.user_id 
            WHERE s.user_id = ?
        `).get(userId) as any;
        
        if (!row) {
            db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
            row = db.prepare(`
                SELECT s.*, f.destination_city, f.destination_radius_km, f.corridor_radius_km 
                FROM user_settings s 
                LEFT JOIN user_filters f ON s.user_id = f.user_id 
                WHERE s.user_id = ?
            `).get(userId) as any;
        }

        res.json({
            vehicleType: row.vehicle_type || '1t',
            carFuel: row.car_fuel,
            carHipass: !!row.car_hipass,
            fuelPrice: row.fuel_price,
            fuelEfficiency: row.fuel_efficiency,
            defaultPriority: row.default_priority,
            avoidToll: !!row.avoid_toll,
            homeAddress: row.home_address || '',
            alarmVolume: row.alarm_volume ?? 50,
            destinationCity: row.destination_city || '',
            destinationRadiusKm: row.destination_radius_km,
            corridorRadiusKm: row.corridor_radius_km,
        });
    } catch (e) {
        console.error("Settings GET 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

// 사용자의 설정 변경
router.put("/", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const payload = req.body;

        const updateStmt = db.prepare(`
            UPDATE user_settings 
            SET car_type = COALESCE(@carType, car_type),
                vehicle_type = COALESCE(@vehicleType, vehicle_type),
                car_fuel = COALESCE(@carFuel, car_fuel),
                car_hipass = COALESCE(@carHipass, car_hipass),
                fuel_price = COALESCE(@fuelPrice, fuel_price),
                fuel_efficiency = COALESCE(@fuelEfficiency, fuel_efficiency),
                default_priority = COALESCE(@defaultPriority, default_priority),
                avoid_toll = COALESCE(@avoidToll, avoid_toll),
                alarm_volume = COALESCE(@alarmVolume, alarm_volume)
            WHERE user_id = @userId
        `);
        
        const result = updateStmt.run({
            userId,
            carType: payload.carType ?? null,
            vehicleType: payload.vehicleType ?? null,
            carFuel: payload.carFuel ?? null,
            carHipass: payload.carHipass !== undefined ? (payload.carHipass ? 1 : 0) : null,
            fuelPrice: payload.fuelPrice ?? null,
            fuelEfficiency: payload.fuelEfficiency ?? null,
            defaultPriority: payload.defaultPriority ?? null,
            avoidToll: payload.avoidToll !== undefined ? (payload.avoidToll ? 1 : 0) : null,
            alarmVolume: payload.alarmVolume ?? null
        });

        if (result.changes === 0) {
            db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(userId);
            updateStmt.run({
                userId,
                carType: payload.carType ?? null,
                vehicleType: payload.vehicleType ?? null,
                carFuel: payload.carFuel ?? null,
                carHipass: payload.carHipass !== undefined ? (payload.carHipass ? 1 : 0) : null,
                fuelPrice: payload.fuelPrice ?? null,
                fuelEfficiency: payload.fuelEfficiency ?? null,
                defaultPriority: payload.defaultPriority ?? null,
                avoidToll: payload.avoidToll !== undefined ? (payload.avoidToll ? 1 : 0) : null,
                alarmVolume: payload.alarmVolume ?? null
            });
        }

        // homeAddress 지오코딩 + 별도 저장
        if (payload.homeAddress !== undefined) {
            try {
                const coords = await geocodeAddress(payload.homeAddress);
                db.prepare(`UPDATE user_settings SET home_address = ?, home_x = ?, home_y = ? WHERE user_id = ?`)
                    .run(payload.homeAddress, coords?.x || 0, coords?.y || 0, userId);
                console.log(`🏠 [집 주소 저장] ${payload.homeAddress} → (${coords?.x}, ${coords?.y})`);
            } catch (e) {
                console.error("🏠 집 주소 지오코딩 실패:", e);
                // 좌표 없이 주소만 저장
                db.prepare(`UPDATE user_settings SET home_address = ? WHERE user_id = ?`)
                    .run(payload.homeAddress, userId);
            }
        }

        // 차량 종류 변경 시 현재 상태가 EMPTY라면 필터 허용 차종 자동 갱신
        if (payload.vehicleType) {
            const { getUserSession } = require('../state/userSessionStore');
            const session = getUserSession(userId);
            if (!session.activeFilter.loadState || session.activeFilter.loadState === 'EMPTY') {
                const { getSharedModeVehicleTypes } = require('@onedal/shared');
                applyFilter(userId, { allowedVehicleTypes: getSharedModeVehicleTypes(payload.vehicleType) }, req.app.get("io"));
                console.log(`🚛 [차량 변경] 기본 필터 차종을 ${payload.vehicleType} 기준 하위 차종으로 자동 갱신했습니다.`);
            }
        }

        // 내 노선 설정 (user_filters) 동시 업데이트
        const filterChanges: any = {};
        if (payload.destinationCity !== undefined) filterChanges.destinationCity = payload.destinationCity;
        if (payload.destinationRadiusKm !== undefined) filterChanges.destinationRadiusKm = payload.destinationRadiusKm;
        if (payload.corridorRadiusKm !== undefined) filterChanges.corridorRadiusKm = payload.corridorRadiusKm;

        if (Object.keys(filterChanges).length > 0) {
            applyFilter(userId, filterChanges, req.app.get("io"), true);
        }

        // 클라이언트(내 차 패널 등)가 실시간으로 갱신될 수 있도록 소켓 이벤트 발송
        req.app.get("io").to(userId).emit("settings-updated", payload);

        res.json({ success: true, message: "Settings updated successfully" });
    } catch (e) {
        console.error("Settings PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

// [신규] 지역명 타이핑 시 실시간으로 세부 지역 목록을 미리보기 위해 제공하는 API
router.get("/preview-regions", requireAuth, (req, res) => {
    try {
        const city = req.query.city as string;
        if (!city) {
            return res.status(400).json({ error: "도시명(city) 파라미터가 필요합니다." });
        }
        
        const groupedRegions = getGroupedRegionsByCity(city);
        
        // 총 키워드 수 계산
        let totalCount = 0;
        for (const dongs of Object.values(groupedRegions)) {
            totalCount += dongs.length;
        }

        res.json({
            city,
            totalCount,
            groupedRegions
        });
    } catch (e) {
        console.error("Preview Regions 에러:", e);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// ═══════════════════════════════════════
// 요율/필터 설정 (탭2) 전용 API
// ═══════════════════════════════════════

// 요율 설정 조회
router.get("/pricing", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const row = db.prepare(
            "SELECT vehicle_rates, agency_fee_percent, max_discount_percent, excluded_keywords, min_fare, max_fare, pickup_radius_km FROM user_filters WHERE user_id = ?"
        ).get(userId) as any;

        const defaultRates: Record<string, number> = {
            "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
            "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
            "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
        };

        res.json({
            vehicleRates: row?.vehicle_rates ? JSON.parse(row.vehicle_rates) : defaultRates,
            agencyFeePercent: row?.agency_fee_percent ?? 23,
            maxDiscountPercent: row?.max_discount_percent ?? 10,
            excludedKeywords: row?.excluded_keywords ? JSON.parse(row.excluded_keywords) : [],
            minFare: row?.min_fare || 0,
            maxFare: row?.max_fare || 1000000,
            pickupRadiusKm: row?.pickup_radius_km || 999,
        });
    } catch (e) {
        console.error("Pricing GET 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

// 요율 설정 저장
router.put("/pricing", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const { vehicleRates, agencyFeePercent, maxDiscountPercent, excludedKeywords, minFare, maxFare, pickupRadiusKm } = req.body;

        db.prepare("INSERT OR IGNORE INTO user_filters (user_id) VALUES (?)").run(userId);

        const updates: string[] = [];
        const params: any = { userId };

        if (vehicleRates !== undefined) {
            updates.push("vehicle_rates = @vehicleRates");
            params.vehicleRates = JSON.stringify(vehicleRates);
        }
        if (agencyFeePercent !== undefined) {
            updates.push("agency_fee_percent = @agencyFeePercent");
            params.agencyFeePercent = agencyFeePercent;
        }
        if (maxDiscountPercent !== undefined) {
            updates.push("max_discount_percent = @maxDiscountPercent");
            params.maxDiscountPercent = maxDiscountPercent;
        }
        if (updates.length > 0) {
            db.prepare(`UPDATE user_filters SET ${updates.join(", ")} WHERE user_id = @userId`).run(params);
        }

        // 메모리 세션 동기화 및 소켓 푸시 (OrderFilterStatus.tsx 즉각 갱신용)
        const filterChanges: any = {};
        if (minFare !== undefined) filterChanges.minFare = minFare;
        if (maxFare !== undefined) filterChanges.maxFare = maxFare;
        if (pickupRadiusKm !== undefined) filterChanges.pickupRadiusKm = pickupRadiusKm;
        if (excludedKeywords !== undefined) filterChanges.excludedKeywords = excludedKeywords;
        
        if (Object.keys(filterChanges).length > 0) {
            applyFilter(userId, filterChanges, req.app.get("io"), true);
        }

        console.log(`💰 [요율 설정 저장] userId: ${userId}, 수수료: ${agencyFeePercent}%, 할인: ${maxDiscountPercent}%`);
        res.json({ success: true });
    } catch (e) {
        console.error("Pricing PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
