#!/usr/bin/env node
/**
 * 🧪 **지도 실험실 콜 문제** — 화면을 **실제로 띄우고 눌러 가며** 돈다.
 * 누가: 에이전트
 * 언제: 지도 실험실 화면을 고친 뒤 (관제웹 3000 이 떠 있어야 한다)
 * 어디서: cd onedal-web && pnpm lab
 * 무엇을: 실험실의 문제 버튼을 실제로 눌러 화면 두 자리가 같은 말을 하는지 대조하고, 단계마다 화면을 찍는다
 * 왜: vitest 는 순수 함수만 보고 화면이 무엇을 적는지는 안 본다
 * (잡는 것 · 못 잡는 것 · 검수는 onedal-web/CLAUDE.md 스크립트 표)
 *
 *
 * 기사님: *"전반적으로 네가 화면을 돌려서 이상한 부분을 찾아 줘.
 * 내가 계속 찾고 수정하고 하지 않도록."* · *"**네가 보는 것과 내가 보는 것이 같아야** 할 것
 * 같아. 지금 네가 테스트한 거 **콜 문제로 만들어 돌릴 수 있게** 만들어 줘."*
 *
 * 🔴 **그날 잡은 것은 전부 «두 자리가 다른 말을 하는 것»이었다** — 검사(vitest)는 순수 함수만
 *    보고 화면이 무엇을 적는지는 안 본다. 그래서 이 문제는 **DOM 에 실제로 찍힌 글자끼리**
 *    대조한다. 코드가 아니라 **화면이 답한다.**
 *
 * 🔴 **기사님도 같은 것을 보셔야 한다** (*"나는 어떻게 봐?"*) —
 *    터미널 글자만 남기면 그건 나만 본 것이다. 그래서 **단계마다 화면을 찍고
 *    한 장짜리 보고서로 엮어 브라우저로 연다.**
 *
 * 쓰기:
 *   cd onedal-web && pnpm lab          # 돌고, 화면을 찍고, 보고서를 열어 준다
 *   OPEN=0 pnpm lab                    # 보고서를 안 연다 (게이트에서 돌릴 때)
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
const SHOTS = process.env.SHOTS !== '0';
const SHOT_DIR = '/tmp/onedal-lab';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!WEB.includes('localhost')) { console.error('🔴 로컬에서만 씁니다'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 🔌 크롬 조종 포트 — 루트 README.md 「포트」 표의 자리 (shot 과 안 겹치게 9300~9599) */
const PORT = 9300 + (process.pid % 300);
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
const rows = [];        // 📄 보고서에 그대로 실린다
let checks = 0;
const ok = (name, cond, saw) => {
    checks++;
    rows.push({ name, cond, saw });
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
    const steps = [];
    const shot = async name => {
        if (!SHOTS) return;
        mkdirSync(SHOT_DIR, { recursive: true });
        const { data } = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(SHOT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
        steps.push({ name, at: rows.length });   // 이 화면이 어느 검사까지의 결과인가
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

    /**
     * 📏 **잰 자를 먼저 남긴다.** «여백이 답답하다»의 절반은 **다른 폭으로 재고 있던 것**일 수 있다.
     *    무엇으로 쟀는지가 보고서에 없으면 다음 사람이 같은 일을 또 겪는다.
     */
    const ruler = await js(`JSON.stringify({ vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio, theme: document.documentElement.className || '(기본)' })`);
    console.log(`📏 잰 자 — ${ruler}\n`);
    rows.push({ name: `📏 잰 자 — ${ruler}`, cond: true, saw: null, note: true });
    await shot('1-처음');

    /* ── ① 화면이 말하는 동 수 == 앱에 실릴 동 수 ───────────── */
    console.log('① 그물 — 화면과 아웃풋이 같은 수를 말하는가');
    const netTitle = await grab(/그물 (\d+)동/);
    const outDongs = await grab(/좌표 dongs (\d+)/);
    ok('제목의 «그물 N동» == 아웃풋 «좌표 dongs N»', netTitle === outDongs, `제목 ${netTitle} · 아웃풋 ${outDongs}`);

    /**
     * 🔴 **문제 버튼을 누른다 — 좌표를 여기 박지 않는다** (기사님: *"나도 화면에서 볼 수 있게 만들어 줘야지"*).
     * 🔴 **문제는 «판만» 세운다** (기사님: *"왜 자동이야 클릭은 내가 할게"*).
     *    콜은 오른쪽 목록의 `[data-cycle=N]` 을 눌러 찍는다 — 기사님이 하는 그대로다.
     */
    const problem = async name => js('(()=>{const b=document.querySelector("[data-problem=" + ' + JSON.stringify(JSON.stringify(name)) + ' + "]"); if(!b) return false; b.click(); return true})()');
    const problems = await js(`[...document.querySelectorAll('[data-problem]')].map(b=>b.getAttribute('data-problem'))`);
    ok('화면에 콜 문제 목록이 있다', (problems?.length ?? 0) >= 1, JSON.stringify(problems));
    if (!problems?.length) throw new Error('문제 목록이 없어 더 못 간다');

    /** 오른쪽 콜 목록에서 N 번 콜을 찍는다 (상·하차가 지도에 선다) */
    const takeCall = async no => js('(()=>{const b=document.querySelector(\'[data-cycle="' + no + '"]\'); if(!b) return false; b.click(); return true})()')
        .then(async r => { await sleep(2600); return r; });
    /** 지금 화면이 말하는 필터 판정 한 조각 */
    /**
     * 🔴 **괄호를 정규식에 넣지 않는다** — 템플릿 문자열이 `\(` 의 이스케이프를 먹어
     *    `(필터 통과)` 가 **캡처 그룹**이 되고, 그러면 통과 배지만 조용히 안 잡힌다
     *    (실측: ③ 탈락은 읽히는데 ① 통과만 `?` 였다). 앞머리로만 가른다.
     */
    const verdictNow = () => js(`(document.body.innerText.match(/✅ 올린다|⛔ 제외지역|❌ 안 올린다/)||['?'])[0]`);

    /* ── ② 판을 세우고 첫 콜을 찍는다 ───────────────────────── */
    console.log(`\n② ${problems[0]} — 판을 세우고 ①번 콜을 찍는다`);
    await problem(problems[0]); await sleep(2500);
    ok('①번 콜을 찍으면 후보콜이 선다', await takeCall(1) === true, await grab(/▲\s*([^\n→]+?)\s*→/));
    const v1 = await verdictNow();
    ok('①번 콜은 **필터를 통과한다** (가는 길 위다)', v1.startsWith('✅'), v1);
    await shot('2-첫콜');

    /* ── ③ 🔴 같은 판에서 **콜에 따라 갈리는가** (필터가 일하는가) ── */
    /**
     * 🔴 **떨어질 줄 아는 검사다.** 앞의 것들은 «찍으면 대개 참»이라 코드가 틀려도 통과한다.
     *    필터가 일한다는 것은 **같은 자리에서 콜에 따라 답이 갈린다**는 뜻이다 —
     *    ①갈마동(대전, 코앞)은 통과하고, ③오송(70km 밖)은 **상차 반경·라인 밖**이라 떨어져야 한다.
     *    둘 중 하나라도 뒤집히면 빨간불이다.
     */
    console.log('\n③ 🔴 같은 판에서 콜에 따라 갈리는가 (필터가 일하는가)');
    ok('③번 콜을 찍는다', await takeCall(3) === true, await grab(/▲\s*([^\n→]+?)\s*→/));
    const v3 = await verdictNow();
    ok('③번 콜은 **떨어진다** — 상차지가 내 자리에서 멀다', v3.startsWith('❌') || v3.startsWith('⛔'), v3);
    ok('🔴 한 판에서 두 콜의 답이 **갈렸다**', v1 !== v3, `① ${v1} ↔ ③ ${v3}`);
    await shot('3-갈림');

    /* ── ④ 올리고 확정 — 심사가 서고 값이 한 벌인가 ─────────── */
    console.log('\n④ ①번 콜을 올려 심사하고 확정한다');
    await takeCall(1);
    await press(/서버로 올린다|올려 보기/); await sleep(6000);
    const color = await grab(/(꿀|보통|똥|사고)\s*·?\s*\d+점/);
    ok('색이 나온다 (사고가 아니다)', color != null && color !== '사고', color);
    const extras = await js(`(()=>{const t=document.body.innerText;
        return [...t.matchAll(/더 쓰는 시간 (\\d+)분/g), ...t.matchAll(/÷\\s*(\\d+)분/g)].map(m=>m[1])})()`);
    const uniq = [...new Set(extras ?? [])];
    ok('화면의 «더 쓰는 시간»이 모두 같은 수다 (판정·시트·심사석)',
        (extras?.length ?? 0) === 0 || uniq.length === 1, `${extras?.length ?? 0}곳 · ${JSON.stringify(uniq)}`);
    await shot('4-심사');

    await press(/콜 확정|탈락이지만 확정/); await sleep(2500);
    const listCount = await grab(/📋 콜 리스트 — (\d+)/);
    ok('확정하면 콜 리스트에 한 콜이 쌓인다', listCount === '1', listCount);

    /**
     * 🔴 **두 자리가 같은 말을 하는가** — `pnpm lab` 의 본업이다.
     *    왼쪽 「🧭 방문 순서」 패널과 오른쪽 시트 타이틀은 **같은 순번**을 말해야 한다.
     *    지키는 사고: 패널은 «4 관산동», 시트 배지는 «⑦관산동» — 지나온 셋을 두 번 센 것.
     */
    const panelSeq = await js(`(()=>{const t=document.body.innerText; const i=t.indexOf('방문 순서'); if(i<0) return null;
        const seg=t.slice(i, i+600); return [...seg.matchAll(/(\\d+)\\s*[①-⑮]\\s*(상차|하차)/g)].map(m=>+m[1])})()`);
    ok('방문 순서 패널의 번호가 1부터 빠짐없이 이어진다',
        Array.isArray(panelSeq) && panelSeq.length > 0 && panelSeq.every((v, i) => v === i + 1), JSON.stringify(panelSeq));
    /**
     * 🔴 **칸을 «자리»로 집는다 — 글자 모양으로 고르지 않는다.**
     *    처음엔 «숫자인 칸»을 다 모았더니 ± 의 `0` 이 순번으로 섞여 `[1,0,2]` 가 됐다
     *. 격자는 자리가 곧 이름이므로 **0번·6번 칸**이 순번이다.
     */
    const sheetSeq = await js(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.style.gridTemplateColumns && b.children.length>=11);
        return bs.flatMap(b=>[0,6].map(i=>b.children[i]?.textContent.trim()).filter(x=>/^\\d+$/.test(x)).map(Number))})()`);
    ok('시트 타이틀의 순번이 방문 순서 패널과 같다',
        Array.isArray(sheetSeq) && sheetSeq.length > 0 && JSON.stringify([...new Set(sheetSeq)].sort((a,b)=>a-b)) === JSON.stringify(panelSeq),
        `시트 ${JSON.stringify(sheetSeq)} ↔ 패널 ${JSON.stringify(panelSeq)}`);
    await shot('5-확정');

    /* ── ⑤ 주행 — 상태바가 «이동 중»으로 바뀌는가 ───────────── */
    console.log('\n⑤ 주행 — 시트 상태바가 따라 바뀌는가');
    await press(/▶️ 주행|주행$/); await sleep(6000);
    ok('시트 상태바가 «이동 중»(▶)으로 바뀐다', await js(`/▶/.test(document.body.innerText)`) === true);
    await shot('6-주행');

    console.log(`\n${fails.length ? '🔴' : '🟢'} 검사 ${checks}건 · 실패 ${fails.length}건`);
    if (fails.length) { fails.forEach(f => console.log(`   · ${f}`)); process.exitCode = 1; }

    /* ── 📄 보고서 — 기사님이 여는 자리 ─────────────────────── */
    if (SHOTS) {
        const esc = t => String(t).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const card = s => `<figure><figcaption>${esc(s.name)}</figcaption><img src="${s.name}.png"></figure>`;
        const line = r => `<li class="${r.cond ? 'ok' : 'no'}"><b>${r.cond ? '✅' : '🔴'}</b> ${esc(r.name)}`
            + `${r.saw != null ? `<span>${esc(r.saw)}</span>` : ''}</li>`;
        writeFileSync(join(SHOT_DIR, 'index.html'), `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
<title>지도 실험실 콜 문제 — ${new Date().toLocaleString('ko-KR')}</title><style>
 :root{--bg:#0a0e17;--line:#1c2436;--txt:#e8ecf4;--mut:#7d879c}
 body{background:var(--bg);color:var(--txt);font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;margin:0;padding:26px 30px}
 h1{font-size:19px;margin:0 0 4px} p.sub{color:var(--mut);font-size:12.5px;margin:0 0 18px}
 ul{list-style:none;padding:0;margin:0 0 26px;font-size:13.5px}
 li{padding:7px 12px;border:1px solid var(--line);border-radius:9px;margin-bottom:6px;display:flex;gap:9px;align-items:baseline}
 li.no{border-color:#e0556388;background:rgba(224,85,99,.10)}
 li span{margin-left:auto;color:var(--mut);font-variant-numeric:tabular-nums}
 figure{margin:0 0 22px} figcaption{font-size:12px;color:var(--mut);font-weight:800;margin-bottom:6px}
 img{width:100%;border:1px solid var(--line);border-radius:10px;display:block}
</style></head><body>
<h1>🧪 지도 실험실 콜 문제 — ${fails.length ? `🔴 실패 ${fails.length}건` : '🟢 전부 통과'}</h1>
<p class="sub">검사 ${checks}건 · ${new Date().toLocaleString('ko-KR')} · 요금 20만원 문제지 ·
같은 명령: <code>cd onedal-web &amp;&amp; pnpm lab</code></p>
<ul>${rows.map(line).join('')}</ul>
${steps.map(card).join('')}
</body></html>`);
        console.log(`📄 보고서 ${join(SHOT_DIR, 'index.html')}`);
        if (process.env.OPEN !== '0' && process.platform === 'darwin')
            spawn('open', [join(SHOT_DIR, 'index.html')], { stdio: 'ignore', detached: true }).unref();
    }
} catch (e) {
    console.error('🔴 문제를 돌리다 멈췄습니다:', e.message);
    process.exitCode = 1;
} finally {
    if (process.env.KEEP !== '1') { try { ws?.close(); } catch { /* 이미 닫힘 */ } chrome.kill(); }
}
