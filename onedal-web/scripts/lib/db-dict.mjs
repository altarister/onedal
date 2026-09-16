#!/usr/bin/env node
/**
 * 📖 **배차망 낱말 사전 초안 — 장부 원문에서 뽑는다** (기사님 지시).
 *
 * 기사님: *"아이콘 낱말들을 모두 모아 카카오픽커 등 배차망 사전을 만들어, 그걸 가지고 목록을 파싱해."*
 * *"여기서 나오는 낱말은 모르는 것이 없어야 한다 — 이건 아이콘, 이건 주소, 어떤 건 아이콘으로도
 * 주소로도 쓴다… 등등."*
 *
 * ── `parse` 와 무엇이 다른가 ──
 *   `pnpm db parse`  **감사** — 앱이 화면을 제대로 읽었나. 틀어진 곳을 보여 준다
 *   `pnpm db dict`   **사전** — 그 배차망에 무슨 낱말이 있나. 서버 사전에 넣을 초안을 뽑아 준다
 * 낱말을 가르는 셈은 `wordKinds.mjs` 에 **한 벌**로 두고 둘이 나눠 쓴다 — 두 벌이면 갈라진다.
 *
 * 🔴 **판정하지 않는다 — 초안만 낸다.** 어느 칸에 넣을지는 사람이 고른다.
 * 🔴 **미분류가 0 이 되는 것이 «100% 파싱» 이다** (기사님 지시).
 *
 * 쓰기:
 *   pnpm db dict                     배차망 목록과 건수
 *   pnpm db dict kakaopicker         그 배차망의 낱말 사전
 *   pnpm db dict kakaopicker 200     최근 200건만 — 고친 뒤 확인할 때 옛 자료에 묻히지 않게
 *   DB_FILE=data.db pnpm db dict kakaopicker    라이브 DB 로
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadDict, loadRegions, collectWords, isValueShape } from './wordKinds.mjs';

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
const recent = Number(process.argv[3]) || 0;

const apps = db.prepare(`SELECT targetApp, COUNT(*) n FROM intel GROUP BY targetApp ORDER BY n DESC`).all();
if (!target) {
    console.log('📖 pnpm db dict <배차망>   — 장부 원문으로 그 배차망의 낱말 사전 초안을 뽑는다\n');
    for (const a of apps) console.log(`   ${String(a.targetApp || '(없음)').padEnd(18)} ${a.n}건`);
    process.exit(0);
}

const rows = db.prepare(
    `SELECT pickup, dropoff, itemSize, tagsText, rawText
     FROM intel WHERE targetApp = ? ORDER BY rowid`,
).all(target).slice(recent > 0 ? -recent : 0);

if (rows.length === 0) {
    console.error(`🔴 «${target}» 으로 저장된 콜이 없다. 위 목록에서 고른다.`);
    process.exit(1);
}

const { dict, dictPath, dictWords, dictSet, stripPhrases, exists } = loadDict(ROOT, target);
const { regionNames, isRegion } = loadRegions(ROOT);

console.log(`📖 «${target}» 낱말 사전 — 장부 ${rows.length}건에서 모았다${recent > 0 ? ` (최근 ${recent}건만)` : ''}\n`);

// ── ① 서버 사전에 지금 든 낱말 ──────────────────────────────────────────────
console.log('① 서버 사전에 지금 든 낱말');
if (!exists) {
    console.log(`     🔴 사전 파일이 없다: ${dictPath.replace(ROOT, '')}`);
    console.log('       ↳ 새 배차망이면 여기 나온 갈래로 파일을 새로 만든다 (아래 ⑤)');
} else {
    for (const [k, v] of Object.entries(dict)) {
        if (Array.isArray(v)) console.log(`     ${k.padEnd(18)} ${String(v.length).padStart(4)}가지`);
    }
    console.log(`     ↳ ${dictPath.replace(ROOT, '')}`);
}

// ── ② 화면에 나왔는데 사전에 없는 낱말 ────────────────────────────────────────
const { kinds, samples } = collectWords(rows, { dictWords, dictSet, stripPhrases, isRegion });
console.log(`\n② 화면에 나왔는데 사전에 없는 낱말 — 지도 명부 ${regionNames.size}개 이름으로 가렸다`);
for (const [k, m] of Object.entries(kinds)) {
    const mark = k === '미분류' ? (m.size === 0 ? '✅' : '🔴') : '';
    console.log(`     ${k.padEnd(7)} ${String(m.size).padStart(4)}가지 ${mark}`);
}
const unknown = [...kinds['미분류']].sort((a, b) => b[1] - a[1]);
if (unknown.length) {
    console.log('\n     🔴 미분류 — 이건 아이콘인가 주소인가, 정체를 밝혀야 한다 (많은 순)');
    for (const [w, n] of unknown.slice(0, 25)) {
        console.log(`       ${String(n).padStart(5)}  ${w.padEnd(14)} 예: ${(samples.get(w) || '').slice(0, 64)}`);
    }
    console.log('       ↳ 배지면 아래 ⑤ 조각을 사전에, 지역이면 지도 명부에 넣는다. 0 이 되면 100% 파싱이다');
}

// ── ③ 두 몫을 겸하는 낱말 ────────────────────────────────────────────────────
/**
 * 🔀 기사님: *"어떤 건 아이콘으로도 쓰고 주소로도 쓴다."*
 * 그런 낱말은 **어느 칸에 넣어도 한쪽이 틀린다** — 배지 목록에 넣으면 주소를 잃고,
 * 빼면 배지가 주소 칸으로 샌다. 그래서 «자리로 가르는 규칙» 이 따로 필요하다는 신호다.
 */
const inAddr = new Map();
const inBadge = new Map();
for (const r of rows) {
    for (const w of `${r.pickup || ''} ${r.dropoff || ''}`.split(/\s+/).filter(Boolean)) {
        inAddr.set(w, (inAddr.get(w) || 0) + 1);
    }
    for (const w of `${r.tagsText || ''} ${r.itemSize || ''}`.split(/\s+/).filter(Boolean)) {
        inBadge.set(w, (inBadge.get(w) || 0) + 1);
    }
}
const bothSides = [...inAddr.keys()]
    .filter((w) => inBadge.has(w) && !isValueShape(w))
    .sort((a, b) => (inBadge.get(b) + inAddr.get(b)) - (inBadge.get(a) + inAddr.get(a)));
console.log('\n③ 두 몫을 겸하는 낱말 — 배지로도 주소로도 쓰인다');
if (bothSides.length === 0) {
    console.log('     없다 ✅ — 낱말 목록만으로 갈라도 안전하다');
} else {
    console.log(`     ${'낱말'.padEnd(14)} 배지로   주소로`);
    for (const w of bothSides.slice(0, 20)) {
        console.log(`     ${w.padEnd(14)} ${String(inBadge.get(w)).padStart(5)} ${String(inAddr.get(w)).padStart(8)}`);
    }
    console.log('     ↳ 낱말 목록으로는 못 가른다 — 화면에서 «어느 자리에 있었나» 로 갈라야 한다');
}

// ── ④ 사전에 있는데 화면에 한 번도 안 나온 낱말 ───────────────────────────────
const allRaw = rows.map((r) => r.rawText || '').join('\n');
const unseen = dictWords.filter((w) => !allRaw.includes(w));
console.log('\n④ 사전에 있는데 이 자료에서 한 번도 안 나온 낱말');
if (unseen.length === 0) {
    console.log('     없다 — 사전이 전부 쓰이고 있다');
} else {
    console.log(`     ${unseen.length}가지: ${unseen.slice(0, 30).join(' · ')}`);
    console.log('     ↳ 낡았을 수도 있고, 이 자료에 그 화면이 안 담겼을 수도 있다 — 지우기 전에 확인한다');
}

// ── ⑤ 사전에 붙일 조각 ──────────────────────────────────────────────────────
console.log('\n⑤ 사전에 붙일 조각 — 어느 칸에 넣을지는 사람이 고른다');
if (unknown.length === 0) {
    console.log('     붙일 것이 없다 ✅');
} else {
    console.log(`     ${JSON.stringify(unknown.map(([w]) => w))}`);
    console.log(`     ↳ ${dictPath.replace(ROOT, '')} 의 알맞은 칸에 넣는다`);
    console.log('     🔴 앱 기본값에도 같이 넣는다 — 서버 사전에만 넣으면 통신이 끊겼을 때 갈라진다');
    console.log('        (픽커는 `pickerDictPaired.test.ts` 가 그 짝을 문다)');
}

db.close();
