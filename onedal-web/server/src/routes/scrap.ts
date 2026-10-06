import { Router } from "express";
import { modeForPhone } from "@onedal/shared";
import { allowanceOf } from "../core/allowance";
import { scrapReleaseCodes } from "../core/releases";
import { isTargetApp, DEFAULT_TARGET_APP, addressOf } from "@onedal/shared";
import type { SimplifiedOfficeOrder, ScreenContextType, TargetAppType, DeviceModeType } from "@onedal/shared";
import db from "../db";
import { filterVersionOf, reportSourceOf } from "../core/helpers";
import { rememberSentFilterVersion } from "../core/phoneCheck";
import { getUserSession } from "../state/userSessionStore";
import { ensureBusinessDay, ensureReservedPickupList } from "../state/filterManager";
import { appFilterOf } from "../state/appFilter";
import { clientIpOf } from "../utils/clientIp";

import { touchDeviceSession } from "./devices";
import { modeSentToPhone, pairSigOf } from "../state/phoneSupply";
import { ackDecision, foldRemainMsOf } from "../state/decisions";
import { simRoundForPhone } from "./sim";
import { callMemoryRoundOf } from "../services/callMemoryRound";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import { dbQueue } from "../utils/dbQueue";
import { slog } from "../utils/fileLogger";
import { noteScreenWords } from "../services/screenWords";
import { recalcRouteIfStopsChanged } from "../services/dispatchEngine";
import { authDevice, deviceTokenOf, deviceLabelOf } from "../core/deviceAuth";

/** 🚧 앱이 안 연 까닭 열쇠 — 짧은 영문 열쇠만 받는다(모르는 값은 버린다 · 뜻은 shared `OPEN_BLOCKED`) */
const openBlockedOf = (v: unknown): string | undefined =>
    typeof v === 'string' && /^[a-zA-Z]{1,32}$/.test(v) ? v : undefined;

const router = Router();

// 🧭 피기백 v2 로 말하는 기기 — 최초 감지 로그를 1회만 찍기 위한 표식 (메모리)
const v2Devices = new Set<string>();

// 🛰️ 같은 기기 이름이 서로 다른 곳(IP)에서 동시에 말하는지 감지 — 겹치면 한쪽의 "리스트 화면" 보고가
// 다른 쪽이 잡은 심사 콜을 강제 취소시킨다
const senderTrace = new Map<string, { ip: string; at: number; warnedAt: number }>();
/** ⏩ foldAfter 를 폰에 처음 실어 보낸 콜 — 처음 알림 로그를 한 번만 남긴다(최근 500) */
const foldNotified = new Set<string>();
// POST: 탈락 콜 빅데이터 수신 (오답노트용) 및 하트비트
/** 🧮 intel 누적 수 — 서버 하나에 표 하나라 모듈에 하나 */
let intelCountCache: number | null = null;

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
        /** 🏷️ 실물 앱인가 시뮬레이터인가 — 보고 한 칸(한 보고 = 한 화면). 모르는 값·옛 앱은 null (규칙 ④) */
        const body = req.body as { source?: unknown; screenWords?: Parameters<typeof noteScreenWords>[2] };
        const source = reportSourceOf(body.source);

        // 1. 🔑 연결 안 된 폰 · 틀린 토큰은 거절 — 폰 문 한 곳 (core/deviceAuth · reviews/29 1단계 D·E)
        const auth = authDevice(deviceId, deviceTokenOf(req));
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        const userId = auth.userId;

        const timestamp = new Date().toISOString();

        // 배차망 코드는 shared 표준 한 벌만 믿는다 — 모르는 값은 기본값으로 (픽커_수집.md §6-전)
        const targetApp = isTargetApp((req.body as any).targetApp)
            ? (req.body as any).targetApp as TargetAppType : DEFAULT_TARGET_APP;
        /* 📰 화면에서 정의에 없거나 잡음으로 뺀 글자 — 모아 센다 (reviews/24 · 없는 보고는 지나간다) */
        if (body.screenWords) noteScreenWords(userId, targetApp, body.screenWords);

        // logRoadmapEvent("서버", "방대한 스크랩 배열값을 intel 테이블 DB 저장");
        // 2. 비동기 Write Queue를 통해 밀려들어오는 데이터를 오류 없이 INSERT
        data.forEach(item => {
            dbQueue.runAsync(
                "INSERT INTO intel (user_id, device_id, type, pickup, dropoff, fare, timestamp, targetApp, itemSize, pickupDistanceKm, tagsText, vehicleType, deliveryDistanceKm, scheduleText, postTime, rawText, pickupX, pickupY, dropoffX, dropoffY, verdict, reserved, reservedDay, reservedAt, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                userId,
                deviceId || null,
                "INTEL_BULK",
                addressOf(targetApp, item.pickup),
                addressOf(targetApp, item.dropoff),
                item.fare || 0,
                timestamp,
                targetApp,
                // 🌐 픽커 수집 필드 셋 — 인성·24시 콜은 안 보내므로 null (픽커_수집.md §5-①)
                (item as any).itemSize ?? null,
                (item as any).pickupDistance ?? null,
                (item as any).tagsText ?? null,
                /**
                 * 📋 **리스트 화면이 주는 것을 버리지 않는다** (기사님 지시).
                 *    앱은 여섯 칸을 다 읽어 올리는데 여기서 **아홉 칸을 버리고 있었다** —
                 *    그래서 검산이 차종·배송거리를 «못 잰 축»으로 적었다. 자세한 것은
                 *    `db.ts` 의 intel `vehicleType` 주석에 있다 (칸을 판 자리가 원천).
                 * 🔴 **망마다 분기하지 않는다** — 안 주는 망은 그 칸이 null 이고,
                 *    어느 망인지는 `targetApp` 이 답한다.
                 */
                (item as any).vehicleType ?? null,
                (item as any).deliveryDistance ?? null,
                (item as any).scheduleText ?? null,
                (item as any).postTime ?? null,
                (item as any).rawText ?? null,
                (item as any).pickupX ?? null,
                (item as any).pickupY ?? null,
                (item as any).dropoffX ?? null,
                (item as any).dropoffY ?? null,
                /* 🗳️ 앱이 낸 판정 — 화면이 다시 재지 않게 */
                (item as any).verdict ?? null,
                /* 📅 예약 표시·날·시각 — 받아 적기만 (reviews/23 1단계) · 참/거짓이 아니면 모름(NULL) */
                typeof (item as any).reserved === 'boolean' ? ((item as any).reserved ? 1 : 0) : null,
                (item as any).reservedDay ?? null,
                (item as any).reservedAt ?? null,
                source
            );
        });

        /**
         * 📚 **원문 개수는 처음 한 번만 센다 · 그 뒤엔 넣는 줄 수만큼 더한다** (원달앱 화면 숫자 apiStatus.totalItems).
         *    보고마다 표 전체를 세면 원문이 쌓일수록 느려진다(지우는 곳이 없어 늘기만 한다). 비동기 큐라 방금 넣은 줄도 미리 더한다.
         *    픽커 상세 줄(orders.ts)은 여기서 안 세어 화면 숫자는 목록 줄 수다 · reset:calls 는 서버를 다시 띄워 다시 센다.
         */
        if (intelCountCache === null) {
            intelCountCache = (db.prepare("SELECT COUNT(*) as count FROM intel").get() as { count: number })?.count || 0;
        } else {
            intelCountCache += data.length;
        }
        const totalScrap = intelCountCache;

        if (data.length > 0) logRoadmapEvent('통신', "서버", ` [/api/scrap 수신] User: ${userId} (${deviceLabelOf(deviceId)}) | ${data.length}항목 적재 중${screenContext ? ` [화면: ${screenContext}]` : ''}`);
        // console.log(`🛡️ [서버] /api/scrap 수신 직후: 서버단 2차 해시 검증 및 무효 콜 필터링 통과 완료`);
        // logRoadmapEvent("서버", "앱폰으로 부터 무수한 스크랩(intel) 데이터 및 GPS 요청 받음");

        // 3. 디바이스 생존 신고 및 화면 상태 동기화
        let deviceMode = "MANUAL";
        if (deviceId) {
            const io = req.app.get("io");
            /**
             * 🧬 **폰이 «들고 온» 필터 지문** (현황판 담당 요청 ②).
             *    아래 v2 게이트가 이 값을 **대조에만** 쓰고 버렸다 — 현황판이 폰 탭에서
             *    «메인폰은 새 필터, 서브폰은 두 판 전»을 말하려면 남아 있어야 한다.
             * 🔴 **서버가 내려보낼 값(`filterVersion`)이 아니라 «요청에 실려 온 것»이다.**
             */
            const appFilterVersion = typeof (req.body as any)?.filterVersion === 'string'
                ? (req.body as any).filterVersion as string : undefined;
            deviceMode = touchDeviceSession(deviceId, userId, data.length, screenContext, io, isHolding, lat, lng, (req.body as any).screenNodeCount, (req.body as any).isScreenOn, (req.body as any).filterTally, targetApp, {
                appVersion: (req.body as any).appVersion,
                workStage: (req.body as any).workStage,
                workStageStep: (req.body as any).workStageStep,
                workStageSeconds: (req.body as any).workStageSeconds,
                appliedMode: (req.body as any).appliedMode,
                effectiveMode: (req.body as any).effectiveMode,
                filterVersion: appFilterVersion,
                openBlocked: openBlockedOf((req.body as any).openBlocked),
                listHeaderHidden: typeof (req.body as any).listHeaderHidden === 'boolean' ? (req.body as any).listHeaderHidden : undefined,
                screenPage: typeof (req.body as any).screenPage === 'string' ? (req.body as any).screenPage : undefined,
                screenOverlay: typeof (req.body as any).screenOverlay === 'string' ? (req.body as any).screenOverlay : undefined,
            });
        }

        const session = getUserSession(userId);

        // 날이 바뀌었으면 오늘 필터를 기본 설정으로 되돌린다.
        // 관제탑보다 앱이 먼저 켜질 수 있으므로 여기에도 둔다 (같은 함수라 두 번 돌아도 무해하다).
        /* 📅 날이 바뀌며 예약 콜이 오늘 콜이 됐을 수 있다 — 정거장이 바뀌었으면 경로를 다시 잰다 (reviews/23 B-1) */
        if (ensureBusinessDay(userId, req.app.get("io"))) void recalcRouteIfStopsChanged(userId, req.app.get("io"), '영업일 전환');

        // 3.2. [Telemetry Ping] 프론트엔드의 타임아웃 진행바를 위한 실시간 핑 발송
        if (deviceId) {
            const evaluatingOrderId = session.deviceEvaluatingMap.get(deviceId);
            if (evaluatingOrderId) {
                const io = req.app.get("io");
                // io.emit 은 접속한 모든 유저에게 방송된다.
                // 다른 기사의 orderId 가 남의 화면으로 새어나가므로 유저 룸으로 한정한다.
                io.to(userId).emit("telemetry-ping", { orderId: evaluatingOrderId });
            }
        }

        // 3.5. [Piggyback V2] ACK 처리 및 결재(Decision) 탑재 로직
        let piggybackDecision = undefined;

        if (deviceId) {
            // 앱이 "저번 결재 무사히 받았습니다" (ACK) 라고 보고하면 치운다 — 관제앱 공급 소켓의 받았음과 같은 함수(state/decisions)
            if (ackDecisionId) ackDecision(req.app.get("io"), session, userId, ackDecisionId, '보고');

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
                    slog('결재', `📦 [Piggyback V2] 텔레메트리 편에 결재(${decisionData.action})를 태워 보냅니다! (orderId: ${evaluatingOrderId})`);
                }
            }
        }

        /**
         * 앱폰의 GPS 는 관제웹이 마스터이므로 여기서 Trim 연산을 하지 않는다.
         *
         * 🔴 앱 위치를 세션에 저장하지 않는다 — 읽는 곳이 없으면 쓰기만 하는 죽은 코드다.
         *    교차 검증이 필요해지면 그때 **읽는 쪽과 함께** 만든다.
         */

        /**
         * 📦 **앱에 내려갈 필터는 `appFilterOf` 한 곳이 만든다** — 운영센터 · 관제웹도 같은 함수로 «폰이 받는 값»을 읽는다.
         *    함수는 로그 · 세션 쓰기를 안 한다. 내일 콜 목록 재기(세션 캐시)와 아래 로그 · 만석 알림 깃발은 이 폰 문의 몫이다.
         */
        const reservedList = ensureReservedPickupList(session, userId);
        const { filter: appFilter, holds } = appFilterOf(session, userId, auth.deviceId, reservedList);

        // 부트스트랩이 끝나기 전에는 콜 잡기를 시키지 않는다.
        // 이 구간(1~3초)의 activeFilter 는 아직 경유도 적재 차종도 반영되지 않은 미완성 상태라,
        // 그대로 내보내면 경로를 벗어난 콜을 잡을 수 있다.
        // 잘못된 필터로 잡는 것보다 잠깐 멈추는 편이 안전하다.
        if (holds.bootstrapping) {
            slog('필터', `⏳ [부트스트랩 중] ${deviceLabelOf(deviceId)} 에게 isActive=false 로 응답 (필터 준비 중)`);
        }

        /**
         * ⛔ **적재 만석 — 콜 잡기를 멈춘다** (기사님 확정).
         * 앱은 빈 allowedVehicleTypes 를 "전체 허용"으로 읽으므로(오프라인 안전망),
         * 빈 배열을 그대로 보내면 만석인데 모든 차종을 잡으러 든다.
         * 하차로 공간이 생기면 재계산이 차종 목록을 되살려 자동 복귀한다.
         * 직접콜(MANUAL)은 필터를 안 타므로 기사님이 잡는 것은 막히지 않는다.
         */
        if (holds.capacityFull) {
            if (!session.capacityHoldNotified) {
                session.capacityHoldNotified = true;
                slog('필터', `⛔ [적재 만석] ${deviceLabelOf(deviceId)} 에게 isActive=false 로 응답 (실을 수 있는 차종 없음 — 하차하면 재개)`);
            }
        } else if (session.capacityHoldNotified) {
            session.capacityHoldNotified = false;
            slog('필터', `✅ [적재 만석 해제] 콜 잡기 재개 (허용 차종: ${(session.activeFilter.allowedVehicleTypes ?? []).join(', ')})`);
        }

        /**
         * 🔴 **관제탑이 한 번도 안 붙은 세션은 콜 잡기시키지 않는다.**
         *
         * 기사님: *"출근 전 앱을 먼저 연다면 기본값의 필터값이 가서
         * 잘못된 콜을 잡을 가능성이 있군."*
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
        if (holds.notRestored) {
            slog('필터', `🚦 [콜 잡기 대기] ${deviceLabelOf(deviceId)} — 관제탑이 아직 접속하지 않았습니다. ` +
                `오늘 필터가 확정되기 전에는 콜을 잡지 않습니다 (관제웹을 열어 주세요)`);
        }

        /**
         * 🔴 도착지가 정의되지 않은 필터로는 콜 잡기하지 않는다.
         *
         * 이건 "제한 없음"이 아니라 **"필터가 고장났음"** 이다 —
         * 빈 키워드를 그대로 내보내면 앱이 `isEmpty() → true` 로 읽어
         * **모든 도착지를 통과**시킨다 (`callFilterBlocker` 주석 참고).
         */
        if (holds.blocker) {
            slog('필터', `🚦 [콜 잡기 보류] ${deviceLabelOf(deviceId)} — ${holds.blocker}`);
        }

        /**
         * 🧭 **피기백 규격 v2** — 앱이 `filterVersion` 을 보내면 버전 게이트를 쓴다:
         *   내용 해시가 앱이 든 것과 같으면 본문을 생략한다. 앱은 응답에 필터가 없으면 저장본을 유지한다.
         * 필드를 안 보내는 구앱·구스크립트에는 늘 전부 보낸다 — scenario 가 구프로토콜로 남아 이 길을 상시 검증한다.
         * 📋 하차 동은 전부 하차 목록(destinationKeywords) 한 칸에 싣는다 — 경로 위 동도 같은 목록이다. 원달앱은 이 목록만 본다.
         */
        const speaksV2 = !!req.body && Object.prototype.hasOwnProperty.call(req.body, 'filterVersion');
        // 기기당 최초 1회만 — 새 APK 가 실제로 v2 로 말하기 시작했는지 서버 로그에서 보인다
        if (speaksV2 && deviceId && !v2Devices.has(deviceId)) {
            v2Devices.add(deviceId);
            slog('통신', `🧭 [피기백 v2] ${deviceLabelOf(deviceId)} — 신프로토콜 감지 (버전 게이트·중복 제거 작동)`);
        }

        // 🛰️ 이중 발신 감지 — 같은 기기 이름이 15초 안에 다른 IP 에서도 말하면 경고 (분당 1회 · 경고 전용 — 다른 일은 이 값을 안 본다)
        //    IP 는 폰의 실제 IP — 실서버는 클라우드플레어를 거쳐 req.ip 가 중계 에지라, 에지가 바뀌면 폰 한 대로도 경고가 났다.
        //    ⚠️ 리허설 스크립트와 실폰이 같은 집 인터넷이면 실제 IP 도 같아 진짜 이중 발신을 못 잡는다(잡으려면 앱이 기동 번호를 보내야 한다).
        if (deviceId) {
            const now = Date.now();
            const prev = senderTrace.get(deviceId);
            const ip = clientIpOf(req);
            if (prev && prev.ip !== ip && now - prev.at < 15_000 && now - prev.warnedAt > 60_000) {
                prev.warnedAt = now;
                console.warn(`🛰️⚠️ [이중 발신] ${deviceLabelOf(deviceId)} 가 두 곳에서 동시에 신호 중 — ${prev.ip} ↔ ${ip}. ` +
                    `리허설 스크립트와 실폰이 같이 켜져 있으면 화면 이탈 감지가 심사 콜을 강제 취소합니다 — 하나만 켜세요`);
            }
            senderTrace.set(deviceId, { ip, at: now, warnedAt: prev?.warnedAt ?? 0 });
        }
        let responseFilter: any = appFilter;
        let filterVersion: string | undefined;
        if (speaksV2) {
            /* 🧬 판 글자는 설정의 지문이다 — «지금 심사 중인가»(순간 상태)는 넣지 않는다. 넣으면 상세 ↔ 목록마다 판이 갈려 앱이 막아 둔 콜을 다시 판정한다.
               심사 중인가는 응답 맨 위 칸(evaluatingNow)으로 늘 간다. 본문에도 남긴다 — 맨 위를 못 읽는 옛 앱이 판이 바뀔 때 받게 */
            const { evaluatingNow: _live, ...versioned } = responseFilter;
            filterVersion = filterVersionOf(versioned);
            // 📱 폰에 실제로 싣는 이 지문을 기억한다 — 시작 전 점검이 폰의 지문과 비교한다 (core/phoneCheck)
            if (deviceId) rememberSentFilterVersion(deviceId, filterVersion);
            if (req.body.filterVersion === filterVersion) responseFilter = undefined;   // 안 바뀜 — 본문 생략
        }

        /* ⏩ 빨리 접기 — 이 기기의 심사 중 콜에 foldAfterSec 이 있으면 남은 초(서버 시계). 폰은 받은 뒤 그 초에 목록으로 돌아간다 · 판정 시각은 안 보낸다(폰 시계와 섞지 않게) */
        const foldOrderId = deviceId ? session.deviceEvaluatingMap.get(deviceId) : undefined;
        /* 🔴 remainSec 은 **정수**(올림) — 원달앱 FoldAfter 가 Int 로 받아 소수(9.5)면 응답 전체를 버린다. 정밀한 값은 remainMs(정수 ms) · 셈은 공급 소켓 결재와 같은 함수 */
        const foldRemainMs = foldRemainMsOf(session, foldOrderId);
        const foldAfter = foldOrderId && foldRemainMs != null
            ? { orderId: foldOrderId, remainSec: Math.ceil(foldRemainMs / 1000), remainMs: foldRemainMs }
            : undefined;
        /* ⏩ 이 콜의 foldAfter 를 폰에 처음 실어 보낸 때 한 줄 — «판정 뒤 첫 응답부터 갔나»를 로그로 가른다(폰의 빈 보고는 로그에 안 남아서) */
        if (foldAfter && !foldNotified.has(foldAfter.orderId)) {
            foldNotified.add(foldAfter.orderId);
            if (foldNotified.size > 500) foldNotified.delete(foldNotified.values().next().value as string);
            slog('판정', `⏩ [빨리 접기] 폰에 처음 알림 ${foldAfter.orderId.slice(-6)} — 남은 ${(foldAfter.remainMs / 1000).toFixed(1)}초`);
        }

        // logRoadmapEvent("서버", "앱폰에게 최신 필터(dispatchEngineArgs) 및 제어 명령 정보 전달");
        const callMemoryRound = callMemoryRoundOf(session.businessDay, simRoundForPhone());
        /* 🛑 관제웹 없음 · 허락 꺼짐 · 다른 폰도 자동이면 자동 명령도 폰에는 알람 — 관제앱 공급 소켓과 같은 함수(state/phoneSupply · 표 shared `modeTable.ts`) */
        const phoneMode = deviceId ? modeSentToPhone(deviceId, userId, deviceMode as DeviceModeType) : modeForPhone(deviceMode as DeviceModeType, allowanceOf(userId).autoLive);
        // 4. 응답 (해당 유저의 필터값 및 제어 명령 송신)
        res.json({
            success: true,
            apiStatus: {
                success: true,
                totalItems: totalScrap
            },
            deviceControl: {
                /* 🎛️ 자동 잡기 허락이 안 살았거나 관제웹이 없으면 AUTO 명령도 폰에는 ALARM — 관제웹 명령은 그대로 (reviews/29 6단계 · reviews/44) */
                mode: phoneMode,
                /* 🧹 본 콜 기억 번호 — 영업일이 바뀌거나 (개발) 시뮬 회차가 오르면 바뀌고, 원달앱이 «본 콜» 기억을 비운다 (`services/callMemoryRound.ts`) · 운영도 싣는다 */
                callMemoryRound
            },
            ...(filterVersion !== undefined ? { filterVersion } : {}),
            /* 🔒 심사 중인가 — 판이 같아 필터 본문을 생략할 때도 간다. 앱은 맨 위를 먼저 읽는다(없으면 필터 안 값) */
            evaluatingNow: appFilter.evaluatingNow,
            ...(foldAfter ? { foldAfter } : {}),
            /* 📦 원달앱 최신·최소 판 — 표가 비면 칸 없음(앱은 아무것도 안 띄운다 · reviews/29 4단계) */
            ...scrapReleaseCodes(),
            ...(responseFilter !== undefined ? { dispatchEngineArgs: responseFilter } : {}),
            decision: piggybackDecision,
            /* 🔏 블루투스 짝 서명 — 원달앱이 관제앱에 붙기 전에 받을 길(reviews/50 ①-1 · 옛 원달앱은 모르는 칸이라 무시) */
            ...(deviceId ? { blePairSig: pairSigOf(userId, deviceId) } : {})
        });
    } catch (error) {
        console.error("Scrap POST 에러:", error);
        res.status(500).json({ error: "서버 오류 발생" });
    }
});

// GET /api/scrap 제거
//
// 무인증 + WHERE user_id 없이 intel 을 그대로 내주는 문은 두지 않는다 — 기사가 늘면 전원의
// pickup / dropoff / fare 가 토큰 없이 나간다. 읽는 곳도 없다.

export default router;

