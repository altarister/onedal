#!/usr/bin/env node
/**
 * 죽은 코드 검사 — **불려야 하는데 안 불리는 것**을 찾는다.
 *
 * 2026-08-14 하루에 두 건이 나왔다. 둘 다 **몇 달째 안 돌고 있었고 아무도 몰랐다.**
 *   `getActivePolyline`    → 지나온 구간 제거가 한 번도 실행되지 않았다
 *   `getLastDropoffCoord`  → 500m 도착 감지가 한 번도 실행되지 않았다
 *
 * 🔴 **그런데 둘 다 "안 쓰이는 export" 는 아니었다.** 호출부는 멀쩡히 있었다.
 *    죽은 이유는 **세션에 없는 필드를 읽고 있어서** 늘 `null` 을 반환한 것이다 —
 *    `session.subCalls` / `session.mainCallState` 는 V2 리팩터링에서 사라진 필드인데,
 *    파라미터 타입이 `any` 라 `tsc` 가 잡지 못했다.
 *
 *    그래서 이 검사는 둘을 본다:
 *      ① 안 쓰이는 export        — 고전적 죽은 코드
 *      ② **세션에 없는 필드 접근** — 오늘 두 건을 잡았을 검사
 *
 * 사용: pnpm audit:dead
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '../..');

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
/**
 * 🔴 **주석은 코드가 아니다.** 걷어내고 본다.
 *    이 레포의 주석에는 *"예전에는 `session.subCalls` 를 읽었다"* 같은 **역사 기록**이 많다.
 *    그대로 스캔하면 이미 고친 것을 계속 잡아내 검사가 시끄러워지고, 시끄러우면 아무도 안 본다.
 *    (`tests/rules/*.test.ts` 가 쓰는 `codeOnly` 와 같은 이유다)
 */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const load = (files) => files.map(f => ({
    rel: relative(ROOT, f), base: basename(f),
    src: codeOnly(readFileSync(f, 'utf8')),
}));

const SERVER = load(walk(join(ROOT, 'server/src'), ['.ts']));
const TESTS = load(walk(join(ROOT, 'server/tests'), ['.ts']));
const CLIENT = load(walk(join(ROOT, 'client-app/src'), ['.ts', '.tsx']));
const SHARED = load(walk(join(ROOT, 'shared/src'), ['.ts']));
const ALL = [...SERVER, ...TESTS, ...CLIENT, ...SHARED];

const C = { d: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' };
const H = (s) => console.log(`\n${C.b}${s}${C.x}\n${'─'.repeat(74)}`);
let problems = 0;

// ═══════════════════════════ ① 안 쓰이는 export
H('① 내보냈는데 아무도 안 쓰는 것');

/** 진입점·계약이라 호출부가 없어도 정상인 것 */
const ENTRY = /\/(index|main)\.tsx?$/;
const isRouteFile = (rel) => rel.includes('/routes/');

/**
 * 🔴 **알고 남겨 둔 것.** 사유 없이는 못 넣는다 — 사유가 없으면 그냥 죽은 코드다.
 *
 * 이 목록이 있는 이유: 검사가 매번 같은 걸 떠들면 아무도 안 본다.
 * "봤고, 이래서 남긴다"를 여기 적으면 **다음 사람이 다시 판단하지 않아도 된다.**
 * 남길 이유가 사라지면 목록에서 빼고 코드도 지운다.
 */
const KEEP = {
    requireAdmin: '관리자 라우트를 만들 때 쓸 인증 미들웨어. 지금 관리자 화면이 없어 호출부가 없다. '
                + '보안 장치라 지웠다가 다시 만들면 그 사이 구멍이 난다 (규칙 ② 안전장치는 겹쳐 둔다).',
    getGeoCacheStats: '지리 캐시 적중률 진단용. 경유 성능을 다시 잴 때 쓴다 — 2026-08-14 에 실제로 필요했다.',
    getActivePinCount: '페어링 PIN 발급 현황 진단용. 기기 등록이 안 될 때 확인하는 유일한 수단.',
    /**
     * 판정 기준 다섯 — 이름으로 부르지 않고 `CRITERIA` 배열에 담겨 쓰인다.
     * 낱개로 내보내는 이유: **검사가 기준 하나만 떼어 시험**할 수 있어야 한다
     * («이 시험과 관련된 기준만 남긴다» — 기사님 2026-08-29).
     */
    돈: '판정 기준. `CRITERIA` 배열로 쓰인다. 낱개 export 는 검사가 하나만 떼어 보려고.',
    약속: '판정 기준. 위와 같다.',
    공간: '판정 기준. 위와 같다.',
    성질: '판정 기준. 위와 같다.',
    지리: '판정 기준. 위와 같다 — 지금은 가중치 0 이라 색에 안 들지만 화면에는 보인다.',
};

const exports = [];
for (const f of [...SERVER, ...CLIENT, ...SHARED]) {
    if (ENTRY.test(f.rel)) continue;
    /**
     * 🔴 **한글 이름도 본다** (2026-08-29 전수조사에서 잡힘). `\w` 는 한글을 안 잡아서
     *    `export const 돈` 같은 **기준 다섯이 통째로 안 보였다** — 2026-08-29 에 만든
     *    판정 기준이 전부 한글 이름이라, 그날부터 이 검사가 그 파일에 눈을 감고 있었다.
     */
    for (const m of f.src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([\w가-힣]+)/gm)) {
        exports.push({ file: f.rel, name: m[1], line: f.src.slice(0, m.index).split('\n').length });
    }
}

const unused = exports.filter(e => {
    const re = new RegExp(`\\b${e.name}\\b`, 'g');
    // 다른 파일에서 쓰이면 살아 있다
    if (ALL.some(f => f.rel !== e.file && re.test(f.src))) return false;
    // 자기 파일 안에서 쓰이는 것도 살아 있다 (선언 1회뿐이면 죽었다)
    const own = ALL.find(f => f.rel === e.file);
    return (own.src.match(re) || []).length <= 1;
});

if (unused.length === 0) {
    console.log(`  ${C.g}없음 ✅${C.x}`);
} else {
    let shown = 0;
    for (const u of unused) {
        // 라우트 파일의 핸들러·타입은 계약이라 조용히 넘긴다
        const soft = isRouteFile(u.file);
        const kept = KEEP[u.name];
        if (kept) {
            console.log(`  ${C.d}· ${u.name.padEnd(28)} 남겨 둠 — ${kept.split('.')[0]}${C.x}`);
            continue;
        }
        if (!soft) { problems++; shown++; }
        console.log(`  ${soft ? C.d + '·' : C.y + '⚠'}${C.x} ${u.name.padEnd(30)} ${C.d}${u.file}:${u.line}${C.x}`);
    }
    if (shown === 0) console.log(`  ${C.g}볼 것 없음 ✅${C.x} ${C.d}(· 는 라우트 계약 또는 사유와 함께 남겨 둔 것)${C.x}`);
    else console.log(`  ${C.d}⚠ = 볼 것. 남길 거면 스크립트의 KEEP 에 **사유와 함께** 넣는다${C.x}`);
}

// ═══════════════════════════ ② 세션에 없는 필드 접근
H('② 세션에 없는 필드를 읽는 곳  (오늘 두 건이 여기서 나왔다)');

const store = SERVER.find(f => f.rel.endsWith('state/userSessionStore.ts'));
const ifaceStart = store.src.indexOf('interface UserSession');
const ifaceEnd = store.src.indexOf('\n}', ifaceStart);
const iface = store.src.slice(ifaceStart, ifaceEnd);
const known = new Set([...iface.matchAll(/^\s{4}(\w+)[?:]/gm)].map(m => m[1]));

console.log(`  ${C.d}UserSession 이 선언한 필드 ${known.size}개${C.x}`);

const badAccess = [];
for (const f of SERVER) {
    if (f.rel.endsWith('state/userSessionStore.ts')) continue;

    /**
     * 🔴 `session` 이라는 이름은 이 레포에 여럿이다 (DeviceSession · socket.data 등).
     *    **`getUserSession()` 에서 받은 변수만** 본다 — 아니면 노이즈가 되어 아무도 안 본다.
     */
    const names = new Set(
        [...f.src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*getUserSession\(/g)].map(m => m[1])
    );
    if (names.size === 0) continue;

    for (const name of names) {
        const re = new RegExp(`(?:\\(\\s*)?${name}(?:\\s+as\\s+any\\s*\\))?\\.(\\w+)`, 'g');
        for (const m of f.src.matchAll(re)) {
            if (known.has(m[1])) continue;
            badAccess.push({ file: f.rel, line: f.src.slice(0, m.index).split('\n').length, field: m[1] });
        }
    }
}

if (badAccess.length === 0) {
    console.log(`  ${C.g}없음 ✅${C.x}`);
} else {
    const byField = {};
    for (const b of badAccess) (byField[b.field] ||= []).push(b);
    for (const [field, hits] of Object.entries(byField)) {
        problems++;
        console.log(`  ${C.r}⚠${C.x} ${C.b}session.${field}${C.x} ${C.d}— UserSession 에 없다. 늘 undefined 다${C.x}`);
        for (const h of hits) console.log(`       ${C.d}${h.file}:${h.line}${C.x}`);
    }
}

// ═══════════════════════════ ③ 세션을 any 로 받는 함수
H('③ 세션을 any 로 받는 함수  (타입이 없으면 tsc 가 못 잡는다)');

const anySession = [];
for (const f of SERVER) {
    for (const m of f.src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*session[^)]*)\)/g)) {
        if (!/session\s*:\s*any/.test(m[2])) continue;
        anySession.push({ file: f.rel, line: f.src.slice(0, m.index).split('\n').length, fn: m[1] });
    }
}

if (anySession.length === 0) {
    console.log(`  ${C.g}없음 ✅${C.x}`);
} else {
    for (const a of anySession) {
        problems++;
        console.log(`  ${C.r}⚠${C.x} ${a.fn}(session: any)  ${C.d}${a.file}:${a.line}${C.x}`);
    }
    console.log(`\n  ${C.d}2026-08-14: getActivePolyline · getLastDropoffCoord 이 정확히 이랬다.${C.x}`);
    console.log(`  ${C.d}세션에서 사라진 필드를 읽는데 타입이 any 라 아무도 몰랐고, 몇 달째 null 만 반환했다.${C.x}`);
}

// ═══════════════════════════ 결론
console.log('');
if (problems === 0) {
    console.log(`${C.g}✅ 죽은 코드 이상 없음${C.x}\n`);
} else {
    console.log(`${C.y}⚠ 볼 곳 ${problems}건${C.x} ${C.d}— 규칙 위반이 아니라 "왜 안 불리는지" 확인할 자리다${C.x}\n`);
    process.exitCode = 1;
}
