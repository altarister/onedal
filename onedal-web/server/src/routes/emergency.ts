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
 *   1. pendingDecisions 큐에서 해당 orderId 삭제 및 데스밸리 타이머(activeTimers) 해제
 *   2. pendingOrdersData에서 해당 orderId 삭제
 *   3. mainCallState가 해당 orderId면 null로 초기화 + 필터 '첫짐'으로 복원
 *   4. 관제탑에 emergency-alert emit
 *   5. 관제탑에 order-canceled emit
 */

import { Router } from "express";
import type { EmergencyReport } from "@onedal/shared";
import { getUserSession } from "../state/userSessionStore";
import { applyFilter } from "../state/filterManager";
import db from "../db";
import { incrementDeviceStats } from "./devices";

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

        let userId = "ADMIN_USER";
        if (deviceId) {
            const deviceRow = db.prepare("SELECT user_id FROM user_devices WHERE device_id = ?").get(deviceId) as any;
            if (deviceRow) userId = deviceRow.user_id;
        }
        
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

        if (session.pendingDecisions.has(targetOrderId)) {
            session.pendingDecisions.delete(targetOrderId);
            console.log(`   ✅ 결재 큐(pendingDecisions) 삭제 완료`);
        }

        const warnTimer = session.activeTimers.get(`warn_${targetOrderId}`);
        const timeoutTimer = session.activeTimers.get(`timeout_${targetOrderId}`);
        if (warnTimer) clearTimeout(warnTimer);
        if (timeoutTimer) clearTimeout(timeoutTimer);
        session.activeTimers.delete(`warn_${targetOrderId}`);
        session.activeTimers.delete(`timeout_${targetOrderId}`);
        console.log(`   ✅ 롱폴링 대응 데스밸리 타이머 무음 해제 완료`);

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

        // 📈 취소(알림) 카운트 증가 처리
        if (deviceId) {
            incrementDeviceStats(deviceId, "canceled");
            console.log(`   📈 기기(${deviceId}) 취소 카운트 +1 반영 (reason: ${reason})`);
        }

        if (session.mainCallState && session.mainCallState.id === targetOrderId) {
            session.mainCallState = null;
            applyFilter(userId, { isSharedMode: false, isActive: true, loadState: 'EMPTY' }, io, false);
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
