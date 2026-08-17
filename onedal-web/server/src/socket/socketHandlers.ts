import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../config/env";
import { getUserDevicesSnapshot } from "../routes/devices";
import { getRegionsByCity } from "../geoResolver";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import type { AutoDispatchFilter, Milestone, CargoReport, CallTarget, PhaseKey, PhaseSettings } from "@onedal/shared";
import { cargoMismatchRatio, DEFAULT_DETOUR_RADIUS_KM, PHASE_KEYS, judgmentFromRow, judgmentToRow } from "@onedal/shared";
import db from "../db";
import { OrderRepository } from "../repositories/OrderRepository";
import { PlaceRepository } from "../repositories/PlaceRepository";
import { getUserSession, getAllActiveUserIds } from "../state/userSessionStore";
import { buildOrderSync } from "../core/helpers";
import { recalculateDetourFilter, handleDecision, recalculateKakaoRoute, bootstrapUserSession, reportMilestone, undoMilestone, setCallTarget, createHomeReturn } from "../services/dispatchEngine";
import { updateActiveFilter, ensureBusinessDay, saveBaseFilter, savePhaseSettings, trimTraveled } from "../state/filterManager";
import { processDriverMovement, getCityRegionsWithRadius } from "../services/geoService";




/**
 * 소켓 핸들러에서 던진 예외가 **서버 프로세스를 죽이지 않게** 감싼다.
 *
 * Socket.IO 는 리스너의 예외를 잡아주지 않는다. 그래서 DB 제약 위반 한 번에
 * `SqliteError` 가 uncaught 로 올라가 **서버 전체가 종료됐다.**
 * (2026-08-10 스모크에서 stop_cargo_reports 의 FK 위반으로 실제 발생)
 *
 * 기사님 운행 중에 이런 일이 나면 콜 잡기가 통째로 멈춘다.
 * 한 오더의 입력이 실패하는 것과 서버가 죽는 것은 전혀 다른 무게다.
 */
function safeOn(socket: Socket, event: string, handler: (...args: any[]) => any) {
    socket.on(event, async (...args: any[]) => {
        try {
            await handler(...args);
        } catch (err: any) {
            console.error(`🚨 [소켓 핸들러 실패] ${event}:`, err?.message || err);
            socket.emit("handler-error", { event, message: err?.message || "처리 중 오류가 발생했습니다" });
        }
    });
}

export function registerSocketHandlers(io: Server) {

    // 1. Socket.io JWT 핸드셰이크 인증 미들웨어
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token 
                    || socket.handshake.headers?.authorization?.split(' ')[1];
        
        if (!token) {
            console.log("❌ [Socket] 인증 토큰 누락 접속 거부");
            return next(new Error('인증 토큰 없음'));
        }
        
        try {
            const decoded = jwt.verify(token, jwtSecret()) as any;
            socket.data.user = decoded; // { id, email, name, role }
            next();
        } catch (err) {
            console.log("❌ [Socket] 토큰 검증 실패:", err);
            next(new Error('토큰 만료 또는 위조'));
        }
    });

    // 2. 개별 유저 연결 수립
    io.on("connection", (socket: Socket) => {
        const userId = socket.data.user.id;
        const role = socket.data.user.role;
        console.log(`🔌 [소켓 연결] 유저 접속: ${socket.data.user.name} (${userId})`);

        const session = getUserSession(userId);

        // 방 참여 (개별 유저 룸) — 부트스트랩이 emit 하기 전에 반드시 먼저 들어가 있어야 한다
        socket.join(userId);

        /**
         * 🔴 새로 붙은 화면은 **아무것도 모른다.** 직전 전송본을 비워 다음 틱에 무조건 한 번
         *    나가게 한다 (재접속·새로고침·두 번째 탭). 이게 "1초 안에 자동 치유"의 실체다.
         */
        session.lastOrderSyncJson = null;
        session.lastFilterJson = null;   // 필터도 마찬가지 — 새 화면은 아무것도 모른다

        // 날이 바뀌었으면 오늘 필터를 기본 설정으로 되돌린다.
        // 🔴 부트스트랩보다 **먼저** 해야 한다 — 부트스트랩이 이 필터를 읽어 경유을 만든다
        ensureBusinessDay(userId, io);
        if (role === "ADMIN") {
            socket.join("admin_room");
        }

        // 접속 시 초기 데이터 전송 (유저별 등록 기기 목록 포함)
        socket.emit("telemetry-devices", getUserDevicesSnapshot(userId));

        // [Phase 6] 필터는 부트스트랩이 끝난 뒤 **완성본으로 한 번만** 보낸다.
        //
        // 예전에는 여기서 곧바로 filter-init 을 쐈는데, 그 시점의 activeFilter 는
        // 아직 복구 전(첫짐·경유 없음)이라 관제탑이 첫짐 → 합짐으로 깜빡였고
        // 앱폰도 그 사이 잘못된 필터를 가져갔다.
        if (!session.isRestored) {
            // 첫 접속: 부트스트랩이 완료 시점에 filter-init 을 룸으로 emit 한다
            logRoadmapEvent("서버", "관제탑 소켓 접속 — 부트스트랩 시작 (필터는 확정 후 1회 전송)");
            bootstrapUserSession(userId, io);
        } else {
            // 이미 부트스트랩이 끝난 세션(단순 새로고침·재연결)은 현재 확정 필터를 즉시 전달
            socket.emit("filter-init", {
                activeFilter: session.activeFilter,
                baseFilter: session.baseFilter,
                phaseSettings: session.phaseSettings,
                basePhaseSettings: session.basePhaseSettings
            });
            logRoadmapEvent("서버", `관제탑에게 확정 필터(filter-init) 전달 — minFare=${session.activeFilter.minFare}`);
        }

        /**
         * 🎯 **판정 기준 — 콜 필터와 별도 이벤트로 오간다** (2026-08-16).
         *
         * 🔴 `filter-updated` 페이로드에 얹지 않는다. 기사님 확정:
         *    *"필터와 완전 분리 격리되어 각각 따로 작동해야 한다."*
         *    한 페이로드에 태우면 필터가 바뀔 때마다 판정 기준이 딸려 나가고, 관제웹도
         *    둘을 한 덩어리로 다루게 된다 — 그러면 갈라 놓은 의미가 없다.
         *
         * 🔴 **앱에는 가지 않는다.** 이건 소켓이고 앱은 REST 피기백만 쓴다 (규칙 ⑤-1).
         */
        socket.emit("judgment-init", session.judgment);

        /**
         * 🔴 **놓친 뒤에도 받을 수 있어야 한다** (2026-08-16 실측).
         *
         * 위 `judgment-init` 은 **접속 순간에 한 번** 나간다. 그런데 관제웹은 기사님이
         * ⚙️ 설정 → 「판정 기준」 탭을 **여는 순간** 비로소 구독한다 — 그때는 이미 지나갔다.
         * 그래서 값이 안 오고 폼이 잠긴 채였다. 기사님: *"값을 바꿀 수 없다."*
         *
         * 콜 필터가 같은 문제를 이미 겪었고 `request-filter-init` 으로 풀었다. 같은 방식이다.
         */
        socket.on("request-judgment", () => {
            socket.emit("judgment-init", session.judgment);
        });

        safeOn(socket, "save-judgment", (cfg: unknown) => {
            /**
             * 기사님 5번: *"수정을 요청받은 데이터셋은 **한 번에** DB에 넣는다."*
             * → 트랜잭션 하나. 절반만 반영된 상태를 만들지 않는다.
             *
             * `judgmentFromRow` 가 **범위를 벗어난 값을 잘라 준다** —
             * 음수 가중치나 101점 경계가 들어와 색이 뒤집히는 것을 막는다.
             */
            const safe = judgmentFromRow(judgmentToRow(cfg as any));
            const row = judgmentToRow(safe);
            const cols = Object.keys(row);
            db.transaction(() => {
                db.prepare(`INSERT OR IGNORE INTO user_judgment (user_id) VALUES (?)`).run(userId);
                db.prepare(
                    `UPDATE user_judgment SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE user_id = ?`
                ).run(...cols.map(c => row[c]), userId);
            })();

            session.judgment = safe;   // 그릇이 하나다 — "오늘만" 이 없다
            console.log(`🎯 [판정 기준 저장] ${cols.length}개 값 · 🔵 ${safe.color.honeyMin}점 · 🟢 ${safe.color.normalMin}점`);
            io.to(userId).emit("judgment-updated", safe);
        });

        socket.on("request-filter-init", () => {
            console.log(`📡 [웹 수신] request-filter-init (초기 필터 동기화 요청) - userId: ${userId}`);
            const session = getUserSession(userId);
            // [Phase 6] 아직 확정 전이면 응답하지 않는다. 부트스트랩이 끝나면서 filter-init 이 나간다.
            if (session.isBootstrapping) {
                console.log(`⏳ [부트스트랩 중] filter-init 응답 보류 — 확정 후 자동 전송됩니다`);
                return;
            }
            socket.emit("filter-init", { 
                activeFilter: session.activeFilter,
                baseFilter: session.baseFilter,
                phaseSettings: session.phaseSettings,
                basePhaseSettings: session.basePhaseSettings
            });
            logRoadmapEvent("서버", `관제탑 요청으로 필터(filter-init) 정보 재전달\n - activeFilter(현재 콜 필터): minFare=${session.activeFilter.minFare}\n - baseFilter(기본설정): minFare=${session.baseFilter.minFare}`);
        });

        // 프론트에서 필터 변경 시
        safeOn(socket, "update-filter", (newFilter: Partial<AutoDispatchFilter>) => {
            logRoadmapEvent("서버", `관제탑으로 부터 필터 변경(update-filter) 요청 받음. 수신 데이터: ${JSON.stringify(newFilter)}`);
            
            const isTargetChanged = newFilter.destinationRadiusKm !== undefined && newFilter.destinationRadiusKm !== session.activeFilter.destinationRadiusKm;
            const isDetourChanged = newFilter.detourRadiusKm !== undefined && newFilter.detourRadiusKm !== session.activeFilter.detourRadiusKm;

            /**
             * 🔴 2026-08-12 — **첫짐 지리 연산을 여기서 지웠다.**
             *
             * 예전에는 여기서 `getCityRegionsWithRadius` 를 직접 부르고
             * `destinationKeywords` · `destinationGroups` 만 채워 넘겼다.
             *
             * 그러면 `recalculateDerivedFields` 는 `changes.destinationKeywords` 가
             * 이미 있으니 **자기 계산을 건너뛴다** — 그래서 `customCityFilters`(시 별칭)가
             * 영영 안 채워졌다. 관제웹으로 필터를 바꾸는 순간 동명이인 방어가 풀린 것이다.
             *
             * 같은 파생값을 두 곳에서 만들면 **한쪽만 고쳐진다.** 입력만 넘기고
             * 파생은 `filterManager` 한 곳에 맡긴다 (`destinationCity`/`destinationRadiusKm`
             * 가 changes 에 있으면 거기서 알아서 다시 계산한다).
             */

            // 합짐 모드: 경유 반경 또는 도착 반경 변경 시
            if (session.activeFilter.isSharedMode && (isDetourChanged || isTargetChanged)) {
                const cRadius = newFilter.detourRadiusKm ?? session.activeFilter.detourRadiusKm ?? DEFAULT_DETOUR_RADIUS_KM;
                const dRadius = newFilter.destinationRadiusKm ?? session.activeFilter.destinationRadiusKm ?? 10;
                
                const newRegions = recalculateDetourFilter(userId, cRadius, dRadius);
                if (newRegions) {
                    // 셋을 **한 벌로** 넘긴다. 예전에는 앞의 둘만 넘겨서 시 별칭이 빠졌고,
                    // 앱의 2단계 필터(시 + 동 교차 확인)가 조용히 꺼졌다
                    newFilter.destinationKeywords = newRegions.destinationKeywords;
                    newFilter.destinationGroups = newRegions.destinationGroups;
                    newFilter.customCityFilters = newRegions.customCityFilters;
                }
            }
            
            /**
             * `saveAsDefault` — **"앞으로 계속"** 을 고르셨을 때만 평소 설정까지 바꾼다.
             *
             * 기사님이 이 화면의 의도를 이렇게 설명하셨다:
             *   *"사용자 설정에서 디폴트 값을 저장해 두고 … 운행중을 시작하기 전
             *     오늘 콜이 많이 나올 만한 곳으로 필터 값을 바꾸고, 복귀콜이나 그런 것 하면
             *     그 값으로 돌아오게 하려는 의도였다."*
             *
             * 그래서 기본은 **오늘만**이다 (activeFilter, 자정에 되돌아간다).
             * 다만 화면에 그 구분이 없어서 "왜 내일 또 원래대로냐"를 알 수 없었다.
             * 이제 관제웹이 어느 쪽인지 **명시적으로 말한다.**
             */
            const { saveAsDefault, ...filterChanges } = newFilter as Partial<AutoDispatchFilter> & { saveAsDefault?: boolean };

            if (saveAsDefault) {
                logRoadmapEvent("서버", "관제탑이 '앞으로 계속' 로 저장 요청 — baseFilter(평소 설정)까지 갱신");
                saveBaseFilter(userId, filterChanges, io);
            } else {
                logRoadmapEvent("서버", "관제탑에게 변경 적용된 필터(filter-updated) 정보 전달 (오늘만 — DB 저장 안함)");
            }
            updateActiveFilter(userId, filterChanges, io);
        });

        /**
         * 국면별 필터 설정 저장 (§2-4) — **한 탭이 자기 국면만 고친다.**
         *
         * 평면 필터(update-filter)와 통로를 나눈 이유: 관제탑이 어느 국면을 고쳤는지
         * 알아야 하는데, 평면에는 그 정보가 없다. 평면으로 보내면 서버가 "지금 국면"으로
         * 추측할 수밖에 없어 **합짐 탭에서 고친 값이 첫짐에 저장되는** 사고가 난다.
         */
        safeOn(socket, "save-phase-settings", (payload: { phase: PhaseKey, settings: PhaseSettings, saveAsDefault?: boolean }) => {
            if (!payload?.phase || !PHASE_KEYS.includes(payload.phase)) {
                console.warn(`⚠️ [국면 저장] 모르는 국면이라 무시합니다: ${payload?.phase}`);
                return;
            }
            logRoadmapEvent("서버", `관제탑 국면 설정 저장(save-phase-settings): ${payload.phase} ${payload.saveAsDefault ? '앞으로 계속' : '오늘만'} · ${JSON.stringify(payload.settings)}`);
            savePhaseSettings(userId, payload.phase, payload.settings, !!payload.saveAsDefault, io);
        });

        // 프론트에서 현재 위치 전송 시 (지도 등 활용 및 Master GPS 용도)
        /**
         * 🔴 **`update-my-location` 을 지웠다** (2026-08-14).
         *    `session.driverLocation` 을 **직접** 덮어써 `processDriverMovement` 를 우회했다 —
         *    지나온 구간 제거도 도착 감지도 안 돌았을 것이다. 그런데 **쏘는 곳이 한 곳도 없었다**
         *    (git 전체 이력에서 관제웹·앱 어디에도 없다. 태어날 때부터 죽어 있었다).
         *    위치가 서버로 들어오는 문은 아래 `dashboard-gps-update` **하나뿐**이다.
         */

        // ━━━ [관제웹 Master GPS 수신부] ━━━
        socket.on("dashboard-gps-update", (loc: { lat: number, lng: number, source?: string }) => {
            session.driverLocationIsFallback = false;   // 진짜 GPS 가 임시 출발지를 이긴다
            processDriverMovement(userId, loc.lat, loc.lng, session,
                (uid, filterUpdate) => updateActiveFilter(uid, filterUpdate, io),
                // 지나온 구간 제거는 전용 통로 — 파생 재계산을 거치지 않는다
                (uid) => trimTraveled(uid, io),
                loc.source,
                /**
                 * 도착 확정 → 마일스톤 자동 기록 (2026-08-17 재설계).
                 * 🔴 GPS 가 기록하는 마일스톤은 **ARRIVED_* 둘뿐**이다 — 상차·하차 완료는
                 *    물리 행위라 GPS 가 모른다. 절대 자동으로 찍지 않는다.
                 * 역행·중복은 reportMilestone 안에서 걸러진다 (canReportMilestone + DB UNIQUE).
                 */
                async (uid, stop) => {
                    const milestone = stop.stopType === 'pickup' ? 'ARRIVED_PICKUP' as const : 'ARRIVED_DROPOFF' as const;
                    const result = await reportMilestone(uid, stop.orderId, milestone, 'GPS', io);
                    if (result.success && !result.duplicated) {
                        console.log(`📤 [Socket 푸시] milestone-log (${stop.orderId.slice(0, 8)} · GPS 도착)`);
                        io.to(uid).emit("milestone-log", { orderId: stop.orderId, milestones: OrderRepository.getMilestones(stop.orderId) });
                        // auto-arrived — 죽은 문이던 것을 이 기능으로 살렸다 (관제웹이 원래 듣고 있었다)
                        console.log(`📤 [Socket 푸시] auto-arrived (${stop.orderId.slice(0, 8)} · ${stop.stopType})`);
                        io.to(uid).emit("auto-arrived", {
                            orderId: stop.orderId,
                            stopType: stop.stopType,
                            message: `${stop.stopType === 'pickup' ? '상차지' : '하차지'} 도착을 감지했습니다 (GPS)`,
                        });
                    }
                },
                // 근접 예고 — 도착전 통화 시점 (용어집 §10)
                (uid, stop, distKm) => {
                    console.log(`📤 [Socket 푸시] next-stop-approaching (${stop.orderId.slice(0, 8)} · ${stop.stopType})`);
                    io.to(uid).emit("next-stop-approaching", {
                        orderId: stop.orderId,
                        stopType: stop.stopType,
                        distanceKm: Math.round(distKm * 10) / 10,
                    });
                },
            );
        });

        // 배차 심사 수락/거절
        safeOn(socket, "decision", async ({ orderId, action }: { orderId: string, action: 'ORDER_CONFIRMED' | 'SAFE_CANCEL' | 'ORDER_RELEASED_BY_ME' | 'ORDER_RELEASED_BY_OFFICE' }) => {
            console.log(`⚖️ [소켓 Decision] User: ${userId}, ID: ${orderId}, Status Action: ${action}`);
            const result = await handleDecision(userId, orderId, action, io);
            socket.emit("decision-ack", result);
        });

        // 카카오 경로 재탐색
        safeOn(socket, "recalculate-route", async ({ orderId, priority }: { orderId: string, priority: string }) => {
            const result = await recalculateKakaoRoute(userId, orderId, priority, io);
            socket.emit("recalculate-route-ack", result);
        });

        // ━━━ [운행 완료 처리] ━━━
        // [Phase 8.2] 관제탑에서 누르는 상차/하차 보고.
        // 앱의 화면 자동 감지(AUTO_SCRAPE)가 붙어도 이 핸들러는 그대로 두면 된다 —
        // 진입점만 늘어날 뿐 본체(reportMilestone)는 하나이기 때문이다.
        safeOn(socket, "report-milestone", async (data: { orderId: string, milestone: Milestone, occurredAt?: string, predictedAt?: string }) => {
            logRoadmapEvent("서버", `관제탑으로부터 ${data.milestone} 보고 수신`);
            const result = await reportMilestone(userId, data.orderId, data.milestone, 'MANUAL_WEB', io, data.occurredAt, data.predictedAt);
            socket.emit("milestone-result", { orderId: data.orderId, ...result });
            socket.emit("milestone-log", { orderId: data.orderId, milestones: OrderRepository.getMilestones(data.orderId) });
        });

        /**
         * 잘못 누른 마일스톤 되돌리기.
         * 기사님 기준: *"단계별로 DB 에 저장하고 … 수정이 가능해야 한다."*
         */
        safeOn(socket, "undo-milestone", async (data: { orderId: string, milestone: Milestone }) => {
            if (!data.orderId || !data.milestone) throw new Error("orderId 또는 milestone 누락");
            const result = await undoMilestone(userId, data.orderId, data.milestone, io);
            socket.emit("milestone-result", { orderId: data.orderId, ...result });
            socket.emit("milestone-log", { orderId: data.orderId, milestones: OrderRepository.getMilestones(data.orderId) });
        });

        // [Phase 8.4] 통화 결과 / 현장 확인 기록
        safeOn(socket, "save-cargo-report", (data: { orderId: string } & CargoReport) => {
            const { orderId, ...report } = data;
            if (!orderId) throw new Error("orderId 누락");
            OrderRepository.upsertCargoReport(orderId, userId, report);

            const all = OrderRepository.getCargoReports(orderId);
            const pick = (st: string, k: string) => all.find(r => r.stopType === st && r.kind === k);
            const ratio = cargoMismatchRatio(pick(report.stopType, 'DECLARED'), pick(report.stopType, 'ACTUAL'));

            const label = report.stopType === 'pickup' ? '상차지' : '하차지';
            const kindLabel = report.kind === 'DECLARED' ? '통화 신고' : '현장 실측';
            // 옛 `sizeClass` 를 찍고 있어 화면이 보내는 값과 무관하게 늘 '-' 였다
            console.log(`📞 [${label} ${kindLabel}] ${report.unit || report.sizeClass || '-'} × ${report.quantity ?? '-'} · ${report.handling || '-'}`);

            // 신고와 실측이 크게 어긋나면 그대로 진행하면 안 된다.
            // 퀵사무실에 확인해 수행 여부를 다시 정할 수 있게 관제탑에 띄운다.
            if (ratio !== null && (ratio >= 1.5 || ratio <= 0.5)) {
                console.warn(`⚠️ [신고 불일치] ${label} — 실측이 신고의 ${ratio.toFixed(1)}배`);
                io.to(userId).emit("cargo-mismatch", { orderId, stopType: report.stopType, ratio });
            }

            socket.emit("cargo-report-saved", { orderId, reports: all });

            // 🔴 2026-08-11 — 여기서 필터를 다시 파생시키지 않아, 짐 양을 신고해도
            //    잔여 용량(allowedVehicleTypes)이 **다음 이벤트가 올 때까지 그대로**였다.
            //    적재 계산을 고쳐도(T2) 이 호출이 없으면 화면에 반영되지 않는다.
            //
            //    무겁지 않다 — recalculateDerivedFields 의 needsGeoRecalc 가드 때문에
            //    `{}` 로는 지리 연산이 돌지 않고, broadcastFilter 는 관제웹 소켓으로만 나간다.
            //    앱은 POST /api/scrap 응답 꼬리에서 필터를 끌어가므로 폰으로 밀려가지 않는다.
            updateActiveFilter(userId, {}, io);
        });

        /**
         * [T8] 착불 현금을 현장에서 받았는가.
         *
         * 기사님: *"착불현금은 완료 누르기 전에 내가 받을꺼야."*
         * 하차 완료를 누르기 **직전**에 관제웹이 보낸다.
         *
         * 🔴 이 경로가 없어서 `unpaidAmount`·`settlementStatus` 를 쓰는 코드가
         *    프로젝트 전체에 하나도 없었다. 운행일지 미수금 화면은 늘 비어 있었다.
         */
        safeOn(socket, "cod-collected", (data: { orderId: string, received: boolean, amount?: number }) => {
            if (!data.orderId) throw new Error("orderId 누락");

            const session = getUserSession(userId);
            const order = session.myOrders.find(o => o.id === data.orderId)
                       ?? session.pendingOrdersData.get(data.orderId);
            // 금액은 서버가 아는 운임을 쓴다 — 화면이 보낸 값을 그대로 믿지 않는다
            const amount = order?.fare ?? data.amount ?? 0;

            OrderRepository.setCodCollected(data.orderId, userId, data.received, amount);
            console.log(`💵 [착불 ${data.received ? '수령' : '미수'}] ${data.orderId.slice(0, 8)} ${amount.toLocaleString()}원`);
            logRoadmapEvent("서버", `[착불] ${data.received ? '현장 수령' : '미수금 등록'} ${amount}원`);

            io.to(userId).emit("settlement-updated", {
                orderId: data.orderId,
                ...OrderRepository.getSettlement(data.orderId),
            });
        });

        safeOn(socket, "request-settlement", (data: { orderId: string }) => {
            socket.emit("settlement-updated", {
                orderId: data.orderId,
                ...OrderRepository.getSettlement(data.orderId),
            });
        });

        // 카드 헤더에서 약속 시각만 바꾼다. 짐 정보는 건드리지 않는다
        safeOn(socket, "set-stop-deadline", (data: { orderId: string, stopType: 'pickup' | 'dropoff', deadlineAt: string | null }) => {
            if (!data.orderId) throw new Error("orderId 누락");
            OrderRepository.setStopDeadline(data.orderId, userId, data.stopType, data.deadlineAt);
            const label = data.stopType === 'pickup' ? '상차' : '하차';
            console.log(`🕒 [${label} 약속 시각] ${data.orderId.slice(0, 8)} → ${data.deadlineAt?.slice(11, 16) ?? '해제'}`);
            socket.emit("cargo-report-saved", { orderId: data.orderId, reports: OrderRepository.getCargoReports(data.orderId) });
        });

        safeOn(socket, "request-milestones", (data: { orderId: string }) => {
            socket.emit("milestone-log", { orderId: data.orderId, milestones: OrderRepository.getMilestones(data.orderId) });
        });

        safeOn(socket, "request-cargo-reports", (data: { orderId: string }) => {
            socket.emit("cargo-report-saved", { orderId: data.orderId, reports: OrderRepository.getCargoReports(data.orderId) });
        });

        /**
         * [Phase 8.4] 신고 불일치를 어떻게 할지 결정.
         *
         * 기사님: *"거짓된 통화로 확인되면 퀵사무실과 통화하여 이 콜의 수행 여부를
         * 결정할 수 있어야 함."* — 전화는 관제탑에서 tel: 로 걸고,
         * 통화 뒤의 판단(계속/방출)을 여기로 보낸다.
         *
         * 어느 쪽을 고르든 **그 장소에 기록을 남긴다.** 신고가 틀린 곳은 다음에도 틀린다.
         */
        safeOn(socket, "resolve-cargo-mismatch", async (data: {
            orderId: string, stopType: 'pickup' | 'dropoff', ratio: number, action: 'CONTINUE' | 'RELEASE'
        }) => {
            const when = new Date().toISOString().slice(0, 10);
            const verdict = data.action === 'RELEASE' ? '방출' : '수행';
            const line = `${when} 신고 불일치 ${data.ratio.toFixed(1)}배 → ${verdict}`;

            const placeId = PlaceRepository.findPlaceIdByStop(data.orderId, data.stopType);
            if (placeId) PlaceRepository.appendPlaceMemo(placeId, line);

            console.log(`⚖️ [불일치 판단] ${data.orderId.slice(0, 8)} ${data.stopType} — ${line}`);
            logRoadmapEvent("서버", `신고 불일치 판단: ${verdict} (${data.ratio.toFixed(1)}배)`);

            if (data.action === 'RELEASE') {
                await handleDecision(userId, data.orderId, 'ORDER_RELEASED_BY_ME', io);
            }
            socket.emit("cargo-mismatch-resolved", { orderId: data.orderId, action: data.action });
        });

        /**
         * [Phase 8.4] 현장에서 상차를 포기한다.
         *
         * 신고와 실물이 다르거나, 물건 상태가 나쁘거나, 상차가 불가능한 경우다.
         * 방출(ORDER_RELEASED_BY_ME)과 같지만 **그 장소에 이유를 남긴다** —
         * 같은 곳에서 또 겪을 확률이 높기 때문이다.
         */
        safeOn(socket, "cancel-at-stop", async (data: { orderId: string, stopType: 'pickup' | 'dropoff', reason?: string }) => {
            const when = new Date().toISOString().slice(0, 10);
            const line = `${when} 현장 취소${data.reason ? ` — ${data.reason}` : ''}`;
            const placeId = PlaceRepository.findPlaceIdByStop(data.orderId, data.stopType);
            if (placeId) PlaceRepository.appendPlaceMemo(placeId, line);

            console.log(`✕ [현장 취소] ${data.orderId.slice(0, 8)} ${data.stopType} — ${line}`);
            logRoadmapEvent("서버", `현장에서 상차 취소 (${data.reason || '사유 미기재'})`);
            await handleDecision(userId, data.orderId, 'ORDER_RELEASED_BY_ME', io);
        });

        /**
         * 🔴 **`dispatch-complete` 를 지웠다** (2026-08-14). 역시 **쏘는 곳이 없었다.**
         *
         *    이 문이 부르던 `completeOrder` 는 상태를 `ORDER_COMPLETED` 로 썼는데, 살아 있는
         *    경로(마일스톤 `DELIVERED`)는 `ORDER_DELIVERED` 를 쓴다 — **같은 뜻, 이름 둘.**
         *    그 어긋남이 매출 집계를 0원으로 만들고 있었다(`statService`).
         *
         *    `ORDER_COMPLETED` 는 **타입에 남겨 둔다** — 기사님 결정(2026-08-14)대로
         *    *관제앱은 업무 단위, 정산은 별도 페이지*이므로 **정산 완료**를 뜻하는 자리다.
         *    다만 그 페이지가 생길 때 **거기서** 만든다. `completeOrder` 는 관제앱 동작
         *    (경로 재계산·필터 브로드캐스트)을 하고 있어 정산용으로 쓸 수 없었다.
         */

        /**
         * 🧭 국면 전환 — 요약줄 스와이프 (DEST → LOCAL → HOME).
         *
         * 옛 `start-two-track` 을 대체한다. 그 핸들러는 전환하면서 **활성 콜을 전부
         * 완료 처리**했다 — 기사님: *"콜은 무조건 배달을 해서 완료되어야 한다."*
         * 이 핸들러는 **필터만** 바꾼다.
         */
        safeOn(socket, "set-call-target", async (data: { phase: CallTarget }) => {
            const result = await setCallTarget(userId, data?.phase ?? 'DEST', io);
            socket.emit("call-target-ack", result);
        });

        // 🏠 귀가콜: 현재 위치 → 집 주소로 가상 오더 생성 + 경유 자동 세팅
        safeOn(socket, "create-home-return", async (data?: { detourRadiusKm?: number, destinationRadiusKm?: number }) => {
            const result = await createHomeReturn(userId, io, data);
            if (result.success) {
                socket.emit("home-return-ack", { success: true, orderId: result.orderId });
            } else {
                socket.emit("home-return-error", { message: result.message });
            }
        });

        socket.on("disconnect", () => {
            console.log(`❌ [소켓 해제] 클라이언트 종료: ${socket.id}`);
        });
    });

    /**
     * 3. 백그라운드 싱크 — **바뀌었을 때만 보낸다.**
     *
     * 🔴 2026-08-14 — 예전에는 1초마다 **무조건** 전체를 보냈다. 실측 초당 237KB.
     *    관제웹은 그걸 받아 `JSON.stringify` 로 두 번 비교했으니 **초당 474KB 의 문자열**이
     *    만들어지고 버려졌다. 한 시간이면 1.7GB — **브라우저가 시간이 지나면 죽었다.**
     *    종료 콜은 하루 종일 쌓이기만 하므로 오후로 갈수록 나빠졌다.
     *
     * 자동 치유를 없앤 것이 아니다 — 소켓이 새로 붙으면 `lastOrderSyncJson` 을 비워
     * **무조건 한 번 보낸다**(아래 connection 핸들러). 그게 원래 노렸던 복구다.
     */
    setInterval(() => {
        const userIds = getAllActiveUserIds();
        for (const uid of userIds) {
            // [Q4 소켓 브로드캐스트 분리 완료] 각 기사별로 자신의 등록된 기기 목록(+상태)만 전달
            io.to(uid).emit("telemetry-devices", getUserDevicesSnapshot(uid));

            const session = getUserSession(uid);
            const sync = buildOrderSync(session);
            const json = JSON.stringify(sync);
            if (json === session.lastOrderSyncJson) continue;   // 아무것도 안 바뀌었다
            session.lastOrderSyncJson = json;
            console.log(`📤 [Socket 푸시] sync-active-orders (복구)`);
            io.to(uid).emit("sync-active-orders", sync);
        }
    }, 1000);
}
