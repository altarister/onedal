import { Router } from "express";
import type { SimplifiedOfficeOrder, ScreenContextType } from "@onedal/shared";
import db from "../db";
import { getUserSession } from "../state/userSessionStore";
import { touchDeviceSession } from "./devices";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { dbQueue } from "../utils/dbQueue";

const router = Router();

// POST: 탈락 콜 빅데이터 수신 (오답노트용) 및 하트비트
router.post("/", (req, res) => {
    try {
        const { data, deviceId, screenContext } = req.body as {
            data: SimplifiedOfficeOrder[],
            deviceId?: string,
            screenContext?: ScreenContextType  // [Safety Mode V3] 앱폰 화면 상태
        };

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: "data 배열이 필요합니다" });
        }

        // 1. 단말기(deviceId) 정보를 기반으로 소유주(userId) 역산
        let userId = "ADMIN_USER";
        if (deviceId) {
            const deviceRow = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(deviceId) as { user_id: string } | undefined;
            if (deviceRow) {
                userId = deviceRow.user_id;
            }
        }

        const timestamp = new Date().toISOString();
        
        // 2. 비동기 Write Queue를 통해 밀려들어오는 데이터를 오류 없이 INSERT
        data.forEach(item => {
            dbQueue.runAsync(
                "INSERT INTO intel (user_id, device_id, type, pickup, dropoff, fare, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
                userId === "ADMIN_USER" ? null : userId,
                deviceId || null,
                "INTEL_BULK",
                item.pickup,
                item.dropoff,
                item.fare || 0,
                timestamp
            );
        });

        // 비동기 큐이므로 정확한 즉시 개수 파악은 어렵지만 대략적으로 제공
        const countStmt = db.prepare("SELECT COUNT(*) as count FROM intel");
        const totalScrap = (countStmt.get() as { count: number })?.count || 0;

        console.log(`📊 [스크랩 데이터 수신] User: ${userId} (${deviceId}) | ${data.length}항목 적재 중${screenContext ? ` [화면: ${screenContext}]` : ''}`);
        logRoadmapEvent("서버", `[HTTP 폴링] POST /api/scrap (User: ${userId})`);
        
        // 3. 디바이스 생존 신고 및 화면 상태 동기화
        let deviceMode = "MANUAL";
        if (deviceId) {
            const io = req.app.get("io");
            deviceMode = touchDeviceSession(deviceId, data.length, screenContext, io);
        }

        const session = getUserSession(userId);

        // 4. 응답 (해당 유저의 필터값 및 제어 명령 송신)
        res.json({
            apiStatus: {
                success: true,
                totalItems: totalScrap
            },
            deviceControl: {
                mode: deviceMode
            },
            dispatchEngineArgs: session.activeFilter
        });
    } catch (error) {
        console.error("Scrap POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// GET: 스크랩 데이터 조회 (TODO: 차후 어드민/개인용 분리 필요)
router.get("/", (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM intel ORDER BY timestamp DESC LIMIT 500"); // 성능상 500개 제한
        const scrapData = stmt.all() as SimplifiedOfficeOrder[];

        res.json({ scrapData, total: scrapData.length });
    } catch (error) {
        console.error("Scrap GET 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;

