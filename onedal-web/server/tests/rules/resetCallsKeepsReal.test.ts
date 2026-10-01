// @ts-nocheck
import { execFileSync } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import Database from 'better-sqlite3';
import { createServer } from 'net';

/**
 * 🧹 **콜 비우기는 시뮬레이터 자료만 — 픽커 실물 읽기는 남긴다** (기사님 «가» · onedal-69).
 *    reset:calls 가 원장(intel)을 통째로 지워, 시뮬을 다시 시작할 때마다 실물 픽커 읽기(통계 · 처음 보는 글자의 원천)가 사라졌다.
 *    지우는 것은 시뮬(source='sim') · 옛 앱(NULL) 줄 — 실물(source='real')은 남는다. 다른 콜 생애 표는 그대로 비운다.
 *    기사님 local.db 가 아니라 이 검사가 만든 사본 · 서버가 없는 포트로 돈다(다시 띄우기는 OFFLINE 으로 끝 · 파일을 안 건드림).
 */
const SERVER = join(__dirname, '../..');
const NAME = `reset-real-${process.pid}.db`;
const PATH = join(SERVER, NAME);
const SCRIPT = join(SERVER, '../scripts/reset-calls.mjs');
/* 서버가 없는 포트 — 운영체제에서 빈 포트를 받아 바로 닫는다(번호를 박지 않는다 · 「포트」 표 밖) */
const freePort = () => new Promise<number>(ok => { const srv = createServer().listen(0, '127.0.0.1', () => { const p = (srv.address() as any).port; srv.close(() => ok(p)); }); });
const clean = () => { for (const s of ['', '-wal', '-shm']) if (existsSync(PATH + s)) unlinkSync(PATH + s); };

beforeAll(() => {
    clean();
    const db = new Database(PATH);
    db.exec(`CREATE TABLE intel (id INTEGER PRIMARY KEY AUTOINCREMENT, pickup TEXT, source TEXT);
             CREATE TABLE orders (id TEXT PRIMARY KEY);`);
    const ins = db.prepare(`INSERT INTO intel (pickup, source) VALUES (?, ?)`);
    ins.run('실물', 'real'); ins.run('실물2', 'real'); ins.run('시뮬', 'sim'); ins.run('옛앱', null);
    db.prepare(`INSERT INTO orders (id) VALUES ('o1')`).run();
    db.close();
});
afterAll(clean);

describe('🧹 reset:calls — 실물 읽기는 남긴다', () => {
    it('🔴 시뮬 · 옛 앱 원장과 콜은 지우고 실물 픽커 읽기는 남긴다', async () => {
        const out = execFileSync(process.execPath, [SCRIPT], { env: { ...process.env, DB_FILE: NAME, PORT: String(await freePort()) }, encoding: 'utf8' });
        const db = new Database(PATH, { readonly: true });
        expect(db.prepare(`SELECT pickup FROM intel ORDER BY id`).all().map((r: any) => r.pickup)).toEqual(['실물', '실물2']);
        expect(db.prepare(`SELECT COUNT(*) n FROM orders`).get().n).toBe(0);
        db.close();
        expect(out).toContain('실물 2 건 남김');
    });
    it('🔴 원장(intel)을 조건 없이 지우지 않는다', () => {
        const src = readFileSync(SCRIPT, 'utf8');
        expect(src).not.toMatch(/DELETE FROM \$\{t\}`\)\.run\(\)/);
        expect(src).toMatch(/source IS NOT 'real'/);
    });
});
