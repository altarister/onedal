import { Router, Response } from "express";
import crypto from "crypto";
import type { SimplifiedOfficeOrder, DispatchConfirmRequest, DispatchConfirmResponse, SecuredOrder } from "@onedal/shared";
import db from "../db";

const router = Router();
const pendingConfirmRequests = new Map<string, Response>();
const pendingOrdersData = new Map<string, SecuredOrder>();

// 인메모리 배차 상태 (서버-사이드 동선 계산을 위해 본콜 상태 추적)
let mainCallState: SecuredOrder | null = null;

// POST: 스캐너에서 콜 수신
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

// POST: 1 & 2. 앱폰의 선입성(BASIC) 및 상세보고(DETAILED) 라우터
router.post("/confirm", async (req, res) => {
    try {
        const payload = req.body as DispatchConfirmRequest;

        if (payload.step === 'BASIC') {
            // 1단계: 선빵 (리스트만 보고 낚아챔)
            // HTTP 연결은 딜레이 없이 즉시 응답 (앱은 멈추지 않고 상세 페이지 긁으러 진입해야 함)
            res.json({ success: true, message: "1차 수신 완료. 상세 페이지 내용을 긁어서 DETAILED로 보내주세요." });

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
            }
        } else if (payload.step === 'DETAILED') {
            // 2단계: 상세 보고 (상세 페이지에서 값 획득 후 전송)
            // 지독한 데스밸리 타임 시뮬레이션: 기사님의 최종 결재(Decision)가 떨어질 때까지 HTTP 통신을 꽉 붙잡음(Hold)
            pendingConfirmRequests.set(payload.order.id, res);

            const securedOrder: SecuredOrder = {
                ...payload.order,
                status: 'evaluating_detailed',
                capturedDeviceId: payload.deviceId,
                capturedAt: payload.capturedAt || new Date().toISOString()
            };
            
            // 승인 시 좌표 정보(pickupX, dropoffX 등)를 DB가 아닌 메모리에서 온전히 살리기 위해 보관
            pendingOrdersData.set(payload.order.id, securedOrder);

            // 서버 내부적으로 현재 본콜(mainCallState)이 있는지 확인하여 합짐(Detour) 여부 판단
            let timeExt = "카카오 연산 실패";
            let distExt = "카카오 연산 실패";

            console.log(`\n======================================================`);
            console.log(`[서버-사이드 카카오 연산] 🚀 ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

            try {
                const apiKey = process.env.KAKAO_REST_API_KEY;
                if (apiKey && securedOrder.pickupX && securedOrder.dropoffY) {
                    const KAKAO_API_URL = "https://apis-navi.kakaomobility.com/v1/directions";
                    const headers = { "Authorization": `KakaoAK ${apiKey}`, "Content-Type": "application/json" };
                    
                    if (!mainCallState) { // 본콜(첫짐)인 경우
                        console.log(`   - 💡 상태: [첫짐] 단독 주행 연산`);
                        const url = `${KAKAO_API_URL}?origin=${securedOrder.pickupX},${securedOrder.pickupY}&destination=${securedOrder.dropoffX},${securedOrder.dropoffY}&priority=RECOMMEND&car_type=1`;
                        const resCall = await fetch(url, { headers });
                        const data = await resCall.json();
                        const durationMin = Math.round((data?.routes?.[0]?.summary?.duration || 0) / 60);
                        const distKm = ((data?.routes?.[0]?.summary?.distance || 0) / 1000).toFixed(1);
                        timeExt = `🧭 단독 주행: ${durationMin}분 소요`;
                        distExt = `🛣️ 예상 거리: ${distKm}km`;
                        console.log(`   - ⏱️ 결과: ${timeExt} / ${distExt}`);
                    } else if (mainCallState.pickupX && mainCallState.dropoffY) { // 합짐(추가콜)인 경우
                        console.log(`   - 💡 상태: [합짐] 우회 동선 연산`);
                        console.log(`   - 기존 본콜: ${mainCallState.pickup} ➡️ ${mainCallState.dropoff}`);
                        console.log(`   - 추가 경유: ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);

                        const origin = `${mainCallState.pickupX},${mainCallState.pickupY}`;
                        const dest = `${mainCallState.dropoffX},${mainCallState.dropoffY}`;
                        
                        // 베이스 시간(단독) - 원래는 캐싱하거나 재조회해야 함
                        const baseRes = await fetch(`${KAKAO_API_URL}?origin=${origin}&destination=${dest}&priority=RECOMMEND&car_type=1`, { headers });
                        const baseData = await baseRes.json();
                        const baseDuration = baseData?.routes?.[0]?.summary?.duration || 0;
                        const baseDistance = baseData?.routes?.[0]?.summary?.distance || 0;

                        // 합짐 소요시간 (현재 본콜 출발 -> 합짐 출발 -> 합짐 도착 -> 본콜 도착)
                        const waypoints = `${securedOrder.pickupX},${securedOrder.pickupY}|${securedOrder.dropoffX},${securedOrder.dropoffY}`;
                        const mergedUrl = `${KAKAO_API_URL}?origin=${origin}&destination=${dest}&waypoints=${waypoints}&priority=RECOMMEND&car_type=1`;
                        const mergedRes = await fetch(mergedUrl, { headers });
                        const mergedData = await mergedRes.json();
                        const mergedDuration = mergedData?.routes?.[0]?.summary?.duration || 0;
                        const mergedDistance = mergedData?.routes?.[0]?.summary?.distance || 0;

                        const timeDiffMin = Math.round((mergedDuration - baseDuration) / 60);
                        const distDiffKm = ((mergedDistance - baseDistance) / 1000).toFixed(1);

                        timeExt = `⏳ 기존 대비 +${timeDiffMin}분 추가 소요`;
                        distExt = `+${distDiffKm}km 추가 주행`;
                        console.log(`   - ⚠️ 패널티 결과: 단독 대비 +${timeDiffMin}분 / +${distDiffKm}km`);
                    } else {
                        console.log(`   - ❌ 본콜은 있으나 좌표값이 누락됨. (DB 강제초기화 탓일 수 있음)`);
                    }
                } else {
                    console.log(`   - ❌ API 키 누락 또는 X/Y 좌표 누락`);
                }
            } catch (error) {
                console.error("서버-사이드 카카오 연산 에러:", error);
            }
            console.log(`======================================================\n`);

            securedOrder.kakaoTimeExt = timeExt;
            securedOrder.kakaoDistExt = distExt;

            const io = req.app.get("io");
            if (io) {
                // UI를 '연산 완료' 상태로 전환하여 기사님께 수동 결재 [수락] / [방출] 을 요구하는 신호 (카카오 연산 결과 포함 발송)
                io.emit("order-evaluating", securedOrder);
                console.log(`🔎 [2차 상세 검증 중] 서버-투-서버 카카오 연산 완료: ${timeExt} (기기: ${payload.deviceId})`);
            }

            // 안전장치 (가성비 연산 중 브라우저가 꺼졌거나 기사가 멍때리면 자동 방출)
            setTimeout(() => {
                if (pendingConfirmRequests.has(payload.order.id)) {
                    const heldRes = pendingConfirmRequests.get(payload.order.id);
                    pendingConfirmRequests.delete(payload.order.id);
                    if (heldRes && !heldRes.headersSent) {
                        const failResponse: DispatchConfirmResponse = { deviceId: payload.deviceId, action: 'CANCEL' };
                        heldRes.json(failResponse);
                        if (io) io.emit("order-canceled", payload.order.id);
                        console.log(`🚫 [타임아웃 자동 취소] ${securedOrder.pickup} ➡️ ${securedOrder.dropoff}`);
                    }
                }
            }, 30000);
        } else {
            res.status(400).json({ error: "step (BASIC/DETAILED) 파라미터가 누락되었습니다." });
        }
    } catch (error) {
        console.error("Orders Confirm 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// POST: 2. 관제사(사람)의 최종 판단 (수동 결재) -> 앱폰에 대답해주기
router.post("/decision/:id", (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body as { action: 'KEEP' | 'CANCEL' };

        const heldRes = pendingConfirmRequests.get(id);
        if (!heldRes || heldRes.headersSent) {
            return res.status(404).json({ error: "이미 만료되거나 승인 대기중이 아닌 오더입니다." });
        }

        // 잡고 있던 앱폰의 HTTP 통신 파이프에 비로소 판결문을 내려줌!
        pendingConfirmRequests.delete(id);
        const deviceResponse: DispatchConfirmResponse = { deviceId: 'unknown', action };
        heldRes.json(deviceResponse);

        const io = req.app.get("io");

        if (action === 'KEEP') {
            const stmt = db.prepare("UPDATE orders SET status = 'confirmed' WHERE id = ?");
            stmt.run(id);

            // 본콜이 없었다면 현재 수락한 콜을 본콜로 지정!
            if (!mainCallState) {
                const cachedOrder = pendingOrdersData.get(id);
                if (cachedOrder) {
                    mainCallState = cachedOrder;
                } else {
                    console.error("메모리에 유지된 좌표 데이터가 없습니다.");
                }
            }

            if (io) io.emit("order-confirmed", id);
            console.log(`✅ [최종 수락 완료] ID: ${id}`);
        } else {
            if (io) io.emit("order-canceled", id);
            // 취소되면 메모리에서도 비움
            pendingOrdersData.delete(id);
            console.log(`❌ [최종 뱉기(방출) 완료] ID: ${id}`);
        }

        res.json({ success: true, action });
    } catch (error) {
        console.error("Orders Decision 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

export default router;
