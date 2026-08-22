import { Router } from "express";
import { callFilterBlocker } from "@onedal/shared";
import type { SimplifiedOfficeOrder, ScreenContextType } from "@onedal/shared";
import db from "../db";
import { capacityFullHold, filterVersionOf } from "../core/helpers";
import { getUserSession, clearOrderTimers } from "../state/userSessionStore";
import { ensureBusinessDay, buildAppProgressKm } from "../state/filterManager";

import { touchDeviceSession } from "./devices";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { dbQueue } from "../utils/dbQueue";
import { PluginFactory } from "../core/plugins/PluginFactory";

const router = Router();

// 🧭 피기백 v2 로 말하는 기기 — 최초 감지 로그를 1회만 찍기 위한 표식 (메모리)
const v2Devices = new Set<string>();

// 🛰️ 같은 기기 이름이 서로 다른 곳(IP)에서 동시에 말하는지 감지 (2026-08-22 실측:
// 구버전 리허설 스크립트와 실폰이 같은 deviceId 로 겹치자, 폰이 잡은 심사 콜을
// 스크립트의 "리스트 화면" 보고가 2초 만에 강제 취소시켰다 — 4콜 연쇄)
const senderTrace = new Map<string, { ip: string; at: number; warnedAt: number }>();

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

        const targetApp = (req.body as any).targetApp || 'insung';
        const plugin = PluginFactory.getPlugin(targetApp);

        // logRoadmapEvent("서버", "방대한 스크랩 배열값을 intel 테이블 DB 저장");
        // 2. 비동기 Write Queue를 통해 밀려들어오는 데이터를 오류 없이 INSERT
        data.forEach(item => {
            dbQueue.runAsync(
                "INSERT INTO intel (user_id, device_id, type, pickup, dropoff, fare, timestamp, targetApp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                userId === "ADMIN_USER" ? null : userId,
                deviceId || null,
                "INTEL_BULK",
                plugin.normalizeAddress(item.pickup),
                plugin.normalizeAddress(item.dropoff),
                item.fare || 0,
                timestamp,
                targetApp
            );
        });

        // 비동기 큐이므로 정확한 즉시 개수 파악은 어렵지만 대략적으로 제공
        const countStmt = db.prepare("SELECT COUNT(*) as count FROM intel");
        const totalScrap = (countStmt.get() as { count: number })?.count || 0;

        logRoadmapEvent("서버", ` [/api/scrap 수신] User: ${userId} (${deviceId}) | ${data.length}항목 적재 중${screenContext ? ` [화면: ${screenContext}]` : ''}`);
        // console.log(`🛡️ [서버] /api/scrap 수신 직후: 서버단 2차 해시 검증 및 무효 콜 필터링 통과 완료`);
        // logRoadmapEvent("서버", "앱폰으로 부터 무수한 스크랩(intel) 데이터 및 GPS 요청 받음");

        // 3. 디바이스 생존 신고 및 화면 상태 동기화
        let deviceMode = "MANUAL";
        if (deviceId) {
            const io = req.app.get("io");
            deviceMode = touchDeviceSession(deviceId, userId, data.length, screenContext, io, isHolding, lat, lng, (req.body as any).screenNodeCount);
        }

        // logRoadmapEvent("서버", "관제탑에게 실시간 마커용 GPS(device-sessions-updated) 정보 전달");
        const session = getUserSession(userId);

        // 날이 바뀌었으면 오늘 필터를 기본 설정으로 되돌린다.
        // 관제탑보다 앱이 먼저 켜질 수 있으므로 여기에도 둔다 (같은 함수라 두 번 돌아도 무해하다).
        ensureBusinessDay(userId, req.app.get("io"));

        // 3.2. [Telemetry Ping] 프론트엔드의 타임아웃 진행바를 위한 실시간 핑 발송
        if (deviceId) {
            const evaluatingOrderId = session.deviceEvaluatingMap.get(deviceId);
            if (evaluatingOrderId) {
                const io = req.app.get("io");
                // [Phase 1 / 이슈 C-2] io.emit 은 접속한 모든 유저에게 방송된다.
                // 다른 기사의 orderId 가 남의 화면으로 새어나가므로 유저 룸으로 한정한다.
                io.to(userId).emit("telemetry-ping", { orderId: evaluatingOrderId });
            }
        }

        // 3.5. [Piggyback V2] ACK 처리 및 결재(Decision) 탑재 로직
        let piggybackDecision = undefined;

        if (deviceId) {
            // 앱이 "저번 결재 무사히 받았습니다" (ACK) 라고 보고하면, 큐와 타이머에서 깨끗이 지워줍니다.
            if (ackDecisionId && session.pendingDecisions.has(ackDecisionId)) {
                // 타이머 청소 — 키 목록은 clearOrderTimers 한 곳에만 있다
                clearOrderTimers(session, ackDecisionId);

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

        /**
         * 앱폰의 GPS 는 관제웹이 마스터이므로 여기서 Trim 연산을 하지 않는다.
         *
         * 🔴 예전에는 `(session as any).appLocation` 에 담아 뒀다 — *"나중에 관제웹 GPS와
         *    비교하려고"*. 그런데 **읽는 곳이 한 군데도 없었고** 선언에도 없는 필드였다.
         *    `pnpm audit:dead` 가 잡았다. 쓰기만 하는 저장은 죽은 코드다 — 지웠다.
         *    정말 교차 검증이 필요해지면 그때 **읽는 쪽과 함께** 만든다.
         */

        // [Phase 3 / 이슈 A1] 앱 전송 페이로드 다이어트
        // destinationGroups는 관제탑 UI가 "지역별 묶음"을 보여주기 위한 데이터로,
        // 앱의 InsungParser.loadCurrentFilter()는 이 키를 파싱조차 하지 않는다.
        // 그런데 응답의 27%(약 3.6KB)를 차지하며 매 하트비트마다 재전송되고 있었다.
        // 관제탑은 소켓(filter-updated)으로 별도 수신하므로 여기서 빼도 영향이 없다.
        // 🧹 앱이 파싱하지 않는 키도 함께 뺀다 (2026-08-22 앱 Kotlin 전수 대조 —
        //    앱이 읽는 것: isActive·isSharedMode·pickupRadiusKm·min/maxFare·destinationCity·
        //    destinationRadiusKm·excluded/destinationKeywords·customCityFilters·
        //    allowedVehicleTypes·ratePerKm·progressKm)
        const { destinationGroups, dispatchPhase, driverAction, detourRadiusKm, callDiscountPct,
                userOverrides, capacityConfidence, slotsUsed, callTarget,
                ...appFilter } = session.activeFilter as any;

        // 🧭 경로 순서 맵 — 앱의 역주행·경로 밖 상차 차단 입력 (기사님 확정 2026-08-18)
        //    첫짐(경로 없음)이면 빈 객체라 앱이 순서 검사를 건너뛴다. +2.7KB (동 211개 기준)
        appFilter.progressKm = buildAppProgressKm(session);

        // [Phase 6] 부트스트랩이 끝나기 전에는 콜 잡기를 시키지 않는다.
        // 이 구간(1~3초)의 activeFilter 는 아직 경유도 적재 차종도 반영되지 않은 미완성 상태라,
        // 그대로 내보내면 경로를 벗어난 콜을 잡을 수 있다.
        // 잘못된 필터로 잡는 것보다 잠깐 멈추는 편이 안전하다.
        if (session.isBootstrapping) {
            appFilter.isActive = false;
            console.log(`⏳ [부트스트랩 중] ${deviceId} 에게 isActive=false 로 응답 (필터 준비 중)`);
        }

        /**
         * ⛔ **적재 만석 — 콜 잡기를 멈춘다** (기사님 확정 2026-08-19).
         * 앱은 빈 allowedVehicleTypes 를 "전체 허용"으로 읽으므로(오프라인 안전망),
         * 빈 배열을 그대로 보내면 만석인데 모든 차종을 잡으러 든다.
         * 하차로 공간이 생기면 재계산이 차종 목록을 되살려 자동 복귀한다.
         * 직접콜(MANUAL)은 필터를 안 타므로 기사님이 잡는 것은 막히지 않는다.
         */
        if (capacityFullHold(session.activeFilter)) {
            appFilter.isActive = false;
            if (!session.capacityHoldNotified) {
                session.capacityHoldNotified = true;
                console.log(`⛔ [적재 만석] ${deviceId} 에게 isActive=false 로 응답 (실을 수 있는 차종 없음 — 하차하면 재개)`);
            }
        } else if (session.capacityHoldNotified) {
            session.capacityHoldNotified = false;
            console.log(`✅ [적재 만석 해제] 콜 잡기 재개 (허용 차종: ${(session.activeFilter.allowedVehicleTypes ?? []).join(', ')})`);
        }

        /**
         * 🔴 2026-08-12 — **관제탑이 한 번도 안 붙은 세션은 콜 잡기시키지 않는다.**
         *
         * 기사님: *"출근 전 앱을 먼저 연다면 기본값의 필터값이 가서
         * 잘못된 콜을 잡을 가능성이 있군."* — 실제로 그랬다.
         *
         * `bootstrapUserSession` 은 **관제웹 소켓 접속에만** 걸린다. 앱이 먼저 켜지면
         * 세션이 DB 기본값으로 만들어지고, `is_active` 가 1 이면 그대로 콜 잡기가 시작된다.
         * 어제 설정(기본 도시·기본 반경)으로 오늘 콜을 잡는 것이다.
         *
         * 위의 `isBootstrapping` 보호는 **부트스트랩이 시작된 뒤**만 막는다.
         * 시작조차 안 된 상태가 더 위험한데 그건 안 막고 있었다.
         *
         * → 하루는 **관제탑을 열어야** 시작된다. 오늘 필터를 확정할 자리가 거기이기 때문이다.
         */
        if (!session.isRestored) {
            appFilter.isActive = false;
            console.log(`🚦 [콜 잡기 대기] ${deviceId} — 관제탑이 아직 접속하지 않았습니다. ` +
                `오늘 필터가 확정되기 전에는 콜을 잡지 않습니다 (관제웹을 열어 주세요)`);
        }

        /**
         * 🔴 도착지가 정의되지 않은 필터로는 콜 잡기하지 않는다.
         *
         * 이건 "제한 없음"이 아니라 **"필터가 고장났음"** 이다 —
         * 빈 키워드를 그대로 내보내면 앱이 `isEmpty() → true` 로 읽어
         * **모든 도착지를 통과**시킨다 (`callFilterBlocker` 주석 참고).
         */
        const blocker = callFilterBlocker(session.activeFilter);
        if (blocker) {
            appFilter.isActive = false;
            console.log(`🚦 [콜 잡기 보류] ${deviceId} — ${blocker}`);
        }

        /**
         * 🧭 **피기백 규격 v2** (기사님 확정 2026-08-22 — "같은 목록을 왜 두 번 보내나").
         * 앱이 `filterVersion` 을 보내면 신프로토콜이다:
         *   ① 중복 제거 — 운행 중 progressKm 의 키 집합은 destinationKeywords 와 같다
         *      (buildAppProgressKm 이 키워드를 순회해 만든다). 신앱은 도착 목록을
         *      `키워드 ∪ progressKm 키` 로 합치므로, progressKm 에 실린 동은 키워드에서 뺀다
         *   ② 버전 게이트 — 내용 해시가 앱이 든 것과 같으면 본문을 생략한다.
         *      앱은 응답에 필터가 없으면 저장본을 유지한다 (원래 그 동작이다)
         * 필드를 안 보내는 구앱·구스크립트에는 지금 그대로 전부 보낸다 — scenario 가
         * 구프로토콜로 남아 이 호환 경로를 상시 검증한다.
         * ⚠️ 빈 필터 고장 검사(callFilterBlocker)는 위에서 **원본 기준**으로 끝났다 —
         *    여기서 비는 키워드는 "고장"이 아니라 "progressKm 쪽에 실려 있음"이다.
         */
        const speaksV2 = !!req.body && Object.prototype.hasOwnProperty.call(req.body, 'filterVersion');
        // 기기당 최초 1회만 — 새 APK 가 실제로 v2 로 말하기 시작했는지 서버 로그에서 보인다
        if (speaksV2 && deviceId && !v2Devices.has(deviceId)) {
            v2Devices.add(deviceId);
            console.log(`🧭 [피기백 v2] ${deviceId} — 신프로토콜 감지 (버전 게이트·중복 제거 작동)`);
        }

        // 🛰️ 이중 발신 감지 — 같은 기기 이름이 15초 안에 다른 IP 에서도 말하면 경고 (분당 1회)
        if (deviceId) {
            const now = Date.now();
            const prev = senderTrace.get(deviceId);
            const ip = req.ip ?? '?';
            if (prev && prev.ip !== ip && now - prev.at < 15_000 && now - prev.warnedAt > 60_000) {
                prev.warnedAt = now;
                console.warn(`🛰️⚠️ [이중 발신] ${deviceId} 가 두 곳에서 동시에 신호 중 — ${prev.ip} ↔ ${ip}. ` +
                    `리허설 스크립트와 실폰이 같이 켜져 있으면 화면 이탈 감지가 심사 콜을 강제 취소합니다 — 하나만 켜세요`);
            }
            senderTrace.set(deviceId, { ip, at: now, warnedAt: prev?.warnedAt ?? 0 });
        }
        let responseFilter: any = appFilter;
        let filterVersion: string | undefined;
        if (speaksV2) {
            const progressKeys = appFilter.progressKm ?? {};
            responseFilter = {
                ...appFilter,
                destinationKeywords: (appFilter.destinationKeywords ?? [])
                    .filter((k: string) => !(k in progressKeys)),
            };
            filterVersion = filterVersionOf(responseFilter);
            if (req.body.filterVersion === filterVersion) responseFilter = undefined;   // 안 바뀜 — 본문 생략
        }

        // logRoadmapEvent("서버", "앱폰에게 최신 필터(dispatchEngineArgs) 및 제어 명령 정보 전달");
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
            ...(filterVersion !== undefined ? { filterVersion } : {}),
            ...(responseFilter !== undefined ? { dispatchEngineArgs: responseFilter } : {}),
            decision: piggybackDecision
        });
    } catch (error) {
        console.error("Scrap POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// [Phase 1 / 이슈 C-1] GET /api/scrap 제거
//
// 무인증 + WHERE user_id 없이 intel 테이블 500건을 그대로 반환하고 있었다.
// 2026-08-09 프로덕션 실측: 토큰 없이 HTTP 200 으로 콜 327건(68KB)이 응답됐고
// pickup / dropoff / fare / user_id / device_id 가 모두 포함되어 있었다.
// 지금은 사용자가 1명이라 노출 범위가 좁지만, 기사가 늘면 전원 데이터가 나간다.
// client-app · logbook 전수 grep 결과 소비처 0건임을 확인하고 삭제했다.

export default router;

