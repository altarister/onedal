import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

import ordersRouter from "./routes/orders";
import detailRouter, { handleDecision, getPendingOrdersData, deviceEvaluatingMap } from "./routes/detail";
import scrapRouter from "./routes/scrap";
import emergencyRouter from "./routes/emergency";
import { getRegionsByCity } from "./geoResolver";
import kakaoRouter from "./routes/kakao";
import devicesRouter, { getActiveDevicesSnapshot } from "./routes/devices";
import configRouter from "./routes/config";
import { activeFilterConfig, updateActiveFilter } from "./state/filterStore";
import { initGeoService } from "./services/geoService";
import { updateDriverLocation } from "./state/locationStore";
import type { AutoDispatchFilter } from "@onedal/shared";

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Socket.io 초기화
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: "*", // 모든 오리진 허용 (CORS)
    },
});

// 라우터에서 io를 사용할 수 있도록 app에 세팅
app.set("io", io);

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 글로벌 HTTP 로깅 미들웨어
app.use((req, res, next) => {
    // 1초 주기로 발생하는 스크랩/디바이스 통계 제외하여 스팸 방지
    if (!req.url.includes('/api/scrap') && !req.url.includes('/api/devices')) {
        console.log(`📡 [HTTP 수신] ${req.method} ${req.url} - IP: ${req.ip}`);
    }
    next();
});

// API 라우터 등록
app.use("/api/orders", ordersRouter);
app.use("/api/orders/detail", detailRouter);
app.use("/api/scrap", scrapRouter);
app.use("/api/kakao", kakaoRouter); // Dashboard UI의 클라이언트 사이드 카카오 연산용 프록시 (유지)
app.use("/api/devices", devicesRouter);
app.use("/api/emergency", emergencyRouter);  // [Safety Mode V3] 앱폰 비상 보고
app.use("/api/config", configRouter); // 타겟 앱 키워드 연동

// 소켓 연결 이벤트 핸들링
io.on("connection", (socket) => {
    console.log(`🔌 [소켓 연결] 클라이언트 접속: ${socket.id}`);

    // 접속 직후 최신 텔레메트리 1회 즉시 전송
    socket.emit("telemetry-devices", getActiveDevicesSnapshot());

    // 접속 직후 최신 필터 1회 즉시 전송
    socket.emit("filter-init", activeFilterConfig);

    // 컴포넌트 마운트 시 발생할 수 있는 레이스 컨디션 해결을 위한 명시적 재요청 핸들러
    socket.on("request-filter-init", () => {
        socket.emit("filter-init", activeFilterConfig);
    });

    // 관제탑으로부터 필터 업데이트 요청 수신
    socket.on("update-filter", (newFilter: Partial<AutoDispatchFilter>) => {
        // destinationCity가 변경되면 GeoJSON에서 해당 도시의 읍면동을 자동 조회하여 destinationKeywords 갱신
        if (newFilter.destinationCity && newFilter.destinationCity !== activeFilterConfig.destinationCity) {
            const regions = getRegionsByCity(newFilter.destinationCity);
            newFilter.destinationKeywords = regions.join(',');
            console.log(`🗺️ [지역 자동 갱신] ${newFilter.destinationCity} → ${regions.length}개 읍면동 조회 완료`);
        }
        const updated = updateActiveFilter(newFilter);
        console.log(`🌐 [필터 변경] 합짐모드: ${updated.isSharedMode}, 활성: ${updated.isActive}, 단가: ${updated.minFare}, 상차반경: ${updated.pickupRadiusKm}km, 지역: ${updated.destinationCity}`);
        // 내 서버를 포함한 모든 클라이언트 대시보드에 즉각 브로드캐스트
        io.emit("filter-updated", updated);
    });

    // 앱폰 현위치 동기화 (관제탑 / 브라우저 기준)
    socket.on("update-my-location", (loc: { x: number, y: number }) => {
        updateDriverLocation(loc);
    });

    // ⭐ 관제사(사람)의 최종 판단 — 다이어그램 Line 84~99 대응
    // REST POST /decision/:id 를 Socket.io 이벤트로 전환
    socket.on("decision", ({ orderId, action }: { orderId: string, action: 'KEEP' | 'CANCEL' }) => {
        console.log(`⚖️ [소켓 Decision 수신] ID: ${orderId}, Action: ${action}`);
        const result = handleDecision(orderId, action, io);
        // 결과를 요청한 소켓에만 ACK
        socket.emit("decision-ack", result);
    });

    socket.on("disconnect", () => {
        console.log(`❌ [소켓 해제] 클라이언트 종료: ${socket.id}`);
    });
});

// 백그라운드 텔레메트리 (1초 주기로 모든 웹 클라이언트에게 기기 상태 + 평가 오더 싱크 푸시)
setInterval(() => {
    io.emit("telemetry-devices", getActiveDevicesSnapshot());
    // ⭐ 서버 메모리의 '실제 전체 평가 오더 객체 배열'을 1초마다 브로드캐스트
    // 웹 클라이언트가 중간에 새로고침(재접속)하더라도 즉시 화면을 복구할 수 있도록 전체 데이터를 보냄
    const activeOrdersPayload = Array.from(getPendingOrdersData().values());
    io.emit("sync-active-orders", activeOrdersPayload);
}, 1000);

// React 프론트엔드 정적 파일 서빙 (프로덕션 배포용)
const clientBuildPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientBuildPath)) {
    console.log(`✅ 프론트엔드 빌드 폴더를 서빙합니다: ${clientBuildPath}`);
    app.use(express.static(clientBuildPath));

    // API가 아닌 모든 요청은 React의 index.html을 응답 (SPA 라우팅 지원)
    app.use((req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
} else {
    console.log(`⚠️ 프론트엔드 빌드 폴더(${clientBuildPath})가 없으므로 정적 서빙을 건너뜁니다 (로컬 개발 환경).`);
}

const PORT = process.env.PORT || 4000;

httpServer.listen(PORT, () => {
    initGeoService();
    console.log(`\n🚀 1DAL 서버 (Express + Socket.io) 시작됨`);
    console.log(`📡 포트: ${PORT}`);
    console.log(`🌐 대시보드는 http://localhost:5173 에서 확인하세요\n`);
});
