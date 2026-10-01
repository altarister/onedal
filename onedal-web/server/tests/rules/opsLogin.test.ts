import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔐 **운영센터 로그인 — 들어올 수 있나는 서버가 정한다** (reviews/29 3단계 · `core/opsAccess` · onedal-1f 지시).
 *    🔴 화면이 토큰의 role 을 읽어 가르면 허락을 꺼도 30일 동안 들어온다 — 서버 403 하나로만 가른다.
 *    🔴 «개발 우회 로그인» 버튼은 서버가 `/api/health` 로 «라이브가 아니다»라고 말할 때만 그린다 —
 *       우회 문(`/auth/bypass`)을 불러 보는 것으로 가르면 그 부름 자체가 로그인이 된다.
 */
const SRC = join(__dirname, '../../../ops/src');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

describe('🔐 운영센터 로그인', () => {
    it('🔴 서버를 부르는 곳은 api/client.ts 하나 — 쪽 · 틀은 토큰을 직접 싣지 않는다', () => {
        for (const f of ['App.tsx', 'ui.tsx', 'pages/Login.tsx']) {
            expect(read(f)).not.toMatch(/Authorization|localStorage\.(get|set)Item\(['"]access_token/);
        }
        expect(read('api/client.ts')).toContain("config.headers.Authorization = `Bearer ${t}`");
    });

    it('🔴 들어올 수 있나는 서버 403 하나로 — 화면이 role 을 읽지 않는다', () => {
        const app = read('App.tsx');
        expect(app).toContain("statusOf(e) === 403");
        expect(app).toContain("await client.get('/ops/counts')");
        for (const f of ['App.tsx', 'pages/Login.tsx', 'api/client.ts']) expect(read(f)).not.toMatch(/role\s*===|\.role\b/);
    });

    it('🔴 우회 버튼은 health.live === false 일 때만 — 누르기 전에 /auth/bypass 를 부르지 않는다', () => {
        const login = read('pages/Login.tsx');
        expect(login).toContain('live === false && (');
        expect(login).not.toContain('bypass');   // 부르는 줄은 client.ts 의 loginBypass 안에만
        const client = read('api/client.ts');
        const bypassCalls = client.match(/'\/auth\/bypass'/g) ?? [];
        expect(bypassCalls).toHaveLength(1);
        expect(client).toMatch(/export async function loginBypass\(\): Promise<void> \{[\s\S]*?'\/auth\/bypass'/);
    });

    it('토큰이 없으면 로그인으로 · 401 이면 토큰을 지우고 로그인으로', () => {
        expect(read('App.tsx')).toContain("if (!token()) { navigate('/login', { replace: true }); return; }");
        expect(read('api/client.ts')).toMatch(/status === 401 && token\(\)\) \{\s*setToken\(null\);\s*window\.location\.assign\('\/login'\)/);
    });
});
