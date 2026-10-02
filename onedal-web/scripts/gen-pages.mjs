/**
 * 누가: onedal-f5 (기사님 «플러그인스에 있는 값을 서버가 같이 써야» · reviews/34 2단계 · onedal-69 «가»)
 * 언제: shared/src/networkPages.ts(배차망 화면 정의 표)를 고친 뒤
 * 어디서: onedal-web — `pnpm gen:pages`
 * 무엇을: 표의 배차망 셋을 원달앱 화면 정의 코틀린(plugins/insung/InsungPages.kt · hwamul24/Hwamul24Pages.kt · kakaopicker/KakaoPickerPages.kt)으로 굳힌다
 * 왜: 배차망마다 다른 것을 shared 한 곳에만 둔다 — 서버는 표를 바로 읽고 원달앱은 뽑은 코드를 읽는다 · 같은지는 원달앱 NetworkPagesPairTest 가 문다
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const fail = (msg) => { console.error(`❌ ${msg}`); process.exit(1); };

const src = readFileSync(join(here, '../shared/src/networkPages.ts'), 'utf8');
const body = src.match(/\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//)?.[1];
if (!body) fail('networkPages.ts 에서 JSON 표시 사이를 못 찾았다');
let table;
try { table = JSON.parse(body); } catch (e) { fail(`networkPages.ts 의 JSON 이 깨졌다 — ${e.message}`); }

/* 낱말 → 코틀린 enum 이름 — 원달앱 core/PageField.kt 가 원천(shared pageFields 와 짝 검사가 이미 묶는다) */
const app = join(here, '../../onedal-app/app/src/main/java/com/onedal/app');
const pageFieldKt = readFileSync(join(app, 'core/PageField.kt'), 'utf8');
const enumOf = (name) => {
    const block = pageFieldKt.split(`enum class ${name}(`)[1]?.split('}')[0] ?? '';
    return Object.fromEntries([...block.matchAll(/^\s+(\w+)\("(\w+)"\)/gm)].map(([, e, w]) => [w, e]));
};
const PAGE = enumOf('Page');
const FIELD = enumOf('PageField');

/* 🔴 바꾸기 글자 대신 함수로 — 바꾸기 글자 안의 «$'» · «$&» 는 JS 가 특수 기호로 읽는다 */
const kstr = (s) => `"${String(s).replace(/\\/g, () => '\\\\').replace(/"/g, () => '\\"').replace(/\$/g, () => '\\$')}"`;
/* 정규식은 코틀린 날 글자("""…""")로 — 그 안에서도 $ 는 틀 글자라 ${'$'} 로 */
const kregex = (s) => s.includes('"""') ? `Regex(${kstr(s)})` : `Regex("""${s.replace(/\$/g, () => "${'$'}")}""")`;

const TARGETS = [
    ['insung', 'plugins/insung/InsungPages.kt', 'com.onedal.app.plugins.insung', 'InsungPages'],
    ['hwamul24', 'plugins/hwamul24/Hwamul24Pages.kt', 'com.onedal.app.plugins.hwamul24', 'Hwamul24Pages'],
    ['kakaopicker', 'plugins/kakaopicker/KakaoPickerPages.kt', 'com.onedal.app.plugins.kakaopicker', 'KakaoPickerPages'],
];

for (const [net, file, pkg, obj] of TARGETS) {
    const spec = table[net];
    if (!spec) fail(`표에 배차망 ${net} 이 없다`);
    const pages = Object.entries(spec.pages).map(([page, rows]) => {
        const p = PAGE[page] ?? fail(`${net} — 모르는 화면 «${page}» (core/PageField.kt Page 에 없다)`);
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
import com.onedal.app.core.Page
import com.onedal.app.core.PageField
import com.onedal.app.core.PageSpecs
import com.onedal.app.core.Seen

/**
${about}
 *
 * 🔴 **생성 파일이다 — 손으로 고치지 않는다** (\`cd onedal-web && pnpm gen:pages\`). 원천은 \`onedal-web/shared/src/networkPages.ts\` 의 «${net}» — 서버도 같은 표를 읽는다(reviews/34).
 */
object ${obj} {
    val pages: PageSpecs = mapOf(
${pages.join('\n')}
    )

    /** 🚚 차종 낱말 → 우리 차종(shared vehicleWords${spec.vehicleWordsWhy ? ` — ${spec.vehicleWordsWhy}` : ''}) */
    val vehicleWords: Map<String, String?> = ${vehicleWords}
}
`);
    console.log(`✅ ${file} — 화면 ${Object.keys(spec.pages).length} · 칸 ${Object.values(spec.pages).flat().length}`);
}
