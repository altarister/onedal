/**
 * POST /api/orders/detail
 */

import { Router } from "express";
import type { DispatchConfirmRequest, SecuredOrder } from "@onedal/shared";
import { parseLocationDetails, parseMockupFare, parseMockupDistance, parseMockupVehicleType, parseDetailedRawText } from "../utils/parser";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../config/dispatchConfig";
import { getUserSession } from "../state/userSessionStore";
import { handleDecision, evaluateNewOrder } from "../services/dispatchEngine";
import db from "../db";
import { incrementDeviceStats } from "./devices";

const router = Router();

router.post("/", async (req, res) => {
    try {
        const payload = req.body as DispatchConfirmRequest;

        if (payload.step !== 'DETAILED') {
            return res.status(400).json({ error: "step=DETAILED 전용" });
        }

        logRoadmapEvent("서버", "앱폰으로 부터 무인서핑이 완료된 '2차 오더 상세' 요청 받음");

        // [하드 락] 미등록 기기 차단
        if (!payload.deviceId) {
            return res.status(401).json({ error: "MISSING_DEVICE_ID" });
        }
        const deviceRow = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(payload.deviceId) as any;
        if (!deviceRow) {
            return res.status(401).json({ error: "UNREGISTERED_DEVICE", message: "미등록 기기입니다. PIN 연동을 먼저 진행해주세요." });
        }
        const userId = deviceRow.user_id;
        const session = getUserSession(userId);

        const realOrderId = (payload.order.id === "unknown" || !payload.order.id)
            ? (session.deviceEvaluatingMap.get(payload.deviceId) || "unknown")
            : payload.order.id;

        payload.order.id = realOrderId;

        let securedOrder: SecuredOrder = {
            ...payload.order,
            status: 'evaluating_detailed',
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString()
        };

        logRoadmapEvent("서버", "상하차지 주소 및 적요 텍스트 정제 연산");
        const rawText = securedOrder.rawText;
        if (rawText) {
            // [Dumb Client / Smart Server]
            // 앱이 보내준 통짜 rawText를 서버의 파서가 완전히 해부하여 속성을 채움
            const parsedDetails = parseDetailedRawText(rawText);
            securedOrder = { ...securedOrder, ...parsedDetails };

            securedOrder.pickupDetails = parseLocationDetails(rawText, "[출발지상세]");
            securedOrder.dropoffDetails = parseLocationDetails(rawText, "[도착지상세]");

            if (!securedOrder.fare || securedOrder.fare <= 0) {
                securedOrder.fare = parseMockupFare(rawText) || 0;
            }
            if (!securedOrder.distanceKm) {
                securedOrder.distanceKm = parseMockupDistance(rawText) || 0;
            }
            if (!securedOrder.vehicleType) {
                securedOrder.vehicleType = parseMockupVehicleType(rawText) || "";
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
                console.log(`⚠️ [차종 차단 우회] '${vTypeRaw}' 차량 (필터 불일치). 앱(UI)에서 거르지 않고 도달했으므로 사용자 수동(Manual) 개입으로 간주하여 강제 킵(KEEP) 합니다.`);
                securedOrder.type = "MANUAL";
            }
        }

        session.pendingOrdersData.set(payload.order.id, securedOrder);

        if (io) {
            io.to(userId).emit("order-detail-received", securedOrder);
            logRoadmapEvent("서버", "관제탑에게 정제된 상세 텍스트(order-detail-received) 정보 전달");
        }

        logRoadmapEvent("서버", "앱폰에게 디테일 데이터 정상 수신 완료 응답 전달");
        // ━━━ Service 계층에 카카오 경로 연산 위임 (evaluateNewOrder) ━━━
        // 지오코딩 + 단독/합짐 경로 연산 + 꿀/콜/똥 판정 + order-evaluated emit
        await evaluateNewOrder(userId, securedOrder, io);

        if (securedOrder.type === "MANUAL") {
            await handleDecision(userId, securedOrder.id, "KEEP", io);
            return res.json({ deviceId: 'server', action: 'ACK' });
        }

        // [Option B] 롱폴링 대기를 풀고, 결재 큐에 올려둔 뒤 즉시 202 Accepted 반환
        session.pendingDecisions.set(payload.order.id, { action: null, evaluatedAt: Date.now() });
        res.status(202).json({ message: "Accepted. Piggyback evaluation pending" });

        const warningTimer = setTimeout(() => {
            if (session.pendingDecisions.has(payload.order.id)) {
                if (io) {
                    logRoadmapEvent("서버", "관제탑에게 지연 위급 상황(deathvalley-warning) 정보 전달");
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

        const timeoutTimer = setTimeout(() => {
            if (session.pendingDecisions.has(payload.order.id)) {
                session.pendingDecisions.delete(payload.order.id);
                session.pendingOrdersData.delete(payload.order.id);
                Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
                    if (v === payload.order.id) session.deviceEvaluatingMap.delete(k);
                });

                if (payload.deviceId) {
                    incrementDeviceStats(payload.deviceId, "canceled");
                    console.log(`   📈 기기(${payload.deviceId}) 취소 카운트 +1 반영 (reason: TIMEOUT)`);
                }

                if (io) {
                    io.to(userId).emit("order-canceled", payload.order.id);
                }
            }
        }, DISPATCH_CONFIG.WAITING_TIMEOUT_MS);

        // 비상 시 취소를 위해 타이머들 등록
        session.activeTimers.set(`warn_${payload.order.id}`, warningTimer);
        session.activeTimers.set(`timeout_${payload.order.id}`, timeoutTimer);

    } catch (error) {
        res.status(500).json({ error: "Fail" });
    }
});
export default router;
