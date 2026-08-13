/**
 * pnpm lifecycle — **콜 생애를 시퀀스대로 끝까지 몰아보는 실전 시뮬레이션**
 *
 * 기사님: *"오토로 해서 콜을 1개 잡고, 상/하차지 전화 하고, 필터 바뀌는지 보고,
 *          다시 합짐 잡고, 상/하차지 전화, 그리고 배송 출발 해서 각각 배송지 도착"*
 *
 * `scenario` 와 다르다 — 그건 DB 를 시드해서 **서버만** 돌린다.
 * 이건 **실기기 앱 + 배차망 시뮬레이터**로 진짜 콜을 잡게 하고,
 * 관제탑이 할 일(결재·통화 기록·출발·도착)만 소켓으로 대행한다.
 *
 * 그래서 이 스크립트는 **예측 검증기**다. 각 단계에서 필터가 어떻게 변해야 하는지를
 * 미리 적어 두고, 실제로 그렇게 되는지 대조한다. 틀리면 그 자리에서 멈춘다.
 *
 * ── 준비물 ──
 *   ① 서버       cd onedal-web && pnpm dev
 *   ② 시뮬레이터  cd ~/reps/map/map && pnpm dev   (폰에서 픽업 지역 한 번 선택)
 *   ③ 실기기      1DAL 앱 실행 + 접근성 켬 + adb 연결
 *   ④ 크롬        시뮬레이터를 **크롬으로** 열어야 한다 (삼성 인터넷은 안 읽힘)
 */
import { execSync, spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// scenario.mjs 와 같은 경로를 쓴다 — 워크스페이스 루트에는 socket.io-client 가 없다
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { io } = await import(join(ROOT, 'client-app/node_modules/socket.io-client/build/esm/index.js'));

const API = 'http://localhost:4000';
const SIM_PORT = 5173;
const sh = (c) => execSync(c, { encoding: 'utf8' }).trim();
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let socket, fails = 0, step = 0;

const say  = (m) => console.log(m);
const head = (m) => console.log(`\n\x1b[1m━━━ ${++step}. ${m}\x1b[0m`);
const ok   = (m, d = '') => console.log(`   ✅ ${m}${d ? `  \x1b[2m${d}\x1b[0m` : ''}`);
const bad  = (m, d = '') => { fails++; console.log(`   🔴 ${m}${d ? `  ${d}` : ''}`); };
const die  = (m) => { console.error(`\n🔴 ${m}\n`); process.exit(1); };

/** 기대한 대로 됐는가. **이 함수가 곧 예측이다.** */
function expect(label, actual, want) {
    const pass = typeof want === 'function' ? want(actual) : actual === want;
    (pass ? ok : bad)(label, `= ${JSON.stringify(actual)}`);
    return pass;
}

// ─────────────────────────── 준비 ───────────────────────────

function localIp() {
    for (const l of Object.values(networkInterfaces()))
        for (const n of l ?? []) if (n.family === 'IPv4' && !n.internal) return n.address;
}

async function preflight() {
    let h;
    try { h = await (await fetch(`${API}/api/health`)).json(); }
    catch { die('서버가 안 떠 있습니다.  cd onedal-web && pnpm dev'); }
    say(`🖥️  서버   bootedAt=${h.bootedAt}`);

    if (!sh('adb devices').split('\n').slice(1).some(l => l.includes('\tdevice')))
        die('안드로이드 기기가 연결되어 있지 않습니다.');
    if (!sh('adb shell pidof com.onedal.app || true')) die('1DAL 앱이 실행 중이 아닙니다.');
    say(`📱 앱     ${sh('adb shell dumpsys package com.onedal.app | grep versionName').trim()}`);

    const ip = localIp();
    try { await fetch(`http://${ip}:${SIM_PORT}/`, { signal: AbortSignal.timeout(3000) }); }
    catch { die(`시뮬레이터가 없습니다.  cd ~/reps/map/map && pnpm dev`); }
    say(`🗺️  시뮬   http://${ip}:${SIM_PORT}`);
    return `http://${ip}:${SIM_PORT}/?mode=standalone`;
}

async function connect() {
    const { accessToken } = await (await fetch(`${API}/api/auth/bypass`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })).json();
    socket = io(API, { auth: { token: accessToken }, transports: ['websocket'] });
    await new Promise((res, rej) => {
        socket.once('connect', res);
        socket.once('connect_error', e => rej(new Error(e.message)));
        setTimeout(() => rej(new Error('소켓 연결 시간 초과')), 8000);
    });
    // 서버가 밀어주는 최신 필터를 계속 붙잡아 둔다
    socket.on('filter-init',    p => { state.filter = p.activeFilter; });
    socket.on('filter-updated', p => { state.filter = p.activeFilter; });
    socket.on('order-evaluated', o => { state.evaluated.set(o.id, o); });
    socket.on('handler-error',  e => console.log(`   ⚠️ handler-error: ${e.message}`));
    return accessToken;
}

const state = { filter: null, evaluated: new Map(), token: null };

const filterNow = () => {
    const f = state.filter ?? {};
    return {
        phase: f.dispatchPhase, 합짐: f.isSharedMode, 사냥: f.isActive,
        차종: (f.allowedVehicleTypes || []).length,
        지역: (f.destinationKeywords || []).length,
        회랑km: f.corridorRadiusKm, 적재신뢰도: f.capacityConfidence,
    };
};

/** 조건이 참이 될 때까지 기다린다 (없으면 null) */
async function until(fn, ms = 60000, tick = 700) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const v = await fn(); if (v) return v; await wait(tick); }
    return null;
}

/** 서버는 `{ orders: [...] }` 로 준다 — 배열로 오는 줄 알고 `.filter` 를 부르면 터진다 */
async function orders() {
    const d = await (await fetch(`${API}/api/orders`, {
        headers: { Authorization: `Bearer ${state.token}` },
    })).json();
    return Array.isArray(d) ? d : (d?.orders ?? []);
}
const ACTIVE = ['ORDER_CONFIRMED', 'ORDER_PICKED_UP'];
const activeCount = async () => (await orders()).filter(o => ACTIVE.includes(o.status)).length;

// ─────────────────────────── 앱에게 콜을 잡히게 한다 ───────────────────────────

/**
 * **폰을 리스트 화면으로 되돌린다.**
 *
 * 앞선 콜을 확정하면 시뮬레이터는 상세(DETAIL_CONFIRMED)에 머문다. 그 상태로는
 * 앱이 사냥을 안 한다 — 리스트에서만 콜을 읽기 때문이다.
 * 서버에서 콜을 취소해도 **시뮬레이터 화면은 그대로**라는 점을 잊기 쉽다.
 *
 * 🔴 2026-08-13 — 처음엔 **뒤로가기(keyevent 4)** 를 반복했다. 잘못이었다.
 *    시뮬레이터는 SPA 라 뒤로가기가 상세→리스트가 아니라 **페이지 밖으로** 나간다.
 *    5번 누르니 크롬을 벗어나 **홈 화면**까지 갔고, 러너는 오지 않을 콜을 기다렸다.
 *    → 화면 안의 **[닫기]** 를 눌러야 한다. 시뮬레이터가 제공하는 정식 복귀 경로다.
 */
function dumpScreen() {
    try {
        sh('adb shell uiautomator dump /sdcard/_l.xml > /dev/null 2>&1');
        return sh('adb shell cat /sdcard/_l.xml');
    } catch { return ''; }
}

/** 리스트에만 있는 표지. 상세에는 '적요상세'·'닫기'가 있다 */
const isListScreen = (xml) => xml.includes('빠른설정') || xml.includes('오더검색');

async function ensureList() {
    for (let i = 0; i < 4; i++) {
        const xml = dumpScreen();
        if (isListScreen(xml)) return true;

        // 화면 안의 [닫기] 를 찾아 좌표로 누른다 (뒤로가기는 페이지 밖으로 나간다)
        const m = /text="닫기"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(xml);
        if (m) {
            const x = (Number(m[1]) + Number(m[3])) >> 1;
            const y = (Number(m[2]) + Number(m[4])) >> 1;
            sh(`adb shell input tap ${x} ${y}`);
        }
        // 못 찾아도 포기하지 않는다 — 화면 전환 중일 수 있다. 다음 바퀴에서 다시 본다
        await wait(2000);
    }
    return isListScreen(dumpScreen());
}

/**
 * 앱이 콜 하나를 잡을 때까지 기다린다.
 *
 * 🔴 처음엔 "리스트 화면으로 만든 뒤 기다린다"로 짰는데 잘못이었다.
 *    앱은 **쉬지 않고 사냥한다.** 러너가 준비하는 사이 이미 콜을 잡아 상세로 들어가 있는 게
 *    오히려 정상이다. 그런데 리스트가 아니라고 죽어버렸다.
 *    → **이미 잡힌 콜이 있으면 그걸 쓴다.** 없을 때만 리스트로 돌려 기다린다.
 *
 * 소켓(`order-evaluated`)만 보지 않고 서버 목록도 함께 훑는다 —
 * 러너가 붙기 전에 잡힌 콜은 소켓 이벤트를 놓치기 때문이다.
 */
async function huntOne(url, knownIds, label) {
    const findNew = async () => {
        for (const [id, o] of state.evaluated) if (!knownIds.has(id)) return o;
        for (const o of await orders()) {
            if (knownIds.has(o.id)) continue;
            if ([...ACTIVE, 'ORDER_AWAITING_DECISION', 'ORDER_SECURED_EVALUATING'].includes(o.status)) return o;
        }
        return null;
    };

    let got = await findNew();
    if (got) { say(`   \x1b[2m(앱이 이미 잡아 둔 콜을 씁니다)\x1b[0m`); return got; }

    // 없다 — 리스트로 돌려 사냥시킨다
    sh(`adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main ` +
       `-a android.intent.action.VIEW -d "${url}" > /dev/null`);
    await wait(1500);
    if (!await ensureList()) say(`   \x1b[2m⚠️ 리스트 확인 실패 — 그래도 기다려 봅니다\x1b[0m`);

    /**
     * 🔴 기다리는 동안 **앱이 살아 있는지도 함께 본다.**
     *    2026-08-13 에 접근성 권한이 시스템에 의해 해제되며 앱이 스스로 종료했는데,
     *    러너는 "콜을 못 잡았습니다"로만 끝났다. **앱이 죽은 건지 콜이 없는 건지
     *    구분이 안 돼** 원인을 찾는 데 한참 걸렸다. 사전 점검은 시작할 때만 도니까.
     */
    got = await until(async () => {
        if (!sh('adb shell settings get secure accessibility_enabled || true').startsWith('1'))
            die('앱의 접근성 권한이 꺼졌습니다 (시스템이 내렸을 수 있습니다).\n' +
                '   폰에서: 설정 → 접근성 → 설치된 앱 → 1DAL → 켬');
        if (!sh('adb shell pidof com.onedal.app || true'))
            die('1DAL 앱이 종료됐습니다. 폰에서 다시 실행해 주세요.');
        return findNew();
    }, 120000);
    if (!got) die(`${label} 을 잡지 못했습니다.\n` +
                  '   · 폰에서 시뮬레이터가 배차망 목록을 보여주고 있는지\n' +
                  '   · 크롬으로 열렸는지 (삼성 인터넷은 안 읽힘)\n' +
                  '   · pnpm e2e:app 으로 어느 단계에서 막히는지 먼저 보세요');
    return got;
}

/**
 * **관제탑 결재를 기다린다 — 기사님이 관제웹에서 직접 누르신다.**
 *
 * 소켓으로 대신 쏠 수도 있지만 그러면 관제웹 UI 코드(버튼 → 핸들러 → emit)를 안 거친다.
 * 기사님: *"관제웹에서 잡아서 콜 3개를 진행중으로 만들고"* — 직접 누르는 게 그 뜻이다.
 *
 * ⏱️ 데스밸리는 30초, 서버 자동 취소는 35초다. 그 안에 누르셔야 한다.
 */
async function waitForKeep(id, n) {
    const cur = (await orders()).find(o => o.id === id);
    if (cur && ACTIVE.includes(cur.status)) {
        ok(`${n}번째 콜 — 이미 확정됨`, `(${cur.status})`);
        return true;
    }
    say(`\n   \x1b[1m\x1b[33m👉 관제웹에서 [KEEP] 을 눌러 주세요 (${n}번째)\x1b[0m`);
    say(`   \x1b[2m30초 안에 안 누르시면 서버가 자동 취소합니다\x1b[0m`);

    const got = await until(async () => {
        const o = (await orders()).find(x => x.id === id);
        if (!o) return null;
        if (ACTIVE.includes(o.status)) return 'kept';
        if (['ORDER_CANCELED', 'ORDER_RELEASED', 'ORDER_FORCE_CANCELED'].includes(o.status)) return o.status;
        return null;
    }, 40000, 900);

    if (got === 'kept') { ok(`${n}번째 콜 KEEP 확인`); return true; }
    bad(`${n}번째 콜이 확정되지 않았습니다`, got ? `(${got} — 시간이 지났거나 CANCEL 을 누르셨습니다)` : '(응답 없음)');
    return false;
}

/** 통화 기록 — 시퀀스를 압축하지 않는다. 상차지·하차지를 각각 따로 저장한다 */
function call(orderId, stopType, extra = {}) {
    socket.emit('save-cargo-report', {
        orderId, stopType, kind: 'DECLARED',
        unit: '파레트', quantity: 1, handling: '지게차', tags: ['일반화물'], ...extra,
    });
}

const milestone = (orderId, m) => new Promise(res => {
    socket.emit('report-milestone', { orderId, milestone: m, occurredAt: new Date().toISOString() });
    socket.once('milestone-result', res);
});

// ─────────────────────────── 시퀀스 ───────────────────────────

async function main() {
    const url = await preflight();
    state.token = await connect();
    await wait(2500);   // 부트스트랩이 끝나고 filter-init 이 오기를 기다린다

    /**
     * 앞선 실행이 콜을 싣고 끝났으면 출발선이 "빈 차"가 아니다.
     * 그 상태로 시작하면 첫 단계부터 실패하고, 원인이 제품인지 잔여물인지 알 수 없다.
     * 패널티 없는 취소(FORCE_CANCELED)로 치우고 시작한다.
     */
    const leftover = (await orders()).filter(o => ACTIVE.includes(o.status));
    if (leftover.length) {
        head(`앞선 실행이 남긴 콜 ${leftover.length}건 정리`);
        for (const o of leftover) {
            await new Promise(res => {
                socket.emit('decision', { orderId: o.id, action: 'ORDER_FORCE_CANCELED' });
                socket.once('decision-ack', res);
            });
            ok(`정리: ${o.pickup?.slice(0, 18)}`);
        }
        await wait(3000);
    }

    head('출발선 — 빈 차, 첫짐 사냥');
    say(`   ${JSON.stringify(filterNow())}`);
    expect('활성 콜 0건', await activeCount(), 0);
    expect('첫짐 탐색(STANDBY)', state.filter?.dispatchPhase, 'STANDBY');
    expect('합짐 아님', state.filter?.isSharedMode, false);

    /**
     * 🔴 **사냥 조건을 테스트용으로 넓힌다 — 숨기지 않고 찍는다.**
     *
     * 지금 DB 에는 상차 반경 1km · 도착 반경 1km 가 들어 있다. 기사님이 반경 동작을
     * 확인하려고 낮춰 둔 진단용 값이다. 그 상태로는 시뮬레이터 콜이 거의 다 떨어진다 —
     * 실측: **최근 25건 중 도착지에서 24건, 상차 거리에서 16건 탈락.**
     * 그러면 이 스크립트는 "제품이 고장났다"가 아니라 **"콜이 안 잡힌다"** 로만 끝난다.
     *
     * 그래서 오늘 필터(activeFilter)만 넓힌다. **평소 설정(baseFilter)은 안 건드린다** —
     * 자정에 원래 값으로 돌아간다.
     */
    head('사냥 조건 준비 (오늘만 · 평소 설정은 안 건드림)');
    /**
     * 도착지를 **서울**로 잡는다. 시뮬레이터의 모의 주소 138개 중 서울행이 가장 많다
     * (파주 23 · 광주 21 · 서울 합계 30+). 파주로 두면 리스트 20건이 통째로 탈락해
     * "제품이 고장났다"가 아니라 **"콜이 안 잡힌다"** 로만 끝난다 — 실측으로 두 번 겪었다.
     *
     * 상차 반경도 1km 는 진단용 값이라 10km(기본값)로 되돌린다.
     * 서울 0km = 359개 동, 지리 연산 1ms.
     */
    const wide = { destinationCity: '서울', destinationRadiusKm: 0, pickupRadiusKm: 10 };
    say(`   도착 ${state.filter?.destinationCity}(${state.filter?.destinationRadiusKm}km) → 서울(0km) · ` +
        `상차 반경 ${state.filter?.pickupRadiusKm}km → 10km`);
    socket.emit('update-filter', wide);
    await wait(3000);   // 지리 재연산
    say(`   ${JSON.stringify(filterNow())}`);
    expect('도착 지역이 넓어졌다', filterNow().지역, n => n > 200);
    const before = filterNow();

    /**
     * ── 1부. 콜을 **먼저 다 모은다** ──
     *
     * 기사님: *"앱에서 콜을 잡아 서버에 보고하면 관제웹에서 잡아서 콜 3개를 진행 중으로 만들고
     *          그걸 하나씩 배송하는 시뮬레이션"*
     *
     * 처음엔 "잡고→통화→잡고→통화" 로 짰는데 실무와 달랐다. **선빵 중에는 사냥이 꺼진다**
     * (`orders.ts` 가 "다른 콜 물지 마"로 isActive=false 를 내린다). KEEP 을 눌러야 다시 켜진다.
     * 그래서 통화를 사이에 넣으면 그동안 사냥이 멈춰 다음 콜을 못 잡는다.
     * 기사님 말씀대로 **모으는 게 먼저**다 — 전화는 나중에 돌린다.
     */
    const TARGET = 3;
    const calls = [];
    const seen = new Set();

    for (let i = 1; i <= TARGET; i++) {
        head(`${i}번째 콜 — 앱이 잡고, 기사님이 결재`);
        const c = await huntOne(url, seen, `${i}번째 콜`);
        seen.add(c.id);
        ok('앱이 잡아 서버가 평가했다',
           `${c.pickup?.slice(0, 14)} → ${c.dropoff?.slice(0, 14)} ${c.fare?.toLocaleString()}원`);
        if (c.rejectionReasons?.length) say(`   \x1b[2m판정 사유: ${c.rejectionReasons.join(' · ')}\x1b[0m`);

        if (await waitForKeep(c.id, i)) calls.push(c);
        await wait(3000);   // 카카오 경로 + 회랑 재계산
        say(`   ${JSON.stringify(filterNow())}`);

        if (i === 1) {
            expect('합짐 수집(GATHERING) 으로 전환', state.filter?.dispatchPhase, 'GATHERING');
            expect('합짐 모드 켜짐', state.filter?.isSharedMode, true);
            expect('차종이 좁아졌다', filterNow().차종, n => n <= before.차종);
            expect('회랑 지역이 생겼다', filterNow().지역, n => n > 0);
        }
    }

    head('진행 중 콜이 모였는가');
    expect(`활성 콜 ${calls.length}건`, await activeCount(), calls.length);
    if (calls.length < TARGET) say(`   \x1b[2m(${TARGET}건을 목표했으나 ${calls.length}건 — 그대로 진행합니다)\x1b[0m`);

    /** ── 2부. 모은 콜에 하나씩 전화 ── */
    for (const [i, c] of calls.entries()) {
        head(`${i + 1}번째 콜 — 상차지 · 하차지 통화`);
        const f0 = filterNow();
        call(c.id, 'pickup', { deadlineAt: new Date(Date.now() + 90 * 60000).toISOString() });
        await wait(2200);
        call(c.id, 'dropoff', { deadlineAt: new Date(Date.now() + 180 * 60000).toISOString() });
        await wait(2200);
        ok('상차지·하차지 각각 저장', '(한 번에 두 단계를 건너뛰지 않는다)');
        if (i === 0) {
            say(`   ${JSON.stringify(filterNow())}`);
            expect('짐 신고가 적재 신뢰도를 올렸다', state.filter?.capacityConfidence,
                   c2 => c2 === 'DECLARED' || c2 === 'CONFIRMED');
            expect('신고 뒤 차종이 다시 파생됐다', filterNow().차종, n => n <= f0.차종);
        }
    }

    /** ── 3부. 운행 ── */
    head('배송 출발');
    socket.emit('update-filter', { driverAction: 'DRIVING' });
    await wait(3000);
    say(`   ${JSON.stringify(filterNow())}`);
    expect('운행 중(DELIVERING) 으로 전환', state.filter?.dispatchPhase, 'DELIVERING');

    head('하나씩 배송 — 상차 → 하차');
    for (const [i, c] of calls.entries()) {
        await milestone(c.id, 'ARRIVED_PICKUP');
        await milestone(c.id, 'PICKED_UP');
        ok(`콜${i + 1} 상차지 도착 → 상차 완료`);
        await milestone(c.id, 'ARRIVED_DROPOFF');
        await milestone(c.id, 'DELIVERED');
        ok(`콜${i + 1} 하차지 도착 → 하차 완료`);
        await wait(1500);
        say(`   \x1b[2m남은 활성 ${await activeCount()}건 · ${JSON.stringify(filterNow())}\x1b[0m`);
    }

    head('전부 끝났다 — 첫짐으로 복귀하는가');
    await wait(3000);
    say(`   ${JSON.stringify(filterNow())}`);
    expect('남은 활성 콜 0건', await activeCount(), 0);
    expect('첫짐 탐색(STANDBY) 복귀', state.filter?.dispatchPhase, 'STANDBY');
    expect('합짐 모드 꺼짐', state.filter?.isSharedMode, false);
    expect('빈 차이므로 적재 신뢰도 CONFIRMED', state.filter?.capacityConfidence, 'CONFIRMED');
    expect('차종이 원래대로 넓어졌다', filterNow().차종, n => n === before.차종);
    expect('오늘 필터(도착 지역)는 살아 있다', filterNow().지역, n => n > 0);

    console.log(`\n${'─'.repeat(60)}`);
    console.log(fails === 0 ? '✅ 시퀀스 전 구간 통과' : `🔴 어긋난 예측 ${fails}건`);
    socket.close();
    process.exit(fails === 0 ? 0 : 1);
}

main().catch(e => { console.error('\n🔴', e.message); socket?.close(); process.exit(1); });
