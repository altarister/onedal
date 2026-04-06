/**
 * POST /api/orders/detail
 * 
 * 다이어그램 Line 74~80 대응:
 * 앱폰이 적요/출발지/도착지를 모두 긁은 후 전송하는 2차 상세 보고 엔드포인트.
 * 
 * 핵심 동작:
 * 1. 수신 즉시 → 관제탑에 상하차지+적요 emit (order-detail-received)
 * 2. 카카오 연산 → 관제탑에 경로/시간/수익률 emit (order-evaluated)
 * 3. HTTP 응답은 홀드(롱폴링) → 관제사 decision 소켓 이벤트로 해제
 */

import { Router, Response } from "express";
import type { DispatchConfirmRequest, DispatchConfirmResponse, SecuredOrder } from "@onedal/shared";
import { calculateSoloRoute, calculateDetourRoute, geocodeAddress } from "./kakaoUtil";
import { activeFilterConfig, updateActiveFilter } from "../state/filterStore";

const router = Router();

// 롱폴링 대기 Map (orderId -> 앱폰 HTTP Response)
const pendingDetailRequests = new Map<string, Response>();
// 메모리 내 오더 캐시 (좌표 보존용)
const pendingOrdersData = new Map<string, SecuredOrder>();

// 인메모리 배차 상태 (본콜 추적)
let mainCallState: SecuredOrder | null = null;
// 합짐 콜 누적 배열
const subCalls: SecuredOrder[] = [];

// 외부에서 접근할 수 있도록 export
export const getMainCallState = () => mainCallState;
export const getSubCalls = () => subCalls;
export const getPendingDetailRequests = () => pendingDetailRequests;
export const getPendingOrdersData = () => pendingOrdersData;

/**
 * 관제사 최종 판정 처리 (소켓 이벤트 `decision`에서 호출)
 */
export function handleDecision(orderId: string, action: 'KEEP' | 'CANCEL', io: any) {
    const heldRes = pendingDetailRequests.get(orderId);

    if (!heldRes || heldRes.headersSent) {
        console.error(`⚠️ [Decision] 이미 만료되거나 대기중이 아닌 오더: ${orderId}`);
        return { success: false, error: "이미 만료되거나 승인 대기중이 아닌 오더입니다." };
    }

    // 잡고 있던 앱폰의 HTTP 파이프에 판결문을 내려줌!
    pendingDetailRequests.delete(orderId);
    const deviceResponse: DispatchConfirmResponse = { deviceId: 'server', action };
    heldRes.json(deviceResponse);

    if (action === 'KEEP') {
        // 본콜이 없었다면 현재 수락한 콜을 본콜로 지정
        const cachedOrder = pendingOrdersData.get(orderId);
        if (!mainCallState && cachedOrder) {
            mainCallState = cachedOrder;
        } else if (cachedOrder) {
            subCalls.push(cachedOrder);
        }

        io.emit("order-confirmed", orderId);

        // 합짐 사냥 모드로 필터 전면 개편
        updateActiveFilter({ mode: '합짐', detourBaseId: orderId });
        io.emit("filter-updated", activeFilterConfig);
        console.log(`✅ [최종 수락(유지)] ID: ${orderId}`);
    } else {
        io.emit("order-canceled", orderId);

        // 본콜 확정 전 대기 중 취소였다면 다시 첫짐 사냥으로 원복
        if (!mainCallState && activeFilterConfig.mode === '대기') {
            updateActiveFilter({ mode: '첫짐' });
            io.emit("filter-updated", activeFilterConfig);
        }
        pendingOrdersData.delete(orderId);
        console.log(`❌ [최종 뱉기(취소)] ID: ${orderId}`);
    }

    return { success: true, action };
}

// POST /detail - 2차 상세 보고 (롱폴링)
router.post("/", async (req, res) => {
    try {
        const payload = req.body as DispatchConfirmRequest;

        if (payload.step !== 'DETAILED') {
            return res.status(400).json({ error: "이 엔드포인트는 step=DETAILED 전용입니다." });
        }

        const securedOrder: SecuredOrder = {
            ...payload.order,
            status: 'evaluating_detailed',
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString()
        };

        // 좌표 보존을 위해 메모리에 보관
        pendingOrdersData.set(payload.order.id, securedOrder);

        const io = req.app.get("io");

        // ━━━━━━━━━━ 1단계: 수신 즉시 → 상하차지+적요 먼저 관제탑에 emit ━━━━━━━━━━
        if (io) {
            io.emit("order-detail-received", securedOrder);
            console.log(`📋 [2차 상세 수신] 상하차지+적요 관제탑 전송: ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);
        }

        // ━━━━━━━━━━ 2단계: 카카오 연산 → 경로/시간/수익률 관제탑에 emit ━━━━━━━━━━
        let timeExt = "카카오 연산 실패";
        let distExt = "카카오 연산 실패";

        console.log(`\n======================================================`);
        console.log(`[서버-사이드 카카오 연산] 🚀 ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

        try {
            const apiKey = process.env.KAKAO_REST_API_KEY;
            if (apiKey) {
                // 1.5단계: 지오코딩 (텍스트 주소를 X, Y 좌표로 변환)
                if (!securedOrder.pickupX || !securedOrder.pickupY) {
                    const pCoord = await geocodeAddress(apiKey, securedOrder.pickup);
                    if (pCoord) {
                        securedOrder.pickupX = pCoord.x;
                        securedOrder.pickupY = pCoord.y;
                    }
                }
                if (!securedOrder.dropoffX || !securedOrder.dropoffY) {
                    const dCoord = await geocodeAddress(apiKey, securedOrder.dropoff);
                    if (dCoord) {
                        securedOrder.dropoffX = dCoord.x;
                        securedOrder.dropoffY = dCoord.y;
                    }
                }
                
                // 좌표 보존
                pendingOrdersData.set(payload.order.id, securedOrder);

                if (securedOrder.pickupX && securedOrder.dropoffY) {
                    if (!mainCallState) {
                        // 첫짐: 단독 주행 연산
                        console.log(`   - 💡 상태: [첫짐] 단독 주행 연산`);
                        const result = await calculateSoloRoute(
                            apiKey,
                            securedOrder.pickupX, securedOrder.pickupY!,
                            securedOrder.dropoffX!, securedOrder.dropoffY
                        );
                        const durationMin = Math.round(result.duration / 60);
                        const distKm = (result.distance / 1000).toFixed(1);
                        timeExt = `🧭 단독 주행: ${durationMin}분 소요`;
                        distExt = `🛣️ 예상 거리: ${distKm}km`;
                        console.log(`   - ⏱️ 결과: ${timeExt} / ${distExt}`);
                    } else if (mainCallState.pickupX && mainCallState.dropoffY) {
                        // 합짐: 우회 동선 연산
                        console.log(`   - 💡 상태: [합짐] 우회 동선 연산`);
                        console.log(`   - 기존 본콜: ${mainCallState.pickup} ➡️ ${mainCallState.dropoff}`);
                        console.log(`   - 추가 경유: ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

                        const waypoints = [
                            { x: securedOrder.pickupX, y: securedOrder.pickupY! },
                            { x: securedOrder.dropoffX!, y: securedOrder.dropoffY }
                        ];
                        const result = await calculateDetourRoute(
                            apiKey,
                            mainCallState.pickupX!, mainCallState.pickupY!,
                            mainCallState.dropoffX!, mainCallState.dropoffY!,
                            waypoints
                        );
                        timeExt = `⏳ 기존 대비 +${result.timeDiffMin}분 추가 소요`;
                        distExt = `+${result.distDiffKm}km 추가 주행`;
                        console.log(`   - ⚠️ 패널티 결과: ${timeExt} / ${distExt}`);
                    } else {
                        console.log(`   - ❌ 본콜은 있으나 좌표값이 누락됨.`);
                    }
                } else {
                    console.log(`   - ❌ 지오코딩 실패: API 키는 있으나 X/Y 좌표 변환 불가능`);
                }
            } else {
                console.log(`   - ❌ KAKAO_REST_API_KEY 서버 환경 변수 누락`);
            }
        } catch (error) {
            console.error("서버-사이드 카카오 연산 에러:", error);
        }
        console.log(`======================================================\n`);

        securedOrder.kakaoTimeExt = timeExt;
        securedOrder.kakaoDistExt = distExt;

        if (io) {
            // 카카오 연산 결과 포함 발송 (다이어그램 Line 80)
            io.emit("order-evaluated", securedOrder);
            console.log(`🔎 [카카오 연산 완료] ${timeExt} (기기: ${payload.deviceId})`);
        }

        // ━━━━━━━━━━ 3단계: HTTP 롱폴링 홀드 (관제사 decision 대기) ━━━━━━━━━━
        pendingDetailRequests.set(payload.order.id, res);

        // 안전장치: 30초 후 자동 취소 (데스밸리 타임아웃)
        setTimeout(() => {
            if (pendingDetailRequests.has(payload.order.id)) {
                const heldRes = pendingDetailRequests.get(payload.order.id);
                pendingDetailRequests.delete(payload.order.id);
                if (heldRes && !heldRes.headersSent) {
                    const failResponse: DispatchConfirmResponse = { deviceId: payload.deviceId, action: 'CANCEL' };
                    heldRes.json(failResponse);
                    if (io) io.emit("order-canceled", payload.order.id);
                    console.log(`🚫 [타임아웃 자동 취소] ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);
                }
            }
        }, 30000);

    } catch (error) {
        console.error("Detail POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
