/* 📋 왼쪽 메뉴 — 서버가 준 목록을 폴더별로 접어 그린다. 제목은 파일 머리글 첫 줄이다. 페이지는 이 함수만 부른다 */
const FOLDER_LABEL = { call: '콜', cargo: '차종 · 적재', common: '공통 도우미', device: '기기', filter: '콜 필터 · 지역', judge: '판정 · 요금', map: '지도 · 경로', network: '배차망', ops: '운영센터', time: '시간' };
const SAVED = 'shared-menu';
/* 브라우저 저장은 편의일 뿐이다 — 막혀 있으면 기억만 못 하고 메뉴는 그대로 그린다 */
function savedMenu() {
    try { return JSON.parse(localStorage.getItem(SAVED)) ?? {}; } catch { return {}; }
}
function saveMenu(nav) {
    const open = [...nav.querySelectorAll('details[open]')].map((d) => d.dataset.dir);
    try { localStorage.setItem(SAVED, JSON.stringify({ open, top: nav.scrollTop })); } catch { /* 기억만 못 한다 */ }
}
export async function drawMenu() {
    const nav = document.createElement('nav');
    nav.id = 'menu';
    document.body.prepend(nav);
    const here = decodeURIComponent(location.pathname).replace(/\/$/, '');
    const saved = savedMenu();
    const files = await (await fetch('/shared/_/menu')).json();
    const boxes = new Map();
    for (const { file, title } of files) {
        const at = file.lastIndexOf('/');
        const dir = at < 0 ? '' : file.slice(0, at);
        if (!boxes.has(dir)) {
            const box = dir ? document.createElement('details') : nav;
            if (dir) {
                box.dataset.dir = dir;
                const head = document.createElement('summary');
                head.textContent = FOLDER_LABEL[dir] ?? dir;
                box.append(head);
                const all = document.createElement('a');
                all.href = `/shared/${dir}`;
                all.textContent = '폴더 한눈에 보기';
                if (all.getAttribute('href') === here) { all.className = 'now'; box.open = true; }
                box.append(all);
                box.open = saved.open?.includes(dir) ?? false;
                nav.append(box);
            }
            boxes.set(dir, box);
        }
        const name = file.slice(at + 1);
        const a = document.createElement('a');
        a.href = `/shared/${file}`;
        a.textContent = title || name;
        if (title) {
            const small = document.createElement('small');
            small.textContent = name;
            a.append(small);
        }
        if (a.getAttribute('href') === here) {
            a.className = 'now';
            if (dir) boxes.get(dir).open = true;
        }
        boxes.get(dir).append(a);
    }
    nav.scrollTop = saved.top ?? 0;
    nav.addEventListener('toggle', () => saveMenu(nav), true);
    nav.addEventListener('scroll', () => saveMenu(nav));
}
