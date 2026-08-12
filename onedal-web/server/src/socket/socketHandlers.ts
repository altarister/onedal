import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../config/env";
import { getUserDevicesSnapshot } from "../routes/devices";
import { getRegionsByCity } from "../geoResolver";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import type { AutoDispatchFilter, Milestone, CargoReport } from "@onedal/shared";
import { cargoMismatchRatio } from "@onedal/shared";
import { OrderRepository } from "../repositories/OrderRepository";
import { PlaceRepository } from "../repositories/PlaceRepository";
import { getUserSession, getAllActiveUserIds } from "../state/userSessionStore";
import { buildOrderSync } from "../core/helpers";
import { recalculateCorridorFilter, handleDecision, recalculateKakaoRoute, bootstrapUserSession, completeOrder, reportMilestone, undoMilestone, startTwoTrack, createHomeReturn } from "../services/dispatchEngine";
import { updateActiveFilter } from "../state/filterManager";
import { processDriverMovement, getCityRegionsWithRadius } from "../services/geoService";




/**
 * 소켓 핸들러에서 던진 예외가 **서버 프로세스를 죽이지 않게** 감싼다.
 *
 * Socket.IO 는 리스너의 예외를 잡아주지 않는다. 그래서 DB 제약 위반 한 번에
 * `SqliteError` 가 uncaught 로 올라가 **서버 전체가 종료됐다.**
 * (2026-08-10 스모크에서 stop_cargo_reports 의 FK 위반으로 실제 발생)
 *
 * 기사님 운행 중에 이런 일이 나면 사냥이 통째로 멈춘다.
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
        if (role === "ADMIN") {
            socket.join("admin_room");
        }

        // 접속 시 초기 데이터 전송 (유저별 등록 기기 목록 포함)
        socket.emit("telemetry-devices", getUserDevicesSnapshot(userId));

        // [Phase 6] 필터는 부트스트랩이 끝난 뒤 **완성본으로 한 번만** 보낸다.
        //
        // 예전에는 여기서 곧바로 filter-init 을 쐈는데, 그 시점의 activeFilter 는
        // 아직 복구 전(첫짐·회랑 없음)이라 관제탑이 첫짐 → 합짐으로 깜빡였고
        // 앱폰도 그 사이 잘못된 필터를 가져갔다.
        if (!session.isRestored) {
            // 첫 접속: 부트스트랩이 완료 시점에 filter-init 을 룸으로 emit 한다
            logRoadmapEvent("서버", "관제탑 소켓 접속 — 부트스트랩 시작 (필터는 확정 후 1회 전송)");
            bootstrapUserSession(userId, io);
        } else {
            // 이미 부트스트랩이 끝난 세션(단순 새로고침·재연결)은 현재 확정 필터를 즉시 전달
            socket.emit("filter-init", {
                activeFilter: session.activeFilter,
                baseFilter: session.baseFilter
            });
            logRoadmapEvent("서버", `관제탑에게 확정 필터(filter-init) 전달 — minFare=${session.activeFilter.minFare}`);
        }

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
                baseFilter: session.baseFilter
            });
            logRoadmapEvent("서버", `관제탑 요청으로 필터(filter-init) 정보 재전달\n - activeFilter(현재사냥): minFare=${session.activeFilter.minFare}\n - baseFilter(기본설정): minFare=${session.baseFilter.minFare}`);
        });

        // 프론트에서 필터 변경 시
        safeOn(socket, "update-filter", (newFilter: Partial<AutoDispatchFilter>) => {
            logRoadmapEvent("서버", `관제탑으로 부터 필터 변경(update-filter) 요청 받음. 수신 데이터: ${JSON.stringify(newFilter)}`);
            
            const isCityChanged = newFilter.destinationCity !== undefined && newFilter.destinationCity !== session.activeFilter.destinationCity;
            const isTargetChanged = newFilter.destinationRadiusKm !== undefined && newFilter.destinationRadiusKm !== session.activeFilter.destinationRadiusKm;
            const isCorridorChanged = newFilter.corridorRadiusKm !== undefined && newFilter.corridorRadiusKm !== session.activeFilter.corridorRadiusKm;
            
            // 첫짐 모드: 도시명 또는 도착 반경 변경 시
            if (!session.activeFilter.isSharedMode && (isCityChanged || isTargetChanged)) {
                const targetCity = newFilter.destinationCity ?? session.activeFilter.destinationCity ?? "";
                const targetRadius = newFilter.destinationRadiusKm ?? session.activeFilter.destinationRadiusKm ?? 0;
                
                if (targetCity) {
                    const { flat, grouped } = getCityRegionsWithRadius(targetCity, targetRadius);
                    newFilter.destinationKeywords = flat;
                    newFilter.destinationGroups = grouped;
                }
            }
            
            // 합짐 모드: 회랑 반경 또는 도착 반경 변경 시
            if (session.activeFilter.isSharedMode && (isCorridorChanged || isTargetChanged)) {
                const cRadius = newFilter.corridorRadiusKm ?? session.activeFilter.corridorRadiusKm ?? 1;
                const dRadius = newFilter.destinationRadiusKm ?? session.activeFilter.destinationRadiusKm ?? 10;
                
                const newRegions = recalculateCorridorFilter(userId, cRadius, dRadius);
                if (newRegions) {
                    newFilter.destinationKeywords = newRegions.destinationKeywords;
                    newFilter.destinationGroups = newRegions.destinationGroups;
                }
            }
            
            logRoadmapEvent("서버", "관제탑에게 변경 적용된 필터(filter-updated) 정보 전달 (메모리만, DB 저장 안함)");
            updateActiveFilter(userId, newFilter, io);
        });

        // 프론트에서 현재 위치 전송 시 (지도 등 활용 및 Master GPS 용도)
        socket.on("update-my-location", (loc: { x: number, y: number }) => {
            session.driverLocation = loc;
            session.driverLocationIsFallback = false;   // 진짜 GPS 가 임시 출발지를 이긴다
        });

        // ━━━ [관제웹 Master GPS 수신부] ━━━
        socket.on("dashboard-gps-update", (loc: { lat: number, lng: number }) => {
            session.driverLocationIsFallback = false;   // 진짜 GPS 가 임시 출발지를 이긴다
            processDriverMovement(userId, loc.lat, loc.lng, session, (uid, filterUpdate) => {
                updateActiveFilter(uid, filterUpdate, io);
            });
        });

        // 배차 심사 수락/거절
        safeOn(socket, "decision", async ({ orderId, action }: { orderId: string, action: 'ORDER_CONFIRMED' | 'ORDER_CANCELED' | 'ORDER_RELEASED' | 'ORDER_FORCE_CANCELED' }) => {
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
                await handleDecision(userId, data.orderId, 'ORDER_RELEASED', io);
            }
            socket.emit("cargo-mismatch-resolved", { orderId: data.orderId, action: data.action });
        });

        /**
         * [Phase 8.4] 현장에서 상차를 포기한다.
         *
         * 신고와 실물이 다르거나, 물건 상태가 나쁘거나, 상차가 불가능한 경우다.
         * 방출(ORDER_RELEASED)과 같지만 **그 장소에 이유를 남긴다** —
         * 같은 곳에서 또 겪을 확률이 높기 때문이다.
         */
        safeOn(socket, "cancel-at-stop", async (data: { orderId: string, stopType: 'pickup' | 'dropoff', reason?: string }) => {
            const when = new Date().toISOString().slice(0, 10);
            const line = `${when} 현장 취소${data.reason ? ` — ${data.reason}` : ''}`;
            const placeId = PlaceRepository.findPlaceIdByStop(data.orderId, data.stopType);
            if (placeId) PlaceRepository.appendPlaceMemo(placeId, line);

            console.log(`✕ [현장 취소] ${data.orderId.slice(0, 8)} ${data.stopType} — ${line}`);
            logRoadmapEvent("서버", `현장에서 상차 취소 (${data.reason || '사유 미기재'})`);
            await handleDecision(userId, data.orderId, 'ORDER_RELEASED', io);
        });

        safeOn(socket, "dispatch-complete", async (data: { orderId: string }) => {
            if (!data || !data.orderId) return;
            await completeOrder(userId, data.orderId, io);
        });

        // 🎯 투-트랙 사냥: 기존 콜 전부 완료 → 필터 STANDBY 리셋 → 집+현위치 동시 스캔
        safeOn(socket, "start-two-track", async () => {
            const result = await startTwoTrack(userId, io);
            socket.emit("two-track-ack", result);
        });

        // 🏠 귀가콜: 현재 위치 → 집 주소로 가상 오더 생성 + 회랑 자동 세팅
        safeOn(socket, "create-home-return", async (data?: { corridorRadiusKm?: number, destinationRadiusKm?: number }) => {
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

    // 3. 백그라운드 싱크: 접속 중인 모든 활성 세션을 순회하며 각 룸에 배차 상태 및 기기 상태 분리 전송
    setInterval(() => {
        const userIds = getAllActiveUserIds();
        for (const uid of userIds) {
            // [Q4 소켓 브로드캐스트 분리 완료] 각 기사별로 자신의 등록된 기기 목록(+상태)만 전달
            io.to(uid).emit("telemetry-devices", getUserDevicesSnapshot(uid));
            
            // 각 기사별로 자신의 화면에 뜰 오더 리스트 동기화
            const session = getUserSession(uid);
            io.to(uid).emit("sync-active-orders", buildOrderSync(session));
        }
    }, 1000);
}
