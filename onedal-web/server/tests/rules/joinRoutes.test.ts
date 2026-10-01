import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📝 **가입 쪽 주소는 로그인 밖, 탈퇴는 안 — 그리고 관제 화면 줄은 그대로** (reviews/29 «관제웹 기사 쪽 페이지»).
 *    가입 · 승인 대기 · 앱 받기 · 약관은 주소를 받은 새 계정이 로그인 전에 읽는다. 탈퇴는 로그인한 기사만.
 *    🔴 가입 화면이 서버 문을 직접 부르면 서버가 생길 때 여러 곳을 고쳐야 한다 — 부르는 곳은 `api/join.ts` 하나.
 */
const SRC = join(__dirname, '../../../client-app/src');
const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
const splitAt = app.indexOf('function App()');
const layoutPart = app.slice(0, splitAt);   // AppLayout — 로그인 안
const appPart = app.slice(splitAt);         // App — 로그인 밖 주소 + AuthGuard

const PUBLIC = ['/join', '/join/apps', '/pending', '/terms', '/privacy', '/location-terms'];

describe('📝 가입 쪽 주소', () => {
    it('App.tsx 가 AppLayout 과 App 으로 나뉘어 있다', () => {
        expect(splitAt).toBeGreaterThan(0);
    });

    it('🔴 가입 · 승인 대기 · 앱 받기 · 약관 여섯 주소는 로그인 밖(App)에 있고 안(AppLayout)에는 없다', () => {
        for (const p of PUBLIC) {
            expect(appPart).toContain(`path="${p}"`);
            expect(layoutPart).not.toContain(`path="${p}"`);
        }
    });

    it('🔴 탈퇴 · 멈춤은 로그인 안(AppLayout)에만 있다', () => {
        for (const p of ['/withdraw', '/blocked']) {
            expect(layoutPart).toContain(`path="${p}"`);
            expect(appPart).not.toContain(`path="${p}"`);
        }
    });

    it('🔴 문지기(MemberGate)가 관제 화면 안에 있고, 문이 안 되면 통과한다 — 기사님 운행을 막지 않는다', () => {
        expect(layoutPart).toContain('<MemberGate />');
        expect(layoutPart).toContain('gateDecision(r.me, r.failed)');
        const flow = readFileSync(join(SRC, 'lib/joinFlow.ts'), 'utf8');
        expect(flow).toMatch(/if \(failed \|\| !me\) return 'ok'/);
    });

    it('🔴 다시 동의할 약관은 화면을 옮기지 않는다 — 띠 한 줄만 (운전 중 결재를 못 막게)', () => {
        expect(layoutPart).not.toMatch(/Navigate to="\/join/);
        expect(layoutPart).toContain('to="/join?reconsent=1"');
    });

    it('🔴 관제 · 정산 줄은 그대로다 — 가입 쪽을 더하며 기사 화면을 건드리지 않는다', () => {
        expect(layoutPart).toContain('<Route path="/" element={<Dashboard />} />');
        expect(layoutPart).toContain('<Route path="/settlement" element={<Settlement />} />');
        expect(layoutPart).toContain('<Route path="*" element={<Navigate to="/" replace />} />');
    });

    it('🔴 «이용이 멈췄습니다» 화면은 스스로 다시 읽는다 — 관리자가 정지를 풀면 30초 안(또는 화면이 다시 보일 때) 관제로 나간다', () => {
        const b = readFileSync(join(SRC, 'pages/Blocked.tsx'), 'utf8');
        expect(b).toMatch(/setInterval\(again, 30_000\)/);
        expect(b).toContain("document.addEventListener('visibilitychange', onVisible)");
        expect(b).toContain("if (d === 'ok') navigate('/', { replace: true });");
    });

    it('🔴 가입 쪽 화면은 서버를 직접 부르지 않는다 — api/join.ts 한 곳', () => {
        for (const f of ['Join', 'JoinApps', 'Pending', 'Withdraw', 'Terms', 'JoinSteps', 'Blocked']) {
            const src = readFileSync(join(SRC, 'pages', `${f}.tsx`), 'utf8');
            expect(src).not.toMatch(/apiClient|axios|fetch\(/);
        }
    });
});
