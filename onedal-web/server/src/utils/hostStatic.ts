import fs from "fs";
import path from "path";
import express, { type Express } from "express";
import { slog } from "./fileLogger";

/**
 * 🌐 **주소(Host) 앞머리로 가르는 정적 서빙 — 한 함수** — rehearsal.(시뮬레이터) · ops.(운영센터)가 같이 쓴다.
 * 🔴 **API 라우터 뒤 · 관제웹 서빙 앞**에서 부른다 — 그 주소에서도 /api 는 살아야 하고(관제웹 서빙이 먼저 잡으면 index.html 이 API 를 덮는다),
 *    관제웹보다 뒤면 영영 안 불린다. 같은 서버 · 같은 포트에 얹어 각 앱을 루트로 서빙한다(vite base · basename 을 안 건드린다).
 * 빌드가 없으면 부팅 한 줄만 남기고 건너뛴다 — 기사용 서버가 안 멈추고 그 주소도 관제웹을 받는다.
 * @returns 서빙을 붙였나
 */
export function serveForHost(app: Express, hostPrefix: string, buildPath: string, label: string): boolean {
    if (!fs.existsSync(buildPath)) {
        slog('부팅', `⚠️ ${label} 빌드(${buildPath})가 없어 건너뜁니다 — 빌드하면 켜집니다.`);
        return false;
    }
    slog('부팅', `🌐 [주소별 서빙] ${label} — ${buildPath} (host: ${hostPrefix}*)`);
    const staticOf = express.static(buildPath);
    app.use((req, res, next) => {
        if (!req.hostname?.startsWith(hostPrefix)) return next();
        staticOf(req, res, () => res.sendFile(path.join(buildPath, 'index.html')));
    });
    return true;
}
