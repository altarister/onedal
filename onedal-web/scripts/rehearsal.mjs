#!/usr/bin/env node
/**
 * 🎭 리허설 — **앱 없이** 서버(4000) + 관제웹(3000)만으로 시뮬레이션한다.
 *
 * 기사님 (2026-08-18): *"내가 시뮬레이터 테스트하려니까 너무 오래 걸리고 재현이 어렵다.
 * localhost:3000 화면을 보고 싶은 거야. 시나리오처럼 내가 값을 넣고 수락 혹은 취소를 하는 거지."*
 *
 * 이 스크립트가 **앱폰 역할**을 한다:
 *   · 메뉴에서 고른 콜을 1차 선점(/orders/confirm) → 2차 상세(/orders/detail)로 올린다
 *   · 5초마다 텔레메트리(/api/scrap)를 보내 피기백 판결을 ACK 한다 (진짜 앱과 같은 왕복)
 *   · 올리기 전에 **앱과 같은 규칙**(경로 순서 판정)을 돌려 차단될 콜인지 먼저 알려 준다
 *
 * 기사님은 관제웹(localhost:3000)에서 카드가 뜨면 평소처럼 KEEP/CANCEL 을 누르고,
 * 출발·모의 주행·하차 완료도 관제웹에서 그대로 한다. GPS 는 관제웹 목업 주행이 담당한다.
 *
 * ⚠️ 개발 서버(4000)·local.db 에 **진짜로 기록된다** — 그게 목적이다 (관제웹에서 보이려면).
 *    끝나고 지우고 싶으면 "콜 리스트 지워줘" 하면 된다.
 *
 * 실행:  cd onedal-web && pnpm rehearsal
 */
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');

const PORT = process.env.REHEARSAL_PORT || 4000;
const BASE = `http://localhost:${PORT}`;

// ── 기기: 실제 등록된 앱폰과 다른 전용 ID 를 쓰면 미등록이라 막힌다 → DB 에서 실물을 읽는다
const db = new Database(join(ROOT, 'server/local.db'), { readonly: true });
const dev = db.prepare(`SELECT device_id FROM user_devices LIMIT 1`).get();
if (!dev) { console.error('🔴 등록된 기기가 없습니다. 관제웹에서 PIN 연동을 먼저 하세요.'); process.exit(1); }
const DEVICE = dev.device_id;

// ── 콜 재료: 지오코딩 캐시에 있는 실제 주소만 쓴다 (카카오 지오코딩 호출 없이 바로 좌표가 잡힌다)
const cached = db.prepare(`SELECT query FROM geocode_cache WHERE query LIKE '%시%' ORDER BY hit_count DESC LIMIT 200`)
    .all().map(r => r.query);
db.close();
const pick = (needle) => cached.find(q => q.includes(needle));

/** 자주 쓰는 무대 — 광주 출발 → 파주 노선 (기사님 평소 시뮬레이션과 같은 그림) */
const PRESETS = [
    { key: '1', label: '첫짐 · 광주 경안동 → 파주 금촌동 (10만/1t)',
      pickup: pick('경안동'), dropoff: pick('금촌동'), fare: 100000, vehicleType: '1t' },
    { key: '2', label: '합짐 순방향 · 광주 목현동 → 파주 문발동 (3만/다마스)',
      pickup: pick('목현동'), dropoff: pick('문발동'), fare: 30000, vehicleType: '다마스' },
    { key: '3', label: '합짐 역주행 · 파주 금촌동 → 광주 경안동 (뒤로 가는 콜 — 차단돼야 함)',
      pickup: pick('금촌동'), dropoff: pick('경안동'), fare: 90000, vehicleType: '오토바이' },
    { key: '4', label: '경로 밖 · 성남 판교 → 파주 탄현면 (목록 밖 상차 — 차단돼야 함)',
      pickup: pick('판교'), dropoff: pick('탄현면'), fare: 80000, vehicleType: '오토바이' },
];

// ── 앱과 같은 규칙 (RouteOrderFilter.check 의 JS 판) — 올리기 전에 미리 알려 준다
function routeOrderCheck(pickupText, dropoffText, progressKm) {
    const entries = Object.entries(progressKm ?? {});
    if (entries.length === 0) return { passed: true, reason: '첫짐 — 순서 검사 없음' };
    const hit = (text) => entries.filter(([k]) => text.includes(k));
    const p = hit(pickupText);
    if (p.length === 0) return { passed: false, reason: '경로 밖 — 상차지가 경유 목록에 없음' };
    const pv = p.map(([, v]) => v).filter(v => v !== null);
    const dv = hit(dropoffText).map(([, v]) => v).filter(v => v !== null);
    if (pv.length === 0) return { passed: true, reason: '상차지 순서 미상 — 통과' };
    if (dv.length === 0) return { passed: true, reason: '하차지 순서 미상 — 통과' };
    const a = Math.max(...pv), b = Math.min(...dv);
    return a <= b
        ? { passed: true, reason: `순방향 — 상차 ${a.toFixed(1)}km → 하차 ${b.toFixed(1)}km` }
        : { passed: false, reason: `역주행 — 상차 ${a.toFixed(1)}km → 하차 ${b.toFixed(1)}km (${(a - b).toFixed(1)}km 후진)` };
}

// ── 텔레메트리 루프: 앱의 5초 왕복. 심사 중엔 DETAIL_CONFIRMED 로 보고해야
//    화면 이탈 감지(devices.ts)가 우리 콜을 강제 취소하지 않는다 — 실측으로 당했다 (송정동 콜)
let holdingOrderId = null;      // 심사 대기 중인 콜 (있으면 상세 화면인 척한다)
let pendingAck = null;
let lastFilter = null;

async function telemetry() {
    try {
        const body = {
            deviceId: DEVICE,
            data: [],
            screenContext: holdingOrderId ? 'DETAIL_CONFIRMED' : 'LIST',
            isHolding: !!holdingOrderId,
            ...(pendingAck ? { ackDecisionId: pendingAck } : {}),
        };
        pendingAck = null;
        const r = await fetch(`${BASE}/api/scrap`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const j = await r.json();
        lastFilter = j.dispatchEngineArgs ?? lastFilter;
        const d = j.piggybackDecision;
        if (d?.orderId) {
            console.log(`\n📦 판결 수신: ${d.action}  (${d.orderId.slice(0, 8)}) — ACK 보냅니다`);
            pendingAck = d.orderId;
            if (holdingOrderId === d.orderId) holdingOrderId = null;
            prompt();
        }
    } catch { /* 서버가 잠깐 없어도 다음 틱에 다시 */ }
}

function showFilter() {
    const f = lastFilter;
    if (!f) { console.log('  (아직 필터 수신 전 — 잠시 후 다시)'); return; }
    const pk = f.progressKm ?? {};
    const nums = Object.values(pk).filter(v => v !== null).length;
    console.log(`  국면 ${f.dispatchPhase} · 콜잡기 ${f.isActive ? 'ON' : 'OFF'} · 경유 ${f.detourRadiusKm}km · 하차 ${f.destinationRadiusKm}km`);
    console.log(`  동 목록 ${f.destinationKeywords?.length ?? 0}개 · progressKm ${Object.keys(pk).length}개(숫자 ${nums})`);
    console.log(`  차종 [${(f.allowedVehicleTypes ?? []).join(', ') || '없음 — 만재?'}] · 적재 ${f.slotsUsed}/100박스`);
}

let seq = 0;
async function inject(t) {
    if (!t.pickup || !t.dropoff) { console.log('  🔴 이 주소가 지오코딩 캐시에 없어 건너뜁니다'); return; }

    // 앱이라면 잡았을까 — 올리기 전에 같은 규칙으로 미리 판정
    const check = routeOrderCheck(t.pickup, t.dropoff, lastFilter?.progressKm);
    console.log(`  🧭 앱 필터 판정: ${check.passed ? '✅ 통과' : '🔴 차단'} — ${check.reason}`);
    if (!check.passed) {
        const yn = await ask('  앱이라면 안 올릴 콜입니다. 그래도 올릴까요? (y/N) ');
        if (yn.trim().toLowerCase() !== 'y') { console.log('  → 올리지 않았습니다 (앱과 같은 동작)'); return; }
    }
    if (lastFilter && !lastFilter.isActive) console.log('  ⚠️ 콜 잡기가 OFF 상태입니다 — 서버가 홀드 중이거나 필터가 꺼져 있습니다');

    const id = `REHEARSAL-${Date.now()}-${++seq}`;
    const order = {
        id, pickup: t.pickup, dropoff: t.dropoff, fare: t.fare, vehicleType: t.vehicleType,
        timestamp: new Date().toISOString(), itemDescription: '리허설 콜',
    };
    const base = { deviceId: DEVICE, capturedAt: new Date().toISOString(), matchType: 'AUTO' };
    const post = (path, body) => fetch(`${BASE}/api/orders${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });

    holdingOrderId = id;                      // 지금부터 상세 화면인 척 (화면 이탈 감지 회피)
    await post('/confirm', { ...base, step: 'BASIC', order });
    await new Promise(r => setTimeout(r, 500));
    await post('/detail', { ...base, step: 'DETAILED', order });
    console.log(`  📱 올렸습니다: ${t.pickup.split(' ').slice(0, 3).join(' ')} → ${t.dropoff.split(' ').slice(0, 3).join(' ')} · ${t.fare.toLocaleString()}원`);
    console.log(`  → 관제웹(localhost:3000)에 카드가 뜹니다. 안전취소 35초 안에 KEEP/CANCEL 하세요.`);
}

// ── 대화 루프 ─────────────────────────────────────────────
const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(res => rl.question(q, res));

function menu() {
    console.log('\n──── 🎭 리허설 (앱폰 역할) ────');
    for (const p of PRESETS) console.log(`  [${p.key}] ${p.label}`);
    console.log('  [c] 직접 입력 (상차지·하차지·요금·차종)');
    console.log('  [f] 지금 필터 보기 (서버가 앱에 내려보내는 값)');
    console.log('  [q] 종료');
}
function prompt() { process.stdout.write('선택> '); }

async function main() {
    console.log(`서버 ${BASE} · 기기 ${DEVICE} (앱폰 역할)`);
    const h = await fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);
    if (!h) { console.error(`🔴 ${BASE} 응답 없음 — 서버를 먼저 띄우세요 (pnpm dev)`); process.exit(1); }
    console.log(`bootedAt ${h.bootedAt} — 관제웹은 http://localhost:3000 로 여세요\n`);

    setInterval(telemetry, 5000);
    await telemetry();
    menu();
    prompt();

    rl.on('line', async (line) => {
        const c = line.trim().toLowerCase();
        if (c === 'q') { rl.close(); process.exit(0); }
        else if (c === 'f') showFilter();
        else if (c === 'c') {
            const pickup = await ask('  상차지 주소: ');
            const dropoff = await ask('  하차지 주소: ');
            const fare = parseInt(await ask('  요금(원): '), 10) || 50000;
            const vehicleType = (await ask('  차종(1t/다마스/라보/오토바이): ')).trim() || '1t';
            await inject({ pickup: pickup.trim(), dropoff: dropoff.trim(), fare, vehicleType });
        }
        else {
            const t = PRESETS.find(p => p.key === c);
            if (t) await inject(t); else if (c) menu();
        }
        prompt();
    });
}
main();
