/**
 * 🛰️ **궤적 보기** — 쌓이기만 하던 `gps_tracks` 를 눈으로 본다.
 *
 * 2026-08-28 «궤적에 콜이 붙는가» 확인에 EC2 에 들어가 node -e 를 손으로 짰다.
 * 그날 손으로 한 질문들이 그대로 이 도구다 —
 *   · 어느 콜에 몇 점이 붙었나 (콜별 요약)
 *   · 점이 끊긴 구간이 있나 (5분+ 공백 = 폰이 좌표를 안 보낸 것 — 저장 조건이
 *     «50m 또는 15초»라 폰이 살아 있으면 정차 중에도 점이 온다)
 *   · 상차지·하차지에 실제로 얼마나 가까이 갔나 (도착 감지 500m 의 검증 재료)
 *
 *   cd onedal-web && pnpm track              콜별 요약 + 미부착 점 수
 *   cd onedal-web && pnpm track 75feff35     «이 콜의 궤적» 상세 (id 앞부분)
 *
 * 라이브에서: ssh onedal-live 후 서버 폴더에서 DB_FILE=data.db 로 같은 명령.
 * (서버와 같은 규칙 — DB_FILE 이 없으면 local.db)
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');

const DB_FILE = process.env.DB_FILE || 'local.db';
const db = new Database(join(ROOT, 'server', DB_FILE), { readonly: true });

// 공백 문턱 — gpsTrackStore.GPS_TRACK.GAP_ALERT_MS 와 같은 값 (mjs 라 import 불가)
const GAP_ALERT_MS = 5 * 60_000;

// timeZone 을 못박는다 — EC2 는 TZ 가 UTC 라 이게 없으면 9시간 어긋난 시각이 찍힌다 (실측)
const kst = (ms) => new Date(ms).toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Seoul',
});
const short = (s) => (s || '').split(/\s+/).slice(0, 4).join(' ') || '—';

const haversineKm = (y1, x1, y2, x2) => {
    const R = 6371, d = Math.PI / 180;
    const a = Math.sin((y2 - y1) * d / 2) ** 2
        + Math.cos(y1 * d) * Math.cos(y2 * d) * Math.sin((x2 - x1) * d / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const arg = (process.argv[2] || '').trim();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 요약 — 어느 콜에 궤적이 붙었나
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if (!arg) {
    const total = db.prepare('SELECT COUNT(*) c FROM gps_tracks').get().c;
    const orphan = db.prepare('SELECT COUNT(*) c FROM gps_tracks WHERE order_id IS NULL').get().c;
    console.log(`\n🛰️ 궤적 — 전체 ${total.toLocaleString()}점 · 콜 미부착 ${orphan.toLocaleString()}점 (server/${DB_FILE})\n`);

    const segs = db.prepare(`
        SELECT order_id id, COUNT(*) n, MIN(at_ms) a, MAX(at_ms) b,
               SUM(CASE WHEN stop_type='pickup'  THEN 1 ELSE 0 END) pu,
               SUM(CASE WHEN stop_type='dropoff' THEN 1 ELSE 0 END) doff
        FROM gps_tracks WHERE order_id IS NOT NULL GROUP BY order_id ORDER BY a
    `).all();
    if (segs.length === 0) {
        console.log('궤적이 붙은 콜이 없습니다 — 콜을 실은 채 주행하면 여기 남습니다.\n');
        process.exit(0);
    }
    for (const s of segs) {
        const o = db.prepare('SELECT status, pickup, dropoff, fare FROM orders WHERE id = ?').get(s.id);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`${s.id.slice(0, 8)}  ${o ? `${short(o.pickup)} → ${short(o.dropoff)} · ${(o.fare || 0).toLocaleString()}원` : '(orders 에 없음)'}`);
        console.log(`  ${o?.status ?? '—'}   ${s.n}점 (상차행 ${s.pu} · 하차행 ${s.doff})   ${kst(s.a)} ~ ${kst(s.b)}`);
    }
    console.log(`\n상세: pnpm track <id 앞부분>\n`);
    process.exit(0);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상세 — «이 콜의 궤적»
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const matches = db.prepare('SELECT * FROM orders WHERE id LIKE ? LIMIT 2').all(`${arg}%`);
if (matches.length === 0) { console.log(`\n'${arg}' 로 시작하는 콜이 없습니다.\n`); process.exit(1); }
if (matches.length > 1) { console.log(`\n'${arg}' 가 겹칩니다 — 더 길게 주세요.\n`); process.exit(1); }
const o = matches[0];

const pts = db.prepare(
    'SELECT at_ms, x, y, source, speed_kmh, stop_type FROM gps_tracks WHERE order_id = ? ORDER BY at_ms'
).all(o.id);

console.log(`\n🛰️ ${o.id.slice(0, 8)}  ${short(o.pickup)} → ${short(o.dropoff)} · ${(o.fare || 0).toLocaleString()}원`);
console.log(`   상태 ${o.status} · 잡은 시각 ${o.capturedAt ?? '—'}`);

if (pts.length === 0) { console.log('\n   이 콜에 붙은 궤적이 없습니다.\n'); process.exit(0); }

const pu = pts.filter(p => p.stop_type === 'pickup').length;
const doff = pts.filter(p => p.stop_type === 'dropoff').length;
console.log(`\n   ${pts.length}점 · ${kst(pts[0].at_ms)} ~ ${kst(pts[pts.length - 1].at_ms)} · 상차행 ${pu} · 하차행 ${doff}`);

// 공백 — 폰이 좌표를 안 보낸 구간
const gaps = [];
for (let i = 1; i < pts.length; i++) {
    const d = pts[i].at_ms - pts[i - 1].at_ms;
    if (d >= GAP_ALERT_MS) gaps.push({ a: pts[i - 1].at_ms, b: pts[i].at_ms, min: Math.round(d / 60_000) });
}
console.log(`\n   ⏚ 5분+ 공백 ${gaps.length}회` + (gaps.length
    ? ' — 폰이 좌표를 안 보낸 구간 (배터리 최적화 의심)\n' +
      gaps.map(g => `      ${kst(g.a)} ~ ${kst(g.b)} (${g.min}분)`).join('\n')
    : ''));

// 상하차지 최접근 — 도착 감지(500m)가 발화할 수 있었나
const stops = db.prepare(`
    SELECT s.stopType, p.x, p.y FROM orderStops s
    LEFT JOIN places p ON s.placeId = p.id WHERE s.orderId = ?
`).all(o.id);
for (const st of stops) {
    if (st.x == null || st.y == null) { console.log(`   📍 ${st.stopType}: 좌표 없음`); continue; }
    let best = { d: Infinity, at: 0 };
    for (const p of pts) {
        const d = haversineKm(p.y, p.x, st.y, st.x);
        if (d < best.d) best = { d, at: p.at_ms };
    }
    const label = st.stopType === 'pickup' ? '상차지' : '하차지';
    const near = best.d <= 0.5 ? '✅ 500m 이내 진입' : '⚠️ 500m 밖 — 도착 감지가 발화할 수 없었다';
    console.log(`   📍 ${label} 최접근 ${best.d.toFixed(2)}km @ ${kst(best.at)}  ${near}`);
}
console.log('');
