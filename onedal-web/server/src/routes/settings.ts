import { Router } from "express";
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

        // ④ 철거 — 노선·반경은 국면 탭(user_filter_phases)이 원천이라 여기서 안 내린다
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
            // [2026-08-12] 좌표도 함께 내린다 — GPS 가 없을 때 관제웹 지도·TSP 의 출발점으로 쓴다.
            // 예전에는 관제웹이 좌표를 코드에 박아 두고 있었다 (주석엔 "판교"라 적혀 있었는데 실은 집 주소였다)
            homeX: row.home_x || null,
            homeY: row.home_y || null,
            alarmVolume: row.alarm_volume ?? 50,
            pickerAlarmMinFare: row.picker_alarm_min_fare ?? 10000,
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

        // 🪦 car_type 은 죽은 두 벌이라 DROP 됐다 — 차종의 원천은 vehicle_type 하나 (전수조사 2026-08-21)
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
                picker_alarm_min_fare = COALESCE(@pickerAlarmMinFare, picker_alarm_min_fare)
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
            pickerAlarmMinFare: payload.pickerAlarmMinFare ?? null
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
                alarmVolume: payload.alarmVolume ?? null
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


        // 자동 콜 잡기 스위치(isActive)만 user_filters 로 — 노선·반경 편집 자리는 국면 탭 하나 (④ 철거)
        const filterChanges: any = {};
        if (payload.isActive !== undefined) filterChanges.isActive = payload.isActive;

        if (Object.keys(filterChanges).length > 0) {
            saveBaseFilter(userId, filterChanges, req.app.get("io"));
        }

        // 클라이언트(내 차 패널 등)가 실시간으로 갱신될 수 있도록 소켓 이벤트 발송
        req.app.get("io").to(userId).emit("settings-updated", payload);

        // 🔴 [2026-08-10 전수조사] 예전에는 DB 만 쓰고 끝났다.

        // 세션의 userVehicleType 은 로그인 시 한 번만 읽으므로, 차종을 바꿔도

        // **필터는 옛 차종으로 계산**하고 있었다. 반면 카카오 경로는

        // SettingsRepository 가 DB 를 매번 읽어 **새 차종**을 썼다 —

        // 같은 순간에 두 값이 달랐던 것이다.

        // 그리고 관제탑은 `settings-updated` 를 듣고 있는데 **아무도 보내지 않았다.**

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
 * 🔴 2026-08-12 — 이 API 가 없어서 두 화면이 각자 다른 방식으로 도시를 받고 있었다.
 *    · 설정 > 요금 : 자유 입력 → `파주` 가 저장됨
 *    · 필터 모달   : 손으로 적은 7개 목록 → `파주시` 만 있음
 *    저장값이 목록에 없으니 브라우저가 조용히 **첫 항목(용인시)** 을 보여줬고,
 *    기사님은 필터가 용인인 줄 알고 계셨다. 서버는 `includes` 검색이라 파주로 잘 돌고 있었다.
 *
 *    → 두 화면이 **같은 목록**을 쓰게 한다. 목록의 출처는 지도 데이터 하나뿐이다.
 *
 * ⚠️ 지금 지도 데이터는 **수도권(서울·인천·경기)** 만 있다. 그 밖은 아직 고를 수 없다 —
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

        // ④ 철거 — 콜할인율·반경은 국면 탭(user_filter_phases)이 원천이라 여기 없다.
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
        // ④ 철거 — 콜할인율(maxDiscountPercent)·반경은 국면 탭이 원천이라 받지 않는다
        const { vehicleRates, agencyFeePercent, excludedKeywords, minFare, maxFare } = req.body;

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
        if (excludedKeywords !== undefined) filterChanges.excludedKeywords = excludedKeywords;

        if (Object.keys(filterChanges).length > 0) {
            saveBaseFilter(userId, filterChanges, req.app.get("io"));
        }

        console.log(`💰 [요율 설정 저장] userId: ${userId}, 수수료: ${agencyFeePercent}%`);
        res.json({ success: true });
    } catch (e) {
        console.error("Pricing PUT 에러:", e);
        res.status(500).json({ error: "서버 오류발생" });
    }
});

export default router;
