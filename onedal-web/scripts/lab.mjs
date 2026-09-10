#!/usr/bin/env node
/**
 * 🧪 **지도 실험실 콜 문제** — 화면을 **실제로 띄우고 눌러 가며** 돈다.
 *
 * 기사님 (2026-09-10): *"전반적으로 네가 화면을 돌려서 이상한 부분을 찾아 줘.
 * 내가 계속 찾고 수정하고 하지 않도록."* · *"**네가 보는 것과 내가 보는 것이 같아야** 할 것
 * 같아. 지금 네가 테스트한 거 **콜 문제로 만들어 돌릴 수 있게** 만들어 줘."*
 *
 * 🔴 **그날 잡은 것은 전부 «두 자리가 다른 말을 하는 것»이었다** — 검사(vitest)는 순수 함수만
 *    보고 화면이 무엇을 적는지는 안 본다. 그래서 이 문제는 **DOM 에 실제로 찍힌 글자끼리**
 *    대조한다. 코드가 아니라 **화면이 답한다.**
 *
 * 쓰기:
 *   cd onedal-web && pnpm lab          # 문제를 끝까지 돌고 통과/실패를 적는다
 *   SHOTS=1 pnpm lab                   # 단계마다 화면을 /tmp/onedal-lab/ 에 찍는다
 *   KEEP=1 pnpm lab                    # 끝나도 크롬을 안 닫는다 (직접 들여다볼 때)
 *
 * ⚠️ **로컬 전용**이다 — `pnpm dev` 로 관제웹(3000)이 떠 있어야 한다.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const require = createRequire(join(ROOT, 'server/index.js'));
const WebSocket = require('ws');

const WEB = process.env.WEB ?? 'http://localhost:3000';
const W = 1800, H = 1100;
const SHOTS = process.env.SHOTS === '1';
const SHOT_DIR = '/tmp/onedal-lab';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!WEB.includes('localhost')) { console.error('🔴 로컬에서만 씁니다'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = 9300 + (process.pid % 400);
const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`,
    '--user-data-dir=/tmp/onedal-lab-profile', 'about:blank',
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
    const n = ++id; pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
});

/* ── 문제가 잡은 것 ─────────────────────────────────────── */
const fails = [];
let checks = 0;
const ok = (name, cond, saw) => {
    checks++;
    // 🔴 **통과해도 «본 것»을 적는다** — 숫자가 안 보이면 기사님과 내가 같은 것을 본 게 아니다
    if (cond) { console.log(`  ✅ ${name}${saw != null ? ` — ${saw}` : ''}`); return true; }
    fails.push(`${name}${saw != null ? ` — 본 것: ${saw}` : ''}`);
    console.log(`  🔴 ${name}${saw != null ? ` — 본 것: ${saw}` : ''}`);
    return false;
};

try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
        await sleep(200);
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
    await send('Page.enable'); await send('Runtime.enable');
    /* 🔴 `--window-size` 는 headless 에서 뷰포트에 안 먹는다 (shot.mjs 의 교훈 그대로) */
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

    const js = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;
    const click = async (x, y) => {
        for (const type of ['mousePressed', 'mouseReleased'])
            await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        await sleep(1100);
    };
    /** 글이 이 말을 담은 버튼을 누른다 — 자리(픽셀)가 아니라 **글자로** 찾는다 */
    const press = async re => js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>${re}.test(b.textContent)); if(!b) return false; b.click(); return true;})()`).then(async r => { await sleep(1400); return r; });
    const shot = async name => {
        if (!SHOTS) return;
        mkdirSync(SHOT_DIR, { recursive: true });
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
    };
    /** 화면 전체 글에서 한 조각을 꺼낸다 — **화면이 답한다** */
    const grab = async re => js(`(()=>{const m=document.body.innerText.match(${re}); return m? m[1] : null})()`);
    /**
     * 💰 **요금을 넣는다** — 리액트가 쥔 칸이라 `value` 만 바꾸면 안 먹는다.
     *    네이티브 setter 로 넣고 `input` 을 직접 울려야 리액트가 알아챈다.
     */
    const setFare = async won => js(`(()=>{
        const el=[...document.querySelectorAll('input')].find(i=>i.type!=='range'&&/^\\d+$/.test(i.value)&&+i.value>1000);
        if(!el) return false;
        const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        set.call(el, String(${won})); el.dispatchEvent(new Event('input',{bubbles:true}));
        return true;
    })()`).then(async r => { await sleep(900); return r; });

    console.log('🧪 지도 실험실 콜 문제\n');
    await send('Page.navigate', { url: `${WEB}/mockup/map` });
    await sleep(6000);
    await shot('1-처음');

    /* ── ① 화면이 말하는 동 수 == 앱에 실릴 동 수 ───────────── */
    console.log('① 그물 — 화면과 아웃풋이 같은 수를 말하는가');
    const netTitle = await grab(/그물 (\d+)동/);
    const outDongs = await grab(/좌표 dongs (\d+)/);
    ok('제목의 «그물 N동» == 아웃풋 «좌표 dongs N»', netTitle === outDongs, `제목 ${netTitle} · 아웃풋 ${outDongs}`);

    /* ── ② 콜 하나를 만든다 ─────────────────────────────────── */
    console.log('\n② 콜 하나 — 지도를 두 번 눌러 만든다');
    const box = await js(`(()=>{const c=document.querySelector('canvas');const r=c.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()`);
    if (!box) throw new Error('지도 캔버스를 못 찾았습니다');
    /** 🔴 문제지 좌표는 **캔버스 안의 비율**이다 — 창 크기가 바뀌어도 같은 자리를 누른다 */
    const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
    await click(...at(0.32, 0.57));   // ▲상차
    await click(...at(0.55, 0.42));   // ▼하차
    const made = await grab(/▲\s*([^\n→]+?)\s*→/);
    ok('두 번 누르면 후보콜이 선다', !!made, made);
    /**
     * 💰 **문제지의 요금은 20만원이다** (기사님 확정 2026-09-10 *"모두 통과하게 금액 20만원으로"*).
     * 🔴 요금이 낮으면 색이 «똥»이 되어 버튼 비율이 뒤집히고 문구가 달라진다 —
     *    **문제는 늘 같은 상황을 재현해야** 무엇이 바뀌었는지 알 수 있다 (`pnpm drive` 의 문제지와 같은 규약).
     */
    ok('요금 20만원을 넣는다', await setFare(200000) === true);
    await shot('2-후보콜');

    /* ── ③ 서버로 올린다 → 심사 ────────────────────────────── */
    console.log('\n③ 심사 — 같은 값에 같은 이름이 붙는가');
    await press(/서버로 올린다|올려 보기/);
    await sleep(3000);
    /**
     * 🔴 **«더 쓰는 시간»은 화면에 여러 곳에 적힌다** — 실험실 판정 영역 · 시트 카드 ·
     *    심사석 시급 근거(`÷N분`). 셋이 **다른 프롭에서** 오므로 갈라질 수 있다.
     *
     * ⚠️ 처음엔 `match`(첫 줄)만 봐서 **검사에 이가 없었다** — 시트를 틀리게 고쳐도 초록불이었다.
     *    지금은 **화면에 적힌 그 숫자를 전부 모아** 하나인지 본다. 하나가 아니면 어딘가 갈렸다.
     */
    const extras = await js(`(()=>{const t=document.body.innerText;
        return [...t.matchAll(/더 쓰는 시간 (\\d+)분/g), ...t.matchAll(/÷\\s*(\\d+)분/g)].map(m=>m[1])})()`);
    const uniq = [...new Set(extras ?? [])];
    ok('화면의 «더 쓰는 시간»이 모두 같은 수다 (판정·시트·심사석)',
        (extras?.length ?? 0) >= 3 && uniq.length === 1, `${extras?.length ?? 0}곳 · ${JSON.stringify(uniq)}`);
    const firstLine = await js(`/첫짐 — 밀릴 콜이 없다/.test(document.body.innerText)`);
    ok('잡은 콜이 없으면 «첫짐 — 밀릴 콜이 없다»', firstLine === true);
    /**
     * 🔴 **«안 봄»은 판정 표에는 있어야 하고 거절 버튼에는 없어야 한다.**
     *    그래서 화면 전체 글이 아니라 **거절 자리만** 본다 — 전체를 보면 옳은 표시까지 잡는다.
     */
    const noBogusReject = await js(`[...document.querySelectorAll('button')]
        .filter(b => /^❌|거절/.test(b.innerText.trim()))
        .every(b => !/안 봄|못 잼/.test(b.innerText))`);
    ok('심사석 «거절» 자리에 «안 봄»이 안 뜬다', noBogusReject === true);
    const color = await grab(/(꿀|보통|똥|사고)\s*·\s*\d+점/);
    ok('20만원이면 색이 나온다 (사고가 아니다)', color != null && color !== '사고', color);
    await shot('3-심사');

    /* ── ④ 확정 두 번 — 콜이 쌓인다 ────────────────────────── */
    console.log('\n④ 콜 두 개 — 쌓이고, 순번이 이어지는가');
    await press(/콜 확정|탈락이지만 확정/);
    await sleep(2500);
    await click(...at(0.62, 0.66));
    await click(...at(0.78, 0.34));
    await press(/서버로 올린다|올려 보기/);
    await sleep(3000);
    await press(/콜 확정|탈락이지만 확정/);
    await sleep(2500);
    await shot('4-두콜');

    /**
     * 🔴 **오늘(2026-09-10)의 사고가 여기 있었다** — 후보콜 정거장 둘이 번호를 밀어
     *    지도는 ⑧⑨⑩ 인데 시트는 10·11·12 였다. 확정 콜의 순번은 **1부터 빠짐없이** 이어져야 한다.
     */
    const seqs = await js(`(()=>{const t=document.body.innerText; const m=[...t.matchAll(/\\n\\s*(\\d+)\\s+\\S+\\s+\\d\\d:\\d\\d/g)].map(x=>+x[1]); return [...new Set(m)].sort((a,b)=>a-b)})()`);
    const listCount = await js(`(document.body.innerText.match(/📋 콜 리스트 — (\\d+)/)||[])[1]||null`);
    ok('콜 리스트에 두 콜이 쌓인다', listCount === '2', listCount);
    ok('시트 순번이 1부터 빠짐없이 이어진다', Array.isArray(seqs) && seqs.length > 0 && seqs.every((v, i) => v === i + 1), JSON.stringify(seqs));

    /* ── ⑤ 주행 — 지나온 자리는 조용해지는가 ───────────────── */
    console.log('\n⑤ 주행 — 지나온 정거장이 조용해지는가');
    await press(/주행|출발/);
    await sleep(9000);
    await shot('5-주행');
    const moving = await js(`/▶/.test(document.body.innerText)`);
    ok('시트 상태바가 «이동 중»(▶)으로 바뀐다', moving === true);

    console.log(`\n${fails.length ? '🔴' : '🟢'} 검사 ${checks}건 · 실패 ${fails.length}건`);
    if (SHOTS) console.log(`📸 ${SHOT_DIR}/`);
    if (fails.length) { fails.forEach(f => console.log(`   · ${f}`)); process.exitCode = 1; }
} catch (e) {
    console.error('🔴 문제를 돌리다 멈췄습니다:', e.message);
    process.exitCode = 1;
} finally {
    if (process.env.KEEP !== '1') { try { ws?.close(); } catch { /* 이미 닫힘 */ } chrome.kill(); }
}
