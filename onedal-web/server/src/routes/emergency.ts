/**
 * POST /api/emergency
 * 
 * Safety Mode V3: 앱폰 비상 보고 엔드포인트
 * 
 * 앱폰이 아래 상황을 감지하면 이 엔드포인트를 호출합니다:
 *   - AUTO_CANCEL: 30초 타임아웃으로 앱이 스스로 취소함
 *   - CANCEL_EXPIRED: "시간이 지나 취소할 수 없습니다" 팝업 발생
 *   - UNKNOWN_SCREEN: 알 수 없는 화면에 빠짐
 *   - BUTTON_NOT_FOUND: 버튼(닫기/취소)을 찾을 수 없음
 *   - APP_CRASH: 앱 비정상 종료 후 재시작
 * 
 * 서버 처리:
 *   1. pendingDetailRequests에서 해당 orderId 삭제 (롱폴링 해제)
 *   2. pendingOrdersData에서 해당 orderId 삭제
 *   3. mainCallState가 해당 orderId면 null로 초기화 + 필터 '첫짐'으로 복원
 *   4. 관제탑에 emergency-alert emit
 *   5. 관제탑에 order-canceled emit
 */

import { Router } from "express";
import type { EmergencyReport } from "@onedal/shared";
import { getUserSession } from "../state/userSessionStore";

const router = Router();

router.post("/", (req, res) => {
    try {
        const report = req.body as EmergencyReport;
        const { deviceId, orderId, reason, screenContext, screenText, timestamp } = report;

        console.log(`\n🚨🚨🚨 [EMERGENCY] 비상 보고 수신 🚨🚨🚨`);
        console.log(`   기기: ${deviceId}`);
        console.log(`   오더: ${orderId}`);
        console.log(`   사유: ${reason}`);
        console.log(`   화면: ${screenContext}`);
        console.log(`   텍스트: ${screenText?.substring(0, 100)}...`);

        const userId = "ADMIN_USER";
        const session = getUserSession(userId);

        let targetOrderId = orderId;

        if (!targetOrderId || targetOrderId === "unknown") {
            for (const [id, order] of session.pendingOrdersData.entries()) {
                if (order.capturedDeviceId === deviceId && order.status !== 'confirmed') {
                    targetOrderId = id;
                    console.log(`   🔍 잃어버린 orderId 역추적 성공: ${targetOrderId}`);
                    break;
                }
            }
        }

        const io = req.app.get("io");

        if (session.pendingDetailRequests.has(targetOrderId)) {
            const heldRes = session.pendingDetailRequests.get(targetOrderId);
            session.pendingDetailRequests.delete(targetOrderId);
            if (heldRes && !heldRes.headersSent) {
                heldRes.status(408).json({ error: "Emergency Timeout Cleaned" });
            }
            console.log(`   ✅ 롱폴링 파이프 무음 해제 완료`);
        }

        if (session.pendingOrdersData.has(targetOrderId)) {
            session.pendingOrdersData.delete(targetOrderId);
            console.log(`   ✅ 오더 캐시 삭제 완료`);
        } else {
            console.log(`   ⚠️ 오더 캐시에 삭제할 내용이 없음 (${targetOrderId})`);
        }

        // deviceEvaluatingMap 정리 (다음 콜 진입 시 기존 오더ID가 남아 꼬이는 것을 방지)
        Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
            if (v === targetOrderId) session.deviceEvaluatingMap.delete(k);
        });

        if (session.mainCallState && session.mainCallState.id === targetOrderId) {
            session.mainCallState = null;
            session.activeFilter = { ...session.activeFilter, isSharedMode: false, isActive: true };
            if (io) io.to(userId).emit("filter-updated", session.activeFilter);
            console.log(`   ✅ 본콜 초기화 + 필터 '첫짐' 복원 완료`);
        }

        if (io) {
            io.to(userId).emit("emergency-alert", {
                deviceId,
                orderId: targetOrderId,
                reason,
                screenContext,
                screenText: screenText?.substring(0, 300),
                timestamp: timestamp || new Date().toISOString(),
            });
            console.log(`   ✅ 관제탑 emergency-alert emit 완료`);
        }

        if (io) {
            console.log(`📤 [Socket 푸시] order-canceled (${targetOrderId})`);
            io.to(userId).emit("order-canceled", targetOrderId);
        }

        console.log(`🚨🚨🚨 [EMERGENCY] 처리 완료 🚨🚨🚨\n`);

        res.json({
            success: true,
            message: "비상 보고 수신 완료. 서버 상태 초기화됨.",
            clearedOrderId: orderId,
        });
    } catch (error) {
        console.error("Emergency POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
