import { readFileSync } from 'fs';
import { join } from 'path';
import { isLiveServer } from '../../src/config/env';

/**
 * 🔒 **개발용 우회 로그인은 라이브에서 열려 있으면 안 된다** (2026-08-23 발견).
 *
 * v2 배포를 준비하며 라이브를 훑다가 나왔다:
 *
 * ```
 * POST https://1dal.altari.com/api/auth/bypass  →  200
 * {"accessToken":"…altarister@gmail.com…","role":"ADMIN"}   ← 30일짜리 관리자 토큰
 * ```
 *
 * `/bypass` 는 *"DB 의 첫 번째 유저를 무조건 가져오는"* 개발 편의 기능이다
 * (매번 구글 로그인을 하면 개발이 느려진다). **환경 가드가 하나도 없었다.**
 *
 * 지금까지는 5월 시험 데이터라 넘어갔지만, v2 부터는 **집 주소와 실제 운행 기록**이 들어간다.
 *
 * 🔴 **로컬에서는 계속 열어 둔다.** 막는 것이 목적이 아니라 **라이브에서만** 막는 것이 목적이다.
 */
describe('🔒 isLiveServer — 여기가 라이브인가', () => {
    const saved = { ...process.env };
    afterEach(() => { process.env = { ...saved }; });

    it('NODE_ENV=production 이면 라이브다 (PM2 가 넣는 값)', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.DB_FILE;
        expect(isLiveServer()).toBe(true);
    });

    /**
     * 🔴 **신호를 둘 본다.** PM2 설정이 바뀌어 `NODE_ENV` 가 빠져도 실 DB 를 보고 있으면
     *    라이브다. 보안 판단은 **애매하면 닫는다** — 한쪽만 보면 조용히 열린다.
     */
    it('DB_FILE=data.db 면 NODE_ENV 가 없어도 라이브다', () => {
        delete process.env.NODE_ENV;
        process.env.DB_FILE = 'data.db';
        expect(isLiveServer()).toBe(true);
    });

    it('둘 다 아니면 로컬이다 — 개발 편의를 뺏지 않는다', () => {
        delete process.env.NODE_ENV;
        delete process.env.DB_FILE;
        expect(isLiveServer()).toBe(false);
    });

    it('local.db 를 보고 있으면 로컬이다', () => {
        process.env.NODE_ENV = 'development';
        process.env.DB_FILE = 'local.db';
        expect(isLiveServer()).toBe(false);
    });
});

describe('🔒 /api/auth/bypass — 라이브에서는 없는 길이어야 한다', () => {
    const src = readFileSync(join(__dirname, '../../src/routes/auth.ts'), 'utf8');
    /** 주석에 적어 두고 코드에 안 넣는 사고가 이 레포에 네 번 있었다 — 주석을 지우고 본다 */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const bypass = code.split('router.post("/bypass"')[1]?.split('router.')[0] ?? '';

    it('bypass 라우트가 존재한다 (지운 게 아니라 막는 것이다)', () => {
        expect(bypass).not.toBe('');
    });

    it('🔴 라이브면 즉시 404 로 끊는다 — 토큰을 만들기 전에', () => {
        expect(bypass).toMatch(/isLiveServer\(\)/);
        expect(bypass).toMatch(/404/);
        // 토큰 서명보다 **먼저** 막아야 한다. 뒤에 있으면 만들어 놓고 안 주는 꼴이다
        const gateAt = bypass.indexOf('isLiveServer()');
        const signAt = bypass.indexOf('jwt.sign');
        expect(gateAt).toBeGreaterThanOrEqual(0);
        expect(gateAt).toBeLessThan(signAt);
    });

    it('🔴 "없는 길"처럼 보이게 한다 — 401 이면 존재를 알려 주는 것이다', () => {
        expect(bypass).not.toMatch(/status\(401\)/);
    });
});
