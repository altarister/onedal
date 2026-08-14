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

/** 아직 구현 전이라 알고도 비워둔 것 (근거를 함께 적는다) */
const KNOWN_GAPS = {
    'auto-arrived': 'Phase 4 미구현 — GPS 자동 도착 감지가 아직 없다 (todo 기록됨)',
};

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

console.log(`\n검사한 이벤트: 서버 emit ${srvEmit.size} · on ${srvOn.size} / 관제웹 emit ${cliEmit.size} · on ${cliOn.size}`);
if (problems.length) {
    console.log(`\n❌ 계약이 끊긴 이벤트 ${problems.length}개: ${problems.join(', ')}`);
    process.exit(1);
}
console.log('\n✅ 소켓 계약 이상 없음');
