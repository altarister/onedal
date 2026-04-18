/**
 * POST /api/orders/detail
 */

import { Router } from "express";
import type { DispatchConfirmRequest, SecuredOrder } from "@onedal/shared";
import { parseLocationDetails, parseMockupFare, parseMockupDistance, parseMockupVehicleType } from "../utils/parser";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../config/dispatchConfig";
import { getUserSession } from "../state/userSessionStore";
import { handleDecision, evaluateNewOrder } from "../services/dispatchEngine";
import db from "../db";

const router = Router();

router.post("/", async (req, res) => {
    try {
        const payload = req.body as DispatchConfirmRequest;

        if (payload.step !== 'DETAILED') {
            return res.status(400).json({ error: "step=DETAILED 전용" });
        }
        
        logRoadmapEvent("서버", "[HTTP 폴링] POST /orders/detail 데이터 수신");

        // V2 SaaS: 단말기 ID를 기반으로 소유권을 확인하여 개별 룸으로 라우팅합니다.
        let userId = "ADMIN_USER";
        if (payload.deviceId) {
            const row = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(payload.deviceId) as any;
            if (row) userId = row.user_id;
        }
        const session = getUserSession(userId);

        const realOrderId = (payload.order.id === "unknown" || !payload.order.id)
            ? (session.deviceEvaluatingMap.get(payload.deviceId) || "unknown")
            : payload.order.id;

        payload.order.id = realOrderId;

        const securedOrder: SecuredOrder = {
            ...payload.order,
            status: 'evaluating_detailed',
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString()
        };

        if (securedOrder.rawText) {
            securedOrder.pickupDetails = parseLocationDetails(securedOrder.rawText, "[출발지상세]");
            securedOrder.dropoffDetails = parseLocationDetails(securedOrder.rawText, "[도착지상세]");
            
            if (!securedOrder.fare || securedOrder.fare <= 0) {
                securedOrder.fare = parseMockupFare(securedOrder.rawText) || 0;
            }
            if (!securedOrder.distanceKm) {
                securedOrder.distanceKm = parseMockupDistance(securedOrder.rawText) || 0;
            }
            if (!securedOrder.vehicleType) {
                securedOrder.vehicleType = parseMockupVehicleType(securedOrder.rawText) || "";
            }
        }

        const checkMatch = (existingOrder: SecuredOrder) => {
             const phone1 = existingOrder.pickupDetails?.[0]?.phone1;
             const phone2 = securedOrder.pickupDetails?.[0]?.phone1;
             const isPhoneMatch = (phone1 === phone2) && !!phone1;
             
             const isPickupAddressMatch = existingOrder.pickup === securedOrder.pickup;
             const isDropoffAddressMatch = existingOrder.dropoff === securedOrder.dropoff;
             const isFareMatch = existingOrder.fare > 0 && existingOrder.fare === securedOrder.fare;
             
             const p1Addr = existingOrder.pickupDetails?.[0]?.addressDetail;
             const p2Addr = securedOrder.pickupDetails?.[0]?.addressDetail;
             const isExactAddrMatch = !!p1Addr && !!p2Addr && p1Addr === p2Addr;
             
             if (existingOrder.id === securedOrder.id) return true;
             if (isPhoneMatch && isPickupAddressMatch && isDropoffAddressMatch && isFareMatch) return true;
             if (isFareMatch && isPickupAddressMatch && isDropoffAddressMatch && isExactAddrMatch) return true;
             return false;
        }

        let matchedId: string | null = null;
        if (session.mainCallState && checkMatch(session.mainCallState)) {
             matchedId = session.mainCallState.id;
        } else {
             const subMatch = session.subCalls.find(checkMatch);
             if (subMatch) matchedId = subMatch.id;
        }

        if (matchedId) {
             console.log(`🔄 [동기화] 기존 확정 콜(ID: ${matchedId})의 재열람 인지. 진짜 ID 반환.`);
             return res.json({ deviceId: 'server', action: 'ACK', orderId: matchedId });
        }

        const io = req.app.get("io");
        for (const order of session.pendingOrdersData.values()) {
            if (order.capturedDeviceId !== payload.deviceId) {
                console.log(`🔒 [Lock] ${order.capturedDeviceId} 기기가 이미 평가중.`);
                if (io) io.to(userId).emit("order-canceled", payload.order.id);
                return res.json({ deviceId: 'server', action: 'CANCEL' });
            }
        }
        
        if (securedOrder.type !== "MANUAL" && session.activeFilter.allowedVehicleTypes && session.activeFilter.allowedVehicleTypes.length > 0) {
            const vTypeRaw = securedOrder.vehicleType || "";
            const isMatch = session.activeFilter.allowedVehicleTypes.some(allowed => {
                const normRaw = vTypeRaw.toLowerCase();
                if (allowed === '1t') return normRaw.includes('1') || normRaw.includes('t') || normRaw.includes('톤');
                if (allowed === '다마스') return normRaw.includes('다');
                if (allowed === '라보') return normRaw.includes('라');
                if (allowed === '오토바이') return normRaw.includes('오');
                return normRaw.includes(allowed);
            });
            
            if (!isMatch) {
                console.log(`🚫 [차종 차단] '${vTypeRaw}' 불가`);
                if (io) io.to(userId).emit("order-canceled", payload.order.id);
                return res.json({ deviceId: 'server', action: 'CANCEL' });
            }
        }

        session.pendingOrdersData.set(payload.order.id, securedOrder);

        if (io) {
            io.to(userId).emit("order-detail-received", securedOrder);
            logRoadmapEvent("서버", "[Socket] 상하차지 송출");
        }

        // ━━━ Service 계층에 카카오 경로 연산 위임 (evaluateNewOrder) ━━━
        // 지오코딩 + 단독/합짐 경로 연산 + 꿀/콜/똥 판정 + order-evaluated emit
        await evaluateNewOrder(userId, securedOrder, io);

        if (securedOrder.type === "MANUAL") {
            await handleDecision(userId, securedOrder.id, "KEEP", io);
            return res.json({ deviceId: 'server', action: 'ACK' });
        }

        session.pendingDetailRequests.set(payload.order.id, res);

        setTimeout(() => {
            if (session.pendingDetailRequests.has(payload.order.id)) {
                if (io) {
                    io.to(userId).emit("deathvalley-warning", {
                        orderId: payload.order.id,
                        deviceId: payload.deviceId,
                        pickup: securedOrder.pickup,
                        dropoff: securedOrder.dropoff,
                        message: "⚠️ 30초 데스밸리!",
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        }, DISPATCH_CONFIG.WAITING_WARNING_MS);

        setTimeout(() => {
            if (session.pendingDetailRequests.has(payload.order.id)) {
                const heldRes = session.pendingDetailRequests.get(payload.order.id);
                session.pendingDetailRequests.delete(payload.order.id);
                if (heldRes && !heldRes.headersSent) {
                    heldRes.status(408).json({ error: "Server Force Timeout" });
                }

                session.pendingOrdersData.delete(payload.order.id);
                Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
                    if (v === payload.order.id) session.deviceEvaluatingMap.delete(k);
                });

                if (io) {
                    io.to(userId).emit("order-canceled", payload.order.id);
                }
            }
        }, DISPATCH_CONFIG.WAITING_TIMEOUT_MS);

    } catch (error) {
        res.status(500).json({ error: "Fail" });
    }
});
export default router;
