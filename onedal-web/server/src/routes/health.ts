import { Router } from "express";
import { execSync } from "child_process";

const router = Router();

/**
 * [이슈 U] 지금 돌고 있는 서버가 "어떤 코드"인지 알려주는 엔드포인트.
 *
 * 2026-08-09 하루에만 세 번, 코드를 고쳤는데 `tsx watch`가 변경을 감지하지 못해
 * 옛 서버가 계속 돌고 있었고, 그걸 모른 채 "고쳤는데 왜 안 되지"를 반복했다.
 * (OrderRepository.ts, scrap.ts 수정 시 각각 발생)
 *
 * 앱에는 versionName 마커를 붙여 해결했으므로, 서버도 동일하게
 * 부팅 시각과 커밋 해시를 밖에서 확인할 수 있어야 한다.
 * 소스를 고쳤는데 bootedAt이 그대로면 재기동이 안 된 것이다.
 */

const BOOTED_AT = new Date();

/** 부팅 시점에 1회만 읽는다. git이 없거나 배포본이 아니면 unknown */
const GIT_INFO = (() => {
    try {
        // stdio: "pipe" — git 에러 메시지가 서버 콘솔로 새지 않게 한다
        const opts = { cwd: __dirname, encoding: "utf-8" as const, stdio: "pipe" as const };
        return {
            commit: execSync("git rev-parse --short HEAD", opts).trim(),
            branch: execSync("git rev-parse --abbrev-ref HEAD", opts).trim(),
            committedAt: execSync("git log -1 --format=%cI", opts).trim(),
        };
    } catch {
        return { commit: "unknown", branch: "unknown", committedAt: "unknown" };
    }
})();

/** 기동 로그에 찍어 터미널에서도 바로 보이게 한다 */
export function logServerIdentity() {
    console.log(`🧾 [BUILD] commit ${GIT_INFO.commit} (${GIT_INFO.branch}) · 부팅 ${BOOTED_AT.toLocaleString("ko-KR")}`);
}

// GET /api/health — 인증 불필요 (민감 정보 없음, 상태 확인 전용)
router.get("/", (_req, res) => {
    const uptimeSec = Math.floor((Date.now() - BOOTED_AT.getTime()) / 1000);
    res.json({
        ok: true,
        bootedAt: BOOTED_AT.toISOString(),
        uptimeSec,
        uptimeText: `${Math.floor(uptimeSec / 3600)}시간 ${Math.floor((uptimeSec % 3600) / 60)}분`,
        git: GIT_INFO,
        env: process.env.NODE_ENV || "development",
        dbFile: process.env.DB_FILE || "local.db",
        node: process.version,
    });
});

export default router;
