#!/usr/bin/env node
/**
 * 문서 검사 — **문서가 코드와 다른 말을 하는가.**
 *
 * 이 레포가 반복해서 당한 사고는 «문서가 거짓말하는 것»이다. CLAUDE.md 가 «네 번 발생»
 * 이라 적어 뒀고, 2026-08-28 전수조사에서 또 나왔다:
 *
 *   `지금/안전모드.md`  뼈대가 코드에 없었다 (mainCallState · subCalls · pendingDetailRequests
 *                       · isAutoSessionActive — 전부 0곳). 참조 8곳 중 6곳이 이미
 *                       «거짓말한 문서»로 지목하고 있었는데도 «지금» 칸에 있었다
 *   `지금/이벤트_명세`   ORDER_CANCELED · ORDER_RELEASED · ORDER_FORCE_CANCELED —
 *                       셋 다 폐기된 이름인데 명세가 그걸 현재형으로 말했다
 *   `지금/필터`          `filterHunt.test.ts` 를 가리켰다. 그 검사는 개명됐을 뿐 살아 있었지만,
 *                       **문서가 옛 이름을 복제**해 다음 사람이 «검사가 사라졌다»로 읽는다
 *
 * 🔴 손으로 훑으면 다음에 또 갈라진다. 그래서 매번 소스와 대조한다
 *    (`pnpm map` · `pnpm audit:socket` 과 같은 방식).
 *
 * 보는 것 넷
 *   ① 없는 파일        문서가 말하는 `*.ts/.tsx/.kt/.mjs` 가 레포에 있는가
 *   ② 사라진 식별자     문서가 말하는 상수·상태값·칸이 코드에 있는가
 *   ③ 옛말             **`docs/지금/` 만** — 용어집이 폐기한 말로 현재를 설명하는가
 *   ④ 죽은 링크        문서→문서 · 코드→문서
 *
 * ⚠️ **역사 서술은 옛말을 담는 게 당연하다.** `glossary.test.ts` 가 주석을 걷어내고
 *    검사하는 것과 같은 이유다. 그래서 ③은 «지금» 칸에만 건다 —
 *    기록·자료·기획은 그때의 말로 적혀야 맞다.
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

/** 검사 대상 문서 — docs 전체 + 각 앱의 CLAUDE.md + todo */
const DOCS = ALL.filter(p => {
    const r = rel(p);
    if (!r.endsWith('.md')) return false;
    return r.startsWith('docs/') || basename(r) === 'CLAUDE.md' || r === 'todo.md';
});

/** 코드 전문 — 주석까지 포함한다. 문서가 가리키는 이름이 «있기만» 하면 되므로 */
const CODE = ALL
    .filter(p => /\.(ts|tsx|kt|mjs|cjs|js)$/.test(p) && !p.includes('/dist/'))
    .map(p => { try { return readFileSync(p, 'utf8'); } catch { return ''; } })
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
    /** 우리 코드가 아닌 것 — 이유 없는 예외는 만들지 않는다 */
    const NOT_OURS = [
        /^ACCESS_|^TYPE_VIEW_|^FLAG_/,          // 안드로이드 SDK 상수
        /^VITE_|^EC2_|^GOOGLE_|^ALLOW_|_KEY$|_SECRET$/,  // 환경변수·시크릿 (코드에 문자열로 안 산다)
        /^worker_threads$|^child_process$/,     // Node 내장 모듈
    ];
    const bad = new Map();
    for (const d of DOCS) {
        const r = rel(d);
        // 🔴 「기획」과 `todo.md` 는 **아직 안 만든 것**을 적는 자리다 — 코드에 없는 게 당연하다.
        //    (①·③·④ 는 그대로 건다 — «없는 파일을 가리키는 것»과 «옛말»은 거기서도 문제다)
        if (r.startsWith('docs/기획/') || r === 'todo.md') continue;
        const s = readFileSync(d, 'utf8');
        for (const m of new Set([...s.matchAll(re)].map(x => x[1]))) {
            if (CODE.includes(m) || NOT_OURS.some(p => p.test(m))) continue;
            // 대응표·역사 서술·«앞으로 만들 것»·«지울 것» 은 코드에 없는 게 맞다.
            // 그 이름이 나오는 줄이 **전부** 그런 문맥이면 문서가 맞는 것이다
            const lines = s.split('\n').filter(l => l.includes(m));
            const ok = /→|폐기|옛|그때|예전|없다|사라|바뀌|이었|예정|후보|한다면|삭제|만들|신설|제안|분리|기록|\[x\]/;
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

// ═══════════════════════════ ③ 옛말 — 「지금」 칸만
say('③ 옛말', 'docs/지금/ 이 폐기된 말로 현재를 설명하는가');
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
        /** 용어집은 **대응표**라 옛말이 자료다. 이유 있는 유일한 예외 */
        const EXEMPT = new Set(['docs/지금/용어집.md']);
        const hits = [];
        for (const d of DOCS) {
            const r = rel(d);
            if (!r.startsWith('docs/지금/') || EXEMPT.has(r)) continue;
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

// ═══════════════════════════ 결론
console.log('');
if (problems === 0) {
    console.log(`${C.g}✅ 문서가 코드와 어긋난 곳 없음${C.x} ${C.d}(문서 ${DOCS.length}개)${C.x}\n`);
} else {
    console.log(`${C.y}⚠ ${problems}건${C.x} ${C.d}— 문서가 코드와 다른 말을 한다. 어느 쪽이 맞는지 보고 고칠 것${C.x}`);
    console.log(`${C.d}  «지금» 칸이 틀리면 읽는 사람이 없는 것을 있다고 믿는다 — 이 레포가 네 번 당한 사고다.${C.x}\n`);
    process.exitCode = 1;
}
