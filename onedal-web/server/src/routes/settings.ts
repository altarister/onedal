import { Router } from "express";
import { DEFAULT_WAIT_TIMES, waitSecOrNull } from "@onedal/shared";
import db from "../db";
import { updateActiveFilter } from "../state/filterManager";
import { requireAuth } from "../middlewares/authMiddleware";
import { geocodeAddress } from "../services/kakaoService";
import { getGroupedRegionsByCity } from "../geoResolver";
import { saveBaseFilter } from "../state/filterManager";
import { getUserSession } from "../state/userSessionStore";
import { recalculateDetourFilter } from "../services/dispatchEngine";
import { getCityRegionsWithRadius, getSelectableCities } from "../services/geoService";

const router = Router();

// 사용자의 설정 조회
router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        
        // [중요] 조회 전에 세션을 먼저 가져와서, 신규 유저인 경우 DB에 권장 기본값을 강제 생성하게 함
        getUserSession(userId);

        // ④ 철거 — 노선·반경은 🔍 필터(user_filters)가 원천이라 여기서 안 내린다
        let row = db.prepare(`
            SELECT s.*, f.is_active
            FROM user_settings s
            LEFT JOIN user_filters f ON s.user_id = f.user_id
            WHERE s.user_id = ?
        `).get(userId) as any;

        if (!row) {
            db.prepare("INSERT INTO user_settings (user_id) VALUES (?)").run(userId);
            row = db.prepare(`
                SELECT s.*, f.is_active
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
            // 좌표도 함께 내린다 — GPS 가 없을 때 관제웹 지도·TSP 의 출발점으로 쓴다.
            homeX: row.home_x || null,
            homeY: row.home_y || null,
            alarmVolume: row.alarm_volume ?? 50,
            pickerAlarmMinFare: row.picker_alarm_min_fare ?? 10000,
            /* ⏱️ «주행·정차»로 굳는 초 — 모의 주행에서는 줄여 쓴다 (화면규칙 S16) */
            motionHoldSec: row.motion_hold_sec ?? 10,
            /* ⏱️ 배차망별 대기 시간 — 인성·화물24시 안전취소 · 픽커 상세 */
            safeCancelSecInsung: row.safe_cancel_sec_insung ?? DEFAULT_WAIT_TIMES.safeCancelSecInsung,
            safeCancelSecHwamul24: row.safe_cancel_sec_hwamul24 ?? DEFAULT_WAIT_TIMES.safeCancelSecHwamul24,
            pickerAlarmDetailSec: row.picker_alarm_detail_sec ?? DEFAULT_WAIT_TIMES.pickerAlarmDetailSec,
            isActive: Boolean(row.is_active),
        });
    } catch (e) {
        console.error("Settings GET 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

// 주소 → 좌표 검증 API (저장 전 미리보기용)
router.get("/geocode", requireAuth, async (req, res) => {
    try {
        const address = req.query.address as string;
        if (!address || address.trim().length < 2) {
            res.status(400).json({ error: "주소를 입력해주세요." });
            return;
        }

        const coords = await geocodeAddress(address.trim());
        if (!coords || !coords.x || !coords.y) {
            res.status(404).json({ error: "주소를 찾을 수 없습니다. 정확한 주소를 입력해주세요." });
            return;
        }

        console.log(`📍 [주소 검증] ${address} → (${coords.x}, ${coords.y})`);
        res.json({ x: coords.x, y: coords.y, address: address.trim() });
    } catch (e) {
        console.error("주소 검증 에러:", e);
        res.status(500).json({ error: "주소 검색에 실패했습니다. 잠시 후 다시 시도해주세요." });
    }
});

// 사용자의 설정 변경
router.put("/", requireAuth, async (req, res) => {
    try {
        const userId = req.user!.id;
        const payload = req.body;

        // 🪦 car_type 은 죽은 두 벌이라 DROP 됐다 — 차종의 원천은 vehicle_type 하나 (전수조사)
        const updateStmt = db.prepare(`
            UPDATE user_settings
            SET vehicle_type = COALESCE(@vehicleType, vehicle_type),
                car_fuel = COALESCE(@carFuel, car_fuel),
                car_hipass = COALESCE(@carHipass, car_hipass),
                fuel_price = COALESCE(@fuelPrice, fuel_price),
                fuel_efficiency = COALESCE(@fuelEfficiency, fuel_efficiency),
                default_priority = COALESCE(@defaultPriority, default_priority),
                avoid_toll = COALESCE(@avoidToll, avoid_toll),
                alarm_volume = COALESCE(@alarmVolume, alarm_volume),
                motion_hold_sec = COALESCE(@motionHoldSec, motion_hold_sec),
                picker_alarm_min_fare = COALESCE(@pickerAlarmMinFare, picker_alarm_min_fare),
                safe_cancel_sec_insung = COALESCE(@safeCancelSecInsung, safe_cancel_sec_insung),
                safe_cancel_sec_hwamul24 = COALESCE(@safeCancelSecHwamul24, safe_cancel_sec_hwamul24),
                picker_alarm_detail_sec = COALESCE(@pickerAlarmDetailSec, picker_alarm_detail_sec)
            WHERE user_id = @userId
        `);

        const result = updateStmt.run({
            userId,
            vehicleType: payload.vehicleType ?? null,
            carFuel: payload.carFuel ?? null,
            carHipass: payload.carHipass !== undefined ? (payload.carHipass ? 1 : 0) : null,
            fuelPrice: payload.fuelPrice ?? null,
            fuelEfficiency: payload.fuelEfficiency ?? null,
            defaultPriority: payload.defaultPriority ?? null,
            avoidToll: payload.avoidToll !== undefined ? (payload.avoidToll ? 1 : 0) : null,
            alarmVolume: payload.alarmVolume ?? null,
            pickerAlarmMinFare: payload.pickerAlarmMinFare ?? null,
            motionHoldSec: payload.motionHoldSec ?? null,
            safeCancelSecInsung: waitSecOrNull(payload.safeCancelSecInsung),
            safeCancelSecHwamul24: waitSecOrNull(payload.safeCancelSecHwamul24),
            pickerAlarmDetailSec: waitSecOrNull(payload.pickerAlarmDetailSec)
        });

        if (result.changes === 0) {
            db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)").run(userId);
            updateStmt.run({
                userId,
                vehicleType: payload.vehicleType ?? null,
                carFuel: payload.carFuel ?? null,
                carHipass: payload.carHipass !== undefined ? (payload.carHipass ? 1 : 0) : null,
                fuelPrice: payload.fuelPrice ?? null,
                fuelEfficiency: payload.fuelEfficiency ?? null,
                defaultPriority: payload.defaultPriority ?? null,
                avoidToll: payload.avoidToll !== undefined ? (payload.avoidToll ? 1 : 0) : null,
                alarmVolume: payload.alarmVolume ?? null,
                motionHoldSec: payload.motionHoldSec ?? null,
                // 🔴 UPDATE 문이 부르는 이름은 전부 실어야 한다 — 빠지면 설정 행이 없던 계정의 첫 저장이 통째로 실패한다
                pickerAlarmMinFare: payload.pickerAlarmMinFare ?? null,
                safeCancelSecInsung: waitSecOrNull(payload.safeCancelSecInsung),
                safeCancelSecHwamul24: waitSecOrNull(payload.safeCancelSecHwamul24),
                pickerAlarmDetailSec: waitSecOrNull(payload.pickerAlarmDetailSec)
            });
        }

        // homeAddress 지오코딩 + 별도 저장
        if (payload.homeAddress !== undefined) {
            // 프론트에서 미리 검증된 좌표가 함께 왔으면 카카오 API 재호출 없이 바로 저장
            if (payload.homeX && payload.homeY && payload.homeX !== 0 && payload.homeY !== 0) {
                db.prepare(`UPDATE user_settings SET home_address = ?, home_x = ?, home_y = ? WHERE user_id = ?`)
                    .run(payload.homeAddress, payload.homeX, payload.homeY, userId);
                console.log(`🏠 [집 주소 저장] ${payload.homeAddress} → (${payload.homeX}, ${payload.homeY}) [미리검증 좌표 사용]`);
            } else {
                // 하위 호환: 좌표 없이 주소만 온 경우 서버에서 지오코딩 시도
                try {
                    const coords = await geocodeAddress(payload.homeAddress);
                    if (coords?.x && coords?.y) {
                        db.prepare(`UPDATE user_settings SET home_address = ?, home_x = ?, home_y = ? WHERE user_id = ?`)
                            .run(payload.homeAddress, coords.x, coords.y, userId);
                        console.log(`🏠 [집 주소 저장] ${payload.homeAddress} → (${coords.x}, ${coords.y}) [서버 지오코딩]`);
                    } else {
                        console.error("🏠 집 주소 지오코딩 실패: 좌표를 찾을 수 없음");
                        // 좌표 변환 실패 시 주소만이라도 저장 (기존 좌표 유지)
                        db.prepare(`UPDATE user_settings SET home_address = ? WHERE user_id = ?`)
                            .run(payload.homeAddress, userId);
                    }
                } catch (e) {
                    console.error("🏠 집 주소 지오코딩 실패:", e);
                    db.prepare(`UPDATE user_settings SET home_address = ? WHERE user_id = ?`)
                        .run(payload.homeAddress, userId);
                }
            }
        }


        // 🎛️ 콜 필터 켬/끔(isActive)은 기기 모드(AUTO/MANUAL)가 유일한 원천이라 여기서 다루지 않는다

        // 클라이언트(내 차 패널 등)가 실시간으로 갱신될 수 있도록 소켓 이벤트 발송
        req.app.get("io").to(userId).emit("settings-updated", payload);

        // 🔴 DB 만 쓰고 끝내지 않는다 — 세션의 userVehicleType 은 로그인 때 한 번만 읽으므로, 여기서 바꾸지 않으면
        //    필터는 옛 차종으로, 카카오 경로는 새 차종으로 계산해 같은 순간에 두 값이 달라진다.
        //    관제탑에는 `settings-updated` 로 알린다.

        const io = req.app.get("io");
        if (payload.vehicleType) {
            const session = getUserSession(userId);

            if (session.userVehicleType !== payload.vehicleType) {

                console.log(`🚚 [설정 변경] 차종 ${session.userVehicleType} → ${payload.vehicleType} — 필터 재파생`);

                session.userVehicleType = payload.vehicleType;

                // allowedVehicleTypes 는 filterManager 가 차종·적재 상태에서 다시 파생시킨다

                updateActiveFilter(userId, {}, io);

            }

        }

        io?.to(userId).emit("settings-updated", payload);


        res.json({ success: true, message: "Settings updated successfully" });
    } catch (e) {
        console.error("Settings PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

/**
 * 도착 목표로 **고를 수 있는 시/군 목록**.
 *
 * 🔴 **화면들이 같은 목록을 쓴다** — 목록의 출처는 지도 데이터 하나뿐이다. 화면마다 따로 받으면
 *    저장값(`파주`)이 목록(`파주시`)에 없어 `<select>` 가 조용히 첫 항목을 보여준다.
 *
 * ⚠️ 지금 지도 데이터는 **수도권 · 충청권**(서울·인천·경기·대전·세종·충북·충남)만 있다. 그 밖은 고를 수 없다 —
 *    없는 지역을 목록에 넣으면 0개짜리 필터가 되어 콜 잡기가 조용히 멈춘다.
 */
router.get("/cities", requireAuth, (_req, res) => {
    try {
        res.json({ groups: getSelectableCities() });
    } catch (e) {
        console.error("Cities 에러:", e);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// [신규] 지역명 타이핑 시 실시간으로 세부 지역 목록을 미리보기 위해 제공하는 API
router.get("/preview-regions", requireAuth, (req, res) => {
    try {
        const city = req.query.city as string;
        const destinationRadiusKm = req.query.destinationRadiusKm ? parseFloat(req.query.destinationRadiusKm as string) : 0;
        
        if (!city) {
            return res.status(400).json({ error: "도시명(city) 파라미터가 필요합니다." });
        }

        const { grouped: groupedRegions } = getCityRegionsWithRadius(city, destinationRadiusKm);

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

// 합짐 모드: 경유 반경 변경 시 지역 목록 프리뷰
router.get("/preview-detour", requireAuth, (req, res) => {
    try {
        const userId = req.user!.id;
        const parsedDetour = parseFloat(req.query.detourRadiusKm as string);
        const detourRadiusKm = isNaN(parsedDetour) ? 10 : parsedDetour;
        const destinationRadiusKm = req.query.destinationRadiusKm
            ? parseFloat(req.query.destinationRadiusKm as string)
            : undefined;

        const result = recalculateDetourFilter(userId, detourRadiusKm, destinationRadiusKm);
        if (result) {
            res.json({
                totalCount: result.destinationKeywords.length,
                groupedRegions: result.destinationGroups
            });
        } else {
            res.json({ totalCount: 0, groupedRegions: {} });
        }
    } catch (e) {
        console.error("Preview Detour 에러:", e);
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
        
        // [중요] 조회 전에 세션을 먼저 가져와서, 신규 유저인 경우 DB에 권장 기본값(3만/100만/10km)을 강제 생성하게 함
        getUserSession(userId);

        // ④ 철거 — 콜할인율·반경은 🔍 필터(user_filters)가 원천이라 여기 없다.
        //    남는 것: 금액 축의 원천(단가표·수수료)과 블랙리스트, 보류 칸(min/max_fare)
        const row = db.prepare(
            "SELECT vehicle_rates, agency_fee_percent, excluded_keywords, min_fare, max_fare FROM user_filters WHERE user_id = ?"
        ).get(userId) as any;

        const defaultRates: Record<string, number> = {
            "오토바이": 700, "다마스": 800, "라보": 900, "승용차": 900,
            "1t": 1000, "1.4t": 1100, "2.5t": 1200, "3.5t": 1300,
            "5t": 1500, "11t": 2000, "25t": 2500, "특수화물": 3000
        };

        res.json({
            vehicleRates: row?.vehicle_rates ? JSON.parse(row.vehicle_rates) : defaultRates,
            agencyFeePercent: row?.agency_fee_percent ?? 23,
            excludedKeywords: row?.excluded_keywords ? JSON.parse(row.excluded_keywords) : [],
            minFare: row?.min_fare ?? 0,
            maxFare: row?.max_fare ?? 1000000,
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
        // ④ 철거 — 콜할인율(maxDiscountPercent)·반경·블랙리스트는 🔍 필터가 원천이라 받지 않는다
        const { vehicleRates, agencyFeePercent, minFare, maxFare } = req.body;

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
        if (updates.length > 0) {
            db.prepare(`UPDATE user_filters SET ${updates.join(", ")} WHERE user_id = @userId`).run(params);
        }

        // 메모리 세션 동기화 및 소켓 푸시 (OrderFilterStatus.tsx 즉각 갱신용)
        const filterChanges: any = {};
        if (minFare !== undefined) filterChanges.minFare = minFare;
        if (maxFare !== undefined) filterChanges.maxFare = maxFare;

        const io = req.app.get("io");
        if (Object.keys(filterChanges).length > 0) {
            saveBaseFilter(userId, filterChanges, io);
        }

        /**
         * 🔴 **요율·수수료는 앱이 콜을 거르는 단가표(`ratePerKm`)의 원천이다**.
         *    위 UPDATE 는 DB 만 고치고, `saveBaseFilter` 도 `activeFilter` 는 일부러 안 건드린다.
         *    여기서 파생을 다시 만들지 않으면 **설정 화면엔 새 값이 뜨는데 앱에는 옛 단가가
         *    계속 내려간다** — 집는 콜의 범위가 옛 요율로 굳는다.
         *    표는 `filterManager` 가 만든다 — 여기서 직접 만들지 않는다 (규칙 ③).
         */
        if (vehicleRates !== undefined || agencyFeePercent !== undefined) {
            updateActiveFilter(userId, {}, io);
        }

        console.log(`💰 [요율 설정 저장] userId: ${userId}, 수수료: ${agencyFeePercent}%`);
        res.json({ success: true });
    } catch (e) {
        console.error("Pricing PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
