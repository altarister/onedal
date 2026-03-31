import { Router } from "express";
import db from "../db";

import { OrderData } from "../types";

const router = Router();

// POST: 스캐너에서 콜 수신
router.post("/", (req, res) => {
    try {
        const { type, origin, destination, price, timestamp } = req.body as OrderData;

        if (!origin || !destination) {
            return res.status(400).json({ error: "필수 데이터(origin, destination)가 누락되었습니다" });
        }

        const newOrder: OrderData = {
            id: crypto.randomUUID(),
            type: type || "NEW_ORDER",
            origin,
            destination,
            price: price || 0,
            timestamp: timestamp || new Date().toISOString(),
            status: "pending",
        };

        // DB에 저장
        const stmt = db.prepare(
            "INSERT INTO orders (id, type, origin, destination, price, timestamp, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        stmt.run(
            newOrder.id,
            newOrder.type,
            newOrder.origin,
            newOrder.destination,
            newOrder.price,
            newOrder.timestamp,
            newOrder.status
        );

        // Socket.io로 즉시 발송
        const io = req.app.get("io");
        if (io) {
            io.emit("new-order", newOrder);
            console.log(`🆕 [새 콜 수신 + 소켓 전송] ${origin} ➡️ ${destination} (${price}원)`);
        } else {
            console.log(`🆕 [새 콜 수신] ${origin} ➡️ ${destination} (${price}원) (소켓 전송 실패)`);
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
        const rows = stmt.all() as OrderData[];

        res.json({ orders: rows });
    } catch (error) {
        console.error("Orders GET 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
