// @ts-nocheck
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import { opsGate, onOpsConnection, sweepOpsSockets } from '../../src/socket/opsSocket';
import { peekUserSession } from '../../src/state/userSessionStore';

/**
 * 🏢 **운영센터 소켓은 이름공간 /ops 로 따로 — 서버 쪽** (reviews/29 5단계 · onedal-1f «가» · e7 안 · 화면 쪽 검사는 opsSocket.test.ts).
 * 관제웹 연결 처리(세션 충돌 · activeWebSession · 기사 세션 부트스트랩)는 /ops 소켓에 닿을 길이 없다 —
 * 기사님이 운행 중 관제웹을 띄운 채 운영센터를 열어도 «다른 기기에서 접속» 창이 안 뜨고, 와이프 계정에 기사 세션이 안 생긴다.
 * 관리자 방(admin_room)은 /ops 소켓만 · 신호(ops-calls-changed)만 · 30초마다 허락이 사라진 소켓을 끊는다.
 */
const ADMIN = 'test-opsns-admin', PLAIN = 'test-opsns-plain';
const SRC = join(__dirname, '../../src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const fakeSocket = (id: string) => {
    const s: any = { data: { user: { id, name: id } }, rooms: [] as string[], disconnected: false };
    s.join = (r: string) => { s.rooms.push(r); };
    s.disconnect = () => { s.disconnected = true; };
    s.on = () => { throw new Error('/ops 소켓은 이벤트를 받지 않는다'); };
    return s;
};

beforeAll(() => {
    for (const id of [ADMIN, PLAIN]) db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name, approved_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(id, `g-${id}`, `${id}@test`, id);
    db.prepare(`UPDATE users SET ops_allowed_at = datetime('now') WHERE id = ?`).run(ADMIN);
});
afterAll(() => { for (const id of [ADMIN, PLAIN]) db.prepare(`DELETE FROM users WHERE id = ?`).run(id); });

describe('🏢 /ops 소켓', () => {
    it('🔴 허락 없는 계정은 연결을 거절 · 있는 계정은 통과', () => {
        const errs: any[] = [];
        opsGate(fakeSocket(PLAIN), (e?: any) => errs.push(e));
        opsGate(fakeSocket(ADMIN), (e?: any) => errs.push(e));
        expect(errs[0]).toBeInstanceOf(Error);
        expect(errs[1]).toBeUndefined();
    });
    it('🔴 연결되면 관리자 방에만 든다 — 이벤트를 받지 않고 기사 세션을 만들지 않는다', () => {
        const s = fakeSocket(ADMIN);
        onOpsConnection(s);
        expect(s.rooms).toEqual(['admin_room']);
        expect(peekUserSession(ADMIN)).toBeUndefined();
        expect(read('socket/opsSocket.ts')).not.toMatch(/getUserSession|activateUserSocket|activeWebSession|session-conflict/);
    });
    it('🔴 30초 훑기는 허락이 사라진 소켓만 끊는다', () => {
        const a = fakeSocket(ADMIN), p = fakeSocket(PLAIN);
        sweepOpsSockets({ sockets: new Map([['a', a], ['p', p]]) } as any);
        expect(a.disconnected).toBe(false);
        expect(p.disconnected).toBe(true);
    });
});

describe('🏢 관리자 방은 /ops 소켓만', () => {
    it('🔴 JWT 검사는 한 함수(authSocket)를 관제웹 · /ops 가 같이 쓴다', () => {
        expect(read('socket/socketHandlers.ts')).toMatch(/io\.use\(authSocket\)/);
        expect(read('socket/opsSocket.ts')).toMatch(/\.use\(authSocket\)/);
    });
    it('🔴 관제웹 소켓은 관리자 방에 안 든다 · 관리자 방으로 나가는 것은 /ops 이름공간의 ops-calls-changed 뿐', () => {
        expect(read('socket/socketHandlers.ts')).not.toMatch(/join\(["']admin_room["']\)/);
        const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
        const all = walk(SRC).filter(f => f.endsWith('.ts')).map(f => readFileSync(f, 'utf8')).join('\n');
        const toAdmin = [...all.matchAll(/(\S*)\.to\(["']admin_room["']\)\.emit\(["']([\w-]+)["']/g)].map(m => `${m[1]} ${m[2]}`);
        expect(toAdmin.length).toBeGreaterThan(0);
        expect([...new Set(toAdmin)]).toEqual(['io.of("/ops") ops-calls-changed']);
    });
});
