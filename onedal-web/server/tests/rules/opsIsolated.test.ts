import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 🏢 **운영센터(`ops/`)는 기사 앱에 섞이지 않는다** (reviews/29 3단계 검사).
 *    관제웹 · 운행일지가 `ops/` 를 가져다 쓰면 기사 폰이 받는 파일에 관리자 화면이 딸려 들어간다.
 *    반대로 운영센터가 관제웹 부품을 쓰는 것은 **임시로** 허용한다 — `@/components/ui/*` 와 `@/lib/utils` 만 (ops/CLAUDE.md).
 *    운영센터에 폰 전용 의존(Capacitor · 소켓 · 상태 저장소)이 들어오면 관리자 PC 화면이 무거워진다.
 */
const WEB = join(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
    for (const n of readdirSync(dir)) {
        if (n === 'node_modules' || n.startsWith('.')) continue;
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(ts|tsx|css)$/.test(n)) out.push(p);
    }
    return out;
}

describe('🏢 운영센터는 따로 산다', () => {
    it('🔴 관제웹 · 운행일지는 ops/ 를 가져다 쓰지 않는다', () => {
        const offenders: string[] = [];
        for (const app of ['client-app/src', 'logbook/src']) {
            for (const f of walk(join(WEB, app))) {
                const src = readFileSync(f, 'utf8');
                if (/from\s+['"][^'"]*\/ops\//.test(src) || /@import\s+['"][^'"]*\/ops\//.test(src)) offenders.push(f.replace(WEB, ''));
            }
        }
        expect(offenders).toEqual([]);
    });

    it('🔴 운영센터가 관제웹에서 가져다 쓰는 것은 부품(components/ui)과 cn 뿐이다 — 화면 · 저장소 · 소켓은 안 된다', () => {
        const offenders: string[] = [];
        for (const f of walk(join(WEB, 'ops/src'))) {
            const src = readFileSync(f, 'utf8');
            for (const m of src.matchAll(/from\s+['"](@\/[^'"]+|\.\.\/[^'"]*client-app[^'"]*)['"]/g)) {
                const p = m[1];
                if (!/^@\/components\/ui\//.test(p) && p !== '@/lib/utils') offenders.push(`${f.replace(WEB, '')} → ${p}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('🔴 운영센터 package.json 에 폰 전용 의존이 없다', () => {
        const pkg = JSON.parse(readFileSync(join(WEB, 'ops/package.json'), 'utf8'));
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        expect(deps.filter(d => /capacitor|socket\.io|zustand|capgo/.test(d))).toEqual([]);
    });

    it('운영센터 index.css 가 관제웹 부품 폴더를 Tailwind 에 알린다 — 빠지면 부품이 회색으로 그려진다', () => {
        const css = readFileSync(join(WEB, 'ops/src/index.css'), 'utf8');
        expect(css).toMatch(/@source\s+"\.\.\/\.\.\/client-app\/src\/components\/ui"/);
    });
});
