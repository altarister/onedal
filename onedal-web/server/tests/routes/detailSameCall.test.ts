// @ts-nocheck
import db from '../../src/db';
import detailRouter from '../../src/routes/detail';
import * as dispatchEngine from '../../src/services/dispatchEngine';
import { getUserSession, clearUserSession } from '../../src/state/userSessionStore';
import { approvedUser } from '../fixtures/approvedUser';

/**
 * 🔎 **상세 보고가 이미 잡은 콜의 재열람인가, 새 콜인가** — `routes/detail.ts` 의 같은 콜 찾기를 실제 라우트로 지킨다.
 *    다른 콜을 한 콜로 묶으면 새 콜이 안 만들어지고, 같은 콜을 놓치면 잡은 콜이 다시 판정에 오른다.
 *    끝난 콜에 묶이면 취소했다가 다시 잡는 흐름이 막힌다.
 *
 * 🔴 전화 · 팝업 주소는 원달앱이 안 싣는다. 서버가 상세 원문에서 읽으므로 시험도 원문으로 넣는다 — body 에 직접 넣으면 덮인다.
 * 🔴 앱이 잡은 길(AUTO)만 탄다. 손으로 연 길의 답 모양과 재시작 뒤 되살린 콜의 전화 · 주소는 안 지킨다.
 * 🔴 사례 표는 지금 동작을 적은 것이다. 요금 0 이 새 콜인 것이 맞는지는 따로 볼 일이다.
 */
const U = 'test-detail-same-call';
const DEV = 'dev-detail-same-call';
const io = { to: () => ({ emit: () => {} }) };
const app = { get: (k: string) => (k === 'io' ? io : undefined) };
const handlerOf = (router: any) => {
    const layer = router.stack.find((l: any) => l.route?.path === '/' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
};
const PICKUP = '경기 광주시 경안동 1-2';
const DROPOFF = '서울 용산구 한남동 12';
const FARE = 50000;
const KEPT = `${U}-kept`;
const NEW = `${U}-new`;

/** 인성 팝업 셋을 모은 상세 원문 꼴 — 전화 · 위치가 없으면 그 줄을 안 쓴다 */
const detailText = (phone?: string, address?: string) => [
    '[출발지상세]', '고객 가나상사',
    ...(address ? [`위치: ${address}`] : []),
    ...(phone ? [`전화1 ${phone}`] : []),
    '[도착지상세]', '고객 다라상회',
].join('\n');

const keep = (o: Record<string, unknown> = {}) => {
    const session = getUserSession(U);
    session.isRestored = true;
    session.myOrders.push({
        id: KEPT, type: 'AUTO_CLICK', status: 'ORDER_CONFIRMED', pickup: PICKUP, dropoff: DROPOFF, fare: FARE,
        timestamp: new Date().toISOString(),
        pickupDetails: [{ phone1: '010-1111-1111', addressDetail: '팝업 주소 A' }],
        ...o,
    });
};
/** 상세 보고를 한 번 태우고 서버 답을 돌려준다 */
const report = async (order: Record<string, unknown>) => {
    const spy = jest.spyOn(dispatchEngine, 'evaluateNewOrder').mockImplementation(async () => {});
    let code = 200;
    let answer: any;
    const res = { status: (c: number) => { code = c; return res; }, json: (body: any) => { answer = { code, ...body }; return res; } };
    await handlerOf(detailRouter)({ app, headers: {}, body: {
        step: 'DETAILED', deviceId: DEV, targetApp: 'insung', matchType: 'AUTO',
        order: { id: NEW, type: 'AUTO_CLICK', pickup: PICKUP, dropoff: DROPOFF, fare: FARE, timestamp: new Date().toISOString(), ...order },
    } }, res);
    spy.mockRestore();
    return answer;
};
const expectKept = (answer: any) => expect(answer).toMatchObject({ action: 'ACK', orderId: KEPT });
const expectNewCall = (answer: any) => {
    expect(answer?.code).toBe(202);   // 🔴 도중에 터져 500 이 나도 콜은 이미 기억에 있다 — 답의 코드까지 본다
    expect(answer?.orderId).toBeUndefined();
    expect(getUserSession(U).pendingOrdersData.has(NEW)).toBe(true);
};

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'same-call@test', '같은 콜');
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

describe('🔎 이미 잡은 콜로 돌려주는 경우', () => {
    it('콜 번호가 같으면 나머지가 달라도 잡은 콜이다', async () => {
        keep();
        expectKept(await report({ id: KEPT, fare: 99000, rawText: detailText('010-2222-2222', '팝업 주소 B') }));
    });
    it('번호가 달라도 전화 · 상차 · 하차 · 요금이 같으면 잡은 콜이다 (팝업 주소는 달라도)', async () => {
        keep();
        expectKept(await report({ rawText: detailText('010-1111-1111', '팝업 주소 B') }));
    });
    it('번호가 달라도 팝업 주소 · 상차 · 하차 · 요금이 같으면 잡은 콜이다 (전화는 달라도)', async () => {
        keep();
        expectKept(await report({ rawText: detailText('010-2222-2222', '팝업 주소 A') }));
    });
});

describe('🔎 새 콜인 경우', () => {
    it('전화가 다르고 팝업 주소가 없으면 상차 · 하차 · 요금이 같아도 새 콜이다', async () => {
        keep({ pickupDetails: [{ phone1: '010-1111-1111' }] });
        expectNewCall(await report({ rawText: detailText('010-2222-2222') }));
    });
    it('전화가 둘 다 없고 팝업 주소도 없으면 새 콜이다 — 빈 전화끼리 같다고 보지 않는다', async () => {
        keep({ pickupDetails: [{}] });
        expectNewCall(await report({ rawText: detailText() }));
    });
    it('전화가 같아도 상차 전체 주소가 다르면 새 콜이다 — 같은 동의 다른 콜을 묶지 않는다', async () => {
        keep();
        expectNewCall(await report({ pickup: '경기 광주시 경안동 9-9', rawText: detailText('010-1111-1111', '팝업 주소 A') }));
    });
    it('전화가 같아도 하차 전체 주소가 다르면 새 콜이다', async () => {
        keep();
        expectNewCall(await report({ dropoff: '서울 용산구 한남동 99', rawText: detailText('010-1111-1111', '팝업 주소 A') }));
    });
    it('전화 · 주소가 같아도 요금이 다르면 새 콜이다', async () => {
        keep();
        expectNewCall(await report({ fare: 60000, rawText: detailText('010-1111-1111', '팝업 주소 A') }));
    });
    it('잡은 콜의 요금이 0 이면 나머지가 같아도 새 콜이다', async () => {
        keep({ fare: 0 });
        expectNewCall(await report({ fare: 0, rawText: detailText('010-1111-1111', '팝업 주소 A') }));
    });
});

describe('🔎 끝난 콜', () => {
    it('이미 취소된 콜과 내용이 같아도 번호가 다르면 새 콜이다 — 취소했다가 다시 잡을 수 있다', async () => {
        keep({ status: 'SAFE_CANCEL' });
        expectNewCall(await report({ rawText: detailText('010-1111-1111', '팝업 주소 A') }));
    });
    it('이미 취소된 콜과 번호가 같으면 되살리지 않고 취소로 답한다', async () => {
        keep({ status: 'SAFE_CANCEL' });
        expect(await report({ id: KEPT, rawText: detailText('010-1111-1111', '팝업 주소 A') })).toMatchObject({ action: 'CANCEL' });
    });
});
