/**
 * 🧪 검사 DB 파일 치우기 — 시작 때 · 끝날 때. server/ 의 jest-r<돌림>-w<일꾼>.db 와 -wal · -shm.
 * 🔴 **내 돌림이 만든 것만 지운다** — 같은 트리에서 다른 세션의 jest 가 겹쳐 돌아도 그쪽 DB 를 지우지 않는다.
 *    돌림 표는 jest 를 띄운 프로세스 번호(JEST_DB_RUN) — 여기서 정하면 뒤에 뜨는 일꾼들이 이어받는다(tests/jestWorkerDb.js).
 *    죽은 돌림이 남긴 파일(옛 이름 jest-w<번호>.db 포함)은 하루 지난 것만 지운다.
 * 기사님 로컬 DB(local.db · data.db)는 이름이 달라 건드리지 않는다.
 */
const { readdirSync, rmSync, statSync } = require('fs');
const { join } = require('path');

const STALE_MS = 24 * 60 * 60 * 1000;

module.exports = async function clearJestDbFiles() {
    process.env.JEST_DB_RUN ||= String(process.pid);
    const dir = join(__dirname, '..');
    const mine = new RegExp(`^jest-r${process.env.JEST_DB_RUN}-w\\d+\\.db(-wal|-shm)?$`);
    const any = /^jest-(r\d+-)?w\d+\.db(-wal|-shm)?$/;
    const now = Date.now();
    for (const f of readdirSync(dir)) {
        if (!any.test(f)) continue;
        const p = join(dir, f);
        if (mine.test(f)) { rmSync(p, { force: true }); continue; }
        try { if (now - statSync(p).mtimeMs > STALE_MS) rmSync(p, { force: true }); } catch { /* 다른 돌림이 막 지웠다 */ }
    }
};
