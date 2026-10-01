import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🧰 **운영센터 현황판(점검) 화면 — 서버 문만 · 읽기만** (reviews/31 1차 · 46 서버 02a9fc78 · onedal-69 «가»).
 *    🔴 관제웹 현황판은 이번에 한 줄도 안 뺀다 — 운영센터에 «여러 회원을 한눈에»가 더해질 뿐.
 *    🔴 화면은 앱 판정(verdict)을 옮겨 적기만 한다 — 필터로 다시 재는 사본을 두면 앱과 갈라진다.
 *    성적표 요약은 shared `summarizeTally` 한 벌(관제웹 현황판과 같은 함수).
 */
const WEB = join(__dirname, '../../..');
const read = (f: string) => readFileSync(join(WEB, f), 'utf8');

describe('🧰 운영센터 현황판 화면', () => {
    it('🔴 서버 문 넷만 읽는다 — 예시 자료 · 쓰기 · 시험 도구 없음', () => {
        // 서버 점검은 «점검» 쪽 · 회원 것(폰 · 필터 · 앱이 올린 콜)은 회원 상세의 «폰 · 필터» 칸
        const inspect = read('ops/src/pages/Inspect.tsx');
        const b = read('ops/src/pages/MemberPhoneFilter.tsx');
        expect(inspect).toContain('api.boardServer()');
        for (const f of ['api.boardPhones(memberId)', 'api.boardFilter(memberId)', 'api.boardIntel(memberId)']) expect(b).toContain(f);
        for (const src of [inspect, b]) expect(src).not.toMatch(/api\/example|ExampleBand|write\(|client\.(post|put)/);
        const ops = read('ops/src/api/ops.ts');
        for (const p of ["'/board/server'", '/board/phones', '/board/filter?memberId=', '/board/intel?memberId=']) expect(ops).toContain(p);
    });
    it('🔴 성적표는 shared summarizeTally · 판정은 옮겨 적기만(다시 재지 않는다)', () => {
        const b = read('ops/src/pages/MemberPhoneFilter.tsx');
        expect(b).toContain('summarizeTally(p.filterTally, p.filterTallyAt)');
        expect(b).toContain("v === 'pass' ? '통과'");
        // 필터 값으로 콜을 다시 재는 줄이 없다 — 값을 «보여 주기»(요금 줄)는 하지만 콜의 요금 · 거리와 견주는 식은 없다
        expect(b).not.toMatch(/\.fare\s*[<>]=?|[<>]=?\s*\w+\.(minFare|maxFare)|(minFare|maxFare)\s*[<>]|radiusKm\s*[<>]/);
    });
    it('🔴 관제웹 현황판은 그대로다 — 운영센터로 간다고 관제웹에서 빼지 않았다(1차)', () => {
        const s = read('client-app/src/statusboard/StatusBoard.tsx');
        for (const t of ['🖥️ 지금 무엇이 도는가', '📡 이 폰이 든 필터', '👁️ 폰이 일하고 있나', '🔍 이 폰의 성적표', '🧾 필터 전문', '🗑️ 버린 콜']) expect(s).toContain(t);
    });
    it('🔴 축 이름표 두 벌(성적표 짧은 이름 AXES · 버린 콜 까닭 VERDICT_AXIS_LABEL)의 축 키 목록이 같다 — 새 축이 한쪽에만 더해지지 않게', () => {
        const src = read('shared/src/filterTally.ts');
        const axes = [...src.slice(src.indexOf('const AXES'), src.indexOf('];', src.indexOf('const AXES'))).matchAll(/\['[^']+', '(\w+)'\]/g)].map(m => m[1]).sort();
        const body = src.slice(src.indexOf('export const VERDICT_AXIS_LABEL'));
        const labels = [...body.slice(0, body.indexOf('};')).matchAll(/^\s{4}(\w+): '/gm)].map(m => m[1]).sort();
        expect(axes.length).toBeGreaterThan(5);
        expect(labels).toEqual(axes);
    });

    it('🔴 운영센터 개발 서버는 신호 소켓(/socket.io)도 서버로 넘긴다 — 없으면 소켓이 Vite 에서 멈춘다', () => {
        const v = read('ops/vite.config.ts');
        expect(v).toMatch(/'\/socket\.io': \{ target: API_TARGET, ws: true \}/);
        expect(v).toContain("'/api': API_TARGET");
    });

    it('🔴 «앱에 내려갈 필터»는 폰이 받는 그대로 — 두 현황판이 서버 조립 결과를 읽는다(activeFilter 에서 골라 찍지 않는다)', () => {
        const b = read('ops/src/pages/MemberPhoneFilter.tsx');
        expect(b).toContain('filter?.app?.find(');
        expect(b).toContain('🧾 기사가 정한 값');
        expect(b).toContain('폰이 오늘 아직 보고 안 함');
        const s = read('client-app/src/statusboard/StatusBoard.tsx');
        expect(s).toContain('`/devices/app-filter?deviceId=');
        expect(s).toContain("node: <AppFilterCard devices={devices} />");
        expect(s).not.toMatch(/APP_FILTER_KEYS\.map\(k => \(\s*<Row key=\{k\} k=\{k\} v=\{\(filter as/);
    });

    it('🔴 useAppFilter 는 현황판 안에서만 — 현황판은 PC 폭에서만 붙어(Dashboard withPanel) 거치대 폰이 이 문을 부르지 않는다', () => {
        const { readdirSync, statSync } = require('fs') as typeof import('fs');
        const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
        const users = walk(join(WEB, 'client-app/src')).filter(f => /\.tsx?$/.test(f) && /useAppFilter|devices\/app-filter/.test(readFileSync(f, 'utf8')));
        expect(users.map(f => f.replace(WEB, ''))).toEqual(['/client-app/src/statusboard/StatusBoard.tsx']);
        const d = read('client-app/src/pages/Dashboard.tsx');
        expect(d).toContain('if (!withPanel) return body;');
    });

    it('예시 쪽은 멤버 대조 하나 — 예시 자료에 현황판 것이 없다', () => {
        expect(read('ops/src/api/example.ts')).not.toMatch(/BOARD|board/);
        expect(read('ops/src/mock/data.ts')).not.toMatch(/BOARD_/);
    });
});
