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
        const { data, deviceId, screenContext, isHolding, lat, lng, ackDecisionId } = req.body as {
            data: SimplifiedOfficeOrder[],
            deviceId?: string,
            screenContext?: ScreenContextType,  // [Safety Mode V3] 앱폰 화면 상태 (물리적 페이지)
            isHolding?: boolean,                // [Page/Hold 분리] 콜 처리 중 여부
            lat?: number,                       // [GPS 텔레메트리] 앱폰 위도
            lng?: number,                       // [GPS 텔레메트리] 앱폰 경도
            ackDecisionId?: string              // [Piggyback V2] 앱이 수신 확인한 오더 ID
        };

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: "data 배열이 필요합니다" });
        }

        // 1. 기기 등록 여부 검증 (하드 락: 미등록 기기는 즉시 차단)
        if (!deviceId) {
            return res.status(401).json({ 
                error: "MISSING_DEVICE_ID", 
                message: "deviceId가 누락되었습니다. 앱에서 기기 식별자를 전송해주세요." 
            });
        }

        let userId = "ADMIN_USER";
        const deviceRow = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(deviceId) as { user_id: string } | undefined;
        if (!deviceRow) {
            return res.status(401).json({ 
                error: "UNREGISTERED_DEVICE", 
                message: "이 기기는 등록되지 않았습니다. 관제 웹에서 PIN 연동을 먼저 진행해주세요." 
            });
        }
        userId = deviceRow.user_id;

        const timestamp = new Date().toISOString();
        
        logRoadmapEvent("서버", "방대한 스크랩 배열값을 intel 테이블 DB 저장");
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
        logRoadmapEvent("서버", "앱폰으로 부터 무수한 스크랩(intel) 데이터 및 GPS 요청 받음");
        
        // 3. 디바이스 생존 신고 및 화면 상태 동기화
        let deviceMode = "MANUAL";
        if (deviceId) {
            const io = req.app.get("io");
            deviceMode = touchDeviceSession(deviceId, data.length, screenContext, io, isHolding, lat, lng);
        }

        logRoadmapEvent("서버", "관제탑에게 실시간 마커용 GPS(device-sessions-updated) 정보 전달");
        const session = getUserSession(userId);

        // 3.2. [Telemetry Ping] 프론트엔드의 타임아웃 진행바를 위한 실시간 핑 발송
        if (deviceId) {
            const evaluatingOrderId = session.deviceEvaluatingMap.get(deviceId);
            if (evaluatingOrderId) {
                const io = req.app.get("io");
                io.emit("telemetry-ping", { orderId: evaluatingOrderId });
            }
        }

        // 3.5. [Piggyback V2] ACK 처리 및 결재(Decision) 탑재 로직
        let piggybackDecision = undefined;

        if (deviceId) {
            // 앱이 "저번 결재 무사히 받았습니다" (ACK) 라고 보고하면, 큐와 타이머에서 깨끗이 지워줍니다.
            if (ackDecisionId && session.pendingDecisions.has(ackDecisionId)) {
                // 타이머 청소
                const warnTimer = session.activeTimers.get(`warn_${ackDecisionId}`);
                const timeoutTimer = session.activeTimers.get(`timeout_${ackDecisionId}`);
                if (warnTimer) clearTimeout(warnTimer);
                if (timeoutTimer) clearTimeout(timeoutTimer);
                session.activeTimers.delete(`warn_${ackDecisionId}`);
                session.activeTimers.delete(`timeout_${ackDecisionId}`);

                // 큐에서 제거
                session.pendingDecisions.delete(ackDecisionId);

                // deviceEvaluatingMap 정리 (이 매핑은 Piggyback 전달 완료 후 여기서 삭제)
                Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
                    if (v === ackDecisionId) session.deviceEvaluatingMap.delete(k);
                });

                console.log(`🧹 [Piggyback V2] 기사님 폰에서 ${ackDecisionId} 판결 수신 확인(ACK)! 안전하게 큐에서 삭제합니다.`);
            }

            // 현재 이 기사님이 확정(Confirm)을 누르고 결재를 기다리는 콜이 있는지 찾습니다.
            const evaluatingOrderId = session.deviceEvaluatingMap.get(deviceId);
            if (evaluatingOrderId) {
                // 관제탑이 결재를 내렸는지(KEEP/CANCEL) 큐를 뒤져봅니다.
                const decisionData = session.pendingDecisions.get(evaluatingOrderId);
                if (decisionData && decisionData.action !== null) {
                    // 관제탑 결재가 떨어졌습니다! Piggyback으로 태워서 보냅니다.
                    piggybackDecision = {
                        orderId: evaluatingOrderId,
                        action: decisionData.action // "KEEP" or "CANCEL"
                    };
                    console.log(`📦 [Piggyback V2] 텔레메트리 편에 결재(${decisionData.action})를 태워 보냅니다! (orderId: ${evaluatingOrderId})`);
                }
            }
        }

        logRoadmapEvent("서버", "앱폰에게 최신 필터(dispatchEngineArgs) 및 제어 명령 정보 전달");
        // 4. 응답 (해당 유저의 필터값 및 제어 명령 송신)
        res.json({
            success: true,
            apiStatus: {
                success: true,
                totalItems: totalScrap
            },
            deviceControl: {
                mode: deviceMode
            },
            dispatchEngineArgs: session.activeFilter,
            decision: piggybackDecision
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

