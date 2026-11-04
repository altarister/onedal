/* 📋 왼쪽 메뉴 — 서버가 shared 파일을 하위 폴더까지 돌아 준 목록을 폴더별로 그린다. 페이지는 이 함수만 부른다 */
export async function drawMenu() {
    const nav = document.createElement('nav');
    nav.id = 'menu';
    document.body.prepend(nav);
    const here = decodeURIComponent(location.pathname).replace(/\/$/, '');
    const files = await (await fetch('/shared/_/menu')).json();
    let folder = null;
    for (const file of files) {
        const at = file.lastIndexOf('/');
        const dir = at < 0 ? '' : file.slice(0, at);
        if (dir !== folder) {
            folder = dir;
            if (dir) {
                const h = document.createElement('h2');
                h.textContent = dir;
                nav.append(h);
            }
        }
        const a = document.createElement('a');
        a.href = `/shared/${file}`;
        a.textContent = file.slice(at + 1);
        if (a.getAttribute('href') === here) a.className = 'now';
        nav.append(a);
    }
}
