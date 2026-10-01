import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * 🏢 **운영센터 자료 — 서버 문이 있는 쪽은 서버만, 없는 쪽은 예시라고 적는다** (reviews/29 3단계 · onedal-1f «가»).
 *    🔴 서버 쪽이 예시 자료로 대신 그리면 장애가 가려진다 — 서버 쪽은 `api/example.ts` 를 가져오지 않는다.
 *    🔴 예시 쪽은 머리에 `ExampleBand` — 관리자가 «여기서 누른 것은 기록에 안 남는다»를 안다.
 *    시각 글자는 shared 함수(`hhmmText` · `isoKst` · `businessDayKey`)를 거친다 — 화면이 `new Date(글자)` 로 직접 읽지 않는다(Safari 가 지역 글자를 못 읽는다).
 */
const SRC = join(__dirname, '../../../ops/src');
const read = (f: string) => readFileSync(join(SRC, f), 'utf8');
const EXAMPLE_PAGES = ['Releases', 'MembersCheck', 'Board'];
const SERVER_PAGES = readdirSync(join(SRC, 'pages')).map(f => f.replace(/\.tsx$/, '')).filter(p => !EXAMPLE_PAGES.includes(p) && p !== 'Login');

describe('🏢 운영센터 자료', () => {
    it('🔴 서버 문이 있는 쪽은 예시 자료를 가져오지 않고 useOps 로 읽는다 · 서버가 안 되면 ErrorBand', () => {
        for (const p of SERVER_PAGES) {
            const src = read(`pages/${p}.tsx`);
            expect(src).not.toMatch(/api\/example|mock\/data/);
            expect(src).toContain('useOps(');
            expect(src).toContain('<ErrorBand text={error} onRetry={reload} />');
        }
    });

    it('🔴 예시 쪽은 머리에 ExampleBand 를 적고 서버 문을 부르지 않는다', () => {
        for (const p of EXAMPLE_PAGES) {
            const src = read(`pages/${p}.tsx`);
            expect(src).toMatch(/<ExampleBand stage=\{EXAMPLE_STAGE\.\w+\} \/>/);
            expect(src).not.toMatch(/from '\.\.\/api\/ops'/);
        }
    });

    it('🔴 서버를 부르는 곳은 api/client.ts · api/ops.ts 둘뿐 — 쪽 · 틀은 axios 를 모른다', () => {
        for (const f of [...readdirSync(join(SRC, 'pages')).map(p => `pages/${p}`), 'ui.tsx', 'App.tsx']) {
            expect(read(f)).not.toMatch(/axios|fetch\(/);
        }
    });

    it('🔴 시각 글자는 shared 함수를 거친다 — ui.tsx 가 new Date(글자) 로 직접 읽지 않는다', () => {
        const ui = read('ui.tsx');
        expect(ui).toMatch(/hhmmText\(/);
        expect(ui).toMatch(/kstDateText\(/);
        expect(ui).not.toMatch(/new Date\(iso\)/);
    });
});
