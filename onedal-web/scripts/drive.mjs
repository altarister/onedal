#!/usr/bin/env node
/**
 * 🚚 **모의 주행 — 콜을 싣고 끝까지 «달려» 본다** (2026-08-29 신설)
 *
 * ══ 왜 만들었는가 ══
 *
 * 2026-08-29 에 고친 넷 중 **셋이 «주행에서만 확인되는 것»** 이었다:
 *   ① 경로 순서가 «지나가는 길목부터» 인가        (실주행 동작이 바뀌었다)
 *   ② 도착 감지가 정거장마다 찍히는가              (08-28 주행에서 한 번도 못 봤다)
 *   ③ 궤적의 `stop_type` 이 pickup → dropoff 로 넘어가는가
 *
 * 기사님이 나가 봐야만 알 수 있으면 **하루에 한 번밖에 못 고친다.** 그래서 GPS 를
 * 재생해 그 셋을 책상에서 잡는다.
 *
 * `pnpm scenario` 와 다르다 — 그건 **첫 상차지 하나만** GPS 로 찍고 나머지 단계는
 * 버튼(`report-milestone`)으로 넘긴다. 여기는 **모든 정거장을 GPS 로 걸어간다.**
 * 그래야 «정거장이 넘어가는가»(`nextStopOf`)를 실제로 본다.
 *
 * ══ 실행 ══
 *     cd onedal-web && pnpm drive
 *
 * 전용 포트 4014 · 전용 DB `drive.db` 로 서버를 띄우고 검사한 뒤 지운다.
 * 개발 서버(4000)·`local.db` 는 건드리지 않는다.
 *
 * ⚠️ **좌표는 지어낸 것이 아니다.** 2026-08-25 기사님 실측 사고의 그 지점들이다
 *    (곤지암 4.0km · 가남 29.9km) — `tests/rules/stopOrderNearest.test.ts` 와 같은 좌표.
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SERVER = join(ROOT, 'server');
const PORT = 4014;
const DB = 'drive.db';

const require = createRequire(join(SERVER, 'index.js'));
const Database = require('better-sqlite3');
const { io } = await import(join(ROOT, 'client-app/node_modules/socket.io-client/build/esm/index.js'));

const wait = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok });
    console.log(`  ${ok ? '✅' : '🔴'} ${name}${detail ? `  ${detail}` : ''}`);
};

// ── 2026-08-25 실측 지점 (서→동 일직선) ────────────────────
const 태전 = { x: 127.1707, y: 37.4046 };
const 곤지암 = { x: 127.3366, y: 37.3648 };
const 세종대왕면 = { x: 127.5853, y: 37.2911 };
const 가남 = { x: 127.5768, y: 37.2302 };
/** 기사님 위치 — 곤지암 하차가 4km, 가남 상차가 30km */
const 현위치 = { x: 127.2900, y: 37.3700 };

const R = 6371, rad = Math.PI / 180;
const km = (y1, x1, y2, x2) => {
    const a = Math.sin((y2 - y1) * rad / 2) ** 2
        + Math.cos(y1 * rad) * Math.cos(y2 * rad) * Math.sin((x2 - x1) * rad / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
};

// ─────────────────────────── 시드 ───────────────────────────
function seed() {
    const dst = join(SERVER, DB);
    for (const f of [dst, `${dst}-wal`, `${dst}-shm`]) if (existsSync(f)) rmSync(f);
    return dst;   // 빈 DB 로 시작한다 — 서버가 부팅하며 스키마를 만든다
}

/**
 * 콜 둘을 손으로 넣는다 — **08-25 의 그 상황**이다.
 *   A: 곤지암 상차 → 세종대왕면 하차   (이미 상차함 → 하차만 남았고 4km 앞)
 *   B: 가남 상차   → 태전 하차          (아직 안 실음 → 30km 밖)
 * 「상차 먼저」 규칙이면 B상차(30km)부터 가고, 「길목부터」면 A하차(4km)부터 간다.
 */
function seedCalls(dbPath, userId) {
    const c = new Database(dbPath);
    const iso = new Date().toISOString();
    // ⚠️ `places.id` 는 INTEGER AUTOINCREMENT 다 — 문자열 id 를 넣으면 datatype mismatch 로 죽는다
    const place = (label, p) => {
        const r = c.prepare(`INSERT INTO places (address, addressDetail, x, y, region, visitCount)
                             VALUES (?,?,?,?,?,0)`).run(`모의-${label}`, `모의-${label}`, p.x, p.y, '경기');
        return r.lastInsertRowid;
    };
    const mk = (id, pk, dp, status) => {
        c.prepare(`INSERT INTO orders (id, type, status, userId, capturedAt, timestamp,
                                       pickup, dropoff, fare, vehicleType, paymentType, deliveryDistance)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
            .run(id, 'AUTO_CLICK', status, userId, iso, iso,
                 `모의-${id}-상차`, `모의-${id}-하차`, 50000, '1t', '신용', 30);
        c.prepare(`INSERT INTO orderStops (orderId, stopType, placeId) VALUES (?,?,?)`)
            .run(id, 'pickup', place(`${id}-p`, pk));
        c.prepare(`INSERT INTO orderStops (orderId, stopType, placeId) VALUES (?,?,?)`)
            .run(id, 'dropoff', place(`${id}-d`, dp));
    };
    mk('DRIVE-A', 곤지암, 세종대왕면, 'ORDER_PICKED_UP');   // 이미 실었다
    mk('DRIVE-B', 가남, 태전, 'ORDER_CONFIRMED');           // 아직 안 실었다
    c.close();
}

// ─────────────────────────── 서버 ───────────────────────────
async function boot() {
    try {
        const pids = execSync(`lsof -ti :${PORT} || true`, { encoding: 'utf8' }).trim();
        if (pids) {
            console.log(`🧹 ${PORT} 포트를 쥐고 있던 옛 프로세스를 정리합니다`);
            execSync(`kill -9 ${pids.split('\n').join(' ')}`);
            await wait(1000);
        }
    } catch { /* lsof 없는 환경 */ }

    const bootAfter = Date.now();
    const p = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: SERVER,
        env: { ...process.env, DB_FILE: DB, PORT: String(PORT) },
        stdio: process.env.DRIVE_LOG ? 'inherit' : 'ignore',
    });
    for (let i = 0; i < 40; i++) {
        await wait(1000);
        try {
            const h = await (await fetch(`http://localhost:${PORT}/api/health`)).json();
            // 옛 서버를 붙잡고 오진한 적이 있다 — 매번 확인한다
            if (new Date(h.bootedAt).getTime() < bootAfter) {
                p.kill('SIGKILL');
                throw new Error(`🔴 ${PORT} 에 옛 서버가 응답합니다 (bootedAt=${h.bootedAt})`);
            }
            console.log(`🚀 서버 기동 · bootedAt=${h.bootedAt}\n`);
            return p;
        } catch (e) {
            if (String(e.message).startsWith('🔴')) throw e;
        }
    }
    p.kill('SIGKILL');
    throw new Error('서버가 40초 안에 뜨지 않았습니다');
}

const token = async () => (await (await fetch(`http://localhost:${PORT}/api/auth/bypass`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
})).json()).accessToken;

// ─────────────────────────── 주행 ───────────────────────────
async function main() {
    const dbPath = seed();
    const proc = await boot();
    let db;
    try {
        const tok = await token();
        const me = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString());
        seedCalls(dbPath, me.id);

        const st = { arrived: [], approaching: [], routeStops: [] };
        const s = io(`http://localhost:${PORT}`, { auth: { token: tok }, transports: ['websocket'] });
        await new Promise((res, rej) => {
            s.once('connect', res);
            s.once('connect_error', e => rej(new Error(e.message)));
            setTimeout(() => rej(new Error('소켓 연결 시간 초과')), 8000);
        });
        s.on('auto-arrived', p => st.arrived.push(p));
        // ⚠️ 이벤트 이름은 `pnpm audit:socket` 이 뽑는 목록과 대조한다 — 틀린 이름을 들으면
        //    멀쩡한 제품을 «안 울린다»고 오진한다 (여기서 실제로 `auto-approaching` 으로 잘못 듣고
        //    한 번 오진했다). 근접 예고의 실제 이름은 `next-stop-approaching` 이다
        s.on('next-stop-approaching', p => st.approaching.push(p));
        s.on('sync-active-orders', p => { if (p?.routeStops) st.routeStops = p.routeStops; });

        // 서버가 콜을 세션에 싣게 한다 (복구 경로 — 앱 없이 콜을 올리는 유일한 길)
        await fetch(`http://localhost:${PORT}/api/orders`, { headers: { Authorization: `Bearer ${tok}` } });
        await wait(1500);

        const orders = await (await fetch(`http://localhost:${PORT}/api/orders`,
            { headers: { Authorization: `Bearer ${tok}` } })).json();
        const active = (orders?.orders ?? orders ?? []).filter(o => ['ORDER_CONFIRMED', 'ORDER_PICKED_UP'].includes(o.status));
        check('콜 2건이 세션에 실렸다', active.length === 2, `${active.length}건`);
        if (active.length !== 2) throw new Error('콜이 안 실려 주행을 못 한다');

        // ── ① 경로 순서 ────────────────────────────────────
        console.log('\n═══ ① 경로 순서 — 지나가는 길목부터 ═══');
        s.emit('dashboard-gps-update', { lat: 현위치.y, lng: 현위치.x, source: 'mock' });
        await wait(1500);

        const order = st.routeStops.map(r => `${r.orderId}:${r.stopType}`);
        console.log(`  방문 순서: ${order.join(' → ')}`);
        check('🔴 4km 앞 하차지(A)를 두고 30km 밖 상차지(B)로 먼저 가지 않는다',
            order[0] === 'DRIVE-A:dropoff', `첫 정거장 ${order[0] ?? '(없음)'}`);
        check('상차를 안 한 콜(B)의 하차지는 그 상차지보다 뒤다',
            order.indexOf('DRIVE-B:dropoff') > order.indexOf('DRIVE-B:pickup'));
        check('이미 상차한 콜(A)의 상차지는 목록에 없다', !order.includes('DRIVE-A:pickup'));

        // ── ② 정거장마다 GPS 로 걸어간다 ──────────────────
        console.log('\n═══ ② 도착 감지 — 정거장마다 찍히는가 ═══');
        const coord = { 'DRIVE-A:dropoff': 세종대왕면, 'DRIVE-B:pickup': 가남, 'DRIVE-B:dropoff': 태전 };

        for (const key of order) {
            const to = coord[key];
            if (!to) { console.log(`  ⚠️ ${key} 좌표를 모른다 — 건너뜀`); continue; }
            const before = st.arrived.length;

            // 접근 — 500m 밖에서 한 점 (근접 예고가 울려야 하는 구간)
            s.emit('dashboard-gps-update', { lat: to.y + 0.02, lng: to.x, source: 'mock' });
            await wait(400);
            // 도착 — 반경 안에서 멈춰 선다 (mock 은 정지로 본다)
            s.emit('dashboard-gps-update', { lat: to.y, lng: to.x, source: 'mock' });
            await wait(500);
            s.emit('dashboard-gps-update', { lat: to.y + 0.00001, lng: to.x, source: 'mock' });
            await wait(900);

            const fired = st.arrived.length > before;
            check(`${key} 도착이 찍혔다`, fired, fired ? `누적 ${st.arrived.length}회` : '발화 없음');

            // 상차지였으면 실었다고 보고해야 다음 정거장으로 넘어간다
            if (key.endsWith(':pickup')) {
                s.emit('report-milestone', { orderId: key.split(':')[0], milestone: 'PICKED_UP' });
                await wait(700);
            }
        }

        check('🔴 도착이 정거장 수만큼 찍혔다 (한 정거장당 1회)',
            st.arrived.length === order.length, `${st.arrived.length}/${order.length}회`);
        check('근접 예고(도착전 통화)도 울렸다', st.approaching.length >= 1, `${st.approaching.length}회`);

        // ── ③ 궤적의 stop_type ────────────────────────────
        console.log('\n═══ ③ 궤적 — stop_type 이 넘어가는가 ═══');
        await wait(1200);   // 궤적 버퍼가 디스크로 가기를 기다린다 (10초 주기 · 5점)
        db = new Database(dbPath, { readonly: true });
        const rows = db.prepare(`SELECT order_id, stop_type, COUNT(*) n FROM gps_tracks
                                 WHERE stop_type IS NOT NULL GROUP BY order_id, stop_type`).all();
        for (const r of rows) console.log(`  ${r.order_id} ${r.stop_type}: ${r.n}점`);
        const kinds = new Set(rows.map(r => r.stop_type));
        check('🔴 pickup 과 dropoff 가 **둘 다** 찍혔다 (08-28 에는 pickup 뿐이었다)',
            kinds.has('pickup') && kinds.has('dropoff'), `[${[...kinds].join(', ')}]`);
        check('궤적에 콜이 붙었다 (order_id 가 빈 점만 있으면 안 된다)',
            rows.length > 0, `${rows.length}종`);

        s.close();
    } finally {
        db?.close();
        proc.kill('SIGKILL');
        for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) if (existsSync(f)) rmSync(f);
    }

    const bad = results.filter(r => !r.ok);
    console.log(`\n${'─'.repeat(52)}`);
    console.log(`검사 ${results.length}건 · 통과 ${results.length - bad.length} · 실패 ${bad.length}`);
    if (bad.length) {
        console.log(`\n🔴 실패:\n${bad.map(b => `   · ${b.name}`).join('\n')}\n`);
        process.exit(1);
    }
    console.log('\n✅ 모의 주행 이상 없음\n');
}

main().catch(e => { console.error(`\n🔴 ${e.message}\n`); process.exit(1); });
