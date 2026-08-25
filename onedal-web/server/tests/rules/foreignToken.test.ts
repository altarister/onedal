import jwt from 'jsonwebtoken';
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { requireAuth } from '../../src/middlewares/authMiddleware';
import { jwtSecret } from '../../src/config/env';

/**
 * 🪪 **서명이 맞다고 «이 서버의 유저»는 아니다** (기사님 실측 2026-08-26)
 *
 * 로컬 서버 로그에 이런 짝이 남았다:
 *
 *     05:22:01.449 ERR [Session] 유저 283e9dc3-… 필터 Lazy Load 중 오류: SQLITE_CONSTRAINT_FOREIGNKEY
 *     05:22:01.450     🔌 [소켓 연결] 유저 접속: 알타리(알타리) (283e9dc3-…)
 *
 * 같은 기사님인데 **로컬 DB 에는 없는 id** 다. 라이브에서 발급된 토큰을 든 클라이언트가
 * 로컬에 붙은 것이다 — 두 서버가 같은 JWT 비밀을 쓰므로 **서명 검증은 통과한다.**
 * 서명은 *"위조가 아니다"* 만 말할 뿐 *"어느 서버가 발급했나"* 를 구분하지 못한다.
 *
 * ── 그래서 무슨 일이 났나 ──
 * `getUserSession` 이 세션을 만들고, 외래키 오류는 `catch` 가 삼키고, 그래도
 * `sessions.set` 은 실행된다. 소켓은 4초 뒤 끊겼지만 **메모리 세션은 안 지워진다**
 * (`clearUserSession` 은 명시적 로그아웃에서만 불린다). 그 뒤로 1초 인터벌이
 * **없는 유저까지** 매초 돌았다.
 *
 * 눈에 띈 증상은 로그였다 — `🧭 [경로 순서]` 가 324줄 쌓였는데 내용은 3종류뿐이었다
 * (아래 `routeOrderSingleSource.test.ts` 가 그 짝을 막는다). 하지만 로그는 증상이고,
 * 뿌리는 **남의 서버 토큰이 문을 통과한 것**이다.
 *
 * ── 지킬 선 ──
 *   ① 문에서 막는다 — 세션 저장소가 아니라 **인증**의 일이다. 세션 저장소는
 *      테스트용 가짜 id 도 받아야 하는 단순한 그릇이다(`'midnight-cycle-test-user'`).
 *   ② 판단은 **한 곳**뿐이다 (규칙 ③) — REST 와 소켓이 각자 판단하면 한쪽만 고쳐진다.
 *      실제로 지금까지 **둘 다** 서명만 보고 있었다.
 *   ③ 로컬 우회 로그인(`/api/auth/bypass`)은 실제 유저 행을 집어 오므로 그대로 통과한다.
 */
const KNOWN = 'foreign-token-test-known-user';

beforeAll(() => {
    // jest 는 `.env` 를 안 읽는다 (dotenv 는 index.ts 부팅 경로에만 있다). 서명·검증이
    // 같은 값을 쓰기만 하면 되므로 검사용 비밀을 넣는다 — 실제 값은 필요 없다.
    process.env.JWT_SECRET ||= 'foreign-token-test-secret';
    db.prepare(`
        INSERT OR IGNORE INTO users (id, google_id, email, name, avatar, role)
        VALUES (?, ?, ?, ?, ?, 'USER')
    `).run(KNOWN, `gid-${KNOWN}`, 'known@onedal.local', '검사용', '');
});

afterAll(() => {
    db.prepare('DELETE FROM users WHERE id = ?').run(KNOWN);
});

const sign = (id: string) =>
    jwt.sign({ id, email: 'x@y.z', name: '알타리', role: 'USER' }, jwtSecret(), { expiresIn: '1h' });

/** requireAuth 를 가짜 req/res 로 한 번 태운다 */
const pass = (token: string) => {
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    let status = 0;
    const res: any = { status(c: number) { status = c; return res; }, json() { return res; } };
    let nexted = false;
    requireAuth(req, res, () => { nexted = true; });
    return { nexted, status };
};

describe('REST — 남의 서버가 발급한 토큰은 문에서 막는다', () => {
    it('이 서버에 있는 유저는 그대로 통과한다', () => {
        expect(pass(sign(KNOWN))).toEqual({ nexted: true, status: 0 });
    });

    it('🔴 서명은 맞지만 이 서버 DB 에 없는 유저는 401 — 유령 세션이 태어나지 않는다', () => {
        const r = pass(sign('283e9dc3-d20a-4123-8f92-1b05eea63ad5'));
        expect(r.nexted).toBe(false);
        expect(r.status).toBe(401);
    });
});

describe('소켓 — REST 와 같은 판단을 쓴다 (한 곳에서 정한다)', () => {
    /** 🔴 주석은 검사하지 않는다 — "왜 넣었는가"를 적어 둔 곳까지 잡으면 역사를 지운다 */
    const code = (rel: string) => readFileSync(join(__dirname, '../../src', rel), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('🔴 소켓 핸드셰이크도 «이 서버의 유저인가»를 확인한다', () => {
        expect(code('socket/socketHandlers.ts')).toMatch(/isKnownUser\(/);
    });

    it('🔴 판단은 한 곳에서만 만든다 — 각자 users 를 조회하지 않는다', () => {
        // 두 문이 각자 SELECT 를 쓰면 한쪽만 고쳐진다 (경유 4벌·상태목록 3벌과 같은 뿌리)
        expect(code('socket/socketHandlers.ts')).not.toMatch(/FROM\s+users/i);
    });
});
