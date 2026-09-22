import { Router } from "express";
import { execSync } from "child_process";
import { requireAuth } from "../middlewares/authMiddleware";

const router = Router();

/**
 * [이슈 U] 지금 돌고 있는 서버가 "어떤 코드"인지 알려주는 엔드포인트.
 *
 * `tsx watch` 가 변경을 놓치면 옛 서버가 계속 도는데, 그걸 모르면 «고쳤는데 왜 안 되지»를 반복한다.
 *
 * 앱에는 versionName 마커를 붙여 해결했으므로, 서버도 동일하게
 * 부팅 시각과 커밋 해시를 밖에서 확인할 수 있어야 한다.
 * 소스를 고쳤는데 bootedAt이 그대로면 재기동이 안 된 것이다.
 */

/** 판 점검(`/api/sim/preflight`)도 이 값을 쓴다 — 「고친 코드가 도는가」의 유일한 답 */
export const BOOTED_AT = new Date();

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

function uptime() {
    const sec = Math.floor((Date.now() - BOOTED_AT.getTime()) / 1000);
    return { uptimeSec: sec, uptimeText: `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분` };
}

/**
 * GET /api/health — 무인증. **최소 정보만** 노출한다.
 *
 * 무인증으로는 «재기동됐는가»를 판별할 bootedAt 만 연다 — git 커밋·브랜치·NODE_ENV·DB 파일명·Node 버전은
 * 정찰 정보라 인증 뒤에 둔다.
 */
router.get("/", (_req, res) => {
    /**
     * 🕐 **`now` 는 관제웹이 「서버 시계」를 맞추는 데 쓴다** (기사님:
     *    *"폰 시계가 아니고 서버 시계로 만들어야 해.. 그래야 서버 시간으로 우리가 계산하지."*)
     *
     * 🔴 상차 마감·안전취소 30초는 **서버 시각**으로 잰다 — 화면이 폰 시계(`new Date()`)를 쓰면 폰 시계가
     *    틀어졌을 때 화면과 판정이 갈라진다.
     * 🔴 인증 뒤(`/detail`)가 아니라 **여기**에 둔다 — 로그인 전에도 맞춰야 한다.
     */
    res.json({ ok: true, now: Date.now(), bootedAt: BOOTED_AT.toISOString(), ...uptime() });
});

/** GET /api/health/detail — 로그인 필요. 배포 진단용 상세 정보 */
router.get("/detail", requireAuth, (_req, res) => {
    res.json({
        ok: true,
        bootedAt: BOOTED_AT.toISOString(),
        ...uptime(),
        git: GIT_INFO,
        env: process.env.NODE_ENV || "development",
        dbFile: process.env.DB_FILE || "local.db",
        node: process.version,
    });
});

export default router;
