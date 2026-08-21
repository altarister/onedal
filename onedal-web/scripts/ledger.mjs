/**
 * 📖 **장부 보기** — 지금 콜이 실제로 어떻게 저장돼 있는지 한 화면에.
 *
 * 기사님(2026-08-19): *"장부에 남았는지 내가 어떻게 알지?"*
 *
 * 그동안 저장 결과를 확인하려면 매번 물어봐야 했다. 화면은 메모리를 보여주고
 * 장부는 DB 에 있어서, 둘이 갈라진 사고가 여러 번 났다 (버그 대장 #4·#6·#8·#15).
 * **눈으로 직접 볼 수 있어야 그 갈라짐을 기사님이 먼저 잡는다.**
 *
 *   cd onedal-web && pnpm ledger          오늘 콜 전부
 *   cd onedal-web && pnpm ledger 3        최근 3건만
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

// better-sqlite3 는 서버 워크스페이스에 있다 — 다른 스크립트와 같은 방식으로 부른다
const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');

const db = new Database(join(ROOT, 'server/local.db'), { readonly: true });

const LIMIT = parseInt(process.argv[2], 10) || 10;
const hhmm = (iso) => iso ? new Date(iso).toLocaleTimeString('ko-KR',
    { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

/** 출처가 곧 신뢰도다 (2026-08-19) — 직접 · 자동 · 건너뜀 */
const SOURCE_MARK = {
    MANUAL_WEB: '✍️ 직접',
    APP_BUTTON: '✍️ 직접(앱)',
    GPS: '🛰️ 자동',
    AUTO_SCRAPE: '🤖 수집',
    SKIPPED: '⏭️ 건너뜀',
};
const STEP_LABEL = {
    ARRIVED_PICKUP: '상차지 도착',
    PICKED_UP: '상차 완료',
    ARRIVED_DROPOFF: '하차지 도착',
    DELIVERED: '하차 완료',
};

const orders = db.prepare(`
    SELECT id, status, pickup, dropoff, fare, vehicleType, capturedAt
    FROM orders ORDER BY capturedAt DESC LIMIT ?
`).all(LIMIT);

if (orders.length === 0) {
    console.log('\n장부가 비어 있습니다 — 콜을 잡으면 여기에 남습니다.\n');
    process.exit(0);
}

console.log(`\n📖 장부 — 최근 ${orders.length}건 (server/local.db)\n`);

for (const o of orders.reverse()) {
    const short = (s) => (s || '').split(/\s+/).slice(2, 4).join(' ') || s;
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`${short(o.pickup)} → ${short(o.dropoff)}  ·  ${(o.fare || 0).toLocaleString()}원 ${o.vehicleType || ''}`);
    console.log(`  상태 ${o.status}   잡은 시각 ${hhmm(o.capturedAt)}   ${o.id.slice(-14)}`);

    // ── 단계 기록 — 🔄 새 장부(여섯 단계 행)에서 읽는다 (옛 테이블 철거 2026-08-21) ──
    const STEP_ROWS = [
        ['step_arrive_pickup', 'ARRIVED_PICKUP'], ['step_loaded', 'PICKED_UP'],
        ['step_arrive_dropoff', 'ARRIVED_DROPOFF'], ['step_delivered', 'DELIVERED'],
    ];
    const ms = STEP_ROWS.flatMap(([t, m]) => {
        const r = db.prepare(`SELECT status, source, occurred_at, predicted_at, reasons FROM ${t} WHERE orderId = ?`).get(o.id);
        return r?.occurred_at ? [{ milestone: m, source: r.source, occurredAt: r.occurred_at,
                                   predictedAt: r.predicted_at, reasons: r.reasons ?? null }] : [];
    }).sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
    if (ms.length) {
        console.log(`  ─ 단계`);
        for (const m of ms) {
            const err = m.predictedAt
                ? ` (예상 ${hhmm(m.predictedAt)} 대비 ${Math.round((Date.parse(m.occurredAt) - Date.parse(m.predictedAt)) / 60000)}분)`
                : '';
            // 📍 도착 사유 — 겪은 일이 여기 남는다 (2026-08-19)
            const why = m.reasons ? `  ⚠️ ${JSON.parse(m.reasons).join(' · ')}` : '';
            console.log(`     ${hhmm(m.occurredAt)}  ${(STEP_LABEL[m.milestone] || m.milestone).padEnd(12)} ${SOURCE_MARK[m.source] || m.source}${err}${why}`);
        }
    }

    // ── 통화·현장 신고 — 🔄 새 장부에서 파생 ──
    const rp = [];
    for (const [t, stopType] of [['step_call_pickup', 'pickup'], ['step_call_dropoff', 'dropoff']]) {
        const r = db.prepare(`SELECT * FROM ${t} WHERE orderId = ?`).get(o.id);
        if (r && r.status && r.status !== 'PLANNED') rp.push({
            stopType, kind: r.status === 'SKIPPED' ? 'SKIPPED' : 'DECLARED',
            unit: r.planned_unit, quantity: r.planned_quantity, handling: r.planned_handling,
            promisedArrivalFromAt: r.promised_arrival_from_at, promisedArrivalAt: r.promised_arrival_at, memo: r.memo });
    }
    for (const [t, stopType] of [['step_loaded', 'pickup'], ['step_delivered', 'dropoff']]) {
        const r = db.prepare(`SELECT * FROM ${t} WHERE orderId = ?`).get(o.id);
        if (r && r.actual_unit != null) rp.push({
            stopType, kind: 'ACTUAL', unit: r.actual_unit, quantity: r.actual_quantity,
            handling: r.actual_handling, promisedArrivalFromAt: null, promisedArrivalAt: null, memo: null });
    }
    if (rp.length) {
        console.log(`  ─ 신고`);
        for (const r of rp) {
            const stop = r.stopType === 'pickup' ? '상차' : '하차';
            const kind = r.kind === 'DECLARED' ? '통화' : r.kind === 'SKIPPED' ? '⏭️ 통화 건너뜀' : '현장';
            const cargo = [r.unit && `${r.unit} ${r.quantity ?? ''}`, r.handling].filter(Boolean).join(' · ');
            const promise = r.promisedArrivalAt
                ? (r.promisedArrivalFromAt
                    ? `${hhmm(r.promisedArrivalFromAt)}~${hhmm(r.promisedArrivalAt)} 사이`
                    : `${hhmm(r.promisedArrivalAt)}까지`)
                : '';
            console.log(`     ${stop} ${kind.padEnd(12)} ${[cargo, promise, r.memo].filter(Boolean).join('  ·  ')}`);
        }
    }
    if (!ms.length && !rp.length) console.log(`  (아직 기록 없음)`);
}

console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`\n✍️ 직접 = 기사님이 눌렀다 (실측 통계에 씀)`);
console.log(`🛰️ 자동 = GPS 도착 감지 (참고값)`);
console.log(`⏭️ 건너뜀 = 기록 없이 지나감 — 그 콜의 실측은 믿을 수 없다\n`);
db.close();
