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
import { parseLocationDetails } from "../utils/parser";
import { getCorridorRegions } from "../services/geoService";

const router = Router();

// 롱폴링 대기 Map (orderId -> 앱폰 HTTP Response)
const pendingDetailRequests = new Map<string, Response>();
// 메모리 내 오더 캐시 (좌표 보존용)
const pendingOrdersData = new Map<string, SecuredOrder>();
// 현재 기기별 평가 중인 오더 ID 추적 (앱폰이 unknown으로 보낼 때 복구용)
export const deviceEvaluatingMap = new Map<string, string>();

/** 기존 평가 중이던 콜을 외부에서 강제 삭제할 때 호출 */
export function forceCancelEvaluatingOrder(orderId: string, io: any) {
    if (pendingOrdersData.has(orderId)) {
        pendingOrdersData.delete(orderId);
    }
    if (pendingDetailRequests.has(orderId)) {
        const heldRes = pendingDetailRequests.get(orderId);
        pendingDetailRequests.delete(orderId);
        if (heldRes && !heldRes.headersSent) {
            heldRes.status(408).json({ error: "Background Force Cleaned" });
        }
    }
    Array.from(deviceEvaluatingMap.entries()).forEach(([k, v]) => {
        if (v === orderId) deviceEvaluatingMap.delete(k);
    });
    if (io) {
        console.log(`📤 [Socket 푸시] order-canceled (${orderId})`);
        io.emit("order-canceled", orderId);
    }
}

// 인메모리 배차 상태 (본콜 추적)
let mainCallState: SecuredOrder | null = null;
// 합짐 콜 누적 배열
const subCalls: SecuredOrder[] = [];

// 외부에서 접근할 수 있도록 export
export const getMainCallState = () => mainCallState;
export const getSubCalls = () => subCalls;
export const getPendingDetailRequests = () => pendingDetailRequests;
export const getPendingOrdersData = () => pendingOrdersData;

// [Safety Mode V3] emergency.ts에서 본콜 초기화 시 사용
export const resetMainCallState = () => { mainCallState = null; };

/**
 * 관제사 최종 판정 처리 (소켓 이벤트 `decision`에서 호출)
 */
export function handleDecision(orderId: string, action: 'KEEP' | 'CANCEL', io: any) {
    const heldRes = pendingDetailRequests.get(orderId);

    if (heldRes && !heldRes.headersSent) {
        // 잡고 있던 앱폰의 HTTP(롱폴링) 파이프에 판결문을 내려줌 (AUTO 배차의 경우)
        pendingDetailRequests.delete(orderId);
        const deviceResponse: DispatchConfirmResponse = { deviceId: 'server', action };
        heldRes.json(deviceResponse);
    } else {
        console.log(`💡 [Decision] 롱폴링 대기열에 없음 (수동 배차이거나 이미 종료된 통신). 웹 관제 상태만 업데이트합니다: ID ${orderId}`);
        if (action === 'CANCEL' && io) {
            // [Safety] 취소 시에는 필요 없는 캐시 완전 삭제
            pendingOrdersData.delete(orderId);
            Array.from(deviceEvaluatingMap.entries()).forEach(([k, v]) => {
                if (v === orderId) deviceEvaluatingMap.delete(k);
            });
        }
    }

    if (action === 'KEEP') {
        // 본콜이 없었다면 현재 수락한 콜을 본콜로 지정
        const cachedOrder = pendingOrdersData.get(orderId);
        let destinationKeywords = activeFilterConfig.destinationKeywords;

        if (cachedOrder && cachedOrder.routePolyline) {
            const radius = activeFilterConfig.destinationRadiusKm || 5;
            const regions = getCorridorRegions(cachedOrder.routePolyline, radius);
            if (regions.length > 0) {
                // 앱폰 연동을 위해 콤마로 연결
                destinationKeywords = regions.join(", ");
                console.log(`🗺️ [Turf.js 연산] 반경 ${radius}km 내 읍면동 ${regions.length}개 추출: ${destinationKeywords.substring(0, 50)}...`);
            }
        }
        if (cachedOrder) {
            cachedOrder.status = 'confirmed';
        }

        const isAlreadyMain = mainCallState?.id === orderId;
        const isAlreadySub = subCalls.some(c => c.id === orderId);

        if (!isAlreadyMain && !isAlreadySub && cachedOrder) {
            if (!mainCallState) {
                mainCallState = cachedOrder;
            } else {
                subCalls.push(cachedOrder);
            }
        }

        io.emit("order-confirmed", orderId);

        // 합짐 사냥 모드로 필터 전면 개편하고 다시 매크로(isActive)를 켭니다.
        updateActiveFilter({ isSharedMode: true, isActive: true, destinationKeywords });
        io.emit("filter-updated", activeFilterConfig);
        console.log(`✅ [최종 수락(유지)] ID: ${orderId}`);
    } else {
        // [사후 동기화 (Post-Dispatch Sync)] 취소 명령 시, 이미 확정된 오더 목록에서도 제거
        if (mainCallState?.id === orderId) {
            console.log(`🗑️ [사후 동기화] 메인콜(ID: ${orderId}) 취소! 메모리에서 초기화합니다.`);
            mainCallState = null;
        } else {
            const subIndex = subCalls.findIndex(c => c.id === orderId);
            if (subIndex > -1) {
                console.log(`🗑️ [사후 동기화] 서브콜(ID: ${orderId}) 취소! 서브콜 목록에서 제외합니다.`);
                subCalls.splice(subIndex, 1);
            }
        }

        io.emit("order-canceled", orderId);

        // 평가를 위해 매크로가 정지되어 있었다면 다시 켭니다.
        if (!activeFilterConfig.isActive) {
            updateActiveFilter({ isActive: true });
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

        // 'unknown' ID 구제 로직
        const realOrderId = (payload.order.id === "unknown" || !payload.order.id)
            ? (deviceEvaluatingMap.get(payload.deviceId) || "unknown")
            : payload.order.id;

        payload.order.id = realOrderId;

        const securedOrder: SecuredOrder = {
            ...payload.order,
            status: 'evaluating_detailed',
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString()
        };

        // 새로 추가된 정규식 파서로 문자열 분리 및 LocationDetailInfo 이식
        if (securedOrder.rawText) {
            securedOrder.pickupDetails = parseLocationDetails(securedOrder.rawText, "[출발지상세]");
            securedOrder.dropoffDetails = parseLocationDetails(securedOrder.rawText, "[도착지상세]");
        }

        // ━━━━━━━━━━ [사후 동기화 (Post-Dispatch Sync) 검사] ━━━━━━━━━━
        // 기사님이 '완료(1/3)' 탭에서 이미 확정된 오더를 다시 열었을 경우 검사
        // 출발지, 도착지를 비교하여 일치하면 동일 오더로 간주함
        const checkMatch = (existingOrder: SecuredOrder) => {
             // 1순위: 출발지 전화번호가 같을 때
             const p1Phone = existingOrder.pickupDetails?.[0]?.phone1;
             const p2Phone = securedOrder.pickupDetails?.[0]?.phone1;
             if (p1Phone && p2Phone && p1Phone === p2Phone) return true;

             // 2순위: 출발지 상세 주소가 포함관계이거나 매우 유사할 때 (가장 강력한 식별)
             const p1Addr = existingOrder.pickupDetails?.[0]?.addressDetail;
             const p2Addr = securedOrder.pickupDetails?.[0]?.addressDetail;
             if (p1Addr && p2Addr && (p1Addr.includes(p2Addr) || p2Addr.includes(p1Addr))) return true;

             // 3순위: 도착지 상세 주소
             const d1Addr = existingOrder.dropoffDetails?.[0]?.addressDetail;
             const d2Addr = securedOrder.dropoffDetails?.[0]?.addressDetail;
             if (d1Addr && d2Addr && (d1Addr.includes(d2Addr) || d2Addr.includes(d1Addr))) return true;

             // 4순위: 요금이 완전히 동일하고 원래 출발지/도착지 텍스트가 부분 일치하는 경우
             if (existingOrder.fare > 0 && existingOrder.fare === securedOrder.fare) {
                 if (existingOrder.pickup === securedOrder.pickup && existingOrder.dropoff === securedOrder.dropoff) return true;
             }
             
             return false;
        }

        let matchedId: string | null = null;
        if (mainCallState && checkMatch(mainCallState)) {
             matchedId = mainCallState.id;
        } else {
             const subMatch = subCalls.find(checkMatch);
             if (subMatch) matchedId = subMatch.id;
        }

        if (matchedId) {
             console.log(`🔄 [사후 동기화 매칭] 이전에 확정된 콜(ID: ${matchedId})의 재열람을 감지했습니다. 중복 평가를 스킵하고 진짜 ID를 반환합니다.`);
             // 앱폰이 currentOrder.id를 진짜 ID로 업뎃하도록 알려줌
             return res.json({ deviceId: 'server', action: 'ACK', orderId: matchedId });
        }
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // ━━━━━━━━━━ [중요 락(Lock) 메커니즘] 다중 기기 동시성 제어 ━━━━━━━━━━
        // 다른 기기가 먼저 낚아채서 평가를 진행 중일 때, 늦게 들어온 기기는 즉시 뱉어내게 만듦.
        // 이를 통해 "동일 콜 쟁탈전"이나 "서로 다른 콜 동시 평가로 인한 꼬임"을 완벽 차단.
        const io = req.app.get("io");
        for (const order of pendingOrdersData.values()) {
            if (order.capturedDeviceId !== payload.deviceId) {
                console.log(`🔒 [Mutex Lock 발동] 기기(${order.capturedDeviceId})가 평가를 진행 중입니다. 기기(${payload.deviceId})의 늦은 진입을 차단하고 즉시 방출합니다.`);
                if (io) io.emit("order-canceled", payload.order.id);
                // 클라이언트에 CANCEL 응답을 주면, 앱폰은 30초 대기 없이 즉각 취소 버튼을 누르고 리스트로 복귀함
                return res.json({ deviceId: 'server', action: 'CANCEL' });
            }
        }
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 좌표 보존을 위해 메모리에 보관
        pendingOrdersData.set(payload.order.id, securedOrder);

        // ━━━━━━━━━━ 1단계: 수신 즉시 → 상하차지+적요 먼저 관제탑에 emit ━━━━━━━━━━
        if (io) {
            console.log(`📤 [Socket 푸시] order-detail-received (${securedOrder.id})`);
            io.emit("order-detail-received", securedOrder);
            console.log(`📋 [2차 상세 수신] 상하차지+적요 전송. 상세주소(${securedOrder.pickupDetails?.[0]?.addressDetail || '없음'} ➡️ ${securedOrder.dropoffDetails?.[0]?.addressDetail || '없음'})`);
        }

        // ━━━━━━━━━━ 2단계: 카카오 연산 → 경로/시간/수익률 관제탑에 emit ━━━━━━━━━━
        let timeExt = "카카오 연산 실패";
        let distExt = "카카오 연산 실패";

        // "미상" 타이틀 덮어쓰기 로직: 번개치기로 정밀 주소를 훔쳐왔다면, 기존 목록 주소가 무엇이든 무조건 정밀 주소로 교체!
        if (securedOrder.pickupDetails?.[0]?.addressDetail) {
            securedOrder.pickup = securedOrder.pickupDetails[0].addressDetail;
        }
        if (securedOrder.dropoffDetails?.[0]?.addressDetail) {
            securedOrder.dropoff = securedOrder.dropoffDetails[0].addressDetail;
        }

        console.log(`\n======================================================`);
        console.log(`[서버-사이드 카카오 연산] 🚀 ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

        try {
            const apiKey = process.env.KAKAO_REST_API_KEY;
            if (apiKey) {
                // 1.5단계: 지오코딩 (텍스트 주소를 X, Y 좌표로 변환)
                if (!securedOrder.pickupX || !securedOrder.pickupY) {
                    const bestPickupQuery = securedOrder.pickupDetails?.[0]?.addressDetail || securedOrder.pickup;
                    const pCoord = await geocodeAddress(apiKey, bestPickupQuery);
                    if (pCoord) {
                        securedOrder.pickupX = pCoord.x;
                        securedOrder.pickupY = pCoord.y;
                    }
                }
                if (!securedOrder.dropoffX || !securedOrder.dropoffY) {
                    const bestDropoffQuery = securedOrder.dropoffDetails?.[0]?.addressDetail || securedOrder.dropoff;
                    const dCoord = await geocodeAddress(apiKey, bestDropoffQuery);
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
                        let recommend = "'콜'";
                        if (durationMin <= 40) recommend = "'꿀'";
                        else if (durationMin >= 90) recommend = "'똥'";
                        
                        timeExt = `단독 ${distKm}km, ${durationMin}분 ${recommend}`;
                        securedOrder.routePolyline = result.polyline; // [추가] 궤적 저장
                        securedOrder.totalDistanceKm = parseFloat(distKm);
                        securedOrder.totalDurationMin = durationMin;
                        console.log(`   - ⏱️ 결과: ${timeExt}`);
                        console.log(`   - 🗺️ 궤적 체크 (Solo): ${securedOrder.routePolyline?.length ? securedOrder.routePolyline.length : '없음'}`);
                    } else if (mainCallState.pickupX && mainCallState.dropoffY) {
                        // 합짐: 우회 동선 연산
                        console.log(`   - 💡 상태: [합짐] 우회 동선 연산`);
                        console.log(`   - 기존 본콜: ${mainCallState.pickup} ➡️ ${mainCallState.dropoff}`);
                        console.log(`   - 추가 경유: ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

                        const prevPickups = subCalls.map(c => ({ x: c.pickupX!, y: c.pickupY! }));
                        const prevDropoffs = [...subCalls].reverse().map(c => ({ x: c.dropoffX!, y: c.dropoffY! }));

                        const waypoints = [
                            ...prevPickups,
                            { x: securedOrder.pickupX, y: securedOrder.pickupY! },
                            { x: securedOrder.dropoffX!, y: securedOrder.dropoffY },
                            ...prevDropoffs
                        ];
                        const result = await calculateDetourRoute(
                            apiKey,
                            mainCallState.pickupX!, mainCallState.pickupY!,
                            mainCallState.dropoffX!, mainCallState.dropoffY!,
                            waypoints
                        );
                        
                        let recommend = "'콜'";
                        const distDiff = parseFloat(result.distDiffKm);
                        if (result.timeDiffMin <= 30 && distDiff <= 15) recommend = "'꿀'";
                        else if (result.timeDiffMin >= 60 || distDiff >= 30) recommend = "'똥'";
                        
                        const signDist = distDiff > 0 ? "+" : "";
                        const signTime = result.timeDiffMin > 0 ? "+" : "";
                        
                        timeExt = `${signDist}${result.distDiffKm}km, ${signTime}${result.timeDiffMin}분 ${recommend}`;
                        securedOrder.routePolyline = result.merged.polyline; // [추가] 궤적 저장
                        securedOrder.totalDistanceKm = result.merged.distance / 1000;
                        securedOrder.totalDurationMin = Math.round(result.merged.duration / 60);
                        console.log(`   - ⚠️ 패널티 결과: ${timeExt}`);
                        console.log(`   - 🗺️ 궤적 체크 (Detour): ${securedOrder.routePolyline?.length ? securedOrder.routePolyline.length : '없음'}`);
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

        if (io) {
            // 카카오 연산 결과 포함 발송 (다이어그램 Line 80)
            console.log(`📤 [Socket 푸시] order-evaluated (${securedOrder.id})`);
            io.emit("order-evaluated", securedOrder);
            console.log(`🔎 [카카오 연산 완료] ${timeExt} (기기: ${payload.deviceId}) | Polyline 길이: ${securedOrder.routePolyline?.length || 0}`);
        }

        // ━━━━━━━━━━ 3단계: HTTP 롱폴링 홀드 (관제사/기사님 decision 대기) ━━━━━━━━━━
        if (securedOrder.type === "MANUAL") {
            console.log(`✅ [수동 배차 통과] 기사님이 폰에서 직집 잡은 오더(${securedOrder.id}). 롱폴링 홀드 없이 200 OK만 응답하고 앱 내 버튼 입력을 대기합니다.`);
            // 앱 로직이 이미 MANUAL_STANDBY에 있으므로 서버 사이드 롱폴링 커넥션을 즉시 끊어줌
            return res.json({ deviceId: 'server', action: 'ACK' });
        }

        pendingDetailRequests.set(payload.order.id, res);

        // [Safety Mode V3] 30초 후 관제탑에 경고만 emit (자동 CANCEL 제거)
        // 취소 판단은 앱폰이 스스로 합니다 (앱 내부 데스밸리 타이머).
        // 앱이 자동취소를 집행하면 POST /api/emergency로 서버에 보고합니다.
        setTimeout(() => {
            if (pendingDetailRequests.has(payload.order.id)) {
                console.log(`⚠️ [데스밸리 경고] 30초 경과 — 아직 판정 미결: ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);
                if (io) {
                    io.emit("deathvalley-warning", {
                        orderId: payload.order.id,
                        deviceId: payload.deviceId,
                        pickup: securedOrder.pickup,
                        dropoff: securedOrder.dropoff,
                        message: "⚠️ 응답기한 30초 초과 — 앱폰 자동취소 임박!",
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        }, 30000);

        // [Safety Fallback] 만약 앱폰이 수동(MANUAL) 모드라서 AUTO_CANCEL 비상 보고를 보내지 않고 사용자가 수동으로 닫기를 누른 경우,
        // 서버의 HTTP 연결이 영원히 물려있으면 앱폰의 State 머신이 영원히 WAITING_SERVER에 갇히게 됩니다.
        // 이를 방지하기 위해 35초가 지나면 서버 측에서 강제로 롱폴링 파이프를 끊어줍니다. (앱폰 강제 해방)
        setTimeout(() => {
            if (pendingDetailRequests.has(payload.order.id)) {
                console.log(`💥 [서버 강제 해방] 35초 경과! 기기(${payload.deviceId})가 응답 대기 상태에 갇히는 것을 방지하기 위해 연결을 강제 종료합니다.`);
                const heldRes = pendingDetailRequests.get(payload.order.id);
                pendingDetailRequests.delete(payload.order.id);
                if (heldRes && !heldRes.headersSent) {
                    // 클라이언트(앱)에 408 Timeout 반환하여 State를 강제로 초기화시킴
                    heldRes.status(408).json({ error: "Server Force Timeout" });
                }

                // 관련 캐시 정리 (다음 콜을 받을 수 있도록)
                pendingOrdersData.delete(payload.order.id);
                Array.from(deviceEvaluatingMap.entries()).forEach(([k, v]) => {
                    if (v === payload.order.id) deviceEvaluatingMap.delete(k);
                });

                if (io) {
                    console.log(`📤 [Socket 푸시] order-canceled (${payload.order.id})`);
                    io.emit("order-canceled", payload.order.id);
                }
            }
        }, 35000);

    } catch (error) {
        console.error("Detail POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});
export default router;
