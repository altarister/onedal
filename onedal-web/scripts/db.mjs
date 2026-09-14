#!/usr/bin/env node
/**
 * 📖 **DB 보기 — 입구 하나, 무엇을 볼지는 인자로** (기사님 지시 2026-09-14).
 *
 * 기사님: *"보는 도구는 하나로 합하고 거기에 인자로 넘겨서 보고 싶은 걸 볼 수 있게 하면 될 것 같은데"*
 *
 * 🔴 **요청마다 하나씩 만들다 보니 DB 를 보는 명령이 셋으로 자랐다** — `ledger`(08-19) ·
 *    `options`(08-20) · `track`(08-29). 셋 다 `server/local.db` 를 읽기만 한다.
 *    그래서 입구를 하나로 모으고, 알맹이는 `scripts/lib/db-*.mjs` 에 그대로 둔다.
 *
 * 🔴 **DB 에서 새로 볼 것이 생기면 새 명령을 만들지 않는다** — `lib/db-<이름>.mjs` 를 두고
 *    아래 `VIEWS` 에 한 줄 더한다. 그리고 `onedal-web/CLAUDE.md` 스크립트 표의 인자 칸도 고친다.
 *
 * ⚠️ **읽기만 한다.** 지우는 도구(`reset:calls`)는 여기에 넣지 않는다 —
 *    보려다 지우는 사고를 막으려고 일부러 따로 둔다.
 *
 * 쓰기:
 *   pnpm db                      볼 수 있는 것 목록
 *   pnpm db ledger [건수]         콜별 단계와 출처 (직접·자동·건너뜀)
 *   pnpm db options [갈래]        콜 옵션 선택지와 값
 *   pnpm db track [콜 id 앞부분]   GPS 궤적 — 점·끊긴 구간·상하차지 근접 (DB_FILE=data.db 로 라이브 DB)
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const VIEWS = {
    ledger:  { file: 'lib/db-ledger.mjs',  args: '[건수]',          what: '콜별 단계와 출처 (직접·자동·건너뜀) — 화면(메모리)과 장부(DB)가 갈렸나' },
    options: { file: 'lib/db-options.mjs', args: '[갈래]',          what: '콜 옵션 선택지와 값 — 단위 환산·상하차 분·보호 시간' },
    track:   { file: 'lib/db-track.mjs',   args: '[콜 id 앞부분]',   what: 'GPS 궤적 — 콜별 점 수·끊긴 구간·상하차지 최접근' },
};

const [name, ...rest] = process.argv.slice(2);

if (!name || !VIEWS[name]) {
    if (name) console.error(`🔴 모르는 보기: ${name}\n`);
    console.log('📖 pnpm db <보기> [인자]   — server/local.db 를 읽기만 한다\n');
    for (const [k, v] of Object.entries(VIEWS)) {
        console.log(`   pnpm db ${(k + ' ' + v.args).padEnd(24)} ${v.what}`);
    }
    console.log('\n   라이브 DB 를 보려면 앞에 DB_FILE=data.db (track 만 받는다)');
    process.exit(name ? 1 : 0);
}

const r = spawnSync(process.execPath, [join(HERE, VIEWS[name].file), ...rest], { stdio: 'inherit', env: process.env });
process.exit(r.status ?? 1);
