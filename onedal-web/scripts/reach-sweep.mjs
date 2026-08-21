#!/usr/bin/env node
/**
 * 도달 계수 스윕 — 수도권 기준점 쌍으로 (직선km ↔ 카카오분) 표본을 설계적으로 모은다.
 *
 * ══ 왜 있는가 ══
 *
 * `reach_samples` 는 원래 심사 때만 쌓인다 — 콜이 떠야 표본이 생기니 느리고,
 * 상차지 분포(대개 근거리)에 쏠린다. 계수를 확정하려면 **거리 구간을 고르게 덮은**
 * 표본이 필요하다. 서버가 쓰는 것과 같은 카카오 API(RECOMMEND · car_type 1)로
 * 기준점 쌍을 실측해 `source='sweep'` 으로 남긴다.
 *
 * ⚠️ 카카오 소요시간은 실시간 교통을 반영한다 — **돌린 시각이 표본의 시간대다.**
 *    밤에만 돌리면 낮 운행보다 빠르게 나온다. 주간(운행 시간)에도 한 번 돌릴 것.
 *    `pnpm reach` 가 주간/야간을 나눠 보여준다.
 *
 * ══ 실행 ══     pnpm reach:sweep        (카카오 호출 ~24건 · 1초 간격)
 */
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'server/package.json'));
const Database = require('better-sqlite3');

// ── 카카오 키: 서버와 같은 .env ──────────────────────────
const env = readFileSync(join(ROOT, 'server/.env'), 'utf8');
const KEY = env.match(/^KAKAO_REST_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) { console.error('🔴 server/.env 에 KAKAO_REST_API_KEY 가 없습니다'); process.exit(1); }

// ── 기준점 — 기사님 활동권(수도권)의 실제 지점들 ──────────
const ANCHORS = [
    { name: '신림역',   x: 126.9295, y: 37.4842 },
    { name: '가산',     x: 126.8825, y: 37.4817 },
    { name: '강남역',   x: 127.0276, y: 37.4979 },
    { name: '왕십리',   x: 127.0378, y: 37.5613 },
    { name: '일산백석', x: 126.7877, y: 37.6431 },
    { name: '파주금촌', x: 126.7748, y: 37.7599 },
    { name: '인천부평', x: 126.7241, y: 37.4895 },
    { name: '수원역',   x: 127.0000, y: 37.2660 },
    { name: '성남모란', x: 127.1290, y: 37.4322 },
    { name: '안양역',   x: 126.9227, y: 37.4017 },
    { name: '김포공항', x: 126.8010, y: 37.5629 },
    { name: '의정부',   x: 127.0480, y: 37.7381 },
];

const haversineKm = (y1, x1, y2, x2) => {
    const R = 6371, d = Math.PI / 180;
    const a = Math.sin((y2 - y1) * d / 2) ** 2
        + Math.cos(y1 * d) * Math.cos(y2 * d) * Math.sin((x2 - x1) * d / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── 거리 구간별로 고르게 쌍을 고른다 (구간당 최대 5쌍) ────
const BINS = [[2, 6], [6, 12], [12, 20], [20, 32], [32, 55]];
const pairs = [];
for (let i = 0; i < ANCHORS.length; i++) for (let j = 0; j < ANCHORS.length; j++) {
    if (i === j) continue;
    const km = haversineKm(ANCHORS[i].y, ANCHORS[i].x, ANCHORS[j].y, ANCHORS[j].x);
    pairs.push({ from: ANCHORS[i], to: ANCHORS[j], km });
}
const picked = [];
for (const [lo, hi] of BINS) {
    const inBin = pairs.filter(p => p.km >= lo && p.km < hi);
    // 구간 안에서 거리 순으로 고르게 — 매 실행이 같은 쌍이어도 시간대가 달라 표본 가치가 있다
    const step = Math.max(1, Math.floor(inBin.length / 5));
    for (let k = 0; k < inBin.length && picked.filter(p => p.km >= lo && p.km < hi).length < 5; k += step) {
        picked.push(inBin.sort((a, b) => a.km - b.km)[k]);
    }
}

const db = new Database(join(ROOT, 'server/local.db'));
const userId = db.prepare('SELECT id FROM users LIMIT 1').get()?.id;
if (!userId) { console.error('🔴 users 가 비어 있습니다'); process.exit(1); }
const ins = db.prepare(
    `INSERT INTO reach_samples (user_id, captured_at, line_km, kakao_min, source) VALUES (?, ?, ?, ?, 'sweep')`);

console.log(`\n🧪 도달 계수 스윕 — ${picked.length}쌍 실측 (RECOMMEND · car_type 1 · 지금 교통)\n`);
let ok = 0;
for (const p of picked) {
    const url = `https://apis-navi.kakaomobility.com/v1/directions`
        + `?origin=${p.from.x},${p.from.y}&destination=${p.to.x},${p.to.y}&priority=RECOMMEND&car_type=1`;
    try {
        const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KEY}` } });
        const data = await res.json();
        const route = data.routes?.[0];
        if (!route || route.result_code !== 0) {
            console.log(`  ✗ ${p.from.name} → ${p.to.name}  (${p.km.toFixed(1)}km)  경로 없음`);
            continue;
        }
        const min = Math.round(route.summary.duration / 60);
        ins.run(userId, new Date().toISOString(), Number(p.km.toFixed(2)), min);
        ok++;
        console.log(`  ✓ ${p.from.name} → ${p.to.name}  직선 ${p.km.toFixed(1)}km → ${min}분  (${(min / p.km).toFixed(2)}분/km)`);
    } catch (e) {
        console.log(`  ✗ ${p.from.name} → ${p.to.name}  실패: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
}
db.close();
console.log(`\n표본 ${ok}건 저장 (source='sweep'). 역산: pnpm reach\n`);
