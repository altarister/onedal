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
import { existsSync, readFileSync } from 'node:fs';

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
    `SELECT timestamp, device_id, targetApp, pickup, dropoff, fare, itemSize, pickupDistanceKm, tagsText, rawText
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
const dictPath = join(ROOT, 'server/config', `keywords_${target === 'kakaopicker' ? 'picker' : target}.json`);
let dictWords = [];
if (existsSync(dictPath)) {
    const d = JSON.parse(readFileSync(dictPath, 'utf8'));
    dictWords = Object.values(d).filter(Array.isArray).flat().filter((w) => typeof w === 'string');
}
/** 여러 낱말짜리를 먼저 뗀다 — «최종 수익» 을 조각내면 «최종»·«수익» 이 미분류로 잘못 뜬다 */
const phrases = dictWords.filter((w) => w.includes(' ')).sort((a, b) => b.length - a.length);
const stripPhrases = (t) => phrases.reduce((acc, p) => acc.split(p).join(' '), t);
const dictSet = new Set(dictWords);

/**
 * 🗺️ **지도 명부로 지역을 가린다** — 이름을 어림잡지 않는다.
 * 명부는 «서현동» 처럼 온전한 꼴인데 카드는 «서현1» 로 줄여 주므로,
 * 양쪽에서 끝의 «동·읍·면·리·가·구·시·군» 과 숫자를 떼고 맞춘다.
 */
const MAP_PATH = join(ROOT, 'server/mapData/merged_map.geojson');
const regionNames = new Set();
const bare = (s) => s.replace(/(동|읍|면|리|가|구|시|군)$/, '').replace(/\d+$/, '');
if (existsSync(MAP_PATH)) {
    const geo = JSON.parse(readFileSync(MAP_PATH, 'utf8'));
    for (const f of geo.features || []) {
        const pr = f.properties || {};
        for (const key of ['EMD_KOR_NM', 'name']) {
            const v = pr[key];
            if (typeof v === 'string' && v.trim()) { regionNames.add(v.trim()); regionNames.add(bare(v.trim())); }
        }
        const sig = pr.SIG_KOR_NM;
        if (typeof sig === 'string') for (const part of sig.split(/\s+/)) { regionNames.add(part); regionNames.add(bare(part)); }
    }
}
const isRegion = (w) => regionNames.has(w) || regionNames.has(bare(w));
/**
 * 🏪 가게·건물 이름의 모양 — «…점» · «[용인둔전]» · «맘스터치-성남점» · «…로12번길» · 여섯 글자 넘는 이름.
 *
 * 🔴 **사전의 `shopWords` 는 여기서만 쓴다 — 앱에는 넣지 않는다.**
 *    가게 이름은 도보 콜의 **진짜 픽업지**라 앱은 그것을 지역 칸에 담아야 맞다.
 *    이 칸은 감사가 «미분류» 와 «가게·건물» 을 가리는 용도일 뿐이다
 *    (그래서 `pickerDictPaired` 의 짝 검사 목록에도 넣지 않는다).
 */
const isPlace = (w) => /점$|[[\]]|-|로\d+번길$|아파트$|빌라$|타워$|센터$/.test(w) || w.length >= 6;

const kinds = { 지역: new Map(), '가게·건물': new Map(), 미분류: new Map() };
for (const r of rows) {
    if (!r.rawText) continue;
    const taken = new Set(
        `${r.pickup || ''} ${r.dropoff || ''} ${r.tagsText || ''} ${r.itemSize || ''}`.split(/\s+/).filter(Boolean),
    );
    for (const tok of stripPhrases(r.rawText).split(/\s+/)) {
        const t = tok.trim().replace(/,$/, '');
        if (!t || taken.has(t) || dictSet.has(t)) continue;
        if (/^[\d,.]+$/.test(t)) continue;                      // 요금·숫자
        if (/^\d+(\.\d+)?(km|m)$/.test(t)) continue;            // 거리
        if (/^\d{1,2}:\d{2}$/.test(t)) continue;                // 시각
        if (/^\d+분( 내)?$/.test(t)) continue;                   // 남은 시간
        if (/^\d{1,2}\/\d{1,2}\([월화수목금토일]\)$/.test(t)) continue;   // 예약 날짜
        if (dictWords.some((w) => w.length >= 2 && t.includes(w))) continue;   // 사전 낱말이 든 덩어리
        const kind = isRegion(t) ? '지역' : isPlace(t) ? '가게·건물' : '미분류';
        kinds[kind].set(t, (kinds[kind].get(t) || 0) + 1);
    }
}
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
