import { Router } from "express";
import db from "../db";

const router = Router();

// POST: 탈락 콜 빅데이터 수신 (오답노트용)
router.post("/", (req, res) => {
    try {
        const { texts } = req.body;

        if (!texts || !Array.isArray(texts)) {
            return res.status(400).json({ error: "texts 배열이 필요합니다" });
        }

        const timestamp = new Date().toISOString();

        const stmt = db.prepare("INSERT INTO intel (texts, timestamp) VALUES (?, ?)");
        stmt.run(JSON.stringify(texts), timestamp);

        const countStmt = db.prepare("SELECT COUNT(*) as count FROM intel");
        const totalIntel = (countStmt.get() as { count: number })?.count || 0;

        console.log(`📊 [인텔 데이터 수신] ${texts.length}항목 저장 (누적: ${totalIntel}건)`);

        res.json({ success: true, totalIntel });
    } catch (error) {
        console.error("Intel POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// GET: 인텔 데이터 조회
router.get("/", (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM intel ORDER BY timestamp DESC");
        const rows = stmt.all() as any[];

        const intelData = rows.map((row) => ({
            ...row,
            texts: JSON.parse(row.texts),
        }));

        res.json({ intelData, total: intelData.length });
    } catch (error) {
        console.error("Intel GET 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
