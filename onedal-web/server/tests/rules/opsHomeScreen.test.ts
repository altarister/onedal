import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🏠 **운영센터 홈 화면 — 서버 홈 문 하나 · 지어낸 숫자 없음 · 상대시각 없음** (reviews/33 2단계 · 46 서버 9ca7a4ab · onedal-69 «가»).
 *    숫자는 서버가 각 쪽의 문과 같은 함수로 센다(홈 숫자 = 쪽 숫자 — 서버 검사 opsHome 이 문다). 화면은 그 값을 그리기만 한다.
 *    🔴 «4분 전» 같은 상대시각을 쓰지 않는다(shared format.ts) — 가장 오래된 KEEP 은 시각으로.
 *    🔴 배차망 줄의 level 은 점 색과 한 줄 글에만 쓴다 — 그 이름으로 다른 칸을 가르지 않는다.
 */
const SRC = join(__dirname, '../../../ops/src');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');

describe('🏠 운영센터 홈 화면', () => {
    const home = read('pages/Home.tsx');
    const code = home.replace(/\/\*[\s\S]*?\*\//g, '');

    it('🔴 서버 홈 문 하나를 읽는다 — /counts 를 따로 읽어 두 벌로 세지 않는다 · 예시 자료 없음', () => {
        expect(code).toContain('api.home()');
        expect(code).not.toMatch(/api\.counts\(\)|api\/example|ExampleBand/);
        expect(read('api/ops.ts')).toContain("get<OpsHome>('/home')");
    });

    it('🔴 «지금 할 일» 일곱 칸이 서버 값 그대로 — 화면에서 더하거나 지어내지 않는다 · 기사 이상 신호와 배차망 비상은 따로 센다', () => {
        for (const k of ['t?.emergencies', 't?.networkAlarms', 't?.callsTodo', 't?.pendingMembers', 't?.expiringSoon', 't?.phonesOffline', 't?.needUpdate']) expect(code).toContain(`n: ${k}`);
        expect(code).not.toMatch(/Math\.random|\bn: \d+,/);
    });

    it('🔴 «접속 상태»의 오류 줄은 서버 값 그대로 — «부팅 뒤 · 오늘»을 같이 적는다 · 0 이면 «없음» · «지금 할 일»에는 올리지 않는다', () => {
        expect(code).toContain('<KV k="오류 (부팅 뒤 · 오늘)"');
        expect(code).toContain("h.access.errorsToday.count === 0 ? '없음'");
        expect(code).toContain('{h.access.errorsToday.count}줄 · {h.access.errorsToday.kinds}가지');
        expect(code).not.toMatch(/n: t\?\.errors|n: h\?\.access\.errorsToday/);
    });
    it('🔴 상대시각을 쓰지 않는다 — 가장 오래된 KEEP 은 시각으로', () => {
        expect(code).toContain('fmtTime(t.oldestKeepAt)');
        expect(code).not.toMatch(/분 전|방금|Date\.now\(\) -/);
    });

    it('🔴 배차망 level 은 점 색 · 한 줄 글 표(LEVEL_DOT)에만 — 그 이름으로 가르는 조건문이 없다', () => {
        expect(code).toContain('LEVEL_DOT[nw.level]');
        expect(code).not.toMatch(/level === '|level !== '/);
    });

    it('지역 분포는 서버가 빈 배열을 주면 자리만 — 지어낸 지역을 넣지 않는다', () => {
        expect(code).toContain('h.regions.length === 0');
        expect(code).toContain('위치 문이 생기면 채워집니다');
    });

    it('🔴 회원 상세 «🎛️ 필터설정값»은 한글 이름표 줄(shared filterValueRowsOf) — 원문 JSON 은 «🧾 필터 전문» 카드 안에 접혀 있다', () => {
        const mpf = read('pages/MemberPhoneFilter.tsx');
        expect(mpf).toContain('filterValueRowsOf(shownFilter');
        expect(mpf).toMatch(/<Card title="🧾 필터 전문">\s*<details[^>]*>\s*<summary/);
        const panel = readFileSync(join(SRC, '../../client-app/src/statusboard/StatusBoard.tsx'), 'utf8');
        expect(panel).not.toContain('filterValueRowsOf(');   // «필터설정값» 은 운영센터 한 벌 — 관제웹 현황판에 두 벌을 두지 않는다
    });
});
