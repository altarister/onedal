#!/usr/bin/env node
/**
 * 🔔 **픽커 알람 채점기** — «판정 순간 폰이 가진 필터라면 이 콜이 울려야 했나»를 다시 계산해 원달앱의 판정과 맞춰 본다
 * (기사님 2026-09-14 · 카카오픽커_시뮬레이터.md 3단계 3-2 · 3-3).
 *
 * 기사님: *"서버는 수시로 바뀔 수 있어 그리고 콜은 내 맘대로 나오는 것이 아냐 … 서버는 서버대로 문제는 문제대로 했을 때
 *        정답이 계속 바뀌고 그 정답이 맞는가를 확인하면 어때?"*
 *
 *   npx tsx onedal-sim/scripts/pickerAlarmGrade.mjs                    # 연결된 폰의 오늘 원달앱 로그를 받아 채점
 *   npx tsx onedal-sim/scripts/pickerAlarmGrade.mjs --since 14:50      # 이 시각 이후 판정만
 *   npx tsx onedal-sim/scripts/pickerAlarmGrade.mjs <로그파일>          # 저장된 로그
 *   (tsx 로 돈다 — 지역 대조를 shared regionMatch.ts 에서 가져온다)
 *
 * 읽는 줄 (원달앱 `KakaoPickerParser.shouldClick`):
 *   🧾 [알람 필터] {"minFare":…,"pickupRadiusKm":…,"destKeywords":[…],"keywordTraps":{…},"cityAliases":[…]}   ← 필터가 바뀔 때만
 *   🔔 [알람 판정] 3000원·픽업 4.2km·도착 이천 창전·예약 없음 — 하한 …·반경 …km·도착목표 N개 → 통과 · 축 요금✅ 상차✅ 도착✅ 예약✅
 *
 * 결과가 어긋나면 고칠 곳이 갈린다:
 *   - 채점기 축 ≠ 앱 축 → **원달앱 판정**이 필터를 잘못 적용했다 (앱을 고친다)
 *   - 둘은 같은데 기사님이 원한 결과가 아니다 → **서버 필터**(계산 방식·값)를 기사님이 정한다 — 채점기는 «왜»(어느 축)만 보인다
 *
 * 🔴 **앱 코드를 부르지 않는다** — 채점기가 앱 코드를 부르면 앱이 틀려도 채점이 같이 틀린다.
 *    지역 대조(키워드 · 트랩 · 이름이 같은 다른 지역 동)는 **원본 규칙** shared `regionMatch.ts` 를 가져다 쓴다 — 앱 `RegionMatch` 는
 *    이 원본의 미러라, 앱이 원본과 어긋나면 채점이 어긋남으로 알린다(사본을 두면 원본이 바뀔 때 채점기만 낡는다 · 04 리뷰).
 *    `decideAxes` · `normalizeRegion` · `dongTokenMatch`(픽커 줄임 토막 — 앱 전용 규칙)는 옮겨 적은 것이다 — 앱 규칙을 바꾸면 여기도 바꾼다.
 * 종료 코드: 어긋난 판정이 하나라도 있으면 1.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
/* shared 는 CommonJS 로 읽힌다 — 기본 가져오기로 받는다 */
import regionMatch from '../../onedal-web/shared/src/regionMatch.ts';
import sigungu from '../../onedal-web/shared/src/sigungu.ts';
const { anyRegionHit } = regionMatch;
const { sigunguHintBefore } = sigungu;

const args = process.argv.slice(2);
const sinceIdx = args.indexOf('--since');
const since = sinceIdx >= 0 ? args[sinceIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith('--') && (sinceIdx < 0 || i !== sinceIdx + 1));

// ── 원달앱 규칙을 옮겨 적은 것 (픽커 전용 · 지역 대조 원본은 shared regionMatch) ──

/** `KakaoPickerParser.normalizeRegion` — «동»·«구»를 떼고 꼬리 숫자를 뗀다 */
const normalizeRegion = s => s.replace(/동$/, '').replace(/구$/, '').replace(/\d+$/, '');

/**
 * `dongTokenMatch` — 줄임 표기(«창전»)와 키워드(«창전동»)를 토큰 단위로.
 * 🏘️ 이름이 같은 다른 지역 동: 맞은 토막 앞에 다른 시·군·구(«평택 고덕»의 «평택»)가 보이면 그 토막은 다른 곳 — 앞 토막 판단은 shared sigunguHintBefore.
 */
function dongTokenMatch(dropoff, keys, dongSigungu = {}) {
    const tokens = dropoff.split(' ').map(t => t.trim()).filter(Boolean);
    return keys.some(k => {
        const nk = normalizeRegion(k);
        if (nk.length < 2) return false;
        const forms = dongSigungu[k];
        return tokens.some((t, j) => {
            if (normalizeRegion(t) !== nk) return false;
            if (!forms?.length) return true;
            const hint = sigunguHintBefore(tokens.slice(0, j).join(' '));
            return hint == null || forms.includes(hint);
        });
    });
}

/** `ReservationGate.passesList` — 목록에서는 확실한 다른 날만 막는다 (날 모름 = day null) */
function reservationPassesList(day, reserved, mode) {
    if (mode === 'tomorrowToo') return day == null || day <= 1;
    if (mode === 'tomorrowOnly') return (reserved && day == null) || day === 1;
    return day == null || day <= 0;
}

/** `ReservationGate.wordOf` 의 낱말 → { reserved, day } */
function reservationFromWord(w) {
    if (w == null || w === '없음') return { reserved: false, day: null };
    if (w === '날 모름') return { reserved: true, day: null };
    if (w === '오늘') return { reserved: true, day: 0 };
    if (w === '내일') return { reserved: true, day: 1 };
    const n = /^(\d+)일 뒤$/.exec(w);
    return { reserved: true, day: n ? Number(n[1]) : null };
}

/** `KakaoPickerParser.decideAxes` */
function decideAxes({ fare, pickupKm, dropoff, reserved = false, day = null }, f) {
    const reservationOk = reservationPassesList(day, reserved, f.reservationMode ?? 'today');
    const fareOk = fare >= f.minFare;
    /* 📅 `pickupRadiusFor` — 내일 이후 예약 콜은 줄이지 않은 기본 반경(칸 없으면 지금 반경) */
    const radius = reserved && day != null && day >= 1 ? (f.reservedPickupRadiusKm ?? f.pickupRadiusKm) : f.pickupRadiusKm;
    const pickupOk = pickupKm != null && pickupKm <= radius;   // 상차지거리는 목록 완독 칸 — 모르면 통과 아님
    const keys = f.destKeywords ?? [];
    const destOk = keys.length === 0 || dropoff === '' ||
        /* 🏘️ 이름이 같은 다른 지역 동 — 폰 로그의 필터 줄이 dongSigungu 를 실어야 채점에 든다(04 · 없으면 칸 없이 = 지금과 같음) */
        anyRegionHit(dropoff, keys, f.keywordTraps ?? {}, f.dongSigungu) ||
        dongTokenMatch(dropoff, [...keys, ...(f.cityAliases ?? [])], f.dongSigungu ?? {});
    return { fare: fareOk, pickup: pickupOk, destination: destOk, reservation: reservationOk, pass: reservationOk && fareOk && pickupOk && destOk };
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

const DECISION = /(\d\d:\d\d:\d\d)\.\d+ .*🔔 \[알람 판정\] (\d+)원·픽업 ([\d.]+|\?)km·도착 (.*?)(?:·예약 (없음|날 모름|오늘|내일|\d+일 뒤))? — .*→ (통과|탈락)(?: · 축 요금(✅|❌) 상차(✅|❌) 도착(✅|❌)(?: 예약(✅|❌))?)?/;
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
    const [, at, fare, km, dropoffRaw, resWord, verdict, aFare, aPickup, aDest, aRes] = dm;
    if (since && at < since) continue;
    if (!filter) { noFilter++; continue; }
    const call = { fare: Number(fare), pickupKm: km === '?' ? null : Number(km), dropoff: dropoffRaw === '?' ? '' : dropoffRaw, ...reservationFromWord(resWord) };
    const want = decideAxes(call, filter);
    const app = { pass: verdict === '통과', fare: aFare ? aFare === '✅' : null, pickup: aPickup ? aPickup === '✅' : null, destination: aDest ? aDest === '✅' : null };
    const resSame = aRes == null || (aRes === '✅') === want.reservation;
    const axesSame = app.fare === null || (app.fare === want.fare && app.pickup === want.pickup && app.destination === want.destination && resSame);
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
