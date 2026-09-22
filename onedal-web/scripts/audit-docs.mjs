#!/usr/bin/env node
/**
 * 문서 검사 — **문서가 코드와 다른 말을 하는가.**
 * 누가: 에이전트 — 문서를 고쳤을 때의 게이트
 * 언제: .md 를 고친 뒤 커밋 직전
 * 어디서: cd onedal-web && pnpm audit:docs
 * 무엇을: 문서가 가리키는 파일·식별자·링크가 실재하나, 옛말과 경위가 남았나 본다
 * 왜: 문서가 틀리면 다음 에이전트가 없는 것을 있다고 믿는다
 * (잡는 것 · 못 잡는 것 · 검수는 onedal-web/CLAUDE.md 스크립트 표)
 *
 *
 * 문서가 옛 이름·없는 파일·폐기된 말을 현재형으로 말하면 다음 사람이 그걸 믿는다.
 * 🔴 손으로 훑으면 다음에 또 갈라진다. 그래서 매번 소스와 대조한다 (`pnpm audit:socket` 과 같은 방식).
 *
 * 문서 = 레포의 모든 `.md` (각 앱의 `CLAUDE.md` · README · 스킬)
 *
 * 보는 것
 *   ① 없는 파일        문서가 말하는 `*.ts/.tsx/.kt/.mjs` 가 레포에 있는가
 *   ② 사라진 식별자     문서가 말하는 상수·상태값·칸이 코드에 있는가
 *   ③ 옛말             `CLAUDE.md` · 루트 `README.md` 가 용어집이 폐기한 말로 현재를 설명하는가
 *   ④ 죽은 링크        문서→문서 · 코드→문서
 *   ⑤ 손 뗀 자리       문서가 «이 파일이 한다»는 일을 그 파일이 아직 하는가
 *   ⑥ 경위 줄          CLAUDE.md · 루트 README · onedal-web/scripts 아래 .mjs 에 경위(날짜 · 지난 상태 서술 · 옛 경로)가 있나,
 *                     그 밖의 바꾼 코드 주석에는 HEAD 판보다 늘었나, 코드 주석에 날짜 괄호 꼬리가 있나
 *
 * ⚠️ **역사 서술은 옛말을 담는 게 당연하다** — 옛일을 적는 줄(→ · 폐기 · 그때)은 ③ 이 넘어간다.
 *
 * 사용: pnpm audit:docs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname, basename, normalize } from 'path';
import { fileURLToPath } from 'url';

const WEB = join(fileURLToPath(import.meta.url), '../..');
const ROOT = join(WEB, '..');
const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', d: '\x1b[2m', b: '\x1b[1m', x: '\x1b[0m' };

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'log', '.gradle', 'ex_images']);
const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
        if (SKIP.has(e)) continue;
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
    }
    return out;
};

const ALL = walk(ROOT);
const rel = p => relative(ROOT, p);
const FILE_NAMES = new Set(ALL.map(p => basename(p)));

/** 검사 대상 문서 — 레포의 모든 `.md` */
const DOCS = ALL.filter(p => rel(p).endsWith('.md'));

/**
 * 🔴 **주석은 걷어낸다** — 묘비 주석(«`scoreDryRun` 은 철거됐다»)에 이름이 남으면
 *    «코드에 있다»로 보여, 문서가 철거된 함수를 가리켜도 감사가 통과한다.
 */
const codeOnlyView = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
/**
 * 🔴 **검사 파일도 뺀다** (2026-08-29). 검사가 «이 이름이 코드에 없어야 한다» 고
 *    정규식으로 적어 두면, 그 글자 때문에 **철거된 이름이 «살아 있다»로 보인다.**
 *    실제로 `scoreDryRun` 이 그랬다. 문서가 물어보는 것은 «제품에 있는가» 다.
 */
const CODE = ALL
    .filter(p => /\.(ts|tsx|kt|mjs|cjs|js|py)$/.test(p) && !p.includes('/dist/')
                 && !/[\\/]tests?[\\/]|\.test\./.test(p))
    .map(p => { try { return codeOnlyView(readFileSync(p, 'utf8')); } catch { return ''; } })
    .join('\n');

let problems = 0;
const say = (n, s) => console.log(`\n${C.b}${n}${C.x} ${C.d}${s}${C.x}`);

// ═══════════════════════════ ① 없는 파일
say('① 없는 파일', '문서가 말하는 소스 파일이 레포에 있는가');
{
    // 긴 확장자부터 — `.tsx` 를 `.ts` 로 자르면 멀쩡한 파일이 «없다»가 된다 (2026-08-28 실수)
    const re = /([A-Za-z_][A-Za-z0-9_.\-]*\.(?:test\.tsx|test\.ts|gradle\.kts|tsx|ts|mjs|kts|kt|cjs))(?![A-Za-z0-9])/g;
    const bad = new Map();
    for (const d of DOCS) {
        const s = readFileSync(d, 'utf8');
        for (const m of new Set([...s.matchAll(re)].map(x => x[1]))) {
            if (FILE_NAMES.has(m) || m.includes('/')) continue;
            /**
             * 없어야 맞는 경우가 셋 있다 — 그걸 «문서가 틀렸다»로 세면 검사가 시끄러워지고,
             * 시끄러운 검사는 무시당한다 (2026-08-28 «이중 발신» 오탐의 교훈).
             *   ① 역사 서술   「그때 이름은 …」
             *   ② 삭제 기록   「🗑️ … 삭제」 · 끝난 항목 `[x]`
             *   ③ 앞으로 만들 것
             */
            // 🔴 **그 이름이 나오는 줄을 전부** 본다 — `.find()` 로 첫 줄만 보면
            //    같은 이름이 여러 곳에 있을 때 엉뚱한 줄로 판단한다
            const lines = s.split('\n').filter(l => l.includes(m));
            const ok = /그때 이름|옛 이름|지금 이름|지금은|예전엔|이름이 바뀌|→|삭제|제거|철거|폐기|🗑️|\[x\]|신설|만들|추가|분리|기록/;
            if (lines.every(l => ok.test(l))) continue;
            if (!bad.has(m)) bad.set(m, new Set());
            bad.get(m).add(rel(d));
        }
    }
    if (!bad.size) console.log(`  ${C.g}없음 ✅${C.x}`);
    for (const [m, fs] of [...bad].sort()) {
        problems++;
        console.log(`  ${C.r}⚠${C.x} ${m}  ${C.d}${[...fs].join(' · ')}${C.x}`);
    }
}

// ═══════════════════════════ ② 사라진 식별자
say('② 사라진 식별자', '문서가 말하는 상수·상태값·칸이 코드에 있는가');
{
    // 오탐을 줄이려고 «코드처럼 생긴 것»만 본다:
    //   ALL_CAPS_SNAKE (상태값·상수) · snake_case (DB 칸) · camelCase + 단위 접미사
    const re = /`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+|[a-z][A-Za-z0-9]*(?:Km|Min|Ms|Pct|State|At))`/g;
    /**
     * 🔴 **`함수()` 꼴도 본다** (2026-08-29 신설). 위 regex 는 `snake_case`·`ALL_CAPS` 만
     *    잡아서, 판정을 갈아탄 뒤 문서가 여전히 `scoreDryRun()` 을 가리켰는데 **네 감사가
     *    다 통과했다.** 괄호가 붙은 이름은 «우리가 부르는 것»이라 오탐이 거의 없다.
     */
    const reFn = /`([A-Za-z_$][\w$]*)\(\)`/g;
    /** 우리 코드가 아닌 것 — 이유 없는 예외는 만들지 않는다 */
    /**
 * 🪦 **걷힌 이름 — 역사 문서에 묘비로 남는다.** 코드에서 사라졌으니 ②가 «없는 식별자»로 잡는데,
 *    문서가 «그때 그 표»를 말하는 것은 낡은 서술이 아니라 **기록**이다.
 *    ⚠️ 여기 넣기 전에 문서가 그 이름을 **현재형**으로 쓰는지 먼저 훑는다 — 그건 고쳐야 한다.
 *    (2026-09-12: `user_filter_phases` 는 C3-3b 에서 걷혔다. `filter-show.ts` 가 그 표를 읽던
 *     SQL 을 한 벌로 고치자 코드에서 완전히 사라져 여기로 왔다)
 */
const RETIRED = new Set(['user_filter_phases']);
const NOT_OURS = [
        /^ACCESS_|^TYPE_VIEW_|^FLAG_/,          // 안드로이드 SDK 상수
        /^VITE_|^EC2_|^GOOGLE_|^ALLOW_|_KEY$|_SECRET$/,  // 환경변수·시크릿 (코드에 문자열로 안 산다)
        /^worker_threads$|^child_process$/,     // Node 내장 모듈
        /^disallowed_useragent$/,               // 구글이 돌려주는 에러 문자열 (우리 코드가 아니다)
    ];
    const bad = new Map();
    for (const d of DOCS) {
        const r = rel(d);
        const s = readFileSync(d, 'utf8');
        const names = new Set([...s.matchAll(re)].map(x => x[1]));
        for (const m of [...s.matchAll(reFn)].map(x => x[1])) names.add(m);
        for (const m of names) {
            if (CODE.includes(m) || RETIRED.has(m) || NOT_OURS.some(p => p.test(m))) continue;
            // 대응표·역사 서술·«앞으로 만들 것»·«지울 것» 은 코드에 없는 게 맞다.
            // 그 이름이 나오는 줄이 **전부** 그런 문맥이면 문서가 맞는 것이다
            const lines = s.split('\n').filter(l => l.includes(m));
            //    «얹는다·붙인다» 도 앞으로 만들 것이다. «만 보므로» 는 옛 이름을 세는 문장이다
            const ok = /→|폐기|옛|그때|예전|없다|사라|바뀌|이었|예정|후보|한다면|삭제|만들|신설|제안|분리|기록|얹|만 보므로|철거|되살|철거|되살|\[x\]/;
            if (lines.every(l => ok.test(l))) continue;
            if (!bad.has(m)) bad.set(m, new Set());
            bad.get(m).add(r);
        }
    }
    if (!bad.size) console.log(`  ${C.g}없음 ✅${C.x}`);
    for (const [m, fs] of [...bad].sort()) {
        problems++;
        console.log(`  ${C.r}⚠${C.x} ${m}  ${C.d}${[...fs].join(' · ')}${C.x}`);
    }
}

// ═══════════════════════════ ③ 옛말 — CLAUDE.md
say('③ 옛말', 'CLAUDE.md · 루트 README.md 가 폐기된 말로 현재를 설명하는가');
{
    /**
     * 🔴 **금지어의 원천은 `glossary.test.ts` 하나다.** 여기에 목록을 또 적으면 두 벌이 된다
     *    — 이 레포가 반복해 당한 사고 클래스다 (규칙 ③).
     */
    const gpath = join(WEB, 'server/tests/rules/glossary.test.ts');
    const banned = [];
    if (existsSync(gpath)) {
        const g = readFileSync(gpath, 'utf8');
        const block = g.slice(g.indexOf('const BANNED'), g.indexOf('describe('));
        for (const m of block.matchAll(/name:\s*['"`](.+?)['"`],\s*pattern:\s*\/(.+?)\/[gimsuy]*[,\s}]/g)) {
            try { banned.push({ name: m[1], re: new RegExp(m[2]) }); } catch { /* 못 읽으면 건너뛴다 */ }
        }
    }
    if (!banned.length) {
        console.log(`  ${C.y}⚠ glossary.test.ts 에서 금지어를 못 읽었다 — 이 검사가 헛돈다${C.x}`);
        problems++;
    } else {
        const hits = [];
        for (const d of DOCS) {
            const r = rel(d);
            if (basename(r) !== 'CLAUDE.md' && r !== 'README.md') continue;   // 루트 README 는 CLAUDE.md 에서 옮겨 온 규칙·표라 함께 본다
            const lines = readFileSync(d, 'utf8').split('\n');
            lines.forEach((l, i) => {
                // 역사 서술 한 줄은 넘어간다 (「예전엔 ~이라 불렀다」)
                if (/→|폐기|옛말|그때|예전|~~/.test(l)) return;
                for (const b of banned) if (b.re.test(l)) hits.push({ r, i: i + 1, name: b.name, l: l.trim() });
            });
        }
        if (!hits.length) console.log(`  ${C.g}없음 ✅${C.x} ${C.d}(금지어 ${banned.length}종 대조)${C.x}`);
        for (const h of hits) {
            problems++;
            console.log(`  ${C.r}⚠${C.x} ${h.r}:${h.i}  ${C.y}${h.name}${C.x}`);
            console.log(`      ${C.d}${h.l.slice(0, 96)}${C.x}`);
        }
    }
}

// ═══════════════════════════ ④ 죽은 링크
say('④ 죽은 링크', '문서→문서 · 코드→문서');
{
    let bad = 0;
    for (const d of DOCS) {
        const s = readFileSync(d, 'utf8');
        for (const m of s.matchAll(/\]\((?!https?:\/\/)([^)#\s]+\.md)\)/g)) {
            if (existsSync(normalize(join(dirname(d), m[1])))) continue;
            problems++; bad++;
            console.log(`  ${C.r}⚠${C.x} ${rel(d)} ${C.d}→ ${m[1]}${C.x}`);
        }
    }
    const srcs = ALL.filter(p => /\.(ts|tsx|kt|mjs)$/.test(p) && !p.includes('/dist/'));
    for (const p of srcs) {
        let s; try { s = readFileSync(p, 'utf8'); } catch { continue; }
        // 🔴 앞의 앱 이름까지 잡는다 — `onedal-app/docs/…` 를 `docs/…` 로 자르면 멀쩡한 경로가 «없다»가 된다
        for (const m of new Set([...s.matchAll(/((?:[\w.-]+\/)*docs(?:\/[^\s`)\]'"<>|:]+)+\.md)/g)].map(x => x[1]))) {
            if (existsSync(join(ROOT, m))) continue;
            problems++; bad++;
            console.log(`  ${C.r}⚠${C.x} ${rel(p)} ${C.d}→ ${m}${C.x}`);
        }
    }
    if (!bad) console.log(`  ${C.g}없음 ✅${C.x}`);
}

// ═══════════════════════════ ⑤ 손 뗀 자리
say('⑤ 손 뗀 자리', '문서가 «이 파일이 한다»는 일을 그 파일이 아직 하는가');
{
    /**
     * 🔴 **왜 필요한가** — 문서가 «채점기 = `dryRun.ts`» 처럼 역할을 가리키는데 그 파일이
     *    일을 놓으면 ①(파일은 있다)·②(export 도 있다)·③(금지어가 아니다) 가 다 통과한다.
     *    **«파일은 있는데 그 일을 더 이상 안 한다»** 를 이것이 본다.
     *
     * 어떻게 보나: 문서가 «역할 = 파일» 이라고 적은 표 줄을 찾아, **제품 코드가
     * 그 파일에서 무언가를 실제로 들여오는지** 본다. 아무도 안 들여오면 손 뗀 것이다.
     *
     * ⚠️ 검사·문서·자기 자신은 세지 않는다 — 검사만 쓰는 파일은 «제품이 손 뗀 것»이 맞다.
     */
    const PROD = ALL.filter(p => /\.(ts|tsx)$/.test(p)
        && !/[\\/]tests?[\\/]|\.test\.|[\\/]dist[\\/]|scripts[\\/]/.test(p));
    /**
     * 🔴 **«들여오는가»로는 부족하다.** `shared/src/index.ts` 같은 **재수출 통**이 있으면
     *    아무도 안 부르는 파일도 «살아 있다»로 보인다 — 처음에 이걸로 못 잡았다.
     *    그래서 **그 파일이 내놓은 이름을 제품이 실제로 부르는가**를 본다.
     *    통(`index.ts`)과 자기 자신은 세지 않는다.
     */
    const isUsed = (file) => {
        const src = readFileSync(file, 'utf8');
        const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)].map(x => x[1]);
        if (!names.length) return true;                        // 타입만 있는 파일은 판단하지 않는다
        /**
         * 🔴 **재수출 통만 뺀다 — 진짜 소비자는 빼지 않는다** (2026-08-29 오탐에서 배움).
         *    처음엔 `index.ts` 를 통째로 뺐다가 `server/src/index.ts`(라우터를 실제로
         *    `app.use` 하는 곳)까지 빠져 **멀쩡한 `routes/health.ts` 를 «손 뗀 자리»** 라 했다.
         *    통은 «export * from» 만 하는 파일이다 — 그것으로 가른다.
         */
        const isBarrel = (p) => /^\s*export\s+\*\s+from/m.test(readFileSync(p, 'utf8'));
        const others = PROD.filter(p => p !== file && !isBarrel(p));
        /**
         * 🔴 **«부른다»만 보면 안 된다** (2026-08-29 두 번째 오탐).
         *    `CRITERIA` 는 부르는 게 아니라 `judge(CRITERIA, …)` 로 **넘기는 값**이다.
         *    이름이 코드에 **나오는지**를 본다 — 주석은 걷어낸다 (주석은 역사일 수 있다).
         */
        const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        return others.some(p => {
            const t = codeOnly(readFileSync(p, 'utf8'));
            return names.some(n => new RegExp(`\\b${n}\\b`).test(t));
        });
    };
    let bad = 0;
    for (const d of DOCS) {
        const s = readFileSync(d, 'utf8');
        // 표의 «… | `경로/파일.ts` |» 꼴만 본다 — 산문 속 언급은 역사일 수 있다
        for (const m of new Set([...s.matchAll(/\|[^|\n]*\|\s*`([\w./-]+\.tsx?)`\s*\|/g)].map(x => x[1]))) {
            // 🔴 «shared/src/dryRun.ts» 처럼 앱 이름이 앞에 붙은 것과, «routes/x.ts» 처럼
            //    앱 안 상대 경로로 적힌 것을 둘 다 받는다 (처음에 이걸 틀려 못 잡았다)
            const full = [m, `server/src/${m}`, `shared/src/${m}`, `client-app/src/${m}`]
                .map(x => join(WEB, x)).find(existsSync);
            if (!full) continue;                       // ① 이 이미 잡는다
            if (isUsed(full)) continue;
            problems++; bad++;
            console.log(`  ${C.r}⚠${C.x} ${rel(d)} ${C.d}→ \`${m}\` 가 내놓은 것을 제품이 아무도 안 부른다 (손 뗀 자리)${C.x}`);
        }
    }
    if (!bad) console.log(`  ${C.g}없음 ✅${C.x}`);
}

// ═══════════════════════════ ⑥ 경위 줄
say('⑥ 경위 줄', '문서·스크립트에 경위가 있나 · 코드 주석은 늘었나');
{
    /**
     * 🔴 **문서와 스크립트에는 지금 상태만 적는다.** 날짜 · 지난 상태 서술 · 옛 경로가 남아 있으면
     *    다음 에이전트가 그 옛것을 계속 떠올린다 (루트 README.md «이 문서 · 코드 주석에 무엇을 적나»).
     *    경위는 커밋 메시지에 있다.
     *
     * 두 층으로 본다.
     *   가) CLAUDE.md · 루트 README.md · onedal-web/scripts 아래 .mjs — 경위가 **있으면** 빨간불
     *   나) 그 밖의 바꾼 .ts/.tsx/.kt/.mjs/.md — 경위 줄이 HEAD 판보다 **늘면** 빨간불 (이미 쌓인 줄은 만질 때 줄인다)
     *
     * 예외 — 이 파일(정규식이 그 말을 담는다) · onedal-web/CLAUDE.md 스크립트 표의 줄(«검수» 칸은 날짜가 곧 내용이다)
     */
    const { execFileSync } = await import('child_process');
    // 🔴 `core.quotepath` 를 끄지 않으면 한글 경로가 `"\354\247\200…"` 로 나와 경로 비교가 틀린다
    const git = (...a) => { try { return execFileSync('git', ['-c', 'core.quotepath=off', ...a], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
    const DATE = '20\\d{2}-\\d{2}-\\d{2}';
    const SHAPES = [
        new RegExp(`${DATE}(?![T\\d])`),   // 코드 속 시각 상수(2020-01-01T…)는 경위가 아니다
        /\b(0[1-9]|1[0-2])[0-3]\d (실측|확정|말씀)/,
        /예전(엔|에는)|옛것|옛 (경로|이름|규칙|판)|걷어냄|걷었다|되살렸|되살아|없앴다|지웠다|신설|철거|개정/,
        /~\/reps\/|기획\//,
    ];
    const OLD_SHAPES = [
        new RegExp(`🔄.*${DATE}|${DATE}.*개정`),
        /예전(?:엔|에는)/,
        new RegExp(`기사님.*${DATE}|${DATE}.*기사님`),
    ];
    const SELF = 'onedal-web/scripts/audit-docs.mjs';
    const strict = (p) => p !== SELF && (/(^|\/)CLAUDE\.md$/.test(p) || p === 'README.md' || /^onedal-web\/scripts\/.*\.mjs$/.test(p));
    const exempt = (p, line) => p === 'onedal-web/CLAUDE.md' && /^\| `pnpm /.test(line);
    /** 문서의 코드 블록(```) 안 줄은 문장이 아니라 명령이라 건너뛴다 */
    const hits = (p, text, shapes) => {
        let fence = false;
        return text.split('\n')
            .map((l, i) => ({ n: i + 1, l: l.trim() }))
            .filter(({ l }) => {
                if (p.endsWith('.md') && l.startsWith('```')) { fence = !fence; return false; }
                return l && !(fence && p.endsWith('.md')) && !exempt(p, l) && shapes.some(r => r.test(l));
            });
    };

    let bad = 0;
    // 가) 있으면 빨간불
    const strictFiles = ALL.map(rel).filter(strict);
    for (const p of strictFiles) {
        const found = hits(p, readFileSync(join(ROOT, p), 'utf8'), SHAPES);
        if (!found.length) continue;
        problems++; bad++;
        console.log(`  ${C.r}⚠${C.x} ${p} ${C.d}경위 ${found.length}줄${C.x}`);
        for (const { n, l } of found.slice(0, 4)) console.log(`      ${C.y}${n}: ${l.slice(0, 110)}${C.x}`);
    }
    // 나) 늘면 빨간불
    const watched = (p) => /\.(ts|tsx|kt|mjs|md)$/.test(p) && !strict(p) && p !== SELF;
    const shaped = (p, text) => hits(p, text, OLD_SHAPES).map(h => h.l);
    const changed = [...new Set([
        ...git('diff', '--name-only', 'HEAD').split('\n'),
        ...git('ls-files', '--others', '--exclude-standard').split('\n'),
    ])].filter(p => p && watched(p));
    const before = new Map(changed.map(p => [p, shaped(p, git('show', `HEAD:${p}`))]));
    const moved = new Set([...before.values()].flat());
    for (const p of changed) {
        if (!existsSync(join(ROOT, p))) continue;
        const now = shaped(p, readFileSync(join(ROOT, p), 'utf8'));
        const fresh = now.filter(l => !moved.has(l));
        if (now.length <= before.get(p).length || !fresh.length) continue;
        problems++; bad++;
        console.log(`  ${C.r}⚠${C.x} ${p} ${C.d}${before.get(p).length} → ${now.length}줄${C.x}`);
        for (const l of fresh.slice(0, 3)) console.log(`      ${C.y}${l.slice(0, 110)}${C.x}`);
    }
    // 다) 코드 주석의 날짜 꼬리 — 있으면 빨간불 («(기사님 확정 2026-08-22)» 같은 괄호 꼬리. 서술 문장은 나) 가 본다)
    const TAIL = /\((?:기사님 (?:지시|확정|말씀)[ ·]*)?20\d\d-\d\d-\d\d[^)]*\)|기사님\s*\(20\d\d-\d\d-\d\d[^)]*\)\s*:/;
    const commentPart = (line) => {
        const s = line.trim();
        if (/^(\*|\/\*|\/\/|\{\/\*)/.test(s)) return s;
        const i = line.indexOf(' // ');
        if (i < 0) return '';
        const head = line.slice(0, i);
        return ((head.match(/['"`]/g) || []).length % 2 === 0) ? line.slice(i) : '';
    };
    const codeFiles = ALL.map(rel).filter(p => /\.(ts|tsx|kt)$/.test(p) && !p.includes('/dist/'));
    let tailFiles = 0, tailLines = 0;
    const tailShow = [];
    for (const p of codeFiles) {
        const n = readFileSync(join(ROOT, p), 'utf8').split('\n').filter(l => TAIL.test(commentPart(l))).length;
        if (!n) continue;
        tailFiles++; tailLines += n;
        if (tailShow.length < 5) tailShow.push(`${p} ${n}줄`);
    }
    if (tailLines) {
        problems++; bad++;
        console.log(`  ${C.r}⚠${C.x} 코드 주석의 날짜 꼬리 ${C.d}${tailFiles}개 파일 · ${tailLines}줄${C.x}`);
        for (const s of tailShow) console.log(`      ${C.y}${s}${C.x}`);
    }
    if (!bad) console.log(`  ${C.g}없음 ✅${C.x} ${C.d}(문서·스크립트 ${strictFiles.length}개 · 바뀐 코드 ${changed.length}개 · 코드 ${codeFiles.length}개 날짜 꼬리 0)${C.x}`);
}

// ═══════════════════════════ 결론
console.log('');
if (problems === 0) {
    console.log(`${C.g}✅ 문서가 코드와 어긋난 곳 없음${C.x} ${C.d}(문서 ${DOCS.length}개)${C.x}\n`);
} else {
    console.log(`${C.y}⚠ ${problems}건${C.x} ${C.d}— 문서가 코드와 다른 말을 하거나(①~⑤) 경위가 남아 있거나 늘었다(⑥). 칸마다 보고 고칠 것${C.x}`);
    console.log(`${C.d}  문서가 틀리면 읽는 사람이 없는 것을 있다고 믿는다.${C.x}\n`);
    process.exitCode = 1;
}
