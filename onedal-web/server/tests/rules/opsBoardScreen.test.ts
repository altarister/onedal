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
        const b = read('ops/src/pages/Board.tsx');
        for (const f of ['api.boardServer()', 'api.boardPhones()', 'api.boardFilter(memberId)', 'api.boardIntel(memberId)']) expect(b).toContain(f);
        expect(b).not.toMatch(/api\/example|ExampleBand|write\(|client\.(post|put)/);
        const ops = read('ops/src/api/ops.ts');
        for (const p of ["'/board/server'", '/board/phones', '/board/filter?memberId=', '/board/intel?memberId=']) expect(ops).toContain(p);
    });
    it('🔴 성적표는 shared summarizeTally · 판정은 옮겨 적기만(다시 재지 않는다)', () => {
        const b = read('ops/src/pages/Board.tsx');
        expect(b).toContain('summarizeTally(p.filterTally, p.filterTallyAt)');
        expect(b).toContain("v === 'pass' ? '통과'");
        expect(b).not.toMatch(/minFare|maxFare|radiusKm\s*[<>]/);   // 필터 값으로 콜을 다시 재는 줄이 없다
    });
    it('🔴 관제웹 현황판은 그대로다 — 운영센터로 간다고 관제웹에서 빼지 않았다(1차)', () => {
        const s = read('client-app/src/statusboard/StatusBoard.tsx');
        for (const t of ['🖥️ 지금 무엇이 도는가', '📡 이 폰이 든 필터', '👁️ 폰이 일하고 있나', '🔍 이 폰의 성적표', '🧾 필터 전문', '🗑️ 버린 콜']) expect(s).toContain(t);
    });
    it('예시 쪽은 멤버 대조 하나 — 예시 자료에 현황판 것이 없다', () => {
        expect(read('ops/src/api/example.ts')).not.toMatch(/BOARD|board/);
        expect(read('ops/src/mock/data.ts')).not.toMatch(/BOARD_/);
    });
});
