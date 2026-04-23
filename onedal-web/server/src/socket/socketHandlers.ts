import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { getUserDevicesSnapshot } from "../routes/devices";
import { getRegionsByCity } from "../geoResolver";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import type { AutoDispatchFilter } from "@onedal/shared";
import { getUserSession, getAllActiveUserIds } from "../state/userSessionStore";
import { recalculateCorridorFilter, handleDecision, recalculateKakaoRoute } from "../services/dispatchEngine";
import { applyFilter } from "../state/filterManager";
import { processDriverMovement } from "../services/geoService";
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
        
        socket.emit("filter-init", {
            activeFilter: session.activeFilter,
            baseFilter: session.baseFilter
        });
        logRoadmapEvent("서버", "관제탑에게 초기 UI 복원용 필터(filter-init) 정보 전달");

        socket.on("request-filter-init", () => {
            console.log(`📡 [웹 수신] request-filter-init (초기 필터 동기화 요청) - userId: ${userId}`);
            const session = getUserSession(userId);
            socket.emit("filter-init", { 
                activeFilter: session.activeFilter,
                baseFilter: session.baseFilter
            });
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
            
            if ((isCorridorChanged || isTargetChanged) && session.activeFilter.isSharedMode) {
                const cRadius = newFilter.corridorRadiusKm ?? session.activeFilter.corridorRadiusKm ?? 1;
                const dRadius = newFilter.destinationRadiusKm ?? session.activeFilter.destinationRadiusKm ?? 10;
                
                const newRegions = recalculateCorridorFilter(userId, cRadius, dRadius);
                if (newRegions) {
                    newFilter.destinationKeywords = newRegions.destinationKeywords;
                    newFilter.destinationGroups = newRegions.destinationGroups;
                }
            }
            
            logRoadmapEvent("서버", "관제탑에게 변경 적용된 필터(filter-updated) 정보 전달 및 DB 영구 저장");
            applyFilter(userId, newFilter, io, true); // persistToDB = true (모달에서 수정한 값은 DB 영구 저장)
        });

        // 프론트에서 현재 위치 전송 시 (지도 등 활용 및 Master GPS 용도)
        socket.on("update-my-location", (loc: { x: number, y: number }) => {
            session.driverLocation = loc;
        });

        // ━━━ [관제웹 Master GPS 수신부] ━━━
        socket.on("dashboard-gps-update", (loc: { lat: number, lng: number }) => {
            processDriverMovement(userId, loc.lat, loc.lng, session, (uid, filterUpdate) => {
                applyFilter(uid, filterUpdate, io, false); // 일회성 운행 상태이므로 DB 저장 안함
            });
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

        // 🏠 귀가콜: 현재 위치 → 집 주소로 가상 오더 생성 + 회랑 자동 세팅
        socket.on("create-home-return", async () => {
            try {
                const settings = db.prepare("SELECT home_address, home_x, home_y FROM user_settings WHERE user_id = ?").get(userId) as any;
                if (!settings || !settings.home_address) {
                    socket.emit("home-return-error", { message: "집 주소가 설정되지 않았습니다. 설정에서 먼저 등록해주세요." });
                    return;
                }
                if (!settings.home_x || !settings.home_y) {
                    socket.emit("home-return-error", { message: "집 주소의 좌표가 없습니다. 설정에서 다시 등록해주세요." });
                    return;
                }

                const currentLoc = session.driverLocation;
                const pickupX = currentLoc?.x || settings.home_x;
                const pickupY = currentLoc?.y || settings.home_y;

                const homeOrder = {
                    id: `home-${Date.now()}`,
                    type: 'MANUAL' as const,
                    pickup: '현재 위치',
                    dropoff: settings.home_address,
                    fare: 0,
                    pickupX, pickupY,
                    dropoffX: settings.home_x,
                    dropoffY: settings.home_y,
                    status: 'confirmed' as const,
                    capturedDeviceId: 'control-tower',
                    capturedAt: new Date().toISOString(),
                    timestamp: new Date().toISOString(),
                };

                // 기존 상태 초기화
                session.mainCallState = homeOrder as any;
                session.subCalls = [];

                // 카카오 경로 연산 (evaluateNewOrder 호출)
                const { evaluateNewOrder } = await import("../services/dispatchEngine");
                await evaluateNewOrder(userId, homeOrder as any, io);

                // LOADING + 회랑 10km 생성
                const { syncCorridorFilter } = await import("../services/dispatchEngine");
                applyFilter(userId, {
                    loadState: 'LOADING',
                    isSharedMode: true,
                    isActive: true,
                    corridorRadiusKm: 10,
                }, io, false); // persistToDB = false (일회성 운행 조작)
                syncCorridorFilter(userId, io);

                console.log(`🏠 [귀가콜] 가상 오더 생성 완료: ${settings.home_address}`);
                io.to(userId).emit("order-confirmed", homeOrder.id);
                socket.emit("home-return-ack", { success: true, orderId: homeOrder.id });
            } catch (e: any) {
                console.error("🏠 [귀가콜] 에러:", e);
                socket.emit("home-return-error", { message: e.message || "귀가콜 생성 실패" });
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
