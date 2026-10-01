import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * 🎨 **테마 값(색 · 글꼴 · 둥글기)은 `shared/src/theme.css` 한 곳에 산다.**
 *    앱마다 `@theme` · `:root` · `.dark` 를 따로 들면 한쪽만 고쳐져 관제웹과 운영센터의 색이 갈라진다.
 *    앱 `index.css` 는 Tailwind 지시문과 그 앱만의 유틸만 두고, 값은 `@import` 로 받는다.
 *    🔴 이 목록에 든 앱만 문다 — 아직 옮기지 않은 앱은 여기 없다. 옮기면 한 줄 더한다.
 */
const WEB = join(__dirname, '../../..');
const THEME_CSS = join(WEB, 'shared/src/theme.css');
const APPS_USING_SHARED_THEME = ['client-app', 'logbook', 'ops'];

const defineTokenRe = /^\s*--theme-[\w-]+\s*:/m;

describe('🎨 테마 값은 shared/src/theme.css 한 곳', () => {
    it('shared/src/theme.css 가 있고 @theme · :root · .dark 세 블록을 든다', () => {
        expect(existsSync(THEME_CSS)).toBe(true);
        const css = readFileSync(THEME_CSS, 'utf8');
        expect(css).toMatch(/@theme\s*\{/);
        expect(css).toMatch(/^:root\s*\{/m);
        expect(css).toMatch(/^\.dark\s*\{/m);
        expect(css).toMatch(defineTokenRe);
    });

    for (const app of APPS_USING_SHARED_THEME) {
        const file = join(WEB, app, 'src/index.css');
        it(`🔴 ${app}/src/index.css 는 값을 정의하지 않고 theme.css 를 가져다 쓴다`, () => {
            const css = readFileSync(file, 'utf8');
            expect(css).toMatch(/@import\s+"@onedal\/shared\/src\/theme\.css"/);
            expect(css).not.toMatch(/@theme\s*\{/);
            expect(css).not.toMatch(defineTokenRe);
            expect(css).not.toMatch(/^:root\s*\{/m);
            expect(css).not.toMatch(/^\.dark\s*\{/m);
        });
    }

    it('🔴 theme.css 는 Tailwind 지시문을 들지 않는다 — 지시문은 앱 파일 몫이다', () => {
        const css = readFileSync(THEME_CSS, 'utf8');
        expect(css).not.toMatch(/@import\s+"tailwindcss"/);
        expect(css).not.toMatch(/@plugin/);
        expect(css).not.toMatch(/@custom-variant/);
    });
});
