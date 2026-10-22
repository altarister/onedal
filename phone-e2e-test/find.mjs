// 단추 찾기 — S23 관제앱 웹뷰에 개발자 도구로 붙어 <button> 을 글자로 찾고 화면 위 자리(실제 픽셀)만 돌려준다. 누르지 않는다(누름은 day.py 가 adb 손 누름 · 71 «가»).
// 쓰는 법: node find.mjs <S23 adb 이름> <글자> [☰ 화면 y=176]   → 한 줄 JSON {state, x, y, w, h, text, why, offsetY}
//   state: ok(보이고 안 가려짐) · disabled(꺼진 단추) · below/above(화면 밖 — 밀어서 다시) · covered(다른 것이 위에) · none(그 글자 단추 없음) · many(보이는 것이 둘 이상)
//   자리 = 요소 가운데(CSS px) × devicePixelRatio + 웹뷰가 화면에서 시작하는 높이 — 높이는 ☰(aria-label «메뉴 열기») 가운데를 taps.json 화면 y 와 맞춰 그 순간 잰다
//   예정 단계의 «모양만» 단추는 <span> 이라 안 걸린다(StepSheetMock.tsx MockBtn)
//   결재석: 글자 자리에 «seat:<요금 글자>:keep|reject»(예 seat:6.1만원:keep) — 그 요금이 머리줄에 적힌 결재석 칸의 단추(앞 = 거절 · 뒤 = KEEP · JudgmentSeat.tsx)
//     그 요금 칸이 없으면 none 이고 why 에 지금 결재석에 뜬 요금들을 적는다(다른 콜이 떠 있음 — 누르지 않고 기다린다 · 71 F46)
//   단추 고르기(글자 자리): «글자»(단추 글에 듦) · «=글자»(단추 글이 똑같음) · «^글자»(단추 글이 그것으로 시작) · «aria:이름»(aria-label 이 똑같음) · «title:조각»(title 에 듦)
//     앞에 «in:<글자>>»를 붙이면 그 글자가 든 잎에서 위로 올라가 처음 만나는 상자 안의 단추만 본다(예: in:A24>title:모드를 바꾸려면 · in:최소 금액>=+)
//   화면 확인: «see:<글자>» — 그 글자가 든 잎 요소가 화면 안에 보이나(ok · none) · 좌표 누름 전에 «기대한 화면인가»를 본다(71)
//   단추 아닌 자리: «leaf:<글자>» — 그 글자가 든 보이는 잎이 딱 하나면 그 가운데(ok) · 없으면 none · 둘 이상이면 many
import { execFileSync } from 'node:child_process';

const [dev, want, menuYArg = '176'] = process.argv.slice(2);
if (!dev || !want) { console.log(JSON.stringify({ state: 'tool', why: 'S23 adb 이름 · 글자를 주세요' })); process.exit(0); }
const PORT = 9334;
const adb = (...a) => execFileSync('adb', ['-s', dev, ...a], { encoding: 'utf8', timeout: 20000 });
const out = (o) => { console.log(JSON.stringify(o)); };

let ws;
try {
    const pid = adb('shell', 'pidof', 'kr.co.onedal.dashboard').trim();
    const sock = adb('shell', 'cat', '/proc/net/unix').split('\n').map(l => l.trim().split(/\s+/).pop()).find(s => s === `@webview_devtools_remote_${pid}`);
    if (!pid || !sock) { out({ state: 'tool', why: `관제앱 웹뷰 개발자 도구 소켓 없음(pid ${pid || '없음'})` }); process.exit(0); }
    adb('forward', `tcp:${PORT}`, `localabstract:${sock.slice(1)}`);
    const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    const page = pages.find(p => p.type === 'page' && p.webSocketDebuggerUrl);
    if (!page) { out({ state: 'tool', why: '웹뷰 페이지 없음' }); process.exit(0); }
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
    const r = await new Promise(ok => {
        ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id === 1) ok(m); };
        ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { returnByValue: true, expression: `(() => {
            const want = ${JSON.stringify(want)}, dpr = window.devicePixelRatio, H = window.innerHeight, W = window.innerWidth;
            const norm = s => (s || '').replace(/\\s+/g, ' ').trim();
            const menu = document.querySelector('[aria-label="메뉴 열기"]');
            if (!menu) return { state: 'tool', why: '☰(메뉴 열기)를 못 찾아 웹뷰 높이를 못 잼' };
            const mr = menu.getBoundingClientRect();
            const offsetY = ${Number(menuYArg)} - (mr.top + mr.height / 2) * dpr;
            if (want.startsWith('see:')) {
                const t = want.slice(4);
                const vis = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && norm(e.textContent).includes(t)).some(e => {
                    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W && getComputedStyle(e).visibility !== 'hidden';   /* 닫힌 서랍은 화면 왼쪽 밖에 그려져 있다 — 가로도 본다 */
                });
                return { state: vis ? 'ok' : 'none', text: t, offsetY };
            }
            if (want.startsWith('leaf:')) {   /* 단추가 아닌 누를 자리(결재석 미리보기 칸 본문 등) — 그 글자가 든 보이는 잎 하나의 가운데 */
                const t = want.slice(5);
                const hit = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && norm(e.textContent).includes(t)).filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W; });
                if (hit.length !== 1) return { state: hit.length ? 'many' : 'none', text: t, offsetY };
                /* 글줄이 화면 끝에 반쯤 걸리면 그 자리는 폰 단추 줄이다(판 6 S12) — 글줄을 품은 칸(높이 100px 이상인 첫 조상)의 화면 안 부분 가운데를 누른다 */
                let box = hit[0]; while (box.parentElement && box.getBoundingClientRect().height < 100) box = box.parentElement;
                const r = box.getBoundingClientRect(), top = Math.max(0, r.top), bot = Math.min(H, r.bottom);
                return { state: 'ok', x: Math.round((r.left + r.width / 2) * dpr), y: Math.round((top + bot) / 2 * dpr + offsetY), w: Math.round(r.width * dpr), h: Math.round((bot - top) * dpr), text: t, offsetY: Math.round(offsetY) };
            }
            let all;
            if (want.startsWith('seat:')) {
                const [, fare, side] = want.split(':');
                /* 요금 글자 «N.N만원» 만 든 잎 → 단추 둘 이상을 품은 가장 가까운 조상 = 결재석 칸 */
                const cardOf = el => { let p = el.parentElement; while (p && p.querySelectorAll('button').length < 2) p = p.parentElement; return p; };
                const leaves = [...document.querySelectorAll('span,div')].filter(e => e.children.length === 0 && /^\\d+\\.\\d만원$/.test(norm(e.textContent)));
                const cards = leaves.map(e => ({ fare: norm(e.textContent), card: cardOf(e) })).filter(c => c.card && c.card.getBoundingClientRect().height > 0);
                /* 직접 · 알람 · 연습 결재석은 «보기만» 칸(단추 없음 · JudgmentSeat.tsx manual) — 미리보기는 칸 본문을 누르면 치운다(기사님 손 «거절») */
                if (!cards.some(c => c.fare === fare) && side === 'reject') {
                    const leaf = leaves.find(e => norm(e.textContent) === fare);
                    let p = leaf && leaf.parentElement; while (p && !p.querySelector('.cursor-pointer')) p = p.parentElement;
                    const body = p && p.querySelector('.cursor-pointer');
                    if (body) all = [body];
                }
                const mine = [...new Set(cards.filter(c => c.fare === fare).map(c => c.card))];
                if (!mine.length && !all) {
                    const soak = leaves.some(e => norm(e.textContent) === fare);
                    return { state: 'none', why: soak ? '결재석 ' + fare + ' 은 «보기만» 칸(단추 없음 — KEEP 은 폰에서 손 확정)' : '결재석에 ' + fare + ' 칸 없음 · 지금 뜬 요금: ' + ([...new Set(cards.map(c => c.fare))].join(' · ') || '없음'), offsetY };
                }
                if (mine.length) all = mine.map(card => [...card.querySelectorAll('button')][side === 'reject' ? 0 : 1]).filter(Boolean);
            } else {
                let spec = want, scope = null;
                if (spec.startsWith('in:') && spec.includes('>')) { scope = spec.slice(3, spec.indexOf('>')); spec = spec.slice(spec.indexOf('>') + 1); }
                const match = b => {
                    const tx = norm(b.innerText);
                    if (spec.startsWith('=')) return tx === spec.slice(1);
                    if (spec.startsWith('^')) return tx.startsWith(spec.slice(1));
                    if (spec.startsWith('aria:')) return b.getAttribute('aria-label') === spec.slice(5);
                    if (spec.startsWith('title:')) return (b.getAttribute('title') || '').includes(spec.slice(6));
                    return tx.includes(spec);
                };
                const buttons = [...document.querySelectorAll('button, a[aria-label]')].filter(match);   /* 전화 덩어리는 이름표 단 <a>(StopDetailBlock) */
                if (scope === null) all = buttons;
                else {
                    /* 범위: 그 글자가 든 잎 → 위로 올라가 단추를 품은 첫 상자 안의 것만(다른 폰 줄 · 지도 +/− 와 안 섞임) */
                    const leaves = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && norm(e.textContent).includes(scope));
                    const got = new Set();
                    for (const leaf of leaves) { let p = leaf.parentElement; while (p && !buttons.some(b => p.contains(b))) p = p.parentElement; if (p) buttons.filter(b => p.contains(b)).forEach(b => got.add(b)); }
                    all = [...got];
                    if (!leaves.length) return { state: 'none', why: '범위 글자 «' + scope + '» 가 화면에 없음', offsetY };
                }
            }
            if (!all.length) return { state: 'none', why: '그 글자 <button> 없음', offsetY };
            const seen = all.map(b => {
                const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                const base = { x: Math.round(cx * dpr), y: Math.round(cy * dpr + offsetY), w: Math.round(r.width * dpr), h: Math.round(r.height * dpr), text: norm(b.innerText).slice(0, 40), offsetY: Math.round(offsetY) };
                if (r.width === 0 || r.height === 0) return { ...base, state: 'hidden' };
                if (b.disabled) return { ...base, state: 'disabled', why: '단추가 꺼져 있음(눌러도 아무 일 없음)' };
                if (cx < 0 || cx > W) {
                    /* 옆으로 미는 칸(단계 시트 등) 안이면 손가락으로 옆으로 밀 자리 — 아니면 닫힌 서랍처럼 숨은 것 */
                    let p = b.parentElement; while (p && !(p.scrollWidth > p.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(p).overflowX))) p = p.parentElement;
                    if (!p) return { ...base, state: 'hidden', why: '화면 옆 밖(닫힌 서랍 등)' };
                    const sr = p.getBoundingClientRect(), top = Math.max(0, sr.top), bot = Math.min(H, sr.bottom), y = (top + bot) / 2;
                    const l = Math.max(0, sr.left), rgt = Math.min(W, sr.right);
                    return { ...base, state: cx > W ? 'right' : 'left', swipeX: { y: Math.round(y * dpr + offsetY), x1: Math.round((l + (rgt - l) * 0.8) * dpr), x2: Math.round((l + (rgt - l) * 0.2) * dpr) } };
                }
                if (cy > H) return { ...base, state: 'below' };
                if (cy < 0) return { ...base, state: 'above' };
                const top = document.elementFromPoint(cx, cy);
                if (!top) return { ...base, state: 'hidden', why: '그 자리에 그려진 것이 없음' };
                if (top !== b && !b.contains(top)) {
                    /* 가운데가 스크롤 상자 밖으로 잘렸으면(상자 아래 칸이 그 자리에 그려짐 — 단계 칸 단추 밑의 정거장 줄) 화면 밖과 같다 — 밀면 나온다(S05a 판 1) */
                    let p = b.parentElement; while (p && !(p.scrollHeight > p.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
                    const pr = p && p.getBoundingClientRect();
                    if (pr && (cy > pr.bottom || cy < pr.top)) return { ...base, state: cy > pr.bottom ? 'below' : 'above', why: '스크롤 상자 밖으로 잘림' };
                    return { ...base, state: 'covered', why: '위에 ' + (top.tagName + ' ' + norm(top.innerText).slice(0, 20)) };
                }
                return { ...base, state: 'ok' };
            });
            const ok = seen.filter(s => s.state === 'ok');
            if (ok.length === 1) return ok[0];
            if (ok.length > 1) return { state: 'many', why: ok.map(s => s.text).join(' | '), offsetY };
            const pick = seen.find(s => s.state === 'right' || s.state === 'left') || seen.find(s => s.state === 'below' || s.state === 'above') || seen.find(s => s.state === 'covered') || seen[0];
            /* 화면 밖이면 손가락으로 밀 자리 — 가장 가까운 세로 스크롤 상자의 보이는 부분 */
            if (pick.state === 'below' || pick.state === 'above') {
                const b = all[seen.indexOf(pick)];
                /* 보이는 높이가 120px 아래인 상자는 건너뛰고 바깥 상자에서 민다 — 화면 밑에 걸친 작은 칸을 밀면 손가락이 바닥 가장자리에서 60px 만 움직여 아무것도 안 움직였다(92판 S08b) */
                const scrolls = e => e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY);
                const visH = e => { const r = e.getBoundingClientRect(); return Math.min(H, r.bottom) - Math.max(0, r.top); };
                let p = b.parentElement; while (p && !(scrolls(p) && visH(p) >= 120)) p = p.parentElement;
                const sr = (p || document.scrollingElement).getBoundingClientRect();
                const top = Math.max(0, sr.top), bot = Math.min(H, sr.bottom);
                pick.swipe = { x: Math.round((Math.max(0, sr.left) + Math.min(W, sr.right)) / 2 * dpr), y1: Math.round((top + (bot - top) * 0.85) * dpr + offsetY), y2: Math.round((top + (bot - top) * 0.15) * dpr + offsetY) };
            }
            return pick;
        })()` } }));
    });
    out(r.result?.result?.value ?? { state: 'tool', why: '개발자 도구 답 없음' });
} catch (e) {
    out({ state: 'tool', why: String(e.message || e).slice(0, 120) });
} finally {
    try { ws?.close(); } catch {}
    try { adb('forward', '--remove', `tcp:${PORT}`); } catch {}
    process.exit(0);
}
