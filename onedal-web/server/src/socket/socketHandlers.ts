import { Server, Socket } from "socket.io";
import { getActiveDevicesSnapshot } from "../routes/devices";
import { getRegionsByCity } from "../geoResolver";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import type { AutoDispatchFilter } from "@onedal/shared";
import { getUserSession } from "../state/userSessionStore";
import { recalculateCorridorFilter, handleDecision, recalculateKakaoRoute } from "../services/dispatchEngine";

export function registerSocketHandlers(io: Server) {
    io.on("connection", (socket: Socket) => {
        console.log(`🔌 [소켓 연결] 클라이언트 접속: ${socket.id}`);

        // V2 SaaS: 소켓 접속 시 해당 사용자의 세션을 획득합니다 (현재는 ADMIN_USER 고정)
        const userId = "ADMIN_USER";
        const session = getUserSession(userId);

        // socket 방 참여 (해당 유저의 private room)
        socket.join(userId);

        // 접속 직후 최신 텔레메트리 1회 즉시 전송
        socket.emit("telemetry-devices", getActiveDevicesSnapshot());

        // 접속 직후 최신 필터 1회 즉시 전송
        socket.emit("filter-init", session.activeFilter);
        logRoadmapEvent("서버", "[Socket] 디폴트 필터 설정값 전송 (관제 UI 초기화)");

        socket.on("request-filter-init", () => {
            socket.emit("filter-init", session.activeFilter);
        });

        socket.on("update-filter", (newFilter: Partial<AutoDispatchFilter>) => {
            logRoadmapEvent("서버", "[Socket] 첫콜 필터 설정값 전송 (서버 필터 세팅 업데이트)");
            
            if (newFilter.destinationCity && newFilter.destinationCity !== session.activeFilter.destinationCity) {
                const regions = getRegionsByCity(newFilter.destinationCity);
                newFilter.destinationKeywords = regions;
                console.log(`🗺️ [지역 자동 갱신] ${newFilter.destinationCity} → ${regions.length}개 읍면동 조회 완료`);
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
            console.log(`🌐 [필터 전체 스키마 적용됨]\n${JSON.stringify(session.activeFilter, null, 2)}`);
            io.to(userId).emit("filter-updated", session.activeFilter);
        });

        socket.on("update-my-location", (loc: { x: number, y: number }) => {
            session.driverLocation = loc;
        });

        socket.on("decision", async ({ orderId, action }: { orderId: string, action: 'KEEP' | 'CANCEL' }) => {
            console.log(`⚖️ [소켓 Decision 수신] ID: ${orderId}, Action: ${action}`);
            const result = await handleDecision(userId, orderId, action, io);
            socket.emit("decision-ack", result);
        });

        socket.on("recalculate-route", async ({ orderId, priority }: { orderId: string, priority: string }) => {
            const result = await recalculateKakaoRoute(userId, orderId, priority, io);
            socket.emit("recalculate-route-ack", result);
        });

        socket.on("disconnect", () => {
            console.log(`❌ [소켓 해제] 클라이언트 종료: ${socket.id}`);
        });
    });

    // 백그라운드 싱크: 전체 유저 루프 대신 ADMIN_USER 고정 폴링
    setInterval(() => {
        io.emit("telemetry-devices", getActiveDevicesSnapshot());
        
        const userId = "ADMIN_USER";
        const session = getUserSession(userId);
        const activeOrdersPayload = Array.from(session.pendingOrdersData.values());
        io.to(userId).emit("sync-active-orders", activeOrdersPayload);
    }, 1000);
}
