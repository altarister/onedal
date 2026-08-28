/**
 * POST /api/orders/detail
 */

import { Router } from "express";
import type { DispatchConfirmRequest, OrderStatus, PendingOrder, SecuredOrder } from "@onedal/shared";
import { isTerminal } from "@onedal/shared";
import { parseLocationDetails, parseMockupFare, parseMockupDistance, parseMockupVehicleType, parseDetailedRawText } from "../utils/parser";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { DISPATCH_CONFIG } from "../config/dispatchConfig";
import { getUserSession } from "../state/userSessionStore";
import { evolveOrder } from "../state/orderMemory";
import { handleDecision, evaluateNewOrder, forceCancelEvaluatingOrder } from "../services/dispatchEngine";
import db from "../db";
import { countCancel } from "../core/cancelCount";

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

        // 🧠 앞의 기억(`/orders/confirm` 이 남긴 것)에서 시작한다 — 날 payload 로 시작하지 않는다.
        //    payload 에 없는 키(예: `targetApp`)가 여기서 증발하던 자리다 (2026-08-18).
        let pendingOrder: PendingOrder = evolveOrder(session, realOrderId, {
            ...payload.order,
            status: 'ORDER_SECURED_EVALUATING' as any,
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString(),
            // 👀 미리보기 딱지는 두 요청이 같은 말을 해야 한다 — 확정을 누르면 둘 다 false 로 온다
            isPreview: !!(payload as any).isPreview,
        });

        logRoadmapEvent("서버", "상하차지 주소 및 적요 텍스트 정제 연산");
        const rawText = pendingOrder.rawText;
        if (rawText) {
            // [Dumb Client / Smart Server]
            // 앱이 보내준 통짜 rawText를 서버의 파서가 완전히 해부하여 속성을 채움
            const parsedDetails = parseDetailedRawText(rawText);
            pendingOrder = { ...pendingOrder, ...parsedDetails };

            pendingOrder.pickupDetails = parseLocationDetails(rawText, "[출발지상세]");
            pendingOrder.dropoffDetails = parseLocationDetails(rawText, "[도착지상세]");

            if (!pendingOrder.fare || pendingOrder.fare <= 0) {
                pendingOrder.fare = parseMockupFare(rawText) || 0;
            }
            if (!pendingOrder.distanceKm) {
                pendingOrder.distanceKm = parseMockupDistance(rawText) || 0;
            }
            if (!pendingOrder.vehicleType) {
                pendingOrder.vehicleType = parseMockupVehicleType(rawText) || "";
            }
        }

        const checkMatch = (existingOrder: SecuredOrder | PendingOrder) => {
            const phone1 = existingOrder.pickupDetails?.[0]?.phone1;
            const phone2 = pendingOrder.pickupDetails?.[0]?.phone1;
            const isPhoneMatch = (phone1 === phone2) && !!phone1;

            const isPickupAddressMatch = existingOrder.pickup === pendingOrder.pickup;
            const isDropoffAddressMatch = existingOrder.dropoff === pendingOrder.dropoff;
            const isFareMatch = existingOrder.fare > 0 && existingOrder.fare === pendingOrder.fare;

            const p1Addr = existingOrder.pickupDetails?.[0]?.addressDetail;
            const p2Addr = pendingOrder.pickupDetails?.[0]?.addressDetail;
            const isExactAddrMatch = !!p1Addr && !!p2Addr && p1Addr === p2Addr;

            if (existingOrder.id === pendingOrder.id) return true;
            if (isPhoneMatch && isPickupAddressMatch && isDropoffAddressMatch && isFareMatch) return true;
            if (isFareMatch && isPickupAddressMatch && isDropoffAddressMatch && isExactAddrMatch) return true;
            return false;
        }

        let matchedId: string | null = null;
        /**
         * 🔴 **종결된 콜은 재열람 대상이 아니다** (2026-08-19 실사고).
         *    취소된 콜과 같은 콜(주소·요금·상세 동일)을 다시 잡자 여기가 그 취소본에
         *    매칭해 "진짜 ID" 를 돌려줬고, 새 콜은 만들어지지 않은 채 30초 타이머로
         *    죽었다 — **취소했다가 다시 잡는 정상 흐름이 영영 막힌다.**
         */
        const existingMatch = session.myOrders.filter(o => !isTerminal(o.status)).find(checkMatch);
        if (existingMatch) matchedId = existingMatch.id;

        if (matchedId) {
            console.log(`🔄 [동기화] 기존 확정 콜(ID: ${matchedId})의 재열람 인지. 진짜 ID 반환.`);
            return res.json({ deviceId: 'server', action: 'ACK', orderId: matchedId });
        }

        const io = req.app.get("io");
        // 멀티 스캔폰 대비: 해당 orderId에 대해서만 기기 충돌 체크
        // (폰A의 콜이 폰B의 다른 콜을 차단하지 않도록 격리)
        // 🔴 2026-08-18 — `'ORDER_EVALUATING'` 은 **존재하지 않는 상태값**이었다.
        //    실제 이름은 `ORDER_SECURED_EVALUATING`. 그냥 문자열 배열이라 tsc 가 못 잡았고,
        //    그래서 "서버가 연산 중인 콜"을 이 잠금 검사가 **한 번도 인식하지 못했다.**
        //    타입을 붙여 다시는 오타가 조용히 지나가지 않게 한다.
        const activeStatuses: OrderStatus[] = ['ORDER_SECURED_EVALUATING', 'ORDER_AWAITING_DECISION'];
        const targetOrder = session.pendingOrdersData.get(payload.order.id);
        if (targetOrder && activeStatuses.includes(targetOrder.status) && targetOrder.capturedDeviceId !== payload.deviceId) {
            console.log(`🔒 [Lock] ${targetOrder.capturedDeviceId} 기기가 이미 이 콜(${payload.order.id})을 평가중. 요청 기기: ${payload.deviceId}`);
            if (io) io.to(userId).emit("order-canceled", { id: payload.order.id, status: 'SAFE_CANCEL' });
            return res.json({ deviceId: 'server', action: 'CANCEL' });
        }


        session.pendingOrdersData.set(payload.order.id, pendingOrder);

        if (io) {
            console.log(`📤 [Socket 푸시] order-detail-received (${pendingOrder.id}) - 상태 승급: ${pendingOrder.status}`);
            io.to(userId).emit("order-detail-received", pendingOrder);
            logRoadmapEvent("서버", "관제탑에게 정제된 상세 텍스트(order-detail-received) 정보 전달");
        }

        logRoadmapEvent("서버", "앱폰에게 디테일 데이터 정상 수신 완료 응답 전달");

        /**
         * [Two-Track] 누가 골랐는가 — 앱의 `matchType` 이 진실 공급원이다.
         *   AUTO   = 매크로가 클릭 → 안전취소로 서버가 재심사
         *   MANUAL = 기사님이 직접 → 서버는 심사하지 않고 접수만 (기사님 의지 존중)
         *
         * ⚠️ **"100% 신뢰"라고 쓰여 있었지만 그건 사실이 아니었다.**
         *    앱의 `isAutoActive` 는 화면 전이 경합으로 뒤집힐 수 있고, 2026-08-12 에 실제로
         *    뒤집혔다 (자동 터치 직후 LIST 오탐 → 세션 리셋 → AUTO 가 MANUAL 로 보고됨).
         *    앱 쪽 원인은 `HijackService` 의 복귀 판정에서 고쳤지만, **서버가 이 값 하나에
         *    전체 흐름을 맡기는 구조는 그대로다.** 그래서 아래 두 겹을 덧댔다:
         *      · [P3] 서버가 못 읽은 값(요금·주소)은 조용히 넘기지 않고 화면에 띄운다
         *      · [C′] 평가가 실패해도 확정은 진행한다 (실패가 콜을 유령으로 만들지 않게)
         */
        /**
         * ✋ **미리보기 콜은 잡지 않는다** (기사님 확정 2026-08-22 · 용어집 §9).
         *
         * 규칙 ① 의 *"직접콜은 심사하지 않는다"* 때문에 MANUAL 콜은 여기서 **즉시 KEEP** 된다.
         * 그런데 미리보기 콜은 기사님이 **확정을 누르기 전**이라 아직 안 잡은 콜이다.
         *
         * 🔴 실측(2026-08-22 18:15): 팝업 3장을 읽고 올라온 미리보기 콜이 그대로 KEEP 되어
         *    기사님이 누른 적 없는 콜이 진행 중으로 들어갔다. KEEP 이라 30초 타이머도 안 돌았다.
         *
         * **"심사하지 않는다"와 "잡는다"는 다른 말이다.** 미리보기는 심사도 안 하고 잡지도
         * 않는다 — 판정만 보여주고 기사님의 확정을 기다린다 (규칙 ① 콜의 주인은 기사님이다).
         * 확정을 누르면 앱이 딱지 없이 다시 보내고, 그때 이 갈래로 들어와 KEEP 된다.
         */
        const isPreviewCall = !!(payload as any).isPreview;
        const isManual = !isPreviewCall
            && (pendingOrder.type?.includes("MANUAL") || payload.matchType === "MANUAL");
        const targetApp = (payload as any).targetApp || 'insung';

        if (isManual) {
            pendingOrder.type = 'MANUAL';  // 프론트엔드 배지 표시를 위해 명시적 설정
            console.log(`✋ [Two-Track MANUAL] 기사님 수동 클릭 콜. 즉시 KEEP 처리. (type=${pendingOrder.type}, matchType=${payload.matchType})`);

            /**
             * 🔴 [P3] **서버가 못 읽은 것을 숨기지 않는다.**
             *
             * 과거 계획서(`docs/troubleshooting/수동배차_동기화장애.md`)가 남긴 미완의 3단계다.
             * 그 문서는 이렇게 경고했다:
             *   *"클라이언트가 보내는 matchType 값 하나에 서버의 전체 배차 흐름이 좌우되는
             *     구조 자체가 취약합니다. **클라이언트는 언제든 거짓말할 수 있고**"*
             * Phase 1·2 만 하고 3 을 "선택적 강화"로 미뤘는데, 지금 코드에는 그 반대 주석
             * (*"앱이 보내는 matchType 을 100% 신뢰"*)이 원칙처럼 박혀 있다.
             * 그리고 2026-08-12 에 앱이 거짓말했다 — 악의가 아니라 화면 전이 경합 때문에.
             *
             * ⚠️ 다만 이걸 **관문으로 만들지 않는다.** 기사님이 정한 규칙이 있다:
             *    *"수동으로 잡은 콜은 무조건 콜이 들어 오는 거고."*
             *    서버가 못 읽었다고 기사님이 실제로 잡은 콜을 막으면 안 된다.
             *
             * → 콜은 그대로 확정한다. 대신 **못 읽었다는 사실을 그대로 남기고 화면에 띄운다.**
             *   요금 0 짜리가 조용히 장부에 들어가면 정산도 운행일지도 틀어지는데,
             *   조용하기 때문에 몇 주 뒤에나 발견된다.
             */
            const unreadable: string[] = [];
            if (!pendingOrder.fare || pendingOrder.fare <= 0) unreadable.push('요금');
            if (!pendingOrder.pickup || pendingOrder.pickup === '배차값없음') unreadable.push('상차지');
            if (!pendingOrder.dropoff || pendingOrder.dropoff === '배차값없음') unreadable.push('하차지');

            if (unreadable.length > 0) {
                const what = unreadable.join('·');
                console.warn(`🔍 [P3 무결성] 수동 콜(${pendingOrder.id}) — ${what} 를 읽지 못했습니다. ` +
                    `확정은 진행하되 관제탑에 표시합니다. (rawText ${pendingOrder.rawText?.length ?? 0}자)`);
                pendingOrder.rejectionReasons = [
                    ...(pendingOrder.rejectionReasons || []),
                    `${what} 를 읽지 못했습니다 — 관제탑에서 직접 채워 주세요`,
                ];
                if (io) io.to(userId).emit("handler-error", {
                    event: 'manual-unreadable',
                    message: `수동 콜의 ${what} 를 읽지 못했습니다. 콜은 잡았지만 값을 확인해 주세요.`,
                });
            }

            session.pendingDecisions.set(payload.order.id, { action: 'KEEP', evaluatedAt: Date.now() });
            res.json({ deviceId: 'server', action: 'ACK' }); // 🚀 즉시 응답

            /**
             * 🔴 2026-08-13 — **평가 실패가 확정을 막지 않게 한다.**
             *
             * 예전에는 이랬다:
             *     evaluateNewOrder(...).then(() => handleDecision(..., "ORDER_CONFIRMED")).catch(console.error)
             *
             * 평가는 **정보 수집**(경로·요율)이고 확정은 **기사님의 의지**다. 그런데 `.then` 이라
             * 정보 수집이 실패하면 의지가 실행되지 않았다. 순서가 거꾸로다.
             *
             * 그 결과 2026-08-12 에 유령이 남았다. 주소가 없는 콜이라 평가가 실패 →
             * `handleDecision` 이 안 돎 → **DB 에도 안 들어가고 메모리에서도 안 빠졌다.**
             * MANUAL 은 안전취소 타이머도(아래 코드가 이 분기에서 `return` 한다)
             * LIST 이탈 정리도(`devices.ts` 가 MANUAL 을 일부러 제외한다) 없어서
             * **치울 사람이 아무도 없었다.** 관제웹에만 영원히 남았다.
             *
             * ⚠️ 여기서 콜을 **지우면 안 된다.** MANUAL 무심사는 설계다 —
             *    기사님이 손으로 잡은 콜을 서버가 마음대로 버리면 안 된다
             *    (`onedal-app/docs/SCREEN_STATE_MACHINE.md`: *"기사님이 직접 확정/취소 선택"*).
             *    카카오가 잠깐 죽었다고 실제로 들고 있는 짐을 지우는 건 더 나쁜 사고다.
             *    → 지우지 말고 **확정까지 밀어붙이고, 실패했다는 사실을 화면에 남긴다.**
             */
            /**
             * 👀 **미리보기로 이미 판정했으면 다시 계산하지 않는다** (기사님 지적 2026-08-22 19:04).
             *
             * 실측: 미리보기 때 19:04:52 에 판정하고, 확정을 눌러 다시 올라오자 19:04:59 에
             * **또 판정했다.** 카카오 호출이 두 배가 되고 관제웹 카드도 두 번 바뀐다.
             *
             * 판정은 **심사 1회 · 불변 스냅샷**이다(`judgment` — 판정색 확정안 v2). 확정은
             * **같은 콜의 상태 승급**이지 새 콜이 아니다. 있는 판정을 그대로 쓰고 KEEP 만 한다.
             *
             * ⚠️ 그래서 판정은 **미리보기를 본 그 순간의 것**이다 — 기사님이 보고 누른 색과
             *    잡힌 콜의 색이 같다. 확정까지 몇 초 사이에 경로가 바뀌었다면 다음 콜을 잡을 때
             *    반영된다 (KEEP 직후 `syncDetourFilter` 가 경유를 다시 편다).
             */
            const alreadyJudged = !!(pendingOrder as any).judgment;
            if (alreadyJudged) {
                console.log(`   👀 [미리보기 → 확정] ${pendingOrder.id} — 판정은 이미 있다(심사 1회). 다시 계산하지 않고 확정만 한다`);
                handleDecision(userId, pendingOrder.id, "ORDER_CONFIRMED", io);
                return;
            }

            evaluateNewOrder(userId, pendingOrder, io, targetApp)
                .catch((err) => {
                    const msg = err?.message || String(err);
                    console.error(`⚠️ [MANUAL 평가 실패] ${pendingOrder.id} — 확정은 그대로 진행합니다:`, msg);
                    // 없는 숫자를 지어내지 않는다. 실패했다는 것을 그대로 표시한다
                    pendingOrder.kakaoTimeExt = `평가 실패 (${msg})`;
                    pendingOrder.rejectionReasons = [
                        ...(pendingOrder.rejectionReasons || []),
                        '서버 평가 실패 — 경로·요율을 계산하지 못했습니다',
                    ];
                    if (io) io.to(userId).emit("order-evaluated", pendingOrder);
                })
                .then(() => handleDecision(userId, pendingOrder.id, "ORDER_CONFIRMED", io))
                .catch((err) => {
                    /**
                     * 확정까지 실패하면 이 콜은 **DB 에 없다.** 그런데 관제웹은 이미 카드를
                     * 그려 놨다 — 화면이 거짓말을 하는 상태다. 여기가 마지막 출구이므로
                     * 여기서만 청소한다. 조용히 두면 그것이 유령이 된다.
                     */
                    console.error(`🚨 [MANUAL 확정 실패] ${pendingOrder.id}:`, err?.message || err);
                    forceCancelEvaluatingOrder(userId, pendingOrder.id, io);
                    if (io) io.to(userId).emit("handler-error", {
                        event: 'manual-confirm',
                        message: `수동 콜(${pendingOrder.pickup} → ${pendingOrder.dropoff}) 확정에 실패했습니다. 배차망에서 직접 확인해 주세요.`,
                    });
                });
            return;
        }

        // [Option B] 롱폴링 대기를 풀고, 결재 큐에 올려둔 뒤 즉시 202 Accepted 반환
        session.pendingDecisions.set(payload.order.id, { action: null, evaluatedAt: Date.now() });
        res.status(202).json({ message: "Accepted. Piggyback evaluation pending" }); // 🚀 즉시 응답

        // 백그라운드로 평가 진행 (카카오 API 지연 방어)
        evaluateNewOrder(userId, pendingOrder, io, targetApp).catch(console.error);

        const warningTimer = setTimeout(() => {
            if (session.pendingDecisions.has(payload.order.id)) {
                if (io) {
                    logRoadmapEvent("서버", "관제탑에게 지연 위급 상황(safecancel-warning) 정보 전달");
                    io.to(userId).emit("safecancel-warning", {
                        orderId: payload.order.id,
                        deviceId: payload.deviceId,
                        pickup: pendingOrder.pickup,
                        dropoff: pendingOrder.dropoff,
                        message: "⚠️ 30초 안전취소!",
                        timestamp: new Date().toISOString(),
                    });
                }
            }
        }, DISPATCH_CONFIG.WAITING_WARNING_MS);

        const timeoutTimer = setTimeout(() => {
            const decision = session.pendingDecisions.get(payload.order.id);
            if (decision) {
                // ✅ [Phase 1 방어] KEEP 결재가 이미 내려진 콜은 절대 취소하지 않는다
                if (decision.action === 'KEEP') {
                    session.pendingDecisions.delete(payload.order.id);
                    console.log(`🛡️ [Phase 1 방어] 콜(${payload.order.id})은 KEEP 결재 완료 상태. 앱 ACK 미수신이지만 콜 유지.`);
                    return; // 취소하지 않고 리턴
                }

                // KEEP이 아닌 경우(미결재/CANCEL)만 기존 로직대로 취소
                //
                // 🔴 **지우기 전에 장부에 남긴다** (2026-08-18 — 취소 저장의 네 번째 경로).
                //    결재 취소·화면 이탈은 고쳤는데 이 타임아웃 경로만 남아 있었다.
                //    안전취소는 배차망 취소 횟수(10회)에 들어가므로 한 건도 새면 안 된다 (용어집 §2-1).
                //    같은 클래스가 네 번째다 — 취소 경로가 여럿인데 저장을 경로마다 붙인 탓이다.
                session.pendingDecisions.delete(payload.order.id);
                forceCancelEvaluatingOrder(userId, payload.order.id, io);   // 저장 + 캐시 정리 + order-canceled
                Array.from(session.deviceEvaluatingMap.entries()).forEach(([k, v]) => {
                    if (v === payload.order.id) session.deviceEvaluatingMap.delete(k);
                });

                countCancel(session, payload.deviceId, payload.order.id, 'TIMEOUT', undefined, io);

                if (io) {
                    io.to(userId).emit("order-canceled", { id: payload.order.id, status: 'SAFE_CANCEL' });
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
