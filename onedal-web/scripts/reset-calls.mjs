#!/usr/bin/env node
/**
 * 🧹 **콜만 비운다** — 깨끗한 상태에서 시뮬레이션을 다시 시작할 때.
 *
 * 기사님(2026-08-24): *"서버에 콜리스트와 로그를 리셋해줘. 아님 로컬 서버 pnpm dev 할 때
 * 옵션으로 만들어줘."* → `pnpm dev:fresh` 가 이걸 먼저 돌리고 서버를 띄운다.
 *
 * 🔴 **콜의 생애만 지운다. 설정·필터·장소·좌표캐시는 남긴다.**
 *    매번 필터를 다시 맞추거나 카카오를 다시 부르면 시뮬이 느려지고 돈이 든다.
 *    (지우는 것은 손으로·의도적으로 — 루트 CLAUDE.md. 그래서 부팅 경로가 아니라 이 스크립트다.)
 *
 * 🔴 **local.db 에만 한다.** 실서버 data.db 는 손대지 않는다. DB_FILE 이 data.db 면 막는다.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
// better-sqlite3 는 서버 워크스페이스에 있다 — 다른 스크립트(ledger.mjs 등)와 같은 방식.
const require = createRequire(join(__dirname, '..', 'server/index.js'));
const Database = require('better-sqlite3');
const dbFile = process.env.DB_FILE || 'local.db';

if (dbFile.includes('data.db')) {
  console.error('🛑 [리셋 거부] DB_FILE 이 실서버(data.db) 입니다 — 콜을 지우지 않습니다.');
  process.exit(1);
}

const dbPath = join(__dirname, '..', 'server', dbFile);
if (!existsSync(dbPath)) {
  console.log(`ℹ️  ${dbFile} 이 아직 없습니다 — 지울 콜이 없습니다 (서버가 처음 뜨면 만들어집니다).`);
  process.exit(0);
}

// 콜의 생애에 속하는 표만. 설정(user_settings)·필터(user_filters·user_filter_phases)·
// 장소(places)·좌표캐시(geocode_cache)는 건드리지 않는다.
const CALL_TABLES = [
  'orders',
  'intel',
  'order_judgments',
  'orderStops',
  'step_call_pickup',
  'step_arrive_pickup',
  'step_loaded',
  'step_call_dropoff',
  'step_arrive_dropoff',
  'step_delivered',
  'cancel_budget_resets',
];

const db = new Database(dbPath);
const existing = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
);

let total = 0;
const wipe = db.transaction(() => {
  for (const t of CALL_TABLES) {
    if (!existing.has(t)) continue;
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    if (n > 0) {
      db.prepare(`DELETE FROM ${t}`).run();
      console.log(`  🧹 ${t.padEnd(22)} ${n} 건 지움`);
      total += n;
    }
  }
});
wipe();
db.close();

console.log(total > 0
  ? `✅ 콜 ${total} 건을 비웠습니다 (${dbFile}). 설정·필터·좌표캐시는 그대로입니다.`
  : `✅ 이미 비어 있습니다 (${dbFile}).`);
