import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * 🚀 **배포 스크립트(`scripts/deploy.sh`)를 실제로 돌린다** — 임시 git 저장소 · PATH 앞의 가짜 pnpm · pm2 · curl.
 *    글자를 세지 않고 «실패하면 무엇이 남나»를 본다: 관제웹 빌드가 도중에 죽어도 화면 폴더 · 코드가 옛 판 그대로,
 *    새 서버가 답하지 않으면 옛 판으로 되돌려 다시 띄움, 멀쩡하면 새 판으로 바뀜.
 *    가짜 빌드는 `BREAK` 파일이 있으면 출력 폴더를 만든 뒤 죽고(메모리 부족과 같은 꼴), 가짜 health 는 `server/NOHEALTH` 가 있으면 답하지 않는다.
 */
const SCRIPT = join(__dirname, '../../../scripts/deploy.sh');
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
const put = (p: string, s: string) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, s); };
const tool = (dir: string, name: string, body: string) => { const p = join(dir, name); writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`); chmodSync(p, 0o755); };

function stage() {
    const root = mkdtempSync(join(tmpdir(), 'deploy-'));
    const origin = join(root, 'origin.git'), work = join(root, 'work'), bin = join(root, 'bin'), log = join(root, 'tools.log');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(root, 'clone', '-q', origin, work);
    git(work, 'config', 'user.email', 't@t'); git(work, 'config', 'user.name', 't');
    const web = join(work, 'onedal-web');
    for (const f of ['client-app/src.txt', 'ops/src.txt', 'server/src.txt', 'ecosystem.config.cjs']) put(join(web, f), 'a');
    git(work, 'add', '-A'); git(work, 'commit', '-qm', 'A'); git(work, 'push', '-q', 'origin', 'HEAD:main');
    const A = git(work, 'rev-parse', 'HEAD');
    put(join(web, 'client-app/dist/index.html'), 'OLD');   // 지금 실서버가 내주는 화면(빌드 결과라 git 밖)
    mkdirSync(bin);
    tool(bin, 'pnpm', `echo "pnpm $*" >> "${log}"
if [ "$1" = exec ] && [ "$2" = vite ]; then
  out=dist; prev=""; for a in "$@"; do [ "$prev" = --outDir ] && out=$a; prev=$a; done
  rm -rf "$out"; mkdir -p "$out"
  [ -f BREAK ] && exit 137
  git rev-parse --short HEAD > "$out/index.html"; exit 0
fi
[ "$1" = build ] && exit 1
exit 0`);
    tool(bin, 'pm2', `echo "pm2 $1 @$(git -C "${web}" rev-parse --short HEAD)" >> "${log}"; exit 0`);
    tool(bin, 'curl', `[ -f "${web}/server/NOHEALTH" ] && exit 7; echo '{"ok":true}'; exit 0`);
    tool(bin, 'sudo', 'exit 0'); tool(bin, 'free', 'exit 0'); tool(bin, 'swapon', 'echo on');
    /** origin 에 새 판 하나를 올린다 */
    const pushNew = (extra: string[]) => {
        const tmp = join(root, 'dev'); git(root, 'clone', '-q', origin, tmp);
        git(tmp, 'config', 'user.email', 't@t'); git(tmp, 'config', 'user.name', 't');
        put(join(tmp, 'onedal-web/client-app/src.txt'), 'b');
        for (const f of extra) put(join(tmp, 'onedal-web', f), 'x');
        git(tmp, 'add', '-A'); git(tmp, 'commit', '-qm', 'B'); git(tmp, 'push', '-q', 'origin', 'HEAD:main');
        return git(tmp, 'rev-parse', 'HEAD');
    };
    /** deploy.yml 처럼 스크립트를 임시 파일로 꺼내 돌린다(돌던 스크립트를 git 이 덮어쓰지 않게) */
    const run = (script = SCRIPT) => {
        const copy = join(root, 'deploy-run.sh'); copyFileSync(script, copy);
        const r = spawnSync('bash', [copy], { cwd: web, encoding: 'utf8',
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: root, DEPLOY_DIR: web, DEPLOY_HEALTH_TRIES: '2', DEPLOY_HEALTH_WAIT: '0' } });
        return { code: r.status, out: r.stdout + r.stderr, tools: existsSync(log) ? readFileSync(log, 'utf8') : '' };
    };
    const head = () => git(web, 'rev-parse', 'HEAD');
    const shown = () => readFileSync(join(web, 'client-app/dist/index.html'), 'utf8').trim();
    return { A, pushNew, run, head, shown };
}

describe('배포 스크립트 — 실패하면 옛 판이 남는다', () => {
    it('관제웹 빌드가 도중에 죽으면 코드 · 화면 폴더 모두 옛 판 · 서버는 안 건드림 · 배포 실패', () => {
        const s = stage();
        s.pushNew(['client-app/BREAK']);
        const r = s.run();
        expect(r.code).not.toBe(0);
        expect(s.head()).toBe(s.A);
        expect(s.shown()).toBe('OLD');
        expect(r.tools).not.toMatch(/pm2 (reload|start)/);
    });

    it('새 서버가 답하지 않으면 옛 판으로 되돌려 다시 띄우고 화면 폴더도 옛 것 · 배포 실패', () => {
        const s = stage();
        s.pushNew(['server/NOHEALTH']);
        const r = s.run();
        expect(r.code).not.toBe(0);
        expect(s.head()).toBe(s.A);
        expect(s.shown()).toBe('OLD');
        expect(r.tools).toMatch(new RegExp(`pm2 (reload|start) @${s.A.slice(0, 7)}`));
        expect(r.out).toMatch(/되돌림 성공/);
    });

    it('멀쩡한 판이면 새 판 · 새 화면 · 성공', () => {
        const s = stage();
        const B = s.pushNew([]);
        const r = s.run();
        expect(r.code).toBe(0);
        expect(s.head()).toBe(B);
        expect(s.shown()).toBe(B.slice(0, 7));
    });
});
