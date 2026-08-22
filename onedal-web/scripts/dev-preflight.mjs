#!/usr/bin/env node
/**
 * 🚦 **띄우기 전에 자리를 확인한다** (기사님 확정 2026-08-22 · 버그 대장 #40)
 *
 * 2026-08-22 에 감시자(`tsx watch`)가 **셋** 쌓여 있었다 — 8/18 새벽에 둘, 그날 14:48 에 하나.
 * 그중 하나는 포트를 못 잡아 `lsof :4000` 에 **안 보인 채로** 놀고 있었고, 자리가 비는
 * 순간 자식을 띄워 **나흘 묵은 코드로 서버를 되살렸다.** 기사님 화면에서는 방금 고친 것이
 * 안 돌고 있었고, 그걸 모른 채 네 시간을 판단했다.
 *
 * 🔴 이 레포가 반복해서 오진한 *"고쳤는데 옛 코드가 돌고 있다"* 의 뿌리다
 *    (루트 CLAUDE.md 「무엇이 실제로 돌고 있는가」).
 *
 * 그래서 겹쳐 띄우지 않는다 — **먼저 있는 것을 보여주고 멈춘다.** 무엇을 죽여야 하는지
 * 명령까지 적어 준다 (사람이 PID 를 찾아 헤매게 두지 않는다).
 */
import { execSync } from 'node:child_process';

const sh = (cmd) => { try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return ''; } };

/** 개발에 쓰는 자리 — 하나라도 차 있으면 겹치는 것이다 */
const PORTS = [
    { port: 4000, who: '서버(api)' },
    { port: 3000, who: '관제웹' },
];

const busy = [];
for (const { port, who } of PORTS) {
    /**
     * ⚠️ **듣고 있는 것만 본다** (`-sTCP:LISTEN`). 그냥 `lsof -ti :3000` 은 그 포트에
     *    **접속한 쪽**까지 잡는다 — 관제웹을 열어 둔 크롬이 걸려서, 브라우저 탭 하나
     *    때문에 `pnpm dev` 가 막힌다. 자리를 쥔 것은 **서버**지 손님이 아니다.
     */
    const pids = sh(`lsof -ti :${port} -sTCP:LISTEN`).split('\n').filter(Boolean);
    for (const pid of pids) {
        const info = sh(`ps -o lstart=,command= -p ${pid}`).replace(/\s+/g, ' ').slice(0, 90);
        busy.push({ pid, label: `:${port} ${who}`, info });
    }
}

/**
 * 🔴 **포트를 안 쥔 감시자도 찾는다.** 오늘 사고의 주범이 정확히 이것이었다 —
 *    포트로만 찾으면 안 보이는데, 살아서 파일을 지켜보다가 자식을 띄운다.
 */
const strays = sh(`pgrep -f 'tsx.*watch' || true`).split('\n').filter(Boolean)
    .filter(pid => !busy.some(b => b.pid === pid))
    .map(pid => ({ pid, label: '감시자(tsx watch)', info: sh(`ps -o lstart=,command= -p ${pid}`).replace(/\s+/g, ' ').slice(0, 90) }));

const found = [...busy, ...strays];
if (found.length === 0) process.exit(0);

console.error('\n🚦 이미 떠 있는 것이 있습니다 — 겹쳐 띄우지 않습니다.\n');
for (const f of found) console.error(`   ${f.pid}  ${f.label}\n        ${f.info}`);
console.error(`
   왜 막나: 겹쳐 띄우면 옛 서버가 포트를 쥔 채 남아 **고친 코드가 안 도는데
   도는 것처럼 보입니다.** 2026-08-22 에 이걸로 네 시간을 잘못 판단했습니다.

   정리하려면:  kill ${found.map(f => f.pid).join(' ')}
   그 다음:     pnpm dev
`);
process.exitCode = 1;
