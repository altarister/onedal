#!/usr/bin/env node
/**
 * 소켓 계약 대조 — 서버가 보내는 이벤트를 관제웹이 듣고 있는가, 그 반대는?
 *
 * 기사님: *"유기적으로 작동되어야 하는데 뭔가 하나 바뀌면 관련된 거 모두 바꾸고
 * 빠뜨리고 이런 건 문제가 있는 것 같아."*
 *
 * 손으로 대조하면 또 빠뜨린다. 실제로 이 검사로 두 개를 찾았다 (2026-08-10).
 *   · `handler-error`   — 서버가 오류를 보내는데 **아무도 듣지 않아** 저장 실패가 조용했다
 *   · `settings-updated` — 관제웹이 듣고 있는데 **아무도 보내지 않아** 차종 변경이 반영 안 됐다
 *
 * 실행: `node scripts/audit-socket-contract.mjs`
 * 새 이벤트를 추가하면 양쪽을 다 손댔는지 이 스크립트가 알려준다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

/** socket.io 내장 이벤트 — 서버가 명시적으로 보내지 않는다 */
const BUILTIN = new Set(['connect', 'disconnect', 'connect_error', 'reconnect', 'error']);

/**
 * 아직 구현 전이라 알고도 비워둔 것 (근거를 함께 적는다).
 *
 * 🔴 **지금은 비어 있다.** 여기 이름을 올리면 그 이벤트는 🔴 대신 🟡 로 나오므로,
 *    **진짜 파손이 생겨도 이 검사가 숨긴다.** 올릴 때는 «왜 아직 없는가»를 함께 적고,
 *    구현되면 **반드시 내린다.**
 *
 * ⚠️ 2026-08-29 까지 `auto-arrived` 가 *"Phase 4 미구현"* 으로 올라 있었는데
 *    **이미 구현돼 있었다** — 서버가 쏘고(`socketHandlers`) 관제웹 두 곳이 듣는다.
 *    메워진 구멍을 «알고 비워 둔 구멍»으로 적어 두면, 이 검사가 막으려던 사고를
 *    이 검사가 만든다.
 */
const KNOWN_GAPS = {};

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
    return out;
}

/**
 * 루프로 등록한 핸들러도 잡는다.
 *   const ACK_EVENTS = ['a', 'b'] as const;
 *   ACK_EVENTS.map(ev => socket.on(ev, h))
 * 이런 코드는 리터럴 정규식으로 안 잡혀 **없는 문제를 있다고 보고**한다.
 */
function collectFromArrays(text, varNamesUsedDynamically) {
    const found = [];
    for (const name of varNamesUsedDynamically) {
        const m = text.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([^\\]]*)\\]`));
        if (m) for (const lit of m[1].matchAll(/['"]([\w-]+)['"]/g)) found.push(lit[1]);
    }
    return found;
}

function scan(dir, patterns) {
    const map = new Map();
    for (const file of walk(dir)) {
        const text = readFileSync(file, 'utf8');
        const rel = relative(ROOT, file);
        for (const [kind, re] of patterns) {
            for (const m of text.matchAll(re)) {
                if (!map.has(kind)) map.set(kind, new Map());
                const k = map.get(kind);
                if (!k.has(m[1])) k.set(m[1], []);
                k.get(m[1]).push(rel);
            }
        }
        // 동적 등록: socket.on(ev, ...) 에서 ev 가 식별자인 경우 그 배열을 찾아본다
        const dyn = [...text.matchAll(/socket\.on\((\w+),/g)].map(m => m[1]);
        if (dyn.length) {
            const names = [...text.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[/g)].map(m => m[1]);
            for (const ev of collectFromArrays(text, names)) {
                if (!map.has('on')) map.set('on', new Map());
                if (!map.get('on').has(ev)) map.get('on').set(ev, []);
                map.get('on').get(ev).push(`${rel} (동적 등록)`);
            }
        }
    }
    return map;
}

// `io.to(...)`, `io?.to(...)`, `socket.emit(...)`, `io.emit(...)` 를 모두 잡는다
const server = scan(join(ROOT, 'server/src'), [
    ['emit', /io\??\.to\([^)]*\)\.emit\(["']([\w-]+)["']/g],
    ['emit', /socket\.emit\(["']([\w-]+)["']/g],
    ['emit', /io\??\.emit\(["']([\w-]+)["']/g],
    ['on', /(?:socket\.on|safeOn\(socket,\s*)\(?["']([\w-]+)["']/g],
]);
const client = scan(join(ROOT, 'client-app/src'), [
    ['emit', /socket\.emit\(["']([\w-]+)["']/g],
    ['on', /socket\.on\(["']([\w-]+)["']/g],
]);

const get = (m, k) => new Set((m.get(k) || new Map()).keys());
const srvEmit = get(server, 'emit'), srvOn = get(server, 'on');
const cliEmit = get(client, 'emit'), cliOn = get(client, 'on');

const problems = [];
const report = (title, items, where) => {
    const real = [...items].filter(e => !BUILTIN.has(e));
    console.log(`\n${title}`);
    if (real.length === 0) { console.log('  없음 ✅'); return; }
    for (const e of real) {
        const known = KNOWN_GAPS[e];
        const src = (where.get(e) || []).slice(0, 2).join(', ');
        if (known) console.log(`  🟡 ${e.padEnd(26)} ${known}`);
        else { console.log(`  🔴 ${e.padEnd(26)} ${src}`); problems.push(e); }
    }
};

report('═ 서버가 보내는데 관제웹이 안 듣는 이벤트 ═', new Set([...srvEmit].filter(e => !cliOn.has(e))), server.get('emit'));
report('═ 관제웹이 보내는데 서버가 안 받는 이벤트 ═', new Set([...cliEmit].filter(e => !srvOn.has(e))), client.get('emit'));
report('═ 관제웹이 듣는데 서버가 안 보내는 이벤트 ═', new Set([...cliOn].filter(e => !srvEmit.has(e))), client.get('on'));

/**
 * 🔴 **네 번째 방향 — 2026-08-14 에 뚫려 있던 사각지대.**
 *
 * 세 방향만 보다가 `update-my-location` · `dispatch-complete` 를 놓쳤다.
 * 둘 다 **아무도 쏜 적이 없는데(git 전체 이력) 열려 있던 문**이었고,
 * 각각 `session.driverLocation` 을 직접 덮어쓰고 콜을 완료 처리했다 —
 * `processDriverMovement`(지나온 구간 제거·도착 감지)와 마일스톤 시퀀스를 **통째로 우회**한다.
 *
 * 규칙 ② "안전장치는 겹쳐 둔다, 빼지 않는다" 의 반대다. **문이 둘이면 우회로가 생긴다.**
 *
 * ⚠️ 앱(`onedal-app`)은 소켓을 쓰지 않는다 — REST 피기백이 의도된 설계다.
 *    그러니 서버가 받는 이벤트는 **관제웹이 쏘는 것뿐**이어야 한다.
 */
report('═ 서버가 받는데 **아무도 안 보내는** 이벤트 (죽은 문) ═',
    new Set([...srvOn].filter(e => !cliEmit.has(e))), server.get('on'));

/**
 * 🍝 **다섯 번째 방향 — «한 사건을 여러 곳이 판단하는가»** (기사님 지시 2026-09-12).
 *
 * 기사님: *"gps 관리하는 거 하나 만들고 경로 관리하는 거 만들고 … **지금 그걸 각자
 * 하고 있어서 문제** 같은데"* · *"우리 프로젝트는 경우의 수가 많아서 이런 관리를 잘해야 해.
 * 아니면 **코드가 스파게티처럼 엉킬 수 있어**"*
 *
 * 🔴 **실제로 그 모양으로 사고가 났다** — `auto-arrived` 를 세 곳이 각자 듣고 각자
 *    판단해서 «덱이 가리킨 콜»과 «시트가 연 콜»이 갈라졌다. 기사님이 화면에서 잡으셨다
 *    (*"1, 3, 5는 시트가 올라갔어 근데 그 스텝이 열리지는 않았어"*).
 *
 * 🟢 **여럿이 듣는 것 자체는 죄가 아니다** — 역할이 다르면 오히려 옳다:
 *      · `useOrderEngine`(데이터) + `useSystemAlerts`(알림)  — 의도된 분리
 *      · 스토어(판단) + `Dashboard`(알림 한 줄)              — 판단은 하나
 *      · 카드(제 콜 하나) + 훅(전체 파생)                     — 보는 범위가 다르다
 *    **갈라지는 것은 «같은 질문에 둘이 답할 때»뿐이다.**
 *
 * ⚠️ 기계가 «판단인가 알림인가»를 스스로 가릴 수는 없다. 그래서 **지금 상태를 기준선으로
 *    적어 두고, 거기서 늘어나면 알린다** — `audit:dead` 의 `KEEP` 목록과 같은 방식이다.
 *    새로 겹치면 사람이 «역할이 다른가»를 보고 판단해 이 목록에 넣거나 합친다.
 *
 * 🔴 **«곳 수»까지 적는다.** 이름만 적어 두면 **네 번째가 붙어도 조용히 통과한다** —
 *    처음 만들 때 그렇게 짰다가 변이(세 번째가 도착을 또 듣게)로 그 자리에서 드러났다.
 *    허용한 수보다 늘면 빨간불이다.
 */
const ALLOWED_MULTI = new Map([
    ['order-canceled',        [2, '엔진(이력 다시 읽기) + 알림(배너 지우기) — 역할이 다르다']],
    ['order-confirmed',       [3, '엔진(이력) + 알림(배너) + 시트(KEEP 마중) — ⏭️ 시트 몫은 스토어로 모으는 중']],
    ['safecancel-warning',    [2, '엔진(카운트) + 알림(경고 배너)']],
    ['order-evaluating',      [2, '엔진(상태) + 대시보드(탭 전환)']],
    ['auto-arrived',          [2, '스토어(판단 한 곳) + 대시보드(알림 한 줄)']],
    ['next-stop-approaching', [2, '스토어(판단 한 곳) + 대시보드(알림 한 줄)']],
    ['steps-synced',          [2, '카드(제 콜 하나) + 훅(전체 모아 파생) — 보는 범위가 다르다']],
    ['milestone-result',      [2, '오류 표시(useServerErrors) + 시트(성공했을 때만 문을 닫는다) — 보는 것이 다르다']],
    ['connect',               [2, '재연결 때 각자 제 것을 다시 요청한다']],
]);

const multi = [...(client.get('on') ?? new Map())]
    .map(([ev, files]) => [ev, [...new Set(files)]])
    .filter(([, files]) => files.length > 1);

console.log('\n═ 한 사건을 **여러 곳이** 듣는다 (판단이 둘이면 갈라진다) ═');
if (!multi.length) console.log('  없음 ✅');
for (const [ev, files] of multi.sort((a, b) => b[1].length - a[1].length)) {
    const allowed = ALLOWED_MULTI.get(ev);
    const [max, why] = allowed ?? [0, null];
    const ok = allowed && files.length <= max;
    const note = !allowed ? '← 역할이 다른가? 같으면 한 곳으로 모은다'
               : ok ? why
               : `🔴 **${max}곳까지 적어 뒀는데 ${files.length}곳이다** — 늘어난 자리가 «판단»인지 보라 (${why})`;
    console.log(`  ${ok ? '✅' : '🔴'} ${ev.padEnd(24)} ${files.length}곳  ${note}`);
    if (!ok) { for (const f of files) console.log(`       ${f}`); problems.push(`${ev}(여러 곳이 듣는다)`); }
}

console.log(`\n검사한 이벤트: 서버 emit ${srvEmit.size} · on ${srvOn.size} / 관제웹 emit ${cliEmit.size} · on ${cliOn.size}`);
if (problems.length) {
    console.log(`\n❌ 계약이 끊긴 이벤트 ${problems.length}개: ${problems.join(', ')}`);
    process.exit(1);
}
console.log('\n✅ 소켓 계약 이상 없음');
