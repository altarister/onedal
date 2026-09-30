import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * 🏢 **운영센터(`ops/`)는 기사 앱에 섞이지 않고, 공통 부품은 `@onedal/ui` 한 곳에서 온다** (reviews/29 3단계 · ui/CLAUDE.md).
 *    관제웹 · 운행일지가 `ops/` 를 가져다 쓰면 기사 폰이 받는 파일에 관리자 화면이 딸려 들어간다.
 *    운영센터가 관제웹 파일을 직접 가져오면 두 앱이 얽힌다 — 부품은 `@onedal/ui`, 계산 · 규격은 `@onedal/shared` 만.
 *    🔴 Tailwind v4 는 작업 공간 링크(`node_modules/@onedal/ui`)를 안 훑는다 — 쓰는 앱의 `index.css` 에 `@source` 가 없으면 부품이 회색으로 그려진다.
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

describe('🏢 운영센터는 따로 살고 부품은 @onedal/ui 한 곳', () => {
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

    it('🔴 운영센터는 관제웹 파일을 직접 가져오지 않는다 — @/ 별칭도 ../client-app 도 없다', () => {
        const offenders: string[] = [];
        for (const f of walk(join(WEB, 'ops/src'))) {
            const src = readFileSync(f, 'utf8');
            for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
                if (/^@\//.test(m[1]) || /client-app/.test(m[1])) offenders.push(`${f.replace(WEB, '')} → ${m[1]}`);
            }
        }
        expect(offenders).toEqual([]);
        const vite = readFileSync(join(WEB, 'ops/vite.config.ts'), 'utf8');
        expect(vite).not.toMatch(/client-app/);
    });

    it('🔴 @onedal/ui 안의 부품은 서로와 utils 만 부른다 — 관제웹 · 서버 · 폰을 모른다', () => {
        const offenders: string[] = [];
        for (const f of walk(join(WEB, 'ui/src'))) {
            const src = readFileSync(f, 'utf8');
            for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
                const p = m[1];
                if (p.startsWith('.')) continue;
                if (!/^(react|react-dom|radix-ui|@radix-ui\/|class-variance-authority|clsx|tailwind-merge|lucide-react)/.test(p)) offenders.push(`${f.replace(WEB, '')} → ${p}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('🔴 @onedal/ui 를 쓰는 앱의 index.css 는 @source "../../ui/src" 를 든다', () => {
        for (const app of ['client-app', 'ops']) {
            const css = readFileSync(join(WEB, app, 'src/index.css'), 'utf8');
            expect(css).toMatch(/@source\s+"\.\.\/\.\.\/ui\/src"/);
        }
    });

    it('🔴 운영센터 package.json 에 폰 전용 의존이 없다', () => {
        const pkg = JSON.parse(readFileSync(join(WEB, 'ops/package.json'), 'utf8'));
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        expect(deps.filter(d => /capacitor|socket\.io|zustand|capgo/.test(d))).toEqual([]);
    });
});
