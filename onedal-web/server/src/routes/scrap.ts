import { Router } from "express";
import { scrapReleaseCodes } from "../core/releases";
import { isTargetApp, DEFAULT_TARGET_APP, addressOf } from "@onedal/shared";
import type { SimplifiedOfficeOrder, ScreenContextType, TargetAppType } from "@onedal/shared";
import db from "../db";
import { reportSourceOf } from "../core/helpers";
import { getUserSession } from "../state/userSessionStore";
import { ensureBusinessDay } from "../state/filterManager";
import { clientIpOf } from "../utils/clientIp";

import { touchDeviceSession } from "./devices";
import { pairSigOf, bleAdTagOf, serverIdOf } from "../state/phoneSupply";
import { markAppTooOld, clearAppTooOld } from "../state/phoneStatus";
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


// 🛰️ 같은 기기 이름이 서로 다른 곳(IP)에서 동시에 말하는지 감지 — 겹치면 한쪽의 "리스트 화면" 보고가
// 다른 쪽이 잡은 심사 콜을 강제 취소시킨다
const senderTrace = new Map<string, { ip: string; at: number; warnedAt: number }>();
// POST: 탈락 콜 빅데이터 수신 (오답노트용) 및 하트비트
/** 🧮 intel 누적 수 — 서버 하나에 표 하나라 모듈에 하나 */
let intelCountCache: number | null = null;

router.post("/", (req, res) => {
    try {
        const { data, deviceId, screenContext, isHolding, lat, lng } = req.body as {
            data: SimplifiedOfficeOrder[],
            deviceId?: string,
            screenContext?: ScreenContextType,  // [Safety Mode V3] 앱폰 화면 상태 (물리적 페이지)
            isHolding?: boolean,                // [Page/Hold 분리] 콜 처리 중 여부
            lat?: number,                       // [GPS 텔레메트리] 앱폰 위도
            lng?: number,                       // [GPS 텔레메트리] 앱폰 경도
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

        /**
         * 🚫 **블루투스 받기 전 원달앱의 보고는 거절한다** (reviews/50 ①-5 · 기사님 «가»).
         *    서버는 이제 보고 응답에 필터 · 모드 · 결재를 안 싣는다 — 옛 원달앱은 굳은 필터 · 메모리의 마지막 «자동»으로 돌다 결재 없이 안전취소(취소 횟수)로 끝날 수 있다.
         *    거절하면 옛 원달앱에 든 «서버 응답 없음 → 자동은 알람»(reviews/44)이 스스로 알람으로 내린다 — 새 길이 아니라 «답을 안 줌»이다.
         *    가름: 블루투스 원달앱은 보고에 «블루투스 공급 연결»(`supplyLinked`) 칸을 늘 싣는다 · 관제웹 폰 칸은 «원달앱 새로 깔기 필요».
         */
        if (deviceId && typeof (req.body as any).supplyLinked !== 'boolean') {
            markAppTooOld(deviceId);
            return res.status(426).json({ error: '원달앱을 새로 깔아 주세요 — 블루투스 받기 전 판입니다', code: 'APP_TOO_OLD' });
        }
        if (deviceId) clearAppTooOld(deviceId);

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
            touchDeviceSession(deviceId, userId, data.length, screenContext, io, isHolding, lat, lng, (req.body as any).screenNodeCount, (req.body as any).isScreenOn, (req.body as any).filterTally, targetApp, {
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
                suppliedMode: (req.body as any).suppliedMode,
                supplyLinked: (req.body as any).supplyLinked,
                nearbyPermitted: (req.body as any).nearbyPermitted,
                batteryExempt: (req.body as any).batteryExempt,
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

        /**
         * 앱폰의 GPS 는 관제웹이 마스터이므로 여기서 Trim 연산을 하지 않는다.
         *
         * 🔴 앱 위치를 세션에 저장하지 않는다 — 읽는 곳이 없으면 쓰기만 하는 죽은 코드다.
         *    교차 검증이 필요해지면 그때 **읽는 쪽과 함께** 만든다.
         */

        /* 📦 필터 · 모드 · 결재 · 빨리 접기 · 심사 중은 보고 응답에 안 싣는다 — 관제앱 공급 소켓 → 블루투스 한 길(reviews/50 ①-5 · state/phoneSupply · 콜 잡기를 멈추는 넷의 로그도 그쪽) */
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
        const callMemoryRound = callMemoryRoundOf(session.businessDay, simRoundForPhone());
        // 4. 응답 (해당 유저의 필터값 및 제어 명령 송신)
        res.json({
            success: true,
            apiStatus: {
                success: true,
                totalItems: totalScrap
            },
            deviceControl: {
                /* 🧹 본 콜 기억 번호 — 영업일이 바뀌거나 (개발) 시뮬 회차가 오르면 바뀌고, 원달앱이 «본 콜» 기억을 비운다 (`services/callMemoryRound.ts`) · 운영도 싣는다 */
                callMemoryRound
            },
            /* 📦 원달앱 최신·최소 판 — 표가 비면 칸 없음(앱은 아무것도 안 띄운다 · reviews/29 4단계) */
            ...scrapReleaseCodes(),
            /* 🔏 블루투스 짝 서명 — 원달앱이 관제앱에 붙기 전에 받을 길(reviews/50 ①-1 · 옛 원달앱은 모르는 칸이라 무시) */
            ...(deviceId ? { blePairSig: pairSigOf(userId, deviceId), bleAdTag: bleAdTagOf(userId), serverId: serverIdOf() } : {})   // 📶 광고 표시 — 원달앱이 블루투스 광고에 싣는다
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

