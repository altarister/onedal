import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

import ordersRouter from "./routes/orders";
import scrapRouter from "./routes/scrap";
import { getRegionsByCity } from "./geoResolver";
import kakaoRouter from "./routes/kakao";
import devicesRouter, { getActiveDevicesSnapshot } from "./routes/devices";
import { activeFilterConfig, updateActiveFilter } from "./state/filterStore";
import type { FilterConfig } from "@onedal/shared";

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

// API 라우터 등록
app.use("/api/orders", ordersRouter);
app.use("/api/scrap", scrapRouter);
app.use("/api/kakao", kakaoRouter);
app.use("/api/devices", devicesRouter);

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
    socket.on("update-filter", (newFilter: Partial<FilterConfig>) => {
        // targetCity가 변경되면 GeoJSON에서 해당 도시의 읍면동을 자동 조회하여 targetRegions 갱신
        if (newFilter.targetCity && newFilter.targetCity !== activeFilterConfig.targetCity) {
            const regions = getRegionsByCity(newFilter.targetCity);
            newFilter.targetRegions = regions;
            console.log(`🗺️ [지역 자동 갱신] ${newFilter.targetCity} → ${regions.length}개 읍면동 조회 완료`);
        }
        const updated = updateActiveFilter(newFilter);
        console.log(`🌐 [필터 변경] 모드: ${updated.mode}, 단가: ${updated.minFare}, 반경: ${updated.pickupRadius}km, 지역: ${updated.targetCity}(${updated.targetRegions?.length}개동)`);
        // 내 서버를 포함한 모든 클라이언트 대시보드에 즉각 브로드캐스트
        io.emit("filter-updated", updated);
    });

    socket.on("disconnect", () => {
        console.log(`❌ [소켓 해제] 클라이언트 종료: ${socket.id}`);
    });
});

// 백그라운드 텔레메트리 (1초 주기로 모든 웹 클라이언트에게 기기 상태 푸시)
setInterval(() => {
    io.emit("telemetry-devices", getActiveDevicesSnapshot());
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
    console.log(`\n🚀 1DAL 서버 (Express + Socket.io) 시작됨`);
    console.log(`📡 포트: ${PORT}`);
    console.log(`🌐 대시보드는 http://localhost:5173 에서 확인하세요\n`);
});
