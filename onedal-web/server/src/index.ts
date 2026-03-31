import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

import ordersRouter from "./routes/orders";
import intelRouter from "./routes/intel";

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
app.use("/api/intel", intelRouter);

// 소켓 연결 이벤트 핸들링
io.on("connection", (socket) => {
    console.log(`🔌 [소켓 연결] 클라이언트 접속: ${socket.id}`);

    socket.on("disconnect", () => {
        console.log(`❌ [소켓 해제] 클라이언트 종료: ${socket.id}`);
    });
});

// React 프론트엔드 정적 파일 서빙 (프로덕션 배포용)
const clientBuildPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientBuildPath)) {
    console.log(`✅ 프론트엔드 빌드 폴더를 서빙합니다: ${clientBuildPath}`);
    app.use(express.static(clientBuildPath));

    // API가 아닌 모든 요청은 React의 index.html을 응답 (SPA 라우팅 지원)
    app.get('*', (req, res) => {
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
