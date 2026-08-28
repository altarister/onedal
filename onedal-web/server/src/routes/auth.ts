import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { jwtSecret, jwtRefreshSecret, isLiveServer } from "../config/env";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { requireAuth } from "../middlewares/authMiddleware";
import { getUserSession, clearUserSession } from "../state/userSessionStore";
import { logRoadmapEvent } from "../utils/roadmapLogger";

const router = Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);



// ============================================
// 1. POST /api/auth/google : 구글 로그인 처리
// ============================================
router.post("/google", async (req, res) => {
    const { credential, userAgent } = req.body;

    if (!credential) {
        return res.status(400).json({ error: "Google 인증 코드(credential)가 존재하지 않습니다." });
    }

    try {
        logRoadmapEvent("서버", "관제탑으로 부터 구글 로그인 토큰 검증 요청 받음");
        // 1. Google OAuth2 서버에서 토큰 진위 확인 및 유저 정보 추출
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        if (!payload) throw new Error("구글 정보를 읽어올 수 없습니다.");

        const googleId = payload.sub;
        const email = payload.email!;
        const name = payload.name || "이름없음";
        const avatar = payload.picture || "";

        // 2. DB에 존재하는 유저인지 확인
        logRoadmapEvent("서버", "email 바탕으로 접속 유저 정보 DB 조회/생성 연산");
        let userRow = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId) as any;

        if (!userRow) {
            // 신규 가입 (UPSERT)
            const newId = uuidv4();
            db.prepare(`
                INSERT INTO users (id, google_id, email, name, avatar, role)
                VALUES (?, ?, ?, ?, ?, 'USER')
            `).run(newId, googleId, email, name, avatar);
            
            userRow = { id: newId, email, name, role: 'USER', avatar };
            
            // 신규 유저용 디폴트 설정 및 빈 필터 레코드 생성
            db.prepare(`INSERT INTO user_settings (user_id) VALUES (?)`).run(newId);
            db.prepare(`INSERT INTO user_filters (user_id) VALUES (?)`).run(newId);
            
            console.log(`✨ [AUTH] 신규 회원가입 처리: ${name} (${email})`);
        } else {
            console.log(`🔓 [AUTH] 기존 회원 로그인: ${name} (${email})`);
        }

        /**
         * 3. **30일짜리** Access Token 발급.
         *
         * ⚠️ 예전 주석은 "1시간짜리"였는데 코드는 처음부터 `30d` 였다 (2026-08-29 정정).
         * 🔴 그래서 **AT 가 RT(14일)보다 두 배 오래 산다** — 아래 Refresh Token 을 해시로
         *    저장하고 기기별로 폐기하는 설계는 *"AT 는 짧으니 RT 만 막으면 된다"* 를 전제한다.
         *    지금은 AT 를 막을 수단이 없어 그 전제가 성립하지 않는다.
         *    **코드를 안 고친 이유**: 줄이면 운행 중 로그아웃이 나고, 앱은 아직 네이티브
         *    구글 로그인이 없어(todo.md 🔐) 재로그인 수단이 없다. 기사님 판단이 필요한 값이다
         */
        const secret = jwtSecret();
        const accessToken = jwt.sign(
            { id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role },
            secret,
            { expiresIn: "30d" }
        );

        // 4. 14일짜리 Refresh Token 발급 및 DB 저장 (다중 기기 동시 지원 방식)
        const refreshSecret = jwtRefreshSecret();
        const refreshToken = jwt.sign(
            { sub: userRow.id, type: "refresh" },
            refreshSecret,
            { expiresIn: "14d" }
        );

        // DB 유출 시 2차 피해 방지를 위해 Refresh Token을 해시하여 저장
        const hashedRefreshToken = bcrypt.hashSync(refreshToken, 10);
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

        db.prepare(`
            INSERT INTO user_tokens (user_id, refresh_token, user_agent, expires_at)
            VALUES (?, ?, ?, ?)
        `).run(userRow.id, hashedRefreshToken, userAgent || req.headers['user-agent'] || "Unknown", expiresAt);

        // 5. 클라이언트에 Access/Refresh Token 및 유저 프로필 응답
        logRoadmapEvent("서버", "관제탑에게 인증 JWT Token 발급 및 정보 전달");
        return res.json({
            accessToken,
            refreshToken,
            user: {
                id: userRow.id,
                email: userRow.email,
                name: userRow.name,
                avatar: userRow.avatar,
                role: userRow.role
            }
        });

    } catch (err) {
        console.error("구글 로그인 처리 오류:", err);
        return res.status(500).json({ error: "구글 소셜 로그인 서버 검증에 실패했습니다." });
    }
});

// ============================================
// 2. POST /api/auth/refresh : Access Token 갱신
// ============================================
router.post("/refresh", async (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({ error: "Refresh Token이 제공되지 않았습니다." });
    }

    try {
        // 1. RT 조작/만료 여부 1차 검증
        const refreshSecret = jwtRefreshSecret();
        const decoded = jwt.verify(refreshToken, refreshSecret) as { sub: string, type: string };
        if (decoded.type !== "refresh") {
            return res.status(403).json({ error: "유효하지 않은 토큰 유형입니다." });
        }

        const userId = decoded.sub;

        // 2. 해당 유저가 보유한 '만료되지 않은' 해시화된 토큰 목록을 DB에서 조회
        const userTokens = db.prepare(`
            SELECT * FROM user_tokens 
            WHERE user_id = ? AND expires_at > ?
        `).all(userId, new Date().toISOString()) as any[];

        // 3. 제출한 RT와 일치하는 해시값이 테이블 안에 있는지 확인
        let matchedTokenId = null;
        for (const t of userTokens) {
            if (bcrypt.compareSync(refreshToken, t.refresh_token)) {
                matchedTokenId = t.id;
                break;
            }
        }

        if (!matchedTokenId) {
            return res.status(403).json({ error: "해당 기기에서 유효한 로그인 세션을 찾을 수 없거나 폐기되었습니다." });
        }

        // 4. 조회가 완료되었으므로 새 Access Token 발급 후 반환 (Silent Refresh)
        const secret = jwtSecret();
        const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
        const newAccessToken = jwt.sign(
            { id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role },
            secret,
            { expiresIn: "30d" }
        );

        return res.json({ accessToken: newAccessToken });

    } catch (err) {
        console.error("Token Refresh 오류:", err);
        return res.status(403).json({ error: "Refresh Token이 만료되었거나 서명이 올바르지 않습니다. 다시 로그인해주세요." });
    }
});

// ============================================
// 3. POST /api/auth/logout : 로그아웃 (기기 연동 토큰 폐기)
// ============================================
router.post("/logout", requireAuth, (req, res) => {
    const refreshToken = req.body?.refreshToken;
    const userId = req.user?.id;

    if (!userId || !refreshToken) {
        return res.json({ success: true }); // 무시
    }

    try {
        // 모든 토큰을 뒤져서 들어온 RT와 매치되는 단일 기기의 세션만 파기합니다.
        const userTokens = db.prepare(`SELECT * FROM user_tokens WHERE user_id = ?`).all(userId) as any[];
        
        for (const t of userTokens) {
            if (bcrypt.compareSync(refreshToken, t.refresh_token)) {
                db.prepare(`DELETE FROM user_tokens WHERE id = ?`).run(t.id);
                console.log(`🚪 [AUTH] 기기 로그아웃 처리 완료 (User: ${userId})`);
                // [신규] 완전히 로그아웃 처리되었으므로 메모리 세션도 함께 파기하여 다음 로그인 시 DB에서 프레시하게 불러오도록 함
                clearUserSession(userId);
                break;
            }
        }
        return res.json({ success: true });
    } catch(err) {
        return res.status(500).json({ error: "로그아웃 중 오류가 발생했습니다." });
    }
});

// ============================================
// 4. GET /api/auth/me : 현재 내 정보 로드
// ============================================
router.get("/me", requireAuth, (req, res) => {
    const userId = req.user?.id;
    try {
        const user = db.prepare("SELECT id, email, name, avatar, role FROM users WHERE id = ?").get(userId);
        const settings = db.prepare("SELECT * FROM user_settings WHERE user_id = ?").get(userId);
        const devices = db.prepare("SELECT * FROM user_devices WHERE user_id = ?").all(userId);
        
        // 관제 웹 로딩 속도(0초 동기화)를 위한 필터 선제공
        const session = getUserSession(userId as string);

        res.json({ user, settings, devices, filter: session.activeFilter });
    } catch(err) {
        res.status(500).json({ error: "정보 조회 중 오류가 발생했습니다." });
    }
});

// ============================================
// 5. POST /api/auth/bypass : 개발/테스트용 우회 로그인 (구글 연동 불가 기기용)
// ============================================
router.post("/bypass", async (req, res) => {
    /**
     * 🔒 **라이브에서는 없는 길이다** (2026-08-23).
     *
     * 이 라우트는 *"DB 의 첫 번째 유저를 무조건 가져오는"* 개발 편의 기능이다.
     * v2 배포 준비 중 확인해 보니 **라이브에서 그대로 열려 있었고**, 아무나 POST 하면
     * 기사님 계정의 **30일짜리 관리자 토큰**이 나왔다. 환경 가드가 하나도 없었다.
     *
     * 🔴 **토큰을 만들기 전에** 끊는다. 뒤에 두면 만들어 놓고 안 주는 꼴이다.
     * 🔴 **404 다.** 401 이면 *"여기 뭔가 있다"* 를 알려 주는 것이다.
     * 🔴 **로컬에서는 그대로 열어 둔다** — 막는 것이 목적이 아니라 라이브에서만 막는 것이
     *    목적이다. 매번 구글 로그인을 하면 개발이 느려진다.
     */
    if (isLiveServer()) {
        return res.status(404).json({ message: "Not Found" });
    }

    try {
        logRoadmapEvent("서버", "관제탑 개발자 로컬 우회 로그인 요청 받음");
        // DB에 있는 첫 번째 유저를 무조건 가져옴 (개발자 테스트용)
        let userRow = db.prepare("SELECT * FROM users LIMIT 1").get() as any;
        
        // 유저가 한 명도 없다면, 개발/테스트용 임시 계정을 강제 생성합니다.
        if (!userRow) {
            console.log("⚠️ DB에 유저가 없어 임시 개발자 계정을 생성합니다.");
            const newId = uuidv4();
            db.prepare(`
                INSERT INTO users (id, google_id, email, name, avatar, role)
                VALUES (?, ?, ?, ?, ?, 'ADMIN')
            `).run(newId, "bypass_google_id", "dev@onedal.local", "개발자(우회)", "");
            
            db.prepare(`INSERT INTO user_settings (user_id) VALUES (?)`).run(newId);
            db.prepare(`INSERT INTO user_filters (user_id) VALUES (?)`).run(newId);
            
            userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(newId) as any;
        }

        const secret = jwtSecret();
        const accessToken = jwt.sign(
            { id: userRow.id, email: userRow.email, name: userRow.name, role: userRow.role },
            secret,
            { expiresIn: "30d" }
        );

        const refreshSecret = jwtRefreshSecret();
        const refreshToken = jwt.sign(
            { sub: userRow.id, type: "refresh" },
            refreshSecret,
            { expiresIn: "14d" }
        );

        const hashedRefreshToken = bcrypt.hashSync(refreshToken, 10);
        const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

        db.prepare(`
            INSERT INTO user_tokens (user_id, refresh_token, user_agent, expires_at)
            VALUES (?, ?, ?, ?)
        `).run(userRow.id, hashedRefreshToken, "Bypass-Agent", expiresAt);

        console.log(`🔓 [AUTH] 로컬 우회 로그인: ${userRow.name} (${userRow.email})`);
        
        return res.json({
            accessToken,
            refreshToken,
            user: {
                id: userRow.id,
                email: userRow.email,
                name: userRow.name,
                avatar: userRow.avatar,
                role: userRow.role
            }
        });
    } catch (err) {
        console.error("우회 로그인 처리 오류:", err);
        return res.status(500).json({ error: "우회 로그인 처리 중 오류 발생" });
    }
});

export default router;
