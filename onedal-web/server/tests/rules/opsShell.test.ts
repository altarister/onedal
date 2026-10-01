import { readFileSync } from 'fs';
import { join } from 'path';
import { menuBadgeOf, tabTitleOf } from '../../../ops/src/api/menuBadge';

/**
 * 🧭 **운영센터 틀 — 폰은 ☰ 사이드바 · 메뉴는 한 벌 · 쪽은 열 때 따로 받는다** (기사님 «모바일용으로 햄버거 매뉴를 넣어 사이드바» · onedal-69 «가»).
 *    🔴 메뉴 목록이 PC · 폰 두 벌이면 한쪽에만 쪽이 더해진다 — `NavList` 하나를 둘이 그린다.
 *    🔴 ☰ 숫자는 «전화할 콜»이 먼저다(KEEP 직후 바로 통화) — 합으로 뭉치면 무엇이 급한지 안 보인다.
 */
const SRC = join(__dirname, '../../../ops/src');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

describe('🧭 운영센터 틀', () => {
    it('🔴 ☰ 숫자 — 전화할 콜이 있으면 그 수를 급함으로 · 없을 때만 나머지 합 · 다 0 이면 없음', () => {
        expect(menuBadgeOf({ callsTodo: 2, pendingMembers: 5, phonesOffline: 3 })).toEqual({ n: 2, urgent: true });
        expect(menuBadgeOf({ callsTodo: 0, pendingMembers: 1, phonesOffline: 2 })).toEqual({ n: 3, urgent: false });
        expect(menuBadgeOf({ callsTodo: 0, pendingMembers: 0, phonesOffline: 0 })).toBeNull();
    });

    it('🔴 메뉴는 NavList 한 벌 — PC 사이드바와 폰 사이드바가 같이 그린다 · 폰 아래 탭과 «더 보기»는 없다', () => {
        const ui = read('ui.tsx');
        expect((ui.match(/<NavList /g) ?? []).length).toBe(2);
        expect((ui.match(/NAV\.map\(/g) ?? []).length).toBe(1);
        expect(ui).not.toMatch(/PHONE_TABS|grid-cols-5|더 보기/);
        expect(ui).toContain('aria-label="메뉴 열기"');
        expect(ui).toMatch(/e\.key === 'Escape'\) setMenuOpen\(false\)/);
        expect(ui).toContain('useEffect(() => { setMenuOpen(false); }, [location.pathname]);');
    });

    it('🔴 쪽은 열 때 따로 받는다(lazy) — 로그인만 처음부터 · Routes 는 Suspense 안', () => {
        const app = read('App.tsx');
        expect(app).toContain("import Login from './pages/Login';");
        expect((app.match(/^import \w+ from '\.\/pages\//gm) ?? []).length).toBe(1);
        expect((app.match(/= lazy\(\(\) => import\('\.\/pages\//g) ?? []).length).toBe(9);   // 메뉴 여덟 + 회원 상세
        expect(app).toMatch(/<Suspense fallback=\{[^}]*읽는 중…[^}]*\}>\s*<Routes>/);
        expect(readFileSync(join(SRC, '../vite.config.ts'), 'utf8')).not.toContain('chunkSizeWarningLimit');   // 경고 한도를 올려 가리지 않는다
    });

    it('🔴 메뉴는 여덟 — 관리자의 궁금증 순서(reviews/33) · 줄마다 궁금증(ask)과 할 수 있는 것(can)이 비지 않는다', () => {
        const ui = read('ui.tsx');
        const nav = ui.slice(ui.indexOf('export const NAV'), ui.indexOf('];', ui.indexOf('export const NAV')));
        const rows = [...nav.matchAll(/\{ to: '([^']+)', label: '([^']+)',[^\n]*ask: '([^']+)', can: '([^']+)'/g)];
        expect(rows.map(r => r[1])).toEqual(['/', '/calls', '/members', '/map', '/inspect', '/manage', '/stats', '/audit']);
        expect(rows.map(r => r[2])).toEqual(['홈', '통화 도우미', '회원', '지도', '점검', '운영', '통계', '기록']);
        for (const r of rows) { expect(r[3].length).toBeGreaterThan(3); expect(r[4].length).toBeGreaterThan(1); }
        expect(ui).toMatch(/export function PageHeader[\s\S]{0,900}<PagePurposeBar ask=\{p\.ask\} can=\{p\.can\} \/>/);   // 모든 쪽 머리가 목적 한 줄을 그린다
    });

    it('🔴 옛 주소 일곱은 새 자리로 넘긴다(replace) — 즐겨찾기 · 기록의 링크가 죽지 않게', () => {
        const app = read('App.tsx');
        const moved: Array<[string, string]> = [
            ['/members/check', '/members?tab=check'], ['/phones', '/inspect'], ['/anomalies', '/inspect'],
            ['/notices', '/manage?tab=notices'], ['/contents', '/manage?tab=contents'], ['/releases', '/manage?tab=releases'],
        ];
        for (const [from, to] of moved) expect(app).toContain(`<Route path="${from}" element={<Navigate to="${to}" replace />} />`);
        // 옛 현황판은 회원을 붙여 온 링크면 그 회원의 «폰 · 필터» 칸으로, 아니면 점검으로
        expect(app).toContain('<Route path="/board" element={<OldBoard />} />');
        expect(app).toContain("<Navigate to={memberId ? `/members/${memberId}?tab=phone` : '/inspect'} replace />");
        expect(app).toContain('<Route path="/" element={<Home />} />');
    });

    it('🔴 탭 제목 — 전화할 콜이 있으면 숫자가 앞에 · 없으면 평소 제목(알림음 없음)', () => {
        expect(tabTitleOf({ callsTodo: 2, pendingMembers: 0, phonesOffline: 0 })).toBe('(2) 📞 전화할 콜 — 운영센터');
        expect(tabTitleOf({ callsTodo: 0, pendingMembers: 3, phonesOffline: 1 })).toBe('1DAL 운영센터');
        expect(read('ui.tsx')).toContain('document.title = tabTitleOf(c);');
        for (const f of ['ui.tsx', 'pages/Home.tsx', 'pages/Calls.tsx']) expect(read(f)).not.toMatch(/new Audio|\.play\(\)/);
    });

    it('🔴 공용(shared) 코드는 안 쓰는 것을 털어낸다 — 단 .css 는 뺀다(가져오기 자체가 일 · 안 빼면 색 · 글꼴이 조용히 빠진다)', () => {
        const v = readFileSync(join(SRC, '../vite.config.ts'), 'utf8');
        expect(v).toContain("moduleSideEffects: (id: string) => id.endsWith('.css') || !id.includes('/shared/src/')");
    });
});
