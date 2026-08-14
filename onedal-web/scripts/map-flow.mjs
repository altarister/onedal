#!/usr/bin/env node
/**
 * 흐름 지도 — **코드에서 뽑는다. 손으로 그리지 않는다.**
 *
 * 기사님(2026-08-14): *"어디서 어떤 이벤트가 발생하면 어떤 트리거가 발동하고 그걸로 어떤
 * 결과가 도출되어야 할지 모르니 오류를 발견하기 너무 어렵다. … 정확히 어디에 영향이
 * 가고 있는지 모르니 임기응변으로 자꾸 만들어 넣는 땜빵 코드가 생성되는 것 같다."*
 *
 * 🔴 **손으로 그린 지도는 반드시 코드와 갈라진다.** 이 레포는 문서가 계획을 완료로
 *    기술한 사고를 네 번 겪었다. 갈라진 지도는 없는 것보다 나쁘다 — 틀린 걸 믿게 된다.
 *    그래서 매번 소스를 파싱해 다시 그린다. `pnpm audit:socket` 이 쓰던 방식이다.
 *
 * 뽑는 것
 *   ① 부팅 사슬      새로고침 → 로그인 → 소켓 접속 → 무엇을 받고 무엇을 요청하나
 *   ② 이벤트 사슬    누가 쏘고(emit) 누가 받아(on) **무엇을 또 일으키나**
 *   ③ REST 사슬      누가 부르고 → 어느 라우트가 받아 → 어떤 이벤트를 쏘나
 *   ④ 상태 쓰기      activeFilter 의 어떤 키를 누가 쓰나 (오늘 사고 대부분이 여기서 났다)
 *   ⑤ 주기 트리거    타이머·폴링
 *
 * 사용: pnpm map          (콘솔)
 *       pnpm map --html   (눌러볼 수 있는 한 장)
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const APP_ROOT = join(ROOT, '../onedal-app/app/src/main/java/com/onedal/app');

// ─────────────────────────────── 파일 수집
const walk = (dir, ext, out = []) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return out; }
    for (const e of entries) {
        const p = join(dir, e);
        if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
        if (statSync(p).isDirectory()) walk(p, ext, out);
        else if (ext.some(x => e.endsWith(x))) out.push(p);
    }
    return out;
};

const load = (files) => files.map(f => ({ path: f, rel: relative(ROOT, f), src: readFileSync(f, 'utf8') }));

const SERVER = load(walk(join(ROOT, 'server/src'), ['.ts']));
const CLIENT = load(walk(join(ROOT, 'client-app/src'), ['.ts', '.tsx']));
const ANDROID = load(walk(APP_ROOT, ['.kt']));

/**
 * 이 줄을 감싸고 있는 함수 이름. 정확한 AST 가 아니라 **가장 가까운 위쪽 선언**을 찾는다.
 * 지도의 목적은 "어디를 봐야 하는가"이므로 이 정도로 충분하다 (틀리면 파일·줄이 남는다).
 */
const enclosing = (src, index) => {
    const before = src.slice(0, index).split('\n');
    for (let i = before.length - 1; i >= 0 && i > before.length - 400; i--) {
        const m = before[i].match(
            /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*[:=].*(?:=>|function)|^\s{4}(?:const|function)\s+(\w+)\s*[:=(]|^\s*(\w+)\s*[:(].*=>\s*\{?$/
        );
        if (m) return m[1] || m[2] || m[3] || m[4];
    }
    return '(최상위)';
};

const scan = (files, re, map) => {
    const out = [];
    for (const f of files) {
        for (const m of f.src.matchAll(re)) {
            const line = f.src.slice(0, m.index).split('\n').length;
            out.push({ file: f.rel, line, fn: enclosing(f.src, m.index), ...map(m) });
        }
    }
    return out;
};

// ─────────────────────────────── ② 이벤트
const serverEmits = scan(SERVER, /(?:io|socket)(?:\.to\([^)]*\))?\.emit\(\s*["'`]([\w-]+)["'`]/g, m => ({ evt: m[1] }));
const serverOns = scan(SERVER, /(?:safeOn\(socket,|socket\.on\()\s*["'`]([\w-]+)["'`]/g, m => ({ evt: m[1] }));
const clientOns = scan(CLIENT, /socket\.on\(\s*["'`]([\w-]+)["'`]/g, m => ({ evt: m[1] }));
const clientEmits = scan(CLIENT, /socket\.emit\(\s*["'`]([\w-]+)["'`]/g, m => ({ evt: m[1] }));

// ─────────────────────────────── ③ REST
const mounts = [];
for (const f of SERVER) {
    for (const m of f.src.matchAll(/app\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)/g)) mounts.push({ prefix: m[1], router: m[2] });
}
const routes = scan(SERVER, /router\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g, m => ({ method: m[1].toUpperCase(), path: m[2] }));
const clientCalls = scan(CLIENT, /apiClient\.(get|post|put|patch|delete)\(\s*[`"']([^`"'$]*)/g, m => ({ method: m[1].toUpperCase(), path: m[2] }));
const appCalls = scan(ANDROID, /getTargetUrl\(\s*"([^"]+)"/g, m => ({ path: m[1] }));

// ─────────────────────────────── ④ 상태 쓰기
const filterWrites = [];
for (const f of SERVER.concat(CLIENT)) {
    for (const m of f.src.matchAll(/(updateActiveFilter|saveBaseFilter|updateFilter)\(\s*[^,]*,?\s*\{([^}]*)\}/g)) {
        const keys = [...m[2].matchAll(/(\w+)\s*:/g)].map(x => x[1]);
        if (!keys.length) continue;
        filterWrites.push({
            file: f.rel, line: f.src.slice(0, m.index).split('\n').length,
            fn: enclosing(f.src, m.index), via: m[1], keys,
        });
    }
}

// ─────────────────────────────── ⑤ 주기 트리거
const timers = scan(SERVER.concat(CLIENT), /set(Timeout|Interval)\(\s*[\s\S]{0,400}?\}\s*,\s*([\w.*\s]+)\)/g,
    m => ({ kind: m[1], delay: m[2].trim() }));

// ═══════════════════════════════ 출력
const C = { d: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', r: '\x1b[31m', x: '\x1b[0m' };
const H = (s) => console.log(`\n${C.b}${s}${C.x}\n${'─'.repeat(74)}`);
const loc = (e) => `${C.d}${e.file}:${e.line}${C.x}`;

console.log(`${C.b}흐름 지도${C.x} ${C.d}— 소스에서 추출. 손으로 고친 곳 없음${C.x}`);
console.log(`${C.d}서버 ${SERVER.length}파일 · 관제웹 ${CLIENT.length}파일 · 앱 ${ANDROID.length}파일${C.x}`);

// ① 부팅 사슬
H('① 부팅 — 새로고침하면 무슨 일이 순서대로 일어나나');
const bootFiles = ['client-app/src/main.tsx', 'client-app/src/App.tsx', 'client-app/src/contexts/AuthContext.tsx',
                   'client-app/src/lib/socket.ts', 'client-app/src/pages/Dashboard.tsx'];
let step = 0;
for (const bf of bootFiles) {
    const f = CLIENT.find(x => x.rel === bf);
    if (!f) continue;
    const emits = clientEmits.filter(e => e.file === bf);
    const ons = clientOns.filter(e => e.file === bf);
    const calls = clientCalls.filter(e => e.file === bf);
    if (!emits.length && !ons.length && !calls.length) {
        console.log(`${C.c}${++step}.${C.x} ${bf.split('/').pop()} ${C.d}(구독·요청 없음 — 껍데기)${C.x}`);
        continue;
    }
    console.log(`${C.c}${++step}.${C.x} ${C.b}${bf.split('/').pop()}${C.x}`);
    for (const c of calls) console.log(`      ${C.y}→ REST${C.x} ${c.method} ${c.path || '(동적)'}  ${loc(c)}`);
    for (const e of emits) console.log(`      ${C.y}→ 소켓${C.x} ${e.evt}  ${loc(e)}`);
    for (const o of ons) console.log(`      ${C.g}← 구독${C.x} ${o.evt}  ${loc(o)}`);
}
const hookFiles = [...new Set(clientOns.map(o => o.file))].filter(f => f.includes('/hooks/'));
console.log(`${C.c}${++step}.${C.x} ${C.b}훅들이 구독을 건다${C.x} ${C.d}(Dashboard 가 부르는 순간)${C.x}`);
for (const hf of hookFiles) {
    const evts = clientOns.filter(o => o.file === hf).map(o => o.evt);
    console.log(`      ${C.g}←${C.x} ${hf.split('/').pop().padEnd(22)} ${evts.join(', ')}`);
}

// ② 이벤트 사슬
H('② 이벤트 — 누가 쏘고 누가 받아 무엇을 또 일으키나');
/** socket.io 내장 이벤트 — 앱이 만든 게 아니므로 짝을 따지지 않는다 */
const BUILTIN = new Set(['connect', 'disconnect', 'connect_error', 'reconnect', 'error']);
const allEvts = [...new Set([...serverEmits, ...serverOns, ...clientOns, ...clientEmits].map(e => e.evt))]
    .filter(e => !BUILTIN.has(e)).sort();
for (const evt of allEvts) {
    const se = serverEmits.filter(e => e.evt === evt);
    const so = serverOns.filter(e => e.evt === evt);
    const co = clientOns.filter(e => e.evt === evt);
    const ce = clientEmits.filter(e => e.evt === evt);
    const dir = ce.length ? '관제웹 → 서버' : '서버 → 관제웹';
    const broken = (ce.length && !so.length) || (se.length && !co.length) || (co.length && !se.length);
    console.log(`${broken ? C.r + '⚠' : C.g + '·'}${C.x} ${C.b}${evt.padEnd(26)}${C.x}${C.d}${dir}${C.x}`);
    for (const e of ce) console.log(`     쏨   ${e.fn}()  ${loc(e)}`);
    for (const e of so) console.log(`     받음 서버 ${e.fn}()  ${loc(e)}`);
    for (const e of se) console.log(`     쏨   서버 ${e.fn}()  ${loc(e)}`);
    for (const e of co) console.log(`     받음 ${e.fn}()  ${loc(e)}`);
}

// ③ REST 사슬
H('③ REST — 누가 부르면 서버 어디가 받나');
const byPrefix = {};
for (const r of routes) {
    const mount = mounts.find(m => r.file.includes(m.router.replace(/Router|Routes/i, '').toLowerCase()))
              || mounts.find(m => r.file.endsWith(`/${m.prefix.split('/').pop()}.ts`));
    const full = ((mount?.prefix || '/api/?') + r.path).replace(/\/+$/, '') || '/';
    (byPrefix[full] ||= []).push(r);
}
for (const [path, rs] of Object.entries(byPrefix).sort()) {
    const callers = [
        ...clientCalls.filter(c => path.includes(c.path.replace('/api', '')) && c.path).map(c => `관제웹 ${c.file.split('/').pop()}`),
        ...appCalls.filter(a => path.includes(a.path)).map(() => '앱'),
    ];
    const emitsHere = serverEmits.filter(e => rs.some(r => e.file === r.file));
    console.log(`  ${C.b}${rs[0].method.padEnd(6)}${path}${C.x}  ${C.d}${rs[0].file}${C.x}`);
    if (callers.length) console.log(`         ${C.y}부르는 곳${C.x} ${[...new Set(callers)].join(' · ')}`);
    if (emitsHere.length) console.log(`         ${C.g}그 결과 쏘는 것${C.x} ${[...new Set(emitsHere.map(e => e.evt))].join(', ')}`);
}

// ④ 상태 쓰기
H('④ activeFilter — 어떤 키를 누가 쓰나  (오늘 사고 대부분이 여기서 났다)');
const byKey = {};
for (const w of filterWrites) for (const k of w.keys) (byKey[k] ||= []).push(w);
for (const [key, ws] of Object.entries(byKey).sort((a, b) => b[1].length - a[1].length)) {
    const many = ws.length >= 3;
    console.log(`${many ? C.r + '⚠' : ' '}${C.x} ${C.b}${key.padEnd(24)}${C.x}${ws.length}곳`);
    for (const w of ws) console.log(`     ${w.fn}()  ${loc(w)}`);
}

// ⑤ 주기 트리거
H('⑤ 주기·타이머');
for (const t of timers) console.log(`  ${t.kind.padEnd(9)} ${String(t.delay).padEnd(28)} ${t.fn}()  ${loc(t)}`);

// ⑥ 같은 이벤트를 여러 곳에서 쏘는가 — 서로 모르는 파이프
H('⑥ 같은 이벤트를 여러 곳에서 쏜다  (서로 모르면 순서·중복이 생긴다)');
for (const evt of allEvts) {
    const senders = [...clientEmits, ...serverEmits].filter(e => e.evt === evt);
    const files = [...new Set(senders.map(s => s.file))];
    if (files.length < 2) continue;
    console.log(`${C.r}⚠${C.x} ${C.b}${evt}${C.x}  ${files.length}개 파일에서 쏨`);
    for (const s of senders) console.log(`     ${s.fn}()  ${loc(s)}`);
}

console.log(`\n${C.d}⚠ 표시는 "짝이 없다"(②) 또는 "쓰는 곳이 3곳 이상"(④). 규칙 위반이 아니라 볼 곳이다.${C.x}\n`);
