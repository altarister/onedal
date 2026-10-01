// @ts-nocheck
import { readFileSync } from 'fs';
import { join } from 'path';
import db from '../../src/db';
import opsRouter from '../../src/routes/ops';
import noticesRouter from '../../src/routes/notices';
import { requireOps } from '../../src/middlewares/authMiddleware';
import { opsAllowed } from '../../src/core/opsAccess';
import { authDevice } from '../../src/core/deviceAuth';
import { clearUserSession, getUserSession } from '../../src/state/userSessionStore';
import { DEVICE_LINK_ERRORS } from '@onedal/shared';

/**
 * 🏢 **운영센터 서버 문** (reviews/29 3단계 · shared ops.ts 규격 · onedal-1f «가»).
 * - 들어오는 판단은 requireOps 하나 — 요청마다 DB 의 users.ops_allowed_at 을 읽는다(로그인 토큰의 role 이 아니다 · 허락을 끄면 다음 요청부터 막힘). 소켓 관리자 방도 같은 칸
 * - 관리자의 쓰기마다 ops_audit 한 줄 · 회원 상세를 열면 서버가 «회원 봄» 한 줄(같은 관리자 · 같은 회원 3초 안 중복 없음)
 * - 즉시 정지 · 탈퇴는 그 회원의 관제웹 소켓을 끊는다 · «끝난 뒤» 정지는 안 끊는다 · 자기 자신 정지는 400
 */
const ADMIN = 'test-ops-admin', M = 'test-ops-member', PLAIN = 'test-ops-plain';
const disconnected: string[] = [];
const io = { in: (room: string) => ({ disconnectSockets: () => { disconnected.push(room); } }), to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handle = (router: any, method: string, path: string) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const call = async (router: any, method: string, path: string, { body = {}, params = {}, query = {}, userId = ADMIN }: any = {}) => {
    let status = 200, out: any = undefined;
    const res = { status: (s: number) => { status = s; return res; }, json: (b: any) => { out = b; return res; } };
    await handle(router, method, path)({ app, body, params, query, user: { id: userId }, headers: {} }, res);
    return { status, out };
};
const auditCount = () => db.prepare(`SELECT COUNT(*) n FROM ops_audit WHERE admin_id = ?`).get(ADMIN).n;
const user = (id: string, set = '') => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(id, `g-${id}`, `${id}@test`, id);
    if (set) db.prepare(`UPDATE users SET ${set} WHERE id = ?`).run(id);
};

beforeAll(() => {
    user(ADMIN, `approved_at = datetime('now'), ops_allowed_at = datetime('now')`);
    user(M);
    user(PLAIN, `approved_at = datetime('now')`);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name) VALUES (?, 'd-ops-m', '딸 배차망 폰')`).run(M);
});
afterAll(() => {
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(ADMIN);
    db.prepare(`DELETE FROM notices WHERE posted_by = ?`).run(ADMIN);
    db.prepare(`DELETE FROM contents WHERE updated_by = ?`).run(ADMIN);
    db.prepare(`DELETE FROM user_devices WHERE user_id IN (?, ?, ?)`).run(ADMIN, M, PLAIN);
    for (const id of [ADMIN, M, PLAIN]) { db.prepare(`DELETE FROM users WHERE id = ?`).run(id); clearUserSession(id); }
});

describe('🏢 들어오는 문 — ops_allowed_at 하나', () => {
    const gate = (userId: string) => {
        let status = 0, passed = false;
        const res = { status: (s: number) => { status = s; return res; }, json: () => res };
        requireOps({ user: { id: userId, role: 'ADMIN' } }, res, () => { passed = true; });
        return { status, passed };
    };
    it('🔴 허락 없는 계정은 토큰 role 이 ADMIN 이어도 403 · 있는 계정은 통과', () => {
        expect(gate(PLAIN)).toEqual({ status: 403, passed: false });
        expect(gate(ADMIN)).toEqual({ status: 0, passed: true });
    });
    it('🔴 허락을 끄면 다음 요청부터 막힌다(토큰 그대로)', () => {
        db.prepare(`UPDATE users SET ops_allowed_at = NULL WHERE id = ?`).run(ADMIN);
        expect(gate(ADMIN).status).toBe(403);
        expect(opsAllowed(ADMIN)).toBe(false);
        db.prepare(`UPDATE users SET ops_allowed_at = datetime('now') WHERE id = ?`).run(ADMIN);
        expect(opsAllowed(ADMIN)).toBe(true);
    });
    it('🔴 소켓 관리자 방도 같은 칸 · requireAdmin(토큰 role)은 남아 있지 않다', () => {
        const sock = readFileSync(join(__dirname, '../../src/socket/socketHandlers.ts'), 'utf8');
        /* 관리자 방은 운영센터 소켓(/ops 이름공간)만 — 들어오는 판단은 같은 opsAllowed(socket/opsSocket opsGate) */
        expect(readFileSync(join(__dirname, '../../src/socket/opsSocket.ts'), 'utf8')).toMatch(/nsp\.use\(opsGate\)[\s\S]*function opsGate|function opsGate[\s\S]{0,200}opsAllowed\(/);
        expect(sock).not.toMatch(/role === "ADMIN"/);
        const src = ['middlewares/authMiddleware.ts', 'routes/stats.ts', 'routes/screenWords.ts'].map(f => readFileSync(join(__dirname, '../../src', f), 'utf8')).join('\n');
        expect(src).not.toMatch(/requireAdmin/);
        expect(readFileSync(join(__dirname, '../../src/index.ts'), 'utf8')).toMatch(/app\.use\("\/api\/ops", requireAuth, requireOps, opsRouter\)/);
    });
});

describe('🏢 회원 — 승인 · 정지 · 탈퇴 · 기록', () => {
    it('🔴 목록에 회원과 폰 · 상세를 열면 «회원 봄» 한 줄(3초 안 다시 열면 안 늘어남)', async () => {
        const list = await call(opsRouter, 'get', '/members');
        const m = list.out.find((x: any) => x.id === M);
        expect(m).toMatchObject({ approvedAt: null, opsAllowedAt: null, paidUntil: null });
        expect(m.phones.map((p: any) => p.deviceName)).toEqual(['딸 배차망 폰']);
        const before = auditCount();
        const d = await call(opsRouter, 'get', '/members/:id', { params: { id: M } });
        expect(d.out.member.id).toBe(M);
        expect(d.out.kakaoUsage).toBeNull();
        await call(opsRouter, 'get', '/members/:id', { params: { id: M } });
        expect(auditCount()).toBe(before + 1);
    });
    it('🔴 승인하면 그 회원 폰이 폰 문을 지난다 · 기록 한 줄', async () => {
        expect(authDevice('d-ops-m', undefined).ok).toBe(false);
        const before = auditCount();
        expect((await call(opsRouter, 'post', '/members/:id/approve', { params: { id: M } })).status).toBe(200);
        expect(authDevice('d-ops-m', undefined)).toMatchObject({ ok: true, userId: M });
        expect(auditCount()).toBe(before + 1);
    });
    it('🔴 «끝난 뒤» 정지는 소켓을 안 끊고 진행 중 콜이 있으면 폰이 지난다 · 풀기 · 즉시 정지는 403 + 소켓 끊기', async () => {
        disconnected.length = 0;
        getUserSession(M).myOrders.push({ id: 'o-ops-m', status: 'ORDER_CONFIRMED' } as any);
        await call(opsRouter, 'post', '/members/:id/suspend', { params: { id: M }, body: { afterActive: true } });
        expect(authDevice('d-ops-m', undefined).ok).toBe(true);
        expect(disconnected).toEqual([]);
        await call(opsRouter, 'post', '/members/:id/resume', { params: { id: M } });
        await call(opsRouter, 'post', '/members/:id/suspend', { params: { id: M }, body: { afterActive: false } });
        expect(authDevice('d-ops-m', undefined)).toEqual({ ok: false, status: 403, error: DEVICE_LINK_ERRORS.ACCOUNT_BLOCKED });
        expect(disconnected).toEqual([M]);
        await call(opsRouter, 'post', '/members/:id/resume', { params: { id: M } });
        expect(authDevice('d-ops-m', undefined).ok).toBe(true);
    });
    it('🔴 자기 자신 정지 · 탈퇴는 400', async () => {
        expect((await call(opsRouter, 'post', '/members/:id/suspend', { params: { id: ADMIN }, body: { afterActive: false } })).status).toBe(400);
        expect((await call(opsRouter, 'post', '/members/:id/withdraw', { params: { id: ADMIN } })).status).toBe(400);
    });
    it('🔴 탈퇴는 시각만 적고 소켓을 끊는다 · 기록 한 줄', async () => {
        disconnected.length = 0;
        const before = auditCount();
        await call(opsRouter, 'post', '/members/:id/withdraw', { params: { id: M } });
        expect(db.prepare(`SELECT withdrawn_at FROM users WHERE id = ?`).get(M).withdrawn_at).not.toBeNull();
        expect(disconnected).toEqual([M]);
        expect(auditCount()).toBe(before + 1);
    });
});

describe('🏢 회원 상세의 동의 기록 · 새 글자 종류', () => {
    it('🔴 상세에 동의 기록 — 글 동의는 종류 · 판, 글 없는 고지는 kind ack · item 키 · 0판 · 시각은 ISO', async () => {
        db.prepare(`INSERT INTO agreements (user_id, kind, version, item, agreed_at) VALUES (?, 'terms', 3, 'terms', '1970-01-02 09:00:00'), (?, 'ack', 0, 'networkRisk', '1970-01-02 09:00:00')`).run(PLAIN, PLAIN);
        const d = await call(opsRouter, 'get', '/members/:id', { params: { id: PLAIN } });
        expect(d.out.agreements).toEqual([
            { kind: 'terms', item: 'terms', version: 3, at: '1970-01-02T09:00:00+09:00' },
            { kind: 'ack', item: 'networkRisk', version: 0, at: '1970-01-02T09:00:00+09:00' },
        ]);
        db.prepare(`DELETE FROM agreements WHERE user_id = ?`).run(PLAIN);
    });
    it('🔴 새 글자 종류는 shared WordKind 키 그대로 — 이름표는 화면이 WORD_KIND_LABEL 로', async () => {
        db.prepare(`INSERT OR REPLACE INTO screen_words (target_app, page, word, kind, first_seen, last_seen, seen_count) VALUES ('insung', '목록', '검사글자', 'noise', '1970-01-02 09:00:00', '9999-12-31 00:00:00', 1)`).run();
        const an = await call(opsRouter, 'get', '/anomalies');
        expect(an.out.screenWords.find((w: any) => w.word === '검사글자')?.kind).toBe('noise');
        db.prepare(`DELETE FROM screen_words WHERE word = '검사글자'`).run();
    });
});

describe('🏢 글 · 공지 · 기록 · 숫자', () => {
    it('🔴 글 저장은 판 +1 · 기록 한 줄 · 목록은 여섯 종류(없는 것은 0판)', async () => {
        const before = auditCount();
        const a = await call(opsRouter, 'put', '/contents/:kind', { params: { kind: 'privacy' }, body: { title: '개인정보', body: '첫' } });
        const b = await call(opsRouter, 'put', '/contents/:kind', { params: { kind: 'privacy' }, body: { title: '개인정보', body: '둘' } });
        expect(b.out.version).toBe(a.out.version + 1);
        expect(auditCount()).toBe(before + 2);
        const all = await call(opsRouter, 'get', '/contents');
        expect(all.out.map((c: any) => c.kind)).toEqual(['terms', 'privacy', 'location', 'joinGuide', 'installGuide', 'withdrawGuide']);
        expect((await call(opsRouter, 'put', '/contents/:kind', { params: { kind: 'nope' }, body: { title: '', body: '' } })).status).toBe(404);
    });
    it('🔴 공지 올림 · 내림 — 내린 줄은 남고 기사용 «지금 공지»에서 빠진다 · 기록 두 줄', async () => {
        const before = auditCount();
        const posted = await call(opsRouter, 'post', '/notices', { body: { text: '점검 안내', activeUntil: null } });
        expect((await call(noticesRouter, 'get', '/active', { userId: PLAIN })).out.map((n: any) => n.id)).toContain(posted.out.id);
        const ended = await call(opsRouter, 'post', '/notices/:id/end', { params: { id: String(posted.out.id) } });
        expect(ended.out.endedAt).not.toBeNull();
        expect((await call(noticesRouter, 'get', '/active', { userId: PLAIN })).out.map((n: any) => n.id)).not.toContain(posted.out.id);
        expect((await call(opsRouter, 'get', '/notices')).out.map((n: any) => n.id)).toContain(posted.out.id);
        expect(auditCount()).toBe(before + 2);
    });
    it('🔴 기록은 관리자 이름과 함께 · 숫자는 승인 대기 · 끊긴 폰', async () => {
        const audit = await call(opsRouter, 'get', '/audit', { query: {} });
        expect(audit.out[0]).toMatchObject({ admin: ADMIN });
        const counts = await call(opsRouter, 'get', '/counts');
        expect(counts.out).toEqual(expect.objectContaining({ pendingMembers: expect.any(Number), callsTodo: expect.any(Number), phonesOffline: expect.any(Number) }));
        const an = await call(opsRouter, 'get', '/anomalies');
        expect(an.out).toEqual(expect.objectContaining({ anomalies: expect.any(Array), screenWords: expect.any(Array) }));
        const phones = await call(opsRouter, 'get', '/phones');
        expect(phones.out.some((p: any) => p.deviceId === 'd-ops-m')).toBe(true);
    });
});
