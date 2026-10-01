// @ts-nocheck
import db from '../../src/db';
import joinRouter from '../../src/routes/join';
import contentsRouter from '../../src/routes/contents';
import noticesRouter from '../../src/routes/notices';
import opsRouter from '../../src/routes/ops';
import { clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🕐 **새 문(가입 · 글 · 공지 · 운영센터)의 응답 시각은 모두 ISO** (onedal-1f · 공통 함수 4 앞부분).
 * 저장 글자(SQLite 지역 시각 «YYYY-MM-DD HH:MM:SS»)는 그대로 두고 응답을 만드는 자리에서 shared isoKst 를 거친다 — Safari 는 지역 글자를 못 읽는다.
 * 🔴 검사가 시각 칸 이름 목록을 들고 있다 — 응답에 «…At» 칸이 새로 생겼는데 목록에 없으면 빨간불(그 칸이 isoKst 를 거치는지 사람이 한 번 본다).
 */
const TIME_KEYS = ['approvedAt', 'suspendedAt', 'withdrawnAt', 'createdAt', 'opsAllowedAt', 'updatedAt', 'postedAt', 'endedAt', 'at', 'capturedAt', 'lastSeenAt', 'firstSeenAt',
    /* 6단계 칸 — 지금은 늘 null · 채울 때 isoKst 를 거쳐야 아래 ISO 검사를 지난다 */ 'autoAllowedAt', 'statsAllowedAt'];
/** 날 키(YYYY-MM-DD)인 칸 — 시각이 아니다 */
const DAY_KEYS = ['paidUntil', 'autoUntil', 'statsUntil', 'activeUntil'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const A = 'test-iso-admin';
const io = { in: () => ({ disconnectSockets: () => {} }), to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const call = async (router: any, method: string, path: string, { params = {}, body = {}, query = {} }: any = {}) => {
    const layer = router.stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
    let out: any;
    const res = { status: () => res, json: (b: any) => { out = b; return res; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ app, params, body, query, user: { id: A }, headers: {} }, res);
    return out;
};
/** 응답 속 «…At» · «at» 칸을 모두 모은다 */
const timeFields = (v: any, out: [string, unknown][] = []): [string, unknown][] => {
    if (Array.isArray(v)) v.forEach(x => timeFields(x, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
        if ((/At$/.test(k) || k === 'at') && !DAY_KEYS.includes(k)) out.push([k, x]);
        timeFields(x, out);
    }
    return out;
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(A, `g-${A}`, `${A}@test`, A);
    db.prepare(`UPDATE users SET approved_at = datetime('now', 'localtime'), ops_allowed_at = datetime('now', 'localtime') WHERE id = ?`).run(A);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id, device_name) VALUES (?, 'd-iso', '폰')`).run(A);
});
afterAll(() => {
    db.prepare(`DELETE FROM ops_audit WHERE admin_id = ?`).run(A);
    db.prepare(`DELETE FROM notices WHERE posted_by = ?`).run(A);
    db.prepare(`DELETE FROM contents WHERE updated_by = ?`).run(A);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(A);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(A);
    clearUserSession(A);
});

describe('🕐 응답 시각 ISO', () => {
    it('🔴 가입 · 글 · 공지 · 운영센터 응답의 시각 칸은 모두 ISO 이고, 이름이 목록에 있다', async () => {
        const notice = await call(opsRouter, 'post', '/notices', { body: { text: '시각 검사', activeUntil: null } });
        await call(opsRouter, 'post', '/notices/:id/end', { params: { id: String(notice.id) } });
        await call(opsRouter, 'put', '/contents/:kind', { params: { kind: 'terms' }, body: { title: '약관', body: '본문' } });
        const replies = [
            await call(joinRouter, 'get', '/me'),
            await call(contentsRouter, 'get', '/:kind', { params: { kind: 'terms' } }),
            await call(noticesRouter, 'get', '/active'),
            await call(opsRouter, 'get', '/members'),
            await call(opsRouter, 'get', '/members/:id', { params: { id: A } }),
            await call(opsRouter, 'get', '/notices'),
            await call(opsRouter, 'get', '/contents'),
            await call(opsRouter, 'get', '/audit', { query: {} }),
            await call(opsRouter, 'get', '/anomalies'),
            await call(opsRouter, 'get', '/phones'),
        ];
        const fields = timeFields(replies);
        expect(fields.length).toBeGreaterThan(10);
        const unknown = [...new Set(fields.map(([k]) => k))].filter(k => !TIME_KEYS.includes(k));
        expect(unknown).toEqual([]);
        const notIso = fields.filter(([, v]) => v != null && v !== '' && !ISO.test(String(v)));
        expect(notIso).toEqual([]);
    });
});
