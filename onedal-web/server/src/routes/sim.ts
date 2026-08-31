import { Router } from "express";
import { getAllActiveUserIds, getUserSession } from "../state/userSessionStore";
import { isLiveServer } from "../config/env";

const router = Router();

/**
 * 🧪 **배차망 시뮬레이터 전용 문** (기사님 확정 2026-08-31).
 *
 * 시뮬(`onedal-sim` · :5173)이 콜을 출제할 때 **«현위치 → 상차지» 거리**를 화면에 적는데,
 * 그 현위치가 **URL 로 한 번 고른 뒤 움직이지 않는 고정 좌표**였다. 기사님은 달리는데
 * 숫자는 그대로라, 상차 반경 축이 **실제 지리와 무관한 값으로 채점**됐다 —
 * 실측(0831): 적요는 «7.2km»인데 실제는 11.4km 였고, 22.4km 뒤 상차지가 통과했다.
 *
 * 실제 인성은 배차망 서버가 그 거리를 **매번 계산해서** 화면에 띄운다. 시뮬도 같아야
 * 책상 판의 채점이 진짜가 된다 — 그래서 여기서 «지금 어디»를 내준다.
 *
 * 🔴 **개발 빌드에서만 열린다.** 기사님의 실시간 위치는 노출하면 안 되는 값이다
 *    (2026-08-09 에 무인증 `GET /api/scrap` 을 «정찰 정보 노출»로 지운 것과 같은 이유).
 *    운영에서는 404 — 시뮬레이터가 없는 곳에는 이 문도 없다.
 *
 * 🔴 **«라이브인가»를 혼자 판정하지 않는다** (0831 리뷰에서 잡힘).
 *    레포에는 이미 `isLiveServer()` 가 있고 그 주석이 이 함정을 적어 뒀다 —
 *    *"신호를 둘 본다… 한쪽만 보면 그 설정이 빠진 날 조용히 열린다."*
 *    처음엔 `NODE_ENV` 하나만 봤는데, PM2 설정에서 그게 빠지면 **기사님 실시간 좌표가
 *    무인증으로 열린다.** 2026-08-09 에 «정찰 정보 노출»로 지운 자리보다 민감한 값이다.
 */
const isDevBuild = () => !isLiveServer();

router.get("/driver-location", (_req, res) => {
    if (!isDevBuild()) return res.status(404).json({ error: "not found" });

    /**
     * 로컬 판은 기사님 한 분이다 — 세션이 여럿이면 **고르지 않는다**(누구 위치인지 모르는
     * 값을 내주면 시뮬이 엉뚱한 거리로 출제한다 · 규칙 ④).
     */
    const userIds = getAllActiveUserIds();
    if (userIds.length !== 1) {
        return res.json({ ok: false, reason: userIds.length ? "세션이 여럿입니다" : "접속한 세션이 없습니다" });
    }
    const session = getUserSession(userIds[0]);
    const loc = session.driverLocation;
    if (!loc) return res.json({ ok: false, reason: "현위치를 아직 모릅니다" });

    return res.json({
        ok: true,
        x: loc.x, y: loc.y,
        /** GPS 가 아니라 «내 주소»로 메운 값인가 — 시뮬이 화면에 그대로 밝힌다 */
        isFallback: !!session.driverLocationIsFallback,
        at: session.driverLocationAt ?? null,
    });
});

export default router;
