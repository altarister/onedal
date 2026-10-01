import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🔔 **운영센터 소켓 — 서버 `/ops` 이름공간 · 신호만 듣고 자료는 GET** (reviews/29 5단계 · onedal-1f «KEEP 직후 바로 통화»).
 *    🔴 기사 관제웹 소켓 길에 붙으면 같은 계정이 «다른 기기에서 접속» 창을 보거나 기사 세션 부트스트랩이 돈다 — 길을 따로 둔다.
 *    30초 다시 읽기는 신호가 끊겼을 때의 물러설 자리다.
 */
const WEB = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('🔔 운영센터 소켓', () => {
    it('🔴 /ops 이름공간 · 토큰은 token() 하나 · 허락 확인 뒤에 연다 · 나가면 닫는다', () => {
        const s = read('ops/src/api/socket.ts');
        expect(s).toContain("io(`${base}/ops`");
        expect(s).toContain('auth: cb => cb({ token: token() })');
        expect(s).not.toMatch(/localStorage|clientSessionId|deviceInfo/);
        const app = read('ops/src/App.tsx');
        expect(app).toMatch(/session\.name = await fetchMeName\(\);\s*\n\s*if \(alive\) \{ connectSignal\(\);/);
        expect(app).toContain('disconnectSignal();');
    });

    it('🔴 통화 도우미는 ops-calls-changed 를 듣고 GET 으로 다시 읽는다 · 30초는 신호가 끊겼을 때만', () => {
        const c = read('ops/src/pages/Calls.tsx');
        const s0 = read('ops/src/api/socket.ts');
        expect(c).toContain("useCallsChanged(onSignal)");
        expect(s0).toContain("socket.on('ops-calls-changed', onEvent)");   // 글자 그대로 — audit:socket 이 센다
        expect(c).toMatch(/if \(connected\) return; const t = setInterval\(reload, 30_000\)/);
        const s = read('ops/src/api/socket.ts');
        expect(s).toMatch(/socket\.on\('connect'/);                       // 다시 이어지면 한 번 더 읽는다
        expect(s).not.toMatch(/s\.on\('(orders|steps-synced|filter-init)/); // 자료 이벤트는 듣지 않는다
    });

    it('🔴 소켓 감사의 알려진 빈칸에 ops-calls-changed 가 없다 — 들으니 감사가 진짜로 문다', () => {
        expect(read('scripts/audit-socket-contract.mjs')).not.toContain("'ops-calls-changed':");
    });
});
