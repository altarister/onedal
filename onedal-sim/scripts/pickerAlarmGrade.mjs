#!/usr/bin/env node
/**
 * 🔔 **픽커 알람 채점기** — «판정 순간 폰이 가진 필터라면 이 콜이 울려야 했나»를 다시 계산해 원달앱의 판정과 맞춰 본다
 * (기사님 2026-09-14 · 카카오픽커_시뮬레이터.md 3단계 3-2 · 3-3).
 *
 * 기사님: *"서버는 수시로 바뀔 수 있어 그리고 콜은 내 맘대로 나오는 것이 아냐 … 서버는 서버대로 문제는 문제대로 했을 때
 *        정답이 계속 바뀌고 그 정답이 맞는가를 확인하면 어때?"*
 *
 *   node onedal-sim/scripts/pickerAlarmGrade.mjs                       # 연결된 폰의 오늘 원달앱 로그를 받아 채점
 *   node onedal-sim/scripts/pickerAlarmGrade.mjs --since 14:50         # 이 시각 이후 판정만
 *   node onedal-sim/scripts/pickerAlarmGrade.mjs <로그파일>             # 저장된 로그
 *
 * 읽는 줄 (원달앱 `KakaoPickerParser.shouldClick`):
 *   🧾 [알람 필터] {"minFare":…,"pickupRadiusKm":…,"destKeywords":[…],"keywordTraps":{…},"cityAliases":[…]}   ← 필터가 바뀔 때만
 *   🔔 [알람 판정] 3000원·픽업 4.2km·도착 이천 창전 — 하한 …·반경 …km·도착목표 N개 → 통과 · 축 요금✅ 상차✅ 도착✅
 *
 * 결과가 어긋나면 고칠 곳이 갈린다:
 *   - 채점기 축 ≠ 앱 축 → **원달앱 판정**이 필터를 잘못 적용했다 (앱을 고친다)
 *   - 둘은 같은데 기사님이 원한 결과가 아니다 → **서버 필터**(계산 방식·값)를 기사님이 정한다 — 채점기는 «왜»(어느 축)만 보인다
 *
 * 🔴 **일부러 두 벌이다** — 아래 `decideAxes` · `regionHit` · `normalizeRegion` 은 원달앱 `KakaoPickerParser.decideAxes` ·
 *    `RegionMatch.hit` · `normalizeRegion` 을 **옮겨 적은 것**이다. 채점기가 앱 코드를 부르면 앱이 틀려도 채점이 같이 틀린다.
 *    앱 규칙을 바꾸면 여기도 바꾼다 — 안 바꾸면 채점이 빨간불로 알린다.
 * 종료 코드: 어긋난 판정이 하나라도 있으면 1.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const sinceIdx = args.indexOf('--since');
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && (sinceIdx < 0 || i !== sinceIdx + 1));

// ── 원달앱 규칙을 옮겨 적은 것 (위 «일부러 두 벌») ──

/** `RegionMatch.hit` — 키워드 뒤에 트랩 꼬리나 구·시·군이 붙으면 그 자리는 다른 곳이다 */
function regionHit(text, keyword, traps = []) {
    if (!keyword) return false;
    const tails = traps.filter(t => t.length > keyword.length && t.startsWith(keyword)).map(t => t.slice(keyword.length));
    let i = text.indexOf(keyword);
    while (i !== -1) {
        const rest = text.slice(i + keyword.length);
        const trapped = tails.some(t => rest.startsWith(t)) || (rest.length > 0 && '구시군'.includes(rest[0]));
        if (!trapped) return true;
        i = text.indexOf(keyword, i + 1);
    }
    return false;
}

/** `KakaoPickerParser.normalizeRegion` — «동»·«구»를 떼고 꼬리 숫자를 뗀다 */
const normalizeRegion = s => s.replace(/동$/, '').replace(/구$/, '').replace(/\d+$/, '');

/** `dongTokenMatch` — 줄임 표기(«창전»)와 키워드(«창전동»)를 토큰 단위로 */
function dongTokenMatch(dropoff, keys) {
    const normKeys = new Set(keys.map(normalizeRegion).filter(k => k.length >= 2));
    return dropoff.split(' ').map(t => normalizeRegion(t.trim())).some(t => t.length >= 2 && normKeys.has(t));
}

/** `KakaoPickerParser.decideAxes` */
function decideAxes({ fare, pickupKm, dropoff }, f) {
    const fareOk = fare >= f.minFare;
    const pickupOk = pickupKm == null || pickupKm <= f.pickupRadiusKm;
    const keys = f.destKeywords ?? [];
    const destOk = keys.length === 0 || dropoff === '' ||
        keys.some(k => regionHit(dropoff, k, (f.keywordTraps ?? {})[k] ?? [])) ||
        dongTokenMatch(dropoff, [...keys, ...(f.cityAliases ?? [])]);
    return { fare: fareOk, pickup: pickupOk, destination: destOk, pass: fareOk && pickupOk && destOk };
}

// ── 로그 ──

function logFromPhone() {
    const serial = process.env.ANDROID_SERIAL ? ['-s', process.env.ANDROID_SERIAL] : [];
    const d = new Date();
    const name = `1dal-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.log`;
    const out = `/tmp/${name}`;
    execFileSync('adb', [...serial, 'pull', `/sdcard/Android/data/com.onedal.app/files/logs/${name}`, out], { stdio: 'ignore' });
    return out;
}

const DECISION = /(\d\d:\d\d:\d\d)\.\d+ .*🔔 \[알람 판정\] (\d+)원·픽업 ([\d.]+|\?)km·도착 (.*?) — .*→ (통과|탈락)(?: · 축 요금(✅|❌) 상차(✅|❌) 도착(✅|❌))?/;
const FILTER = /(\d\d:\d\d:\d\d)\.\d+ .*🧾 \[알람 필터\] (\{.*\})\s*$/;
const mark = b => (b ? '✅' : '❌');

const path = file ?? logFromPhone();
if (!existsSync(path)) { console.error(`로그가 없다: ${path}`); process.exit(2); }

let filter = null;
const rows = [];
let noFilter = 0;
for (const line of readFileSync(path, 'utf8').split('\n')) {
    const fm = FILTER.exec(line);
    if (fm) { try { filter = JSON.parse(fm[2]); } catch { /* 깨진 줄은 건너뛴다 */ } continue; }
    const dm = DECISION.exec(line);
    if (!dm) continue;
    const [, at, fare, km, dropoffRaw, verdict, aFare, aPickup, aDest] = dm;
    if (since && at < since) continue;
    if (!filter) { noFilter++; continue; }
    const call = { fare: Number(fare), pickupKm: km === '?' ? null : Number(km), dropoff: dropoffRaw === '?' ? '' : dropoffRaw };
    const want = decideAxes(call, filter);
    const app = { pass: verdict === '통과', fare: aFare ? aFare === '✅' : null, pickup: aPickup ? aPickup === '✅' : null, destination: aDest ? aDest === '✅' : null };
    const axesSame = app.fare === null || (app.fare === want.fare && app.pickup === want.pickup && app.destination === want.destination);
    rows.push({ at, call, want, app, ok: want.pass === app.pass && axesSame });
}

console.log(`🔔 픽커 알람 채점 — ${file ? path : '연결된 폰의 오늘 로그'}${since ? ` · ${since} 이후` : ''}`);
if (noFilter) console.log(`⚠️ 필터 줄(🧾 [알람 필터])보다 앞선 판정 ${noFilter}건은 채점하지 않았다 — 그때 폰의 필터를 모른다`);
console.log('\n시각      요금     픽업km  도착               정답(요금·상차·도착)  앱          ');
for (const r of rows) {
    const why = `${mark(r.want.fare)}${mark(r.want.pickup)}${mark(r.want.destination)}`;
    const appAxes = r.app.fare === null ? '   ' : `${mark(r.app.fare)}${mark(r.app.pickup)}${mark(r.app.destination)}`;
    console.log(`${r.at}  ${String(r.call.fare).padStart(7)}  ${String(r.call.pickupKm ?? '?').padStart(6)}  ${r.call.dropoff.padEnd(16).slice(0, 16)}  ${r.want.pass ? '울림' : '안 울림'} ${why}      ${r.app.pass ? '울림' : '안 울림'} ${appAxes}  ${r.ok ? '' : '🔴 어긋남'}`);
}
const bad = rows.filter(r => !r.ok);
console.log(`\n판정 ${rows.length}건 · 어긋남 ${bad.length}건`);
process.exit(bad.length ? 1 : 0);
