import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";



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
        const secret = process.env.JWT_SECRET || "fallback_secret";
        const decoded = jwt.verify(token, secret) as AuthUser;
        req.user = decoded; // 이후 라우터 로직에서 req.user.id 접근 가능
        next();
    } catch (err) {
        console.log("❌ [AuthMiddleware] 토큰 검증 실패:", err);
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
