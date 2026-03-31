import { Router } from "express";
import db from "../db";

const router = Router();

// POST: 스캐너에서 콜 수신
router.post("/", (req, res) => {
    try {
        const { texts } = req.body;

        if (!texts || !Array.isArray(texts)) {
            return res.status(400).json({ error: "texts 배열이 필요합니다" });
        }

        const newOrder = {
            id: crypto.randomUUID(),
            texts,
            timestamp: new Date().toISOString(),
            status: "pending",
        };

        // DB에 저장
        const stmt = db.prepare(
            "INSERT INTO orders (id, texts, timestamp, status) VALUES (?, ?, ?, ?)"
        );
        stmt.run(
            newOrder.id,
            JSON.stringify(newOrder.texts),
            newOrder.timestamp,
            newOrder.status
        );

        // Socket.io로 즉시 발송
        const io = req.app.get("io");
        if (io) {
            io.emit("new-order", newOrder);
            console.log(`🆕 [새 콜 수신 + 소켓 전송] ${texts.join(", ")}`);
        } else {
            console.log(`🆕 [새 콜 수신] ${texts.join(", ")} (소켓 전송 실패)`);
        }

        // 서버에 저장된 총 콜 수 반환
        const countStmt = db.prepare("SELECT COUNT(*) as count FROM orders");
        const totalOrders = (countStmt.get() as { count: number })?.count || 0;

        res.json({
            success: true,
            order: newOrder,
            totalOrders,
        });
    } catch (error) {
        console.error("Orders POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// GET: 대시보드 새로고침 시 기존 콜 목록 전달
router.get("/", (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM orders ORDER BY timestamp ASC");
        const rows = stmt.all() as any[];

        // DB에 저장된 문자열(JSON)을 다시 배열로 파싱
        const orders = rows.map((row) => ({
            ...row,
            texts: JSON.parse(row.texts),
        }));

        res.json({ orders });
    } catch (error) {
        console.error("Orders GET 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
