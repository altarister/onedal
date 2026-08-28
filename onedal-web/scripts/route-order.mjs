/**
 * 🧭 **경로 순서를 재어 본다** — 「상차 먼저」 vs 「지나가는 길목부터」
 *
 * 2026-08-25 에 기사님 실측으로 **도착 계획**(`planArrivalStops`)이 «지나가는 길목부터»로
 * 바뀌었다 — *"기사님 위치에서 곤지암 하차 4.0km · 가남 29.9km 인데 순서가
 * ⑴가남상차 ⑵가남하차 ⑶세종대왕면하차 ⑷곤지암하차(94분) 로 나왔다"*.
 *
 * 그런데 **실제 카카오 요청**(`planMergedStops`)은 아직 «상차 전부 먼저»다.
 * 두 계획이 갈라져 있고, 그래서 2026-08-29 에 구간 주행분이 남의 이름에 붙는 결함이
 * 나왔다 (버그 대장 #60). 이름표는 고쳤지만 **어느 순서로 달릴 것인가**는 남았다.
 *
 * 🔴 **경로를 바꾸는 일은 숫자를 보고 정한다** (규칙 ⑤-4). 이 도구가 그 숫자다 —
 *    장부의 실제 콜 조합으로 두 순서의 **직선 총주행**을 재어 나란히 놓는다.
 *
 *   cd onedal-web && pnpm route:order          로컬 장부(local.db)
 *   cd onedal-web && DB_FILE=data.db pnpm route:order    라이브 (ssh onedal-live 안에서)
 *
 * ⚠️ **직선거리다.** 카카오 실주행과 다르다 — 순서의 «방향»을 보는 도구이지
 *    분 단위를 확정하는 도구가 아니다. 뒤집힌 조합이 나오면 그때 카카오로 확인한다.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');
const DB_FILE = process.env.DB_FILE || 'local.db';
const db = new Database(join(ROOT, 'server', DB_FILE), { readonly: true });

const R = 6371, rad = Math.PI / 180;
const km = (y1, x1, y2, x2) => {
    const a = Math.sin((y2 - y1) * rad / 2) ** 2
        + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin((x2 - x1) * rad / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
};
const path = (start, stops) => {
    let here = start, total = 0;
    for (const s of stops) { total += km(here.y, here.x, s.y, s.x); here = s; }
    return total;
};

/** 지금 코드 — 상차 전부 먼저, 각각 최근접 (optimizeWaypoints) */
function orderPickupsFirst(start, pickups, dropoffs) {
    const near = (from, pool) => {
        const out = []; let here = from; const p = [...pool];
        while (p.length) {
            let bi = 0, bd = Infinity;
            p.forEach((s, i) => { const d = km(here.y, here.x, s.y, s.x); if (d < bd) { bd = d; bi = i; } });
            const best = p.splice(bi, 1)[0]; out.push(best); here = best;
        }
        return out;
    };
    const sp = near(start, pickups);
    return [...sp, ...near(sp[sp.length - 1] ?? start, dropoffs)];
}

/** 도착 계획 — 한 통에 넣고 최근접. 제 짐을 싣기 전엔 못 내린다 */
function orderNearestMixed(start, pickups, dropoffs) {
    const pool = [...pickups, ...dropoffs];
    const notLoaded = new Set(pickups.map(s => s.orderId));
    const out = []; let here = start;
    while (pool.length) {
        let bi = -1, bd = Infinity;
        pool.forEach((s, i) => {
            if (s.stopType === 'dropoff' && notLoaded.has(s.orderId)) return;
            const d = km(here.y, here.x, s.y, s.x); if (d < bd) { bd = d; bi = i; }
        });
        if (bi === -1) { out.push(...pool); break; }
        const best = pool.splice(bi, 1)[0];
        if (best.stopType === 'pickup') notLoaded.delete(best.orderId);
        out.push(best); here = best;
    }
    return out;
}

// ── 장부에서 «함께 실렸던» 콜 묶음을 찾는다 (같은 날 진행 중이던 것들) ──
const rows = db.prepare(`
    SELECT o.id, o.status, o.pickup, o.dropoff, o.capturedAt,
           pp.x px, pp.y py, dp.x dx, dp.y dy
    FROM orders o
    LEFT JOIN orderStops ps ON ps.orderId = o.id AND ps.stopType = 'pickup'
    LEFT JOIN places pp ON ps.placeId = pp.id
    LEFT JOIN orderStops ds ON ds.orderId = o.id AND ds.stopType = 'dropoff'
    LEFT JOIN places dp ON ds.placeId = dp.id
    WHERE pp.x IS NOT NULL AND dp.x IS NOT NULL
    ORDER BY o.capturedAt
`).all();

if (rows.length === 0) {
    console.log(`\n좌표가 있는 콜이 없습니다 (server/${DB_FILE}). 주행을 한 번 하고 다시 부르세요.\n`);
    process.exit(0);
}

// 같은 날 + 2시간 안에 잡힌 것끼리 한 묶음 — «함께 싣고 있었을» 조합의 근사
const groups = [];
for (const r of rows) {
    const t = Date.parse(r.capturedAt ?? '');
    const g = groups[groups.length - 1];
    if (g && Math.abs(t - g.t) < 2 * 3600e3) { g.calls.push(r); g.t = t; }
    else groups.push({ t, calls: [r] });
}
const multi = groups.filter(g => g.calls.length >= 2);

console.log(`\n🧭 경로 순서 비교 — 「상차 먼저」(지금) vs 「지나가는 길목부터」  (server/${DB_FILE})`);
console.log(`   좌표 있는 콜 ${rows.length}건 · 2건 이상 묶인 조합 ${multi.length}개\n`);

if (multi.length === 0) {
    console.log('   함께 실린 조합이 없어 비교할 것이 없습니다 — 합짐 주행이 쌓이면 다시 부르세요.\n');
    process.exit(0);
}

let winA = 0, winB = 0, same = 0, sumDiff = 0;
for (const g of multi) {
    const start = { x: g.calls[0].px, y: g.calls[0].py };   // 첫 상차지를 기점으로
    const pickups = g.calls.map(c => ({ x: c.px, y: c.py, orderId: c.id, stopType: 'pickup' }));
    const dropoffs = g.calls.map(c => ({ x: c.dx, y: c.dy, orderId: c.id, stopType: 'dropoff' }));

    const a = path(start, orderPickupsFirst(start, pickups, dropoffs));
    const b = path(start, orderNearestMixed(start, pickups, dropoffs));
    const diff = a - b;
    sumDiff += diff;
    if (Math.abs(diff) < 0.05) same++; else if (diff > 0) winB++; else winA++;

    const mark = Math.abs(diff) < 0.05 ? '  =' : diff > 0 ? ' 🟢' : ' 🔴';
    const short = (s) => (s || '').split(/\s+/).slice(1, 3).join(' ');
    console.log(`${mark} ${g.calls.length}콜  상차먼저 ${a.toFixed(1)}km · 길목부터 ${b.toFixed(1)}km` +
        `  (차이 ${diff >= 0 ? '−' : '+'}${Math.abs(diff).toFixed(1)}km)`);
    console.log(`      ${g.calls.map(c => `${short(c.pickup)}→${short(c.dropoff)}`).join(' · ')}`);
}

console.log(`\n   🟢 길목부터가 짧음 ${winB}개 · 🔴 상차먼저가 짧음 ${winA}개 · 같음 ${same}개`);
console.log(`   합계 차이 ${sumDiff >= 0 ? '길목부터가 ' + sumDiff.toFixed(1) + 'km 짧다' : '상차먼저가 ' + (-sumDiff).toFixed(1) + 'km 짧다'}`);
console.log(`\n   ⚠️ 직선거리다 — 방향만 본다. 뒤집힌 조합은 카카오로 다시 잰다.\n`);
