#!/usr/bin/env node
/**
 * 도달 계수 역산 — `reach_samples` 장부를 읽어 "직선 km → 카카오 분" 모델을 맞춘다.
 *
 * ══ 왜 있는가 ══
 *
 * 앱 1차 필터는 오프라인이라 "도달 N분 안"을 직선거리 반경으로 근사해야 한다
 * (필터 확정안 v2 ②값). 잠정 계수는 1.5분/km 였는데, 실측 첫날(2026-08-21)에
 * 이미 틀린 모델임이 보였다:
 *
 *     3.8km → 17~19분   (4.5~5.0분/km)     ← 도심 단거리: 고정 오버헤드가 지배
 *     31.4km → 38분     (1.2분/km)          ← 장거리: 고속화
 *
 * 그래서 단일 계수가 아니라 **1차식**으로 본다:  소요(분) ≈ 기본분 + 분/km × 직선km
 * 역행렬 없는 단순 최소제곱. 표본이 쌓일수록 맞아 들어간다.
 *
 * 🔴 여기서 나온 값은 **보고서다** — 필터에 자동 반영되지 않는다.
 *    계수 확정(기사님)이 있어야 시간 축이 실전화된다 (기사님 확정 3:
 *    계수 확정 전엔 거르지 않고 딱지만).
 *
 * ══ 실행 ══     pnpm reach
 */
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// better-sqlite3 는 서버 워크스페이스에 있다 — 다른 스크립트와 같은 방식으로 부른다
const require = createRequire(join(ROOT, 'server/package.json'));
const Database = require('better-sqlite3');

const db = new Database(join(ROOT, 'server/local.db'), { readonly: true });
const rows = db.prepare(
    `SELECT captured_at, line_km, kakao_min FROM reach_samples ORDER BY captured_at`
).all();
db.close();

if (rows.length === 0) {
    console.log('표본이 없습니다 — 심사가 돌 때마다 서버가 reach_samples 에 남깁니다.');
    process.exit(0);
}

// ── 표본 표 ──────────────────────────────────────────────
console.log(`\n🧪 도달 계수 표본 ${rows.length}건  (원천: server/local.db reach_samples)\n`);
console.log('  잡힌 시각(KST)      직선km   카카오분   분/km');
for (const r of rows) {
    const kst = new Date(r.captured_at).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
    console.log(`  ${kst}        ${String(r.line_km).padStart(5)}   ${String(r.kakao_min).padStart(6)}   ${(r.kakao_min / r.line_km).toFixed(2)}`);
}

// ── 1차식 최소제곱: 분 = base + perKm × km ──────────────
const n = rows.length;
const xs = rows.map(r => r.line_km), ys = rows.map(r => r.kakao_min);
const xm = xs.reduce((a, b) => a + b, 0) / n;
const ym = ys.reduce((a, b) => a + b, 0) / n;
let sxy = 0, sxx = 0;
for (let i = 0; i < n; i++) { sxy += (xs[i] - xm) * (ys[i] - ym); sxx += (xs[i] - xm) ** 2; }
const perKm = sxx > 0 ? sxy / sxx : null;
const base = perKm != null ? ym - perKm * xm : null;

if (perKm == null || n < 3) {
    console.log(`\n표본 ${n}건 — 아직 맞추기엔 적습니다. 더 쌓이면 다시 돌려 보세요.`);
    process.exit(0);
}

// 산포(잔차 표준편차) — 이 모델을 믿어도 되는가의 눈금
const resid = rows.map((r, i) => ys[i] - (base + perKm * xs[i]));
const sd = Math.sqrt(resid.reduce((a, e) => a + e * e, 0) / Math.max(1, n - 2));

console.log(`\n  1차식 적합:  소요(분) ≈ ${base.toFixed(1)}분 + ${perKm.toFixed(2)}분/km × 직선km`);
console.log(`  잔차 산포 ±${sd.toFixed(1)}분 · 표본 ${n}건${n < 20 ? '  ⚠️ 20건 미만 — 참고만' : ''}`);

// ── 시계 → 반경 환산 비교 (잠정 1.5분/km vs 1차식) ──────
console.log(`\n  시계 → 직선 반경 환산  (역산: km = (분 − 기본분) ÷ 분/km)`);
console.log(`  ┌────────┬──────────────┬──────────────┐`);
console.log(`  │  시계  │ 잠정 1.5분/km │  1차식(실측)  │`);
console.log(`  ├────────┼──────────────┼──────────────┤`);
for (const min of [15, 30, 45, 60]) {
    const old = (min / 1.5).toFixed(0);
    const fit = Math.max(0, (min - base) / perKm).toFixed(1);
    console.log(`  │  ${String(min).padStart(2)}분  │  ${String(old).padStart(6)} km   │  ${String(fit).padStart(6)} km   │`);
}
console.log(`  └────────┴──────────────┴──────────────┘`);
console.log(`\n  🔴 보고서일 뿐이다 — 필터에 자동 반영되지 않는다. 계수 확정은 표본이 쌓인 뒤 기사님이 한다.\n`);
