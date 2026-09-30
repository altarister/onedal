/**
 * 🧪 검사 DB 파일 치우기 — 시작 때(지난 돌림이 남긴 것) · 끝날 때. server/ 의 jest-w<번호>.db 와 -wal · -shm.
 * 기사님 로컬 DB(local.db · data.db)는 이름이 달라 건드리지 않는다.
 */
const { readdirSync, rmSync } = require('fs');
const { join } = require('path');

module.exports = async function clearJestDbFiles() {
    const dir = join(__dirname, '..');
    for (const f of readdirSync(dir)) {
        if (/^jest-w\d+\.db(-wal|-shm)?$/.test(f)) rmSync(join(dir, f), { force: true });
    }
};
