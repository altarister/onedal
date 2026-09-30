// @ts-nocheck
import db from '../../src/db';
import { touchDeviceSession } from '../../src/routes/devices';

/**
 * 🔔 **새로 알람감이 된 통과 콜이 있을 때만 알람** (기사님 «뜬금없이 소리만 나고 아무 액션이 없어» · onedal-1f «가»).
 * 같은 통과 콜이 목록에 남아 있거나 픽커가 요금만 올려도 성적표 passed 가 다시 차, 15~45초마다 알람(삑)이 났다.
 * 앱이 «이번에 처음 알람감이 된 통과 콜 수»(passedNew)를 싣고, 서버는 그것으로 가른다. 없으면(옛 앱) 지금처럼 passed.
 */
const U = 'test-alarm-new-pass';
const DEV = 'dev-alarm-new-pass-1';
const alarmsOf = () => {
    const sent: any[] = [];
    const io = { to: () => ({ emit: (ev: string, p: any) => { if (ev === 'filter-pass-alarm') sent.push(p); } }) };
    return { io, sent };
};
const report = (tally: any) => {
    const { io, sent } = alarmsOf();
    touchDeviceSession(DEV, U, 0, 'LIST', io, false, undefined, undefined, undefined, true, tally, 'kakaopicker', { effectiveMode: 'ALARM' });
    return sent;
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'alarmnew@test', '새통과알람검사');
});
afterAll(() => { db.prepare(`DELETE FROM users WHERE id = ?`).run(U); });

describe('🔔 새로 통과한 콜만 알람', () => {
    it('🔴 통과 3건이지만 새로 알람감이 된 콜 0 → 알람 없음', () => {
        expect(report({ seen: 4, passed: 3, passedNew: 0 })).toHaveLength(0);
    });
    it('🔴 새로 1건 → 알람 · 새로 된 수(passedNew)와 목록에 보이는 통과 수(passed)를 따로 싣는다', () => {
        const sent = report({ seen: 4, passed: 3, passedNew: 1 });
        expect(sent).toHaveLength(1);
        expect(sent[0]).toMatchObject({ passed: 3, passedNew: 1 });
    });
    it('옛 앱(passedNew 없음)은 지금처럼 passed', () => {
        expect(report({ seen: 4, passed: 2 })).toHaveLength(1);
        expect(report({ seen: 4, passed: 0 })).toHaveLength(0);
    });
});
