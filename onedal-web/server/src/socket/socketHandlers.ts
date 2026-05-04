import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { getUserDevicesSnapshot } from "../routes/devices";
import { getRegionsByCity } from "../geoResolver";
import { logRoadmapEvent } from "../utils/roadmapLogger";
import type { AutoDispatchFilter } from "@onedal/shared";
import { getUserSession, getAllActiveUserIds } from "../state/userSessionStore";
import { recalculateCorridorFilter, handleDecision, recalculateKakaoRoute, restoreAndRecalculateSession } from "../services/dispatchEngine";
import { updateActiveFilter } from "../state/filterManager";
import { processDriverMovement, getCityRegionsWithRadius } from "../services/geoService";
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

        // ━━━ [운행 완료 처리] ━━━
        socket.on("dispatch-complete", async (data: { orderId: string }) => {
            if (!data || !data.orderId) return;
            const session = getUserSession(userId);
            let updated = false;

            if (session.mainCallState && session.mainCallState.id === data.orderId) {
                session.mainCallState.status = 'completed';
                updated = true;
            } else {
                const subCall = session.subCalls.find(c => c.id === data.orderId);
                if (subCall) {
                    subCall.status = 'completed';
                    updated = true;
                }
            }

            if (updated) {
                // DB 영구 업데이트
                try {
                    const stmt = db.prepare("UPDATE orders SET status = 'completed', completedAt = datetime('now', 'localtime') WHERE id = ? AND userId = ?");
                    stmt.run(data.orderId, userId);
                    console.log(`✅ [운행 완료] ${data.orderId} - DB 업데이트 완료 (completedAt 갱신)`);
                } catch (e) {
                    console.error("DB 업데이트 에러:", e);
                }

                // [수정됨] 완료된 오더를 하트비트 싱크 풀(pendingOrdersData)에서 강제 삭제하지 않습니다.
                // 프론트엔드의 PinnedRoute에서 status === 'completed'인 카드를 회색으로 렌더링하도록 유지해야 합니다.
                // stale polyline 이슈는 dispatchEngine 내부의 activeCalls 필터링 로직으로 이미 해결되었습니다.

                // 경로 재계산 (완료된 짐 제외한 On-the-fly 라우팅)
                const { recalculateActiveKakaoRoute } = await import("../services/dispatchEngine");
                await recalculateActiveKakaoRoute(userId, io);
                
                io.to(userId).emit("filter-updated", {
                    activeFilter: session.activeFilter,
                    baseFilter: session.baseFilter
                });
            }
        });

        // 🎯 투-트랙 사냥: 기존 콜 전부 완료 처리 → 필터를 EMPTY 리셋 → 집 + 현 위치 동시 스캔
        socket.on("start-two-track", async () => {
            try {
                const session = getUserSession(userId);
                console.log(`🎯 [투-트랙] 사냥 모드 전환 시작 (userId: ${userId})`);

                // 1. 기존 활성 콜 전부 completed 처리 (메모리 + DB)
                const allCalls = [session.mainCallState, ...session.subCalls].filter(c => c && c.status !== 'completed');
                for (const call of allCalls) {
                    if (!call) continue;
                    call.status = 'completed';
                    try {
                        db.prepare("UPDATE orders SET status = 'completed', completedAt = datetime('now', 'localtime') WHERE id = ? AND userId = ?").run(call.id, userId);
                        console.log(`   ✅ [투-트랙] 기존 콜 완료 처리: ${call.id} (${call.pickup} → ${call.dropoff})`);
                    } catch (e) {
                        console.error(`   ⚠️ [투-트랙] DB 업데이트 실패:`, e);
                    }
                }

                // 2. 세션 메모리 초기화
                session.mainCallState = null;
                session.subCalls = [];

                // 3. 집 주소에서 키워드 추출
                const settings = db.prepare("SELECT home_address FROM user_settings WHERE user_id = ?").get(userId) as any;
                const homeKeywords: string[] = [];
                if (settings?.home_address) {
                    // "경기도 광주시 초월읍 ..." → "광주시", "초월읍" 등 추출
                    const parts = settings.home_address.split(/\s+/);
                    for (const p of parts) {
                        if (p.endsWith('시') || p.endsWith('군') || p.endsWith('구') || p.endsWith('읍') || p.endsWith('면') || p.endsWith('동')) {
                            homeKeywords.push(p);
                        }
                    }
                }

                // 4. 현재 위치 주변 키워드 추출 (기존 필터의 destinationCity 활용)
                const currentKeywords: string[] = [];
                if (session.activeFilter.destinationCity) {
                    currentKeywords.push(session.activeFilter.destinationCity);
                }
                // 현재 위치의 도시명도 추가 (geoService에서 역지오코딩)
                if (session.driverLocation) {
                    const { reverseGeocodeToRegion } = await import("../services/geoService");
                    const region = reverseGeocodeToRegion(session.driverLocation.y, session.driverLocation.x);
                    if (region) {
                        currentKeywords.push(region);
                    }
                }

                // 5. 필터 리셋: EMPTY 모드 + 동시 키워드 투입
                const mergedKeywords = [...new Set([...homeKeywords, ...currentKeywords])];
                updateActiveFilter(userId, {
                    isSharedMode: false,
                    isActive: true,
                    // loadState 제거됨
                    driverAction: 'WAITING',      // [V2] 투-트랙 시작 → 대기 상태
                    dispatchPhase: 'STANDBY',     // [V2] 첫짐 탐색
                    destinationCity: '🎯 투-트랙 탐색',
                    destinationKeywords: mergedKeywords,
                    corridorRadiusKm: 0,
                }, io);

                console.log(`🎯 [투-트랙] 필터 전환 완료 → 키워드: [${mergedKeywords.join(', ')}]`);
                
                // 6. 프론트엔드 동기화
                io.to(userId).emit("filter-updated", {
                    activeFilter: session.activeFilter,
                    baseFilter: session.baseFilter
                });

                // 7. 프론트엔드에 활성 콜 리스트 갱신 전달
                const payload = Array.from(session.pendingOrdersData.values());
                io.to(userId).emit("sync-active-orders", payload);

                socket.emit("two-track-ack", { success: true, keywords: mergedKeywords });
            } catch (e: any) {
                console.error("🎯 [투-트랙] 에러:", e);
                socket.emit("two-track-ack", { success: false, message: e.message || "투-트랙 전환 실패" });
            }
        });

        // 🏠 귀가콜: 현재 위치 → 집 주소로 가상 오더 생성 + 회랑 자동 세팅
        socket.on("create-home-return", async (data?: { corridorRadiusKm?: number, destinationRadiusKm?: number }) => {
            try {
                const settings = db.prepare("SELECT home_address, home_x, home_y, vehicle_type FROM user_settings WHERE user_id = ?").get(userId) as any;
                if (!settings || !settings.home_address) {
                    socket.emit("home-return-error", { message: "집 주소가 설정되지 않았습니다. 설정에서 먼저 등록해주세요." });
                    return;
                }
                if (!settings.home_x || !settings.home_y) {
                    socket.emit("home-return-error", { message: "집 주소의 좌표가 없습니다. 설정에서 📍위치 확인 후 다시 저장해주세요." });
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
                    // 미리 알 수 있는 정보 채우기
                    vehicleType: settings.vehicle_type || '1t',
                    receiptStatus: '귀가',
                    itemDescription: '귀가 운행',
                    tripType: '편도',
                    orderForm: '보통',
                    paymentType: '선불' as const,
                    billingType: '무과세' as const,
                    companyName: '자가 운행',
                    dispatcherName: '관제탑 (자동생성)',
                    isMock: false,
                    isShared: false,
                    commissionRate: '0%',
                    tollFare: '0',
                };

                // 기존 활성 콜 확인 (On-the-fly 필터)
                const activeCalls = [session.mainCallState, ...session.subCalls].filter(c => c && c.status !== 'completed');
                
                if (activeCalls.length === 0) {
                    session.mainCallState = homeOrder as any;
                    session.subCalls = [];
                } else {
                    session.subCalls.push(homeOrder as any);
                }

                // 카카오 경로 연산 (evaluateNewOrder 호출 시 목적지 반경도 고려될 수 있음)
                const { evaluateNewOrder } = await import("../services/dispatchEngine");
                await evaluateNewOrder(userId, homeOrder as any, io);

                // 프론트에서 넘어온 우회 반경 적용 (없으면 10km 하드코딩 호환유지)
                const targetCorridor = data?.corridorRadiusKm ?? 10;
                
                // LOADING + 회랑 생성
                const { syncCorridorFilter } = await import("../services/dispatchEngine");
                updateActiveFilter(userId, {
                    // loadState 제거됨
                    dispatchPhase: 'GATHERING',   // [V2] 합짐 탐색 단계
                    isSharedMode: true,
                    isActive: true,
                    corridorRadiusKm: targetCorridor,
                }, io);
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
