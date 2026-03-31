import { Router } from "express";
import crypto from "crypto";
import type { OrderData } from "@onedal/shared";
import db from "../db";

const router = Router();

// POST: 스캐너에서 콜 수신
router.post("/", (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ error: "잘못된 JSON 페이로드 형식입니다." });
        }
        
        const { type, pickup, dropoff, fare, timestamp } = req.body as OrderData;

        if (!pickup || !dropoff) {
            return res.status(400).json({ error: "필수 데이터(pickup, dropoff)가 누락되었습니다" });
        }

        const newOrder: OrderData = {
            id: crypto.randomUUID(),
            type: type || "NEW_ORDER",
            pickup,
            dropoff,
            fare: fare || 0,
            timestamp: timestamp || new Date().toISOString(),
            status: "pending",
        };

        // DB에 저장
        const stmt = db.prepare(
            "INSERT INTO orders (id, type, pickup, dropoff, fare, timestamp, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        stmt.run(
            newOrder.id,
            newOrder.type,
            newOrder.pickup,
            newOrder.dropoff,
            newOrder.fare,
            newOrder.timestamp,
            newOrder.status
        );

        // Socket.io로 즉시 발송
        const io = req.app.get("io");
        if (io) {
            io.emit("new-order", newOrder);
            console.log(`🆕 [새 콜 수신 + 소켓 전송] ${pickup} ➡️ ${dropoff} (${fare}원)`);
        } else {
            console.log(`🆕 [새 콜 수신] ${pickup} ➡️ ${dropoff} (${fare}원) (소켓 전송 실패)`);
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
