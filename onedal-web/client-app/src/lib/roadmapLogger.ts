/**
 * 🖥️ **관제웹 로그 — 콘솔에 찍고, 서버에도 올린다**
 *
 * ── 왜 올리나 ──
 * 콘솔은 주행이 끝나면 사라지고, 폰 크롬으로 열면 `Capacitor/Console` 조차 없다 —
 * 콘솔에만 찍으면 실주행 뒤 **관제웹이 그때 무엇을 하고 있었는지 알 방법이 없다.**
 * 원달앱 로그와 같은 수준으로 남긴다 (기사님).
 *
 * ── 왜 HTTP 인가 ──
 * 🔴 **소켓이 끊긴 걸 소켓으로 보낼 수는 없다.** 가장 알고 싶은 것이 *"주행 중 소켓이
 *    몇 번 끊겼나"* 인데 그 순간 소켓은 못 쓴다. 끊긴 동안 여기 쌓아 두었다가
 *    통신이 되면 한꺼번에 올린다.
 *
 * ⚠️ **화면을 멈추지 않는다.** 실패해도 조용히 넘어가고 버퍼만 지킨다 —
 *    로그 때문에 관제웹이 느려지면 그게 더 큰 사고다 (기사님: *"관제앱이 너무 느림"*).
 */

import { apiBase } from './serverTarget';

interface Line { at: string; msg: string }

const BUFFER: Line[] = [];
/** 이 수를 넘으면 즉시 보낸다 */
const FLUSH_LINES = 20;
/** 이 시간마다 남은 것을 보낸다 (ms) */
const FLUSH_MS = 2000;
/** 통신이 안 될 때 들고 있을 최대치 — 넘으면 **오래된 것부터** 버린다 (최근이 더 쓸모 있다) */
const MAX_BUFFER = 500;

/** 🔴 서버가 꺼져 있을 때 물러서는 한계 — 30초. 이보다 더 물러서면 돌아온 걸 늦게 안다 */
const MAX_BACKOFF_MS = 30_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let dropped = 0;
let warnedOnce = false;
/** 0 이면 평소 간격. 실패할 때마다 두 배씩 물러선다 (2 → 4 → 8 → 16 → 30초) */
let backoffMs = 0;

/** 폰을 구분할 이름 — 없으면 «관제웹» */
function deviceId(): string {
    try {
        return localStorage.getItem('deviceId') || localStorage.getItem('pairedDeviceId') || '관제웹';
    } catch {
        return '관제웹';
    }
}

async function flush(): Promise<void> {
    if (timer) { clearTimeout(timer); timer = null; }
    if (BUFFER.length === 0) return;

    const lines = BUFFER.splice(0, BUFFER.length);
    if (dropped > 0) {
        lines.unshift({ at: lines[0]?.at ?? '', msg: `⚠️ 버퍼가 차서 ${dropped}줄을 버렸습니다` });
        dropped = 0;
    }
    try {
        await fetch(`${apiBase()}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: deviceId(), lines }),
            keepalive: true,   // 탭이 닫혀도 마지막 묶음은 나간다
        });
        backoffMs = 0;          // 통했다 — 평소 간격으로 돌아간다
        warnedOnce = false;     // 다음에 또 끊기면 그때 한 번 더 알린다
    } catch {
        // 🔴 못 보냈으면 **되돌려 놓는다.** 통신이 끊긴 구간이야말로 나중에 봐야 할 자리다
        BUFFER.unshift(...lines);
        while (BUFFER.length > MAX_BUFFER) { BUFFER.shift(); dropped++; }
        if (!warnedOnce) {
            warnedOnce = true;
            console.warn('🖥️ [로그 전송 실패] 통신이 되면 한꺼번에 올립니다 (화면은 계속 돕니다)');
        }
        /**
         * 🔴 **물러서며 다시 건다**.
         *
         * 실패해도 늘 2초 뒤 다시 걸면, 서버를 꺼 둔 동안 무한 재시도가 되어
         * 관제웹 콘솔이 `ERR_CONNECTION_REFUSED` 로 도배된다.
         *
         * ⚠️ 실패한 `fetch` 는 **브라우저가 스스로** 콘솔에 찍는다. `try/catch` 로는 못 막는다.
         *    그러니 줄일 방법은 **덜 시도하는 것**뿐이다 — 2초 → 30초로 물러선다(15배 줄어든다).
         *
         * 🔴 **포기하지는 않는다.** 서버가 돌아오면 첫 성공에서 `backoffMs` 가 0이 되고
         *    쌓아 둔 줄이 한꺼번에 올라간다. 끊긴 구간의 로그는 여전히 보존된다.
         */
        backoffMs = Math.min(backoffMs ? backoffMs * 2 : FLUSH_MS * 2, MAX_BACKOFF_MS);
        schedule(backoffMs);
    }
}

function schedule(delayMs: number = FLUSH_MS): void {
    if (timer) return;
    timer = setTimeout(() => { void flush(); }, delayMs);
}

export function logRoadmapEvent(platform: "서버" | "웹" | "앱", message: string, page: string = "") {
  const now = new Date();
  const ts = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  let emoji = "";
  switch (platform) {
    case "서버": emoji = "☁️서버"; break;
    case "웹": emoji = "🖥️관제웹"; break;
    case "앱": emoji = "📱앱"; break;
  }
  const pageStr = page ? ` [${page}]` : "";
  const line = `[${emoji}]${pageStr} ${message}`;
  console.log(`[ROADMAP ${ts}] ${line}`);

  /**
   * 🔴 **서버가 자기 줄을 되돌려 받지 않는다.** `platform: "서버"` 는 관제웹이
   *    *"서버로부터 받았다"* 고 적는 줄이라 서버 로그에 이미 있다. 그것까지 올리면
   *    같은 사건이 두 벌로 남아 나중에 세는 사람을 헷갈리게 한다.
   */
  if (platform === "서버") return;

  BUFFER.push({ at: ts, msg: line });
  while (BUFFER.length > MAX_BUFFER) { BUFFER.shift(); dropped++; }
  if (BUFFER.length >= FLUSH_LINES) void flush();
  else schedule();
}

/**
 * 🧠 **관제웹이 쓰는 메모리를 주기적으로 남긴다** (기사님 확정)
 *
 * ── 왜 ──
 * 관제웹이 크롬 「Aw, Snap!」(렌더러 사망)으로 죽는 일이 반복되는데, **죽은 까닭을 못 가린다.**
 * 위 버퍼가 2초에 한 번 모아 보내므로 **죽기 직전 1~2초의 로그는 보내지 못하고 사라지고**,
 * 렌더러가 죽으면 콘솔도 함께 사라진다 (실측 14:00:12 — 마지막 줄이 「경로 끝 대기」였고
 * 그 처리 자체는 깨끗했다).
 *
 * 그래서 **죽는 순간이 아니라 죽기까지의 흐름**을 남긴다. 다음에 죽으면 이 줄들로 갈린다:
 *   · 숫자가 계단처럼 올라가다 끊겼다 → 무언가 쌓인다 (어느 화면에서 오르는지도 보인다)
 *   · 평평하다가 갑자기 끊겼다 → 쌓이는 것이 아니라 한 번에 터진 것 (큰 배열·렌더 폭주)
 *
 * 🔴 **크롬 전용이다** — `performance.memory` 는 표준이 아니라 다른 브라우저에 없다.
 *    없으면 **조용히 아무것도 안 한다** (지어내지 않는다 · 규칙 ④).
 * 🔴 **한 번만 걸린다** — 두 번 부르면 타이머가 겹쳐 로그가 두 배로 쌓인다.
 * ⚠️ 30초에 한 줄이라 서버 로그가 한 시간에 120줄 늘어난다. 까닭을 찾으면 뺀다.
 */
const MEMORY_TICK_MS = 30_000;
let memoryTimer: ReturnType<typeof setInterval> | null = null;

export function startMemoryWatch(): void {
    if (memoryTimer) return;
    const mem = () => (performance as unknown as {
        memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
    }).memory;
    if (!mem()) return;                     // 크롬이 아니다 — 조용히 물러난다

    const record = () => {
        const m = mem();
        if (!m) return;
        const MB = (b: number) => Math.round(b / 1024 / 1024);
        const pct = Math.round((m.usedJSHeapSize / m.jsHeapSizeLimit) * 100);
        logRoadmapEvent('웹',
            `🧠 [메모리] 쓰는 중 ${MB(m.usedJSHeapSize)}MB / 잡아 둔 ${MB(m.totalJSHeapSize)}MB · `
            + `한계 ${MB(m.jsHeapSizeLimit)}MB (${pct}%)`);
    };
    record();                                // 첫 줄은 바로 — 30초를 못 버티고 죽을 수도 있다
    memoryTimer = setInterval(record, MEMORY_TICK_MS);
}

/**
 * 📡 **상태가 바뀔 때만 남긴다** — 매초 찍으면 로그가 묻힌다.
 *
 * 관제앱 웹뷰는 초당 여러 번 다시 그린다 — 그리는 횟수를 다 남기면 정작 사건이 안 보인다.
 * **바뀐 순간만** 남긴다. *"주행 중 소켓이 몇 번 끊겼나 · 화면이 무엇을 그리고 있었나"* 가
 * 이걸로 남는다.
 */
const lastState = new Map<string, string>();
export function logStateChange(key: string, value: string, page: string = ""): void {
    if (lastState.get(key) === value) return;
    const before = lastState.get(key);
    lastState.set(key, value);
    logRoadmapEvent("웹", `📡 [${key}] ${before === undefined ? value : `${before} → ${value}`}`, page);
}

/** 탭을 닫거나 화면이 가려지면 남은 것을 밀어 넣는다 — 주행 끝의 마지막 줄이 가장 아쉽다 */
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') void flush();
    });
    window.addEventListener('pagehide', () => { void flush(); });
}

/**
 * 🎣 **콘솔에 찍히는 것도 같이 올린다** (기사님).
 *
 * 기사님: *"예전에 리액트로 만들 때 콘솔을 찍도록 만들어져 있는데.. 그것들도 로그로
 * 나가면 좋을 듯싶은데."*
 *
 * 관제웹의 `console.log/warn/error` 는 대부분 «무슨 일이 있었나»를 말하는 줄인데,
 * 브라우저 콘솔에만 두면 주행이 끝날 때 사라진다.
 *
 * ⚠️ **USB 로 logcat 을 보는 것과는 다르다.** logcat 은 폰이 컴퓨터에 묶여 있을 때만
 *    보이고, 관제웹을 크롬으로 열면 `Capacitor/Console`
 *    자체가 없다. 주행 중에는 폰이 차에 있으므로 **서버로 보내는 길만 남는다.**
 *
 * 🔴 **되먹임을 막는 장치 셋**
 *   ① `[ROADMAP` 줄은 건너뛴다 — `logRoadmapEvent` 가 이미 버퍼에 넣었다
 *   ② 우리 자신의 실패 알림(`🖥️ [로그`)은 건너뛴다 — 실패가 실패를 부른다
 *   ③ **초당 상한**을 둔다. 실수로 루프에서 찍는 코드가 들어와도 파일을 못 채운다.
 *      넘친 줄은 세어서 «몇 줄 넘쳤다»로 한 줄 남긴다 (조용히 버리지 않는다)
 */
const PER_SEC_CAP = 30;
let secBucket = 0;
let secStamp = 0;
let overflow = 0;

export function installConsoleCapture(): void {
    if (typeof console === 'undefined' || (console as any).__1dalCaptured) return;
    (console as any).__1dalCaptured = true;

    const wrap = (level: 'log' | 'warn' | 'error') => {
        const original = console[level].bind(console);
        console[level] = (...args: unknown[]) => {
            original(...args);
            try {
                const text = args.map(a =>
                    typeof a === 'string' ? a
                        : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()
                ).join(' ');
                if (!text) return;
                if (text.startsWith('[ROADMAP ')) return;   // ① 이미 버퍼에 있다
                if (text.startsWith('🖥️ [로그')) return;     // ② 실패가 실패를 부른다

                const now = Date.now();
                if (now - secStamp >= 1000) {               // ③ 초당 상한
                    if (overflow > 0) {
                        push(`⚠️ [콘솔 넘침] ${overflow}줄을 못 실었습니다 (초당 ${PER_SEC_CAP}줄까지)`);
                        overflow = 0;
                    }
                    secStamp = now; secBucket = 0;
                }
                if (secBucket >= PER_SEC_CAP) { overflow++; return; }
                secBucket++;

                const tag = level === 'log' ? '' : `[${level.toUpperCase()}] `;
                push(`${tag}${text}`);
            } catch { /* 로그가 화면을 죽이지 않는다 */ }
        };
    };
    (['log', 'warn', 'error'] as const).forEach(wrap);
}

/** 버퍼에 한 줄 — 시각은 여기서 찍는다 */
function push(msg: string): void {
    const now = new Date();
    const ts = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    BUFFER.push({ at: ts, msg: `[🖥️콘솔] ${msg}`.slice(0, 500) });
    while (BUFFER.length > MAX_BUFFER) { BUFFER.shift(); dropped++; }
    if (BUFFER.length >= FLUSH_LINES) void flush();
    else schedule();
}
