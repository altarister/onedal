// @ts-nocheck
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { allowanceLive, modeForPhone, runningModeOf, isModeApplying } from '@onedal/shared';
import { touchDeviceSession, getActiveDevicesSnapshot } from '../../src/routes/devices';
import db, { migrateAccountColumns, migrateAllowanceColumns } from '../../src/db';
import { allowanceOf } from '../../src/core/allowance';
import { accountFactsOf } from '../../src/core/accountGate';

/**
 * 🎛️ **허락 칸 — 자동 잡기 · 통계 · 유료 기한** (reviews/29 6단계 · onedal-1f «가»).
 * 부품은 «지금 이 허락이 살아 있나» 하나만 본다. 자동 허락이 안 살았으면 서버가 폰에 ALARM 을 내려보낸다(앱 코드 무변화).
 * 🔴🔴 옮기기 — 칸이 새로 생긴 기동에서만 «승인된 회원» 두 허락을 켜고 기한은 비운다. 안 채우면 다음 배포에 기사님 폰이 ALARM 으로 떨어진다.
 */
const OLD_USERS = `CREATE TABLE users (id TEXT PRIMARY KEY, google_id TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL, avatar TEXT, role TEXT DEFAULT 'USER', created_at TEXT DEFAULT (datetime('now', 'localtime')))`;
const SRC = (f: string) => fs.readFileSync(path.join(__dirname, '../../src', f), 'utf8');

describe('허락이 살아 있나 · 폰에 내려보낼 모드', () => {
    it('🔴 끔 → ALARM · 켬 → AUTO · 기한 지남 → ALARM · 기한 오늘 → AUTO · 비면 기한 없음 · 명령 ALARM/MANUAL 은 그대로', () => {
        const today = '2026-10-01';
        expect(allowanceLive(null, null, today)).toBe(false);
        expect(allowanceLive('2026-09-01 10:00:00', null, today)).toBe(true);
        expect(allowanceLive('2026-09-01 10:00:00', '2026-09-30', today)).toBe(false);
        expect(allowanceLive('2026-09-01 10:00:00', '2026-10-01', today)).toBe(true);
        expect(modeForPhone('AUTO', false)).toBe('ALARM');
        expect(modeForPhone('AUTO', true)).toBe('AUTO');
        expect(modeForPhone('ALARM', true)).toBe('ALARM');
        expect(modeForPhone('MANUAL', false)).toBe('MANUAL');
    });

    it('🔴 scrap 응답 모드는 modeForPhone 을 거친다', () => {
        expect(SRC('routes/scrap.ts')).toContain('const autoLive = allowanceOf(userId).autoLive;');
        expect(SRC('routes/scrap.ts')).toContain('mode: modeForPhone(deviceMode, autoLive, webAttached, otherAuto)');
    });
});

describe('🔴🔴 기존 회원 허락 옮기기', () => {
    const boot = () => { const m = new Database(':memory:'); m.exec(OLD_USERS); return m; };

    it('칸이 새로 생긴 기동에서 승인된 회원만 두 허락을 켠다 · 기한 셋은 비운다', () => {
        const m = boot();
        m.prepare(`INSERT INTO users (id, google_id, email, name) VALUES ('d1', 'g1', 'd1@x', '기사님'), ('d2', 'g2', 'd2@x', '딸')`).run();
        migrateAccountColumns(m);   // 기존 회원 둘 → 승인
        m.prepare(`INSERT INTO users (id, google_id, email, name) VALUES ('p', 'gp', 'p@x', '신청자')`).run();   // 승인 대기
        migrateAllowanceColumns(m);
        const rows = m.prepare(`SELECT id, auto_allowed_at IS NOT NULL a, stats_allowed_at IS NOT NULL s, auto_until, stats_until, paid_until FROM users ORDER BY id`).all();
        expect(rows).toEqual([
            { id: 'd1', a: 1, s: 1, auto_until: null, stats_until: null, paid_until: null },
            { id: 'd2', a: 1, s: 1, auto_until: null, stats_until: null, paid_until: null },
            { id: 'p', a: 0, s: 0, auto_until: null, stats_until: null, paid_until: null },
        ]);
    });

    it('두 번째 기동은 운영센터가 끈 허락을 되살리지 않는다', () => {
        const m = boot();
        m.prepare(`INSERT INTO users (id, google_id, email, name) VALUES ('d1', 'g1', 'd1@x', '기사님')`).run();
        migrateAccountColumns(m); migrateAllowanceColumns(m);
        m.prepare(`UPDATE users SET auto_allowed_at = NULL WHERE id = 'd1'`).run();
        migrateAllowanceColumns(m);
        expect(m.prepare(`SELECT auto_allowed_at FROM users WHERE id = 'd1'`).get().auto_allowed_at).toBeNull();
    });

    it('한 묶음 — 채우기가 실패하면 칸도 안 생기고 다음 기동에 다시 채운다', () => {
        const m = boot();
        m.prepare(`INSERT INTO users (id, google_id, email, name) VALUES ('d1', 'g1', 'd1@x', '기사님')`).run();
        migrateAccountColumns(m);
        m.exec(`CREATE TRIGGER fail_fill BEFORE UPDATE ON users BEGIN SELECT RAISE(ABORT, '채우기 실패'); END`);
        expect(() => migrateAllowanceColumns(m)).toThrow();
        expect(m.prepare(`PRAGMA table_info(users)`).all().some((c: any) => c.name === 'auto_allowed_at')).toBe(false);
        m.exec(`DROP TRIGGER fail_fill`);
        migrateAllowanceColumns(m);
        expect(m.prepare(`SELECT auto_allowed_at FROM users WHERE id = 'd1'`).get().auto_allowed_at).not.toBeNull();
    });
});

describe('실제 DB — 허락 · 유료 기한 · 통계 · 승인', () => {
    const U = 'test-allow-driver';
    beforeEach(() => {
        db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, `${U}@test`, U);
        db.prepare(`UPDATE users SET approved_at = datetime('now', 'localtime'), auto_allowed_at = datetime('now', 'localtime'), auto_until = NULL, stats_allowed_at = datetime('now', 'localtime'), stats_until = NULL, paid_until = NULL WHERE id = ?`).run(U);
    });
    afterAll(() => db.prepare(`DELETE FROM users WHERE id = ?`).run(U));

    it('🔴 허락 끔 · 기한 지남 → 자동 안 삶 · 켬 → 삶', () => {
        expect(allowanceOf(U).autoLive).toBe(true);
        db.prepare(`UPDATE users SET auto_allowed_at = NULL WHERE id = ?`).run(U);
        expect(allowanceOf(U).autoLive).toBe(false);
        db.prepare(`UPDATE users SET auto_allowed_at = datetime('now', 'localtime'), auto_until = '2000-01-01' WHERE id = ?`).run(U);
        expect(allowanceOf(U).autoLive).toBe(false);
    });

    it('🔴 유료 기한을 칸에서 읽는다(지나면 accountBlocked 가 정지 · 진행 중 콜은 끝난 뒤)', () => {
        db.prepare(`UPDATE users SET paid_until = '2000-01-01' WHERE id = ?`).run(U);
        expect(accountFactsOf(U)!.paidUntil).toBe('2000-01-01');
    });

    it('🔴 통계 허락이 없으면 기사 통계 문이 403 · 운영센터 승인은 비어 있는 두 허락을 켠다 · 회원 줄은 다섯 칸을 채운다', () => {
        expect(SRC('routes/stats.ts')).toContain("STATS_NOT_ALLOWED");
        const ops = SRC('routes/ops.ts');
        expect(ops).toContain('auto_allowed_at = COALESCE(auto_allowed_at, datetime(\'now\', \'localtime\'))');
        expect(ops).not.toContain('paidUntil: null, autoAllowedAt: null');
        expect(SRC('index.ts')).toContain('opsAllowRouter');
    });

    it('🔴 폰 보고마다 허락 사실을 기기 세션에 적는다 — 꺼지면 도는 모드 알람 · «적용중» 아님 · 운영센터 폰 표도 실제 모드', () => {
        const DEV = 'dev-test-allow-1';
        const io = { to: () => ({ emit: () => {} }) };
        db.prepare(`UPDATE users SET auto_allowed_at = NULL WHERE id = ?`).run(U);
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, undefined, 'insung', { appliedMode: 'ALARM' });
        let s = getActiveDevicesSnapshot().find((d: any) => d.deviceId === DEV);
        s.mode = 'AUTO';
        expect(s.autoAllowed).toBe(false);
        expect(runningModeOf(s)).toBe('ALARM');
        expect(isModeApplying(s)).toBe(false);
        db.prepare(`UPDATE users SET auto_allowed_at = datetime('now', 'localtime') WHERE id = ?`).run(U);
        touchDeviceSession(DEV, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, undefined, 'insung', { appliedMode: 'AUTO' });
        s = getActiveDevicesSnapshot().find((d: any) => d.deviceId === DEV);
        expect(s.autoAllowed).toBe(true);
        expect(runningModeOf(s)).toBe('AUTO');
        expect(SRC('routes/ops.ts')).toMatch(/function phonesOf[\s\S]*?runningModeOf\(s\)/);
    });

    it('🔴 승인 대기 → 운영센터 승인 → 자동 허락이 산다(다음 보고가 AUTO 명령을 AUTO 로)', async () => {
        db.prepare(`UPDATE users SET approved_at = NULL, auto_allowed_at = NULL, stats_allowed_at = NULL WHERE id = ?`).run(U);
        expect(modeForPhone('AUTO', allowanceOf(U).autoLive)).toBe('ALARM');
        const opsRouter = (await import('../../src/routes/ops')).default;
        const layer = opsRouter.stack.find((l: any) => l.route?.path === '/members/:id/approve' && l.route.methods.post);
        const h = layer.route.stack[layer.route.stack.length - 1].handle;
        let status = 200;
        const res = { status: (s: number) => { status = s; return res; }, json: () => res };
        await h({ params: { id: U }, user: { id: 'admin-test' }, app: { get: () => undefined }, body: {} }, res);
        expect(status).toBe(200);
        expect(modeForPhone('AUTO', allowanceOf(U).autoLive)).toBe('AUTO');
        expect(allowanceOf(U).statsLive).toBe(true);
    });
});
