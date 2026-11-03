/**
 * 누가: gen-pages.mjs(`pnpm gen:pages doc`)와 shared 검사 pagesDoc.test.ts — 파일 쓰기는 부르는 쪽이 한다
 * 언제: 기준 페이지 사전(shared pageFields.ts) 또는 배차망 정의 표(networkPages.<배차망>.ts)를 고친 뒤 · 사전표를 읽는 검사가 돌 때
 * 어디서: onedal-web — `pnpm gen:pages doc` · `pnpm test:web`
 * 무엇을: 사전 + 정의 표에서 «배차망 × 자리» 빠짐을 검사하고, 설계/기준페이지_사전표.md 의 글을 만든다
 * 왜: 이름표 문서의 자리 × 배차망 표가 손으로 적은 표라 정의 표와 갈라져도 아무도 몰랐다 — 한 원천에서 뽑아 갈라질 수 없게 한다
 */
import { readFileSync } from 'fs';

const JSON_MARK = /\/\*JSON\*\/([\s\S]*?)\/\*JSON\*\//;

/** 파일의 JSON 표시 사이를 읽는다 — 뽑는 스크립트 · 원달앱 짝 검사와 같은 읽기 */
export function readJsonBlock(path) {
    const m = readFileSync(path, 'utf8').match(JSON_MARK);
    if (!m) throw new Error(`${path} 에서 JSON 표시 사이를 못 찾았다`);
    return JSON.parse(m[1]);
}

/** 배차망 정식 이름(열 머리) — 정의 표 머리말 `about[0]` 의 «**이름 페이지 정의**» 에서 읽는다. 줄임말(24시 · 픽커 · 플렉스)은 문서에 쓰지 않는다 */
export function networkNames(specs) {
    return Object.fromEntries(Object.entries(specs).map(([net, spec]) => {
        const name = spec.about?.[0]?.match(/\*\*(.+?) 페이지 정의/)?.[1];
        if (!name) throw new Error(`${net} 정의 표 머리말(about[0])에서 «**이름 페이지 정의**» 를 못 찾았다`);
        return [net, name];
    }));
}

/** 자리 열쇠 — 사전의 기준 페이지 차례 · 운행 단계 차례 · 부속 팝업 차례(손으로 나열하지 않는다) */
export function slotKeys(book) {
    return [...Object.keys(book.pages), ...Object.keys(book.runStages), ...Object.keys(book.callOverlays)];
}

/** 화면 줄 하나가 들어가는 자리 — 화면 종류에서 사전 baseOf 로 기준 페이지를 정하고, 내 콜 화면(myCall)만 운행 단계 열쇠인지로 둘로 나눈다. 기준 밖이면 null */
export function slotOfScreen(book, screen) {
    if (screen.standard === null || screen.standard === undefined) return null;
    if (!(screen.standard in book.baseOf)) throw new Error(`사전 baseOf 에 화면 종류 «${screen.standard}» 가 없다`);
    const base = book.baseOf[screen.standard];
    if (base === null) return null;
    return base === 'myCall' && screen.standard in book.runStages ? screen.standard : base;
}

/** 배차망 하나의 자리별 화면 줄 이름 — { 자리: [이름…] } (부속 팝업은 callOverlays 에서) */
export function screensBySlot(book, spec) {
    const out = {};
    for (const screen of spec.screens) {
        const slot = slotOfScreen(book, screen);
        if (slot !== null) (out[slot] ??= []).push(screen.name);
    }
    for (const overlay of spec.callOverlays ?? []) (out[overlay.slot] ??= []).push(overlay.name);
    return out;
}

/** 배차망 × 자리마다 «화면 줄 / 없음 + 근거 / 모름 + 모을 것» 중 하나인지 — 어긋난 곳을 글로 돌려준다(비면 통과) */
export function slotProblems(book, specs) {
    const slots = slotKeys(book);
    const problems = [];
    for (const [net, spec] of Object.entries(specs)) {
        const have = screensBySlot(book, spec);
        const notes = spec.slotNotes ?? {};
        for (const key of Object.keys(notes)) if (!slots.includes(key)) problems.push(`${net} slotNotes «${key}» — 사전에 없는 자리`);
        for (const slot of slots) {
            const at = `${net} 자리 «${slot}»`;
            const note = notes[slot];
            const hasWhy = !!note && 'why' in note;
            const hasCollect = !!note && 'toCollect' in note;
            if (hasWhy && (!note.why || !note.evidence)) problems.push(`${at} — 없음 기록에 까닭 · 근거가 비었다`);
            if (hasCollect && !note.toCollect) problems.push(`${at} — 모름 기록에 모을 것이 비었다`);
            if (have[slot]) {
                if (hasWhy) problems.push(`${at} — 화면 줄이 있는데 «없음» 으로 적었다`);
            } else if (hasWhy === hasCollect) {
                problems.push(`${at} — 화면 줄도 없고 «없음 + 근거» · «모름 + 모을 것» 중 하나도 아니다`);
            }
        }
    }
    return problems;
}

const OWNER_TEXT = { none: '없음', me: '나' };
const SHAPE_TEXT = { list: '목록(여러 건)', one: '한 건' };
const upperSnake = (key) => key.replace(/([A-Z])/g, '_$1').toUpperCase();
const cell = (text) => String(text).replace(/\|/g, '\\|');

/** 사전표 글 — 시각 · 날짜를 넣지 않고 차례는 사전 차례 × 배차망 차례로 고정한다 */
export function renderBasePageDoc(book, specs, labels) {
    const nets = Object.keys(specs);
    const out = [];
    out.push('# 기준 페이지 사전표');
    out.push('');
    out.push('> 🔴 **생성 파일이다 — 손으로 고치지 않는다** · `cd onedal-web && pnpm gen:pages doc`');
    out.push('> 원천: shared `pageFields.ts` 의 기준 페이지 사전 + 배차망 정의 표 `networkPages.<배차망>.ts`. 뽑은 글이 이 파일과 같은지는 shared `pagesDoc.test.ts` 가 묻는다.');
    out.push('');
    out.push('## 1. 기준 페이지 — 이름의 원천');
    out.push('');
    out.push('이름은 콜의 두 사실(주인이 없음/나 × 목록/한 건)로만 짓는다. 배차망이 부르는 이름은 정의 표 화면 줄 이름에만 둔다.');
    out.push('');
    out.push('| 기준 페이지 | 코드 값 | 원달앱 상수 | 콜의 주인 | 모양 | 하는 일 |');
    out.push('|---|---|---|---|---|---|');
    for (const [key, page] of Object.entries(book.pages)) {
        const constant = page.owner === null ? '— (칸을 안 적음)' : `\`${upperSnake(key)}\``;
        out.push(`| ${page.label} | \`${key}\` | ${constant} | ${page.owner === null ? '—' : OWNER_TEXT[page.owner]} | ${page.shape === null ? '—' : SHAPE_TEXT[page.shape]} | ${cell(page.does)} |`);
    }
    out.push('');
    out.push('내 콜 화면 안의 운행 단계 — 화면 종류 이름은 그대로 두고, 어느 기준 페이지인지는 사전 `baseOf` 가 정한다.');
    out.push('');
    out.push('| 화면 종류 | 운행 단계 |');
    out.push('|---|---|');
    for (const [key, label] of Object.entries(book.runStages)) out.push(`| \`${key}\` | ${label} |`);
    out.push('');
    out.push('콜 한 건 화면 위의 부속 팝업 — 정의 표에서는 부속 자리 `slot` 으로 가른다.');
    out.push('');
    out.push('| 부속 자리 | 공통 이름 |');
    out.push('|---|---|');
    for (const [key, label] of Object.entries(book.callOverlays)) out.push(`| \`${key}\` | ${label} |`);
    out.push('');
    out.push('## 2. 배차망이 부르는 이름 — 자리 × 배차망');
    out.push('');
    out.push('칸은 셋 중 하나다. **이름** = 정의 표 화면 줄 이름 글자 그대로 · **② 없음** = 이 배차망엔 그 자리가 없다 + 근거 · **?** = 아직 모름 + 무엇을 모을 것인가. 한 칸에 화면 줄이 여럿이면 ` / ` 로 잇는다. 이름 뒤의 `?` 는 화면 줄은 있으나 모을 것이 남았다는 뜻이다.');
    out.push('못 본 화면에 지어낸 이름을 붙여 정의 표 줄을 미리 만들지 않는다 — 이 표의 `?` 칸에만 둔다.');
    out.push('');
    out.push(`| 자리 | ${nets.map((n) => labels[n] ?? n).join(' | ')} |`);
    out.push(`|---|${nets.map(() => '---').join('|')}|`);
    const slotLabel = (slot) => {
        if (slot === 'myCall') return `${book.pages.myCall.label} — 콜 전체`;
        if (slot in book.pages) return book.pages[slot].label;
        if (slot in book.runStages) return `${book.pages.myCall.label} — ${book.runStages[slot]}`;
        return `부속 — ${book.callOverlays[slot]}`;
    };
    const perNet = Object.fromEntries(nets.map((n) => [n, screensBySlot(book, specs[n])]));
    for (const slot of slotKeys(book)) {
        const cells = nets.map((n) => {
            const names = perNet[n][slot] ?? [];
            const note = specs[n].slotNotes?.[slot];
            const parts = [];
            if (names.length) parts.push(names.join(' / '));
            if (note && 'why' in note) parts.push(`② 없음 — ${note.why} (${note.evidence})`);
            if (note && 'toCollect' in note) parts.push(`? ${note.toCollect}`);
            return cell(parts.join(' '));
        });
        out.push(`| ${slotLabel(slot)} | ${cells.join(' | ')} |`);
    }
    out.push('');
    return out.join('\n');
}
