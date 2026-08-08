import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../config/env";
import { getUserDevicesSnapshot } from "../routes/devices";
import { getRegionsByCity } from "../geoResolver";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import type { AutoDispatchFilter } from "@onedal/shared";
import { getUserSession, getAllActiveUserIds } from "../state/userSessionStore";
import { recalculateCorridorFilter, handleDecision, recalculateKakaoRoute, restoreAndRecalculateSession, completeOrder, startTwoTrack, createHomeReturn } from "../services/dispatchEngine";
import { updateActiveFilter } from "../state/filterManager";
import { processDriverMovement, getCityRegionsWithRadius } from "../services/geoService";




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

        // [방안 1] 서버 재시작으로 메모리가 비워졌다면 DB에서 복구하고 카카오 궤적 1회 재생성
        if (!session.isRestored) {
            restoreAndRecalculateSession(userId, io);
        }

        // 방 참여 (개별 유저 룸)
        socket.join(userId);
        if (role === "ADMIN") {
            socket.join("admin_room");
        }

        // 접속 시 초기 데이터 전송 (유저별 등록 기기 목록 포함)
        socket.emit("telemetry-devices", getUserDevicesSnapshot(userId));
        logRoadmapEvent("서버", "관제탑 소켓 접속 완료 및 기사의 기본 필터 DB Lazy Load 연산");
        
        socket.emit("filter-init", {
            activeFilter: session.activeFilter,
            baseFilter: session.baseFilter
        });
        logRoadmapEvent("서버", `관제탑에게 초기 UI 복원용 필터(filter-init) 정보 전달\n - activeFilter(현재사냥): minFare=${session.activeFilter.minFare}\n - baseFilter(기본설정): minFare=${session.baseFilter.minFare}`);

        socket.on("request-filter-init", () => {
            console.log(`📡 [웹 수신] request-filter-init (초기 필터 동기화 요청) - userId: ${userId}`);
            const session = getUserSession(userId);
            socket.emit("filter-init", { 
                activeFilter: session.activeFilter,
                baseFilter: session.baseFilter
            });
            logRoadmapEvent("서버", `관제탑 요청으로 필터(filter-init) 정보 재전달\n - activeFilter(현재사냥): minFare=${session.activeFilter.minFare}\n - baseFilter(기본설정): minFare=${session.baseFilter.minFare}`);
        });

        // 프론트에서 필터 변경 시
        socket.on("update-filter", (newFilter: Partial<AutoDispatchFilter>) => {
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
        });

        // ━━━ [관제웹 Master GPS 수신부] ━━━
        socket.on("dashboard-gps-update", (loc: { lat: number, lng: number }) => {
            processDriverMovement(userId, loc.lat, loc.lng, session, (uid, filterUpdate) => {
                updateActiveFilter(uid, filterUpdate, io);
            });
        });

        // 배차 심사 수락/거절
        socket.on("decision", async ({ orderId, action }: { orderId: string, action: 'ORDER_CONFIRMED' | 'ORDER_CANCELED' | 'ORDER_RELEASED' | 'ORDER_FORCE_CANCELED' }) => {
            console.log(`⚖️ [소켓 Decision] User: ${userId}, ID: ${orderId}, Status Action: ${action}`);
            const result = await handleDecision(userId, orderId, action, io);
            socket.emit("decision-ack", result);
        });

        // 카카오 경로 재탐색
        socket.on("recalculate-route", async ({ orderId, priority }: { orderId: string, priority: string }) => {
            const result = await recalculateKakaoRoute(userId, orderId, priority, io);
            socket.emit("recalculate-route-ack", result);
        });

        // ━━━ [운행 완료 처리] ━━━
        socket.on("dispatch-complete", async (data: { orderId: string }) => {
            if (!data || !data.orderId) return;
            await completeOrder(userId, data.orderId, io);
        });

        // 🎯 투-트랙 사냥: 기존 콜 전부 완료 → 필터 STANDBY 리셋 → 집+현위치 동시 스캔
        socket.on("start-two-track", async () => {
            const result = await startTwoTrack(userId, io);
            socket.emit("two-track-ack", result);
        });

        // 🏠 귀가콜: 현재 위치 → 집 주소로 가상 오더 생성 + 회랑 자동 세팅
        socket.on("create-home-return", async (data?: { corridorRadiusKm?: number, destinationRadiusKm?: number }) => {
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
            const activeOrdersPayload = Array.from(session.pendingOrdersData.values());
            io.to(uid).emit("sync-active-orders", activeOrdersPayload);
        }
    }, 1000);
}
