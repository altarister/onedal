#!/usr/bin/env node
/**
 * 🔍 **배차망별 파싱 감사 — 앱이 화면을 제대로 읽었나** (기사님 지시).
 *
 * 기사님: *"찾은 방법들을 스크립트로 만들어 줘. 다른 배차망을 붙인 뒤에 그걸 쓸 수 있으면 좋겠다."*
 *
 * ── 왜 폰이 없어도 되나 ──
 * 앱이 읽은 **화면 글자가 장부(`intel.rawText`)에 그대로** 저장된다. 그래서 폰 로그를 뒤지지 않아도
 * «무엇이 들어왔고 앱이 그것을 어떻게 갈랐나»를 장부만으로 되짚을 수 있다.
 * 🔴 폰 로그는 줄이 잘리기도 하고 3일치만 남지만, 장부는 남는다 — 그래서 여기를 원천으로 삼는다.
 *
 * ── 무엇을 잡나 (2026-09-16 실전에서 이 넷으로 진짜 버그를 셋 찾았다) ──
 *   ① 반쪽 읽힘   도착지·거리가 빈 채로 저장된 콜 — 파싱이 흔들린다는 첫 신호
 *   ② 낯선 글자   주소 칸에 지역이 아닌 것이 들어갔나 (날짜 «9/23(수)» · 시각 · 숫자 · 화면 메뉴)
 *   ③ 모르는 낱말 원문에 자주 나오는데 어느 칸에도 안 담긴 글자 — 새 배지가 생기면 여기 뜬다
 *   ④ 출처 확인   실물 폰인가 · 어느 배차망인가 — «집에서 만든 자료로 판단하지 않기» (기사님 지시)
 *
 * 🔴 **판정하지 않는다 — 보여만 준다.** 무엇이 버그인지는 사람이 고른다.
 *
 * 쓰기:
 *   pnpm db parse                     배차망 목록과 건수
 *   pnpm db parse kakaopicker         그 배차망만 감사
 *   pnpm db parse kakaopicker 100     최근 100건만 — 고친 뒤 확인할 때 옛 자료에 묻히지 않게
 *   DB_FILE=data.db pnpm db parse kakaopicker    라이브 DB 로
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
// 🧩 낱말 가르는 셈은 `db-dict` 와 **한 벌**로 쓴다 — 두 벌이면 «감사는 지역인데 사전은 미분류» 로 갈라진다
import { loadDict, loadRegions, collectWords } from './wordKinds.mjs';

// better-sqlite3 는 서버 워크스페이스에 있다 — 다른 `db-*.mjs` 와 같은 방식으로 부른다
const ROOT = new URL('../..', import.meta.url).pathname;   // 📦 scripts/lib/ 에서 두 칸 위가 onedal-web
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');

const DB_PATH = join(ROOT, 'server', process.env.DB_FILE || 'local.db');
if (!existsSync(DB_PATH)) {
    console.error(`🔴 DB 가 없다: ${DB_PATH}`);
    process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
const target = process.argv[2];
const recent = Number(process.argv[3]) || 0;   // ⓑ 최근 N건만 — 고친 뒤 확인할 때 옛 자료에 묻히지 않게

// ── 배차망 목록 ──
const apps = db.prepare(`SELECT targetApp, COUNT(*) n FROM intel GROUP BY targetApp ORDER BY n DESC`).all();
if (!target) {
    console.log('🔍 pnpm db parse <배차망>   — 앱이 화면을 제대로 읽었나 장부로 되짚는다\n');
    for (const a of apps) console.log(`   ${String(a.targetApp || '(없음)').padEnd(18)} ${a.n}건`);
    process.exit(0);
}

const rows = db.prepare(
    `SELECT timestamp, device_id, targetApp, pickup, dropoff, fare, itemSize, pickupDistanceKm, tagsText, rawText, verdict
     FROM intel WHERE targetApp = ? ORDER BY rowid`,
).all(target).slice(recent > 0 ? -recent : 0);

if (rows.length === 0) {
    console.error(`🔴 «${target}» 으로 저장된 콜이 없다. 위 목록에서 고른다.`);
    process.exit(1);
}

const pct = (n) => `${((n / rows.length) * 100).toFixed(0)}%`;
console.log(`🔍 «${target}» 파싱 감사 — 장부 ${rows.length}건${recent > 0 ? ` (최근 ${recent}건만)` : ''}\n`);

// ── ④ 출처 확인 — 먼저 본다. 실물 자료가 아니면 아래 숫자가 다 헛것이다 ──
const by = (k) => {
    const m = new Map();
    for (const r of rows) m.set(String(r[k] ?? '(없음)'), (m.get(String(r[k] ?? '(없음)')) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]);
};
const days = by('timestamp').map(([t, n]) => [String(t).slice(0, 10), n]);
const dayMap = new Map();
for (const [d, n] of days) dayMap.set(d, (dayMap.get(d) || 0) + n);
console.log('④ 어디서 온 자료인가');
for (const [d, n] of by('device_id')) console.log(`     기기 ${d} — ${n}건`);
for (const [d, n] of [...dayMap].sort()) console.log(`     ${d} — ${n}건`);

// ── ① 반쪽 읽힘 ──
const noDrop = rows.filter((r) => !r.dropoff);
const noKm = rows.filter((r) => r.pickupDistanceKm == null);
const both = rows.filter((r) => !r.dropoff && r.pickupDistanceKm == null);
console.log('\n① 반쪽 읽힘');
console.log(`     도착지 없음 ${noDrop.length}건 (${pct(noDrop.length)})   거리 없음 ${noKm.length}건   둘 다 없음 ${both.length}건`);
console.log('     ↳ 둘이 «같이» 비면 카드의 한 줄이 통째로 안 잡힌 것이다 (묶는 범위가 좁다)');
console.log('     ↳ 도착지만 비면 그 배차망의 어떤 콜 종류가 원래 지역 이름을 안 주는지 본다 (픽커 도보 콜이 그렇다)');
const dropByKind = new Map();
for (const r of noDrop) {
    const t = r.tagsText || '';
    const kind = t.split(' ').find((w) => w && !/^\d/.test(w)) || '(꼬리표 없음)';
    dropByKind.set(kind, (dropByKind.get(kind) || 0) + 1);
}
for (const [k, n] of [...dropByKind].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`       · ${k} — ${n}건`);

// ── ①-2 어느 축에서 떨어졌나 — 폰이 남긴 판정 ──
/**
 * 🗳️ **떨어진 까닭은 폰이 `intel.verdict` 에 남긴다** — 축 낱말 하나 (`fare` · `pickup` · `region` …).
 * 🔴 **빈 칸은 «통과» 라는 뜻이다.** 전부 비어 있으면 그 배차망이 아직 판정을 안 싣는 것이다
 *    (픽커는 «수집 전용» 이라 오래 비워 뒀다 — 알람 판정이 생긴 뒤로는 싣는다).
 */
const AXIS_KOR = { fare: '요금', pickup: '상차 거리', region: '도착지', vehicle: '차종', pickupList: '상차 목록', routeOrder: '경로 순서' };
const byAxis = new Map();
let noVerdict = 0;
for (const r of rows) {
    if (!r.verdict) { noVerdict++; continue; }
    byAxis.set(r.verdict, (byAxis.get(r.verdict) || 0) + 1);
}
console.log('\n①-2 어느 축에서 떨어졌나');
if (byAxis.size === 0) {
    console.log(`     판정이 실린 콜 0건 (전부 ${noVerdict}건) — 이 배차망은 아직 판정을 안 싣는다`);
} else {
    for (const [a, n] of [...byAxis].sort((x, y) => y[1] - x[1])) {
        console.log(`     ${(AXIS_KOR[a] || a).padEnd(10)} ${String(n).padStart(5)}건`);
    }
    console.log(`     ${'통과'.padEnd(10)} ${String(noVerdict).padStart(5)}건 (판정 칸이 비었다)`);
}

// ── ② 낯선 글자가 주소 칸에 ──
const SUSPECT = [
    ['날짜 배지', /\d{1,2}\/\d{1,2}\([월화수목금토일]\)/],
    ['시각', /\d{1,2}:\d{2}/],
    ['거리', /\d+(\.\d+)?\s*(km|m)\b/],
    ['요금', /\d{1,3}(,\d{3})+/],
    ['분 표시', /\d+분/],
];
console.log('\n② 주소 칸에 든 낯선 글자 — 지역이 아닌 것이 들어갔나');
let any = false;
for (const [name, re] of SUSPECT) {
    const hit = rows.filter((r) => re.test(`${r.pickup || ''} ${r.dropoff || ''}`));
    if (hit.length === 0) continue;
    any = true;
    console.log(`     🔴 ${name} ${hit.length}건`);
    for (const r of hit.slice(0, 3)) {
        console.log(`       · ${r.fare}원 | ${r.pickup}→${r.dropoff || '(빈칸)'}`);
        if (r.rawText) console.log(`         원문: ${r.rawText.slice(0, 110)}`);
    }
}
if (!any) console.log('     없음 ✅');

// ── ③ 낱말을 종류별로 나눈다 — 지역 · 가게·건물 · 미분류 ──
/**
 * 🗂️ **모르는 낱말은 «미분류» 로 남긴다** (기사님 지시).
 *
 * 낱말을 셋으로 나눈다 — **지역**(지도 명부가 안다) · **가게·건물**(이름 모양으로 안다) · **미분류**.
 * 🔴 «아는 것 / 모르는 것» 둘로만 가르면 지역 이름까지 «모르는 글자» 로 떠서,
 *    사람이 «이건 지역이겠지» 하고 어림잡게 된다 — 그러면 진짜 모르는 것이 묻힌다.
 * 🔴 미분류가 0 이 되는 것이 «100% 파싱» 이다 (기사님 지시).
 */
const { dictWords, dictSet, stripPhrases } = loadDict(ROOT, target);
const { regionNames, isRegion } = loadRegions(ROOT);
const { kinds } = collectWords(rows, { dictWords, dictSet, stripPhrases, isRegion });
console.log(`\n③ 낱말 갈래 — 지도 명부 ${regionNames.size}개 이름으로 가렸다`);
for (const [k, m] of Object.entries(kinds)) {
    const mark = k === '미분류' ? (m.size === 0 ? '✅' : '🔴') : '';
    console.log(`     ${k.padEnd(7)} ${String(m.size).padStart(4)}가지 ${mark}`);
}
const un = [...kinds['미분류']].sort((a, b) => b[1] - a[1]);
if (un.length) {
    console.log('\n     🔴 미분류 — 정체를 밝혀야 할 낱말 (많은 순)');
    for (const [w, n] of un.slice(0, 25)) console.log(`       ${String(n).padStart(5)}  ${w}`);
    console.log('       ↳ 배지면 사전에, 지역이면 지도 명부에 넣는다. 0 이 되면 100% 파싱이다');
}

db.close();
