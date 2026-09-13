import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * 🔌 **포트는 루트 CLAUDE.md 「포트」 표 한 곳이 원천이다** (기사님 지시 2026-09-14).
 *
 * 기사님: *"지금 우리 프로젝트에 포트 관리하는 것이 없는 거 같은데.. 그것도 하나 필요할 꺼 같아."*
 *
 * 🔴 **번호를 한 파일로 모을 수는 없다.** 앱 Kotlin · vite 설정 · 배포 yml · PM2 설정이
 *    각자 번호를 적어야 돈다 (서로 import 할 수 없다). 그래서 **표를 원천으로 두고,
 *    코드에 박힌 번호가 표와 같은지를 이 검사가 본다.**
 *
 * 2026-09-14 조사에서 나온 것:
 *   · 4000 이 스무 곳 넘게 흩어져 있었다 — 바꾸려면 찾아 헤매야 했다
 *   · `lab`(9300~9699) 과 `shot`(9222~9721) 의 크롬 조종 포트 범위가 **겹쳤다**
 *   · `dev-preflight` 가 `pnpm dev` 로 함께 뜨는 운행일지(3001) 자리를 안 봤다
 */

const ROOT = join(__dirname, '../../../..');
const md = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');

// ── 표 ───────────────────────────────────────────────────────────
type Slot = { lo: number; hi: number; label: string };

/** 「## 포트」 절의 표 줄 — 첫 칸이 `` `4000` `` 또는 `` `9300-9599` `` */
function tableSlots(): Slot[] {
    const start = md.indexOf('\n## 포트');
    if (start < 0) return [];
    const next = md.indexOf('\n## ', start + 1);
    const sec = md.slice(start, next < 0 ? undefined : next);
    const slots: Slot[] = [];
    for (const line of sec.split('\n')) {
        const m = /^\|\s*`(\d{4,5})(?:-(\d{4,5}))?`\s*\|/.exec(line);
        if (!m) continue;
        const lo = +m[1], hi = m[2] ? +m[2] : lo;
        slots.push({ lo, hi, label: m[2] ? `${lo}-${hi}` : `${lo}` });
    }
    return slots;
}

// ── 코드 ─────────────────────────────────────────────────────────
const SKIP = new Set(['node_modules', 'dist', 'build', '.gradle', 'log', 'ex_images', 'docs', '.git', 'assets']);
const EXT = /\.(ts|tsx|js|mjs|cjs|kt|kts|ya?ml)$/;

function walk(dir: string, out: string[] = []): string[] {
    for (const n of readdirSync(dir)) {
        if (SKIP.has(n) || (n.startsWith('.') && n !== '.github')) continue;
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p, out); else if (EXT.test(n)) out.push(p);
    }
    return out;
}

/** 주석을 걷는다 — 「그때 4025 서버와 섞였다」 같은 기록은 포트를 쓰는 것이 아니다 */
const stripComments = (path: string, text: string) => /\.ya?ml$/.test(path)
    ? text.replace(/(^|\s)#.*$/gm, '$1')
    : text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[\s;{}(,])\/\/.*$/gm, '$1');

/**
 * 🔴 **«포트 자리»만 잡는다** — `3000`·`4000` 은 대기 시간(ms)·요금으로도 흔하다.
 *    주소 뒤(`localhost:4000` · `hostname}:4000` · `172.30.1.89:4000`) ·
 *    이름이 port 인 값(`PORT = 4012` · `port: 3000` · `SIM_PORT = 5173` · `.port || 4000`) ·
 *    `--to-port 4000` 만 본다. `+ process.pid` 가 붙은 것은 범위라 따로 센다.
 */
const FIXED = [
    /(?:localhost|127\.0\.0\.1|\d{1,3}(?:\.\d{1,3}){3}|TCP|\})\s*:(\d{4,5})\b(?!\s*\+)/g,
    /\b(?:[A-Za-z]+_)?port\s*(?:===?|=|:|\|\||\?\?)\s*['"]?(\d{4,5})\b(?!\s*\+)/gi,
    /--to-port\s+(\d{4,5})\b/g,
];
const RANGE = /\b(\d{4,5})\s*\+\s*\(?\s*process\.pid\s*%\s*(\d+)\s*\)?/g;

function codePorts() {
    const fixed = new Map<number, Set<string>>();
    const ranges = new Map<string, { lo: number; hi: number; files: Set<string> }>();
    for (const f of walk(ROOT)) {
        const rel = relative(ROOT, f);
        const src = stripComments(f, readFileSync(f, 'utf8'));
        for (const re of FIXED) for (const m of src.matchAll(re)) {
            const n = +m[1];
            if (!fixed.has(n)) fixed.set(n, new Set());
            fixed.get(n)!.add(rel);
        }
        for (const m of src.matchAll(RANGE)) {
            const lo = +m[1], hi = lo + +m[2] - 1, key = `${lo}-${hi}`;
            if (!ranges.has(key)) ranges.set(key, { lo, hi, files: new Set() });
            ranges.get(key)!.files.add(rel);
        }
    }
    return { fixed, ranges };
}

describe('🔌 포트는 「포트」 표 한 곳이 원천이다', () => {
    const slots = tableSlots();
    const { fixed, ranges } = codePorts();

    it('루트 CLAUDE.md 에 「포트」 표가 있다', () => {
        expect(slots.length).toBeGreaterThan(0);
    });

    it('🔴 코드에 박힌 포트마다 표에 자리가 있다', () => {
        const unlisted = [...fixed.entries()]
            .filter(([n]) => !slots.some(s => s.lo <= n && n <= s.hi))
            .map(([n, fs]) => `${n} ← ${[...fs].join(' · ')}`);
        expect(unlisted).toEqual([]);
    });

    it('🔴 코드의 포트 범위(`N + pid % M`)가 표의 범위와 똑같다 — 한쪽만 바꾸면 겹친다', () => {
        const unlisted = [...ranges.entries()]
            .filter(([, r]) => !slots.some(s => s.lo === r.lo && s.hi === r.hi))
            .map(([k, r]) => `${k} ← ${[...r.files].join(' · ')}`);
        expect(unlisted).toEqual([]);
    });

    it('🔴 표의 자리끼리 겹치지 않는다 — 동시에 돌리면 같은 포트를 잡는다', () => {
        const overlaps: string[] = [];
        for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
            const a = slots[i], b = slots[j];
            if (a.lo <= b.hi && b.lo <= a.hi) overlaps.push(`${a.label} ↔ ${b.label}`);
        }
        expect(overlaps).toEqual([]);
    });

    it('🔴 표의 자리마다 코드가 실제로 쓴다 — 안 쓰는 번호가 남으면 표가 거짓말한다', () => {
        const ghosts = slots
            .filter(s => s.lo === s.hi
                ? !fixed.has(s.lo)
                : ![...ranges.values()].some(r => r.lo === s.lo && r.hi === s.hi))
            .map(s => s.label);
        expect(ghosts).toEqual([]);
    });
});
