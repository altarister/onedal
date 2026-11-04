/**
 * 누가: onedal-f5 (기사님 «플러그인스에 있는 값을 서버가 같이 써야» · onedal-69 «가»)
 * 언제: shared/src/network/networkPages.<배차망>.ts(배차망 화면 정의 표의 배차망 몫 — 칸 · 페이지 목록 · 자리 기록)나 pageFields.ts(기준 페이지 사전)를 고친 뒤
 * 어디서: onedal-web — `pnpm gen:pages`(원달앱 생성 파일) · `pnpm gen:pages doc`(설계/기준페이지_사전표.md 만 뽑음) · `pnpm gen:pages doc --check`(뽑은 글이 그 파일과 같은지만 봄)
 * 무엇을: 표의 배차망마다(칸 정의 · 페이지 목록 · 차종 낱말)를 원달앱 화면 정의 코틀린(plugins/insung/InsungPages.kt · hwamul24/Hwamul24Pages.kt · kakaopicker/KakaoPickerPages.kt · isflex/IsflexPages.kt)으로 굳힌다 · doc 이면 사전 + 정의 표에서 «자리 × 배차망» 사전표 글을 뽑는다
 * 왜: 배차망마다 다른 것을 shared 한 곳에만 둔다 — 서버는 표를 바로 읽고 원달앱은 뽑은 코드를 읽는다 · 같은지는 원달앱 NetworkPagesPairTest 가 문다
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { slotProblems, renderBasePageDoc, networkNames } from './lib/base-page-doc.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };

/* 🗂️ 배차망마다 한 파일(networkPages.<배차망>.ts)의 JSON 표시 사이를 읽어 한 표로 —
   배차망 목록은 shared targetApps.ts 의 TARGET_APPS 하나 · 배차망 파일 묶음이 그것과 다르면 멈춘다(배차망을 더하고 한 곳을 빠뜨리면 조용히 안 뽑히던 자리) */
const sharedDir = join(here, '../shared/src/network');
const NETWORKS = JSON.parse(readFileSync(join(sharedDir, 'targetApps.ts'), 'utf8').match(/TARGET_APPS = (\[[^\]]*\])/)?.[1]?.replace(/'/g, '"') ?? 'null')
    ?? fail('targetApps.ts 에서 TARGET_APPS 를 못 찾았다');
const files = readdirSync(sharedDir).map((f) => f.match(/^networkPages\.(\w+)\.ts$/)?.[1]).filter((n) => n && n !== 'test').sort();
if (JSON.stringify(files) !== JSON.stringify([...NETWORKS].sort())) fail(`배차망 파일(${files}) ≠ TARGET_APPS(${NETWORKS})`);
const table = {};
for (const net of NETWORKS) {
    const name = `networkPages.${net}.ts`;
    const src = readFileSync(join(sharedDir, name), 'utf8');
    const body = src.match(/\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//)?.[1];
    if (!body) fail(`${name} 에서 JSON 표시 사이를 못 찾았다`);
    try { table[net] = JSON.parse(body); } catch (e) { fail(`${name} 의 JSON 이 깨졌다 — ${e.message}`); }
}

/* 🧭 기준 페이지 사전 — shared pageFields.ts 의 JSON 표시 사이를 읽는다(TS 를 못 부르므로 글자를 그대로). 화면 종류 → 기준 페이지(baseOf)와 부속 팝업 자리 차례(callOverlays)가 여기서 온다 */
const BOOK = (() => {
    const body = readFileSync(join(sharedDir, 'pageFields.ts'), 'utf8').match(/\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//)?.[1];
    if (!body) fail('pageFields.ts 에서 JSON 표시 사이를 못 찾았다');
    try { return JSON.parse(body); } catch (e) { fail(`pageFields.ts 의 JSON 이 깨졌다 — ${e.message}`); }
})();

/* 🕳️ 배차망 × 자리마다 «화면 줄 / 없음 + 근거 / 모름 + 모을 것» — 어긋나면 어느 쪽 문서(원달앱 생성 파일 · 사전표)도 뽑지 않는다 */
const slotFails = slotProblems(BOOK, table);
if (slotFails.length) fail(`자리 기록이 어긋났다 — ${slotFails.join(' · ')}`);

/* 📄 doc — 원달앱 생성 파일은 건드리지 않고 사전표 글만 뽑는다(--check 는 파일을 안 쓰고 같은지만 본다) */
if (process.argv[2] === 'doc') {
    const docPath = join(here, '../../설계/기준페이지_사전표.md');
    const text = renderBasePageDoc(BOOK, table, networkNames(table));
    if (process.argv[3] === '--check') {
        if (readFileSync(docPath, 'utf8') !== text) fail('설계/기준페이지_사전표.md 가 사전 + 정의 표에서 다시 뽑은 글과 다르다 — cd onedal-web && pnpm gen:pages doc');
        console.log('✅ 설계/기준페이지_사전표.md — 사전 + 정의 표에서 다시 뽑은 글과 같다');
    } else {
        writeFileSync(docPath, text);
        console.log('✅ 설계/기준페이지_사전표.md — 사전 + 정의 표에서 뽑았다');
    }
    process.exit(0);
}

/* 낱말 → 코틀린 enum 이름 — 원달앱 core/PageField.kt 가 원천(shared pageFields 와 짝 검사가 이미 묶는다) */
const app = join(here, '../../onedal-app/app/src/main/java/com/onedal/app');
const pageFieldKt = readFileSync(join(app, 'core/PageField.kt'), 'utf8');
const enumOf = (name) => {
    const block = pageFieldKt.split(`enum class ${name}(`)[1]?.split('}')[0] ?? '';
    return Object.fromEntries([...block.matchAll(/^\s+(\w+)\("(\w+)"\)/gm)].map(([, e, w]) => [w, e]));
};
const PAGE = enumOf('Page');
const FIELD = enumOf('PageField');
/* 이름만 늘어선 enum — 원달앱 core/PageSpec.kt 가 원천(shared STANDARD_SCREENS 와 짝은 NetworkPagesPairTest) */
const pageSpecKt = readFileSync(join(app, 'core/PageSpec.kt'), 'utf8');
const namesOf = (name) => (pageSpecKt.split(`enum class ${name} {`)[1]?.split('}')[0] ?? '').split(',').map((w) => w.trim()).filter(Boolean);
const STANDARD = namesOf('StandardScreen');
const OVERLAY_KIND = namesOf('OverlayKind');
const OVERLAY_ACTION = namesOf('OverlayAction');
const SEEN = ['REAL', 'SIM', 'UNKNOWN'];

/* 🔴 바꾸기 글자 대신 함수로 — 바꾸기 글자 안의 «$'» · «$&» 는 JS 가 특수 기호로 읽는다 */
const kstr = (s) => `"${String(s).replace(/\\/g, () => '\\\\').replace(/"/g, () => '\\"').replace(/\$/g, () => '\\$')}"`;
/* 정규식은 코틀린 날 글자("""…""")로 — 그 안에서도 $ 는 틀 글자라 ${'$'} 로 */
const kregex = (s) => s.includes('"""') ? `Regex(${kstr(s)})` : `Regex("""${s.replace(/\$/g, () => "${'$'}")}""")`;

const klist = (xs) => `listOf(${(xs ?? []).map(kstr).join(', ')})`;
const kmatch = (at, m) => {
    const args = [];
    if (m.all?.length) args.push(`all = ${klist(m.all)}`);
    if (m.any?.length) args.push(`any = ${klist(m.any)}`);
    if (m.none?.length) args.push(`none = ${klist(m.none)}`);
    if (m.shape) {
        try { new RegExp(m.shape.read); } catch (e) { fail(`${at} — shape 정규식이 JS 에서 깨진다: ${e.message}`); }
        args.push(`shape = ${kregex(m.shape.read)}`);
        if (m.shape.min !== undefined) args.push(`shapeMin = ${m.shape.min}`);
        if (m.shape.max !== undefined) args.push(`shapeMax = ${m.shape.max}`);
    }
    return `ScreenMatch(${args.join(', ')})`;
};
const kmatches = (at, ms) => ms.length ? `listOf(${ms.map((m) => kmatch(at, m)).join(', ')})` : 'emptyList()';
const ktail = (o) => [o.toCollect ? `toCollect = ${kstr(o.toCollect)}` : null, o.wordsFrom ? `wordsFrom = ${kstr(o.wordsFrom)}` : null].filter(Boolean);
const kscreen = (net, s, callFront) => {
    const at = `${net} 페이지 «${s.name}»`;
    if (s.standard !== null && !STANDARD.includes(s.standard)) fail(`${at} — 모르는 화면 종류 «${s.standard}» (core/PageSpec.kt StandardScreen 에 없다)`);
    if (!SEEN.includes(s.seen)) fail(`${at} — seen «${s.seen}»`);
    /* 기준 페이지는 화면 종류에서 나온다(사전 baseOf) — 표에 없는 화면 종류면 멈추고 · null 이면 기준 밖이라 base 를 안 적는다.
       홈 + 원달앱 Page 낱말(shared BASE_PAGES 와 같은 집합 — PageFieldPairTest 가 Page ↔ SCREEN_PAGES 를 묶는다) · 원달앱은 낱말이라 오타를 여기서 막는다 */
    if (s.standard !== null && !(s.standard in BOOK.baseOf)) fail(`${at} — 사전 baseOf 에 화면 종류 «${s.standard}» 가 없다`);
    const base = s.standard === null ? null : BOOK.baseOf[s.standard];
    if (base !== null && base !== 'home' && !Object.keys(PAGE).includes(base)) fail(`${at} — 모르는 기준 «${base}» (홈 · core/PageField.kt Page 밖)`);
    /* 단추 글자 — 넷 낱말만 · 빈 글자 막기 */
    const BUTTON_KEYS = ['accept', 'filterOut', 'keep', 'cancel'];
    const buttons = s.buttons ? Object.entries(s.buttons) : [];
    for (const [k, v] of buttons) {
        if (!BUTTON_KEYS.includes(k)) fail(`${at} — 모르는 단추 «${k}» (${BUTTON_KEYS.join(' · ')})`);
        if (typeof v !== 'string' || !v) fail(`${at} — 단추 «${k}» 글자가 비었다`);
    }
    /* 🪟 부속 팝업은 새 콜 화면 · 내 콜 화면 줄 덧칸 맨 앞에(shared withCallOverlays 와 같은 법 · slot 은 안 뽑는다) */
    const overlays = [...(base === 'newCall' || base === 'myCall' ? callFront : []), ...s.overlays].map((o) => {
        const oat = `${at} 덧칸 «${o.name}»`;
        if (!OVERLAY_KIND.includes(o.kind)) fail(`${oat} — 모르는 갈래 «${o.kind}»`);
        if (!SEEN.includes(o.seen)) fail(`${oat} — seen «${o.seen}»`);
        if (o.action !== undefined && !OVERLAY_ACTION.includes(o.action)) fail(`${oat} — 모르는 action «${o.action}» (core/PageSpec.kt OverlayAction 에 없다)`);
        const args = [kstr(o.name), `OverlayKind.${o.kind}`, kmatches(oat, o.match), kstr(o.meaning), `Seen.${o.seen}`, klist(o.evidence), ...ktail(o),
            ...(o.action ? [`action = OverlayAction.${o.action}`] : [])];
        return `                OverlaySpec(${args.join(', ')}),`;
    });
    const args = [kstr(s.name), s.standard === null ? 'null' : `StandardScreen.${s.standard}`, kmatches(at, s.match), String(s.listReturn),
        overlays.length ? `listOf(\n${overlays.join('\n')}\n            )` : 'emptyList()', `Seen.${s.seen}`, klist(s.evidence), ...ktail(s),
        ...(s.landsAfterAccept ? ['landsAfterAccept = true'] : []),
        ...(base ? [`base = ${kstr(base)}`] : []),
        ...(buttons.length ? [`buttons = ScreenButtons(${buttons.map(([k, v]) => `${k} = ${kstr(v)}`).join(', ')})`] : [])];
    return `        ScreenSpec(\n            ${args.join(',\n            ')},\n        ),`;
};

const TARGETS = [
    ['insung', 'plugins/insung/InsungPages.kt', 'com.onedal.app.plugins.insung', 'InsungPages'],
    ['hwamul24', 'plugins/hwamul24/Hwamul24Pages.kt', 'com.onedal.app.plugins.hwamul24', 'Hwamul24Pages'],
    ['kakaopicker', 'plugins/kakaopicker/KakaoPickerPages.kt', 'com.onedal.app.plugins.kakaopicker', 'KakaoPickerPages'],
    ['isflex', 'plugins/isflex/IsflexPages.kt', 'com.onedal.app.plugins.isflex', 'IsflexPages'],
];

if (JSON.stringify(TARGETS.map(([n]) => n).sort()) !== JSON.stringify([...NETWORKS].sort())) fail('생성 대상(TARGETS) ≠ TARGET_APPS — 배차망을 더하면 생성 파일 자리도 적는다');
for (const [net, file, pkg, obj] of TARGETS) {
    const spec = table[net];
    if (!spec) fail(`표에 배차망 ${net} 이 없다`);
    /* 🪟 부속 팝업 — 사전의 자리 차례(callOverlays 열쇠 차례)로 한 번씩 · 자리가 있는 덧칸은 상세를 채우는 일(FILL_*) */
    const parts = spec.callOverlays ?? [];
    const slots = Object.keys(BOOK.callOverlays);
    if (parts.length && JSON.stringify(parts.map((o) => o.slot).sort()) !== JSON.stringify([...slots].sort())) fail(`${net} callOverlays 의 자리(slot)가 ${slots.join(' · ')} 각각 하나가 아니다`);
    for (const o of parts) if (!String(o.action ?? '').startsWith('FILL_')) fail(`${net} callOverlays «${o.name}» — 자리가 있는 덧칸은 action 이 FILL_* 여야 한다`);
    const callFront = slots.flatMap((slot) => parts.filter((o) => o.slot === slot));
    const pages = Object.entries(spec.pages).map(([page, rows]) => {
        const p = PAGE[page] ?? fail(`${net} — 모르는 화면 «${page}» (core/PageField.kt Page 에 없다)`);
        if (!rows.length) return `        Page.${p} to emptyList<FieldSpec>(),`;
        const lines = rows.map((r) => {
            const f = FIELD[r.field] ?? fail(`${net} ${page} — 모르는 칸 «${r.field}»`);
            if (!['REAL', 'SIM', 'UNKNOWN'].includes(r.seen)) fail(`${net} ${page} ${r.field} — seen «${r.seen}»`);
            if (!['READ', 'DROPPED', 'UNUSED'].includes(r.handling)) fail(`${net} ${page} ${r.field} — handling «${r.handling}»`);
            if (r.read !== undefined) { try { new RegExp(r.read); } catch (e) { fail(`${net} ${page} ${r.field} — read 정규식이 JS 에서 깨진다: ${e.message}`); } }
            const args = [`PageField.${f}`, kstr(r.where), kstr(r.sample), `Seen.${r.seen}`, `Handling.${r.handling}`];
            if (r.usedAt !== undefined || r.read !== undefined || r.part) args.push(kstr(r.usedAt ?? ''));
            /* 🧩 조각(part) — 같은 칸이 한 화면에 여럿일 때. 빈 조각은 싣지 않는다 */
            const named = [r.read !== undefined ? `read = ${kregex(r.read)}` : null, r.part ? `part = ${kstr(r.part)}` : null].filter(Boolean);
            const call = named.length
                ? `            FieldSpec(${args.join(', ')},\n                ${named.join(', ')}),`
                : `            FieldSpec(${args.join(', ')}),`;
            return (r.note ? `            /* ${r.note} */\n` : '') + call;
        });
        return `        Page.${p} to listOf(\n${lines.join('\n')}\n        ),`;
    });
    const about = (spec.about ?? []).map((l) => ` * ${l}`.trimEnd()).join('\n');
    /* 🚚 차종 낱말 → 우리 차종 — 없으면 빈 지도(원달앱이 «모름»으로 본다) · null 은 «아는 낱말 · 우리 차종 없음» */
    const words = spec.vehicleWords ?? [];
    const vehicleWords = words.length
        ? `mapOf(\n${words.map((w) => `        ${kstr(w.word)} to ${w.vehicle === null ? 'null' : kstr(w.vehicle)},`).join('\n')}\n    )`
        : 'emptyMap()';
    writeFileSync(join(app, file), `package ${pkg}

import com.onedal.app.core.FieldSpec
import com.onedal.app.core.Handling
import com.onedal.app.core.OverlayKind
import com.onedal.app.core.OverlaySpec
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.OverlayAction
import com.onedal.app.core.ScreenButtons
import com.onedal.app.core.ScreenMatch
import com.onedal.app.core.ScreenSpec
import com.onedal.app.core.Seen
import com.onedal.app.core.StandardScreen

/**
${about}
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (\`cd onedal-web && pnpm gen:pages\`). 원천은 \`onedal-web/shared/src/network/networkPages.${net}.ts\` — 서버도 같은 표를 읽는다.
 */
object ${obj} {
    val pages: PageSpecs = mapOf(
${pages.join('\n')}
    )

    /** 🚚 차종 낱말 → 우리 차종(shared vehicleWords${spec.vehicleWordsWhy ? ` — ${spec.vehicleWordsWhy}` : ''}) */
    val vehicleWords: Map<String, String?> = ${vehicleWords}

    /** 🧭 배차망을 가르는 글자 묶음(shared networkMarkers — ${spec.networkMarkersWhy ?? ''}) · 묶음 안 글자가 전부 보이면 이 배차망 */
    val networkMarkers: List<List<String>> = listOf(
${(spec.networkMarkers ?? fail(`표에 ${net} networkMarkers 가 없다`)).map((g) => `        ${klist(g)},`).join('\n')}
    )

    /** ⚙️ 배차망 규칙(shared modes · packageKeywords · safeCancelSec · detailBackSec — ${spec.rulesWhy ?? ''}) · 시간은 값이 아니라 설정 칸 이름(FilterConfig.secOf) */
    val modes: Set<String> = setOf(${(spec.modes ?? fail(`표에 ${net} modes 가 없다`)).map(kstr).join(', ')})
    val packageKeywords: List<String> = ${klist(spec.packageKeywords ?? fail(`표에 ${net} packageKeywords 가 없다`))}
    val safeCancelSecKey: String? = ${spec.safeCancelSec ? kstr(spec.safeCancelSec) : 'null'}
    val detailBackSecKey: String? = ${spec.detailBackSec ? kstr(spec.detailBackSec) : 'null'}

    /** 🖥️ 페이지 전부 — 차례가 판별 차례 · 화면 판별(ScreenDetector)이 이 목록만 읽는다 */
    val screens: List<ScreenSpec> = listOf(
${(spec.screens ?? fail(`표에 ${net} 페이지 목록(screens)이 없다`)).map((s) => kscreen(net, s, callFront)).join('\n')}
    )
}
`);
    console.log(`✅ ${file} — 화면 ${Object.keys(spec.pages).length} · 칸 ${Object.values(spec.pages).flat().length} · 페이지 ${spec.screens.length}`);
}
