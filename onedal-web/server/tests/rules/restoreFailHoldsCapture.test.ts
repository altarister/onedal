// @ts-nocheck
import db from '../../src/db';
import { bootstrapUserSession, restoreAndRecalculateSession } from '../../src/state/sessionRestore';
import { appFilterOf } from '../../src/state/appFilter';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';

/**
 * 🔒 **하루 복구가 실패한 날은 콜 잡기를 멈춘다** (기사님 Q14 «가»).
 *
 * 복구가 던졌는데 «복구됨»이 켜지면 잡은 콜이 빈 채로 원달앱이 잡기를 다시 연다 — 첫짐처럼 판정되고 합짐이 어긋난다.
 * 실패면 «복구됨»을 끈 채 두고, 관제웹에는 filter-init 으로 «복구 실패»를 알린다. 다음 접속 · 상세 진입이 다시 시도한다.
 */
const U = 'test-restore-fail';
const sent: { ev: string; p: any }[] = [];
const io = { to: () => ({ emit: (ev: string, p: any) => { sent.push({ ev, p }); } }) };

const failingDb = () => {
    const real = db.prepare.bind(db);
    return jest.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (/FROM orders/i.test(sql)) throw new Error('장부 읽기 실패');
        return real(sql);
    });
};

beforeEach(() => { sent.length = 0; clearUserSession(U); });
afterEach(() => jest.restoreAllMocks());

describe('🔒 복구 실패 = 콜 잡기 멈춤', () => {
    it('🔴 몸통이 던지면 «복구됨»이 꺼진 채 남고 원달앱 필터는 잡기를 멈춘다', async () => {
        failingDb();
        await restoreAndRecalculateSession(U, null);
        const session = getUserSession(U);
        expect(session.isRestored).toBe(false);
        expect(session.restoreFailedAt).not.toBeNull();
        const { filter, holds } = appFilterOf(session, U, null, null);
        expect(holds.notRestored).toBe(true);
        expect(filter.isActive).toBe(false);
    });

    it('🔴 부팅이 끝나면 filter-init 은 가고 «복구 실패»를 싣는다', async () => {
        failingDb();
        await bootstrapUserSession(U, io);
        const init = sent.find(s => s.ev === 'filter-init');
        expect(init).toBeDefined();
        expect(init.p.restoreFailed).toBe(true);
    });

    it('🔴 다음 시도가 성공하면 «복구됨»이 켜지고 «복구 실패»가 지워진다', async () => {
        const spy = failingDb();
        await bootstrapUserSession(U, io);
        spy.mockRestore();
        sent.length = 0;
        await bootstrapUserSession(U, io);
        const session = getUserSession(U);
        expect(session.isRestored).toBe(true);
        expect(session.restoreFailedAt).toBeNull();
        expect(sent.find(s => s.ev === 'filter-init').p.restoreFailed).toBe(false);
    });
});
