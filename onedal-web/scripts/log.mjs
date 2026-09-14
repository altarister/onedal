#!/usr/bin/env node
/**
 * 📜 **서버 로그 읽기 — 부팅 · 수상한 줄 · 콜별 흐름 · 장부 대조** (기사님 지시 2026-09-14).
 *
 * 기사님: *"로그 분석해봐줘 … 나중에 로그 분석하는 스킬이나 스크립트 만들어도 좋겠다."*
 *
 * 🔴 **왜 새 명령인가** — `pnpm db` 는 장부(DB)만 읽는다. 로그 파일(`server/logs/`)을 읽는
 *    명령이 없어서 분석할 때마다 grep 을 손으로 짰고, 같은 함정에 여러 번 빠졌다:
 *    · 한 콜의 id 가 줄마다 모양이 다르다 — 전체 UUID · 앞 8자(`지나침`·`Piggyback`) · 뒤 6자(`출생`·관제웹)
 *    · 관제웹 줄(`🖥️ [관제웹 …]`)과 서버 줄이 한 파일에 섞인다
 *    · `📡 [HTTP 수신]` 이 줄의 절반을 넘어 흐름이 안 보인다
 *
 * 쓰기:
 *   pnpm log                           오늘(포트 4000) 요약 — 부팅 · 소켓 · 수상한 줄 · 콜별 장부 대조
 *   pnpm log call <콜 id 앞부분>        그 콜의 흐름 — ☁️ 서버 줄 / 🖥️ 관제웹 줄, 같은 줄은 접는다
 *   옵션  --date 2026-09-13 · --port 4012 · --file <경로> · --since 04:20 · --until 05:00
 *         --db <server/ 기준 DB 파일 이름>  — 다른 DB 와 대조한다 (예: 사본으로 검수할 때)
 *
 * ⚠️ **읽기만 한다.** 장부 대조는 «포트 4000 로그 ↔ server/local.db» 일 때만 한다
 *    (`DB_FILE=data.db` 처럼 바꿀 수 있다). 전용 포트(scenario·drive)는 DB 가 따로라 대조하지 않는다.
 * 🔴 **exit 1** — 로그에 «출생»(단계 행이 태어났다)이 찍혔는데 장부에 그 단계가 없는 콜이 있을 때.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = join(WEB, 'server');

// ── 인자 ─────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opt = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1]; i++; } else pos.push(argv[i]);
}
const [mode, callArg] = pos;
if (mode && mode !== 'call') {
    console.error(`🔴 모르는 보기: ${mode}\n   pnpm log  ·  pnpm log call <콜 id 앞부분>`);
    process.exit(1);
}

const todayKst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const port = String(opt.port ?? '4000');
const file = opt.file ?? join(SERVER, 'logs', `server-${opt.date ?? todayKst}${port === '4000' ? '' : `-${port}`}.log`);
if (!existsSync(file)) { console.error(`🔴 로그 파일이 없습니다: ${file}`); process.exit(1); }

// ── 줄 읽기 ──────────────────────────────────────────────────────
/** `fileLogger.ts` 의 모양: `HH:MM:SS.mmm LVL 메시지` — 시각 없는 줄은 앞 줄에 딸린 것(JSON 등)이다 */
const STAMP = /^(\d{2}:\d{2}:\d{2}\.\d{3}) (   |WRN|ERR) (.*)$/;
const entries = [];
for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = STAMP.exec(line);
    if (m) entries.push({ t: m[1], lvl: m[2].trim(), msg: m[3] });
}
const inRange = (e) => (!opt.since || e.t >= opt.since) && (!opt.until || e.t.slice(0, opt.until.length) <= opt.until);
const shown = entries.filter(inRange);

const isWeb = (e) => e.msg.startsWith('🖥️ [관제웹');
const isNoise = (e) => e.msg.startsWith('📡 [HTTP 수신]');

// ── 콜 id — 줄마다 모양이 다르다 ──────────────────────────────────
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const uuids = new Set();
for (const e of entries) for (const u of e.msg.match(UUID) ?? []) uuids.add(u);
/** 🔴 **기사님(사용자) id 도 UUID 다** — 콜로 세지 않는다 (`유저 접속: … (id)` · `User: id` · `유저 id`) */
for (const e of entries)
    for (const m of e.msg.matchAll(/(?:유저|User|user_id|userId)[^0-9a-f\n]{0,40}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g))
        uuids.delete(m[1]);

/** 앞 8자 · 뒤 6자 → UUID. 둘 이상이 겹치면 가리지 않는다 (지어내지 않는다) */
const byHead = new Map(), byTail = new Map();
const put = (map, k, u) => map.set(k, map.has(k) && map.get(k) !== u ? null : u);
for (const u of uuids) { put(byHead, u.slice(0, 8), u); put(byTail, u.slice(-6), u); }

function idsOf(msg) {
    const out = new Set((msg.match(UUID) ?? []).filter(u => uuids.has(u)));
    const rest = msg.replace(UUID, ' ');
    for (const tok of rest.match(/(?<![0-9a-f])[0-9a-f]{6,8}(?![0-9a-f])/g) ?? []) {
        const u = tok.length === 8 ? byHead.get(tok) : tok.length === 6 ? byTail.get(tok) : null;
        if (u) out.add(u);
    }
    return out;
}

/** 같은 모양의 줄을 접으려고 숫자·id 를 지운다 */
const shapeOf = (msg) => msg.replace(UUID, '<id>').replace(/\b[0-9a-f]{6,8}\b/g, '<id>').replace(/\d+/g, 'N');
const short = (u) => u.slice(0, 8);
/** 장부 시각(ISO · UTC)을 로그와 같은 한국 시각으로 */
const kst = (iso) => { const t = Date.parse(iso ?? ''); return Number.isNaN(t) ? '시각 없음' : new Date(t + 9 * 3600e3).toISOString().slice(11, 19); };
const cut = (s, n = 150) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ── 장부 (포트 4000 일 때만) ──────────────────────────────────────
const STEP_TABLE = {
    '상차지 통화': 'step_call_pickup', '상차지 도착': 'step_arrive_pickup', '상차 완료': 'step_loaded',
    '하차지 통화': 'step_call_dropoff', '하차지 도착': 'step_arrive_dropoff', '하차 완료': 'step_delivered',
};
let db = null;
if (opt.db || (port === '4000' && !opt.file)) {
    const dbFile = join(SERVER, opt.db || process.env.DB_FILE || 'local.db');
    if (existsSync(dbFile)) {
        const require = createRequire(join(SERVER, 'index.js'));
        db = new (require('better-sqlite3'))(dbFile, { readonly: true });
    }
}
const orderOf = (u) => db?.prepare('SELECT status FROM orders WHERE id = ?').get(u) ?? null;
const stepsOf = (u) => Object.fromEntries(Object.entries(STEP_TABLE).map(([label, t]) =>
    [label, db?.prepare(`SELECT occurred_at, source FROM ${t} WHERE orderId = ?`).get(u) ?? null]));

/** 🌱 [출생] 줄 — 서버가 «이 단계 행을 만들었다»고 한 것 */
const BIRTH = /🌱 \[출생\] ([0-9a-f]{6}) · (상차지 통화|상차지 도착|상차 완료|하차지 통화|하차지 도착|하차 완료)/;

// ═══ pnpm log call <id> ═══════════════════════════════════════════
if (mode === 'call') {
    if (!callArg) { console.error('🔴 콜 id 앞부분을 주세요 — pnpm log call 6f0536ba'); process.exit(1); }
    const hits = [...uuids].filter(u => u.startsWith(callArg) || u.endsWith(callArg));
    if (hits.length !== 1) {
        console.error(hits.length ? `🔴 여럿이 맞습니다: ${hits.map(short).join(' · ')}` : `🔴 이 로그에 ${callArg} 콜이 없습니다`);
        process.exit(1);
    }
    const u = hits[0];
    console.log(`\n📜 ${basename(file)} · 콜 ${u}`);
    if (db) {
        const o = orderOf(u);
        console.log(`   장부: ${o ? o.status : '없음 (비웠거나 다른 DB)'}`);
        if (o) for (const [label, r] of Object.entries(stepsOf(u)))
            console.log(`   ${r ? '✅' : '·  '} ${label.padEnd(6)} ${r ? `${kst(r.occurred_at)} ${r.source ?? ''}` : ''}`);
    }
    console.log('');
    let prev = null;
    for (const e of shown) {
        if (isNoise(e) || !idsOf(e.msg).has(u)) continue;
        const shape = shapeOf(e.msg);
        if (prev && prev.shape === shape) { prev.n++; prev.last = e.t; continue; }
        if (prev) flush(prev);
        prev = { e, shape, n: 1, last: e.t };
    }
    if (prev) flush(prev);
    function flush(p) {
        const who = isWeb(p.e) ? '🖥️' : '☁️';
        const fold = p.n > 1 ? ` ×${p.n} (~${p.last.slice(0, 8)})` : '';
        console.log(`${p.e.t.slice(0, 8)} ${who} ${p.e.lvl.padEnd(3)} ${cut(p.e.msg)}${fold}`);
    }
    process.exit(0);
}

// ═══ pnpm log (요약) ═════════════════════════════════════════════
const range = opt.since || opt.until ? ` · ${opt.since ?? '처음'}~${opt.until ?? '끝'}` : '';
console.log(`\n📜 ${basename(file)}  (시각 있는 줄 ${shown.length}${range})`);

const boots = shown.filter(e => e.msg.includes('🧾 [BUILD]'));
console.log(`\n🧾 부팅 ${boots.length}번`);
for (const b of boots) console.log(`   ${b.t.slice(0, 8)}  ${b.msg.match(/commit (\S+)/)?.[1] ?? '?'}`);

const conn = shown.filter(e => e.msg.startsWith('🔌 [소켓 연결]')).length;
const disc = shown.filter(e => e.msg.startsWith('❌ [소켓 해제]')).length;
console.log(`\n🔌 소켓 연결 ${conn} · 해제 ${disc}`);

const odd = new Map();
for (const e of shown) {
    if (isNoise(e) || e.msg.startsWith('❌ [소켓 해제]')) continue;
    if (!(e.lvl === 'WRN' || e.lvl === 'ERR' || /❌|🚨|💥|🔴|⚠️/.test(e.msg))) continue;
    const k = e.lvl + shapeOf(e.msg);
    const g = odd.get(k) ?? { e, n: 0, first: e.t, last: e.t };
    g.n++; g.last = e.t; odd.set(k, g);
}
console.log(`\n⚠️ 수상한 줄 — 모양 ${odd.size}가지 (WRN·ERR · ❌🚨💥🔴⚠️ · 같은 모양은 접는다)`);
for (const g of [...odd.values()].sort((a, b) => b.n - a.n))
    console.log(`   ×${String(g.n).padEnd(3)} ${g.first.slice(0, 5)}~${g.last.slice(0, 5)} ${(g.e.lvl || '   ').padEnd(3)} ${isWeb(g.e) ? '🖥️' : '☁️'} ${cut(g.e.msg, 120)}`);

const calls = new Map();
for (const e of shown) {
    if (isNoise(e)) continue;
    for (const u of idsOf(e.msg)) {
        const c = calls.get(u) ?? { first: e.t, last: e.t, server: 0, web: 0, births: new Set() };
        c.last = e.t; isWeb(e) ? c.web++ : c.server++;
        const b = BIRTH.exec(e.msg);
        if (b && byTail.get(b[1]) === u) c.births.add(b[2]);
        calls.set(u, c);
    }
}
let lost = 0;
console.log(`\n📦 콜 ${calls.size}건 — 로그에 id 가 나온 것${db ? ' · 장부 대조' : ' (장부 대조 안 함 — 포트 4000 로그이거나 --db 를 줄 때만 한다)'}`);
for (const [u, c] of [...calls].sort((a, b) => a[1].first.localeCompare(b[1].first))) {
    let ledger = '';
    if (db) {
        const o = orderOf(u);
        if (!o) ledger = '장부에 없음 (비웠거나 다른 DB)';
        else {
            const steps = stepsOf(u);
            const have = Object.values(steps).filter(Boolean).length;
            const missing = [...c.births].filter(l => !steps[l]);
            if (missing.length) lost++;
            ledger = `${o.status} · 단계 ${have}/6` + (missing.length ? ` · 🔴 출생했는데 장부에 없음: ${missing.join('·')}` : '');
        }
    }
    console.log(`   ${short(u)}  ${c.first.slice(0, 8)}~${c.last.slice(0, 8)}  ☁️${c.server} 🖥️${c.web}  ${ledger}`);
}
console.log(`\n   한 콜의 흐름: pnpm log call <id 앞부분>${opt.date ? ` --date ${opt.date}` : ''}${port !== '4000' ? ` --port ${port}` : ''}\n`);
if (lost) { console.error(`🔴 장부 대조: ${lost}건이 로그와 장부가 다릅니다`); process.exit(1); }
