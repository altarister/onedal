import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 📊 **운영센터 통계 화면 — 세 질문 · 서버 통계 문 하나 · 화면이 다시 세지 않는다** (reviews/33 4단계 · 46 서버 a09c6a36 · onedal-69 «가»).
 *    🔴 시뮬레이터 콜을 세는 옛 문(`/stats/flows/admin`)을 운영센터가 읽지 않는다 — 가짜 콜 숫자가 실측처럼 보인다.
 *    🔴 합 · 평균 · 순서는 서버가 센 그대로 — 화면이 다시 세면 두 벌이 되어 갈라진다.
 */
const OPS = join(__dirname, '../../../ops/src');
const read = (f: string) => readFileSync(join(OPS, f), 'utf8');

describe('📊 운영센터 통계 화면', () => {
    const page = read('pages/Stats.tsx');
    const code = page.replace(/\/\*[\s\S]*?\*\//g, '');

    it('🔴 서버 통계 문 하나를 읽는다 — 옛 문(시뮬레이터 콜도 센다)을 읽지 않는다', () => {
        expect(code).toContain('api.stats()');
        expect(read('api/ops.ts')).toContain("get<OpsStats>('/stats')");
        for (const f of ['pages/Stats.tsx', 'api/ops.ts']) expect(read(f)).not.toMatch(/flows\/admin|statsAdmin|FlowsAdmin/);
    });

    it('🔴 세 질문이 칸 제목에 글자 그대로 — 무엇을 판단하는 숫자인지 화면에 있다', () => {
        for (const q of ['벌이가 어떤가', '어느 길이 돈이 되나 — 필터 목적지를 정하는 근거', '놓친 좋은 콜 — 필터가 너무 좁은가']) expect(code).toContain(q);
        expect(code).toContain("const EMPTY = '실제 콜이 생기면 채워집니다'");
    });

    it('🔴 화면이 합 · 평균 · 순서를 다시 세지 않는다 — 서버 값 그대로', () => {
        expect(code).not.toMatch(/\.reduce\(|\.sort\(|Math\.(max|min|round)\(| \/ \w+\.length/);
        expect(code).toContain('const routes = s?.routes ?? [];');
        expect(code).toContain('rows={routes.slice(0, ROUTES_OPEN)}');   // 앞줄만 펴고
        expect(code).toContain('rows={routes.slice(ROUTES_OPEN)}');      // 나머지는 접어서 — 빠지는 줄이 없다
        expect(code).toContain('rows={d?.topFares ?? []}');
    });

    it('🔴 버린 까닭 글자는 shared 한 표 · 잠김은 «버린 것이 아님»으로 따로 · 상대시각 없음', () => {
        expect(code).toContain('VERDICT_AXIS_LABEL[axis]');
        expect(code).toContain('잠겨서 안 본 것 {d.locked} (버린 것이 아님)');
        expect(code).not.toMatch(/분 전|방금|Date\.now\(\) -/);
    });
});
