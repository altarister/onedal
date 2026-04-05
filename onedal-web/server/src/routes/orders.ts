/**
 * /api/orders 라우터
 * 
 * 다이어그램 대응:
 * - POST /api/orders       : 레거시 콜 수신 (유지)
 * - GET  /api/orders       : 대시보드 새로고침 시 기존 콜 목록
 * - POST /api/orders/confirm : 1차 선빵(BASIC) — 즉시 응답
 * 
 * ※ DETAILED(2차 상세보고)는 /api/orders/detail (detail.ts) 로 분리됨
 * ※ decision(관제사 판정)은 Socket.io 이벤트 `decision`으로 이관됨 (index.ts)
 */

import { Router } from "express";
import crypto from "crypto";
import type { SimplifiedOfficeOrder, DispatchConfirmRequest, SecuredOrder } from "@onedal/shared";
import db from "../db";
import { activeFilterConfig, updateActiveFilter } from "../state/filterStore";

const router = Router();

// POST: 스캐너에서 콜 수신 (레거시 호환용)
router.post("/", (req, res) => {
    try {
        if (!req.body) {
            return res.status(400).json({ error: "잘못된 JSON 페이로드 형식입니다." });
        }
        
        const { type, pickup, dropoff, fare, timestamp } = req.body as SimplifiedOfficeOrder;

        if (!pickup || !dropoff) {
            return res.status(400).json({ error: "필수 데이터(pickup, dropoff)가 누락되었습니다" });
        }

        type DbOrderRow = SimplifiedOfficeOrder & { status: string };

        const newOrder: DbOrderRow = {
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
        type DbOrderRow = SimplifiedOfficeOrder & { status: string };
        const rows = stmt.all() as DbOrderRow[];

        res.json({ orders: rows });
    } catch (error) {
        console.error("Orders GET 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// POST /confirm: 1차 선빵 (BASIC) — 즉시 응답
// 다이어그램 Line 58~62 대응
router.post("/confirm", (req, res) => {
    try {
        const payload = req.body as DispatchConfirmRequest;

        if (payload.step !== 'BASIC') {
            return res.status(400).json({ error: "이 엔드포인트는 step=BASIC 전용입니다. 상세 보고는 POST /api/orders/detail 을 사용하세요." });
        }

        // 즉시 응답 (앱은 멈추지 않고 상세 페이지 긁으러 진입해야 함)
        res.json({ success: true, message: "1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요." });

        const securedOrder: SecuredOrder = {
            ...payload.order,
            status: 'evaluating_basic',
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString()
        };

        const io = req.app.get("io");
        if (io) {
            // UI를 '대기' 상태로 만들고 평가 카드를 올리라는 신호
            io.emit("order-evaluating", securedOrder);
            console.log(`⏱️ [1차 선빵 수신] ${securedOrder.pickup} ➡️ ${securedOrder.dropoff} (기기: ${payload.deviceId})`);

            // 중앙 통제 필터를 '대기' 모드로 전환 후 브로드캐스트
            if (activeFilterConfig.mode === '첫짐') {
                updateActiveFilter({ mode: '대기' });
                io.emit("filter-updated", activeFilterConfig);
            }
        }
    } catch (error) {
        console.error("Orders Confirm 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
