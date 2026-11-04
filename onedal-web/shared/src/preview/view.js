/* 📋 shared 파일 보기 — 내보낸 함수 · 타입 · 값을 표로. 쓰는 길이 없다. 줄 머리를 누르면 정렬한다 */
import { drawMenu } from '/shared/_/menu.js';

drawMenu();
const file = decodeURIComponent(location.pathname).replace(/^\/shared\//, '').replace(/\/$/, '');
const box = document.getElementById('box');
/* 칸 글자 — JSON 괄호 없이: 글자 목록은 · 로, 묶음은 «이름: 값» 줄로 */
const text = (v) => {
    if (v === null || v === undefined) return '';
    if (Array.isArray(v)) return v.map(text).join(v.some((x) => x && typeof x === 'object') ? '\n' : ' · ');
    if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${text(x)}`).join('\n');
    return String(v);
};

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
            '본 곳': SEEN_LABEL[r.seen] ?? r.seen, '늘 있나': r.presence ? PRESENCE_LABEL[r.presence] ?? r.presence : '안 적음',
            '늘 있나 근거': r.presenceEvidence ? `${r.presenceEvidence.seen}/${r.presenceEvidence.of} · ${r.presenceEvidence.from}` : '',
            '읽는 곳': r.usedAt ?? '', '읽는 법': r.read ?? '', '덧말': r.note ?? '',
        }))));
    }
    const overlayRow = (o, where) => ({
        '화면': where, '팝업': o.name, '종류': o.kind ?? '', '뜻': o.meaning ?? '', '알아보는 글자': matchText(o.match), '동작': o.action ?? '', '자리': o.slot ?? '', '낱말 출처': o.wordsFrom ?? '',
        '본 곳': SEEN_LABEL[o.seen] ?? o.seen ?? '', '근거': (o.evidence ?? []).join('\n'),
    });
    out.push(sectionHead(`콜 화면 위에 뜨는 팝업 ${spec.callOverlays?.length ?? 0}개`), tableOf((spec.callOverlays ?? []).map((o) => overlayRow(o, '콜 화면'))));
    out.push(sectionHead(`화면 알아보기 ${spec.screens.length}개`), draw(spec.screens.map((s) => ({
        '화면': s.name, '기준 페이지': book[pageOf[s.standard]]?.label ?? '', '알아보는 글자': matchText(s.match), '버튼': Object.entries(s.buttons ?? {}).map(([k, x]) => `${k}: ${x}`).join('\n'),
        '목록으로 돌아가나': s.listReturn === undefined ? '' : s.listReturn ? '예' : '아니요', '수락 뒤 도착': s.landsAfterAccept ? '예' : '',
        '위에 뜨는 팝업': (s.overlays ?? []).length, '본 곳': SEEN_LABEL[s.seen] ?? s.seen, '근거': (s.evidence ?? []).join('\n'),
    }))));
    const screenOverlays = spec.screens.flatMap((s) => (s.overlays ?? []).map((o) => overlayRow(o, s.name)));
    out.push(sectionHead(`화면 위에 뜨는 것 ${screenOverlays.length}개`), tableOf(screenOverlays));
    out.push(sectionHead('배차망 규칙'), draw(Object.entries(RULE_LABEL).map(([key, [label, why]]) => ({
        '항목': label, '값': Array.isArray(spec[key]) ? spec[key].map((v) => (Array.isArray(v) ? v.join(' + ') : v)).join(' · ') : spec[key] ?? '없음', '까닭': spec[why] ?? '',
    }))));
    out.push(sectionHead(`차종 낱말 ${spec.vehicleWords?.length ?? 0}개`), paragraph(spec.vehicleWordsWhy ?? ''), tableOf((spec.vehicleWords ?? []).map((w) => ({ '화면 낱말': w.word, '차종': w.vehicle ?? '없음', '본 곳': SEEN_LABEL[w.seen] ?? w.seen }))));
    out.push(sectionHead('메모'), ...(spec.about ?? []).map(paragraph));
    const toCollect = [
        ...Object.entries(spec.slotNotes ?? {}).map(([slot, note]) => ({ '자리': book[slot]?.label ?? slot, '내용': note.toCollect ?? note.why ?? '', '근거': note.evidence ?? '' })),
        ...spec.screens.filter((s) => s.toCollect).map((s) => ({ '자리': s.name, '내용': s.toCollect, '근거': '' })),
        ...spec.screens.flatMap((s) => (s.overlays ?? []).filter((o) => o.toCollect).map((o) => ({ '자리': `${s.name} · ${o.name}`, '내용': o.toCollect, '근거': '' }))),
        ...(spec.callOverlays ?? []).filter((o) => o.toCollect).map((o) => ({ '자리': o.name, '내용': o.toCollect, '근거': '' })),
    ];
    out.push(sectionHead(`아직 모을 것 ${toCollect.length}건`), tableOf(toCollect));
    const rest = Object.entries(spec).filter(([key]) => !DRAWN_KEYS.includes(key));
    if (rest.length > 0) out.push(sectionHead('그 밖의 항목'), draw(rest.map(([key, value]) => ({ '항목': key, '값': value }))));
    return out;
}

/* 📋 콜 칸 × 네 배차망 — 필수를 정하는 재료. 콜 칸 표의 칸 + 칸마다 그 값이 나오는 페이지 · 읽나 · 누가 읽나 · 글자/사진 · 본 곳 */
/* 지금 코드의 필수 — 원달앱 OrderRequirement.kt 의 규칙을 옮겨 적은 것 (코드가 원천이다) */
const REQUIRED_NOW = { fare: '목록 · 상세', pickup: '목록 · 상세(전체 주소)', dropoff: '목록 · 상세(전체 주소)', pickupDistance: '목록' };
/* 누가 읽나 · 글자/사진은 칸이 없어 usedAt 글에서 어림한다 — 틀릴 수 있다 */
function readerOf(row) {
    if (row.handling !== 'READ') return '';
    const used = row.usedAt ?? '';
    const app = !/원달앱은 (아직 )?이 칸을 안/.test(used) && /\b[A-Z][a-z0-9]+[A-Z]\w*|원달앱/.test(used);
    const server = /서버/.test(used);
    return [app && '앱', server && '서버'].filter(Boolean).join(' + ') || '모름';
}
const photoOf = (row) => (row.handling === 'READ' ? (/사진|Ocr/.test(`${row.usedAt ?? ''}${row.where}`) ? '사진' : '글자') : '');
/* 콜 칸에 잇는 화면 칸 줄 — 화면 칸 이름이 같으면 잇는다. contact 는 값이 여럿이라 조각으로 가른다 */
const CONTACT_PART = { dispatcherName: (p) => p === 'dispatcher', dispatcherPhone: (p) => p === 'dispatcherPhone', pickupDetails: (p) => p?.startsWith('pickup.'), dropoffDetails: (p) => p?.startsWith('dropoff.') };
const matchesRow = (row, field) => row.pageField === field.field && (field.field !== 'contact' || CONTACT_PART[row.key]?.(field.part));
const fieldLine = (r, pageLabel) => `${pageLabel}${r.part ? ` (${r.part})` : ''}: ${[HANDLING_LABEL[r.handling] ?? r.handling, readerOf(r), photoOf(r), SEEN_LABEL[r.seen] ?? r.seen].filter(Boolean).join(' · ')}`;
function drawCallSheet(networks, fields, netLabels, table, officeKeys) {
    const book = fields.find((v) => v.name === 'BASE_PAGE_BOOK').rows.pages;
    const nets = Object.keys(networks);
    const labelOf = Object.fromEntries(table.columns.map((c) => [c.key, c.label]));
    const linesOf = (net, row) => Object.entries(networks[net].pages).flatMap(([page, rows]) => rows.filter((r) => matchesRow(row, r)).map((r) => fieldLine(r, book[page]?.label ?? page)));
    const written = (cell) => (cell?.text ? `적힌 글${cell.state && cell.state !== '지금' ? `(${cell.state})` : ''}: ${cell.text}` : '');
    const sheet = draw(table.rows.map((row) => ({
        [labelOf.id]: row.id, [labelOf.key]: row.key, [labelOf.label]: row.label, [labelOf.desc]: row.desc, [labelOf.kind]: row.kind, [labelOf.required]: row.required,
        '지금 코드 필수': REQUIRED_NOW[row.key] ?? '', [labelOf.filledBy]: row.filledBy, [labelOf.ledger]: row.ledger, [labelOf.pageField]: row.pageField, [labelOf.ref]: row.ref,
        ...Object.fromEntries(nets.map((n) => [netLabels[n] ?? n, [...linesOf(n, row), written(row[n])].filter(Boolean).join('\n')])),
    })));
    sheet.className = 'callSheet';
    const missing = officeKeys.filter((k) => !table.rows.some((r) => r.key === k));
    const unlinked = nets.flatMap((n) => Object.entries(networks[n].pages).flatMap(([page, rows]) => rows.filter((f) => !table.rows.some((r) => matchesRow(r, f))).map((f) => ({
        '화면 칸': f.part ? `${f.field} · ${f.part}` : f.field, '배차망': netLabels[n] ?? n, '페이지': book[page]?.label ?? page, '화면 자리': f.where, '글자 견본': f.sample, '읽나': HANDLING_LABEL[f.handling] ?? f.handling,
    }))));
    const chips = document.createElement('div');
    chips.className = 'chips';
    for (const k of missing) { const c = document.createElement('span'); c.textContent = k; chips.append(c); }
    return [sheet, sectionHead(`표에 없는 OfficeOrder 칸 ${missing.length}개`), chips, sectionHead(`어느 콜 칸에도 안 잇는 화면 칸 ${unlinked.length}줄`), unlinked.length ? draw(unlinked) : paragraph('없음')];
}

/* 🧩 값 모양에 맞춰 그린다 — 글자 목록은 한 줄 · 묶음은 표 · 모양이 다른 묶음은 항목마다 나눠서 */
const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
function drawValue(value) {
    if (Array.isArray(value) && value.every((v) => !v || typeof v !== 'object')) {
        const chips = document.createElement('div');
        chips.className = 'chips';
        for (const v of value) { const c = document.createElement('span'); c.textContent = text(v); chips.append(c); }
        return [chips];
    }
    if (!isPlain(value)) return Array.isArray(value) ? [draw(rowsOf(value))] : [paragraph(text(value))];
    const children = Object.values(value);
    if (children.every((v) => !v || typeof v !== 'object')) return [draw(rowsOf(value))];
    const keys = new Set(children.filter(isPlain).flatMap((v) => Object.keys(v)));
    if (children.every(isPlain) && children.every((v) => Object.keys(v).length * 2 >= keys.size)) return [draw(rowsOf(value))];
    return Object.entries(value).flatMap(([key, v]) => {
        const h = document.createElement('h3');
        h.textContent = key;
        return [h, ...drawValue(v)];
    });
}

/* 📜 소스 코드 — 내보내지 않은 값도 볼 수 있게. 펼칠 때 읽는다 */
function sourceBlock() {
    const box = document.createElement('details');
    box.className = 'source';
    const head = document.createElement('summary');
    head.textContent = '소스 코드 보기';
    const code = document.createElement('pre');
    box.append(head, code);
    box.addEventListener('toggle', () => {
        if (box.open && !code.textContent) fetch(`/shared/_/source/${file}`).then((r) => r.text()).then((s) => { code.textContent = s; });
    }, { once: false });
    return box;
}

/* 📂 폴더 한눈에 보기 — 파일마다 제목 · 무엇을 · 누가 · 왜 */
async function drawFolder() {
    const files = await fetch(`/shared/_/folder/${file}`).then((r) => r.json());
    const word = (f, w) => f.six.find((s) => s.word === w)?.text ?? '';
    document.title = file;
    document.getElementById('title').textContent = `${file} 폴더 — 파일 ${files.length}개`;
    document.getElementById('six').remove();
    const el = draw(files.map((f) => ({ '파일': f.file.split('/').pop(), '제목': f.title, '무엇을': word(f, '무엇을'), '누가': word(f, '누가'), '왜': word(f, '왜') })));
    for (const row of el.tBodies[0].rows) {
        const name = row.cells[0].textContent;
        const a = document.createElement('a');
        a.href = `/shared/${file}/${name}`;
        a.textContent = name;
        row.cells[0].textContent = '';
        row.cells[0].append(a);
    }
    box.append(el);
}

document.title = file;
document.getElementById('title').textContent = file;
if (!file.includes('/')) drawFolder().catch((e) => { box.textContent = `못 읽음: ${e}`; });
else fetch(`/shared/_/module/${file}`).then((r) => r.json()).then(async ({ values, limit, title, six, functions, aliases, interfaces, notes }) => {
    if (title) { document.title = title; document.getElementById('title').textContent = `${title} — ${file}`; }
    box.after(sourceBlock());
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
        const note = notes?.[v.name] && notes[v.name] !== '주석 없음' ? ` — ${notes[v.name]}` : '';
        h.textContent = v.total > limit ? `${v.name} — ${v.total}개 중 ${limit}개${note}` : `${v.name}${note}`;
        if (v.name === 'NETWORK_PAGES') {
            const links = document.createElement('div');
            links.className = 'chips';
            for (const net of Object.keys(v.rows)) { const a = document.createElement('a'); a.href = `/shared/network/networkPages.${net}`; a.textContent = net; links.append(a); }
            box.append(h, paragraph('네 배차망 파일을 합친 값입니다. 내용은 배차망 페이지에서 봅니다.'), links);
            const [fields, apps, cf, shapes] = await Promise.all(['network/pageFields', 'network/targetApps', 'call/call-fields.table', 'call/orderShapes'].map((f) => fetch(`/shared/_/module/${f}`).then((r) => r.json())));
            box.append(sectionHead('콜 칸 × 네 배차망'),
                paragraph('필수를 정할 때 보는 표입니다. 줄은 콜 칸이고 앞쪽 칸은 콜 칸 표(call-fields) 그대로입니다. 배차망 칸은 정의 표에서 뽑은 줄과 콜 칸 표에 사람이 적은 글입니다.'),
                paragraph('배차망 칸 한 줄은 «페이지: 읽나 · 누가 읽나 · 글자/사진 · 본 곳»입니다. «누가 읽나»와 «글자/사진»은 정의 표의 «읽는 곳» 글에서 어림한 것이라 틀릴 수 있습니다.'),
                paragraph('화면 칸 이름으로 이었기 때문에, 이름을 함께 쓰는 콜 칸(예약 · 시각 · 꼬리표 · 물품)에는 같은 줄이 겹쳐 나옵니다. 그 줄이 실제로 어느 콜 칸으로 가는지는 코드를 봐야 합니다.'),
                paragraph('«지금 코드 필수»는 원달앱 코드의 규칙이고, 픽커 도보 콜만 목록에서 하차가 없어도 됩니다.'),
                ...drawCallSheet(v.rows, fields.values, apps.values.find((x) => x.name === 'TARGET_APP_LABEL').rows, cf.values.find((x) => x.name === 'TABLE').rows, shapes.interfaces.find((x) => x.name === 'OfficeOrder').rows.map((r) => r['칸'])));
            continue;
        }
        if (isBook(v.rows)) {
            h.textContent = v.rows.title ?? v.name;
            const about = document.createElement('p');
            about.textContent = v.rows.about ?? '';
            box.append(h, about, draw(v.rows.rows, v.rows));
        } else box.append(h, ...drawValue(v.rows));
    }
}).catch((e) => { box.textContent = `못 읽음: ${e}`; });
