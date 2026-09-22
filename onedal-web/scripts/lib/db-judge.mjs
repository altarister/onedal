/**
 * 📖 **판정 전수 보기** — DB 에 쌓인 실전 판정 스냅샷을 한눈에 대조·분석.
 * 누가: `pnpm db judge` 가 부른다
 * 언제: 판정 결과를 전수로 볼 때
 * 어디서: cd onedal-web && pnpm db judge [건수]
 * 무엇을: DB 의 판정 스냅샷을 한눈에 대조한다
 * 왜: 판정 색이 왜 그렇게 나왔는지는 숫자로 봐야 한다
 * (잡는 것 · 못 잡는 것 · 검수는 onedal-web/CLAUDE.md 스크립트 표)
 *
 *
 *   cd onedal-web && pnpm db judge           최근 15건
 *   cd onedal-web && pnpm db judge 50        최근 50건
 *   DB_FILE=../log/1dal-주행로그-20260903/raw/data.db pnpm db judge
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');

const dbFile = process.env.DB_FILE || join(ROOT, 'server/local.db');
let db;
try {
    db = new Database(dbFile, { readonly: true });
} catch (e) {
    console.error(`🔴 DB 열기 실패: ${dbFile} — ${e.message}`);
    process.exit(1);
}

const LIMIT = parseInt(process.argv[2], 10) || 15;
const hhmm = (iso) => iso ? new Date(iso).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

const COLOR_EMOJI = { '꿀': '🔵', '보통': '🟢', '똥': '🟡', '사고': '🔴' };

const judgments = db.prepare(`
    SELECT j.orderId, j.userId, j.color, j.score, j.detail, j.judgedAt,
           o.pickup, o.dropoff, o.fare, o.vehicleType, o.distanceKm, o.totalDistanceKm, o.totalDurationMin
    FROM order_judgments j
    LEFT JOIN orders o ON j.orderId = o.id
    ORDER BY j.judgedAt DESC LIMIT ?
`).all(LIMIT);

if (judgments.length === 0) {
    console.log(`\n판정 장부가 비어 있습니다 (${dbFile})\n`);
    process.exit(0);
}

console.log(`\n⚖️ 판정 장부 — 최근 ${judgments.length}건 (${dbFile})\n`);

// 통계 요약
const tally = { '꿀': 0, '보통': 0, '똥': 0, '사고': 0 };
let over120Count = 0;

for (const row of judgments) {
    tally[row.color] = (tally[row.color] || 0) + 1;
    try {
        const d = JSON.parse(row.detail);
        if (d.extraMin && d.extraMin >= 120) over120Count++;
    } catch {}
}

console.log(`📊 색상 분포: 🔵 꿀 ${tally['꿀']}건 · 🟢 보통 ${tally['보통']}건 · 🟡 똥 ${tally['똥']}건 · 🔴 사고 ${tally['사고']}건` +
    (over120Count > 0 ? ` (⚠️ 우회 120분 이상: ${over120Count}건)` : ''));
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

for (const row of judgments.reverse()) {
    let detail = {};
    try { detail = JSON.parse(row.detail); } catch {}
    const axes = detail.axes || [];
    const tags = detail.tags || [];
    const emoji = COLOR_EMOJI[row.color] || '⚪';

    const short = (s) => (s || '').split(/\s+/).slice(1, 3).join(' ') || s || '주소 미상';
    const fareMan = row.fare ? `${(row.fare / 10000).toFixed(1)}만` : '—';
    const extraMin = detail.extraMin ? `+${detail.extraMin}분` : '';

    console.log(`${emoji} [${row.color}] ${row.score != null ? row.score + '점' : '점수없음'}  │  ${short(row.pickup)} → ${short(row.dropoff)}  ·  ${fareMan} (${row.vehicleType || '차종미상'}) ${extraMin}  [${hhmm(row.judgedAt)}]`);

    // 5대 축 요약 출력
    const axesLine = axes.map(a => {
        const sc = a.score != null ? `${a.score}점` : '—';
        return `${a.name}: ${sc}(${a.raw || ''})`;
    }).join('  |  ');
    if (axesLine) {
        console.log(`   └─ 🎯 ${axesLine}`);
    }

    if (tags.length > 0) {
        console.log(`   └─ 🏷️ 딱지: ${tags.join(' · ')}`);
    }

    if (detail.stops && Array.isArray(detail.stops) && detail.stops.length > 0) {
        const lateInfo = detail.stops
            .filter(s => s.lateMin && s.lateMin > 0)
            .map(s => `${s.name} ${s.lateMin}분 지연`);
        if (lateInfo.length > 0) {
            console.log(`   └─ ⚠️ 지연 정거장: ${lateInfo.join(' · ')}`);
        }
    }
    console.log(`────────────────────────────────────────────────────────────────────────────────────────`);
}

console.log(`\n💡 특정 DB 파일로 검사하려면: DB_FILE=/path/to/data.db pnpm db judge\n`);
