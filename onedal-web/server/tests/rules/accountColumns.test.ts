// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import db, { migrateAccountColumns } from '../../src/db';

/**
 * 🪪 **회원 사실 칸 · 운영센터 표** (reviews/29 4장 · 2·3단계 · onedal-1f «가»).
 * 🔴 이미 있는 회원은 approved_at 을 가입 시각으로 채운다 — 안 채우면 실서버 기사님 계정이 다음 배포에 «승인 대기»로 막혀 운행이 선다.
 *    옮기기는 **칸이 이번 기동에 새로 생겼을 때만** 돈다 — 매 기동마다 돌면 승인 대기 회원이 재시작에 저절로 승인된다.
 */
const OLD_USERS = `CREATE TABLE users (id TEXT PRIMARY KEY, google_id TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, avatar TEXT, role TEXT DEFAULT 'USER', created_at TEXT DEFAULT (datetime('now', 'localtime')))`;

describe('🪪 기존 회원 승인 시각 채우기', () => {
    it('🔴 칸이 새로 생긴 기동에서 기존 회원은 approved_at = created_at · ops_allowed_at 은 비운다', () => {
        const m = new Database(':memory:');
        m.exec(OLD_USERS);
        m.prepare(`INSERT INTO users (id, google_id, email, name, created_at) VALUES ('a', 'ga', 'a@x', '회원1', '2000-01-02T03:04:05'), ('b', 'gb', 'b@x', '회원2', '2000-02-03T04:05:06')`).run();
        migrateAccountColumns(m);
        const rows = m.prepare(`SELECT id, approved_at, ops_allowed_at FROM users ORDER BY id`).all();
        expect(rows).toEqual([
            { id: 'a', approved_at: '2000-01-02T03:04:05', ops_allowed_at: null },
            { id: 'b', approved_at: '2000-02-03T04:05:06', ops_allowed_at: null },
        ]);
    });

    it('🔴 두 번째 기동은 옮기기를 다시 돌리지 않는다 — 승인 대기 회원은 그대로 대기', () => {
        const m = new Database(':memory:');
        m.exec(OLD_USERS);
        m.prepare(`INSERT INTO users (id, google_id, email, name) VALUES ('a', 'ga', 'a@x', '회원1')`).run();
        migrateAccountColumns(m);
        m.prepare(`INSERT INTO users (id, google_id, email, name) VALUES ('n', 'gn', 'n@x', '신청자')`).run();
        migrateAccountColumns(m);
        expect(m.prepare(`SELECT approved_at FROM users WHERE id = 'n'`).get().approved_at).toBeNull();
        expect(m.prepare(`SELECT approved_at FROM users WHERE id = 'a'`).get().approved_at).not.toBeNull();
    });
});

describe('🪪 새 칸 · 새 표', () => {
    const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as any[]).map(c => c.name);

    it('🔴 users 에 사실 칸 일곱', () => {
        expect(cols('users')).toEqual(expect.arrayContaining([
            'approved_at', 'withdrawn_at', 'phone', 'dispatch_networks', 'ops_allowed_at', 'suspended_at', 'suspend_after_active',
        ]));
    });

    it('🔴 글은 판마다 한 줄 — 같은 kind 두 판을 담는다', () => {
        db.prepare(`INSERT INTO contents (kind, version, title, body, updated_at) VALUES ('terms', 901, '약관', '첫 판', '2026-10-01'), ('terms', 902, '약관', '둘째 판', '2026-10-01')`).run();
        expect(db.prepare(`SELECT COUNT(*) n FROM contents WHERE kind = 'terms' AND version IN (901, 902)`).get().n).toBe(2);
        db.prepare(`DELETE FROM contents WHERE version IN (901, 902)`).run();
    });

    it('🔴 동의 · 운영센터 기록 · 공지 표 — 공지는 지우지 않고 내린 시각을 적는다', () => {
        expect(cols('agreements')).toEqual(expect.arrayContaining(['user_id', 'kind', 'version', 'item', 'agreed_at']));
        expect(cols('ops_audit')).toEqual(expect.arrayContaining(['at', 'admin_id', 'action', 'target_user_id', 'detail']));
        expect(cols('notices')).toEqual(expect.arrayContaining(['text', 'posted_at', 'active_until', 'posted_by', 'ended_at', 'ended_by']));
    });
});

describe('🪪 누가 approved_at 을 쓰나', () => {
    const src = readFileSync(join(__dirname, '../../src/routes/auth.ts'), 'utf8');

    it('🔴 구글 가입은 승인 시각을 비운다 · 개발 문(probe · 우회) 두 곳만 지금 시각으로 쓴다', () => {
        const inserts = src.match(/INSERT INTO users \([^)]*\)/g) ?? [];
        expect(inserts.length).toBe(3);
        expect(inserts.filter(s => s.includes('approved_at')).length).toBe(2);
        const google = src.slice(src.indexOf('router.post("/google"'), src.indexOf('router.post("/refresh"'));
        expect(google).not.toMatch(/approved_at/);
    });
});
