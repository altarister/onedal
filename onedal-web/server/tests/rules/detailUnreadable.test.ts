// @ts-nocheck
import db from '../../src/db';
import telemetryRouter, { unreadableReasonOf } from '../../src/routes/telemetry';
import { touchDeviceSession } from '../../src/routes/devices';

/**
 * ⚪ **손으로 연 상세를 앱이 못 읽으면 평가 자리에 «판정 못 함» 한 줄** (기사님 «가» · onedal-1f).
 * 앱은 상세에서 요건이 모자라면 이상 징후(REQUIREMENT_UNMET)만 보내고 콜을 버렸다 — 기사님은 판정이 늦는지 안 오는지 몰랐다.
 * 가르는 것은 개별 사실 둘: 그 보고가 **상세 화면에서 왔나** · **요건 미달인가**. 목록 스캔의 요건 미달은 안 띄운다(노이즈).
 * 지우는 때는 **상세에서 나갈 때**(상세 → 상세 아닌 화면) — 들어올 때 지우면 먼저 닿은 보고를 곧바로 지운다(화면 바뀜과 보고는 다른 길이라 순서가 없다).
 */
const U = 'test-detail-unreadable';
const DEV = 'dev-unreadable-1';
const emitted: Array<[string, any]> = [];
const io = { to: () => ({ emit: (ev: string, body?: any) => { emitted.push([ev, body]); } }) };
const handler = (() => {
    const layer = telemetryRouter.stack.find((l: any) => l.route?.path === '/anomalies' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
})();
const report = (screenName: string, failureReason: string) => {
    const res = { status: () => res, json: () => res };
    handler({ app: { get: (k: string) => (k === 'io' ? io : undefined) },
        body: { deviceId: DEV, targetApp: 'kakaopicker', screenName, failureReason,
            listOrderInfo: { fare: 0, pickup: '경기 광주시 광남2동 동대문엽기떡볶이', dropoff: null } } }, res);
};
const unreadables = () => emitted.filter(([ev]) => ev === 'detail-unreadable');
const clears = () => emitted.filter(([ev]) => ev === 'detail-unreadable-clear');

beforeAll(() => {
    db.prepare(`INSERT OR IGNORE INTO users (id, google_id, email, name) VALUES (?, ?, ?, ?)`).run(U, `g-${U}`, 'unreadable@test', '판정못함검사');
    db.prepare(`INSERT OR IGNORE INTO user_devices (user_id, device_id) VALUES (?, ?)`).run(U, DEV);
});
beforeEach(() => { emitted.length = 0; });
afterAll(() => {
    db.prepare(`DELETE FROM telemetry_anomalies WHERE device_id = ?`).run(DEV);
    db.prepare(`DELETE FROM user_devices WHERE user_id = ?`).run(U);
    db.prepare(`DELETE FROM users WHERE id = ?`).run(U);
});

describe('⚪ 까닭 글 — 기사님 말로', () => {
    it('🔴 요금 · 주소 · 둘 다 · 그 밖', () => {
        expect(unreadableReasonOf('REQUIREMENT_UNMET: 요금 없음')).toBe('요금을 못 읽음');
        expect(unreadableReasonOf('REQUIREMENT_UNMET: 상차 주소 짧음(경기 성남시 중원구 10/07(4) )')).toBe('주소를 못 읽음');
        expect(unreadableReasonOf('REQUIREMENT_UNMET: 요금 없음 · 하차 주소 짧음(…)')).toBe('요금·주소를 못 읽음');
        expect(unreadableReasonOf('REQUIREMENT_UNMET: 차종 없음')).toBe('상세를 못 읽음');
        expect(unreadableReasonOf('SNAPSHOT_MISMATCH: …')).toBeNull();
    });
});

describe('⚪ 소켓 푸시', () => {
    it('🔴 상세 화면에서 온 요건 미달 → 평가 자리로 한 번 (코드 글자는 안 싣는다)', () => {
        report('DETAIL_PRE_CONFIRM', 'REQUIREMENT_UNMET: 요금 없음');
        expect(unreadables()).toHaveLength(1);
        expect(unreadables()[0][1]).toMatchObject({ reason: '요금을 못 읽음', pickup: '경기 광주시 광남2동 동대문엽기떡볶이' });
        expect(JSON.stringify(unreadables()[0][1])).not.toContain('REQUIREMENT_UNMET');
    });
    it('🔴 목록 화면의 요건 미달 · 요건 미달이 아닌 보고는 안 띄운다', () => {
        report('LIST', 'REQUIREMENT_UNMET: 요금 없음');
        report('DETAIL_PRE_CONFIRM', 'SNAPSHOT_MISMATCH: 다른 콜');
        expect(unreadables()).toHaveLength(0);
    });
    it('🔴 보고는 상세에서 왔어도 폰이 이미 목록이면 안 띄운다 — 늦게 닿은 보고가 목록 위에 ⚪ 를 남기지 않게', () => {
        touchDeviceSession(DEV, U, 1, 'LIST', io);
        emitted.length = 0;
        report('DETAIL_PRE_CONFIRM', 'REQUIREMENT_UNMET: 요금 없음');
        expect(unreadables()).toHaveLength(0);
        touchDeviceSession(DEV, U, 1, 'DETAIL_PRE_CONFIRM', io);
        report('DETAIL_PRE_CONFIRM', 'REQUIREMENT_UNMET: 요금 없음');
        expect(unreadables()).toHaveLength(1);
    });
});

describe('⚪ 지우는 때 — 상세에서 나갈 때', () => {
    it('🔴 상세 → 목록 화면 바뀜에 지움 · 목록 → 상세에는 없음', () => {
        touchDeviceSession(DEV, U, 1, 'LIST', io);
        emitted.length = 0;
        touchDeviceSession(DEV, U, 1, 'DETAIL_PRE_CONFIRM', io);
        expect(clears()).toHaveLength(0);
        touchDeviceSession(DEV, U, 1, 'LIST', io);
        expect(clears()).toHaveLength(1);
    });
});
