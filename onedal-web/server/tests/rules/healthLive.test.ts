// @ts-nocheck
import healthRouter from '../../src/routes/health';

/**
 * 🩺 **로그인 전에도 «라이브 서버인가» 하나는 읽힌다** (onedal-1f 지시 · e7 요청).
 * 운영센터 · 관제웹 로그인 화면은 «개발 우회 로그인» 버튼을 live === false 일 때만 보인다 — 우회 문을 불러 보는 것으로 가르지 않는다.
 * 참/거짓 하나뿐이다 — 커밋 · 브랜치 · DB 파일명 같은 정찰 정보는 여전히 인증 뒤(/detail).
 */
const get = () => {
    const layer = healthRouter.stack.find((l: any) => l.route?.path === '/' && l.route.methods.get);
    let out: any;
    layer.route.stack[0].handle({}, { json: (b: any) => { out = b; } });
    return out;
};

describe('🩺 /api/health live', () => {
    it('🔴 로컬 · 검사 서버는 live false · 실서버 DB 면 true · 그 밖의 정찰 칸은 없다', () => {
        expect(get().live).toBe(false);
        const before = process.env.DB_FILE;
        process.env.DB_FILE = 'data.db';
        try { expect(get().live).toBe(true); } finally { process.env.DB_FILE = before; }
        expect(Object.keys(get()).sort()).toEqual(['bootedAt', 'live', 'now', 'ok', 'uptimeSec', 'uptimeText']);
    });
});
