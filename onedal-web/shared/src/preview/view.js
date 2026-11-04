/* 📋 shared 파일 보기 — 내보낸 함수 표 하나와 내보낸 값마다 표 하나. 쓰는 길이 없다. 줄 머리를 누르면 정렬한다 */
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

document.title = file;
document.getElementById('title').textContent = file;
fetch(`/shared/_/module/${file}`).then((r) => r.json()).then(({ values, limit, six, functions }) => {
    const sixBox = document.getElementById('six');
    if (six.length === 0) sixBox.textContent = '6하원칙 없음';
    for (const s of six) {
        const line = document.createElement('div');
        const word = document.createElement('b');
        word.textContent = `${s.word}: `;
        line.append(word, s.text);
        sixBox.append(line);
    }
    if (functions.length > 0) {
        const h = document.createElement('h2');
        h.className = 'value';
        h.textContent = `함수 ${functions.length}개`;
        box.append(h, draw(functions));
    }
    if (functions.length === 0 && values.length === 0) box.textContent = '표로 볼 값이 없습니다 (타입만 있는 파일).';
    for (const v of values) {
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
