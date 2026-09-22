#!/usr/bin/env node
/**
 * 📸 **화면을 찍는다** — 목업과 실물을 같은 폭으로 찍어 **눈으로 대조**하는 자리.
 *
 * 기사님 (2026-09-05, 반나절을 헛돈 뒤): *"목업에 잘 만들어져 있는 걸 네가 잘 보지
 * 않고 안 가져오는 거 아니야?"* — 맞았다. 나는 **코드만 읽고** 옮기고 있었다.
 * 화면을 못 보니 «옮겼다»의 판정을 검사 초록불로 했고, 실제로는 안 도는 것을
 * 됐다고 보고했다.
 *
 * 🔴 **로그인을 우회한다** — 실물(`/`)은 토큰이 없으면 로그인 화면만 나온다.
 *    `/api/auth/bypass`(개발용 문)로 받은 토큰을 `localStorage` 에 심고 연다.
 *    ⚠️ 그래서 **로컬에서만** 쓴다 — 주소가 localhost 가 아니면 멈춘다.
 *
 * 쓰기:
 *   node scripts/shot.mjs '/mockup/sheet?step=12' /tmp/a.png
 *   node scripts/shot.mjs '/' /tmp/b.png          ← 실물 (로그인 우회)
 *   WIDTH=393 HEIGHT=852 node scripts/shot.mjs …  ← 폰 크기를 바꿔 본다
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const WebSocket = require('ws');

const PATHNAME = process.argv[2] ?? '/';
const OUT = process.argv[3] ?? '/tmp/shot.png';
const WIDTH = Number(process.env.WIDTH ?? 400);
const HEIGHT = Number(process.env.HEIGHT ?? 880);
const WEB = process.env.WEB ?? 'http://localhost:3000';
const API = process.env.API ?? 'http://localhost:4000';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!WEB.includes('localhost')) { console.error('🔴 로컬에서만 씁니다'); process.exit(1); }

/** 개발용 우회 로그인 — 실물 화면을 열려면 토큰이 있어야 한다 */
async function devToken() {
    try {
        const r = await fetch(`${API}/api/auth/bypass`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        const d = await r.json();
        return d.accessToken ?? d.token ?? null;
    } catch { return null; }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 🔌 크롬 조종 포트 — 루트 README.md 「포트」 표의 자리 (lab 과 안 겹치게 9600~9899) */
const PORT = 9600 + (process.pid % 300);
const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--window-size=${WIDTH},${HEIGHT}`,
    '--user-data-dir=/tmp/onedal-shot-profile', 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
});

try {
    // 크롬이 뜰 때까지
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
        await sleep(200);
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            target = list.find(t => t.type === 'page');
        } catch { /* 아직 */ }
    }
    if (!target) throw new Error('크롬이 안 떴습니다');

    ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
    ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
    });

    await send('Page.enable');
    await send('Runtime.enable');
    /**
     * 📏 **폰 폭을 실제로 강제한다** (2026-09-05 정정).
     *
     * 🔴 `--window-size` 는 **창** 크기라 headless 에서 뷰포트에 안 먹는다 —
     *    그래서 그날 찍은 것이 전부 **500px** 였고, 목업만 `max-w-[400px]` 덕에
     *    400 으로 보였다. **비교가 공정하지 않았다.**
     * 🟢 `Emulation.setDeviceMetricsOverride` 라야 뷰포트가 진짜로 바뀐다.
     */
    await send('Emulation.setDeviceMetricsOverride', {
        width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: true,
    });

    /* 🔴 토큰은 **그 origin 에서** 심어야 한다 — 먼저 관제웹을 한 번 연다 */
    const token = await devToken();
    await send('Page.navigate', { url: `${WEB}/login` });
    await sleep(1200);
    if (token) {
        await send('Runtime.evaluate', {
            expression: `localStorage.setItem('access_token', ${JSON.stringify(token)})`,
        });
    }
    /**
     * 🎭 **새 화면(무대)은 아직 토글 뒤에 있다** — 끄고 켜는 것이 `localStorage` 한 칸이다.
     *    `STAGE=0` 이면 옛 화면을 찍는다 (둘을 나란히 볼 때 쓴다).
     */
    await send('Runtime.evaluate', {
        expression: `localStorage.setItem('stagePreview', ${JSON.stringify(process.env.STAGE ?? '1')})`,
    });

    await send('Page.navigate', { url: `${WEB}${PATHNAME}` });
    await sleep(Number(process.env.WAIT ?? 5000));

    /**
     * 🖐️ **눌러 보고 찍는다** — `CLICK='[data-sheet-handle]' CLICKS=2`
     *    시트를 「다」까지 올려야 보이는 것(펼친 카드·단계 시트)이 있다.
     */
    if (process.env.CLICK) {
        for (let i = 0; i < Number(process.env.CLICKS ?? 1); i++) {
            await send('Runtime.evaluate', {
                expression: `document.querySelector(${JSON.stringify(process.env.CLICK)})?.click()`,
            });
            await sleep(600);
        }
        await sleep(Number(process.env.AFTER_CLICK ?? 1200));
    }

    /**
     * 📏 **재 본다** — `EVAL='…'` 로 화면의 실제 치수를 물어본다.
     *    «화면 밖으로 나간다» 류는 **눈으로 못 고른다** — 부모 사슬의 높이를 재야 안다.
     */
    if (process.env.EVAL) {
        const r = await send('Runtime.evaluate', {
            /* ⏳ Promise 를 돌려주면 기다린다 — 눌러 보고 재는 식이 대부분 비동기다 */
            expression: process.env.EVAL, returnByValue: true, awaitPromise: true,
        });
        console.log(typeof r.result?.value === 'string'
            ? r.result.value : JSON.stringify(r.result?.value, null, 2));
    }

    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(OUT, Buffer.from(data, 'base64'));
    console.log(`📸 ${OUT}  (${WIDTH}×${HEIGHT})  ${PATHNAME}${token ? '  · 로그인됨' : '  · 토큰 없음'}`);
} finally {
    ws?.close();
    chrome.kill();
}
