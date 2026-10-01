// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import * as dispatchEngine from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 📝 **상세 보고의 원문이 비면 앞서 받은 원문을 덮지 않는다** (reviews/34 발견 A · 기사님 «가» · onedal-69 «가»).
 *    원달앱은 상세 보고에 모아 둔 상세 글(accumulatedDetailText)을 싣는데, 화물24시 · 사진 없이 가는 픽커는 그 글이 빈 채로 온다.
 *    빈 글이 /confirm 이 남긴 화면 글을 덮으면 판정의 제외어 검사가 적요 · 유의사항을 못 본다 → 제외어가 든 콜이 통과(노이즈).
 *    비지 않은 원문(인성 팝업 모은 글)은 지금처럼 앞 글을 덮는다.
 */
const U = 'test-detail-raw';
const DEV = 'dev-detail-raw';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const report = async (id: string, rawText: string, targetApp = 'hwamul24') => {
    let seen: string | undefined;
    const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async (_u: string, order: any) => { seen = order.rawText; });
    const res = { status: () => res, json: () => res };
    await handlerOf(detailRouter)({ app, headers: {}, body: {
        step: 'DETAILED', deviceId: DEV, targetApp,
        order: { id, pickup: '경기 군포시 부곡동', dropoff: '서울 중구 을지로6가', fare: 60000, rawText },
    } }, res);
    spy.mockRestore();
    return seen;
};
const remember = (id: string, rawText: string) => {
    const s = getUserSession(U);
    s.isRestored = true;
    s.pendingOrdersData.set(id, { id, pickup: '경기 군포시 부곡동', dropoff: '서울 중구 을지로6가', fare: 60000, rawText });
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'raw@test', '원문검사');
    approvedUser(U);
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
beforeEach(() => clearUserSession(U));
afterAll(() => {
    db.prepare(`DELETE FROM orders WHERE userId = ?`).run(U);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
    clearUserSession(U);
});

describe('📝 상세 보고의 빈 원문', () => {
    it('🔴 빈 원문 보고 뒤에도 앞서 받은 화면 글(적요의 제외어)이 판정에 간다', async () => {
        remember(`${U}-1`, '화물상세정보 운송료 60,000 적요 착불 · 수작업');
        expect(await report(`${U}-1`, '')).toContain('착불');
    });
    it('비지 않은 원문은 지금처럼 앞 글을 덮는다', async () => {
        remember(`${U}-2`, '목록 글');
        expect(await report(`${U}-2`, '상태 : 신규\n요금 : 50,000(카드)', 'insung')).toBe('상태 : 신규\n요금 : 50,000(카드)');
    });
});
