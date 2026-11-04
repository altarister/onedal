/* 📋 shared 파일 보기 — 내보낸 함수 · 타입 · 값을 표로. 쓰는 길이 없다. 줄 머리를 누르면 정렬한다 */
import { drawMenu } from '/shared/_/menu.js';

drawMenu();
const file = decodeURIComponent(location.pathname).replace(/^\/shared\//, '').replace(/\/$/, '');
const box = document.getElementById('box');
const text = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v, null, 1) : String(v));

const sortText = (v) => (v && typeof v === 'object' && 'text' in v ? v.text : text(v));

function rowsOf(value) {
    if (Array.isArray(value)) {
        if (value.every((v) => v && typeof v === 'object' && !Array.isArray(v))) return value;
        return value.map((v) => ({ '값': v }));
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? { '키': k, ...v } : { '키': k, '값': v }));
    }
    return [{ '값': value }];
}

/* 칸 정의(columns)와 줄(rows)을 가진 표 — 칸 머리는 그 이름으로, 배차망 칸은 글과 읽어 보기로 */
const isBook = (v) => v && typeof v === 'object' && Array.isArray(v.columns) && Array.isArray(v.rows);

async function readInto(td, app, cell, samples) {
    const sample = samples?.[app] ?? '';
    const results = await Promise.all(cell.reads.map((r) => fetch('/shared/_/read', { method: 'POST', body: JSON.stringify({ app, ...r, sample }) }).then((x) => x.json())));
    const box = document.createElement('div');
    if (!results.some((r) => r.defined)) { box.className = 'read app'; box.textContent = '서버는 안 읽음 (앱이 읽음)'; td.append(box); return; }
    const found = results.map((r) => r.value).filter(Boolean);
    box.className = 'read';
    box.textContent = `읽어 보기: ${found.length ? (cell.how === 'join' ? found.join(cell.with ?? ' ') : found[0]) : '(견본에 없음)'}`;
    td.append(box);
}

function draw(rows, book) {
    const columns = book ? book.columns.map((c) => c.key) : [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const labelOf = (k) => book?.columns.find((c) => c.key === k)?.label ?? k;
    let sort = null;
    const el = document.createElement('table');
    const paint = () => {
        el.textContent = '';
        const head = el.createTHead().insertRow();
        for (const c of columns) {
            const th = document.createElement('th');
            const b = document.createElement('button');
            b.textContent = `${labelOf(c)} ${sort?.key === c ? (sort.desc ? '▼' : '▲') : '↕'}`;
            b.addEventListener('click', () => { sort = sort?.key !== c ? { key: c, desc: false } : sort.desc ? null : { key: c, desc: true }; paint(); });
            th.append(b);
            head.append(th);
        }
        const order = rows.map((_, i) => i);
        if (sort) order.sort((a, b) => {
            const x = sortText(rows[a][sort.key]); const y = sortText(rows[b][sort.key]);
            if (!x || !y) return x ? -1 : y ? 1 : a - b;
            const c = x.localeCompare(y, 'ko', { numeric: true });
            return (sort.desc ? -c : c) || a - b;
        });
        const body = el.createTBody();
        for (const i of order) {
            const tr = body.insertRow();
            for (const c of columns) {
                const td = tr.insertCell();
                td.className = 'plain';
                const cell = rows[i][c];
                if (cell && typeof cell === 'object' && 'text' in cell) {
                    if (cell.state && cell.state !== '지금') { const s = document.createElement('div'); s.className = 'state'; s.textContent = cell.state; td.append(s); }
                    td.append(cell.text);
                    if (cell.reads?.length) readInto(td, c, cell, book?.samples);
                } else td.textContent = text(cell);
            }
        }
    };
    paint();
    return el;
}

/* 🗂️ 배차망 정의 표 — 종류가 다른 내용을 한 표에 펼치지 않고 페이지별 칸 · 화면 위 팝업 · 화면 알아보기 · 규칙 · 차종 낱말 · 메모로 나눠 그린다 */
const SEEN_LABEL = { REAL: '실물', SIM: '시뮬레이터', UNKNOWN: '모름' };
const HANDLING_LABEL = { READ: '읽음', DROPPED: '읽고 버림', UNUSED: '안 읽음' };
const PRESENCE_LABEL = { ALWAYS: '늘 있음', SOMETIMES: '있다 없다', ONCE: '한 건에만', UNKNOWN: '모름' };
const RULE_LABEL = {
    modes: ['모드', 'rulesWhy'], packageKeywords: ['앱을 찾는 낱말'], safeCancelSec: ['안전취소 시간 설정', 'rulesWhy'], detailBackSec: ['상세 머묾 시간 설정', 'rulesWhy'],
    excludeScan: ['제외어를 찾는 칸', 'excludeScanWhy'], addressCut: ['주소에서 지우는 글자', 'addressCutWhy'], networkMarkers: ['배차망을 알아보는 글자', 'networkMarkersWhy'],
};
const DRAWN_KEYS = ['about', 'pages', 'callOverlays', 'screens', 'vehicleWords', 'vehicleWordsWhy', 'slotNotes', 'rulesWhy', 'excludeScanWhy', 'addressCutWhy', 'networkMarkersWhy', ...Object.keys(RULE_LABEL)];
const sectionHead = (words) => { const h = document.createElement('h2'); h.className = 'value'; h.textContent = words; return h; };
const paragraph = (words) => { const p = document.createElement('p'); p.textContent = words; return p; };
const matchText = (match) => (match ?? []).map((m) => [m.all && m.all.join(' + '), m.any && `${m.any.join(' 또는 ')} 중 하나`, m.none && `${m.none.join(' · ')} 없음`, m.shape && `글자 꼴 ${m.shape.read}`].filter(Boolean).join(' / ')).join('\n또는 ');

function drawNetworkBook(spec, fields) {
    const tableOf = (rows) => (rows.length > 0 ? draw(rows) : paragraph('없음'));
    const book = fields.find((v) => v.name === 'BASE_PAGE_BOOK').rows.pages;
    const pageOf = fields.find((v) => v.name === 'BASE_PAGE_OF').rows;
    const out = [sectionHead('페이지별 칸')];
    for (const [page, rows] of Object.entries(spec.pages)) {
        const h = document.createElement('h3');
        h.textContent = `${book[page]?.label ?? page} (${page}) — 칸 ${rows.length}개`;
        out.push(h, paragraph(book[page]?.does ?? ''), draw(rows.map((r) => ({
            '화면 자리': r.where, '화면 칸': r.part ? `${r.field} · ${r.part}` : r.field, '글자 견본': r.sample, '읽나': HANDLING_LABEL[r.handling] ?? r.handling,
            '본 곳': SEEN_LABEL[r.seen] ?? r.seen, '늘 있나': PRESENCE_LABEL[r.presence] ?? '모름', '읽는 곳': r.usedAt ?? '', '덧말': r.note ?? '',
        }))));
    }
    out.push(sectionHead(`화면 위에 뜨는 팝업 ${spec.callOverlays?.length ?? 0}개`), tableOf((spec.callOverlays ?? []).map((o) => ({
        '팝업': o.name, '뜻': o.meaning, '알아보는 글자': matchText(o.match), '본 곳': SEEN_LABEL[o.seen] ?? o.seen, '근거': (o.evidence ?? []).join('\n'),
    }))));
    out.push(sectionHead(`화면 알아보기 ${spec.screens.length}개`), draw(spec.screens.map((s) => ({
        '화면': s.name, '기준 페이지': book[pageOf[s.standard]]?.label ?? '', '알아보는 글자': matchText(s.match), '버튼': Object.values(s.buttons ?? {}).join(' · '),
        '위에 뜨는 것': (s.overlays ?? []).map((o) => o.name).join('\n'), '본 곳': SEEN_LABEL[s.seen] ?? s.seen, '근거': (s.evidence ?? []).join('\n'),
    }))));
    out.push(sectionHead('배차망 규칙'), draw(Object.entries(RULE_LABEL).map(([key, [label, why]]) => ({
        '항목': label, '값': Array.isArray(spec[key]) ? spec[key].map((v) => (Array.isArray(v) ? v.join(' + ') : v)).join(' · ') : spec[key] ?? '없음', '까닭': spec[why] ?? '',
    }))));
    out.push(sectionHead(`차종 낱말 ${spec.vehicleWords?.length ?? 0}개`), paragraph(spec.vehicleWordsWhy ?? ''), tableOf((spec.vehicleWords ?? []).map((w) => ({ '화면 낱말': w.word, '차종': w.vehicle ?? '없음', '본 곳': SEEN_LABEL[w.seen] ?? w.seen }))));
    out.push(sectionHead('메모'), ...(spec.about ?? []).map(paragraph));
    out.push(sectionHead('아직 모을 것'), tableOf(Object.entries(spec.slotNotes ?? {}).map(([slot, note]) => ({ '자리': book[slot]?.label ?? slot, '내용': note.toCollect ?? note.why ?? '', '근거': note.evidence ?? '' }))));
    const rest = Object.entries(spec).filter(([key]) => !DRAWN_KEYS.includes(key));
    if (rest.length > 0) out.push(sectionHead('그 밖의 항목'), draw(rest.map(([key, value]) => ({ '항목': key, '값': value }))));
    return out;
}

document.title = file;
document.getElementById('title').textContent = file;
fetch(`/shared/_/module/${file}`).then((r) => r.json()).then(async ({ values, limit, six, functions, aliases, interfaces }) => {
    const sixBox = document.getElementById('six');
    if (six.length === 0) sixBox.textContent = '6하원칙 없음';
    for (const s of six) {
        const line = document.createElement('div');
        const word = document.createElement('b');
        word.textContent = `${s.word}: `;
        line.append(word, s.text);
        sixBox.append(line);
    }
    const heading = (words) => {
        const h = document.createElement('h2');
        h.className = 'value';
        h.textContent = words;
        return h;
    };
    if (functions.length > 0) box.append(heading(`함수 ${functions.length}개`), draw(functions));
    if (aliases.length > 0) box.append(heading(`타입 ${aliases.length}개`), draw(aliases));
    for (const shape of interfaces) {
        box.append(heading(`${shape.name} (칸 ${shape.rows.length}개) — ${shape.about}`), draw(shape.rows));
    }
    if (functions.length + aliases.length + interfaces.length + values.length === 0) box.textContent = '표로 볼 것이 없습니다.';
    for (const v of values) {
        if (/^network\/networkPages\.\w+$/.test(file)) {
            const fields = await fetch('/shared/_/module/network/pageFields').then((r) => r.json());
            box.append(...drawNetworkBook(v.rows, fields.values));
            continue;
        }
        const h = document.createElement('h2');
        h.className = 'value';
        h.textContent = v.total > limit ? `${v.name} — ${v.total}개 중 ${limit}개` : v.name;
        if (isBook(v.rows)) {
            h.textContent = v.rows.title ?? v.name;
            const about = document.createElement('p');
            about.textContent = v.rows.about ?? '';
            box.append(h, about, draw(v.rows.rows, v.rows));
        } else box.append(h, draw(rowsOf(v.rows)));
    }
}).catch((e) => { box.textContent = `못 읽음: ${e}`; });
