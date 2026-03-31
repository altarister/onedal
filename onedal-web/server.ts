import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setIO } from "./src/lib/socket.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0"; // 외부 기기(스캐너 폰)에서 접근 가능하도록
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const httpServer = createServer((req, res) => {
        handle(req, res);
    });

    // Socket.io 서버 생성
    const io = new SocketIOServer(httpServer, {
        cors: {
            origin: "*", // 스캐너 폰의 HTTP POST도 허용
        },
    });

    // 글로벌에 저장 (API Route에서 접근하기 위함)
    setIO(io);

    io.on("connection", (socket) => {
        console.log(`🔌 [소켓 연결] 클라이언트 접속: ${socket.id}`);

        socket.on("disconnect", () => {
            console.log(`❌ [소켓 해제] 클라이언트 종료: ${socket.id}`);
        });
    });

    httpServer.listen(port, () => {
        console.log(`\n🚀 1DAL 관제탑 서버 시작`);
        console.log(`   로컬: http://localhost:${port}`);
        console.log(`   네트워크: http://0.0.0.0:${port}`);
        console.log(`   Socket.io: 활성화 ✅\n`);
    });
});
