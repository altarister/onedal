import { Router } from "express";
import type { SimplifiedOfficeOrder } from "@onedal/shared";
import db from "../db";
import { activeFilterConfig } from "../state/filterStore";
import { touchDeviceSession } from "./devices";

const router = Router();

// POST: 탈락 콜 빅데이터 수신 (오답노트용) 및 하트비트
router.post("/", (req, res) => {
    try {
        const { data, deviceId } = req.body as { data: SimplifiedOfficeOrder[], deviceId?: string };

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: "data 배열이 필요합니다" });
        }

        const timestamp = new Date().toISOString();
        const stmt = db.prepare("INSERT INTO intel (type, pickup, dropoff, fare, timestamp) VALUES (?, ?, ?, ?, ?)");

        const insertMany = db.transaction((intelItems: SimplifiedOfficeOrder[]) => {
            for (const item of intelItems) {
                stmt.run("INTEL_BULK", item.pickup, item.dropoff, item.fare || 0, timestamp);
            }
        });

        insertMany(data);

        const countStmt = db.prepare("SELECT COUNT(*) as count FROM intel");
        const totalScrap = (countStmt.get() as { count: number })?.count || 0;

        console.log(`📊 [스크랩 데이터 수신] ${data.length}항목 저장 (누적: ${totalScrap}건)`);
        
        let deviceMode = "MANUAL";
        if (deviceId) {
            // Devices 세션 업데이트 (데드맨 스위치 생존 신고)
            deviceMode = touchDeviceSession(deviceId, data.length);
        }

        // [응답 꼬리(Piggyback)] 성공과 통계, 그리고 최신 서버 오더 필터를 앱폰에 즉시 내려준다
        res.json({ success: true, total: totalScrap, mode: deviceMode, filter: activeFilterConfig });
    } catch (error) {
        console.error("Scrap POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// GET: 스크랩 데이터 조회
router.get("/", (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM intel ORDER BY timestamp DESC");
        const scrapData = stmt.all() as SimplifiedOfficeOrder[];

        res.json({ scrapData, total: scrapData.length });
    } catch (error) {
        console.error("Scrap GET 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
