/**
 * 🎛️ **콜 옵션 보기** — 화면의 선택지와 그 값이 지금 얼마인지 한 화면에.
 *
 * 기사님(2026-08-20): *"db 를 터미널에서 보려니 너무 복잡하다."*
 *
 * `pnpm ledger` 가 **콜이 어떻게 저장됐나**를 보여준다면, 이건 **그 계산의 재료**를 본다.
 * 화면 값이 이상할 때 가장 먼저 확인할 자리다 — 단위 환산·상하차 분·보호 시간이
 * 여기서 나오기 때문이다.
 *
 *   cd onedal-web && pnpm options          전부
 *   cd onedal-web && pnpm options unit     한 갈래만
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');
const db = new Database(join(ROOT, 'server/local.db'), { readonly: true });

const only = (process.argv[2] || '').toLowerCase();

const GROUPS = [
    ['unit',       '📦 짐 단위',       '박스로 환산하면 얼마인가'],
    ['vehicle',    '🚚 차종',          '정원과 통화 전에 미리 눌러 둘 짐'],
    ['handling',   '⏱️  상하차 방법',   '박스 하나에 몇 분인가'],
    ['protection', '🔒 보호 (상차)',   '묶고 덮는 데 드는 시간'],
    ['afterwork',  '🧹 후작업 (하차)', '내린 뒤에 하는 일'],
    ['tag',        '🏷️  짐 성질',      '동승 가능 여부·취급 주의'],
    ['timing',     '🕒 시간 규칙',     '약속을 만드는 값'],
];

const rows = db.prepare(`SELECT * FROM call_options ORDER BY category, sort_order`).all();
if (rows.length === 0) {
    console.log('\n  옵션이 비어 있습니다 — 서버를 한 번 띄워 로그인하면 채워집니다.\n');
    process.exit(0);
}

const num = (v) => v == null ? '—' : (Number.isInteger(v) ? String(v) : v.toFixed(2));

console.log(`\n🎛️  콜 옵션 (${rows.length}건)`);
console.log(`   ⚠️  아직 화면·판정은 이 표를 안 읽습니다 — 코드 상수로 돌고 있습니다\n`);

for (const [cat, title, hint] of GROUPS) {
    if (only && only !== cat) continue;
    const list = rows.filter(r => r.category === cat);
    if (!list.length) continue;

    console.log(`${title}  \x1b[90m${hint}\x1b[0m`);
    for (const r of list) {
        const mark = r.is_default ? '\x1b[33m✓\x1b[0m' : ' ';
        const off  = r.enabled ? '' : ' \x1b[90m(숨김)\x1b[0m';
        const name = (r.label || r.key).padEnd(12);

        // 갈래마다 num1·num2 의 뜻이 다르다 (shared/src/callOptions.ts 의 표)
        let value;
        if (cat === 'handling')      value = `${num(r.num2)} ${r.unit_label}`;
        else if (cat === 'vehicle')  value = `${num(r.num1)} 박스 → ${r.ref_key} ${num(r.num2)}개`;
        else if (cat === 'tag')      value = '';
        else                         value = `${num(r.num1)} ${r.unit_label}`;

        console.log(`   ${mark} ${name}${value.padEnd(26)}${off}\x1b[90m${r.why}\x1b[0m`);
    }
    console.log('');
}

console.log(`\x1b[90m   ✓ 는 통화 시트에서 미리 눌려 있는 것 · pnpm options unit 처럼 갈래만 볼 수 있습니다\x1b[0m\n`);
