import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { jwtSecret } from "../config/env";
import db from "../db";



// 토큰(디코딩)에 들어갈 유저 기본 정보 형태
export interface AuthUser {
    id: string;
    email: string;
    name: string;
    role: "ADMIN" | "USER";
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}

/**
 * 🪪 **이 서버의 유저인가** — 서명 검증과 **다른 질문**이다 (기사님 실측 2026-08-26).
 *
 * 로컬과 라이브가 같은 JWT 비밀을 쓰므로, 라이브에서 발급된 토큰도 로컬에서 **서명은
 * 통과한다.** 서명은 *"위조가 아니다"* 만 말할 뿐 *"어느 서버가 발급했나"* 를 모른다.
 *
 * 그래서 2026-08-26 새벽, 라이브 토큰을 든 클라이언트가 로컬에 4초 붙었고 —
 *
 *     ERR [Session] 유저 283e9dc3-… 필터 Lazy Load 중 오류: SQLITE_CONSTRAINT_FOREIGNKEY
 *     🔌 [소켓 연결] 유저 접속: 알타리(알타리) (283e9dc3-…)
 *
 * — **로컬 DB 에 없는 유저의 메모리 세션**이 남았다. 소켓은 끊겨도 세션은 안 지워지고
 * (`clearUserSession` 은 명시적 로그아웃 전용), 1초 인터벌이 그 뒤로 없는 유저까지 돌았다.
 *
 * 🔴 **판단은 여기 하나뿐이다** (규칙 ③). REST 와 소켓이 각자 `users` 를 조회하면
 *    한쪽만 고쳐진다 — 이 레포가 반복해 당한 «같은 판단 두 벌» 형태다.
 * ⚠️ 세션 저장소에서 막지 않는 이유: `getUserSession` 은 검사용 가짜 id 도 받아야 하는
 *    단순한 그릇이다. 막을 자리는 **문**이다.
 */
export function isKnownUser(userId: string | undefined | null): boolean {
    if (!userId) return false;
    return !!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId);
}

/**
 * Access Token 유효성 검증 및 req.user 주입 미들웨어
 * 로그인(인증)이 필요한 API 라우터에 부착합니다.
 */
export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "인증 토큰이 필요합니다." });
        return;
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, jwtSecret()) as AuthUser;

        // 🔴 서명이 맞아도 이 서버의 유저가 아니면 들이지 않는다 (남의 서버가 발급한 토큰)
        if (!isKnownUser(decoded.id)) {
            console.log(`❌ [AuthMiddleware] 이 서버에 없는 유저의 토큰 — ${decoded.id} (${decoded.email})`);
            res.status(401).json({ error: "이 서버에 등록되지 않은 계정입니다. 다시 로그인해 주세요." });
            return;
        }

        req.user = decoded; // 이후 라우터 로직에서 req.user.id 접근 가능
        next();
    } catch (err: any) {
        if (err.name === 'TokenExpiredError') {
            console.log("❌ [AuthMiddleware] 토큰 만료됨 (재발급 필요)");
        } else {
            console.log("❌ [AuthMiddleware] 토큰 검증 실패:", err.message || err);
        }
        // 만료되었거나 서명이 일치하지 않는 경우
        res.status(401).json({ error: "유효하지 않거나 만료된 토큰입니다." });
        return;
    }
};

/**
 * 관리자(ADMIN) 권한 체크 미들웨어
 * 주의: 반드시 requireAuth 이후에 체이닝해야 합니다.
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
        res.status(401).json({ error: "인증 정보가 없습니다." });
        return;
    }

    if (req.user.role !== "ADMIN") {
        res.status(403).json({ error: "접근 권한이 부족합니다 (ADMIN 전용)." });
        return;
    }

    next();
};
