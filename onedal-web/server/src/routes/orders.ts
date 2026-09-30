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
import { restoreWhere, RESTORABLE_STATUSES, IN_PROGRESS_STATUSES, restoreWindow, isEvaluating, isTargetApp, DEFAULT_TARGET_APP, isCapturedVia, safeCancelSecOf, SERVER_CLEANUP_EXTRA_SEC } from "@onedal/shared";
import db from "../db";
import { readWaitTimes } from "../core/waitTimes";
import { getUserSession, dropOrderTimer } from "../state/userSessionStore";
import { rememberOrder } from "../state/orderMemory";
import { forceCancelEvaluatingOrder, handleDecision } from "../services/dispatchEngine";
import { OrderEvaluator } from "../core/engine/OrderEvaluator";
import { isHeldReserved } from "../services/reservedOrders";
import { getDeviceMode } from "./devices";
import { parsePolyline, parseSectionEnds, parseSectionStops, parseSectionDriveMin } from "../services/routeComposer";
import { updateActiveFilter } from "../state/filterManager";
import { requireAuth } from "../middlewares/authMiddleware";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { dbQueue } from "../utils/dbQueue";
import { slog } from "../utils/fileLogger";
import { reportSourceOf } from "../core/helpers";

const router = Router();

// GET: 대시보드 새로고침 시 기존 콜 목록 전달
router.get("/", requireAuth, (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ error: "Unauthorized" });

        // 오늘 날짜(자정 이후)의 복구 대상 오더를 가져옴
        //
        // 🔴 상태를 손으로 나열하지 않는다 — 나열하면 상차한 콜·하차한 콜을 빠뜨려
        //    새로고침하면 진행 중이던 콜과 완료됨 탭이 비어 버린다.
        // 🗓️ 미완료 콜은 영업일(자정) 기준으로 어제부터 살린다 — 전날 상차·다음날 배송 운행이 깨지지 않게.
        // 복구 쿼리(restoreAndRecalculateSession)와 **같은 창**을 써야 한다 —
        // 어긋나면 소켓에는 있는데 HTTP 에는 없는 콜이 생겨 새로고침마다 깜빡인다.
        const { todayStartIso, unfinishedSinceIso } = restoreWindow(Date.now());

        const statusPlaceholders = RESTORABLE_STATUSES.map(() => '?').join(', ');
        /* 🗓️ 창은 shared `restoreWhere` 한 벌 — 재부팅 복구와 같다 · «오늘 하차»도 (자정 넘긴 운행) */
        const win = restoreWhere(Date.now());
        const stmt = db.prepare(
            `SELECT * FROM orders
             WHERE userId = ? AND status IN (${statusPlaceholders})
               AND ${win.sql}
             ORDER BY timestamp ASC`
        );
        /* 📅 보관 중인 내일 콜은 오늘 목록에 안 싣는다 — 소켓이 `reserved` 로 따로 싣는다 · 가름은 되살리기와 같은 한 벌
              «오늘»은 세션의 영업일 — 진행 중 콜로 자정 전환이 미뤄지면 소켓과 같은 날을 본다 */
        const today = getUserSession(userId).businessDay;
        const rows = (stmt.all(userId, ...RESTORABLE_STATUSES, ...win.params) as any[])
            .filter(r => !isHeldReserved({ reservedFor: r.reserved_for, status: r.status }, today));

        /**
         * 🗺️ **장부의 문자열을 좌표 배열로 되돌려 내보낸다** (실측 사고).
         *
         * `routePolyline` 은 DB 에 JSON 문자열로 산다. 행을 `SELECT *` 로 읽어 **그대로**
         * 보냈더니 관제웹이 배열인 줄 알고 `.filter()` 를 부르다 화면이 통째로 죽었다.
         * 되돌리는 규칙은 `parsePolyline` 한 곳에만 있다 (규칙 ③).
         */
        res.json({
            orders: (rows as any[]).map(r => ({
                ...r,
                routePolyline: parsePolyline(r.routePolyline),
                /** 🎨 구간 경계도 함께 편다 — 궤적과 같은 운명이라야 지도가 색을 잃지 않는다 */
                sectionEnds: parseSectionEnds(r.sectionEnds),
                /** 🧭 구간 주인도 함께 편다 — 셋이 같이 살아야 지도가 색을 낸다 */
                sectionStops: parseSectionStops(r.sectionStops),
                /**
                 * ⏱️ **구간 주행분** — 이것이 없으면 화면이
                 *    경로 홀더를 못 골라 **지도가 직선으로 물러난다** (주석).
                 *    넷은 한 운명이라 **같이** 편다.
                 */
                sectionDriveMin: parseSectionDriveMin(r.sectionDriveMin),
            })),
        });
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

        /**
         * 📄 **픽커 상세 화면의 글자를 통째로 남긴다** (기사님 확정).
         *
         * 픽커 상세에는 리스트에 없는 것이 다 있다 — 배송 km · 「17:04까지 픽업」·
         * 「17:18까지 배송」· 물품 규격 · 수익 분해 · 오더번호. **어떤 칸으로 나눌지는
         * 수락 뒤 화면을 실물로 본 다음에 정한다**(내일 캡처) — 그때까지 원문으로 받아 둔다.
         *
         * ⚠️ **인성은 여기 안 걸린다** — `targetApp` 이 픽커일 때만이다. 인성은 상세를
         *    팝업 3장으로 따로 모으므로 이 칸이 늘 null 이다 (규칙 ④ — 지어내지 않는다).
         * ⚠️ 저장은 «기록»이지 판정 입력이 아니다 — 비동기 큐라 실패해도 선점을 안 막는다.
         */
        if ((payload as any).targetApp === 'kakaopicker' && payload.order?.rawText) {
            dbQueue.runAsync(
                "INSERT INTO intel (user_id, device_id, type, pickup, dropoff, fare, timestamp, targetApp, itemSize, pickupDistanceKm, tagsText, rawDetailText, reserved, reservedDay, reservedAt, source) " +
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                userId === "ADMIN_USER" ? null : userId,
                payload.deviceId,
                "PICKER_DETAIL",          // 리스트 훑기(INTEL_BULK)와 갈라 둔다
                payload.order.pickup ?? "",
                payload.order.dropoff ?? "",
                payload.order.fare ?? 0,
                new Date().toISOString(),
                'kakaopicker',
                (payload.order as any).itemSize ?? null,
                (payload.order as any).pickupDistance ?? null,
                (payload.order as any).tagsText ?? null,
                payload.order.rawText,
                /* 📅🏷️ 같은 콜의 목록 줄(INTEL_BULK)과 같은 칸 — 상세 행만 빠지면 통계가 «모름»에 쌓인다 (reviews/23·25) */
                typeof (payload.order as any).reserved === 'boolean' ? ((payload.order as any).reserved ? 1 : 0) : null,
                (payload.order as any).reservedDay ?? null,
                (payload.order as any).reservedAt ?? null,
                reportSourceOf((payload as any).source),
            );
            slog('화면', `📄 [픽커 상세 보관] ${payload.order.fare ?? 0}원 · ${payload.order.rawText.length}자 — 칸 나누기는 실물 캡처 뒤에`);
        }

        const io = req.app.get("io");

        // 즉시 응답 (앱은 멈추지 않고 상세 페이지 긁으러 진입해야 함)
        logRoadmapEvent('통신', "서버", "앱폰에게 상세 정보 스크래핑을 즉시 진행하라고 응답 전달");
        res.json({ success: true, message: "1차 수신 완료. 상세 페이지 내용을 긁어서 POST /api/orders/detail 로 보내주세요." });
        /* 🏃 판정 재료(좌표 · 단독 길찾기)를 미리 출발 — /detail 판정이 같은 질문이면 받아 쓴다 · 세션은 읽기만 (OrderEvaluator.prefetch) */
        const prefetchApp = isTargetApp((payload as any).targetApp) ? (payload as any).targetApp : DEFAULT_TARGET_APP;
        void new OrderEvaluator(prefetchApp).prefetch(userId, payload.order);
        const session = getUserSession(userId);

        const previousEvaluatingId = session.deviceEvaluatingMap.get(payload.deviceId);

        if (previousEvaluatingId && previousEvaluatingId !== payload.order.id && previousEvaluatingId !== "unknown") {
            const prevDecision = session.pendingDecisions.get(previousEvaluatingId);
            // 이미 KEEP 결재가 내려진 콜은 새 콜 진입 시에도 삭제하지 않음 (다중 배차 유지)
            if (!prevDecision || prevDecision.action !== 'KEEP') {
                slog('콜단계', `🧹 [자동 정리] 새 콜 진입 감지! 기존 평가 중이던 콜(${previousEvaluatingId}) 백그라운드 강제 취소`);
                forceCancelEvaluatingOrder(userId, previousEvaluatingId, io);
            }
        }

        if (payload.order.id && payload.order.id !== "unknown") {
            session.deviceEvaluatingMap.set(payload.deviceId, payload.order.id);
        }

        const deviceMode = getDeviceMode(payload.deviceId, userId);
        const pendingOrder: PendingOrder = {
            ...payload.order,
            status: 'ORDER_PRE_SECURED' as OrderStatus,
            capturedDeviceId: payload.deviceId,
            capturedAt: payload.capturedAt || new Date().toISOString(),
            // 어느 배차망에서 온 콜인가 — 원장에 남긴다 (값 표준은 shared 한 벌 · 픽커_수집.md §6-전)
            targetApp: isTargetApp((payload as any).targetApp) ? (payload as any).targetApp : DEFAULT_TARGET_APP,
            /**
             * 🖱️ 잡은 방식 — 6하원칙의 «어떻게» (기사님 확정).
             * 🔴 기록 전용. 직접콜 보호는 여전히 matchType 만 본다 (#75 재발 방지) —
             *    모르는 값·구앱(미전송)은 null 로 남긴다. 지어내지 않는다 (규칙 ④).
             */
            capturedVia: isCapturedVia((payload as any).capturedVia) ? (payload as any).capturedVia : null,
            /* ⏩ 앱이 알람 모드로 목록에서 눌러 연 상세인가 — 빨리 접기 대상(판단용 · capturedVia 는 기록 전용이라 따로) · 모르면 없음 */
            ...(typeof (payload as any).openedByApp === 'boolean' ? { openedByApp: (payload as any).openedByApp } : {}),
            /**
             * 👀 **미리보기 콜** — 확정 전에 팝업 3장을 읽어 판정만 받아 보는 콜.
             *
             * 🔴 **딱지는 벗겨지기만 한다.** 기사님이 확정을 누르면 앱이 같은 콜을
             *    `isPreview` 없이 다시 보내는데, 그때 `false` 로 덮여 보통 콜이 된다.
             *    반대(보통 콜 → 미리보기)는 없다 — 잡은 콜을 안 잡은 것으로 되돌리면
             *    취소 카운트가 새고, 그건 배차망 10회 패널티와 어긋난다.
             */
            isPreview: !!(payload as any).isPreview,
            isSimulated: deviceMode === 'SIMULATION',
        } as PendingOrder;

        if (pendingOrder.id && pendingOrder.id !== "unknown") {
            rememberOrder(session, pendingOrder);
        }

        if (io) {
            slog('통신', `📤 [Socket 푸시] order-evaluating (${pendingOrder.id}) - 상태: ${pendingOrder.status}`);
            io.to(userId).emit("order-evaluating", pendingOrder);
            slog('콜단계', `⏱️ [1차 선점 수신] ${pendingOrder.pickup} ➡️ ${pendingOrder.dropoff} (기기: ${payload.deviceId})`);
            logRoadmapEvent('콜단계', "서버", "앱폰으로 부터 가로챈 '1차 오더 확정' 요청 받음");
            logRoadmapEvent('콜단계', "서버", "관제탑에게 이 콜을 선점했음(order-evaluating) 정보 전달");

            /**
             * 🔒 **선점 중이라고 콜 잡기를 끄지 않는다** (기사님 · 실주행 04:58 오송읍).
             *
             * 예전에는 여기서 `isActive: false` 를 보냈다. 그런데 앱은 판정 첫 줄에서 그 값만 보고
             * 돌아서므로(`InsungParser.judge` 조건 0), **목록에 콜이 보여도 판정조차 안 했다** —
             * 10초마다 「🔒 평가 보류」만 찍혔고 오송읍 셋을 잡는 데 3분 25초가 걸렸다.
             *
             * 🔴 **`isActive=false` 는 「만석」이라는 뜻으로 이미 확정돼 있다** (`scrap.ts` 의
             *    `capacityFullHold` · 기사님 «1톤 두 개는 사고»). 한 신호에 뜻이 둘이면 앱이 못 가른다.
             *    만석은 그 자리에서 그대로 끈다 — 여기서 빼도 그 규칙은 안 깨진다.
             * 🔴 선점 중이라는 사실은 `evaluatingNow` 로 간다 (`scrap.ts` 가 조립할 때 싣는다).
             *    앱은 그것을 보고 **판정은 하고 클릭만 미룬다** — 앞 콜이 결재되면 다음 스캔에서 바로 잡는다.
             */
            logRoadmapEvent('콜단계', "서버", "선점 중이라는 사실을 evaluatingNow 로 앱에 알린다 (콜 잡기는 안 끈다)");

            /**
             * 🔴 **안전망은 조건 없이 건다** — 조건부면 안전망이 아니다.
             *
             * 필터가 꺼진 채 들어온 확정(특히 MANUAL 콜)에도 걸려야 한다. 안 걸리면 앱이 리스트로
             * 빠져나갔을 때 관제탑 카드가 영원히 남고 콜 잡기가 통째로 멈춘다.
             *
             * ⚠️ 타이머는 **ID 를 저장해 취소 가능하게** 한다 (CLAUDE.md 규칙 ② 좀비 타이머).
             *    저장하지 않으면 콜이 정상 처리된 뒤에도 30초 뒤 깨어나 사고를 친다.
             */
            /**
             * ⏱️ **몇 초인가는 그 콜 배차망의 값이다** (DB).
             * 🔴 픽커는 안전취소가 없다(수락하기가 곧 계약) — 서버는 잡은 콜을 스스로 치우지 않는다(규칙 ①).
             *    원달앱이 «상세를 본 뒤 목록으로 돌아왔다»고 알리면 `devices.ts` 가 치운다.
             * 🛟 **폰이 끊기면 수락 안 한 미리보기는 `devices.ts` 가 치운다** (#155) — 앱이 끊김을 스스로 알릴 때와
             *    생존신고가 끊길 때(통신 두절)다. 그때는 «목록으로 돌아왔다»가 영영 안 온다. 수락하면 딱지가 벗겨져 건드리지 않는다.
             */
            const cancelSec = safeCancelSecOf(readWaitTimes(userId), pendingOrder.targetApp);
            /**
             * ⏱️ **남은 판정 시간 — 화면에 적을 숫자일 뿐 콜을 끄지 않는다** (기사님 확정).
             *
             * 기사님: *"타이머로 미리보기 켜고 끄기 하는 기능은 빼. 미리보기 끄는 건 그 미리보기 판정을 연
             * 스캔폰의 상태값 즉 상세페이지일 때만 노출하고 페이지를 이탈하면 끄는 걸로."*
             *
             * 🔴 **미리보기에는 안전취소 타이머를 걸지 않는다.** 안전취소는 **잡은 콜**을 위약금 없이 무르는
             *    장치다 (규칙 ②). 미리보기는 아직 안 잡은 콜이라 무를 것이 없고, 시간으로 끄면 폰 화면과
             *    어긋난다 — 끄는 기준은 하나여야 한다 (`devices.leftDetail`).
             * ⏱️ 배차망별 값: 인성 · 화물24시는 안전취소 시간, 픽커는 상세 대기 시간. 셋 다 DB 기본 30초.
             */
            if ((pendingOrder as any).isPreview) {
                const holdSec = cancelSec ?? readWaitTimes(userId).pickerAlarmDetailSec;
                pendingOrder.judgeUntil = Date.now() + holdSec * 1000;
                slog('콜단계', `👀 [미리보기] ${pendingOrder.id} — 남은 판정 시간 ${holdSec}초 (표시용 · 끄는 것은 폰 화면이 정한다)`);
            } else if (cancelSec != null) {
                const graceTimer = setTimeout(() => {
                    session.activeTimers.delete(`presecured_${pendingOrder.id}`);
                    const cached = session.pendingOrdersData.get(pendingOrder.id);
                    // 🔴 여기도 상태 목록을 손으로 적고 있었다. `shared` 의
                    //    `EVALUATING_STATUSES` 와 값이 같았지만, 한쪽만 늘어나면 갈라진다.
                    if (cached && isEvaluating(cached.status)) {
                        slog('콜단계', `💀 [서버 안전취소 타이머] ${cancelSec}초 경과 강제 취소 (ID: ${pendingOrder.id}). 현재 상태: ${cached.status}`);
                        handleDecision(userId, pendingOrder.id, "SAFE_CANCEL", io);
                    }
                }, cancelSec * 1000);
                /* 같은 콜의 앞 핸들은 먼저 끈다 — /confirm 재시도가 겹쳐 넣으면 좀비 타이머가 남는다 */
                dropOrderTimer(session, `presecured_${pendingOrder.id}`);
                session.activeTimers.set(`presecured_${pendingOrder.id}`, graceTimer);
            } else {
                slog('콜단계', `👀 [픽커] ${pendingOrder.id} — 안전취소가 없는 배차망이라 서버 타이머를 걸지 않는다 (규칙 ①)`);
            }
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
        slog('결재', `⚖️ [REST Decision 수신] ID: ${payload.orderId}, Action: ${payload.action} (앱에서 직통)`);

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
