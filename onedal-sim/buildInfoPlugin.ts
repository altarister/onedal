/**
 * 🧾 **지금 화면이 어느 코드인가** — `virtual:build-info` 로 커밋 번호를 싣는다 (기사님 2026-09-14)
 *
 * 기사님은 폰의 시뮬레이터 **앱으로만** 들어오신다 — 주소를 칠 수 없어서, 방금 고친 코드가 떴는지 앱 안에서 알 길이 없었다.
 * 원달앱의 `📦 v…` 처럼 설정 화면 헤더에 커밋 번호를 띄워, 보고받은 커밋 번호와 눈으로 맞춰 본다.
 *
 *   개발 서버(`pnpm dev`) → **페이지를 열 때마다** 다시 센다 (서버를 켠 뒤 커밋해도 새로 열면 새 번호)
 *   빌드(`pnpm build`)    → 빌드한 때의 번호 (rehearsal 이 옛 빌드면 옛 번호가 보인다)
 *   검사(vitest)          → 고정값 `test` — 커밋마다 설정 화면 스냅숏이 흔들리지 않게
 *
 * `dirty` 는 onedal-sim 에 커밋 안 된 고침이 있다는 뜻이다 (화면에 `+`).
 * ⚠️ 커밋할 때 페이지를 **다시 불러오지는 않는다** — 폰에서 시험 중인 판을 끊지 않으려고. 새로 열 때 바뀐다.
 */
import { execFileSync } from 'node:child_process';
import type { Plugin } from 'vite';

const ID = 'virtual:build-info';
const RESOLVED_ID = '\0' + ID;

export function buildInfoPlugin(): Plugin {
    let root = process.cwd();
    let mode: 'dev' | 'build' | 'test' = 'build';

    const git = (args: string[]) => {
        try {
            return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        } catch {
            return null;
        }
    };

    return {
        name: 'onedal-sim-build-info',
        configResolved(config) {
            root = config.root;
            mode = process.env.VITEST ? 'test' : config.command === 'serve' ? 'dev' : 'build';
        },
        resolveId(id) {
            return id === ID ? RESOLVED_ID : null;
        },
        load(id) {
            if (id !== RESOLVED_ID) return null;
            const info = mode === 'test'
                ? { commit: 'test', dirty: false, mode }
                : { commit: git(['rev-parse', '--short', 'HEAD']) ?? 'unknown', dirty: !!git(['status', '--porcelain', '--', '.']), mode };
            return `export default ${JSON.stringify(info)};`;
        },
        configureServer(server) {
            // 페이지(html)를 새로 열 때마다 커밋 번호를 다시 세게 한다 — 서버를 켠 때의 번호에 머물지 않는다
            server.middlewares.use((req, _res, next) => {
                if (req.headers.accept?.includes('text/html')) {
                    const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
                    if (mod) server.moduleGraph.invalidateModule(mod);
                }
                next();
            });
        },
    };
}
