#!/usr/bin/env node
/**
 * 🪞 **목업 ↔ 실물 — 같은 콜을 양쪽에 세우고 나란히 읽는다**
 *    (기사님 2026-09-11: *"너도 목업 화면과 실 프로젝트 화면을 **번갈아 봐야 해**.
 *     **같은 조건의 콜 리스트**를 만들어서 대조해."* · 계획서 §11-3).
 *
 * 🔴 **`pnpm lab` 은 목업만 본다.** 이식하는 동안 필요한 것은 «두 화면이 같은 말을 하는가»다 —
 *    코드가 아니라 **화면이 답한다**. 타이틀이 양쪽 다 같은 격자(11칸)라 **같은 잣대**로 칸을 뽑는다.
 *
 * 하는 일:
 *   ① 실물(4000)에 볼트 오전 ①② 를 앱폰처럼 올린다 (선점 → 상세 → 텔레메트리 ACK)
 *   ② 목업(/mockup/map)에서 같은 문제의 ①② 를 눌러 확정한다
 *   ③ 양쪽 격자를 칸별로 뽑아 나란히 적고, 어긋난 칸을 센다
 *
 * ⚠️ **잰 자를 함께 적는다** — 2026-09-06 에 500px 로 찍어 놓고 400px 인 줄 알고
 *    «여백이 답답하다»를 이야기했다 (`ec4bb3a`). 무엇으로 쟀는지가 없으면 또 그렇게 된다.
 *
 * 실행:  cd onedal-web && pnpm lab:both
 *        SEED=0 pnpm lab:both     # 이미 세워 둔 콜로 대조만
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const WebSocket = require('ws');
const Database = require('better-sqlite3');

const WEB = 'http://localhost:3000';
const API = 'http://localhost:4000';
const SEED = process.env.SEED !== '0';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = ms => new Promise(r => setTimeout(r, ms));
/** 📄 두 화면을 나란히 볼 수 있게 남긴다 — 글자만으로는 «모양»을 못 본다 */
const SHOT_DIR = '/tmp/onedal-lab-both';

/** 🌅 볼트 오전의 앞 두 콜 — 목업 문제지와 **같은 판**이다 (`client-app/src/pages/labProblems.ts`) */
const CALLS = [
    { pickup: '대전 서구 갈마동', dropoff: '천안시 서북구 성거읍', fare: 200000, vehicleType: '1t' },
    { pickup: '대전 유성구 문지동', dropoff: '오산시 가수동', fare: 120000, vehicleType: '1t' },
];

/* ── 크롬 ────────────────────────────────────────────── */
const PORT = 9400 + (process.pid % 300);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/onedal-lab-both', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params, ...(sessionId ? { sessionId } : {}) }));
});

const fails = [];
const ok = (name, cond, saw) => {
    console.log(`  ${cond ? '✅' : '🔴'} ${name}${saw != null ? ` — ${saw}` : ''}`);
    if (!cond) fails.push(name);
};

try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
        await wait(200);
        try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* 아직 */ }
    }
    if (!target) throw new Error('크롬이 안 떴습니다');
    ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.on('message', raw => {
        const m = JSON.parse(raw.toString());
        const p = pending.get(m.id); if (!p) return;
        pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    });

    /** 격자 11칸을 그대로 읽는다 — 양쪽 공통 잣대 */
    const GRID = `(() => {
      const rows = [...document.querySelectorAll('*')].filter(el => el.style && el.style.gridTemplateColumns
          && el.style.gridTemplateColumns.startsWith('15px') && el.children.length >= 11);
      return rows.map(r => [...r.children].map(c => (c.textContent || '').trim()));
    })()`;
    const RULER = `JSON.stringify({vw:innerWidth, vh:innerHeight, dpr:devicePixelRatio, theme:document.documentElement.className||'(기본)'})`;

    async function shotOf(tab, name) {
        mkdirSync(SHOT_DIR, { recursive: true });
        const { data } = await tab.S('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${SHOT_DIR}/${name}.png`, Buffer.from(data, 'base64'));
    }

    async function openTab() {
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        const S = (m, p) => send(m, p, sessionId);
        await S('Page.enable'); await S('Runtime.enable');
        /* 🔴 `--window-size` 는 headless 에서 뷰포트에 안 먹는다 (ec4bb3a) — 진짜로 맞춘다 */
        await S('Emulation.setDeviceMetricsOverride', { width: 400, height: 1100, deviceScaleFactor: 2, mobile: true });
        const js = async e => (await S('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.value;
        return { S, js, targetId };
    }

    console.log('🪞 목업 ↔ 실물 — 같은 콜 리스트를 나란히\n');

    /* ── 실물: 탭을 먼저 붙인다 (서버의 «관제탑 접속» 게이트) ── */
    const tok = await (await fetch(`${API}/api/auth/bypass`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json();
    const real = await openTab();
    await real.S('Page.navigate', { url: WEB }); await wait(2500);
    await real.js(`localStorage.setItem('access_token', ${JSON.stringify(tok.accessToken)}); localStorage.setItem('stagePreview','1'); 'ok'`);
    await real.S('Page.navigate', { url: WEB }); await wait(6000);

    /* ── ① 실물에 콜을 세운다 — 앱폰이 하는 왕복 그대로 ── */
    /**
     * 🔴 **이미 서 있으면 더 올리지 않는다** (2026-09-11 첫 실행에서 잡힘 — 실물 4 · 목업 2).
     *    `pnpm reset:calls` 는 **DB 만** 비운다. 돌고 있는 서버는 메모리에 콜을 쥐고 있어서,
     *    비운 줄 알고 또 올리면 **두 배가 된다.** 화면이 답하게 두고, 이미 있으면 그대로 견준다.
     *    정말 비우려면: `pnpm reset:calls` **뒤에 서버를 다시 띄운다** (감시자까지 내리고).
     */
    const already = (await real.js(GRID))?.length ?? 0;
    if (already > 0) console.log(`  ℹ️ 실물에 이미 ${already}건이 서 있습니다 — 그대로 견줍니다 (SEED 건너뜀)`);
    if (SEED && already === 0) {
        const db = new Database(join(ROOT, 'server/local.db'), { readonly: true });
        const dev = db.prepare(`SELECT device_id FROM user_devices LIMIT 1`).get();
        db.close();
        if (!dev) throw new Error('등록된 기기가 없습니다 — 관제웹에서 PIN 연동을 먼저 하세요');
        const DEVICE = dev.device_id;
        let holding = null, pendingAck = null, fv, beat = true;
        (async function heartbeat() {
            while (beat) {
                try {
                    const r = await fetch(`${API}/api/scrap`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ deviceId: DEVICE, data: [], screenContext: holding ? 'DETAIL_CONFIRMED' : 'LIST',
                            isHolding: !!holding, filterVersion: fv, ...(pendingAck ? { ackDecisionId: pendingAck } : {}) }),
                    });
                    pendingAck = null;
                    const j = await r.json();
                    if (j.filterVersion) fv = j.filterVersion;
                    if (j.decision?.orderId) { pendingAck = j.decision.orderId; if (holding === pendingAck) holding = null; }
                } catch { /* 다음 틱 */ }
                await wait(2500);
            }
        })();
        await wait(3000);
        for (const [i, c] of CALLS.entries()) {
            const oid = `BOTH-${Date.now()}-${i}`;
            const order = { id: oid, ...c, timestamp: new Date().toISOString(), itemDescription: '대조용',
                rawText: `${c.pickup} → ${c.dropoff}\n${c.fare}원` };
            const base = { deviceId: DEVICE, capturedAt: new Date().toISOString(), matchType: 'AUTO' };
            const p = (path, body) => fetch(`${API}/api/orders${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            holding = oid;
            await p('/confirm', { ...base, step: 'BASIC', order });
            await wait(600);
            await p('/detail', { ...base, step: 'DETAILED', order });
            console.log(`  📱 실물에 올림 ${i + 1}: ${c.pickup} → ${c.dropoff}`);
            await wait(15000);
        }
        beat = false;
        await wait(2500);
    }
    const realRuler = await real.js(RULER);
    const realGrid = await real.js(GRID);
    await shotOf(real, '실물');

    /* ── ② 목업: 같은 문제의 ①② 를 눌러 확정 ── */
    const mock = await openTab();
    await mock.S('Page.navigate', { url: `${WEB}/mockup/map` }); await wait(7000);
    const press = t => mock.js(`(() => { const b=[...document.querySelectorAll('button')].find(b=>b.innerText.includes(${JSON.stringify(t)})); if(!b) return '없음'; b.click(); return 'ok'; })()`);
    await press('볼트 오전'); await wait(2500);
    for (const no of [1, 2]) {
        await mock.js(`document.querySelector('[data-cycle="${no}"]')?.click()`); await wait(2600);
        if (await press('서버로 올린다') === '없음') await press('올려 보기');
        await wait(5500);
        if (await press('✅ 콜 확정') === '없음') await press('탈락이지만 확정');
        await wait(2000);
    }
    const mockRuler = await mock.js(RULER);
    const mockGrid = await mock.js(GRID);
    await shotOf(mock, '목업');

    /* ── ③ 나란히 적고 어긋난 칸을 센다 ── */
    const COLS = ['순번', '지명', '약속', '±', '예상'];
    const rowOf = cells => ({ 상: [0, 1, 2, 3, 4].map(k => cells[k] || '·'), 하: [6, 7, 8, 9, 10].map(k => cells[k] || '·') });
    const show = (name, ruler, grid) => {
        console.log(`\n━━ ${name}  📏 ${ruler}`);
        if (!grid?.length) { console.log('   (격자 줄이 없다)'); return; }
        grid.forEach((cells, i) => {
            const r = rowOf(cells);
            console.log(`   ${i + 1}) 상 ${r.상.join(' | ')}   /   하 ${r.하.join(' | ')}`);
        });
    };
    show('실물 (무대)', realRuler, realGrid);
    show('목업 (지도 실험실)', mockRuler, mockGrid);
    console.log(`\n   칸 이름: ${COLS.join(' | ')}\n`);

    console.log('🪞 대조');
    ok('양쪽에 같은 수의 콜이 섰다', realGrid?.length === mockGrid?.length, `실물 ${realGrid?.length ?? 0} · 목업 ${mockGrid?.length ?? 0}`);
    if (realGrid?.length && realGrid.length === mockGrid.length) {
        /**
         * 🔴 **시각(약속·±·예상)은 견주지 않는다** — 양쪽이 «지금»이 다른 판이라 당연히 다르다.
         *    같아야 하는 것은 **순번과 지명** 이다 — 그건 «같은 콜을 같은 순서로 본다»는 뜻이다.
         */
        for (const [i, cells] of realGrid.entries()) {
            const r = rowOf(cells), m = rowOf(mockGrid[i]);
            ok(`${i + 1}번 줄 — 순번이 같다`, r.상[0] === m.상[0] && r.하[0] === m.하[0],
                `실물 ${r.상[0]}·${r.하[0]} ↔ 목업 ${m.상[0]}·${m.하[0]}`);
            ok(`${i + 1}번 줄 — 지명이 같다`, r.상[1] === m.상[1] && r.하[1] === m.하[1],
                `실물 ${r.상[1]}→${r.하[1]} ↔ 목업 ${m.상[1]}→${m.하[1]}`);
        }
        const blanks = realGrid.flatMap(c => [c[3], c[4], c[9], c[10]]).filter(v => !v || v === '--:--').length;
        ok('실물 격자의 ±·예상 칸이 채워졌다', blanks === 0, `빈 칸 ${blanks}개`);
    }

    console.log(`\n📄 두 화면: ${SHOT_DIR}/실물.png · ${SHOT_DIR}/목업.png`);
    console.log(`${fails.length ? '🔴' : '🟢'} 대조 ${fails.length ? `실패 ${fails.length}건` : '이상 없음'}`);
    if (fails.length) process.exitCode = 1;
} catch (e) {
    console.error('🔴', e.message);
    process.exitCode = 1;
} finally {
    try { ws?.close(); } catch { /* 이미 닫힘 */ }
    chrome.kill();
}
