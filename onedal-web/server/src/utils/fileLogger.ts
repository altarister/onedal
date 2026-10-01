import fs from 'fs';
import path from 'path';
import { LOG_TAGS, NO_TAG, kstDateText, maskPhone, type LogTag } from '@onedal/shared';
import { whoNow } from './logContext';

/**
 * 서버 로그를 **파일에도** 남긴다.
 *
 * 기사님: *"서버 로그를 파일로 남기게 만들어줘."*
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

let started = false;

/** ANSI 색상 코드 제거 — 파일에서는 읽기만 나쁘게 만든다 */
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const KST_MS = 9 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

const stamp = () => {
    const d = new Date(Date.now() + KST_MS);   // KST
    return d.toISOString().slice(11, 23);
};

/**
 * 🪪 **파일에 쓰는 줄 꾸미기** (reviews/29 1단계 I·J) — 휴대폰 번호를 가리고, 누구의 일인지 알면 줄 끝에 «@기사».
 *    줄 앞머리(시각 · 수준 · #태그)는 `pnpm log` 가 읽는 자리라 건드리지 않는다. 터미널 출력은 원문 그대로다.
 */
export function decorateFileLine(line: string, who: string | undefined): string {
    const masked = maskPhone(line);
    return who ? masked.replace(/\n$/, ` @${who}\n`) : masked;
}

/** 한국 날짜 «YYYY-MM-DD» */
export const kstDayOf = (ms: number) => kstDateText(new Date(ms)) ?? '';   // 한국 날 계산은 shared 하나

/** 이 시각 다음의 한국 자정 (epoch ms) — 줄마다 날짜를 다시 계산하지 않고 이 값과만 견준다 */
export const nextKstMidnightOf = (ms: number) => (Math.floor((ms + KST_MS) / DAY_MS) + 1) * DAY_MS - KST_MS;

/**
 * 🔴 **포트가 다르면 파일도 다르다.**
 *    검사·재현용으로 다른 포트에 서버를 띄우는 일이 잦은데(scenario · 부팅 스모크 ·
 *    버그 재현), 한 파일에 섞이면 **어느 서버가 찍은 줄인지 알 수 없다.**
 *    평소 쓰는 4000 은 접미사 없이 둔다 — 찾기 쉬워야 한다.
 */
export const logFileNameOf = (day: string, port: string) => `server-${day}${port === '4000' ? '' : `-${port}`}.log`;

/**
 * 📄 **한국 날짜마다 파일 하나** — 줄을 쓸 때 한국 날짜가 바뀌었으면 옛 파일을 닫고 새 날짜 파일을 연다.
 *    새 파일은 쓴 크기를 그 파일 크기로 다시 세고, 크기 넘김 경고도 파일마다 한 번이다.
 *    넘어간 새 파일 첫 줄에 «📄 [로그 파일] 날짜가 바뀌어 새 파일 — 앞 파일 …» 을 남긴다.
 */
export function openDailyLog(dir: string, port: string, onFull: (msg: string) => void, maxBytes: number = MAX_BYTES) {
    let stream: fs.WriteStream;
    let file = '';
    let written = 0;
    let warnedFull = false;
    let rollAt = 0;

    const open = (now: number) => {
        file = path.join(dir, logFileNameOf(kstDayOf(now), port));
        stream = fs.createWriteStream(file, { flags: 'a' });
        try { written = fs.statSync(file).size; } catch { written = 0; }
        warnedFull = false;
        rollAt = nextKstMidnightOf(now);
    };
    const append = (clean: string) => {
        if (written > maxBytes) {
            if (!warnedFull) {
                warnedFull = true;
                onFull(`🚨 [로그 파일] ${Math.round(maxBytes / 1024 / 1024)}MB 를 넘어 ${path.basename(file)} 기록을 멈춥니다 (터미널 출력은 계속됩니다)`);
            }
            return;
        }
        written += clean.length;
        stream.write(clean);
    };

    open(Date.now());
    return {
        get file() { return file; },
        write(clean: string) {
            const now = Date.now();
            if (now >= rollAt) {
                const prev = path.basename(file);
                stream.end();
                open(now);
                append(`${stamp()}     #부팅 📄 [로그 파일] 날짜가 바뀌어 새 파일 — 앞 파일 ${prev}\n`);
            }
            append(clean);
        },
        close: () => new Promise<void>(resolve => stream.end(() => resolve())),
    };
}

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
    if (started) return;

    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        sweepOld();

        const log = openDailyLog(LOG_DIR, process.env.PORT || '4000', msg => origError(msg));
        started = true;

        const write = (level: string, args: unknown[]) => {
            /**
             * 🏷️ 시각 다음 첫 토막은 태그다 (reviews/22 2단계) — `slog` 로 찍은 줄은 «#태그»를 이미
             *    이고 있고, 태그 없는 경고·오류 줄은 `#경고`, 그 밖의 줄은 `#없음` 을 인다. 터미널 출력은 원문 그대로다.
             *    옛 날짜 파일(태그 없는 꼴)은 `pnpm log` 가 그대로 읽는다 — 태그는 있으면 쓰는 토막이다.
             */
            const body = args.map(a =>
                typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()
            ).join(' ');
            const tagged = body.startsWith('#') ? body : `#${level === '   ' ? NO_TAG : '경고'} ${body}`;
            const line = `${stamp()} ${level} ${tagged}\n`;
            log.write(decorateFileLine(stripAnsi(line), whoNow()));
        };

        const origLog = console.log.bind(console);
        const origWarn = console.warn.bind(console);
        const origError = console.error.bind(console);

        // 🔴 원래 출력을 **먼저** 한다. 파일 쓰기가 실패해도 터미널은 살아 있어야 한다
        console.log = (...a: unknown[]) => { origLog(...a); write('   ', a); };
        console.warn = (...a: unknown[]) => { origWarn(...a); write('WRN', a); };
        console.error = (...a: unknown[]) => { origError(...a); write('ERR', a); };

        origLog(`#부팅 📝 [로그 파일] ${path.relative(process.cwd(), log.file)} 에 함께 기록합니다 (한국 날짜마다 새 파일 · ${KEEP_DAYS}일 보관)`);
    } catch (e) {
        // 로그를 못 남기는 것이 서버를 멈출 이유는 아니다
        console.error('📝 [로그 파일] 초기화 실패 — 터미널 출력만 남습니다:', e);
    }
}

/**
 * 🏷️ **태그 로거** — 호출부가 «#태그» 글자를 직접 쓰지 않는다 (reviews/22 2단계).
 * 터미널·파일이 같은 «#태그 …» 한 꼴이고, 태그 목록은 shared `LOG_TAGS` 한 곳이다.
 */
export function slog(tag: LogTag, ...args: unknown[]): void {
    // 목록 밖 값(런타임 undefined 등)이 오면 «#undefined» 를 이지 않게 #없음 으로 떨어뜨린다
    const t = (LOG_TAGS as readonly string[]).includes(tag) ? tag : NO_TAG;
    const [first, ...rest] = args;
    if (typeof first === 'string') console.log(`#${t} ${first}`, ...rest);
    else console.log(`#${t}`, ...args);
}
