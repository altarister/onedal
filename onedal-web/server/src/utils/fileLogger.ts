import fs from 'fs';
import path from 'path';

/**
 * 서버 로그를 **파일에도** 남긴다.
 *
 * 기사님(2026-08-14): *"서버 로그를 파일로 남기게 만들어줘."*
 *
 * 왜 필요한가 — 오늘 하루만 해도 *"🏁 도착 감지가 몇 번 찍혔나"* · *"지나온 구간이 돌았나"* ·
 * *"isActive 가 언제 꺼졌나"* 를 확인하려면 매번 기사님이 터미널을 복사해 줘야 했다.
 * 서버 로그는 콘솔에만 있었고, 콘솔은 스크롤이 지나가면 사라진다.
 *
 * 🔴 **터미널 출력은 그대로 둔다.** 파일은 *추가*지 대체가 아니다 —
 *    기사님이 지금처럼 터미널을 보면서 일하시는 흐름을 바꾸지 않는다.
 */

/** 며칠 지난 로그를 지우는가. 디스크가 조용히 차는 것을 막는다 */
const KEEP_DAYS = 3;

/** 한 파일이 이보다 커지면 더 쓰지 않고 한 번만 알린다 (디스크 보호) */
const MAX_BYTES = 200 * 1024 * 1024;

const LOG_DIR = path.join(__dirname, '../../logs');

let stream: fs.WriteStream | null = null;
let written = 0;
let warnedFull = false;

/** ANSI 색상 코드 제거 — 파일에서는 읽기만 나쁘게 만든다 */
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const stamp = () => {
    const d = new Date(Date.now() + 9 * 3600 * 1000);   // KST
    return d.toISOString().slice(11, 23);
};

/** 오래된 로그 정리 — 부팅 때 한 번만 */
function sweepOld() {
    try {
        const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
        for (const f of fs.readdirSync(LOG_DIR)) {
            if (!f.startsWith('server-') || !f.endsWith('.log')) continue;
            const p = path.join(LOG_DIR, f);
            if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
        }
    } catch { /* 정리 실패가 부팅을 막지 않는다 */ }
}

/**
 * `console.log/warn/error` 를 가로채 파일에도 쓴다.
 *
 * ⚠️ **동기 쓰기(`appendFileSync`)를 쓰지 않는다.** 이 레포는 이벤트 루프가 막혀 사고가 난
 *    적이 있고(`65f739a`), 로그는 초당 수십 줄이 나온다. 스트림에 흘려보낸다.
 *
 * `index.ts` 맨 위에서 한 번만 부른다 — 그래야 부팅 로그부터 남는다.
 */
export function initFileLogger(): void {
    if (stream) return;

    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        sweepOld();

        const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
        /**
         * 🔴 **포트가 다르면 파일도 다르다.**
         *    검사·재현용으로 다른 포트에 서버를 띄우는 일이 잦은데(scenario · 부팅 스모크 ·
         *    버그 재현), 한 파일에 섞이면 **어느 서버가 찍은 줄인지 알 수 없다.**
         *    실제로 2026-08-14 에 재현용 서버(4025)와 개발 서버(4000)가 같은 파일에 섞여
         *    "포트 4000" 이라 적힌 줄을 4025 서버 것으로 잘못 읽을 뻔했다.
         *    평소 쓰는 4000 은 접미사 없이 둔다 — 찾기 쉬워야 한다.
         */
        const port = process.env.PORT || '4000';
        const suffix = port === '4000' ? '' : `-${port}`;
        const file = path.join(LOG_DIR, `server-${day}${suffix}.log`);
        stream = fs.createWriteStream(file, { flags: 'a' });
        try { written = fs.statSync(file).size; } catch { written = 0; }

        const write = (level: string, args: unknown[]) => {
            if (!stream) return;
            if (written > MAX_BYTES) {
                if (!warnedFull) {
                    warnedFull = true;
                    origError(`🚨 [로그 파일] ${MAX_BYTES / 1024 / 1024}MB 를 넘어 파일 기록을 멈춥니다 (터미널 출력은 계속됩니다)`);
                }
                return;
            }
            const line = `${stamp()} ${level} ` + args.map(a =>
                typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()
            ).join(' ') + '\n';
            const clean = stripAnsi(line);
            written += clean.length;
            stream.write(clean);
        };

        const origLog = console.log.bind(console);
        const origWarn = console.warn.bind(console);
        const origError = console.error.bind(console);

        // 🔴 원래 출력을 **먼저** 한다. 파일 쓰기가 실패해도 터미널은 살아 있어야 한다
        console.log = (...a: unknown[]) => { origLog(...a); write('   ', a); };
        console.warn = (...a: unknown[]) => { origWarn(...a); write('WRN', a); };
        console.error = (...a: unknown[]) => { origError(...a); write('ERR', a); };

        origLog(`📝 [로그 파일] ${path.relative(process.cwd(), file)} 에 함께 기록합니다 (${KEEP_DAYS}일 보관)`);
    } catch (e) {
        // 로그를 못 남기는 것이 서버를 멈출 이유는 아니다
        console.error('📝 [로그 파일] 초기화 실패 — 터미널 출력만 남습니다:', e);
    }
}
