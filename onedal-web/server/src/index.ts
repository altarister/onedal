import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

import ordersRouter from "./routes/orders";
import detailRouter from "./routes/detail";
import scrapRouter from "./routes/scrap";
import emergencyRouter from "./routes/emergency";
import kakaoRouter from "./routes/kakao";
import devicesRouter from "./routes/devices";
import configRouter from "./routes/config";
import authRouter from "./routes/auth";
import settingsRouter from "./routes/settings";
import filtersRouter from "./routes/filters";

import { initGeoService } from "./services/geoService";
import { logRoadmapEvent } from "./utils/roadmapLogger";
import { registerSocketHandlers } from "./socket/socketHandlers";
import { Server as SocketIOServer } from "socket.io";

dotenv.config({ path: path.join(__dirname, "../.env") });

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
app.use("/api/auth", authRouter); // OAuth 로그인/인증 라우터
app.use("/api/settings", settingsRouter); // 개인화 설정 라우터
app.use("/api/filters", filtersRouter); // 콜 사냥용 필터 라우터


// 소켓 연결 이벤트 핸들링 (Step 4 분리 완료)
registerSocketHandlers(io);

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
    // hydrateSessionsFromDB(); // 서버 기동 시 일괄 복구 로직 폐기 완료 (userSessionStore에서 Lazy Load로 대체)
    logRoadmapEvent("서버", "서버 기동 및 디폴트 필터 셋업 (대기 모드)");
    console.log(`\n🚀 1DAL 서버 (Express + Socket.io) 시작됨`);
    console.log(`📡 서버 포트: ${PORT}`);
    console.log(`🌐 대시보드는 http://localhost:3000 에서 확인하세요\n`);
});
