/**
 * 🖥️ **관제웹 로그 — 콘솔에 찍고, 서버에도 올린다** (필드테스트 1회차 ④ · 2026-08-25)
 *
 * ── 왜 바꿨나 ──
 * 2026-08-23 실주행 3시간 뒤, **관제웹이 그때 무엇을 하고 있었는지 알 방법이 없었다.**
 * 이 함수는 `console.log` 한 줄이 전부였고, 콘솔은 주행이 끝나면 사라진다.
 * (그날은 폰 크롬으로 갔으니 `Capacitor/Console` 조차 0줄이었다)
 *
 * 기사님 기록(todo.md ④): *"A24폰 원달앱이 없었으면 1회차는 원인 불명으로 끝났다.
 * 같은 수준이 필요하다."*
 *
 * ── 왜 HTTP 인가 ──
 * 🔴 **소켓이 끊긴 걸 소켓으로 보낼 수는 없다.** 가장 알고 싶은 것이 *"주행 중 소켓이
 *    몇 번 끊겼나"* 인데 그 순간 소켓은 못 쓴다. 끊긴 동안 여기 쌓아 두었다가
 *    통신이 되면 한꺼번에 올린다.
 *
 * ⚠️ **화면을 멈추지 않는다.** 실패해도 조용히 넘어가고 버퍼만 지킨다 —
 *    로그 때문에 관제웹이 느려지면 그게 더 큰 사고다 (기사님: *"관제앱이 너무 느림"*).
 */

interface Line { at: string; msg: string }

const BUFFER: Line[] = [];
/** 이 수를 넘으면 즉시 보낸다 */
const FLUSH_LINES = 20;
/** 이 시간마다 남은 것을 보낸다 (ms) */
const FLUSH_MS = 2000;
/** 통신이 안 될 때 들고 있을 최대치 — 넘으면 **오래된 것부터** 버린다 (최근이 더 쓸모 있다) */
const MAX_BUFFER = 500;

let timer: ReturnType<typeof setTimeout> | null = null;
let dropped = 0;
let warnedOnce = false;

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
        await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ deviceId: deviceId(), lines }),
            keepalive: true,   // 탭이 닫혀도 마지막 묶음은 나간다
        });
    } catch {
        // 🔴 못 보냈으면 **되돌려 놓는다.** 통신이 끊긴 구간이야말로 나중에 봐야 할 자리다
        BUFFER.unshift(...lines);
        while (BUFFER.length > MAX_BUFFER) { BUFFER.shift(); dropped++; }
        if (!warnedOnce) {
            warnedOnce = true;
            console.warn('🖥️ [로그 전송 실패] 통신이 되면 한꺼번에 올립니다 (화면은 계속 돕니다)');
        }
        schedule();
    }
}

function schedule(): void {
    if (timer) return;
    timer = setTimeout(() => { void flush(); }, FLUSH_MS);
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
 * 📡 **상태가 바뀔 때만 남긴다** — 매초 찍으면 로그가 묻힌다.
 *
 * 기사님 실측(2026-08-23): 관제앱 웹뷰가 **초당 5.5회** 다시 그렸다.
 * 그리는 횟수를 다 남기면 정작 사건이 안 보인다. **바뀐 순간만** 남긴다.
 *
 * 어제 문서 §4-2 가 *"주행 중 소켓이 몇 번 끊겼나 · 화면이 무엇을 그리고 있었나"* 를
 * 모른다고 적어 뒀다 — 그 둘이 이걸로 남는다.
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
