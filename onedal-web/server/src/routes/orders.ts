/**
 * /api/orders 라우터
 *
 * 다이어그램 대응:
 * - GET  /api/orders       : 대시보드 새로고침 시 기존 콜 목록
 * - POST /api/orders/confirm : 1차 선점(BASIC) — 즉시 응답
 * - POST /api/orders/decision: 앱 직통 결재 (KEEP/CANCEL)
 *
 * ※ DETAILED(2차 상세보고)는 /api/orders/detail (detail.ts) 로 분리됨
 * ※ decision(관제사 판정)은 Socket.io 이벤트 `decision`으로 이관됨 (index.ts)
 * ※ 레거시 `POST /api/orders`(무인증·userId 없이 INSERT·전역 브로드캐스트)는
 *    소비처 0건 확인 후 제거됨 (Phase 0)
 */

import { Router } from "express";
import type { DispatchConfirmRequest, PendingOrder, OrderStatus } from "@onedal/shared";
import { RESTORABLE_STATUSES, IN_PROGRESS_STATUSES, restoreWindow, isEvaluating } from "@onedal/shared";
import db from "../db";
import { getUserSession } from "../state/userSessionStore";
import { forceCancelEvaluatingOrder, handleDecision } from "../services/dispatchEngine";
import { updateActiveFilter } from "../state/filterManager";
import { requireAuth } from "../middlewares/authMiddleware";
import { logRoadmapEvent } from "../utils/roadmapLogger";

const router = Router();

// GET: 대시보드 새로고침 시 기존 콜 목록 전달
router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        // 오늘 날짜(자정 이후)의 복구 대상 오더를 가져옴
        //
        // 🔴 상태를 손으로 나열하지 않는다 (2026-08-11).
        //    예전엔 ('ORDER_CONFIRMED','ORDER_COMPLETED') 뿐이라
        //    **상차한 콜(ORDER_PICKED_UP)과 하차한 콜(ORDER_DELIVERED)이 빠졌다.**
        //    새로고침하면 진행 중이던 콜과 완료됨 탭이 통째로 비었다.
        // [임시 · Phase 7 도입 시 삭제] 미완료 콜은 날짜 무관(3일 상한).
        // 복구 쿼리(restoreAndRecalculateSession)와 **같은 창**을 써야 한다 —
        // 어긋나면 소켓에는 있는데 HTTP 에는 없는 콜이 생겨 새로고침마다 깜빡인다.
        const { todayStartIso, unfinishedSinceIso } = restoreWindow(Date.now());

        const statusPlaceholders = RESTORABLE_STATUSES.map(() => '?').join(', ');
        const progressPlaceholders = IN_PROGRESS_STATUSES.map(() => '?').join(', ');
        const stmt = db.prepare(
            `SELECT * FROM orders
             WHERE userId = ? AND status IN (${statusPlaceholders})
               AND ( timestamp >= ?
                     OR (status IN (${progressPlaceholders}) AND timestamp >= ?) )
             ORDER BY timestamp ASC`
        );
        const rows = stmt.all(
            userId, ...RESTORABLE_STATUSES,
            todayStartIso,
            ...IN_PROGRESS_STATUSES, unfinishedSinceIso,
        );

        res.json({ orders: rows });
    } catch (error) {
        console.error("Orders GET 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// POST /confirm: 1차 선점 (BASIC) — 즉시 응답
// 다이어그램 Line 58~62 대응
router.post("/confirm", (req, res) => {
    try {
        const payload = req.body as DispatchConfirmRequest;

        if (payload.step !== 'BASIC') {
            return res.status(400).json({ error: "이 엔드포인트는 step=BASIC 전용입니다. 상세 보고는 POST /api/orders/detail 을 사용하세요." });
        }

        // [하드 락] 미등록 기기 차단
        if (!payload.deviceId) {
            return res.status(401).json({ error: "MISSING_DEVICE_ID" });
        }
        const deviceRow = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(payload.deviceId) as any;
        if (!deviceRow) {
            return res.status(401).json({ error: "UNREGISTERED_DEVICE", message: "미등록 기기입니다. PIN 연동을 먼저 진행해주세요." });
        }
        const userId = deviceRow.user_id;

        const io = req.app.get("io");

        // 즉시 응답 (앱은 멈추지 않고 상세 페이지 긁으러 진입해야 함)
        logRoadmapEvent("서버", "앱폰에게 상세 정보 스크래핑을 즉시 진행하라고 응답 전달");
        res.json({ success: true, message: "1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요." });
        const session = getUserSession(userId);

        const previousEvaluatingId = session.deviceEvaluatingMap.get(payload.deviceId);

        if (previousEvaluatingId && previousEvaluatingId !== payload.order.id && previousEvaluatingId !== "unknown") {
            const prevDecision = session.pendingDecisions.get(previousEvaluatingId);
            // 이미 KEEP 결재가 내려진 콜은 새 콜 진입 시에도 삭제하지 않음 (다중 배차 유지)
            if (!prevDecision || prevDecision.action !== 'KEEP') {
                console.log(`🧹 [자동 정리] 새 콜 진입 감지! 기존 평가 중이던 콜(${previousEvaluatingId}) 백그라운드 강제 취소`);
                forceCancelEvaluatingOrder(userId, previousEvaluatingId, io);
            }
        }

        console.log(`🛡️ [서버] /orders/confirm 수신 시: 다른 기기가 이미 잡았는지 스레드 락(Lock) 점검 완료. 진입 허용.`);
        if (payload.order.id && payload.order.id !== "unknown") {
            session.deviceEvaluatingMap.set(payload.deviceId, payload.order.id);
        }

        const pendingOrder: PendingOrder = {
            ...payload.order,
            status: 'ORDER_PRE_SECURED' as OrderStatus,
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString(),
            targetApp: (payload as any).targetApp || 'insung',   // 어느 배차망에서 온 콜인가 — 원장에 남긴다
        };

        if (pendingOrder.id && pendingOrder.id !== "unknown") {
            logRoadmapEvent("서버", "콜의 가확정 상태를 메모리에 캐싱 연산");
            session.pendingOrdersData.set(pendingOrder.id, pendingOrder);
        }

        if (io) {
            console.log(`📤 [Socket 푸시] order-evaluating (${pendingOrder.id})`);
            io.to(userId).emit("order-evaluating", pendingOrder);
            console.log(`⏱️ [1차 선점 수신] ${pendingOrder.pickup} ➡️ ${pendingOrder.dropoff} (기기: ${payload.deviceId})`);
            logRoadmapEvent("서버", "앱폰으로 부터 가로챈 '1차 오더 확정' 요청 받음");
            logRoadmapEvent("서버", "관제탑에게 이 콜을 선점했음(order-evaluating) 정보 전달");

            if (session.activeFilter.isActive) {
                updateActiveFilter(userId, { isActive: false }, io);
                console.log(`📤 [Socket 푸시] filter-updated (isActive: false)`);
                logRoadmapEvent("서버", "폰의 isHolding=true 기간 동안 다른 콜을 물지 않도록 필터 비활성 정보 전달");
            }

            /**
             * 🔴 **안전망은 조건 없이 건다** (2026-08-14).
             *
             * 예전에는 이 타이머가 바로 위 `if (session.activeFilter.isActive)` **안에** 있었다.
             * 그런데 그 블록은 자기가 `isActive` 를 끈다 — 즉 필터가 꺼진 채로 들어온 확정은
             * **안전망이 아예 안 걸렸다.** 앱이 리스트로 빠져나가면 관제탑 카드가 영원히 남고
             * `isActive` 도 꺼진 채라 콜 잡기가 통째로 멈춘다.
             * MANUAL 콜(기사님이 손으로 잡는 것)은 필터와 무관하게 들어오므로 특히 그랬다.
             *
             * 안전망이 **조건부면 안전망이 아니다.**
             *
             * ⚠️ 타이머는 **ID 를 저장해 취소 가능하게** 한다 (CLAUDE.md 규칙 ② 좀비 타이머).
             *    예전에는 저장하지 않아, 콜이 정상 처리된 뒤에도 30초 뒤 깨어나 사고를 쳤다.
             */
            const graceTimer = setTimeout(() => {
                session.activeTimers.delete(`presecured_${pendingOrder.id}`);
                const cached = session.pendingOrdersData.get(pendingOrder.id);
                // 🔴 여기도 상태 목록을 손으로 적고 있었다 (2026-08-14). `shared` 의
                //    `EVALUATING_STATUSES` 와 값이 같았지만, 한쪽만 늘어나면 갈라진다.
                if (cached && isEvaluating(cached.status)) {
                    console.log(`💀 [서버 안전취소 타이머] 30초 경과 강제 취소 (ID: ${pendingOrder.id}). 현재 상태: ${cached.status}`);
                    handleDecision(userId, pendingOrder.id, "SAFE_CANCEL", io);
                }
            }, 30000);
            session.activeTimers.set(`presecured_${pendingOrder.id}`, graceTimer);
            logRoadmapEvent("서버", "안전취소 30초 카운트다운 타이머 감시 연산 (취소 가능하게 등록)");
        }
    } catch (error) {
        console.error("Orders Confirm 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});
// POST /decision - 기사님의 앱 내 의사결정 수신 (수동 배차 최종 확정/취소)
router.post("/decision", async (req, res) => {
    try {
        const payload = req.body as { orderId: string, action: 'KEEP' | 'CANCEL', deviceId?: string };
        if (!payload.orderId || !payload.action) {
            return res.status(400).json({ error: "Missing orderId or action" });
        }

        const io = req.app.get("io");
        console.log(`⚖️ [REST Decision 수신] ID: ${payload.orderId}, Action: ${payload.action} (앱에서 직통)`);

        // [하드 락] 미등록 기기 차단
        if (!payload.deviceId) {
            return res.status(401).json({ error: "MISSING_DEVICE_ID" });
        }
        const deviceRow = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(payload.deviceId) as any;
        if (!deviceRow) {
            return res.status(401).json({ error: "UNREGISTERED_DEVICE", message: "미등록 기기입니다. PIN 연동을 먼저 진행해주세요." });
        }
        const userId = deviceRow.user_id;
        
        const mappedStatus = payload.action === 'KEEP' ? 'ORDER_CONFIRMED' : 'SAFE_CANCEL';
        const result = await handleDecision(userId, payload.orderId, mappedStatus, io);
        res.json(result);
    } catch (error) {
        console.error("Decision POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
