#!/usr/bin/env node
/**
 * 죽은 코드 검사 — **불려야 하는데 안 불리는 것**을 찾는다.
 * 누가: 에이전트 — 커밋 전 게이트의 하나
 * 언제: 커밋 직전, 그리고 export 나 세션 필드를 지우거나 이름을 바꿨을 때
 * 어디서: cd onedal-web && pnpm audit:dead
 * 무엇을: 안 불리는 export · 세션에 없는 필드를 읽는 코드 · `session: any` 를 찾는다
 * 왜: 호출부가 멀쩡해도 없는 필드를 읽으면 조용히 null 만 돌려주고 tsc 는 못 잡는다
 * (잡는 것 · 못 잡는 것 · 검수는 onedal-web/CLAUDE.md 스크립트 표)
 *
 *
 * 이 검사가 지키는 사고: 호출부는 멀쩡한데 **세션에 없는 필드를 읽어** 늘 `null` 을 돌려주는 함수.
 *    파라미터 타입이 `any` 면 `tsc` 가 못 잡고, 몇 달째 안 도는데 아무도 모른다.
 *
 *    그래서 이 검사는 둘을 본다:
 *      ① 안 쓰이는 export        — 고전적 죽은 코드
 *      ② **세션에 없는 필드 접근** — 위 사고를 잡는 검사
 *
 * 사용: pnpm audit:dead
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(fileURLToPath(import.meta.url), '../..');

const walk = (dir, ext, out = []) => {
    let entries;
    try { entries = readdirSync(dir); } catch { return out; }
    for (const e of entries) {
        const p = join(dir, e);
        if (e === 'node_modules' || e === 'dist' || e.startsWith('.')) continue;
        if (statSync(p).isDirectory()) walk(p, ext, out);
        else if (ext.some(x => e.endsWith(x))) out.push(p);
    }
    return out;
};
/**
 * 🔴 **주석은 코드가 아니다.** 걷어내고 본다.
 *    주석에 옛 필드 이름이 남아 있을 수 있다.
 *    그대로 스캔하면 이미 고친 것을 계속 잡아내 검사가 시끄러워지고, 시끄러우면 아무도 안 본다.
 *    (`tests/rules/*.test.ts` 가 쓰는 `codeOnly` 와 같은 이유다)
 */
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const load = (files) => files.map(f => ({
    rel: relative(ROOT, f), base: basename(f),
    src: codeOnly(readFileSync(f, 'utf8')),
}));

const SERVER = load(walk(join(ROOT, 'server/src'), ['.ts']));
const TESTS = load(walk(join(ROOT, 'server/tests'), ['.ts']));
const CLIENT = load(walk(join(ROOT, 'client-app/src'), ['.ts', '.tsx']));
/* 🏢 운영센터 · 🧩 공통 부품도 shared 를 부른다 — 안 훑으면 그쪽만 쓰는 export 가 «죽었다»로 뜬다 */
const OPS = load(walk(join(ROOT, 'ops/src'), ['.ts', '.tsx']));
const UI = load(walk(join(ROOT, 'ui/src'), ['.ts', '.tsx']));
const SHARED = load(walk(join(ROOT, 'shared/src'), ['.ts']));
const ALL = [...SERVER, ...TESTS, ...CLIENT, ...OPS, ...UI, ...SHARED];

const C = { d: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' };
const H = (s) => console.log(`\n${C.b}${s}${C.x}\n${'─'.repeat(74)}`);
let problems = 0;

// ═══════════════════════════ ① 안 쓰이는 export
H('① 내보냈는데 아무도 안 쓰는 것');

/** 진입점·계약이라 호출부가 없어도 정상인 것 */
const ENTRY = /\/(index|main)\.tsx?$/;
const isRouteFile = (rel) => rel.includes('/routes/');

/**
 * 🔴 **알고 남겨 둔 것.** 사유 없이는 못 넣는다 — 사유가 없으면 그냥 죽은 코드다.
 *
 * 이 목록이 있는 이유: 검사가 매번 같은 걸 떠들면 아무도 안 본다.
 * "봤고, 이래서 남긴다"를 여기 적으면 **다음 사람이 다시 판단하지 않아도 된다.**
 * 남길 이유가 사라지면 목록에서 빼고 코드도 지운다.
 */
const KEEP = {
    /**
     * 🚗 **«이동 중 42km/h · 정차 중» 배지 — 잇는 자리가 빠졌다** (옛 화면을 걷으며).
     *
     * 옛 지도 위에 있던 표시인데, 새 화면(무대)에는 그 자리가 없다. 지우지 않는 까닭:
     * **모의 주행이 도는지 · 시뮬인지 실측인지**를 눈으로 가리는 유일한 표시다
     * (`시뮬 이동 중` 접두). 주행 판정 자체는 `useDriveMotion` 으로 새 화면이 더 적극적으로 쓴다.
     * 🔴 **갈 자리는 현황판**이다 — 개발·시험용 표시를 모아 두는 곁 패널.
     *    「안 불린다 = 필요 없다」로 읽어 지우면 그 생각까지 사라진다.
     *    todo 「관제웹 전면 개편」 에 «이어야 할 것»으로 올려 뒀다.
     */
    MovingBadge: '잇는 자리가 빠졌다 — 현황판으로 간다 (todo). 모의/실측을 가리는 유일한 표시라 안 지운다.',
    /**
     * 🔴 **틀린 답을 주게 됐다 — 그래서 옮겨 갈 자리를 적어 둔다**.
     *
     * `aboveSheet(snap)` 은 «snap 이 정한 높이»를 답한다. 그런데 시트가 «내용만큼»
     * 설 수 있게 되면서(`fitContent`) **그 값과 실제 높이가 갈라졌고**, 목업에서
     * 지도 버튼들이 엉뚱한 자리에 떴다. 목업은 `StageSheet` 의 `onHeightChange`
     * (재서 알리는 실제 높이)로 옮겼고, 호출부가 없어졌다.
     *
     * 🔴 **실물의 「🚀 지금 출발」이 아직 `bottom-20`(80px) 이라는 손으로 적은 숫자를
     *    쓴다.** 그것을 고칠 때 이 함수가 아니라 **`onHeightChange` 로 간다** —
     *    그때 이 함수를 지운다. 지금 지우면 «옮겨 갈 자리»의 내력이 사라진다.
     */
    aboveSheet: '시트 위에 무엇을 놓을 때의 bottom 값. fitContent 가 생기며 실제 높이와 갈라져 '
              + '목업은 onHeightChange 로 옮겼다. 실물의 「지금 출발」을 고칠 때 함께 지운다.',
    getGeoCacheStats: '지리 캐시 적중률 진단용. 경유 성능을 다시 잴 때 쓴다.',
    findOptimalStopOrder: '정거장 순열 최적화 알고리즘 (N<=8 DFS Branch & Bound). 탐욕법 orderByNearest와 대조 및 정밀 순서 전환 검토용으로 보존.',
    getActivePinCount: '페어링 PIN 발급 현황 진단용. 기기 등록이 안 될 때 확인하는 유일한 수단.',
    /**
     * 지도 실험실에 「길 찾기」가 없어 화면 쪽 호출부가 없다 (기사님: *"길찾기는 지워"* — **잡은 콜들이 라인을 만든다**).
     * 파주 길은 카카오 실측 폴리라인이라 다시 만들려면 카카오를 또 불러야 한다.
     * 여주 길(`YEOJU_ROADS`)은 라인 띠 검사가 쓰고 있고, 이건 그 검사를 파주로 넓힐 때 쓴다.
     */
    PAJU_ROADS: '파주 길 카카오 실측 폴리라인. 화면은 안 쓴다 — 라인 띠 검사 재료로 남긴다.',
    /**
     * 내비 화면이 지금 없어 호출부가 없다. **개인폰이 받는 화면은 새로 만든다** —
     * 카카오맵 되돌아갈 길 버튼이 «몇 곳까지 보냈나»를 말하려면 이 함수가 필요하다.
     */
    isRouteTruncated: '카카오맵 링크가 경유 5개에서 끊겼는지. 옛 내비 화면을 지우며 호출부가 '
                    + '잠시 비었다 — 새 내비 화면을 만들 때 다시 잇는다 (경로.md §4-0-1).',

    /**
     * 🔴 **아래 다섯은 «지울 게 아니라 이어야 할 것»이다.**
     *    «타입만 세워 두고 연결은 다음 단계에서» 라고 적어 둔 것들이다. 예고한 증상은 실제로 난다 —
     *    `getStopTiming` 의 인자가 계속 늘고(`unk`·`order`·`cfg`), 화면과 판정이 다른 값을 본다.
     *    **캐 봤고, 이래서 남긴다.**
     */
    EMPTY_CARGO: '짐을 묶는 이름(`CargoSpec`)의 바닥값. 지금 코드는 짐을 낱개로 들고 다녀 '
               + '함수 인자가 계속 는다 — 그 병을 고치려고 세워 둔 구조다.',
    cargoForStop: '보호는 상차에만·후작업은 하차에만 붙는 것을 함수 하나로 강제한다. '
                + '타입으로 못 막는 자리라 저장 직전에 거치게 하려던 것.',
    isCargoKnown: '짐을 아는가 — 하나라도 비면 「미확인」. 규칙 ⑤-2 의 표시를 한 곳에서 정하려던 것.',
    effectiveCargo: '「지금 무엇을 믿어야 하나」(실측 > 계획)를 한 곳에서 판단한다. '
                  + '지금은 읽는 쪽마다 따로 해서 화면과 판정이 다른 값을 볼 수 있다.',
    cargoMismatchOf: '계획 대비 실측 배율. 짐 신고가 얼마나 맞는지 재는 유일한 수단 — 조인 없이 한 행에서.',
    groupCallOptions: '콜 옵션을 갈래별로 묶어 화면이 그리게 하려던 것. DB 표(`call_options`)와 '
                    + '값은 이미 있는데 **그 화면이 아직 없다** — 지금은 `pnpm options` 로 터미널에서만 본다. '
                    + '화면을 만들지 말지는 기사님 판단이라 todo 에 적어 두고 남긴다.',
};

/** 🧪 검사만 부르는데 알고 남기는 export — 사유 없이는 못 넣는다 (①-2) */
const TEST_ONLY_KEEP = {
    isSkipped: 'shared index.ts 안(입구 파일이라 감사 밖)에 있다가 나누기로 milestones.ts 에 옮겨 처음 세였다 — 옮기기만 한 일이라 지우지 않는다 · 지울지는 따로.',
    getEffectiveDetourRadius: 'shared index.ts 안(입구 파일이라 감사 밖)에 있다가 나누기로 dispatchFilter.ts 에 옮겨 처음 세였다 — 옮기기만 한 일이라 지우지 않는다 · 지울지는 따로.',
};
/** 🤖 원달앱에서 이름으로 안 불리는데 남기는 fun · const val — 사유 없이는 못 넣는다 (①-3) */
const KT_KEEP = {
    SUPPLY: '블루투스 틀 종류 바이트 — 서버 jest `bleProtocolPair` 가 이 파일을 글자로 읽어 shared `BLE_KINDS` 와 견준다(계약 값).',
    MAX_WRITE: '블루투스 한 번 쓰기 최대 — 관제앱(`BleProtocol.java`)이 조각 크기로 쓰고 `bleProtocolPair` 가 셋을 견준다(계약 값).',
    PAIR_TOKEN_FIELD: '폰 연결 응답 칸 이름 — 서버 jest `deviceLinkNames` 가 shared `PAIR_TOKEN_FIELD` 와 견준다(계약 값).',
    sizedForTest: '작은 기억으로 «넘치면 최근 것만 남긴다»를 보는 검사 손잡이 — 기본 크기(2000)로는 그 검사를 못 한다.',
    onFilterVersion: '`onFilter(v, null)` 의 겉 — «누른 · 통과한 · KEEP 콜은 필터가 바뀌어도 남는다» 검사 다섯이 이것으로 단언한다.',
    networkOfScreen: '`networksOnScreen` 의 «하나일 때만» 겉 — «글자 없으면 모른다 · 둘이면 모른다» 검사가 이것으로 단언한다.',
    detect: '`NetworkByScreen.hits` 의 «하나일 때만» 겉 — «빈 글자 묶음은 어느 화면에도 안 맞는다»(hits 의 isNotEmpty) 검사가 이것으로만 닿는다.',
    groupByFare: '본 코드가 부르는 `groupIndicesByFare` 의 글자 겉 — 카드 나누기 검사 열한 개가 이것으로 같은 본체를 지난다.',
};

const exports = [];
for (const f of [...SERVER, ...CLIENT, ...SHARED]) {
    if (ENTRY.test(f.rel)) continue;
    /**
     * 🔴 **한글 이름도 본다**. `\w` 는 한글을 안 잡는다 —
     *    `export const 돈` 같은 판정 기준은 이름이 한글이라 `\w` 만 보면 통째로 빠진다.
     */
    for (const m of f.src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([\w가-힣]+)/gm)) {
        exports.push({ file: f.rel, name: m[1], line: f.src.slice(0, m.index).split('\n').length });
    }
}

const unused = exports.filter(e => {
    const re = new RegExp(`\\b${e.name}\\b`, 'g');
    // 다른 파일에서 쓰이면 살아 있다
    if (ALL.some(f => f.rel !== e.file && re.test(f.src))) return false;
    // 자기 파일 안에서 쓰이는 것도 살아 있다 (선언 1회뿐이면 죽었다)
    const own = ALL.find(f => f.rel === e.file);
    return (own.src.match(re) || []).length <= 1;
});

if (unused.length === 0) {
    console.log(`  ${C.g}없음 ✅${C.x}`);
} else {
    let shown = 0;
    for (const u of unused) {
        // 라우트 파일의 핸들러·타입은 계약이라 조용히 넘긴다
        const soft = isRouteFile(u.file);
        const kept = KEEP[u.name];
        if (kept) {
            console.log(`  ${C.d}· ${u.name.padEnd(28)} 남겨 둠 — ${kept.split('.')[0]}${C.x}`);
            continue;
        }
        if (!soft) { problems++; shown++; }
        console.log(`  ${soft ? C.d + '·' : C.y + '⚠'}${C.x} ${u.name.padEnd(30)} ${C.d}${u.file}:${u.line}${C.x}`);
    }
    if (shown === 0) console.log(`  ${C.g}볼 것 없음 ✅${C.x} ${C.d}(· 는 라우트 계약 또는 사유와 함께 남겨 둔 것)${C.x}`);
    else console.log(`  ${C.d}⚠ = 볼 것. 남길 거면 스크립트의 KEEP 에 **사유와 함께** 넣는다${C.x}`);
}

// ═══════════════════════════ ①-2 기본 내보내기 · 검사만 부르는 것 · 사유가 낡은 KEEP
H('①-2 기본 내보내기를 아무도 안 불러옴 · 검사만 부르는 export · 이미 쓰이는데 KEEP 에 남은 이름');

/** 검사 파일 — 이것만 부르면 «살아 있다»가 아니다 (부품은 실물에서 불려야 산다) */
const isTestFile = (rel) => /\.test\.tsx?$/.test(rel) || rel.startsWith('server/tests/');
const NON_TEST = ALL.filter(f => !isTestFile(f.rel));
let found12 = 0;

/* ⓐ `export default function X` — 이름이 아니라 **파일을 불러오는 곳**으로 산다(불러올 때 이름을 바꿀 수 있다) */
for (const f of [...SERVER, ...CLIENT, ...SHARED]) {
    if (ENTRY.test(f.rel) || isTestFile(f.rel) || isRouteFile(f.rel)) continue;
    const m = /^export\s+default\s+(?:async\s+)?(?:function|class)\s+([\w가-힣]+)/m.exec(f.src);
    if (!m) continue;
    const stem = f.base.replace(/\.tsx?$/, '');
    const importRe = new RegExp(`['"\`][^'"\`]*/${stem}(?:\\.tsx?)?['"\`]`);
    if (NON_TEST.some(o => o.rel !== f.rel && importRe.test(o.src))) continue;
    if (KEEP[m[1]]) continue;
    found12++; problems++;
    console.log(`  ${C.y}⚠${C.x} ${(m[1] + ' (기본 내보내기)').padEnd(30)} ${C.d}${f.rel} — 이 파일을 불러오는 곳 없음${C.x}`);
}

/**
 * ⓑ 검사 파일만 부르는 export — 본 코드에서 안 불리면 검사가 지키는 것은 아무도 안 쓰는 함수다.
 *    처음 잰 수가 많아 **늘었나**로 문다 — 줄면 아래 수를 내린다. 하나씩 캐서 지우거나 TEST_ONLY_KEEP 에 사유와 함께 넣는다.
 */
const TEST_ONLY_MAX = 47;
const testOnly = [];
for (const e of exports) {
    if (KEEP[e.name] || TEST_ONLY_KEEP[e.name]) continue;
    const re = new RegExp(`\\b${e.name}\\b`);
    const reG = new RegExp(`\\b${e.name}\\b`, 'g');
    const own = NON_TEST.find(f => f.rel === e.file);
    const ownUses = own ? (own.src.match(reG) || []).length : 0;
    const prodElsewhere = NON_TEST.some(f => f.rel !== e.file && re.test(f.src));
    if (prodElsewhere || ownUses > 1) continue;
    const testUse = ALL.find(f => isTestFile(f.rel) && re.test(f.src));
    if (!testUse) continue;   // 아무도 안 쓰는 것은 ① 이 이미 말했다
    testOnly.push(`${e.name} ${e.file}:${e.line}`);
}
if (testOnly.length > TEST_ONLY_MAX) {
    found12++; problems++;
    console.log(`  ${C.y}⚠${C.x} 검사만 부르는 export ${testOnly.length}개 — ${TEST_ONLY_MAX}개에서 늘었다. 새로 넣은 것을 본 코드가 부르게 하거나 지운다${C.x}`);
    for (const t of testOnly) console.log(`       ${C.d}${t}${C.x}`);
} else {
    console.log(`  ${C.d}· 검사만 부르는 export ${testOnly.length}개 (상한 ${TEST_ONLY_MAX} — 줄면 상한을 내린다)${C.x}`);
}

/* ⓒ KEEP 에 있는데 이제 본 코드가 쓰는 이름 — 남긴 사유가 낡았다. 목록에서 뺀다 (검사가 «안 쓴다»를 지키려 이름을 글자로 품는 것은 쓰임이 아니다) */
for (const name of Object.keys(KEEP)) {
    const e = exports.find(x => x.name === name);
    if (!e) {
        found12++; problems++;
        console.log(`  ${C.y}⚠${C.x} ${(name + ' (KEEP · 없는 이름)').padEnd(30)} ${C.d}export 가 없다 — KEEP 줄을 지운다${C.x}`);
        continue;
    }
    const reK = new RegExp(`\\b${name}\\b`, 'g');
    const usedInProd = NON_TEST.some(f => f.rel !== e.file && reK.test(f.src))
        || ((NON_TEST.find(f => f.rel === e.file)?.src.match(reK) || []).length > 1);
    if (usedInProd) {
        found12++; problems++;
        console.log(`  ${C.y}⚠${C.x} ${(name + ' (KEEP · 이미 쓰임)').padEnd(30)} ${C.d}${e.file}:${e.line} — 남긴 사유가 낡았다 · KEEP 줄을 지운다${C.x}`);
    }
}
if (found12 === 0) console.log(`  ${C.g}없음 ✅${C.x}`);

// ═══════════════════════════ ①-3 원달앱(코틀린) — 정의 말고 쓰임 0
H('①-3 원달앱 코틀린 — 아무도 안 부르는 fun · const val (검사만 부르는 것 포함)');

const APP = join(ROOT, '../onedal-app/app/src');
const KT_MAIN = load(walk(join(APP, 'main'), ['.kt']));
/** 처음 잰 수 — 원달앱 죽은 코드를 지우며 0 으로 내린다. 늘면 문다 */
const KT_MAX = 0;
const ktFound = [];
const KT_TEST = load(walk(join(APP, 'test'), ['.kt']));
let foundKt = 0;
if (KT_MAIN.length === 0) {
    console.log(`  ${C.d}원달앱 소스가 없다 — 건너뜀${C.x}`);
} else {
    const defs = [];
    for (const f of KT_MAIN) {
        /* override · 생명주기 콜백은 안드로이드가 부른다 — 이름으로 안 찾는다 */
        for (const m of f.src.matchAll(/^[ \t]*(?:(?:private|internal|public|protected|inline|suspend|operator|infix|tailrec)\s+)*(?:fun\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?(\w+)\s*\(|const\s+val\s+(\w+))/gm)) {
            if (/\boverride\b/.test(m[0])) continue;
            defs.push({ file: f.rel, name: m[1] || m[2], line: f.src.slice(0, m.index).split('\n').length });
        }
    }
    const countIn = (files, re) => files.reduce((n, f) => n + (f.src.match(re) || []).length, 0);
    for (const d of defs) {
        if (KT_KEEP[d.name]) continue;
        const re = new RegExp(`\\b${d.name}\\b`, 'g');
        const mainUses = countIn(KT_MAIN, re) - 1;      // 정의 한 번을 뺀다
        if (mainUses > 0) continue;
        const testUses = countIn(KT_TEST, re);
        foundKt++;
        ktFound.push(`${(d.name + (testUses ? ' (검사만 부름)' : '')).padEnd(30)} ${d.file}:${d.line}`);
    }
    if (foundKt > KT_MAX) problems++;
    const mark = foundKt > KT_MAX ? `${C.y}⚠` : `${C.d}·`;
    for (const k of ktFound) console.log(`  ${mark}${C.x} ${C.d}${k}${C.x}`);
    if (foundKt === 0) console.log(`  ${C.g}없음 ✅${C.x} ${C.d}(fun ${defs.length}개 · override 제외)${C.x}`);
    else if (foundKt > KT_MAX) console.log(`  ${C.y}⚠ ${foundKt}개 — ${KT_MAX}개에서 늘었다. 새로 넣은 것을 부르게 하거나 지운다${C.x}`);
    else console.log(`  ${C.d}· ${foundKt}개 (상한 ${KT_MAX} — 줄면 상한을 내린다)${C.x}`);
}

// ═══════════════════════════ ② 세션에 없는 필드 접근
H('② 세션에 없는 필드를 읽는 곳  (오늘 두 건이 여기서 나왔다)');

const store = SERVER.find(f => f.rel.endsWith('state/userSessionStore.ts'));
const ifaceStart = store.src.indexOf('interface UserSession');
const ifaceEnd = store.src.indexOf('\n}', ifaceStart);
const iface = store.src.slice(ifaceStart, ifaceEnd);
const known = new Set([...iface.matchAll(/^\s{4}(\w+)[?:]/gm)].map(m => m[1]));

console.log(`  ${C.d}UserSession 이 선언한 필드 ${known.size}개${C.x}`);

const badAccess = [];
for (const f of SERVER) {
    if (f.rel.endsWith('state/userSessionStore.ts')) continue;

    /**
     * 🔴 `session` 이라는 이름은 이 레포에 여럿이다 (DeviceSession · socket.data 등).
     *    **`getUserSession()` 에서 받은 변수만** 본다 — 아니면 노이즈가 되어 아무도 안 본다.
     */
    const names = new Set(
        [...f.src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*getUserSession\(/g)].map(m => m[1])
    );
    if (names.size === 0) continue;

    for (const name of names) {
        const re = new RegExp(`(?:\\(\\s*)?${name}(?:\\s+as\\s+any\\s*\\))?\\.(\\w+)`, 'g');
        for (const m of f.src.matchAll(re)) {
            if (known.has(m[1])) continue;
            badAccess.push({ file: f.rel, line: f.src.slice(0, m.index).split('\n').length, field: m[1] });
        }
    }
}

if (badAccess.length === 0) {
    console.log(`  ${C.g}없음 ✅${C.x}`);
} else {
    const byField = {};
    for (const b of badAccess) (byField[b.field] ||= []).push(b);
    for (const [field, hits] of Object.entries(byField)) {
        problems++;
        console.log(`  ${C.r}⚠${C.x} ${C.b}session.${field}${C.x} ${C.d}— UserSession 에 없다. 늘 undefined 다${C.x}`);
        for (const h of hits) console.log(`       ${C.d}${h.file}:${h.line}${C.x}`);
    }
}

// ═══════════════════════════ ③ 세션을 any 로 받는 함수
H('③ 세션을 any 로 받는 함수  (타입이 없으면 tsc 가 못 잡는다)');

const anySession = [];
for (const f of SERVER) {
    for (const m of f.src.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*session[^)]*)\)/g)) {
        if (!/session\s*:\s*any/.test(m[2])) continue;
        anySession.push({ file: f.rel, line: f.src.slice(0, m.index).split('\n').length, fn: m[1] });
    }
}

if (anySession.length === 0) {
    console.log(`  ${C.g}없음 ✅${C.x}`);
} else {
    for (const a of anySession) {
        problems++;
        console.log(`  ${C.r}⚠${C.x} ${a.fn}(session: any)  ${C.d}${a.file}:${a.line}${C.x}`);
    }
    console.log(`\n  ${C.d}이런 함수는 호출부가 멀쩡해도 죽어 있다:${C.x}`);
    console.log(`  ${C.d}세션에서 사라진 필드를 읽는데 타입이 any 라 아무도 몰랐고, 몇 달째 null 만 반환했다.${C.x}`);
}

// ═══════════════════════════ 결론
console.log('');
if (problems === 0) {
    console.log(`${C.g}✅ 죽은 코드 이상 없음${C.x}\n`);
} else {
    console.log(`${C.y}⚠ 볼 곳 ${problems}건${C.x} ${C.d}— 규칙 위반이 아니라 "왜 안 불리는지" 확인할 자리다${C.x}\n`);
    process.exitCode = 1;
}
