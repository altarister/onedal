import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { getUserDevicesSnapshot } from "../routes/devices";
import { getRegionsByCity } from "../geoResolver";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import type { AutoDispatchFilter } from "@onedal/shared";
import { getUserSession, getAllActiveUserIds } from "../state/userSessionStore";
import { recalculateCorridorFilter, handleDecision, recalculateKakaoRoute } from "../services/dispatchEngine";
import db from "../db";



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
            const secret = process.env.JWT_SECRET || "fallback_secret";
            const decoded = jwt.verify(token, secret) as any;
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

        // 방 참여 (개별 유저 룸)
        socket.join(userId);
        if (role === "ADMIN") {
            socket.join("admin_room");
        }

        // 접속 시 초기 데이터 전송 (유저별 등록 기기 목록 포함)
        socket.emit("telemetry-devices", getUserDevicesSnapshot(userId));
        logRoadmapEvent("서버", "관제탑 소켓 접속 완료 및 기사의 기본 필터 DB Lazy Load 연산");
        socket.emit("filter-init", session.activeFilter);
        logRoadmapEvent("서버", "관제탑에게 초기 UI 복원용 필터(filter-init) 정보 전달");

        // 프론트의 필터 요구 시
        socket.on("request-filter-init", () => {
            socket.emit("filter-init", session.activeFilter);
        });

        // 프론트에서 필터 변경 시
        socket.on("update-filter", (newFilter: Partial<AutoDispatchFilter>) => {
            logRoadmapEvent("서버", "관제탑으로 부터 필터 변경(update-filter) 요청 받음 및 파싱 연산");
            
            if (newFilter.destinationCity && newFilter.destinationCity !== session.activeFilter.destinationCity) {
                const regions = getRegionsByCity(newFilter.destinationCity);
                newFilter.destinationKeywords = regions;
            }
            
            const isCorridorChanged = newFilter.corridorRadiusKm !== undefined && newFilter.corridorRadiusKm !== session.activeFilter.corridorRadiusKm;
            const isTargetChanged = newFilter.destinationRadiusKm !== undefined && newFilter.destinationRadiusKm !== session.activeFilter.destinationRadiusKm;
            
            if (isCorridorChanged || isTargetChanged) {
                const cRadius = newFilter.corridorRadiusKm ?? session.activeFilter.corridorRadiusKm ?? 1;
                const dRadius = newFilter.destinationRadiusKm ?? session.activeFilter.destinationRadiusKm ?? 10;
                
                const newRegions = recalculateCorridorFilter(userId, cRadius, dRadius);
                if (newRegions) {
                    newFilter.destinationKeywords = newRegions.destinationKeywords;
                    newFilter.destinationGroups = newRegions.destinationGroups;
                }
            }
            
            session.activeFilter = { ...session.activeFilter, ...newFilter };
            
            // DB에 영구 저장 (비동기 처리)
            try {
                logRoadmapEvent("서버", "새로 바뀐 필터 상태값 DB 저장");
                db.prepare(`
                    UPDATE user_filters SET
                        destination_city = ?, destination_radius_km = ?, corridor_radius_km = ?,
                        allowed_vehicle_types = ?, min_fare = ?, max_fare = ?, pickup_radius_km = ?,
                        excluded_keywords = ?, destination_keywords = ?, is_active = ?, is_shared_mode = ?
                    WHERE user_id = ?
                `).run(
                    session.activeFilter.destinationCity || "", session.activeFilter.destinationRadiusKm || 10, session.activeFilter.corridorRadiusKm || 1,
                    JSON.stringify(session.activeFilter.allowedVehicleTypes || []), session.activeFilter.minFare || 0, session.activeFilter.maxFare || 1000000, session.activeFilter.pickupRadiusKm || 999,
                    JSON.stringify(session.activeFilter.excludedKeywords || []), JSON.stringify(session.activeFilter.destinationKeywords || []), session.activeFilter.isActive ? 1 : 0, session.activeFilter.isSharedMode ? 1 : 0,
                    userId
                );
            } catch(e) {
                console.error("필터 DB 저장 에러:", e);
            }

            logRoadmapEvent("서버", "관제탑에게 변경 적용된 필터(filter-updated) 정보 전달");
            io.to(userId).emit("filter-updated", session.activeFilter);
        });

        // 프론트에서 현재 위치 전송 시 (지도 등 활용)
        socket.on("update-my-location", (loc: { x: number, y: number }) => {
            session.driverLocation = loc;
        });

        // 배차 심사 수락/거절
        socket.on("decision", async ({ orderId, action }: { orderId: string, action: 'KEEP' | 'CANCEL' }) => {
            console.log(`⚖️ [소켓 Decision] User: ${userId}, ID: ${orderId}, Action: ${action}`);
            const result = await handleDecision(userId, orderId, action, io);
            socket.emit("decision-ack", result);
        });

        // 카카오 경로 재탐색
        socket.on("recalculate-route", async ({ orderId, priority }: { orderId: string, priority: string }) => {
            const result = await recalculateKakaoRoute(userId, orderId, priority, io);
            socket.emit("recalculate-route-ack", result);
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
