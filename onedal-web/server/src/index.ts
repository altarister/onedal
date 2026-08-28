// Force trigger GitHub Actions deployment
/**
 * 🔴 **맨 위여야 한다.** 이 줄 아래의 import 들이 모듈 로드 중에 찍는 로그(DB 준비, 지오 로드
 *    등)까지 파일에 남기려면 `console` 가로채기가 그보다 먼저 일어나야 한다.
 */
import { initFileLogger } from "./utils/fileLogger";
initFileLogger();

import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import db from "./db";   // 🛑 종료 절차에서 닫는다 (아래 shutdown)
import { pruneGpsTracks, flushGpsBuffer, GPS_TRACK } from "./services/gpsTrackStore";

import ordersRouter from "./routes/orders";
import detailRouter from "./routes/detail";
import scrapRouter from "./routes/scrap";
import emergencyRouter from "./routes/emergency";
import kakaoRouter from "./routes/kakao";
import devicesRouter from "./routes/devices";
import configRouter from "./routes/config";
import authRouter from "./routes/auth";
import settingsRouter from "./routes/settings";
import logbookAnalyticsRouter from "./routes/logbook/analytics";
import logbookPlacesRouter from "./routes/logbook/places";
import logbookFilterDaysRouter from "./routes/logbook/filterDays";
import logbookGpsTrackRouter from "./routes/logbook/gpsTrack";
import healthRouter, { logServerIdentity } from "./routes/health";
import logsRouter from "./routes/logs";
import { validateEnv } from "./config/env";

import { initGeoService } from "./services/geoService";
import { logRoadmapEvent } from "./utils/roadmapLogger";
import { registerSocketHandlers } from "./socket/socketHandlers";

dotenv.config({ path: path.join(__dirname, "../.env") });

// [Phase 1 / 이슈 B] 필수 환경 변수 검증. 반드시 dotenv.config() 이후에 호출한다.
// 없으면 여기서 부팅을 중단한다 (조용히 fallback 문자열로 동작하는 것을 막는다).
validateEnv();

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
// [이슈 U] 지금 도는 서버가 어떤 코드인지 밖에서 확인 (부팅 시각·커밋 해시)
app.use("/api/health", healthRouter);
// 🖥️ 관제웹이 스스로 남기는 로그 — 인증을 걸지 않는다 (로그인 전 화면도 남겨야 한다)
app.use("/api/logs", logsRouter);

app.use("/api/orders", ordersRouter);
app.use("/api/orders/detail", detailRouter);
app.use("/api/scrap", scrapRouter);
app.use("/api/kakao", kakaoRouter); // Dashboard UI의 클라이언트 사이드 카카오 연산용 프록시 (유지)
app.use("/api/devices", devicesRouter);
app.use("/api/emergency", emergencyRouter);  // [Safety Mode V3] 앱폰 비상 보고
app.use("/api/config", configRouter); // 타겟 앱 키워드 연동
app.use("/api/auth", authRouter); // OAuth 로그인/인증 라우터
app.use("/api/settings", settingsRouter); // 개인화 설정 라우터
// [2026-08-12] GET/PUT /api/filters 제거 — 관제웹·앱·운행일지 전수 grep 결과 **호출부 0건**.
//   PUT 은 소켓 `update-filter` 와 똑같이 updateActiveFilter 를 부르는 두 번째 입구였고,
//   GET 은 필터 필드를 손으로 다시 나열해 새 필드(customCityFilters 등)가 빠진 채 굳어 있었다.
//   입구가 둘이면 한쪽만 고쳐진다.

// ── BFF: Logbook (운행일지 대시보드 전용) ──
app.use("/api/logbook/analytics", logbookAnalyticsRouter);
app.use("/api/logbook/filter-days", logbookFilterDaysRouter);
app.use("/api/logbook/places", logbookPlacesRouter);
app.use("/api/logbook/gps-track", logbookGpsTrackRouter);


// [Phase 1.5] 정의되지 않은 /api/* 요청은 여기서 404 JSON으로 끊는다.
// 아래 SPA 폴백보다 반드시 먼저 등록되어야 한다.
// 이 가드가 없으면 오타난 엔드포인트나 삭제된 라우트가 index.html(text/html, 200)을 반환해
// 앱(Gson)이 HTML을 파싱하려다 예외를 내고, 실패 원인을 추적할 수 없게 된다.
app.use("/api", (req, res) => {
    console.warn(`⚠️ [404] 정의되지 않은 API 경로: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: "NOT_FOUND", message: `정의되지 않은 API 경로입니다: ${req.method} ${req.originalUrl}` });
});

// 소켓 연결 이벤트 핸들링 (Step 4 분리 완료)
registerSocketHandlers(io);

/**
 * 🎯 **리허설 배차망** — `rehearsal.altari.com` 은 시뮬레이터를 서빙한다 (기사님 확정 2026-08-23).
 *
 * 기사님: *"지금 올라가 있는 건 **리스트 컨트롤을 할 수 없거든.** 구로동 쪽으로 배달 가능한
 * 콜을 하나 확실히 넣어야 이동 중에 콜을 잡을 걸 확인할 수 있어."*
 *
 * 옛 배포본(`map.altari.com`)은 다른 레포가 올린 것이라 **랜덤**이다. 문제지(`?preset=`)는
 * 레포 안의 `onedal-sim` 에만 있다. 랜덤으로는 *"구로행 콜을 주행 중에 잡았다"* 를
 * **만들 수 없고, 안 나오면 시험 자체가 성립하지 않는다.**
 *
 * 🔴 **같은 서버·같은 포트에 얹되 Host 로만 가른다.** 그래야 시뮬레이터를 **루트로** 서빙할 수
 *    있고, `vite base` 나 `BrowserRouter basename` 을 건드리지 않아도 된다 —
 *    건드리면 **로컬(5173)과 배포본이 갈라져** 문제지가 로컬에서만 맞는 일이 생긴다.
 *
 * ⚠️ **API 라우터 뒤, 관제웹 서빙 앞**에 둔다. 리허설 호스트에서도 `/api` 는 살아 있어야
 *    하고(관제웹 서빙이 먼저 잡으면 시뮬 index.html 이 API 를 덮는다), 이 블록이
 *    관제웹보다 뒤면 영영 안 불린다.
 */
const REHEARSAL_HOST = 'rehearsal.';
const simBuildPath = path.join(__dirname, '../../../onedal-sim/dist');
if (fs.existsSync(simBuildPath)) {
    console.log(`🎯 리허설 배차망을 서빙합니다: ${simBuildPath} (host: ${REHEARSAL_HOST}*)`);
    const simStatic = express.static(simBuildPath);
    app.use((req, res, next) => {
        if (!req.hostname?.startsWith(REHEARSAL_HOST)) return next();
        simStatic(req, res, () => res.sendFile(path.join(simBuildPath, 'index.html')));
    });
} else {
    console.log(`⚠️ 리허설 배차망 빌드(${simBuildPath})가 없어 건너뜁니다 — onedal-sim 을 빌드하면 켜집니다.`);
}

// React 프론트엔드 정적 파일 서빙 (프로덕션 배포용)
const clientBuildPath = path.join(__dirname, '../../client-app/dist');
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

httpServer.listen(PORT as number, "0.0.0.0", () => {
    initGeoService();
    /**
     * 🛰️ 궤적 보관 정리 — **부팅 때 한 번.** 8일째 부팅하면 1일차가 지워진다.
     *    서버 로그가 3일치만 두는 것과 같은 규칙이다 (기사님 확정 2026-08-26).
     */
    {
        const n = pruneGpsTracks();
        if (n > 0) console.log(`🛰️ [궤적 정리] ${GPS_TRACK.KEEP_DAYS}일 지난 좌표 ${n.toLocaleString()}점 삭제`);
    }
    logServerIdentity();
    // hydrateSessionsFromDB(); // 서버 기동 시 일괄 복구 로직 폐기 완료 (userSessionStore에서 Lazy Load로 대체)
    logRoadmapEvent("서버", "서버 기동 및 디폴트 필터 셋업 (대기 모드)");
    console.log(`\n🚀 1DAL 서버 (Express + Socket.io) 시작됨`);
    console.log(`📡 서버 포트: ${PORT}`);
    console.log(`🌐 대시보드는 http://localhost:3000 에서 확인하세요\n`);
});

/**
 * 🛑 **끝내는 절차** (기사님 실측 2026-08-26)
 *
 * 기사님이 Ctrl+C 를 누르시자 `tsx` 가 이렇게 뱉었다:
 *
 *     [tsx] Previous process hasn't exited yet. Force killing...
 *
 * 정중히 나가라(SIGTERM)고 했는데 안 나가서 **강제로 죽인 것**이다. 서버에 종료 절차가
 * 하나도 없었다. Node 는 **열린 손잡이가 하나라도 있으면 안 죽는다** — 듣고 있는 HTTP
 * 소켓, 붙어 있는 Socket.IO 연결, 1초 인터벌 두 개를 그대로 쥔 채 신호를 받았다.
 *
 * ── 왜 이게 중요한가 ──
 * 버그 대장 #40 은 **기사님이 껐다고 믿은 서버가 4시간 40분 더 돌며** 지워진 콜을
 * 화면에 보낸 사고다. 그때는 Ctrl+C 가 **닿지 않았고**(`a & b & c`), 이번엔 **닿았는데
 * 안 나갔다.** 뿌리는 같다 — 서버가 스스로 끝낼 줄을 몰랐다.
 *
 * ── 순서에 이유가 있다 ──
 *   ① `io.close()`      — 관제탑을 먼저 내보낸다. 소켓이 붙어 있으면 HTTP 가 안 닫힌다
 *   ② `closeAllConnections()` — keep-alive 는 «놀고 있어도» 살아 있다. 이걸 안 하면
 *                          `close()` 콜백이 영영 안 온다 (여기서 제일 오래 매달렸다)
 *   ③ `httpServer.close()`    — 듣기를 멈추고, 다 빠지면 콜백이 온다
 *   ④ `db.close()`      — 강제 종료(SIGKILL)로 끝나면 **닫을 기회가 없다.**
 *                          지금은 WAL 이라 견디지만 기본값으로 둘 일은 아니다
 *
 * 🔴 **그래도 안 나가면 우리가 먼저 끝낸다.** 3초 뒤 `process.exit` —
 *    종료 코드를 tsx 의 SIGKILL 이 아니라 **우리가 정한다.**
 * 🔴 두 번 눌러도 한 번만 돈다. 정리 도중에 또 들어오면 절차가 겹친다.
 * ⚠️ 타이머 자신도 `unref()` — 이 타이머 때문에 3초를 기다리면 본말전도다.
 */
let shuttingDown = false;
function shutdown(signal: string) {
    if (shuttingDown) return;           // 두 번 눌러도 절차는 한 번뿐
    shuttingDown = true;
    console.log(`\n🛑 [종료] ${signal} 수신 — 관제탑을 내보내고 서버를 닫습니다`);
    // 🛰️ 아직 디스크로 안 간 궤적을 먼저 쓴다 — 안 그러면 마지막 구간이 통째로 사라진다
    flushGpsBuffer();

    // 못 나가는 연결이 하나라도 있으면 여기서 끝낸다 (tsx 가 강제로 죽이기 전에)
    const giveUp = setTimeout(() => {
        console.log(`🛑 [종료] 3초가 지나 스스로 끊습니다 (안 놓아준 연결이 있습니다)`);
        process.exit(0);
    }, 3000);
    giveUp.unref();

    io.close(() => {
        httpServer.closeAllConnections?.();      // keep-alive 가 붙잡는다
        httpServer.close(() => {
            try { db.close(); } catch { /* 이미 닫혔으면 그만이다 */ }
            console.log(`🛑 [종료] 정리 완료 — 안녕히 가세요`);
            clearTimeout(giveUp);
            process.exit(0);
        });
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));      // Ctrl+C
process.on("SIGTERM", () => shutdown("SIGTERM"));    // tsx watch 의 재시작 · 배포
