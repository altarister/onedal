/* 📊 쓰임 목록 — shared 가 내보낸 것을 쓰임별로 모은다. 지울지는 기사님이 정한다. 파일을 고치는 길은 없다 */
import { drawMenu } from '/shared/_/menu.js';

drawMenu();
const box = document.getElementById('box');
const LABEL = { main: '본 코드가 씀', shared: '다른 shared 파일만 씀', tests: '검사에서만 씀', self: '자기 파일 안에서만 씀', none: '쓰는 곳 없음' };
const NOTE = {
    none: '지워도 된다는 뜻이 아닙니다. 까닭 칸을 먼저 봅니다.',
    tests: '본 코드가 안 쓰는 것으로 찾혔습니다. 검사가 지키는 규칙일 수 있습니다.',
    self: '파일 밖에서는 안 씁니다. 내보내지 않아도 되는 것일 수 있습니다.',
};

function table(rows) {
    const columns = Object.keys(rows[0] ?? {});
    const el = document.createElement('table');
    let sort = null;
    const paint = () => {
        el.textContent = '';
        const head = el.createTHead().insertRow();
        for (const c of columns) {
            const th = document.createElement('th');
            const b = document.createElement('button');
            b.textContent = `${c} ${sort?.key === c ? (sort.desc ? '▼' : '▲') : '↕'}`;
            b.addEventListener('click', () => { sort = sort?.key !== c ? { key: c, desc: false } : sort.desc ? null : { key: c, desc: true }; paint(); });
            th.append(b);
            head.append(th);
        }
        const order = rows.map((_, i) => i);
        if (sort) order.sort((a, b) => (sort.desc ? -1 : 1) * String(rows[a][sort.key]).localeCompare(String(rows[b][sort.key]), 'ko') || a - b);
        const body = el.createTBody();
        for (const i of order) {
            const tr = body.insertRow();
            for (const c of columns) {
                const td = tr.insertCell();
                td.className = 'plain';
                if (c === '파일') {
                    const a = document.createElement('a');
                    a.href = `/shared/${rows[i][c]}`;
                    a.textContent = rows[i][c];
                    td.append(a);
                } else td.textContent = rows[i][c];
            }
        }
    };
    paint();
    return el;
}

box.textContent = '계산 중… 첫 계산은 약 8초 걸립니다.';
fetch('/shared/_/usage').then((r) => r.json()).then((rows) => {
    box.textContent = '';
    const intro = document.createElement('p');
    intro.textContent = `내보낸 것 ${rows.length}개입니다. TypeScript 로 찾은 쓰임이고, as any · 글자로 읽는 곳 · 원달앱 JSON 은 다 못 찾습니다.`;
    const groups = Object.keys(LABEL).map((key) => ({ key, items: rows.filter((r) => r.group === key) }));
    box.append(intro, table(groups.map((g) => ({ '쓰임': LABEL[g.key], '개수': g.items.length }))));
    for (const key of Object.keys(NOTE)) {
        const { items } = groups.find((g) => g.key === key);
        const h = document.createElement('h2');
        h.className = 'value';
        h.textContent = `${LABEL[key]} ${items.length}개`;
        const p = document.createElement('p');
        p.textContent = NOTE[key];
        const shown = items.map((r) => ({ '파일': r.file, '이름': r.name, '종류': r.kind, ...(key === 'none' ? { '까닭': r.why } : {}), ...(key === 'tests' ? { '검사 파일 수': r.tests, '코드 참조 말고 쓰는 곳': r.note } : {}) }));
        box.append(h, p, table(shown));
    }
}).catch((e) => { box.textContent = `못 읽음: ${e}`; });
