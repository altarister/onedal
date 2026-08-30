#!/usr/bin/env node
/**
 * 🧹 **리허설 전 자리 정리 — 앞 판의 잔재를 전부 찾아 비운다** (기사님 요청 2026-08-29)
 *
 * 기사님: *"리허설 하기 전에 체크해야 하는 거 모두 찾아 리셋하게 만들어"*
 *
 * ══ 왜 필요한가 ══
 *
 * 2026-08-29 에 같은 실패를 **세 번** 했다 — 콜을 비우고 시작했는데 차가 안 움직이거나,
 * 출발하자마자 «목적지 도달»로 끝났다. 매번 원인이 달랐다:
 *
 *   1판  앞 판의 주행이 이어져 **289/290 지점**에서 시작 → 한 걸음 만에 끝
 *   2판  15배속이라 근접 예고(3km) → 도착이 **6초** → 합짐을 올릴 틈이 없었다
 *   3판  브라우저가 **신둔 근처(280/281)** 를 들고 있어 출발 즉시 도착
 *
 * 🔴 **`pnpm reset:calls` 는 콜만 비운다.** 상태가 사는 곳은 넷인데 하나만 지운 것이다.
 *
 * ══ 상태가 사는 곳 넷 ══
 *
 * | | 무엇 | 어디 | 어떻게 비우나 |
 * |---|---|---|---|
 * | ① | 콜·단계 행 | `local.db` | `reset-calls.mjs` |
 * | ② | 세션의 콜·현위치·국면 | **서버 프로세스 메모리** | 서버 재기동 (감시자를 깨운다) |
 * | ③ | 주행 상태(`isDriving`) | 서버 `activeFilter.dispatchPhase` | ②와 함께 사라진다 |
 * | ④ | 시뮬레이터 진척도·마지막 좌표 | **브라우저 메모리** | 🔴 **새로고침뿐** — 여기서 못 지운다 |
 * | ⑤ | **떠도는 시험 스크립트** · **포트를 쥔 옛 서버** | 다른 프로세스 | 찾아서 알려준다 (지우진 않는다) |
 *
 * ④ 는 서버가 손댈 수 없다. 그래서 이 도구는 **비우고 나서 «새로고침 하세요» 라고 말한다.**
 * 말만 하지 않고 ①②③ 이 실제로 비었는지 **확인해서 보여 준다.**
 *
 * ══ 실행 ══
 *     cd onedal-web && pnpm preflight
 */
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { restartServer } from './lib/restartServer.mjs';
import { strayScripts, portListeners, startedAt } from './lib/strays.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const Database = require('better-sqlite3');
const BASE = `http://localhost:${process.env.PREFLIGHT_PORT || 4000}`;

const say = m => console.log(m);
const ok = (m, d = '') => say(`  ✅ ${m}${d ? `  ${d}` : ''}`);
const bad = (m, d = '') => say(`  🔴 ${m}${d ? `  ${d}` : ''}`);

const health = () => fetch(`${BASE}/api/health`).then(r => r.json()).catch(() => null);

async function main() {
    say('\n🧹 리허설 전 자리 정리\n');

    /**
     * ── ⓪ 떠도는 것부터 (2026-08-29 사고 뒤 신설) ──────
     *
     * 🔴 이 검사가 없어서 하루를 날렸다. 13:48 에 백그라운드로 띄운 `pnpm rehearsal` 이
     *    2시간 20분째 살아서 실폰과 **같은 기기 ID** 로 신호를 보냈고, 서버는 그걸
     *    *"리스트에서 콜이 사라졌다"* 로 읽어 **심사 0.8초 만에 강제 취소**했다.
     *    기사님 눈에는 «콜을 못 잡는다» 로만 보였다.
     *
     * 🔴 같은 날 옛 서버가 **4000 을 쥔 채** 살아 있어 새 서버가 못 올라왔다.
     *    `bootedAt` 은 «옛 서버가 잘 대답한다»고 말할 뿐이라 **혼자서는 못 잡는다.**
     *
     * → **자리를 깔기 전에 판을 어지럽히는 것부터 치운다.** 죽이진 않는다 —
     *   무엇을 죽일지는 사람이 정한다 (지우는 것은 손으로 · 규칙).
     */
    say('── ⓪ 떠도는 것 (판을 어지럽히는 것부터)');
    const strays = strayScripts();
    if (strays.length) {
        bad(`시험 스크립트 ${strays.length}개가 아직 돌고 있습니다`);
        for (const p of strays) say(`     PID ${p.pid}  ${p.name}  (${startedAt(p.pid)})`);
        say('     🔴 실폰과 **같은 기기 ID** 로 신호를 보냅니다 — 심사 콜이 강제 취소됩니다.');
        say(`     👉  kill -9 ${strays.map(p => p.pid).join(' ')}`);
    } else {
        ok('떠도는 시험 스크립트 없음');
    }

    const listeners = portListeners(new URL(BASE).port || 4000);
    if (listeners.length > 1) {
        bad(`4000 을 ${listeners.length}개가 듣고 있습니다 — 옛 서버가 안 죽었습니다`);
        for (const pid of listeners) say(`     PID ${pid}  (${startedAt(pid)})`);
        say('     🔴 새 코드가 안 돕니다. 옛 것을 내려야 새 서버가 포트를 잡습니다.');
        say(`     👉  lsof -tiTCP:4000 -sTCP:LISTEN | xargs kill -9   그리고 pnpm dev`);
    } else if (listeners.length === 1) {
        ok('4000 을 듣는 것은 하나', `PID ${listeners[0]}`);
    } else {
        bad('4000 을 듣는 것이 없습니다 — 서버가 안 떠 있습니다 (pnpm dev)');
    }

    // ── ① 서버가 살아 있나 ────────────────────────────
    const h0 = await health();
    if (!h0) {
        bad(`${BASE} 응답 없음 — 서버를 먼저 띄우세요 (pnpm dev)`);
        process.exit(1);
    }
    ok('서버 응답', `bootedAt ${h0.bootedAt}`);

    // ── ② 콜을 비운다 ────────────────────────────────
    say('\n── ① 장부의 콜');
    try {
        const out = execSync('node scripts/reset-calls.mjs', { cwd: ROOT, encoding: 'utf8' });
        const last = out.trim().split('\n').filter(Boolean).pop();
        ok('장부 정리', last?.replace(/^[✅🧹]\s*/, '') ?? '');
    } catch (e) {
        bad('장부 정리 실패', String(e.message).split('\n')[0]);
    }

    // ── ③ 세션 메모리를 비운다 (서버 재기동) ──────────
    say('\n── ② 세션 메모리 (콜·현위치·국면)');
    say('     🔴 콜을 지워도 **세션에 남은 콜과 현위치는 안 지워진다.**');
    say('        2026-08-22 에 지워진 콜 6건이 4시간 40분 동안 화면에 유령으로 남았다 (버그 대장 #40).');
    const r = await restartServer({ base: BASE, entry: join(ROOT, 'server/src/index.ts'), log: m => say(`   ${m.trim()}`) });
    if (!r.restarted) {
        bad('재기동을 확인하지 못했습니다 — 세션에 옛 콜이 남아 있을 수 있습니다');
        say('     서버를 직접 다시 띄운 뒤(pnpm dev) 다시 실행하세요.\n');
        process.exit(1);
    }

    // ── ④ 비었는지 확인한다 ──────────────────────────
    say('\n── ③ 정말 비었나 (말만 하지 않고 확인한다)');
    const db = new Database(join(ROOT, 'server/local.db'), { readonly: true });
    const ordersLeft = db.prepare(`SELECT COUNT(*) c FROM orders`).get().c;
    const trackPoints = db.prepare(`SELECT COUNT(*) c FROM gps_tracks`).get().c;
    const home = db.prepare(`SELECT home_address, home_x, home_y FROM user_settings
                             WHERE home_x IS NOT NULL AND home_x != 0 LIMIT 1`).get();
    const deviceCount = db.prepare(`SELECT COUNT(*) c FROM user_devices`).get().c;
    db.close();

    (ordersLeft === 0 ? ok : bad)('장부의 콜', `${ordersLeft}건`);
    ok('궤적', `${trackPoints}점 (지우지 않는다 — 지난 주행 기록이다)`);
    (deviceCount > 0 ? ok : bad)('등록된 기기', `${deviceCount}대${deviceCount ? '' : ' — 관제웹에서 PIN 연동이 필요합니다'}`);
    if (home) ok('설정의 집', `${home.home_address} (${home.home_x.toFixed(4)}, ${home.home_y.toFixed(4)})`);
    else bad('설정의 집이 비어 있다 — 접근 주행·복귀 계산이 통째로 안 섭니다');

    const h1 = await health();
    ok('서버 재기동 확인', `bootedAt ${h1.bootedAt}`);

    // ── ⑤ 브라우저는 서버가 못 지운다 ────────────────
    say('\n── ④ 🔴 브라우저 (여기서 못 지운다)');
    say('     시뮬레이터의 **진척도와 마지막 좌표**는 브라우저 메모리에 산다.');
    say('     안 지우면 앞 판이 끝난 자리에서 이어 달려 **출발하자마자 «목적지 도달»** 이 된다');
    say('     (2026-08-29 에 세 번 그랬다 — 289/290 · 280/281 지점에서 시작).');
    say('');
    say('     👉 브라우저에서 **⌘+Shift+R** 로 새로고침하세요.');
    say('        주소도 함께 확인:  http://localhost:3000/?speed=1');
    say('          speed=1  1배속 (기본 15배속은 3km 를 6초에 지난다 — 판단할 틈이 없다)');
    say('          ?autokeep=1 이 붙어 있으면 **빼세요** (자동 결재가 켜집니다)');
    say('');
    say('     🔴 **탭은 하나만 남기세요.** 2026-08-29 에 관제웹이 두 개 붙어 로그가 두 벌로');
    say('        찍혔고, 어느 화면이 진짜인지 가릴 수 없었습니다.');

    say('\n' + '─'.repeat(52));
    say('✅ 서버 쪽 정리 끝 — 새로고침만 하시면 시작할 수 있습니다\n');
}

main().catch(e => { console.error(`\n🔴 ${e.message}\n`); process.exit(1); });
